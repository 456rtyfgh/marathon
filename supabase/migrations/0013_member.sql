-- 0013: 회원 전용 기능 — 저장한 대회 동기화, 내 일정 구독(개인 캘린더 주소), 저장한 대회 알림 설정, 내 기록(접수·참가),
--       일정 알림 신청은 로그인 회원만
--
-- ※ member 브랜치에서 쓰기만 했다. 실행은 Cowork 가 한다(SQL 편집기에서 파일 전체를 한 번에).
-- ※ begin … commit 한 트랜잭션 — 중간에 실패하면 아무것도 안 바뀐다. 두 번 돌려도 같은 결과
--   (create table if not exists / create or replace / drop policy·trigger if exists 후 다시 만들기).
-- ※ 0012 [1] 까지 실행된 DB 위에서 돈다. [0] 사전 점검이 subscribe_alert 라이브 본문이 0012 본문과 같은지
--   (공백 정규화 md5) 확인하고, 다르면 아무것도 바꾸지 않고 멈춘다. 바꾼 줄 위에는 "-- 0013:" 표시.
--
-- 만드는 것
--   표   user_favorites        저장한 대회 (본인만 읽기·넣기·지우기)
--        user_races            내 대회: status registered(접수했어요) | finished(참가했어요) + 종목·거리·완주 기록(선택)
--        user_alert_prefs      '저장한 대회 접수 시작·마감 알림 받기' 설정 (발송기는 아직 없음 — 설정만 저장)
--        user_calendar_tokens  개인 구독 주소 토큰의 sha256 (원문은 저장하지 않음, 표 권한 없음 — RPC 로만)
--   함수 merge_favorites · merge_registered        로그인 때 브라우저 저장분 합치기 (없는 대회 id 는 무시)
--        my_record_summary                         '내 정보' 요약 (올해 참가 수·총 거리, 풀·하프 최고 기록)
--        issue_calendar_token · calendar_token_info 구독 주소 발급(이전 주소 무효)·발급 시각
--        calendar_feed                             워커(/cal/u/<토큰>.ics)가 부르는 유일한 함수 (anon)
--   바꾸는 것 subscribe_alert — 0012 본문 + "로그인 안 했으면 거절" 한 조건
--   탈퇴: 새 표 4개 모두 auth.users on delete cascade → delete_my_account()(0011) 는 고치지 않아도 같이 지워진다
--         (맨 아래 사후 점검이 cascade·RLS·anon 권한 없음을 확인).
--
-- 실행 뒤 확인 (Cowork):
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename like 'user\_%';
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%0013:%';   -- subscribe_alert 등
--   select * from public.calendar_feed(repeat('0', 64));  -- 0행 (오류 없이)
--
-- 되돌리기: 파일 맨 아래 주석.

begin;

-- ── [0] 사전 점검 ─────────────────────────────────────────────────────────────────────────────
do $$
declare src text;
begin
  select p.prosrc into src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'subscribe_alert'
     and p.oid = to_regprocedure('public.subscribe_alert(text,text,integer[])');
  if src is null then
    raise exception '0013 중단: public.subscribe_alert(text, text, integer[]) 가 없습니다.';
  elsif src like '%0013:%' then
    null;  -- 이미 0013 이 들어간 본문 (재실행)
  elsif md5(btrim(regexp_replace(src, '\s+', ' ', 'g'))) <> '16eb2d516a294e1f767aa612bae54a14' then
    raise exception '0013 중단: subscribe_alert 라이브 본문이 0012 기준과 다릅니다. pg_get_functiondef 로 비교한 뒤 이 파일의 subscribe_alert 를 라이브 본문 기준으로 다시 고치세요.';
  end if;
  if to_regclass('public.races') is null
     or to_regclass('auth.users') is null
     or to_regprocedure('public.force_server_time()') is null
     or to_regprocedure('public.rate_take(text,integer,integer)') is null then
    raise exception '0013 중단: races / auth.users / force_server_time / rate_take 중 없는 것이 있습니다 (0012 먼저).';
  end if;
end $$;

-- ── 공통 트리거 함수 ──────────────────────────────────────────────────────────────────────────
-- 고칠 때 updated_at = now() (force_server_time 은 INSERT 때만 updated_at 을 정한다)
create or replace function public.member_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.member_touch() from public, anon, authenticated;

