// 관리 화면 대회 찾기(matchRaces·matchRange) 단위 검사: node scripts/admin-search-test.mjs
// 한글 부분·영문 대소문자·도시·나라·id·빈칸·결과 순서·개수 제한, 그리고 실제 data.json 으로 몇 가지.
import { readFileSync } from 'node:fs';
import { matchRaces, matchRange } from '../src/lib/adminSearch.ts';

let fail = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) fail++;
};
const ids = (rs) => rs.map((r) => r.id).join(',');

const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const shift = (days) => new Date(Date.parse(today) + days * 86400e3).toISOString().slice(0, 10);
const R = (id, name_ko, name_en, city_ko, country_ko, race_date) => ({ id, name_ko, name_en, city_ko, country_ko, race_date });

const races = [
  R('tokyo', '도쿄 마라톤', 'Tokyo Marathon', '도쿄', '일본', shift(100)),
  R('tokyo-legacy-half', '도쿄 레거시 하프', 'Tokyo Legacy Half Marathon', '도쿄', '일본', shift(30)),
  R('osaka', '오사카 마라톤', 'Osaka Marathon', '오사카', '일본', shift(80)),
  R('seoul', '서울마라톤', 'Seoul Marathon', '서울', '한국', shift(120)),
  R('jtbc-seoul', 'JTBC 서울 마라톤', 'JTBC Seoul Marathon', '서울', '한국', shift(-10)),
  R('berlin', '베를린 마라톤', 'BMW BERLIN-MARATHON', '베를린', '독일', shift(200)),
  R('kyoto', '교토 마라톤', 'Kyoto Marathon', '교토', '일본', shift(60)),
  R('a1', '에이원 런', 'A1 Run', '부산', '한국', shift(5)),
];

ok(matchRaces(races, '').length === 0, '빈 검색어 → []');
ok(matchRaces(races, '   ').length === 0, '빈칸만 → []');
ok(matchRaces(races, '·-').length === 0, '기호만 → []');

// 한글 부분 일치
ok(ids(matchRaces(races, '도쿄')) === 'tokyo-legacy-half,tokyo', `'도쿄' → 두 대회, 날짜 가까운 순 (${ids(matchRaces(races, '도쿄'))})`);
ok(ids(matchRaces(races, '레거시')) === 'tokyo-legacy-half', "'레거시' → 이름 가운데 부분 일치");
ok(matchRaces(races, '서울 마라').map((r) => r.id).includes('seoul'), "'서울 마라' → 빈칸 무시하고 '서울마라톤'");

// 영문 대소문자
ok(ids(matchRaces(races, 'tokyo')) === 'tokyo,tokyo-legacy-half', `'tokyo' → id 완전 일치가 먼저 (${ids(matchRaces(races, 'tokyo'))})`);
ok(ids(matchRaces(races, 'Tok')) === 'tokyo-legacy-half,tokyo', `'Tok' → 두 대회 시작 일치, 날짜 순 (${ids(matchRaces(races, 'Tok'))})`);
ok(ids(matchRaces(races, 'TOKYO MARATHON')) === 'tokyo', "'TOKYO MARATHON' → 대문자·빈칸 무시");
ok(ids(matchRaces(races, 'berlin-marathon')) === 'berlin', "'berlin-marathon' → 하이픈 무시");

// 도시·나라
ok(ids(matchRaces(races, '교토')) === 'kyoto', "'교토' → 도시");
ok(ids(matchRaces(races, '부산')) === 'a1', "'부산' → 도시만 맞는 대회");
ok(ids(matchRaces(races, '독일')) === 'berlin', "'독일' → 나라");

// id 일부
ok(ids(matchRaces(races, 'legacy-h')) === 'tokyo-legacy-half', "'legacy-h' → id 일부(이름에도 있음)");
ok(ids(matchRaces(races, 'jtbc-se')) === 'jtbc-seoul', "'jtbc-se' → id 일부");
ok(ids(matchRaces(races, 'a1')) === 'a1', "'a1' → id 완전 일치");

// 순서: id 완전 일치 > 이름 시작 > 부분
const seoul = ids(matchRaces(races, 'seoul'));
ok(seoul === 'seoul,jtbc-seoul', `'seoul' → id 일치 seoul 이 먼저, jtbc-seoul 은 부분 (${seoul})`);
const sk = ids(matchRaces(races, '서울'));
ok(sk === 'seoul,jtbc-seoul', `'서울' → 이름 시작 일치가 부분 일치보다 먼저 (${sk})`);

// 개수 제한
const many = Array.from({ length: 20 }, (_, i) => R(`run-${i}`, `달리기 ${i}`, `Run ${i}`, '서울', '한국', shift(i)));
ok(matchRaces(many, '달리기').length === 8, '기본 8개까지');
ok(matchRaces(many, '달리기', 3).length === 3, 'n=3');
ok(ids(matchRaces(many, '달리기', 3)) === 'run-0,run-1,run-2', '같은 순위는 날짜 가까운 순');

// 없는 칸이 있어도 안 깨짐
ok(matchRaces([{ id: 'x', name_ko: '엑스', race_date: today }], '엑스').length === 1, '영문 이름·도시 없는 대회');

// matchRange (굵게 표시 위치)
const mr = (t, q) => JSON.stringify(matchRange(t, q));
ok(mr('Tokyo Marathon', 'tok') === '[0,3]', `matchRange 'tok' in 'Tokyo Marathon' (${mr('Tokyo Marathon', 'tok')})`);
ok(mr('서울 마라톤', '서울마라') === '[0,5]', `matchRange 빈칸 건너 (${mr('서울 마라톤', '서울마라')})`);
ok(mr('BMW BERLIN-MARATHON', 'berlinmar') === '[4,14]', `matchRange 하이픈 건너 (${mr('BMW BERLIN-MARATHON', 'berlinmar')})`);
ok(matchRange('도쿄', '오사카') === null, 'matchRange 없음 → null');
ok(matchRange('도쿄', '') === null, 'matchRange 빈 검색어 → null');

// 실제 데이터(public/data.json)로: 한글·영문·id 일부가 서로 같은 대회를 찾는지
try {
  const data = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
  const all = data.races;
  const t0 = performance.now();
  const ko = matchRaces(all, '도쿄');
  const en = matchRaces(all, 'tokyo');
  const dt = performance.now() - t0;
  ok(ko.length > 0 && en.length > 0, `실제 데이터 '도쿄' ${ko.length}개 · 'tokyo' ${en.length}개`);
  ok(ko.some((r) => en.includes(r)), "실제 데이터 '도쿄'·'tokyo' 가 같은 대회를 찾음");
  ok(dt < 100, `실제 데이터 ${all.length}개 두 번 검색 ${dt.toFixed(1)}ms (<100ms)`);
} catch (e) {
  ok(false, `public/data.json 읽기 실패: ${e.message}`);
}

console.log(fail ? `\n${fail}개 실패` : '\n전부 ok');
process.exit(fail ? 1 : 0);
