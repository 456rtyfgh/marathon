/**
 * 관리자 대회 수정 — races 쓰기 권한(RLS)과 0015 확인 (로컬 PGlite, 실제 DB 는 건드리지 않는다):
 *   npm i --no-save --prefix node_modules/.cache/pglite @electric-sql/pglite
 *   PGLITE_DIR=node_modules/.cache/pglite node scripts/admin-edit-sql-test.mjs
 * Supabase 흉내(auth 스키마·auth.uid()·anon/authenticated 역할·새 표 기본 권한)와 저장소 밖 객체 대역을 만든 뒤
 * 0001~0004·0010~0013 을 순서대로 돌리고(0014 는 races 와 무관해 뺀다), 운영에만 있는 races 칸을 더한 다음
 *   - 비로그인·일반 회원·메일 미인증 관리자: 막힘 / 메일 인증 관리자: 저장됨
 *   - 행 전체 upsert 가 그 사이 자동 갱신된 칸을 되돌리는지(예전 관리 화면) vs 바뀐 칸만 update
 *   - 0015 두 번 실행, 관리자 수정 기록, [2](선택) 자동화 덮어쓰기 막기
 * 를 본다. 역할 전환은 set role + request.jwt.claim.sub (PostgREST 와 같은 방식).
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
/** API 역할 흉내: role = 'anon' | 'authenticated' | null(관리 = 슈퍼유저, 자동화·SQL 편집기와 같은 자리) */
async function as(role, uid = '') {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  if (role) await db.exec(`set role ${role}`);
}

// ── Supabase 흉내 + 저장소 밖 객체 대역 ──
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  -- Supabase 처럼 public 의 새 표·함수는 API 역할에 기본으로 열린다 (0010 이 anon 쓰기를 거둔다)
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(), email text, email_confirmed_at timestamptz,
    raw_user_meta_data jsonb not null default '{}', raw_app_meta_data jsonb not null default '{}',
    created_at timestamptz not null default now(),
    last_sign_in_at timestamptz, confirmation_sent_at timestamptz, confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
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
  // 0012 의 [0] 은 라이브 본문 md5 와 비교한다 — 저장소 본문으로 만든 이 DB 와는 몇 개가 달라 뺀다 (member-sql-test 와 같음)
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
  // 운영 races 에만 있는 칸 (Cowork 가 따로 만듦 — 공개 REST 의 races 한 줄에서 확인한 칸 이름)
  if (f === '0001_init.sql') {
    await db.exec(`alter table public.races
      add column notes_en text, add column discipline text default 'road', add column elevation_gain integer,
      add column sold_out_on date, add column subregion text;`);
  }
}
ok(true, '0001~0004·0010~0013 실행');

// ── 준비: 대회 1개, 계정 3개 (관리자 주소 2개는 admin_emails 에) ──
await db.exec(`
  insert into public.admin_emails (email) values ('adm@x.com'), ('adm2@x.com') on conflict do nothing;
  insert into public.races (id, name_ko, name_en, city_ko, country_ko, country_code, region, race_date, entry_type,
                            official_url, notes_ko, entry_fee, entry_fee_currency, updated_at) values
   ('r-a', '가나 마라톤', 'Gana Marathon', '도쿄', '일본', 'JP', '일본', '2027-03-01', 'fcfs',
    'https://a.example', '처음 메모', 5000, 'JPY', now() - interval '1 day');
`);
const ADM = (await q(`insert into auth.users (email, email_confirmed_at) values ('adm@x.com', now()) returning id`))[0].id;
const ADM2 = (await q(`insert into auth.users (email, email_confirmed_at) values ('adm2@x.com', null) returning id`))[0].id;
const MEM = (await q(`insert into auth.users (email, email_confirmed_at) values ('m@x.com', now()) returning id`))[0].id;
const prof = Object.fromEntries((await q(`select id, is_admin from public.profiles`)).map((r) => [r.id, r.is_admin]));
ok(prof[ADM] === true && prof[ADM2] === true && prof[MEM] === false, '가입 트리거: 관리자 주소 두 계정은 profiles.is_admin = true (화면에 관리 메뉴가 뜬다)');

/** PGlite 는 date 칸을 Date(현지 자정)로 준다 */
const day = (d) => (d instanceof Date ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : String(d));
const row = async () => (await q(`select * from public.races where id = 'r-a'`))[0];
const before = await row();
let e;

// ── 비로그인 ──
await as('anon');
e = await err(`update public.races set entry_fee = 1 where id = 'r-a'`);
ok(/permission denied/.test(e ?? ''), '비로그인: races update 거부 (0010 anon 쓰기 권한 회수)', e ?? '바뀜');
ok((await q(`select count(*)::int n from public.races`))[0].n === 1, '비로그인: races 읽기는 됨 (races_read)');

