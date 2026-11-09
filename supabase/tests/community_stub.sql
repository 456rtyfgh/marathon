-- PGlite 시험용 바탕 (scripts/community-sql-test.mjs 가 0014 앞에 실행한다). 실제 DB 에는 실행하지 않는다.
-- Supabase 의 auth 스키마·역할·기본 권한과, 0014 가 기대는 기존 객체(0001·0002·0011·0012)만 줄여서 흉내 낸다.

-- ── 역할 (Supabase: anon·authenticated·service_role) ───────────────────────────────
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

-- Supabase 처럼 public 의 새 표·함수는 API 역할에 기본으로 전부 열린다 (0014 가 직접 닫아야 한다)
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

-- ── auth 스키마 ──────────────────────────────────────────────────────────────────
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
-- PostgREST 는 JWT 의 sub 를 request.jwt.claim.sub 로 넘긴다 (시험에서는 set 으로 바꾼다)
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- ── 0001: races, touch_updated_at ────────────────────────────────────────────────
create table public.races (
  id text primary key,
  name_ko text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.races enable row level security;
create policy races_read on public.races for select using (true);

create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

-- ── 라이브 DB 의 spam_reason (규칙은 src/lib/spam.ts 와 같게 옮김) ───────────────────
create or replace function public.spam_reason(p text) returns text language plpgsql immutable set search_path = public as $$
declare t text := lower(coalesce(p, ''));
begin
  if t = '' then return null; end if;
  if t ~ '(https?://|www\.|[a-z0-9-]+\.(com|net|kr|co|io|me|ly|link|xyz|top|shop|site|info|biz|cc|to)(/|\s|$))' then
    return '광고를 막기 위해 인터넷 주소는 넣을 수 없습니다.';
  end if;
  if t ~ '(open\.kakao|오픈\s*채팅|오픈톡|카톡\s*(id|아이디)|텔레\s*그램|telegram|t\.me|라인\s*(id|아이디)|카카오\s*(id|아이디))' then
    return '광고를 막기 위해 연락처·메신저 아이디는 넣을 수 없습니다.';
  end if;
  if t ~ '0\s*1\s*[016789][\s.-]*\d{3,4}[\s.-]*\d{4}' then
    return '개인정보 보호를 위해 전화번호는 넣을 수 없습니다.';
  end if;
  if t ~ '(카지노|바카라|토토|슬롯|먹튀|홀덤|배팅|베팅|도박|대출|급전|부업|재택\s*알바|수익\s*보장|고수익|리딩방|코인\s*추천|주식\s*추천|성인|조건\s*만남|출장\s*안마|19금|비아그라|casino|baccarat|betting|viagra|loan)' then
    return '광고·도박 관련 단어는 쓸 수 없습니다.';
  end if;
  if t ~ '(.)\1{9,}' then
    return '같은 글자를 너무 많이 반복했습니다.';
  end if;
  return null;
end $$;

-- ── 0002·0012: profiles, is_admin, 가입 시 프로필 ──────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 16),
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index profiles_nickname_lower_uniq on public.profiles (lower(nickname));

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((
    select p.is_admin
      from public.profiles p join auth.users u on u.id = p.id
     where p.id = auth.uid() and u.email_confirmed_at is not null
  ), false);
$fn$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;
create policy profiles_read on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function public.guard_is_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() then
    new.is_admin := old.is_admin;
  end if;
  if new.id is distinct from old.id then new.id := old.id; end if;
  return new;
end $$;
create trigger profiles_guard_admin before update on public.profiles
  for each row execute function public.guard_is_admin();

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, nickname, is_admin)
  values (new.id, coalesce(new.raw_user_meta_data->>'nickname', '러너' || left(new.id::text, 4)),
          coalesce((new.raw_user_meta_data->>'admin')::boolean, false));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 0012: 작성 시각은 서버 ──────────────────────────────────────────────────────────
create or replace function public.force_server_time()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new := jsonb_populate_record(new, jsonb_build_object('created_at', now(), 'updated_at', now()));
  else
    new := jsonb_populate_record(new, jsonb_build_object('created_at', old.created_at));
  end if;
  return new;
end $$;
revoke execute on function public.force_server_time() from public, anon, authenticated;

-- ── 0011: 탈퇴 (race_requests·alert_subscriptions 는 줄인 꼴) ─────────────────────────
create table public.race_requests (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid references auth.users(id) on delete set null,
  nickname text
);
create table public.alert_subscriptions (
  email text not null,
  race_id text not null,
  primary key (email, race_id)
);

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare uid uuid := auth.uid(); mail text;
begin
  if uid is null then
    raise exception using message = '로그인이 필요합니다.', errcode = '42501';
  end if;
  select lower(btrim(u.email)) into mail from auth.users u where u.id = uid;
  update public.race_requests set nickname = null, requested_by = null where requested_by = uid;
  if mail is not null then
    delete from public.alert_subscriptions where email = mail;
  end if;
  delete from auth.users where id = uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