-- 한 사람이 가질 수 있는 행 수 제한 (tg_argv[0]). 같은 (user_id, race_id) 가 이미 있으면(upsert 의 갱신) 세지 않는다
create or replace function public.member_row_limit()
returns trigger language plpgsql set search_path = public as $$
declare lim int := tg_argv[0]::int; n int; same int;
begin
  execute format('select count(*), count(*) filter (where race_id = $2) from public.%I where user_id = $1', tg_table_name)
    into n, same using new.user_id, new.race_id;
  if same = 0 and n >= lim then
    raise exception using errcode = 'P0001', message = case tg_table_name
      when 'user_favorites' then format('저장한 대회는 %s개까지 둘 수 있습니다.', lim)
      else format('내 대회 기록은 %s개까지 둘 수 있습니다.', lim) end;
  end if;
  return new;
end $$;
revoke execute on function public.member_row_limit() from public, anon, authenticated;

-- ── 저장한 대회 ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.user_favorites (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  race_id    text not null references public.races(id) on delete cascade on update cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, race_id)
);
create index if not exists user_favorites_race_id_idx on public.user_favorites (race_id);
alter table public.user_favorites enable row level security;
revoke all on public.user_favorites from public, anon, authenticated;
grant select, delete on public.user_favorites to authenticated;
grant insert (race_id) on public.user_favorites to authenticated;

drop policy if exists user_favorites_select on public.user_favorites;
create policy user_favorites_select on public.user_favorites for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists user_favorites_insert on public.user_favorites;
create policy user_favorites_insert on public.user_favorites for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists user_favorites_delete on public.user_favorites;
create policy user_favorites_delete on public.user_favorites for delete to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists member_row_limit on public.user_favorites;
create trigger member_row_limit before insert on public.user_favorites
  for each row execute function public.member_row_limit('500');
drop trigger if exists zz_force_server_time on public.user_favorites;
create trigger zz_force_server_time before insert or update on public.user_favorites
  for each row execute function public.force_server_time();

-- ── 내 대회 (접수했어요 + 참가했어요·기록) ────────────────────────────────────────────────────
create table if not exists public.user_races (
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  race_id     text not null references public.races(id) on delete cascade on update cascade,
  status      text not null default 'registered' check (status in ('registered', 'finished')),
  distance    text check (distance is null or char_length(distance) between 1 and 20),          -- 고른 종목 이름 (races.distances 의 값)
  distance_km numeric(7,3) check (distance_km is null or (distance_km > 0 and distance_km <= 500)),
  finish_sec  integer check (finish_sec is null or finish_sec between 60 and 604800),          -- 완주 기록(초), 7일까지
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, race_id),
  constraint user_races_finish_only check (status = 'finished' or finish_sec is null)
);
create index if not exists user_races_race_id_idx on public.user_races (race_id);
alter table public.user_races enable row level security;
revoke all on public.user_races from public, anon, authenticated;
grant select, delete on public.user_races to authenticated;
grant insert (race_id, status, distance, distance_km, finish_sec) on public.user_races to authenticated;
grant update (race_id, status, distance, distance_km, finish_sec) on public.user_races to authenticated;

drop policy if exists user_races_select on public.user_races;
create policy user_races_select on public.user_races for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists user_races_insert on public.user_races;
create policy user_races_insert on public.user_races for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists user_races_update on public.user_races;
create policy user_races_update on public.user_races for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists user_races_delete on public.user_races;
create policy user_races_delete on public.user_races for delete to authenticated using ((select auth.uid()) = user_id);

drop trigger if exists member_row_limit on public.user_races;
create trigger member_row_limit before insert on public.user_races
  for each row execute function public.member_row_limit('1000');
drop trigger if exists member_touch on public.user_races;
create trigger member_touch before update on public.user_races
  for each row execute function public.member_touch();
drop trigger if exists zz_force_server_time on public.user_races;
create trigger zz_force_server_time before insert or update on public.user_races
  for each row execute function public.force_server_time();

