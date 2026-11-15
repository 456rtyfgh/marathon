// 인기 검색어 거르기 검사 (scripts/popular-lib.mjs) + public/popular-searches.json 형식 검사.
//   node scripts/popular-test.mjs
import { readFileSync } from 'node:fs';
import { buildIndex, searchRaces } from '../src/lib/search.ts';
import { filterPopular, isSafeTerm, MAX_TERMS } from './popular-lib.mjs';
import { splitData } from './data-split.mjs';

let pass = 0;
let fail = 0;
const check = (ok, label, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` → ${detail}` : ''}`);
};

// isSafeTerm
const SAFE = ['서울', '경주 마라톤', 'tokyo', '10k', '3·1절', 'UTMB'];
const UNSAFE = [
  ['이메일', 'abc@gmail.com'],
  ['URL http', 'https://example.com'],
  ['URL www', 'www.runner.kr'],
  ['도메인', 'marathon.com'],
  ['전화번호', '010-1234-5678'],
  ['전화번호(공백)', '010 1234 5678'],
  ['숫자 여러 개', '12345678'],
  ['숫자만', '2027'],
  ['기호만', '!!!'],
  ['20자 초과', '가'.repeat(21)],
  ['욕설', '씨 발'],
  ['욕설 영문', 'Fuck'],
  ['빈 문자열', '   '],
];
for (const q of SAFE) check(isSafeTerm(q), `안전 '${q}'`);
for (const [why, q] of UNSAFE) check(!isSafeTerm(q), `거름 ${why} '${q}'`);
check(!isSafeTerm(null) && !isSafeTerm(42), '문자열이 아니면 거름');

// filterPopular: 합산·순서·결과 있는 것만·최대 개수
const has = (t) => !['없는대회'].includes(t.replace(/\s/g, ''));
const rows = [
  { term: '서울', n: 10 },
  { term: '서 울', n: 5 }, // normalize 후 같음 → 합산 15, 표기는 많이 친 쪽
  { term: '도쿄', n: 12 },
  { term: '없는 대회', n: 99 }, // 결과 0개 → 뺌
  { term: 'a@b.com', n: 50 },
  { term: '010-1234-5678', n: 40 },
  { term: '12345', n: 30 },
  { term: '부산', n: '7' }, // 문자열 숫자도 받는다
  { term: '이상한', n: 0 },
  { term: '대구', n: -3 },
  null,
  { term: 5, n: 3 },
];
const out = filterPopular(rows, has);
check(JSON.stringify(out.map((x) => x.term)) === JSON.stringify(['서울', '도쿄', '부산']), '합산·정렬·거르기', JSON.stringify(out));
check(out[0].n === 15, '같은 말 n 합산', String(out[0].n));
check(filterPopular('x', has).length === 0 && filterPopular(undefined, has).length === 0, '배열이 아닌 입력은 빈 목록');
const many = Array.from({ length: 300 }, (_, i) => ({ term: `검색${String.fromCharCode(0xac00 + i)}`, n: 300 - i }));
check(filterPopular(many, () => true).length === MAX_TERMS, `최대 ${MAX_TERMS}개`);

// public/popular-searches.json
const file = JSON.parse(readFileSync(new URL('../public/popular-searches.json', import.meta.url), 'utf8'));
check(typeof file.generated_at === 'string' && !Number.isNaN(Date.parse(file.generated_at)), 'popular-searches.json generated_at');
check(file.days === 60 && ['rpc', 'seed', 'empty'].includes(file.source), 'popular-searches.json days/source', `${file.days} ${file.source}`);
check(Array.isArray(file.terms) && file.terms.length <= MAX_TERMS, 'popular-searches.json terms 배열 ≤ 100');
check(file.terms.every((t) => typeof t.term === 'string' && Number.isFinite(t.n)), 'terms 항목 {term, n}');
check(file.terms.every((t, i) => i === 0 || file.terms[i - 1].n >= t.n), 'n 내림차순');
check(file.terms.every((t) => isSafeTerm(t.term)), '모든 term 이 거르기 규칙 통과');
const data = splitData(JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'))).list;
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const index = buildIndex(data.races.filter((r) => r.race_date >= today));
const zero = file.terms.filter((t) => searchRaces(index, t.term).size === 0).map((t) => t.term);
check(zero.length === 0, '모든 term 의 결과가 1개 이상 (오늘 기준)', zero.join(',') || `${file.terms.length}개`);

console.log(`\nPASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
