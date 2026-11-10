/**
 * 0013_member.sql 확인 (로컬 PGlite, 실제 DB 는 건드리지 않는다):
 *   npm i --no-save --prefix node_modules/.cache/pglite @electric-sql/pglite
 *   PGLITE_DIR=node_modules/.cache/pglite node scripts/member-sql-test.mjs
 * Supabase 흉내(auth 스키마·auth.uid()·anon/authenticated 역할·extensions.digest)와 저장소에 없는 표·함수
 * (stat_daily, heartbeat, spam_reason)만 대역으로 만들고, 0001~0012 를 순서대로 돌린 뒤 0013 을 두 번, 끝 무렵 0019 를 두 번 돌린다.
 * 역할 전환은 set role + request.jwt.claim.sub (PostgREST 와 같은 방식).
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
/** API 역할 흉내: role = 'anon' | 'authenticated' | null(관리 = 슈퍼유저) */
async function as(role, uid = '') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  if (role) await db.exec(`set role ${role}`);
}

// ── Supabase 흉내 + 저장소 밖 객체 대역 ──
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
  -- 0010 이 정의보다 먼저 revoke 하는 함수 (라이브에는 0005~0009 시절부터 있었다) — 0010 이 본문을 다시 만든다
  create function public.guard_review() returns trigger language plpgsql as $$ begin return new; end $$;
  create function public.guard_request() returns trigger language plpgsql as $$ begin return new; end $$;
`);

// ── 기존 마이그레이션 (0001 의 pgcrypto 는 대역 digest 로) ──
for (const f of ['0001_init.sql', '0002_reviews_auth.sql', '0003_requests_automation.sql', '0004_admin_email.sql',
  '0010_security_hardening.sql', '0011_privacy.sql', '0012_security.sql']) {
  let sql = mig(f);
  if (f === '0001_init.sql') sql = sql.replace(/create extension if not exists pgcrypto;/, '');
  // 0012 의 [0] 은 라이브 본문 md5 와 비교한다 — 저장소 본문(0002·0010)으로 만든 이 DB 와는 몇 개가 달라 뺀다
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
// Supabase 는 새 표·함수에 anon·authenticated 권한을 기본으로 준다 → 같은 조건에서 0013 의 revoke 가 먹는지 본다
await db.exec(`
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  grant select on all tables in schema public to authenticated;
`);
ok(true, '0001~0012 실행 (0012 사전 점검 통과)');

// ── 0013 사전 점검: 다른 본문이면 멈춘다 ──
const m13 = mig('0013_member.sql');
await db.exec(`create or replace function public.subscribe_alert(p_email text, p_race_id text, p_days integer[])
  returns void language plpgsql security definer set search_path = public as $$ begin null; end $$;`);
let e = await err(m13);
ok(/0013 중단: subscribe_alert 라이브 본문/.test(e ?? ''), '사전 점검: subscribe_alert 본문이 다르면 멈춤', e ?? '통과해 버림');
await db.exec('rollback').catch(() => {});
ok((await q(`select to_regclass('public.user_favorites') t`))[0].t === null, '멈추면 아무것도 안 바뀜');
// 0012 본문 되돌리기 ([M2] 블록만 다시)
const m12 = mig('0012_security.sql');
const s = m12.indexOf('create or replace function public.subscribe_alert');
await db.exec(m12.slice(s, m12.indexOf('-- ── [M3]', s)));
const md5 = (await q(`select md5(btrim(regexp_replace(prosrc, '\\s+', ' ', 'g'))) h from pg_proc where proname = 'subscribe_alert'`))[0].h;
ok(md5 === '16eb2d516a294e1f767aa612bae54a14', '0012 subscribe_alert 본문 md5 = 0013 기준값', md5);

// ── 0013 두 번 ──
e = await err(m13);
ok(e === null, '0013 1회차 실행', e);
e = await err(m13);
ok(e === null, '0013 2회차 실행 (다시 돌려도 같음)', e);

// ── 준비: 대회 3개, 회원 2명 ──
await db.exec(`
  insert into public.races (id, name_ko, name_en, city_ko, country_ko, country_code, region, race_date, entry_type, official_url) values
   ('r-a', '가', 'A', '도쿄', '일본', 'JP', '일본', '${new Date().getFullYear()}-03-01', 'fcfs', 'https://a'),
   ('r-b', '나', 'B', '오사카', '일본', 'JP', '일본', '${new Date().getFullYear()}-11-01', 'fcfs', 'https://b'),
   ('r-old', '다', 'C', '교토', '일본', 'JP', '일본', '2020-04-01', 'fcfs', 'https://c');