-- ── 저장한 대회 알림 설정 ─────────────────────────────────────────────────────────────────────
-- 받을 주소는 저장하지 않는다 — 나중 발송기가 auth.users.email(인증된 것)을 그때 읽는다.
create table if not exists public.user_alert_prefs (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  saved_races boolean not null default false,
  days_before integer[] not null default '{14,3}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint user_alert_prefs_days check (cardinality(days_before) between 1 and 6 and days_before <@ array[1, 3, 7, 14, 30])
);
alter table public.user_alert_prefs enable row level security;
revoke all on public.user_alert_prefs from public, anon, authenticated;
grant select on public.user_alert_prefs to authenticated;
grant insert (saved_races, days_before) on public.user_alert_prefs to authenticated;
grant update (saved_races, days_before) on public.user_alert_prefs to authenticated;

drop policy if exists user_alert_prefs_select on public.user_alert_prefs;
create policy user_alert_prefs_select on public.user_alert_prefs for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists user_alert_prefs_insert on public.user_alert_prefs;
create policy user_alert_prefs_insert on public.user_alert_prefs for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists user_alert_prefs_update on public.user_alert_prefs;
create policy user_alert_prefs_update on public.user_alert_prefs for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop trigger if exists member_touch on public.user_alert_prefs;
create trigger member_touch before update on public.user_alert_prefs
  for each row execute function public.member_touch();
drop trigger if exists zz_force_server_time on public.user_alert_prefs;
create trigger zz_force_server_time before insert or update on public.user_alert_prefs
  for each row execute function public.force_server_time();

-- ── 개인 구독 주소 토큰 (sha256 hex 만, 표 권한 없음) ─────────────────────────────────────────
create table if not exists public.user_calendar_tokens (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.user_calendar_tokens enable row level security;  -- 정책 없음 = API 로는 0행
revoke all on public.user_calendar_tokens from public, anon, authenticated;

-- ── 함수 ──────────────────────────────────────────────────────────────────────────────────────
-- 로그인 때 브라우저에 저장해 둔 대회를 계정에 합친다. 없는 대회 id 는 무시, 500개까지. 내 저장 목록 전체를 돌려준다.
create or replace function public.merge_favorites(p_ids text[])
returns setof text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room int;
begin
  if uid is null then
    raise exception using message = '로그인이 필요합니다.', errcode = '42501';
  end if;
  select 500 - count(*) into room from public.user_favorites where user_id = uid;
  insert into public.user_favorites (user_id, race_id)
  select uid, r.id from public.races r
   where r.id = any(coalesce(p_ids[1:500], '{}'))
     and not exists (select 1 from public.user_favorites f where f.user_id = uid and f.race_id = r.id)
   order by r.id
   limit greatest(room, 0)
  on conflict do nothing;
  return query select f.race_id from public.user_favorites f where f.user_id = uid order by f.created_at, f.race_id;
end $$;
revoke execute on function public.merge_favorites(text[]) from public, anon, authenticated;
grant execute on function public.merge_favorites(text[]) to authenticated;

-- 브라우저의 '접수했어요' 를 계정에 합친다 (status = registered, 이미 있는 행은 그대로). 내 대회 전체를 돌려준다.
create or replace function public.merge_registered(p_ids text[])
returns setof public.user_races language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); room int;
begin
  if uid is null then
    raise exception using message = '로그인이 필요합니다.', errcode = '42501';
  end if;
  select 1000 - count(*) into room from public.user_races where user_id = uid;
  insert into public.user_races (user_id, race_id, status)
  select uid, r.id, 'registered' from public.races r
   where r.id = any(coalesce(p_ids[1:1000], '{}'))
     and not exists (select 1 from public.user_races x where x.user_id = uid and x.race_id = r.id)
   order by r.id
   limit greatest(room, 0)
  on conflict do nothing;
  return query select x.* from public.user_races x where x.user_id = uid order by x.created_at, x.race_id;
end $$;
revoke execute on function public.merge_registered(text[]) from public, anon, authenticated;
grant execute on function public.merge_registered(text[]) to authenticated;

