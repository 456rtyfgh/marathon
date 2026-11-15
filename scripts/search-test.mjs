// 검색 사전·정확도 검사 (파트 B): 결과 0개였던 검색어, 상위 검색어, 과확장·오검색 방지, 자판 변환, 반복 글자.
//   node scripts/search-test.mjs
//   SEARCH_TEST_TODAY=2026-12-01 node scripts/search-test.mjs   (날짜를 바꾸면 그 날 이후 대회만 색인 — 날짜에 묶인 기대는 깨질 수 있다)
// '지금 data.json 기준 정확한 기대' 를 적는다. 데이터가 바뀌어 깨지면 표를 고친다 (느슨하게 풀지 않는다).
import { readFileSync } from 'node:fs';
import { buildIndex, keyboardFixes, searchRaces, searchWithFixes, suggestRaces } from '../src/lib/search.ts';
import { aliasSiblings } from '../src/lib/aliases.ts';
import { splitData } from './data-split.mjs';

const TODAY = process.env.SEARCH_TEST_TODAY || '2026-11-15';
const data = splitData(JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'))).list;
const races = data.races.filter((r) => r.race_date >= TODAY);
const index = buildIndex(races);
const byId = new Map(races.map((r) => [r.id, r]));
const idsOf = (set) => [...set].map((r) => r.id);
const regionOf = (r) => (r.country_code === 'KR' ? (r.city_ko ?? '').split(' ')[0].split('·') : []);
const inRegions = (list) => (r) => regionOf(r).some((x) => list.includes(x));

// 행: q = 검색어, 나머지는 기대.
//   ids   결과에 모두 있어야 하는 대회 id        only  결과가 정확히 이 id 들        not   하나도 없어야 하는 id
//   min/max  결과 수 범위                        zero  결과 0개 (제안도 확인)          same  다른 검색어와 같은 결과
//   fixed 자판 변환 사용: 문자열이면 그 검색어로 변환, null 이면 변환 안 씀
//   every 결과 전부가 만족해야 하는 조건 [설명, 함수]
const ROWS = [
  // ── 필터를 꺼도 0개였던 20개 ──
  { q: '부피아', zero: true },
  { q: '호롤', ids: ['honolulu'], not: ['nyc', 'tokyo'], every: ['모두 호놀룰루', (r) => (r.city_ko ?? '').includes('호놀룰루')] },
  { q: '전라남도', min: 40, every: ['국내 전남·광주', inRegions(['전남', '광주'])], not: ['seoul-marathon'] },
  { q: '경상도', min: 100, every: ['국내 경북·경남·대구·부산·울산', inRegions(['경북', '경남', '대구', '부산', '울산'])], not: ['seoul-marathon'] },
  { q: '한강짐런', zero: true },
  { q: '뉴요', ids: ['nyc'], not: ['tokyo', 'honolulu'] },
  { q: '파나코니아', only: ['bariloche-utmb-trail', 'patagonia-jeju-trail', 'patagonia-run-trail'] },
  { q: '나눔레이스 서울', zero: true },
  { q: '경기국제', only: ['suwon-intl-half'] },
  { q: '대련', only: ['dalian'] },
  { q: '경주 동아 마라톤', only: ['gyeongju-intl'] },
  { q: '세계6대', only: ['tokyo', 'boston', 'london', 'berlin', 'chicago', 'nyc', 'sydney', 'capetown'], not: ['seoul-marathon', 'chuncheon', 'jtbc-seoul'] },
  { q: '새해 동계', zero: true },
  { q: 'newbq', zero: true, fixed: null },
  { q: '교다', zero: true },
  { q: 'rhvm', ids: ['asics-goprun'], fixed: '고프' },
  { q: '경주 동아', only: ['gyeongju-intl'] },
  { q: '국제동계', zero: true },
  { q: '잔시문', zero: true },
  { q: '경주경주', same: '경주', min: 10 },

  // ── 지역어 ──
  { q: '전라도', min: 80, every: ['국내 전남·전북·광주', inRegions(['전남', '전북', '광주'])] },
  { q: '전라북도', min: 20, every: ['국내 전북', inRegions(['전북'])] },
  { q: '충청도', min: 80, every: ['국내 충남·충북·대전·세종', inRegions(['충남', '충북', '대전', '세종'])] },
  { q: '충청남도', min: 40, every: ['국내 충남·대전·세종', inRegions(['충남', '대전', '세종'])] },
  { q: '충청북도', min: 15, every: ['국내 충북', inRegions(['충북'])] },
  { q: '강원도', min: 40, every: ['국내 강원', inRegions(['강원'])] },
  { q: '경기도', min: 90, every: ['국내 경기', inRegions(['경기'])] },
  { q: '제주도', min: 15, every: ['국내 제주', inRegions(['제주'])] },
  { q: '경상북도', min: 40, every: ['국내 경북·대구', inRegions(['경북', '대구'])] },
  { q: '경상남도', min: 40, every: ['국내 경남·부산·울산', inRegions(['경남', '부산', '울산'])] },
  { q: '경상도 트레일', min: 5, every: ['경상권 + 트레일', (r) => inRegions(['경북', '경남', '대구', '부산', '울산'])(r)], not: ['seoul-marathon'] },
  { q: '경기도마라톤', min: 20, every: ['국내 경기', inRegions(['경기'])] },

  // ── 오타·부분·별칭이 엉뚱한 대회에 안 걸리는지 ──
  { q: '하낭', same: '하남', min: 15 },
  { q: '치앙마에', only: ['chiangmai', 'chiangmai-utmb-trail'] },
  { q: '샌프란시스커', only: ['bay-to-breakers', 'sf-marathon'] },
  { q: '서울동아', only: ['seoul-marathon'] },
  { q: '경주동아', only: ['gyeongju-intl'] },
  { q: '월드메이저', same: '세계6대' },
  { q: '6대메이저', same: '세계6대' },
  { q: '뉴욕', ids: ['nyc'], not: ['tokyo'] },
  { q: '호놀룰루', ids: ['honolulu'] },
  // 한글 두 글자 지명은 오타 단계로 다른 곳에 걸리지 않는다 (진천↔인천, 통영↔'마라톤영종', 완도↔'…와도…')
  { q: '진천', zero: true },
  { q: '통영', zero: true },
  { q: '완도', zero: true },

  // ── 상위 검색어 (결과가 있어야 함. 최소 개수는 TODAY 기준 실측) ──
  { q: '서울', min: 200 },
  { q: '경주', min: 11 },
  { q: '대구', min: 14 },
  { q: '인천', min: 28 },
  { q: '도쿄', min: 25, ids: ['tokyo'] },
  { q: '부산', min: 33 },
  { q: '시카고', min: 2, ids: ['chicago'] },
  { q: '보스턴', min: 3, ids: ['boston'] },
  { q: 'tokyo', min: 5, fixed: null },
  { q: 'boston', ids: ['boston'], fixed: null },
  { q: 'nyc', ids: ['nyc'], fixed: null },

  // ── 접두어 과확장 방지: 글자 그대로 맞는 대회가 있으면 '쓰는 중인 글자' 로 더 넓히지 않는다 ──
  { q: '하남', max: 21, not: ['ibusuki', 'hanamaki-ihatov-half'] },
  { q: '런', not: ['running-sakurajima'] },
  { q: '고양', max: 8 }, // 나고야(고양 + 쓰는 중 글자) 까지 퍼지지 않는다
  // 쓰는 중인 글자는 글자 그대로 맞는 게 없을 때 그대로 동작
  { q: '마랕', min: 100 },
  { q: '고구려마라', ids: ['goguryeo-seoul'] },
  { q: '치토세ㅣ', min: 1 },

  // ── 반복 글자·중복 낱말 ──
  { q: '서울 서울', same: '서울' },
  { q: '서울서울', same: '서울' },
  { q: '서울울울', same: '서울' },
  { q: '도쿄 도쿄 도쿄', same: '도쿄' },
  { q: 'ㅋㅋㅋㅋ', zero: true, noSuggest: true },
  { q: 'qwerty', zero: true, noSuggest: true },

  // ── 한/영 자판 실수 ──
  { q: 'rhrnfu', ids: ['goguryeo-seoul'], fixed: '고구려' },
  { q: 'tjdnf', min: 200, fixed: '서울' },
  { q: 'dkssud', zero: true, fixed: null },
  { q: 'ㅡㅠㅜ', min: 1, fixed: 'mbn', kbd: ['mbn'] },
  { q: '고프', ids: ['asics-goprun'], fixed: null },
  { q: '서울', fixed: null },
];

let pass = 0;
let fail = 0;
const show = (ok, q, detail) => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${q} → ${detail}`);
};

for (const row of ROWS) {
  const { q } = row;
  const out = searchWithFixes(index, q);
  const hits = out.hits;
  const ids = idsOf(hits);
  const problems = [];
  if (row.zero && hits.size !== 0) problems.push(`0개여야 하는데 ${hits.size}개`);
  if (row.zero && row.noSuggest && suggestRaces(index, q, 3).length) problems.push('제안이 나옴');
  if (row.min != null && hits.size < row.min) problems.push(`${row.min}개 이상이어야 하는데 ${hits.size}개`);
  if (row.max != null && hits.size > row.max) problems.push(`${row.max}개 이하여야 하는데 ${hits.size}개`);
  for (const id of row.ids ?? []) {
    if (!byId.has(id)) problems.push(`기대 대회 ${id} 가 데이터에 없음`);
    else if (!ids.includes(id)) problems.push(`${id} 없음`);
  }
  if (row.only) {
    const extra = ids.filter((i) => !row.only.includes(i));
    const miss = row.only.filter((i) => !ids.includes(i));
    if (extra.length || miss.length) problems.push(`정확히 [${row.only.join(',')}] 여야 함 (넘침 ${extra.join(',') || '-'} / 빠짐 ${miss.join(',') || '-'})`);
  }
  for (const id of row.not ?? []) if (ids.includes(id)) problems.push(`${id} 가 나오면 안 됨`);
  if (row.same) {
    const other = idsOf(searchRaces(index, row.same)).sort().join(',');
    if (ids.slice().sort().join(',') !== other) problems.push(`'${row.same}' 결과와 달라야 하지 않음 (${hits.size} vs ${other.split(',').length})`);
  }
  if (row.every) {
    const bad = [...hits].filter((r) => !row.every[1](r));
    if (bad.length) problems.push(`${row.every[0]} 아닌 결과 ${bad.length}개 (${bad.slice(0, 3).map((r) => r.id).join(',')})`);
  }
  if ('fixed' in row) {
    const got = out.fixed ? out.fixed.query : null;
    if (got !== row.fixed) problems.push(`자판 변환 ${row.fixed === null ? '안 써야' : `'${row.fixed}'`} 하는데 ${got === null ? '안 씀' : `'${got}'`}`);
  }
  if (row.kbd) {
    const got = keyboardFixes(q).map((f) => f.query);
    for (const k of row.kbd) if (!got.includes(k)) problems.push(`keyboardFixes 에 '${k}' 없음 (${got.join(',') || '-'})`);
  }
  const tag = [row.zero ? '0개 정상' : '', row.only ? `only ${row.only.length}` : '', row.fixed ? `변환 '${row.fixed}'` : '', row.same ? `= '${row.same}'` : ''].filter(Boolean).join(' · ');
  show(!problems.length, q, `${hits.size}개${tag ? ` · ${tag}` : ''}${problems.length ? ` · ${problems.join(' / ')}` : ''}`);
}

// ── 자판 변환 순수 함수 ──
const KBD = [
  ['rhvm', 'en2ko', '고프'],
  ['rhrnfu', 'en2ko', '고구려'],
  ['tjdnf', 'en2ko', '서울'],
  ['dkssud', 'en2ko', '안녕'],
  ['gksrmf', 'en2ko', '한글'],
  ['Rkrk', 'en2ko', '까가'],
  ['ㅡㅠㅜ', 'ko2en', 'mbn'],
  ['고프', 'ko2en', 'rhvm'],
  ['값', 'ko2en', 'rkqt'],
];
for (const [q, kind, want] of KBD) {
  const got = keyboardFixes(q).find((f) => f.kind === kind);
  show(got?.query === want, `keyboard ${q}`, `${kind} → ${got?.query ?? '없음'} (기대 ${want})`);
}
show(keyboardFixes('10k').every((f) => f.kind !== 'ko2en'), 'keyboard 10k', '숫자·영문 섞인 말은 한→영 변환 없음');
show(keyboardFixes('').length === 0, 'keyboard (빈 검색어)', '변환 없음');

// ── aliasSiblings (관련 검색어 칩용) ──
const sib = aliasSiblings('상해');
show(sib.includes('상하이') && !sib.includes('상해'), 'aliasSiblings 상해', sib.join(','));
const sib2 = aliasSiblings('하낭');
show(sib2.length === 1 && sib2[0] === '하남', 'aliasSiblings 하낭', `${sib2.join(',')} (ONE_WAY 표기에서 나가는 것만)`);
const sib3 = aliasSiblings('하남');
show(sib3.length === 0, 'aliasSiblings 하남', `${sib3.join(',') || '[]'} (ONE_WAY 표기인 하낭은 칩으로 안 냄)`);

console.log(`\nPASS ${pass} / FAIL ${fail} (색인 ${races.length}개, 기준일 ${TODAY})`);
process.exit(fail ? 1 : 0);