// ── 일반 회원 ──
await as('authenticated', MEM);
let r = await q(`update public.races set entry_fee = 2 where id = 'r-a' returning id`);
ok(r.length === 0, '일반 회원: update 는 오류 없이 0행 (RLS races_admin_write_upd) → 화면은 PGRST116 로 알아챔');
e = await err(`insert into public.races (id, name_ko, name_en, city_ko, country_ko, country_code, region, race_date, entry_type, official_url)
               values ('r-x', 'x', 'x', '', '', 'JP', '일본', '2027-01-01', 'fcfs', 'https://x') on conflict (id) do update set name_ko = excluded.name_ko`);
ok(/row-level security/.test(e ?? ''), '일반 회원: upsert 는 42501 row-level security', e ?? '들어감');
ok((await q(`select public.is_admin() v`))[0].v === false, '일반 회원: is_admin() = false');

// ── 메일 미인증 관리자 (가설 c) ──
await as('authenticated', ADM2);
ok((await q(`select public.is_admin() v`))[0].v === false, '메일 미인증 관리자: profiles.is_admin 은 true 인데 서버 is_admin() = false (0012)');
r = await q(`update public.races set entry_fee = 3 where id = 'r-a' returning id`);
ok(r.length === 0, '메일 미인증 관리자: update 0행 (저장 안 됨, 오류도 없음)');
e = await err(`insert into public.races (id, name_ko, name_en, city_ko, country_ko, country_code, region, race_date, entry_type, official_url)
               values ('r-a', '가나 마라톤', 'Gana Marathon', '도쿄', '일본', 'JP', '일본', '2027-03-01', 'fcfs', 'https://a.example')
               on conflict (id) do update set name_ko = excluded.name_ko`);
ok(/row-level security/.test(e ?? ''), '메일 미인증 관리자: 예전 관리 화면의 행 전체 upsert → "new row violates row-level security policy"', e ?? '들어감');
ok((await row()).entry_fee == 5000, '여기까지 races 값 그대로');

// ── 메일 인증 관리자 ──
await as('authenticated', ADM);
ok((await q(`select public.is_admin() v`))[0].v === true, '인증 관리자: is_admin() = true');
r = await q(`update public.races set entry_fee = 6000, notes_en = 'new note' where id = 'r-a' returning *`);
ok(r.length === 1 && Number(r[0].entry_fee) === 6000 && r[0].notes_en === 'new note', '인증 관리자: 바뀐 칸만 update → 1행, 다시 읽은 값 반환');
ok(new Date(r[0].updated_at) > new Date(before.updated_at), '인증 관리자: updated_at 갱신 (races_touch)');
ok(r[0].notes_ko === '처음 메모' && r[0].official_url === 'https://a.example', '인증 관리자: 보내지 않은 칸은 그대로');
e = await err(`update public.races set official_url = '' where id = 'r-a'`);
ok(/races_official_url_http/.test(e ?? ''), "인증 관리자: official_url '' → 23514 check (races_official_url_http)", e ?? '들어감');
e = await err(`update public.races set source_url = 'www.a.com' where id = 'r-a'`);
ok(/races_source_url_http/.test(e ?? ''), "인증 관리자: source_url 'www.' → 23514 check", e ?? '들어감');

// ── 가설 d: 행 전체 upsert 가 그 사이 갱신된 칸을 되돌린다 ──
const opened = await row(); // 관리자가 폼을 연 순간 (AdminPanel 의 loadAllRaces 값)
await as(null); // 매일 갱신 작업(자동화)이 그 사이 메모·확인일을 고침
await db.exec(`update public.races set notes_ko = '자동 갱신 메모', last_verified = '2026-11-10' where id = 'r-a'`);
await as('authenticated', ADM); // 관리자가 참가비만 고쳐 저장 — 예전 화면은 연 시점 행 전체를 upsert
const cols = Object.keys(opened).filter((k) => k !== 'created_at' && k !== 'updated_at');
const vals = cols.map((k) => (k === 'entry_fee' ? 7000 : opened[k]));
await db.query(
  `insert into public.races (${cols.join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
   on conflict (id) do update set ${cols.filter((k) => k !== 'id').map((k) => `${k} = excluded.${k}`).join(', ')}`,
  vals,
);
let now = await row();
ok(Number(now.entry_fee) === 7000 && now.notes_ko === '처음 메모', '예전 방식(행 전체 upsert): 참가비는 저장되지만 자동 갱신된 메모가 연 시점 값으로 되돌아감 (재현)');
await as(null);
await db.exec(`update public.races set notes_ko = '자동 갱신 메모' where id = 'r-a'`);
await as('authenticated', ADM);
await q(`update public.races set entry_fee = 8000 where id = 'r-a' returning id`); // 새 방식: 바뀐 칸만
now = await row();
ok(Number(now.entry_fee) === 8000 && now.notes_ko === '자동 갱신 메모', '새 방식(바뀐 칸만 update): 다른 칸은 그대로');

// ── 0015 두 번 ──
await as(null);
const m15 = mig('0015_admin_edit.sql');
e = await err(m15);
ok(e === null, '0015 1회차 실행', e);
e = await err(m15);
ok(e === null, '0015 2회차 실행 (다시 돌려도 같음)', e);
// Supabase 기본 권한이 새 표에도 열렸는지와 상관없이 0015 의 revoke 가 먹는지
await as('anon');
e = await err(`select * from public.race_admin_edits`);
ok(/permission denied/.test(e ?? ''), '0015: 비로그인은 race_admin_edits 읽기 거부', e ?? '읽힘');
e = await err(`select public.log_race_admin_edit()`);
ok(e !== null, '0015: 비로그인은 log_race_admin_edit 실행 못 함', '실행됨');