-- '내 정보' 요약: p_year 에 열린 대회 중 참가(finished) 수·거리 합, 전 기간 풀·하프 최고 기록.
-- 호출자 권한(security invoker)으로 돌아 RLS 가 본인 행만 보여 준다.
create or replace function public.my_record_summary(p_year integer)
returns table (year_count integer, year_km numeric, best_full_sec integer, best_half_sec integer)
language sql stable set search_path = public as $$
  select
    (count(*) filter (where extract(year from r.race_date) = p_year))::int,
    coalesce(sum(x.distance_km) filter (where extract(year from r.race_date) = p_year), 0),
    min(x.finish_sec) filter (where x.distance_km between 42 and 42.5),
    min(x.finish_sec) filter (where x.distance_km between 21 and 21.2)
  from public.user_races x
  join public.races r on r.id = x.race_id
  where x.user_id = (select auth.uid()) and x.status = 'finished'
$$;
revoke execute on function public.my_record_summary(integer) from public, anon, authenticated;
grant execute on function public.my_record_summary(integer) to authenticated;

-- 구독 주소 새로 만들기: 원문(소문자 hex 64자)은 여기서 한 번만 돌려주고 DB 에는 sha256 만 남긴다.
-- 이미 있으면 덮어쓴다 = 이전 주소는 바로 멈춘다.
create or replace function public.issue_calendar_token()
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); tok text;
begin
  if uid is null then
    raise exception using message = '로그인이 필요합니다.', errcode = '42501';
  end if;
  if not public.rate_take('cal_token', 1, 20) then
    raise exception '구독 주소는 하루 20번까지 새로 만들 수 있습니다. 내일 다시 시도해 주세요.';
  end if;
  tok := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.user_calendar_tokens (user_id, token_hash, created_at, last_used_at)
  values (uid, encode(sha256(convert_to(tok, 'UTF8')), 'hex'), now(), null)
  on conflict (user_id) do update
    set token_hash = excluded.token_hash, created_at = excluded.created_at, last_used_at = null;
  return tok;
end $$;
revoke execute on function public.issue_calendar_token() from public, anon, authenticated;
grant execute on function public.issue_calendar_token() to authenticated;

-- 내 구독 주소를 만든 시각 (없으면 null)
create or replace function public.calendar_token_info()
returns timestamptz language sql stable security definer set search_path = public as $$
  select t.created_at from public.user_calendar_tokens t where t.user_id = (select auth.uid())
$$;
revoke execute on function public.calendar_token_info() from public, anon, authenticated;
grant execute on function public.calendar_token_info() to authenticated;

-- 워커 /cal/u/<토큰>.ics 가 부른다(anon). 형식이 틀리거나 없는 토큰이면 0행(오류 없이 — 토큰이 있는지 흘리지 않는다).
-- 맞으면 그 회원의 저장한 대회 id. 마지막 사용 시각은 1시간에 한 번만 고친다.
create or replace function public.calendar_feed(p_token text)
returns table (race_id text) language plpgsql security definer set search_path = public as $$
declare uid uuid; used timestamptz;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    return;
  end if;
  select t.user_id, t.last_used_at into uid, used
    from public.user_calendar_tokens t
   where t.token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
  if uid is null then
    return;
  end if;
  if used is null or used < now() - interval '1 hour' then
    update public.user_calendar_tokens t set last_used_at = now() where t.user_id = uid;
  end if;
  return query select f.race_id from public.user_favorites f where f.user_id = uid order by f.race_id;
end $$;
revoke execute on function public.calendar_feed(text) from public, anon, authenticated;
grant execute on function public.calendar_feed(text) to anon, authenticated;

