// 검색 사전·정확도 검사 (파트 B): 결과 0개였던 검색어, 상위 검색어, 과확장·오검색 방지, 자판 변환, 반복 글자.
//   node scripts/search-test.mjs
//   SEARCH_TEST_TODAY=2026-12-01 node scripts/search-test.mjs   (날짜를 바꾸면 그 날 이후 대회만 색인 — 날짜에 묶인 기대는 깨질 수 있다)
// '지금 data.json 기준 정확한 기대' 를 적는다. 데이터가 바뀌어 깨지면 표를 고친다 (느슨하게 풀지 않는다).
import { readFileSync } from 'node:fs';
import { buildIndex, keyboardFixes, searchRaces, searchWithFixes, suggestRaces } from '../src/lib/search.ts';
import { aliasSiblings } from '../src/lib/aliases.ts';
import { splitData } from './data-split.mjs';
import { souvenirInfo } from '../src/lib/util.ts';
import { cityName } from '../src/i18n/names.ts';

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
  { q: '세계 6대 마라톤', same: '세계6대', min: 8, not: ['seoul-marathon', 'chuncheon', 'jtbc-seoul'] },
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
  // 줄이고 남는 게 짧은 조각이면 줄이지 않는다 (고치기 전: 하하하 → '하' 1527개, 1010 → '10' 1521개, nana → 'na' 395개, gogo → 'go' 107개, aaaa → 'aa' 22개, ㅇㅇㅇ → 'ㅇㅇ' 157개)
  { q: '하하하', max: 2, not: ['seoul-marathon', 'busan-intl'] }, // 오타 단계의 하하호호마라톤 정도만
  { q: '1010', zero: true },
  { q: 'nana', zero: true },
  { q: 'gogo', zero: true },
  { q: 'aaaa', zero: true },
  { q: 'ㅇㅇㅇ', zero: true, fixed: null },
  { q: 'nycnyc', same: 'nyc' },

  // ── 한/영 자판 실수 ──
  { q: 'rhrnfu', ids: ['goguryeo-seoul'], fixed: '고구려' },
  { q: 'tjdnf', min: 200, fixed: '서울' },
  { q: 'dkssud', zero: true, fixed: null },
  { q: 'ㅡㅠㅜ', min: 1, fixed: 'mbn', kbd: ['mbn'] },
  { q: '고프', ids: ['asics-goprun'], fixed: null },
  // 짧은 조각으로 바뀌는 것은 쓰지 않는다 (고치기 전: ㅜㅜ → 'nn' 128개, ㅠㅠ → 'bb' 14개, qm → '브' 127개, hz → 'ㅗㅋ' 154개, 쑈 → 'Ty' 116개)
  { q: 'ㅜㅜ', zero: true, fixed: null },
  { q: 'ㅠㅠ', zero: true, fixed: null },
  { q: 'qm', zero: true, fixed: null },
  { q: 'hz', zero: true, fixed: null },
  { q: '쑈', zero: true, fixed: null },
  // 한 글자만 거듭 친 것은 영문으로 바꾸지 않는다 (고치기 전: ㅠㅠㅠ → 'bbb' 로 버뮤다 대회 1개)
  { q: 'ㅠㅠㅠ', zero: true, fixed: null },
  // 첫 글자 자동 대문자·Caps Lock: 대문자 그대로(R → ㄲ, '꼬프')는 0개 → 소문자로 바꾼 것도 본다 (고치기 전 0개)
  { q: 'Rhvm', ids: ['asics-goprun'], fixed: '고프' },
  { q: 'RHRNFU', ids: ['goguryeo-seoul'], fixed: '고구려' },
  { q: 'Tokyo', min: 5, fixed: null },
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