`);
const A = (await q(`insert into auth.users (email, email_confirmed_at) values ('a@x.com', now()) returning id`))[0].id;
const B = (await q(`insert into auth.users (email, email_confirmed_at) values ('b@x.com', now()) returning id`))[0].id;

// ── anon ──
await as('anon');
for (const t of ['user_favorites', 'user_races', 'user_alert_prefs', 'user_calendar_tokens']) {
  e = await err(`select * from public.${t}`);
  ok(/permission denied/.test(e ?? ''), `anon: ${t} 읽기 거부`, e ?? '읽힘');
}
e = await err(`insert into public.user_favorites (user_id, race_id) values ('${A}', 'r-a')`);
ok(/permission denied/.test(e ?? ''), 'anon: 저장 넣기 거부', e ?? '들어감');
e = await err(`select public.merge_favorites(array['r-a'])`);
ok(/permission denied/.test(e ?? ''), 'anon: merge_favorites 실행 거부', e ?? '실행됨');
e = await err(`select public.issue_calendar_token()`);
ok(/permission denied/.test(e ?? ''), 'anon: issue_calendar_token 실행 거부', e ?? '실행됨');
e = await err(`select public.subscribe_alert('a@x.com', 'r-a', array[14,3])`);
ok(/로그인한 회원만 알림을 신청할 수 있습니다/.test(e ?? ''), 'anon: subscribe_alert → 한국어 거절', e ?? '신청됨');
ok((await q(`select * from public.calendar_feed('zz')`)).length === 0, 'anon: calendar_feed 형식 틀림 → 0행');
ok((await q(`select * from public.calendar_feed(repeat('0', 64))`)).length === 0, 'anon: calendar_feed 없는 토큰 → 0행');

// ── 회원 A ──
await as('authenticated', A);
await db.exec(`insert into public.user_favorites (race_id) values ('r-a')`);
ok((await q(`select user_id from public.user_favorites`))[0]?.user_id === A, 'A: 저장 넣기 (user_id 는 기본값 auth.uid())');
e = await err(`insert into public.user_favorites (user_id, race_id) values ('${B}', 'r-b')`);
ok(/permission denied/.test(e ?? ''), 'A: user_id 를 직접 넣기(위조) 거부', e ?? '들어감');
const merged = (await q(`select * from public.merge_favorites(array['r-a', 'r-b', 'nope'])`)).map((r) => r.merge_favorites);
ok(JSON.stringify(merged) === JSON.stringify(['r-a', 'r-b']), 'A: merge_favorites — 없는 대회 무시, 중복 없음', JSON.stringify(merged));
await db.exec(`insert into public.user_races (race_id, status) values ('r-old', 'finished')`);
await db.exec(`update public.user_races set distance = '풀', distance_km = 42.195, finish_sec = 14400 where race_id = 'r-old'`);
const touched = (await q(`select created_at, updated_at from public.user_races where race_id = 'r-old'`))[0];
ok(+touched.updated_at > +touched.created_at, 'A: 기록 고치면 updated_at 이 서버 시각으로 바뀜', JSON.stringify(touched));
e = await err(`update public.user_races set updated_at = '2000-01-01' where race_id = 'r-old'`);
ok(/permission denied/.test(e ?? ''), 'A: updated_at 직접 고치기 거부', e ?? '바뀜');
await db.exec(`insert into public.user_races (race_id, status, distance, distance_km, finish_sec) values ('r-a', 'finished', '하프', 21.0975, 6000)`);
e = await err(`insert into public.user_races (race_id, status, finish_sec) values ('r-b', 'registered', 3600)`);
ok(/user_races_finish_only/.test(e ?? ''), 'A: 접수 상태에 기록 넣기 거부 (check)', e ?? '들어감');
const reg = await q(`select race_id, status from public.merge_registered(array['r-b', 'r-a']) order by race_id`);
ok(JSON.stringify(reg) === JSON.stringify([{ race_id: 'r-a', status: 'finished' }, { race_id: 'r-b', status: 'registered' }, { race_id: 'r-old', status: 'finished' }]),
  'A: merge_registered — 있는 행은 그대로, 새 것은 registered', JSON.stringify(reg));
const sum = (await q(`select * from public.my_record_summary(${new Date().getFullYear()})`))[0];
ok(sum.year_count === 1 && Number(sum.year_km) === 21.098 && sum.best_full_sec === 14400 && sum.best_half_sec === 6000,
  'A: my_record_summary (올해 1회·21.098km, 풀 4:00:00·하프 1:40:00)', JSON.stringify(sum));
await db.exec(`insert into public.user_alert_prefs (saved_races) values (true)`);
e = await err(`update public.user_alert_prefs set days_before = array[2]`);
ok(/user_alert_prefs_days/.test(e ?? ''), 'A: 알림 시점은 1·3·7·14·30 만', e ?? '바뀜');
const created = (await q(`select created_at from public.user_alert_prefs`))[0].created_at;
await db.exec(`update public.user_alert_prefs set saved_races = false`);
const after = (await q(`select created_at, saved_races from public.user_alert_prefs`))[0];
ok(after.saved_races === false && +after.created_at === +created, 'A: 알림 설정 끄기 (created_at 그대로)');
e = await err(`update public.user_alert_prefs set created_at = '2000-01-01'`);
ok(/permission denied/.test(e ?? ''), 'A: created_at 직접 고치기 거부', e ?? '바뀜');
const tok1 = (await q(`select public.issue_calendar_token() t`))[0].t;
ok(/^[0-9a-f]{64}$/.test(tok1), 'A: issue_calendar_token → hex 64자', tok1);
ok((await q(`select public.calendar_token_info() t`))[0].t !== null, 'A: calendar_token_info → 발급 시각');
e = await err(`select * from public.user_calendar_tokens`);
ok(/permission denied/.test(e ?? ''), 'A: 토큰 표 직접 읽기 거부', e ?? '읽힘');
e = await err(`select public.subscribe_alert('b@x.com', 'r-a', array[14])`);
ok(/로그인한 계정의 이메일로만/.test(e ?? ''), 'A: 남의 이메일로 알림 신청 거부 (0012 규칙 유지)', e ?? '신청됨');
e = await err(`select public.subscribe_alert('a@x.com', 'r-a', array[14, 3])`);
ok(e === null, 'A: 본인 이메일로 알림 신청', e);

// ── src/lib/member.ts 가 PostgREST 로 보내는 꼴 그대로 (upsert = INSERT … ON CONFLICT … RETURNING) ──
e = await err(`insert into public.user_favorites (race_id) values ('r-a') on conflict (user_id, race_id) do nothing returning race_id`);
ok(e === null, 'A: 저장 upsert(ignoreDuplicates)', e);
e = await err(`insert into public.user_races (race_id, status, distance, distance_km, finish_sec) values ('r-b', 'finished', '하프', 21.098, 5400)
  on conflict (user_id, race_id) do update set race_id = excluded.race_id, status = excluded.status, distance = excluded.distance,
  distance_km = excluded.distance_km, finish_sec = excluded.finish_sec returning race_id, status, distance, distance_km, finish_sec, updated_at`);
ok(e === null, 'A: 기록 upsert(merge-duplicates)', e);
e = await err(`insert into public.user_races (race_id, status, distance, distance_km, finish_sec) values ('r-b', 'registered', null, null, null)
  on conflict (user_id, race_id) do update set race_id = excluded.race_id, status = excluded.status, distance = excluded.distance,
  distance_km = excluded.distance_km, finish_sec = excluded.finish_sec`);
ok(e === null, 'A: 기록 upsert 로 다시 접수 상태(기록 비움)', e);
e = await err(`insert into public.user_alert_prefs (saved_races) values (true) on conflict (user_id) do update set saved_races = excluded.saved_races
  returning saved_races, days_before`);
ok(e === null, 'A: 알림 설정 upsert', e);

// ── 피드 (anon 이 토큰으로) ──
await as('anon');
let feed = (await q(`select race_id from public.calendar_feed($1)`, [tok1])).map((r) => r.race_id);
ok(JSON.stringify(feed) === JSON.stringify(['r-a', 'r-b']), 'anon: calendar_feed(A 토큰) → A 의 저장 대회', JSON.stringify(feed));
await as('authenticated', A);
const tok2 = (await q(`select public.issue_calendar_token() t`))[0].t;
await as('anon');
ok((await q(`select * from public.calendar_feed($1)`, [tok1])).length === 0, '재발급 뒤 이전 토큰 → 0행');
ok((await q(`select * from public.calendar_feed($1)`, [tok2])).length === 2, '새 토큰 → 2행');
await as(null);
ok((await q(`select token_hash from public.user_calendar_tokens`))[0].token_hash !== tok2, 'DB 에는 원문이 아니라 해시');

// ── 회원 B: A 의 것을 못 본다·못 고친다 ──
await as('authenticated', B);
ok((await q(`select * from public.user_favorites`)).length === 0, 'B: A 의 저장 안 보임');
ok((await q(`select * from public.user_races`)).length === 0, 'B: A 의 기록 안 보임');
ok((await q(`select * from public.user_alert_prefs`)).length === 0, 'B: A 의 알림 설정 안 보임');
await db.exec(`delete from public.user_favorites where user_id = '${A}'`);
await db.exec(`update public.user_races set finish_sec = 61 where user_id = '${A}'`);
await as(null);
ok(Number((await q(`select count(*) n from public.user_favorites where user_id = '${A}'`))[0].n) === 2, 'B: A 의 저장 지우기 → 0행 영향');
ok((await q(`select finish_sec from public.user_races where race_id = 'r-old'`))[0].finish_sec === 14400, 'B: A 의 기록 고치기 → 0행 영향');
await as('authenticated', B);
ok((await q(`select * from public.my_record_summary(2020)`))[0].year_count === 0, 'B: 요약은 본인 것만 (A 의 2020 기록 안 셈)');

// ── 개수 제한 ──
await as(null);
await db.exec(`insert into public.races (id, name_ko, name_en, city_ko, country_ko, country_code, region, race_date, entry_type, official_url)
  select 'x' || g, 'x', 'x', 'x', 'x', 'JP', '일본', '2030-01-01', 'fcfs', 'https://x' from generate_series(1, 501) g`);
await as('authenticated', B);
const many = (await q(`select count(*) n from public.merge_favorites((select array_agg('x' || g) from generate_series(1, 501) g))`))[0].n;
ok(Number(many) === 500, 'B: merge_favorites 는 500개까지만 (오류 없이)', String(many));
e = await err(`insert into public.user_favorites (race_id) values ('r-a')`);
ok(/500개까지/.test(e ?? ''), 'B: 501번째 저장 → 한국어 거절', e ?? '들어감');

// ── 0019 참가 횟수 (두 번 돌려도 같음) ──
await as(null);
const m19 = mig('0019_participation.sql');
e = await err(m19);
ok(e === null, '0019 1회차 실행', e);
e = await err(m19);
ok(e === null, '0019 2회차 실행 (다시 돌려도 같음)', e);
await as('authenticated', A);
const pr = async (id) => (await q(`select participation_count c, years y, last_year l from public.user_races where race_id = '${id}'`))[0];
let p = await pr('r-old');
ok(p.c === 1 && p.y === null && p.l === null, '0019: 기존 행은 횟수 1·해 없음', JSON.stringify(p));
await db.exec(`update public.user_races set years = '{2019,2022,2019,2024}', participation_count = 9 where race_id = 'r-old'`);
p = await pr('r-old');
ok(p.c === 3 && JSON.stringify(p.y) === '[2024,2022,2019]' && p.l === 2024, '0019: 해 목록 → 중복 빼고 최근 순, 횟수 3·마지막 2024 (보낸 횟수 무시)', JSON.stringify(p));
await db.exec(`update public.user_races set years = '{2020,null}' where race_id = 'r-old'`);
p = await pr('r-old');
ok(p.c === 1 && JSON.stringify(p.y) === '[2020]', '0019: 해 목록의 null 은 빠짐', JSON.stringify(p));
await db.exec(`update public.user_races set years = '{}', participation_count = 4, last_year = 2018 where race_id = 'r-old'`);
p = await pr('r-old');
ok(p.c === 4 && p.y === null && p.l === 2018, '0019: 빈 해 목록 → null, 횟수·마지막 해는 보낸 값', JSON.stringify(p));
e = await err(`update public.user_races set participation_count = 100 where race_id = 'r-old'`);
ok(/user_races_count_range/.test(e ?? ''), '0019: 횟수 100 거부', e ?? '바뀜');
e = await err(`update public.user_races set participation_count = 0 where race_id = 'r-old'`);
ok(/user_races_count_range/.test(e ?? ''), '0019: 횟수 0 거부', e ?? '바뀜');
e = await err(`update public.user_races set years = '{1800}' where race_id = 'r-old'`);
ok(/user_races_(years|last_year)_range/.test(e ?? ''), '0019: 1800년 거부', e ?? '바뀜');
e = await err(`update public.user_races set last_year = 2200 where race_id = 'r-old'`);
ok(/user_races_last_year_range/.test(e ?? ''), '0019: 마지막 해 2200 거부', e ?? '바뀜');
// member.ts 가 보내는 꼴 (새 칸 포함 upsert)
e = await err(`insert into public.user_races (race_id, status, distance, distance_km, finish_sec, participation_count, years, last_year)
  values ('r-old', 'finished', '풀', 42.195, 14000, 1, '{2022,2016}', 2022)
  on conflict (user_id, race_id) do update set race_id = excluded.race_id, status = excluded.status, distance = excluded.distance,
  distance_km = excluded.distance_km, finish_sec = excluded.finish_sec, participation_count = excluded.participation_count,
  years = excluded.years, last_year = excluded.last_year
  returning race_id, status, distance, distance_km, finish_sec, updated_at, participation_count, years, last_year`);
ok(e === null, '0019: 새 칸 포함 upsert', e);
p = await pr('r-old');
ok(p.c === 2 && p.l === 2022, '0019: upsert 뒤 횟수 2·마지막 2022', JSON.stringify(p));
// 예전 꼴 upsert(0019 전 화면)는 새 칸을 건드리지 않는다
e = await err(`insert into public.user_races (race_id, status, distance, distance_km, finish_sec) values ('r-old', 'finished', '풀', 42.195, 13900)
  on conflict (user_id, race_id) do update set race_id = excluded.race_id, status = excluded.status, distance = excluded.distance,
  distance_km = excluded.distance_km, finish_sec = excluded.finish_sec`);
p = await pr('r-old');
ok(e === null && p.c === 2 && JSON.stringify(p.y) === '[2022,2016]', '0019: 예전 꼴 upsert 는 횟수·해 그대로', `${e} ${JSON.stringify(p)}`);
let s19 = (await q(`select * from public.my_record_summary(2016)`))[0];
ok(s19.year_count === 1 && Number(s19.year_km) === 42.195, '0019: 요약 — 해 목록에 2016 이 있으면 2016 참가로 셈', JSON.stringify(s19));
s19 = (await q(`select * from public.my_record_summary(2020)`))[0];
ok(s19.year_count === 0, '0019: 요약 — 해 목록이 있으면 대회 날짜(2020)로는 안 셈', JSON.stringify(s19));
await db.exec(`update public.user_races set last_year = 2023 where race_id = 'r-a'`);
s19 = (await q(`select * from public.my_record_summary(2023)`))[0];
ok(s19.year_count === 1 && s19.best_full_sec === 13900, '0019: 요약 — 해 목록 없으면 마지막 해(2023)로, 최고 기록 그대로', JSON.stringify(s19));
await as('anon');
e = await err(`select years from public.user_races`);
ok(/permission denied/.test(e ?? ''), '0019: anon 새 칸 읽기 거부', e ?? '읽힘');
await as('authenticated', B);
ok((await q(`select * from public.user_races where years is not null`)).length === 0, '0019: B 는 A 의 해 목록 안 보임');
e = await err(`update public.user_races set participation_count = 5 where user_id = '${A}'`);
await as(null);
ok(e === null && (await q(`select participation_count c from public.user_races where race_id = 'r-old' and user_id = '${A}'`))[0].c === 2,
  '0019: B 가 A 의 횟수 고치기 → 0행 영향', e);

// ── 탈퇴: 새 표 모두 cascade ──
await as('authenticated', A);
e = await err(`select public.delete_my_account()`);
ok(e === null, 'A: delete_my_account 실행', e);
await as(null);
for (const t of ['user_favorites', 'user_races', 'user_alert_prefs', 'user_calendar_tokens']) {
  const n = Number((await q(`select count(*) n from public.${t} where user_id = '${A}'`))[0].n);
  ok(n === 0, `탈퇴 → ${t} 에서 A 행 삭제`, `${n}행 남음`);
}
ok(Number((await q(`select count(*) n from public.alert_subscriptions where email = 'a@x.com'`))[0].n) === 0, '탈퇴 → 같은 이메일 알림 삭제 (0011 그대로)');

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