-- ── 일정 알림 신청: 로그인 회원만 (0012 본문 + 맨 앞 한 조건) ────────────────────────────────────
create or replace function public.subscribe_alert(p_email text, p_race_id text, p_days integer[])
returns void language plpgsql security definer set search_path = public as $$
-- 0012: M2
declare em text := lower(btrim(p_email)); uid uuid := auth.uid(); my_email text; my_ok boolean := false;
begin
  -- 0013: 로그인한 회원만 신청할 수 있다
  if uid is null then
    raise exception using message = '로그인한 회원만 알림을 신청할 수 있습니다.', errcode = '42501';
  end if;
  if p_email is null or p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 254 then
    raise exception '올바른 이메일 주소가 아닙니다.';
  end if;
  if p_days is null or array_length(p_days,1) is null or array_length(p_days,1) > 6 then
    raise exception '알림 시점을 1~6개 선택해 주세요.';
  end if;
  if not exists (select 1 from public.races where id = p_race_id) then
    raise exception '존재하지 않는 대회입니다.';
  end if;
  -- 0012: M2 로그인한 회원은 자기 계정 이메일로만 신청
  if uid is not null then
    select lower(u.email), u.email_confirmed_at is not null into my_email, my_ok from auth.users u where u.id = uid;
    if my_email is distinct from em then
      raise exception using message = '로그인한 계정의 이메일로만 알림을 신청할 수 있습니다.', errcode = 'P0001';
    end if;
  end if;
  if not public.rate_take('alert', 1, 20) then
    raise exception '도배를 막기 위해 알림 신청은 하루 20건까지 받고 있습니다. 내일 다시 신청해 주세요.';
  end if;
  if (select count(*) from public.alert_subscriptions where email = em) >= 50 then
    raise exception '한 이메일로는 대회 50개까지 알림을 받을 수 있습니다.';
  end if;
  if coalesce(my_ok, false) then
    -- 0012: M2 메일 인증된 본인 계정 → 확인된 구독 (설정 바꾸기 허용)
    insert into public.alert_subscriptions (email, race_id, days_before, confirmed_at)
    values (em, p_race_id, p_days, now())
    on conflict (email, race_id) do update
      set days_before = excluded.days_before,
          confirmed_at = coalesce(public.alert_subscriptions.confirmed_at, excluded.confirmed_at),
          pending_since = null;
  else
    -- 0012: M2 비로그인 → '확인 전' 으로만 넣고, 이미 있는 구독은 건드리지 않는다(있는지도 알려 주지 않음)
    -- 0013: 이제 비로그인은 위에서 막히므로 여기는 '메일 인증 전 회원' 만 온다
    insert into public.alert_subscriptions (email, race_id, days_before, pending_since)
    values (em, p_race_id, p_days, now())
    on conflict (email, race_id) do nothing;
  end if;
  -- 0012: M2 확인 안 된 지 7일 지난 신청은 지운다 (rate_take 와 같은 1% 확률 청소)
  if random() < 0.01 then
    delete from public.alert_subscriptions where confirmed_at is null and pending_since < now() - interval '7 days';
  end if;
end $$;
-- 0013: 권한은 그대로 둔다(anon 이 부르면 위 한국어 문구로 거절 — 권한을 빼면 영어 'permission denied' 가 된다)
revoke execute on function public.subscribe_alert(text, text, integer[]) from public;
grant execute on function public.subscribe_alert(text, text, integer[]) to anon, authenticated;

-- ── 사후 점검: 새 표가 탈퇴 때 지워지는지(cascade), RLS 가 켜졌는지, anon 이 못 읽는지 ─────────────
do $$
declare t text; bad text[] := '{}';
begin
  foreach t in array array['user_favorites', 'user_races', 'user_alert_prefs', 'user_calendar_tokens'] loop
    if not exists (select 1 from pg_constraint c
                    where c.conrelid = ('public.' || t)::regclass and c.contype = 'f'
                      and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'c') then
      bad := bad || (t || '(탈퇴 cascade 없음)');
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = ('public.' || t)::regclass) then
      bad := bad || (t || '(RLS 꺼짐)');
    end if;
    if has_table_privilege('anon', 'public.' || t, 'SELECT') or has_table_privilege('anon', 'public.' || t, 'INSERT') then
      bad := bad || (t || '(anon 권한 있음)');
    end if;
  end loop;
  if has_table_privilege('authenticated', 'public.user_calendar_tokens', 'SELECT') then
    bad := bad || 'user_calendar_tokens(authenticated 읽기 권한 있음)'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception '0013 중단: %', array_to_string(bad, ', ');
  end if;
end $$;

commit;


-- ── 되돌리기 (필요할 때만) ───────────────────────────────────────────────────────────────────
-- subscribe_alert: 0012_security.sql 의 [M2] create or replace 블록을 다시 실행 (비로그인 신청이 다시 열린다)
-- 나머지 (회원 데이터가 같이 지워진다 — 필요하면 먼저 백업):
-- drop function if exists public.calendar_feed(text), public.calendar_token_info(), public.issue_calendar_token(),
--   public.my_record_summary(integer), public.merge_registered(text[]), public.merge_favorites(text[]);
-- drop table if exists public.user_calendar_tokens, public.user_alert_prefs, public.user_races, public.user_favorites;
-- drop function if exists public.member_row_limit(), public.member_touch();