// ── 기념품 글 검색 (listed 일 때만 색인, 영어 글은 영어 화면 색인에서만) ──
// 데이터에 기념품이 들어 있든 없든 같은 결과가 나오도록 가짜 대회를 끼워 확인한다.
const fxBase = races.find((r) => r.country_code === 'KR' && !(r.city_ko ?? '').includes('완주'));
const fx = (id, extra) => ({ ...fxBase, id, name_ko: `기념품시험${id}`, name_en: `SouvenirProbe ${id}`, ...extra });
const fxListed = fx('listed', {
  souvenir_status: 'listed',
  souvenir_ko: '완주 메달, 햅쌀 5kg, 지역상품권, 월드런 고글',
  souvenir_en: 'Finisher medal, new rice 5kg, local gift voucher, World Run goggles',
});
const fxNone = fx('none', { souvenir_status: 'none', souvenir_ko: '고글 쌀 상품권', souvenir_en: 'goggles' });
const fxUnknown = fx('unknown', { souvenir_status: 'unknown', souvenir_ko: '고글 쌀 상품권', souvenir_en: 'goggles' });
const fxKoOnly = fx('koonly', { souvenir_status: 'listed', souvenir_ko: '독특한양말세트', souvenir_en: null });
// 지명 검색어 확인용: 해외 대회의 나라 이름·영어 도시 이름을 국내 가짜 대회의 기념품 글에 넣는다
const enCity = (r) => (r.country_code !== 'KR' && cityName(r, 'en')) || '';
const abroad = races.find((r) => /^[A-Za-z]{5,}$/.test(enCity(r)));
const abroad2 = races.find((r) => /^[A-Za-z]{2,} [A-Za-z]{4,}$/.test(enCity(r)));
const [cityW1, cityW2] = abroad2 ? enCity(abroad2).split(' ') : [];
const fxPlace = fx('place', {
  souvenir_status: 'listed',
  souvenir_ko: `${abroad?.country_ko ?? ''} 왕복 항공권 추첨`,
  souvenir_en: `${abroad ? enCity(abroad) : ''} themed windbreaker`,
});
// 이름에 도시 첫 낱말, 기념품 글에 둘째 낱말 ('Ha Long' 이 'half …' + 'long-sleeve' 대회를 내던 꼴)
const fxPlace2 = fx('place2', { name_en: `SouvenirProbe ${cityW1 ?? ''} run`, souvenir_status: 'listed', souvenir_ko: '티셔츠', souvenir_en: `${cityW2 ?? ''} edition windbreaker` });
const fxRaces = [...races, fxListed, fxNone, fxUnknown, fxKoOnly, fxPlace, fxPlace2];
const idxKo = buildIndex(fxRaces);
const idxEn = buildIndex(fxRaces, 'en');
const SOUVENIR_ROWS = [
  // [색인 설명, 색인, 검색어, 있어야 하는 id, 없어야 하는 id]
  ['ko', idxKo, '고글', ['listed'], ['none', 'unknown']],
  ['ko', idxKo, '쌀', ['listed'], ['none', 'unknown']],
  ['ko', idxKo, '상품권', ['listed'], ['none', 'unknown']],
  ['ko', idxKo, '독특한양말', ['koonly'], ['listed']],
  ['ko', idxKo, 'goggles', [], ['listed', 'none', 'unknown']], // 한국어 화면은 영어 기념품 글을 찾지 않는다
  ['en', idxEn, 'goggles', ['listed'], ['none', 'unknown']],
  ['en', idxEn, 'gift voucher', ['listed'], ['none', 'unknown']],
  ['en', idxEn, '고글', ['listed'], ['none', 'unknown']], // 영어 화면도 한국어 글은 찾는다
  ['en', idxEn, '독특한양말', ['koonly'], []],
  // 지명 검색어는 기념품 글로 찾지 않는다: '완주'(전북 완주) 가 다른 지역 대회의 '완주 메달' 을 내면 안 됨
  ['ko', idxKo, '완주', [], ['listed']],
  ['ko', idxKo, '완주군', [], ['listed']],
  ['en', idxEn, '완주', [], ['listed']],
  ['ko', idxKo, '메달', ['listed'], []],
  ['ko', idxKo, '완주 메달', ['listed'], []],
  // 나라 이름·영어 도시 이름(통째·낱말)도 지명이다
  ['ko', idxKo, '항공권', ['place'], []],
  ['en', idxEn, 'windbreaker', ['place', 'place2'], []],
  ...(abroad ? [['ko', idxKo, abroad.country_ko, [], ['place']], ['en', idxEn, enCity(abroad), [], ['place']]] : []),
  ...(abroad2 ? [['en', idxEn, enCity(abroad2), [], ['place2']]] : []),
];
// 기념품 글을 넣어도 지명 '완주' 결과는 기념품 없는 색인과 같다
{
  const plain = buildIndex(races.map((r) => ({ ...r, souvenir_status: null })));
  const a = idsOf(searchRaces(index, '완주')).sort().join();
  const b = idsOf(searchRaces(plain, '완주')).sort().join();
  show(a === b, '기념품 지명 회귀 완주', `${searchRaces(index, '완주').size}개 (기념품 없는 색인 ${searchRaces(plain, '완주').size}개)`);
}
for (const [kind, idx, q, want, not] of SOUVENIR_ROWS) {
  const got = idsOf(searchWithFixes(idx, q).hits);
  const problems = [
    ...want.filter((i) => !got.includes(i)).map((i) => `${i} 없음`),
    ...not.filter((i) => got.includes(i)).map((i) => `${i} 가 나오면 안 됨`),
  ];
  show(!problems.length, `기념품(${kind}) ${q}`, `${got.length}개${problems.length ? ` · ${problems.join(' / ')}` : ''}`);
}

