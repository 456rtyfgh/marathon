// 검색 검사: 실제로 결과 0개였던 검색어가 이제 대상 대회를 찾는지, 흔한 검색은 나빠지지 않았는지, 속도.
//   node scripts/search-check.mjs            (대상 대회가 data.json 에 없으면 SKIP)
//   node scripts/search-check.mjs --strict   (SKIP 도 실패)
import { readFileSync } from 'node:fs';
import { buildIndex, searchRaces, suggestRaces } from '../src/lib/search.ts';
import { splitData } from './data-split.mjs';

const strict = process.argv.includes('--strict');
// 앱은 목록 파일(목록 필드만, 메모 본문 없음)로 검색하므로 같은 값으로 검사한다 (scripts/data-split.mjs)
const data = splitData(JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'))).list;
// 앱과 같은 '오늘' (한국 날짜) 이후 대회만 검색한다
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const races = data.races.filter((r) => r.race_date >= today);
const index = buildIndex(races);

// [검색어, 결과에 있어야 할 이름 조각 (null 이면 결과 1개 이상이면 됨)]
const CASES = [
  ['고구려마라', '고구려 마라톤'],
  ['고구려마라톸', '고구려 마라톤'],
  ['샌프란시스커', '샌프란시스코 마라톤'],
  ['상해', '상하이 마라톤'],
  ['보스톤', '보스턴'],
  ['울산', '태화강 마라톤'],
  ['태화', '태화강 마라톤'],
  ['여수', '여수해양마라톤'],
  ['동해', '동해 스카이레이스'],
  ['굿러너', null],
  ['삼일절', '삼일절 마라톤'],
  ['도쿄마라톤', '도쿄 마라톤'],
  ['대구마라톤', '대구국제마라톤'],
  ['여성', '나고야 우먼스 마라톤'],
  ['nyc', '뉴욕 마라톤'],
  ['빅서 마라톤', '빅서 인터내셔널 마라톤'],
  ['더레이스', null],
  ['나눔 레이스', null],
  ['마랕', null],
  // 교보로런 = 더 레이스 서울 21K 안의 행사 (표기 사전)
  ['교보', '더 레이스 서울'],
  ['교보로런', '더 레이스 서울'],
  // 파트 B 가 넣는 대회
  ['치토세ㅣ', '치토세'],
  ['chitose', '치토세'],
  ['치토세', '치토세'],
];

// 옛 방식 그대로 (App.tsx 의 hay.includes) — 흔한 검색이 줄지 않았는지 비교용
const oldCount = (q) =>
  races.filter((r) => `${r.name_ko} ${r.name_en} ${r.city_ko} ${r.country_ko}`.toLowerCase().includes(q.trim().toLowerCase())).length;

let pass = 0;
let fail = 0;
let skip = 0;
const count = (ok) => {
  if (ok) pass++;
  else fail++;
};
const times = [];
const timed = (fn) => {
  const t = performance.now();
  const v = fn();
  times.push(performance.now() - t);
  return v;
};
const names = (list) => list.slice(0, 3).map((r) => r.name_ko).join(', ');

for (const [q, want] of CASES) {
  const hits = [...timed(() => searchRaces(index, q))];
  if (want && !races.some((r) => r.name_ko.includes(want))) {
    skip++;
    console.log(`SKIP ${q} → 데이터 없음 ('${want}' 대회가 data.json 에 없음)`);
    continue;
  }
  const ok = want ? hits.some((r) => r.name_ko.includes(want)) : hits.length > 0;
  count(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${q} → ${hits.length}개 · ${names(hits)}${want ? ` · 기대 '${want}' ${ok ? '있음' : '없음'}` : ''}`);
}

// 대조: 흔한 검색은 옛 방식보다 줄면 안 된다
for (const q of ['서울', '하프', '도쿄']) {
  const n = timed(() => searchRaces(index, q)).size;
  const o = oldCount(q);
  const ok = n >= o;
  count(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} 대조 ${q} → ${n}개 (옛 방식 ${o}개)`);
}
// 대조: 아무 말이나 친 건 결과도 제안도 없어야 한다
for (const q of ['ㅋㅋㅋㅋ', 'qwerty']) {
  const n = timed(() => searchRaces(index, q)).size;
  const s = suggestRaces(index, q, 3);
  const ok = n === 0 && s.length === 0;
  count(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} 대조 ${q} → ${n}개 · 제안 ${s.length}개${s.length ? ` (${names(s)})` : ''}`);
}

// 브라우저 확인용: 결과 0개인데 '혹시 이 대회인가요?' 가 나오는 예
const EMPTY_TRY = ['고구려마라톤대해', '샌프란시스코마라탕', '동아마라톤마스터즈', '서울국제마라톡스', '춘천마라토노대회', '부산바다마라툰'];
const example = EMPTY_TRY.find((q) => searchRaces(index, q).size === 0 && suggestRaces(index, q, 3).length > 0);
if (example) {
  pass++;
  console.log(`PASS 0개+제안 예 '${example}' → 제안 ${names(suggestRaces(index, example, 3))}`);
} else {
  fail++;
  console.log(`FAIL 0개+제안 예를 못 찾음 (${EMPTY_TRY.join(', ')})`);
}

// 속도: 입력 한 번 = 검색 1회. 처음 보는 검색어로 여러 번 (오타 단계까지 도는 것 포함)
const SPEED = ['서', '서울', '서울마', '서울마라', '서울마라톤', 'tok', 'tokyo', '샌프란시스커', '고구려마라톸', '치토세ㅣ', '쿠알라룸푸르마라톤', '하프'];
for (let k = 0; k < 5; k++) for (const q of SPEED) timed(() => searchRaces(index, q + (k ? ' '.repeat(k) + k : '')));
const avg = times.reduce((a, b) => a + b, 0) / times.length;
const max = Math.max(...times);
const fast = avg <= 5;
count(fast);
console.log(`${fast ? 'PASS' : 'FAIL'} 속도 대회 ${races.length}개 · 검색 ${times.length}회 평균 ${avg.toFixed(2)}ms · 최대 ${max.toFixed(2)}ms`);

if (strict) fail += skip;
console.log(`PASS ${pass} / FAIL ${fail} / SKIP ${skip} · 평균 ${avg.toFixed(2)}ms`);
process.exit(fail ? 1 : 0);
