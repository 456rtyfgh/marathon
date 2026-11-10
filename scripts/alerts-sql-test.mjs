/**
 * 0017_alert_send.sql 확인 (로컬 PGlite, 실제 DB 는 건드리지 않는다):
 *   npm i --no-save --prefix node_modules/.cache/pglite @electric-sql/pglite
 *   PGLITE_DIR=node_modules/.cache/pglite node scripts/alerts-sql-test.mjs
 * Supabase 흉내는 member-sql-test.mjs 와 같다. 0001~0013 을 돌린 뒤 0017 을 두 번 돌린다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url).pathname;
const dir = resolve(root, process.env.PGLITE_DIR ?? 'node_modules/.cache/pglite');
const { PGlite } = await import(pathToFileURL(resolve(dir, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();

const mig = (f) => readFileSync(resolve(root, 'supabase/migrations', f), 'utf8');
let pass = 0;
let fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra ? ` — ${extra}` : ''}`);
};
const q = async (sql, params) => (await db.query(sql, params)).rows;
async function err(sql, params) {
  try {
    await (params ? db.query(sql, params) : db.exec(sql));
    return null;
  } catch (e) {
    return e.message;
  }
}
async function as(role, uid = '') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  if (role) await db.exec(`set role ${role}`);
}

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz,
    raw_user_meta_data jsonb not null default '{}', created_at timestamptz not null default now(),
    last_sign_in_at timestamptz, confirmation_sent_at timestamptz, confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create schema extensions; grant usage on schema extensions to anon, authenticated, service_role;
  create function extensions.digest(text, text) returns bytea language sql immutable as
    $$ select sha256(convert_to($1, 'UTF8')) $$;
  create table public.stat_daily (day date, event text, key text, n int not null default 0, primary key (day, event, key));
  create table public.heartbeat (id int primary key, at timestamptz);
  create function public.spam_reason(text) returns text language sql immutable as $$ select null::text $$;
  create function public.guard_review() returns trigger language plpgsql as $$ begin return new; end $$;
  create function public.guard_request() returns trigger language plpgsql as $$ begin return new; end $$;
`);
for (const f of ['0001_init.sql', '0002_reviews_auth.sql', '0003_requests_automation.sql', '0004_admin_email.sql',
  '0010_security_hardening.sql', '0011_privacy.sql', '0012_security.sql', '0013_member.sql']) {
  let sql = mig(f);
  if (f === '0001_init.sql') sql = sql.replace(/create extension if not exists pgcrypto;/, '');
  if (f === '0012_security.sql') {
    const a = sql.indexOf('-- ── [0] 사전 점검');
    sql = sql.slice(0, a) + sql.slice(sql.indexOf('end $$;', a) + 'end $$;'.length);
  }
  try {
    await db.exec(sql);
  } catch (e) {
    console.error(`기존 마이그레이션 ${f} 실패: ${e.message}`);
    process.exit(2);
  }
}
// Supabase 처럼 새 표·함수에 API 역할 기본 권한 → 0017 의 revoke 가 먹는지 본다
await db.exec(`
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`);
ok(true, '0001~0013 실행');

let e = await err(mig('0017_alert_send.sql'));
ok(e === null, '0017 1회차 실행', e);
e = await err(mig('0017_alert_send.sql'));
ok(e === null, '0017 2회차 실행 (다시 돌려도 같음)', e);

const KEY = 'test-alerts-key';
await db.exec(`insert into public.automation_keys (name, key_hash) values
  ('alerts', encode(extensions.digest('${KEY}', 'sha256'), 'hex')),
  ('weekly', encode(extensions.digest('weekly-key', 'sha256'), 'hex'))`);

// ── 준비: 오늘 = 2027-01-10 ──
const D = '2027-01-10';
await db.exec(`
  insert into public.races (id, name_ko, name_en, city_ko, country_ko, country_code, region, race_date, date_confidence,
                            entry_type, entry_opens, entry_closes, entry_confidence, official_url, notes_ko) values
   ('r1',     '가 마라톤', 'Ga Marathon', '도쿄', '일본', 'JP', '일본', '2027-03-07', 'confirmed', 'fcfs', '2027-01-13', '2027-02-01', 'confirmed', 'https://ga.example', null),
   ('r-exp',  '예상 마라톤', 'Exp Marathon', '오사카', '일본', 'JP', '일본', '2027-01-13', 'expected', 'fcfs', '2027-01-13', '2027-01-20', 'expected', 'https://exp.example', null),
   ('r-tbc',  '미정 마라톤', 'Tbc Marathon', '교토', '일본', 'JP', '일본', '2027-05-01', 'confirmed', 'fcfs', '2027-01-13', null, 'tbc', 'https://tbc.example', null),
   ('r-cxl',  '취소 마라톤', 'Cxl Marathon', '나고야', '일본', 'JP', '일본', '2027-01-13', 'confirmed', 'fcfs', '2027-01-13', null, 'confirmed', 'https://cxl.example', '[취소] 태풍'),
   ('r-sold', '매진 마라톤', 'Sold Marathon', '후쿠오카', '일본', 'JP', '일본', '2027-04-01', 'confirmed', 'fcfs', '2026-12-01', '2027-01-13', 'confirmed', 'https://sold.example', null),
   ('r-day',  '내일 마라톤', 'Tomorrow Marathon', '삿포로', '일본', 'JP', '일본', '2027-01-11', 'confirmed', 'open', null, null, 'confirmed', 'https://day.example', null);
`);
const M = (await q(`insert into auth.users (email, email_confirmed_at) values ('Member@X.com', now()) returning id`))[0].id;
const N = (await q(`insert into auth.users (email, email_confirmed_at) values ('nomail@x.com', null) returning id`))[0].id;
await db.exec(`
  insert into public.alert_subscriptions (email, race_id, days_before, confirmed_at) values
    ('a@x.com', 'r1', '{14,3}', now()),
    ('a@x.com', 'r-exp', '{3}', now()),
    ('a@x.com', 'r-tbc', '{3}', now()),
    ('a@x.com', 'r-cxl', '{3}', now()),
    ('a@x.com', 'r-sold', '{3}', now()),
    ('a@x.com', 'r-day', '{1}', now()),
    ('member@x.com', 'r1', '{3}', now());
  insert into public.alert_subscriptions (email, race_id, days_before, pending_since) values ('pending@x.com', 'r1', '{3}', now());
  insert into public.user_alert_prefs (user_id, saved_races, days_before, lang) values ('${M}', true, '{3}', 'en'), ('${N}', true, '{3}', 'ko');
  insert into public.user_favorites (user_id, race_id) values ('${M}', 'r1'), ('${M}', 'r-day'), ('${N}', 'r1');
`);

const due = async (date = D, channel = 'email', key = KEY) =>
  (await q(`select public.automation_due_alerts($1, $2::date, $3) j`, [key, date, channel]))[0].j;
const mark = async (items, channel = 'email') =>
  (await q(`select public.automation_mark_sent($1, $2::jsonb, $3) n`, [KEY, JSON.stringify(items), channel]))[0].n;
const keyOf = (g) => g.items.map((i) => `${i.race_id}:${i.kind}:${i.days_left}`).join(',');

// ── 권한 ──
await as('anon');
e = await err(`select public.automation_due_alerts('${KEY}')`);
ok(/permission denied/.test(e ?? ''), 'anon: automation_due_alerts 실행 거부', e ?? '실행됨');
e = await err(`select public.automation_mark_sent('${KEY}', '[]')`);
ok(/permission denied/.test(e ?? ''), 'anon: automation_mark_sent 실행 거부', e ?? '실행됨');
e = await err(`select * from public.alert_send_log`);
ok(/permission denied/.test(e ?? ''), 'anon: alert_send_log 읽기 거부', e ?? '읽힘');
await as('authenticated', M);
e = await err(`select public.automation_due_alerts('${KEY}')`);
ok(/permission denied/.test(e ?? ''), 'authenticated: automation_due_alerts 실행 거부', e ?? '실행됨');
e = await err(`update public.user_alert_prefs set unsubscribe_token = gen_random_uuid()`);
ok(/permission denied/.test(e ?? ''), '회원: 수신 거부 토큰 직접 바꾸기 거부', e ?? '바뀜');
e = await err(`update public.user_alert_prefs set lang = 'ko'`);
ok(e === null, '회원: 내 알림 언어(lang) 바꾸기 허용', e);
await db.exec(`update public.user_alert_prefs set lang = 'en'`);
await as('service_role');
e = await err(`select public.automation_due_alerts('wrong')`);
ok(/automation key rejected/.test(e ?? ''), 'service_role + 틀린 키 → 거절', e ?? '통과');
e = await err(`select public.automation_due_alerts('weekly-key')`);
ok(/automation key rejected/.test(e ?? ''), "service_role + 'weekly' 키 → 거절 (알림 키는 따로)", e ?? '통과');
e = await err(`select public.automation_due_alerts('${KEY}', null, 'sms')`);
ok(/bad channel/.test(e ?? ''), '없는 channel → 거절', e ?? '통과');

// ── 오늘 보낼 것 ──
let r = await due();
ok(r.date === D && r.channel === 'email' && r.sent_today === 0, 'date·channel·sent_today', JSON.stringify({ ...r, groups: undefined }));
const emails = r.groups.map((g) => g.email);
ok(JSON.stringify(emails) === JSON.stringify(['a@x.com', 'member@x.com']), '확인된 구독 + 메일 인증 회원만 (pending·미인증 회원 제외), 가까운 일정 순', JSON.stringify(emails));
const A = r.groups.find((g) => g.email === 'a@x.com');
const Mg = r.groups.find((g) => g.email === 'member@x.com');
ok(keyOf(A) === 'r-day:race_day:1,r-sold:entry_closes:3,r1:entry_opens:3', 'a@x.com: 대회일 D-1 + 마감 D-3 + 접수 시작 D-3 (예상·tbc·취소 제외, sold_out_on 칸 없어도 동작)', keyOf(A));
ok(!JSON.stringify(r).includes('r-exp'), "expected(예상) 날짜는 접수·대회일 모두 안 보냄");
ok(!JSON.stringify(r).includes('r-tbc'), 'tbc 날짜도 안 보냄');
ok(!JSON.stringify(r).includes('r-cxl'), '취소된 대회 안 보냄');
ok(A.lang === 'ko' && A.user_id === null, '비회원 구독: lang ko, user_id 없음', JSON.stringify(A));
ok(Mg.lang === 'en' && Mg.user_id === M, '회원: 설정 언어 en, user_id 있음 (푸시 쪽이 씀)', JSON.stringify(Mg));
ok(keyOf(Mg) === 'r1:entry_opens:3', '회원: 구독+저장한 대회가 겹쳐도 한 번만, 저장 대회의 대회일 알림은 없음', keyOf(Mg));
ok(Mg.items[0].unsubscribe_tokens.length === 2 && Mg.unsubscribe_tokens.length === 2, '회원: 구독 토큰 + 저장 대회 토큰 둘 다', JSON.stringify(Mg.unsubscribe_tokens));
ok(A.unsubscribe_tokens.length === 6, "a@x.com: '모두 끄기' 토큰 = 그 주소의 모든 확인된 구독(오늘 알림 없는 것 포함)", A.unsubscribe_tokens.length);
const it0 = A.items.find((i) => i.race_id === 'r1');
ok(it0.event_date === '2027-01-13' && it0.scheduled_for === D && it0.race_date === '2027-03-07' && it0.official_url === 'https://ga.example' && it0.name_en === 'Ga Marathon',
  '항목 내용 (일정·예정일·대회일·링크·영어 이름)', JSON.stringify(it0));

// 매진: sold_out_on 칸이 생기고 지났으면 마감 알림 없음 (칸이 없어도 함수는 돈다 — 위에서 확인)
await as(null);
await db.exec(`alter table public.races add column if not exists sold_out_on date`);
await as('service_role');
r = await due('2027-01-10');
ok(JSON.stringify(r).includes('r-sold'), '매진 정보 없음 → 마감 D-3 알림 보냄');
await as(null);
await db.exec(`update public.races set sold_out_on = '2027-01-05' where id = 'r-sold'`);
await as('service_role');
r = await due('2027-01-10');
ok(!JSON.stringify(r).includes('r-sold'), '조기 마감(sold_out_on 지남) → 마감 알림 안 보냄');

// ── 기록 → 중복 방지 ──
const toMark = (g, extra = {}) => g.items.map((i) => ({ email: g.email, race_id: i.race_id, kind: i.kind, event_date: i.event_date, scheduled_for: i.scheduled_for, message_id: `msg-${g.email}`, ...extra }));
const A1 = r.groups.find((g) => g.email === 'a@x.com');
ok((await mark(toMark(A1))) === 2, 'mark_sent: 2건 기록');
ok((await mark(toMark(A1))) === 0, 'mark_sent 다시: 0건 (unique)');
const todayKst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
ok((await due(todayKst)).sent_today === 1, 'sent_today = 오늘(KST, 실제 보낸 시각) 보낸 메일 1통');
r = await due();
ok(JSON.stringify(r.groups.map((g) => g.email)) === '["member@x.com"]', '보낸 주소는 오늘 다시 안 나옴', JSON.stringify(r.groups.map((g) => g.email)));
r = await due(D, 'push');
ok(r.groups.some((g) => g.email === 'a@x.com') && r.sent_today === 0, "channel 'push' 는 메일 기록과 따로", JSON.stringify(r.groups.map((g) => g.email)));

// ── 못 보낸 것 이어 보내기 (3일까지) ──
await as(null);
await db.exec(`update public.races set entry_opens = '2027-01-20' where id = 'r1'`);
await db.exec(`update public.alert_subscriptions set days_before = '{7,1}' where email = 'a@x.com' and race_id = 'r1'`);
await db.exec(`delete from public.alert_subscriptions where email = 'member@x.com'; update public.user_alert_prefs set saved_races = false where user_id = '${M}'`);
await as('service_role');
// D-7 = 01-13. 01-13 에 못 보내고 01-15 에 보면 아직 나옴 (days_left 5)
r = await due('2027-01-15');
let g = r.groups.find((x) => x.email === 'a@x.com');
ok(g && keyOf(g) === 'r1:entry_opens:5', '하루 넘긴 알림: 3일 안이면 다음 날 이어서 (D-5 로 표시)', g ? keyOf(g) : 'none');
r = await due('2027-01-17');
ok(!r.groups.some((x) => x.email === 'a@x.com'), '3일 넘게 지난 알림은 버림');
// D-1 = 01-19 가 나가면 옛 D-7 은 다시 안 나옴
r = await due('2027-01-19');
g = r.groups.find((x) => x.email === 'a@x.com');
ok(g && keyOf(g) === 'r1:entry_opens:1', '01-19: D-1 알림', g ? keyOf(g) : 'none');
await mark(toMark(g));
r = await due('2027-01-19');
ok(!r.groups.some((x) => x.email === 'a@x.com'), 'D-1 기록 뒤 다시 안 나옴');
// failed 도 다시 안 보냄 (주소 오류 등)
await as(null);
await db.exec(`update public.races set race_date = '2027-01-22', date_confidence = 'confirmed' where id = 'r-day'`);
await db.exec(`update public.alert_subscriptions set days_before = '{3}' where email = 'a@x.com' and race_id = 'r-day'`);
await as('service_role');
r = await due('2027-01-19');
g = r.groups.find((x) => x.email === 'a@x.com');
ok(g && keyOf(g) === 'r-day:race_day:3', '일정이 바뀌면 새 날짜 기준으로 다시 알림', g ? keyOf(g) : 'none');
await mark(toMark(g, { status: 'failed', message_id: null }));
r = await due('2027-01-19');
ok(!r.groups.some((x) => x.email === 'a@x.com'), "status 'failed' 로 기록한 것도 다시 안 보냄");
ok(r.sent_today === 0, "failed 는 sent_today 에 안 셈 (01-19 엔 보낸 게 없음 — sent_at 은 실제 시각이라 0)", r.sent_today);

// ── 수신 거부 ──
await as(null);
const [tokA] = (await q(`select unsubscribe_token t from public.alert_subscriptions where email = 'a@x.com' and race_id = 'r1'`)).map((x) => x.t);
const [tokM] = (await q(`select unsubscribe_token t from public.user_alert_prefs where user_id = '${M}'`)).map((x) => x.t);
await db.exec(`update public.user_alert_prefs set saved_races = true where user_id = '${M}'`);
await as('anon');
let u = (await q(`select public.unsubscribe_alert($1::uuid[]) j`, [`{${tokA},${tokM},00000000-0000-0000-0000-000000000000}`]))[0].j;
ok(u.removed === 1 && u.saved_off === 1, 'anon: 토큰으로 구독 삭제 + 저장 대회 알림 끄기', JSON.stringify(u));
u = (await q(`select public.unsubscribe_alert($1::uuid[]) j`, [`{${tokA}}`]))[0].j;
ok(u.removed === 0 && u.saved_off === 0, '같은 토큰 다시 → 0 (오류 없음)', JSON.stringify(u));
u = (await q(`select public.unsubscribe_alert('{}'::uuid[]) j`))[0].j;
ok(u.removed === 0, '빈 배열 → 0');
e = await err(`select public.unsubscribe_alert(array(select gen_random_uuid() from generate_series(1, 101)))`);
ok(/too many tokens/.test(e ?? ''), '토큰 101개 → 거절', e ?? '통과');
await as(null);
ok((await q(`select 1 from public.alert_subscriptions where unsubscribe_token = '${tokA}'`)).length === 0, '구독 행이 실제로 지워짐');
ok((await q(`select saved_races from public.user_alert_prefs where user_id = '${M}'`))[0].saved_races === false, '회원 저장 대회 알림이 실제로 꺼짐');

// ── 오래된 기록 정리 ──
await db.exec(`insert into public.alert_send_log (email, race_id, kind, event_date, scheduled_for) values ('old@x.com', 'r1', 'race_day', '2020-01-01', '2019-12-29')`);
await as('service_role');
await mark([]);
await as(null);
ok((await q(`select 1 from public.alert_send_log where email = 'old@x.com'`)).length === 0, 'mark_sent: 일정 30일 지난 기록 지움');

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