// 진짜 데이터: 기념품이 listed 인 대회는 자기 기념품 글의 낱말로 찾아진다 (아직 데이터에 없으면 건너뜀)
const realListed = races.filter((r) => r.souvenir_status === 'listed' && r.souvenir_ko);
if (realListed.length) {
  const bad = [];
  // 지명 낱말('완주 메달' 의 완주)은 일부러 기념품 글로 찾지 않으니 고르지 않는다
  const placeSet = new Set(races.flatMap((r) => (r.city_ko ?? '').split(/[\s·]+/)));
  for (const r of realListed) {
    const word = r.souvenir_ko.match(/[가-힣]{2,}/g)?.find((w) => !placeSet.has(w));
    if (word && !idsOf(searchRaces(index, word)).includes(r.id)) bad.push(`${r.id}:${word}`);
  }
  show(!bad.length, '기념품 실제 데이터', `listed ${realListed.length}개 모두 기념품 낱말로 찾아짐${bad.length ? ` · 못 찾음 ${bad.slice(0, 3).join(',')}` : ''}`);
} else console.log('SKIP 기념품 실제 데이터 → 지금 data.json 에 listed 대회 없음');

// ── 목록 파일(data-split): 검색용 글만, 출처·확인일은 상세에서만 ──
const lr = splitData({ generated_at: 'x', races: [{ ...fxListed, souvenir_source: 'https://example.com/a', souvenir_checked: '2026-11-24' }] }).list.races[0];
show(
  lr.souvenir_status === 'listed' && lr.souvenir_ko === fxListed.souvenir_ko && lr.souvenir_en === fxListed.souvenir_en && !('souvenir_source' in lr) && !('souvenir_checked' in lr),
  'data-split 기념품 칸',
  '목록에 status·ko·en 만 남고 source·checked 는 빠짐',
);

// ── souvenirInfo (상세 표시 규칙) ──
const SI = [
  ['listed ko', souvenirInfo({ souvenir_status: 'listed', souvenir_ko: '티셔츠', souvenir_en: 'Tee', souvenir_source: 'https://a.example/' }, 'ko'), { kind: 'listed', text: '티셔츠', source: 'https://a.example/' }],
  ['listed en', souvenirInfo({ souvenir_status: 'listed', souvenir_ko: '티셔츠', souvenir_en: 'Tee' }, 'en'), { kind: 'listed', text: 'Tee', source: null }],
  ['listed en 영어 없음 → 한국어', souvenirInfo({ souvenir_status: 'listed', souvenir_ko: '티셔츠', souvenir_en: '  ' }, 'en'), { kind: 'listed', text: '티셔츠', source: null }],
  ['none', souvenirInfo({ souvenir_status: 'none' }, 'ko'), { kind: 'none' }],
  ['unknown', souvenirInfo({ souvenir_status: 'unknown', souvenir_ko: '티셔츠' }, 'ko'), null],
  ['칸 없음', souvenirInfo({}, 'en'), null],
  ['listed 인데 글 없음', souvenirInfo({ souvenir_status: 'listed', souvenir_ko: ' ' }, 'ko'), null],
];
for (const [name, got, want] of SI) show(JSON.stringify(got) === JSON.stringify(want), `souvenirInfo ${name}`, JSON.stringify(got));

console.log(`\nPASS ${pass} / FAIL ${fail} (색인 ${races.length}개, 기준일 ${TODAY})`);
process.exit(fail ? 1 : 0);
