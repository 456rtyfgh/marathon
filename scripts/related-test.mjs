// 관련 검색어·필터 밖 결과 검사 (src/lib/relatedSearches.ts, src/lib/outsideFilter.ts)
//   node scripts/related-test.mjs
import { readFileSync } from 'node:fs';
import { buildIndex, searchRaces, searchWithFixes, normalize } from '../src/lib/search.ts';
import { relatedChips, resultCount, MAX_CHIPS } from '../src/lib/relatedSearches.ts';
import { hiddenRaces, pickHidden, emptyKind, HIDDEN_SHOW } from '../src/lib/outsideFilter.ts';
import { parsePopular } from '../src/lib/popularSearches.ts';
import { splitData } from './data-split.mjs';

const data = splitData(JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'))).list;
// 기준일 고정 (scripts/search-test.mjs 와 같은 방식 — 날짜가 지나도 결과가 흔들리지 않게). SEARCH_TEST_TODAY 로 바꿀 수 있다
const today = process.env.SEARCH_TEST_TODAY || '2026-11-15';
const upcoming = data.races.filter((r) => r.race_date >= today);
const past = data.races.filter((r) => r.race_date < today);
const index = buildIndex(upcoming);
const allIndex = buildIndex([...upcoming, ...past]);

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' → ' + detail : ''}`);
};

// 실제 인기 검색어 파일이 있으면 그것, 없으면 시험용
let popular = [];
try {
  popular = parsePopular(JSON.parse(readFileSync(new URL('../public/popular-searches.json', import.meta.url), 'utf8')));
} catch {
  /* 없음 */
}
const fake = [
  { term: '서울', n: 90 },
  { term: '서울마라톤', n: 80 },
  { term: '도쿄', n: 70 },
  { term: '부산', n: 60 },
  { term: '존재하지않는대회이름', n: 50 },
  { term: '경주', n: 40 },
  { term: '하프', n: 30 },
];
const pop = popular.length ? popular : fake;
const chipsFor = (q, list = pop) => {
  const results = q.trim() ? [...searchWithFixes(index, q).hits] : [];
  return relatedChips({ q, index, races: upcoming, results, popular: list, lang: 'ko' });
};

// ── 칩 ──
for (const q of ['서울', '경주', '도쿄', '보스턴', '하프', '대구', 'tokyo']) {
  const chips = chipsFor(q);
  const terms = chips.map((c) => c.term);
  check(`칩 ${q}: 최대 ${MAX_CHIPS}개`, chips.length <= MAX_CHIPS, `${chips.length}개 ${terms.join(' · ')}`);
  check(`칩 ${q}: 결과 0개인 칩 없음`, chips.every((c) => searchRaces(index, c.term).size > 0));
  check(`칩 ${q}: 검색어와 같은 칩·중복 없음`, new Set(terms.map(normalize)).size === terms.length && !terms.some((t) => normalize(t) === normalize(q)));
}
{
  const chips = chipsFor('서울', fake);
  check('칩: 결과 0개 인기 검색어는 내지 않는다', !chips.some((c) => c.term === '존재하지않는대회이름'));
  const empty = chipsFor('', fake);
  check('빈 검색어: 인기 상위 결과 있는 것만, 순서 유지', empty.map((c) => c.term).join() === '서울,서울마라톤,도쿄,부산,경주,하프', empty.map((c) => c.term).join());
  check('빈 검색어: 인기 목록이 비면 칩 없음', chipsFor('', []).length === 0);
  check('검색어 있고 인기 목록이 비어도 동작', chipsFor('서울', []).length > 0, chipsFor('서울', []).map((c) => c.term).join(' · '));
}
{
  const chips = chipsFor('경주', []);
  const sources = new Set(chips.map((c) => c.source));
  check('칩 경주: 같은 시·도 다른 도시/지역어(place) 출처가 있다', sources.has('place'), chips.map((c) => `${c.term}(${c.source})`).join(' '));
  check('칩 경주: 같은 경북 대회 도시를 낸다', chips.some((c) => c.source === 'place' && c.term !== '경주'));
}
{
  const chips = chipsFor('보스톤', []);
  check('칩: 표기 사전(alias) 출처 — 보스톤 → 보스턴', chips.some((c) => c.source === 'alias' && /보스턴|boston/i.test(c.term)), chips.map((c) => `${c.term}(${c.source})`).join(' '));
}
{
  // 해외 검색어는 같은 나라의 다른 도시
  const chips = chipsFor('도쿄', []);
  check('칩 도쿄: 일본 다른 도시/나라 이름', chips.some((c) => c.source === 'place'), chips.map((c) => `${c.term}(${c.source})`).join(' '));
}
{
  const chips = chipsFor('경주', pop);
  const hasKw = relatedChips({ q: '서울', index, races: upcoming, results: [...searchRaces(index, '서울')], popular: [], lang: 'ko', max: 40 }).some((c) => c.source === 'keyword');
  check('칩: 결과 대회 이름에서 나온 키워드(keyword) 출처가 있을 수 있다', hasKw || true, hasKw ? '있음' : '이 데이터에서는 없음');
  check('칩: 같은 호출은 같은 결과 (정해져 있음)', JSON.stringify(chips) === JSON.stringify(chipsFor('경주', pop)));
}
{
  // 키워드 칩은 대회 이름에 있는 글자 그대로 (가운데 기호를 빼 Mayor's 가 'Mayors' 로 깨지면 안 된다)
  const enIndex = buildIndex(upcoming, 'en');
  const results = [...searchRaces(enIndex, 'seoul')];
  const kws = relatedChips({ q: 'seoul', index: enIndex, races: upcoming, results, popular: [], lang: 'en', max: 40 }).filter((c) => c.source === 'keyword');
  const names = results.map((r) => (r.name_en || r.name_ko).toLowerCase());
  const broken = kws.filter((c) => !names.some((n) => n.includes(c.term.toLowerCase())));
  check('칩(영어): 키워드는 대회 이름에 있는 글자 그대로', broken.length === 0, broken.length ? '깨진 말: ' + broken.map((c) => c.term).join(', ') : kws.map((c) => c.term).slice(0, 6).join(' · '));
}
check('resultCount 는 searchRaces 와 같다', resultCount(index, '서울') === searchRaces(index, '서울').size);
{
  const t = performance.now();
  for (const q of ['서', '서울', '서울마', '경주', '도쿄', 'tokyo', '하프', '마라톤']) chipsFor(q, fake);
  const avg = (performance.now() - t) / 8;
  check('칩 계산 속도 (입력 1회 평균 50ms 이하, 처음 계산 포함)', avg <= 50, `${avg.toFixed(1)}ms`);
}

// ── 인기 검색어 파일 읽기 ──
check('parsePopular: 모양이 다르면 빈 목록', parsePopular(null).length === 0 && parsePopular({}).length === 0 && parsePopular({ terms: 'x' }).length === 0);
check(
  'parsePopular: 글 아닌 값·너무 긴 말·빈 말은 거르고 n 내림차순',
  parsePopular({ terms: [{ term: 'a', n: 1 }, { term: 3, n: 9 }, { term: '', n: 4 }, { term: 'x'.repeat(21), n: 7 }, { term: 'b', n: 5 }] })
    .map((p) => p.term)
    .join() === 'b,a',
);

// ── 필터 밖 결과 ──
{
  // 필터로 아무것도 안 보이는 상태 = shown 이 빈 집합
  const q = '경주';
  const all = searchWithFixes(allIndex, q).hits;
  const h = hiddenRaces([...searchWithFixes(index, q).hits, ...all], new Set(), today);
  check('필터 밖: 보이는 게 없으면 검색에 맞는 대회 전부 (중복 없이)', h.total === all.size && h.total === new Set([...h.upcoming, ...h.past].map((r) => r.id)).size, `${h.total}개 (다가오는 ${h.upcoming.length} · 지난 ${h.past.length})`);
  check('필터 밖: 다가오는 대회가 대회일 오름차순', h.upcoming.every((r, i) => i === 0 || h.upcoming[i - 1].race_date <= r.race_date));
  check('필터 밖: 지난 대회는 최근 순, 모두 오늘 이전', h.past.every((r, i) => r.race_date < today && (i === 0 || h.past[i - 1].race_date >= r.race_date)));
  const five = pickHidden(h);
  check(`필터 밖: 보여 주는 건 최대 ${HIDDEN_SHOW}개, 다가오는 것 먼저`, five.length <= HIDDEN_SHOW && (h.upcoming.length >= five.length ? five.every((r) => r.race_date >= today) : true));
  // 보이는 대회는 빠진다
  const shown = new Set(h.upcoming.slice(0, 2));
  const h2 = hiddenRaces(all, shown, today);
  check('필터 밖: 이미 보이는 대회는 뺀다', h2.total === h.total - shown.size && ![...shown].some((r) => [...h2.upcoming, ...h2.past].includes(r)));
  check('기록 분기: 결과 있으면 null · 필터 탓 filtered · 전체 0개 none', emptyKind(3, 5) === null && emptyKind(0, 5) === 'filtered' && emptyKind(0, 0) === 'none');
}
{
  // 진짜 없는 검색어는 전체에서도 0개 → 필터 밖 안내 없음 (search_empty)
  const none = searchWithFixes(allIndex, 'ㅋㅋㅋㅋㅋ').hits;
  const h = hiddenRaces(none, new Set(), today);
  check('필터 밖: 전체에서도 없는 검색어는 0개 (search_empty 쪽)', h.total === 0 && emptyKind(0, h.total) === 'none');
}

console.log(`PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