// 인증 관리자가 고치면 기록, 자동화는 기록 안 함, 일반 회원은 못 읽음
await as('authenticated', ADM);
await q(`update public.races set notes_en = 'edited', field_size = 1000 where id = 'r-a' returning id`);
let log = await q(`select fields, last_fields, edited_by from public.race_admin_edits where race_id = 'r-a'`);
ok(log.length === 1 && log[0].fields.join(',') === 'field_size,notes_en' && log[0].edited_by === ADM, '0015: 관리자 저장 → 바뀐 칸 기록 (field_size, notes_en)', JSON.stringify(log));
await q(`update public.races set entry_fee = 9000 where id = 'r-a' returning id`);
log = await q(`select fields, last_fields from public.race_admin_edits where race_id = 'r-a'`);
ok(log[0].fields.join(',') === 'entry_fee,field_size,notes_en' && log[0].last_fields.join(',') === 'entry_fee', '0015: 다음 저장은 합집합 + 마지막 칸', JSON.stringify(log));
await q(`update public.races set entry_fee = 9000 where id = 'r-a' returning id`);
ok((await q(`select last_fields from public.race_admin_edits where race_id = 'r-a'`))[0].last_fields.join(',') === 'entry_fee', '0015: 값이 그대로인 저장은 기록을 바꾸지 않음');
await as('authenticated', MEM);
ok((await q(`select * from public.race_admin_edits`)).length === 0, '0015: 일반 회원은 기록 0행');
await as(null);
await db.exec(`update public.races set flight_hours = 2 where id = 'r-a'`);
log = await q(`select fields from public.race_admin_edits where race_id = 'r-a'`);
ok(!log[0].fields.includes('flight_hours'), '0015: 자동화(auth.uid 없음) 쓰기는 기록 안 함');
await as('authenticated', ADM2);
r = await q(`update public.races set entry_fee = 1 where id = 'r-a' returning id`);
ok(r.length === 0, '0015 뒤에도: 메일 미인증 관리자 update 0행 (정책 그대로)');

// ── 0015 [2] (선택 블록, 주석을 풀어 실행) ──
await as(null);
const b2 = m15.slice(m15.indexOf('-- begin;', m15.indexOf('[2] (선택)')), m15.indexOf('-- ── 되돌리기'));
const sql2 = b2.split('\n').map((l) => l.replace(/^-- ?/, '')).join('\n');
e = await err(sql2);
ok(e === null, '0015 [2] 실행', e);
e = await err(sql2);
ok(e === null, '0015 [2] 다시 실행', e);
await db.exec(`update public.races set entry_fee = 1, notes_en = 'auto', notes_ko = '자동 2', race_date = '2027-03-02' where id = 'r-a'`);
now = await row();
ok(Number(now.entry_fee) === 9000 && now.notes_en === 'edited' && now.notes_ko === '자동 2' && day(now.race_date) === '2027-03-02',
  '0015 [2]: 자동화는 관리자가 고친 칸(entry_fee·notes_en)을 못 덮고 나머지(notes_ko·race_date)는 고침', JSON.stringify({ fee: now.entry_fee, en: now.notes_en, ko: now.notes_ko, d: day(now.race_date) }));
await db.exec(`begin; set local app.overwrite_admin_edits = 'on'; update public.races set entry_fee = 2 where id = 'r-a'; commit;`);
ok(Number((await row()).entry_fee) === 2, "0015 [2]: set local app.overwrite_admin_edits = 'on' 이면 덮어씀");
await as('authenticated', ADM);
r = await q(`update public.races set entry_fee = 3 where id = 'r-a' returning entry_fee`);
ok(r.length === 1 && Number(r[0].entry_fee) === 3, '0015 [2]: 관리자 자신의 저장은 그대로 됨');
await as(null);
await db.exec(`update public.race_admin_edits set edited_at = now() - interval '31 days' where race_id = 'r-a'`);
await db.exec(`update public.races set entry_fee = 4 where id = 'r-a'`);
ok(Number((await row()).entry_fee) === 4, '0015 [2]: 30일 지난 관리자 수정은 자동화가 다시 고칠 수 있음');

// ── 되돌리기 주석이 실제로 돈다 ──
const undo = m15.slice(m15.indexOf('-- ── 되돌리기')).split('\n').filter((l) => /^-- (\[\d\]:)?\s*drop /.test(l))
  .map((l) => l.replace(/^-- (\[\d\]:)?\s*/, '')).join('\n');
e = await err(undo);
ok(e === null && (await q(`select to_regclass('public.race_admin_edits') t`))[0].t === null, '0015 되돌리기 주석 실행 → 표·트리거 없어짐', e);

console.log(`\n${pass} ok, ${fail} fail`);
process.exit(fail ? 1 : 0);
