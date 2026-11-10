/**
 * 관리자 대회 수정의 순수 함수(src/lib/raceDiff.ts) 확인 — node scripts/admin-edit-test.mjs
 * 칸 목록이 Race 의 모든 칸을 덮는지, 바뀐 칸 계산·저장할 칸 고르기(빈칸·숫자·배열·대소문자), 검사 문구,
 * 그리고 public/data.json 의 대회가 하나도 검사에 걸리지 않는지(고치지 않은 칸 때문에 저장이 막히지 않게) 본다.
 */
import { readFileSync } from 'node:fs';
import { RACE_FIELDS, diffRace, toPatch, validateRace, formatValue } from '../src/lib/raceDiff.ts';

let pass = 0;
let fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra !== '' ? ` — ${typeof extra === 'string' ? extra : JSON.stringify(extra)}` : ''}`);
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const base = {
  id: 'tokyo',
  name_ko: '도쿄 마라톤',
  name_en: 'Tokyo Marathon',
  city_ko: '도쿄',
  country_ko: '일본',
  country_code: 'JP',
  region: '일본',
  race_date: '2027-03-07',
  date_confidence: 'confirmed',
  is_major: true,
  entry_type: 'lottery',
  entry_opens: '2026-08-15',
  entry_closes: '2026-08-31',
  entry_confidence: 'confirmed',
  entry_fee: 16500,
  entry_fee_currency: 'JPY',
  distances: ['풀', '10km'],
  field_size: 38000,
  course: '평지',
  flight_hours: 2.5,
  official_url: 'https://www.marathon.tokyo/',
  source_url: null,
  last_verified: '2026-11-01',
  notes_ko: '메모',
  notes_en: null,
  discipline: 'road',
  elevation_gain: null,
  sold_out_on: null,
  subregion: 'JP-13',
};

// ── 칸 목록 ──
const keys = RACE_FIELDS.map((f) => f.key);
const want = Object.keys(base).filter((k) => k !== 'id');
ok(eq([...keys].sort(), [...want].sort()), 'RACE_FIELDS = Race 의 id 뺀 모든 칸', { missing: want.filter((k) => !keys.includes(k)), extra: keys.filter((k) => !want.includes(k)) });
ok(new Set(keys).size === keys.length, 'RACE_FIELDS 칸 이름이 겹치지 않음');
const data = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
const dbKeys = new Set(data.races.flatMap((r) => Object.keys(r)));
ok(keys.every((k) => dbKeys.has(k)), 'RACE_FIELDS 의 칸은 모두 DB 스냅샷(public/data.json)에 있는 칸 (PGRST204 방지)', keys.filter((k) => !dbKeys.has(k)));
ok(RACE_FIELDS.every((f) => f.kind !== 'select' || (f.options?.length ?? 0) > 0), 'select 칸은 모두 options 가 있음');
const groups = new Set(['기본', '일정', '접수', '참가', '코스', '출처', '메모']);
ok(RACE_FIELDS.every((f) => groups.has(f.group)), '모든 칸이 정해진 묶음에 속함');

// ── diffRace / toPatch ──
ok(diffRace(base, { ...base }).length === 0, '같으면 바뀐 칸 0개');
ok(eq(toPatch(base, { ...base }), {}), '같으면 patch 빈 객체');
const same = { ...base, source_url: '', notes_en: '  ', elevation_gain: '', distances: ['풀', ' 10km '], country_code: 'jp' };
ok(diffRace(base, same).length === 0, "null·''·공백·undefined 같게, 배열 앞뒤 공백·대문자 무시", diffRace(base, same));

const after = {
  ...base,
  name_en: 'Tokyo Marathon 2027',
  entry_fee: '17,000',
  distances: '풀, 10km, 5km',
  is_major: false,
  notes_ko: '',
  source_url: 'https://src.example/',
  field_size: '38000.4',
  course: '',
  entry_fee_currency: 'usd',
};
const ch = diffRace(base, after);
ok(eq(ch.map((c) => c.key), ['is_major', 'entry_fee_currency', 'entry_fee', 'distances', 'course', 'source_url', 'notes_ko', 'name_en'].sort((a, b) => keys.indexOf(a) - keys.indexOf(b))),
  'diffRace: 바뀐 칸만, RACE_FIELDS 순서', ch.map((c) => c.key));
const byKey = Object.fromEntries(ch.map((c) => [c.key, c]));
ok(byKey.is_major.before === '예' && byKey.is_major.after === '아니오', 'diffRace: boolean 은 예/아니오');
ok(byKey.entry_fee.before === '16,500' && byKey.entry_fee.after === '17,000', 'diffRace: 숫자는 자릿수 쉼표', byKey.entry_fee);
ok(byKey.distances.after === '풀, 10km, 5km', 'diffRace: 배열은 a, b');
ok(byKey.notes_ko.after === '—' && byKey.course.after === '—' && byKey.course.before === '평지', "diffRace: 빈 값은 '—'");
ok(byKey.name_en.label === '대회명 (영문)', 'diffRace: 한국어 칸 이름');
ok(!('field_size' in byKey), 'diffRace: 정원 38000.4 → 반올림 38000 이라 안 바뀜');

const p = toPatch(base, after);
ok(eq(Object.keys(p).sort(), ch.map((c) => c.key).sort()), 'toPatch: diffRace 와 같은 칸만');
ok(p.entry_fee === 17000 && typeof p.entry_fee === 'number', "toPatch: '17,000' → 17000 (number)");
ok(eq(p.distances, ['풀', '10km', '5km']), 'toPatch: 거리 문자열 → 배열');
ok(p.notes_ko === null && p.course === null, "toPatch: nullable 빈칸 → null");
ok(p.is_major === false, 'toPatch: boolean');
ok(p.entry_fee_currency === 'USD', 'toPatch: 통화 대문자');
ok(!('id' in p), 'toPatch: id 는 넣지 않음');
const p2 = toPatch(base, { ...base, entry_fee: '', elevation_gain: '812.6', city_ko: ' 오사카 ' });
ok(p2.entry_fee === null && p2.elevation_gain === 813 && p2.city_ko === '오사카', "toPatch: 숫자 빈칸 → null, 상승 고도 정수, 앞뒤 공백 제거", p2);
const p3 = toPatch({ ...base, discipline: undefined }, { ...base, discipline: 'trail' });
ok(p3.discipline === 'trail', '없던 칸(예전 스냅샷의 discipline)도 바뀌면 들어감');

// ── formatValue ──
ok(formatValue('entry_type', 'lottery') === '추첨', 'formatValue: select 는 표시 라벨');
ok(formatValue('date_confidence', 'tbc') === '미정', 'formatValue: 신뢰도 라벨');
ok(formatValue('distances', []) === '—', 'formatValue: 빈 배열 —');
ok(formatValue('sold_out_on', null) === '—', 'formatValue: null —');

// ── validateRace ──
ok(eq(validateRace(base), {}), '정상 대회 → 오류 없음');
const bad = validateRace({
  ...base,
  name_ko: ' ',
  race_date: '2027-02-30',
  official_url: 'www.marathon.tokyo',
  source_url: 'ftp://x',
  entry_fee_currency: 'YEN!',
  country_code: 'JPN',
  entry_opens: '2026-09-01',
  entry_closes: '2026-08-01',
  entry_fee: '-5',
  field_size: 'abc',
  region: '화성',
  subregion: 'tokyo',
});
for (const k of ['name_ko', 'race_date', 'official_url', 'source_url', 'entry_fee_currency', 'country_code', 'entry_closes', 'entry_fee', 'field_size', 'region', 'subregion']) {
  ok(typeof bad[k] === 'string' && bad[k].length > 0, `validateRace: ${k} 오류`, bad[k] ?? '없음');
}
ok(/고칠 칸이 11개/.test(bad.form ?? ''), 'validateRace: form 에 오류 수', bad.form);
ok(/http/.test(bad.official_url), 'validateRace: URL 문구에 http 안내');
ok(eq(validateRace({ ...base, official_url: 'http://a.example/x?y=1', source_url: '', entry_opens: null }), {}), 'validateRace: http 주소·빈 출처·시작일 없음은 통과');
ok(eq(validateRace({ ...base, entry_opens: '2026-08-31', entry_closes: '2026-08-31' }), {}), 'validateRace: 시작=마감 통과');

// ── 지금 DB 스냅샷의 대회가 검사에 걸리지 않는다 ──
const hit = data.races.map((r) => [r.id, validateRace(r)]).filter(([, e]) => Object.keys(e).length);
ok(hit.length === 0, `validateRace: public/data.json 대회 ${data.races.length}개 모두 통과`, hit.slice(0, 3));

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
