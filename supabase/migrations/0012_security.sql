-- 0012: 보안 점검(.duo-data/security-pentest-report.md, 2026-11-09) 반영
--
-- 실행 (Cowork, SQL 편집기에서 두 번에 나눠):
--   [1] 처음 ~ "[1] 끝" 까지 한 번에. begin … commit 한 트랜잭션이라 중간에 실패하면 아무것도 안 바뀐다.
--   [2] 맨 끝 [M5] 블록 — scripts/link_audit.py · ~/Documents/.tools/upsert.py · GitHub Actions 를
--       SUPABASE_SECRET_KEY 로 바꾸고 한 번씩 성공한 뒤에 실행 (먼저 돌리면 주간 갱신·링크 점검이 멈춘다).
--   두 번 돌려도 같은 결과(create or replace / if not exists / drop … if exists).
--
-- 기준 본문: 라이브 DB 함수를 직접 떠 오지 못해(이 작업 환경에 DB 읽기 권한 없음) 저장소 마이그레이션의 마지막 본문을
--   기준으로 필요한 줄만 바꿨다 — is_admin=0002, handle_new_user=0004, guard_review·guard_request·guard_is_admin·
--   stat_hit·subscribe_alert=0010. [0] 사전 점검이 라이브 본문과 이 기준이 같은지(공백 무시 md5) 확인하고,
--   다르면 아무것도 바꾸지 않고 멈춘다. 바꾼 줄 위에는 "-- 0012: 항목" 표시.
--
-- 되돌리기: 파일 맨 아래 주석.

begin;

-- ── [0] 사전 점검: 바꿀 함수의 라이브 본문 = 기준 본문인지, 부르는 함수·표가 있는지 ─────────────
do $$
declare
  want constant jsonb := jsonb_build_object(
    'is_admin',        '065dbcd2c17f6a4da4ba7cc6b24dad9e',
    'handle_new_user', 'd243814960eda3b38839c1f70d257ab2',
    'guard_review',    '94f948db109aa51f5d7d3b2ab9fdb4b1',
    'guard_request',   '5fcb99f6724aff24395b63526e7dbc14',
    'guard_is_admin',  'c2ea438561222f3aaee14a892a9dd684',
    'stat_hit',        'd9b55104137efab7cb9c5b61ae52ddc7',
    'subscribe_alert', '5161a07dd27ea6bcad540ac103f26ca6');
  fn text; src text; bad text[] := '{}';
begin
  for fn in select jsonb_object_keys(want) loop
    select p.prosrc into src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn;
    if src is null then
      bad := bad || (fn || '(없음)');
    elsif src like '%0012:%' then
      null;  -- 이미 0012 가 들어간 본문 (재실행)
    elsif md5(btrim(regexp_replace(src, '\s+', ' ', 'g'))) <> want->>fn then
      bad := bad || fn;
    end if;
  end loop;
  if cardinality(bad) > 0 then
    raise exception '0012 중단: 라이브 함수 본문이 기준(저장소 마이그레이션)과 다릅니다: %. pg_get_functiondef 로 비교한 뒤 이 파일의 해당 함수를 라이브 본문 기준으로 다시 고치세요.', array_to_string(bad, ', ');
  end if;
  if to_regprocedure('public.spam_reason(text)') is null
     or to_regprocedure('public.rate_take(text,integer,integer)') is null
     or to_regclass('public.stat_daily') is null
     or to_regclass('public.admin_emails') is null then
    raise exception '0012 중단: spam_reason / rate_take / stat_daily / admin_emails 중 없는 것이 있습니다.';
  end if;
end $$;

-- ── [H1·L3] 닉네임 규칙을 한 곳에 — 수정(UPDATE)·가입·INSERT 가 같은 규칙 ─────────────────────
-- 규칙(0010 guard_is_admin 과 같은 순서·문구): 2~16자 → spam_reason → 관리자 아니면 사칭 단어 금지.
-- 0012 에서 더한 것: 보이지 않는 글자(제어·폭 없는 공백·방향 문자) 금지, 사칭 검사는 공백·점·밑줄·하이픈을 빼고 본다('관 리 자').
create or replace function public.nickname_reason(p_nick text, p_admin boolean default false)
returns text language plpgsql stable set search_path = public as $$
declare r text;
begin
  if char_length(btrim(coalesce(p_nick, ''))) not between 2 and 16 then
    return '닉네임은 2자에서 16자 사이로 정해 주세요.';
  end if;
  if p_nick ~ '[[:cntrl:]­​-‏‪-‮⁠-⁤﻿]' then
    return '닉네임에 쓸 수 없는 글자가 들어 있습니다.';
  end if;
  r := public.spam_reason(p_nick);
  if r is not null then return r; end if;
  if not coalesce(p_admin, false)
     and regexp_replace(lower(p_nick), '[[:space:]._·-]+', '', 'g') ~ '(관리자|운영자|운영진|admin|마라톤캘린더)' then
    return '운영진으로 오해할 수 있는 닉네임은 쓸 수 없습니다.';
  end if;
  return null;
end $$;
revoke execute on function public.nickname_reason(text, boolean) from public, anon, authenticated;

-- 중립 기본 닉네임 '러너1234' (겹치면 다시 뽑고, 20번 넘게 겹치면 6자리)
create or replace function public.random_nickname()
returns text language plpgsql volatile security definer set search_path = public as $$
declare nick text; i int := 0;
begin
  loop
    i := i + 1;
    nick := '러너' || case when i <= 20 then lpad(floor(random() * 10000)::int::text, 4, '0')
                           else lpad(floor(random() * 1000000)::int::text, 6, '0') end;
    exit when not exists (select 1 from public.profiles p where lower(p.nickname) = lower(nick));
    if i >= 200 then raise exception using message = '닉네임을 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.', errcode = 'P0001'; end if;
  end loop;
  return nick;
end $$;
revoke execute on function public.random_nickname() from public, anon, authenticated;

-- 닉네임: 2~16자, 광고 금지, 관리자 사칭 금지
create or replace function public.guard_is_admin()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text;
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() then
    new.is_admin := old.is_admin;
  end if;
  if new.id is distinct from old.id then new.id := old.id; end if;
  if new.nickname is distinct from old.nickname then
    -- 0012: H1 규칙을 nickname_reason 하나로 (가입·INSERT 경로와 같게)
    r := public.nickname_reason(new.nickname, old.is_admin);
    if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_is_admin() from public, anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  -- 0012: L3 닉네임이 없을 때 이메일 앞부분을 쓰지 않는다
  base text := nullif(btrim(new.raw_user_meta_data->>'nickname'), '');
  nick text := left(base, 16);
  n int := 0;
  adm boolean := exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email));
begin
  -- 0012: H1 가입 때도 닉네임 규칙 검사. 없거나 걸리면 '러너####' (가입 자체는 막지 않는다)
  if nick is null or public.nickname_reason(nick, adm) is not null then
    nick := public.random_nickname();
  end if;
  while exists (select 1 from public.profiles p where lower(p.nickname) = lower(nick)) loop
    n := n + 1;
    nick := left(base, 12) || n::text;
  end loop;
  insert into public.profiles (id, nickname, is_admin) values (new.id, nick, adm)
  on conflict (id) do update set is_admin = excluded.is_admin;
  return new;
end $fn$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- profiles 에 어떤 경로로 INSERT 하든: 관리자 여부는 admin_emails 로만, 닉네임 규칙 위반은 '러너####', 작성 시각은 서버.
-- (handle_new_user 는 auth.users AFTER INSERT 트리거라 이 시점에 auth.users 행이 이미 있다)
create or replace function public.guard_profile_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_admin := exists (select 1 from auth.users u join public.admin_emails a on lower(a.email) = lower(u.email) where u.id = new.id);
  if public.nickname_reason(new.nickname, new.is_admin) is not null then
    new.nickname := public.random_nickname();
  end if;
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.guard_profile_insert() from public, anon, authenticated;
drop trigger if exists profiles_guard_insert on public.profiles;
create trigger profiles_guard_insert before insert on public.profiles
  for each row execute function public.guard_profile_insert();

-- ── [L 참고] 관리자 권한은 메일 인증을 마친 계정에만 ────────────────────────────────────────
-- (admin_emails 주소로 남이 먼저 가입만 해 둬도 인증 전엔 관리자 권한이 없다)
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $fn$
  -- 0012: 메일 인증(email_confirmed_at)을 마친 계정만. MFA(M4) 등록 뒤 아래 aal2 줄의 주석을 풀 것
  select coalesce((
    select p.is_admin
      from public.profiles p join auth.users u on u.id = p.id
     where p.id = auth.uid() and u.email_confirmed_at is not null
     -- and coalesce(auth.jwt()->>'aal', '') = 'aal2'
  ), false);
$fn$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ── [H2] 작성 시각은 서버가 정한다 ─────────────────────────────────────────────────────────
-- 회원 글: 닉네임은 프로필 값으로 고정, 요청 상태는 사용자가 못 정함
create or replace function public.guard_review()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare r text; n int; confirmed timestamptz; joined timestamptz;
begin
  new.nickname := coalesce((select nickname from public.profiles where id = new.user_id), new.nickname);
  r := coalesce(public.spam_reason(new.body), public.spam_reason(new.finish_time));
  if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
  if tg_op = 'UPDATE' and (new.user_id is distinct from old.user_id or new.race_id is distinct from old.race_id) then
    raise exception using message = '후기의 작성자나 대회는 바꿀 수 없습니다.', errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    -- 0012: H2 과거 날짜로 넣어 1분 1개·하루 5개 제한을 피하거나 날짜를 꾸미지 못하게
    new.created_at := now();
    new.updated_at := now();
    select email_confirmed_at, created_at into confirmed, joined from auth.users where id = new.user_id;
    if confirmed is null then
      raise exception using message = '도배·광고 계정을 막기 위해 메일 인증을 마친 회원만 후기를 남길 수 있게 했습니다.', errcode = 'P0001';
    end if;
    if joined > now() - interval '10 minutes' then
      raise exception using message = '도배·광고 계정을 막기 위해 가입하고 10분이 지나야 후기를 남길 수 있게 했습니다. 조금 뒤에 다시 올려 주세요.', errcode = 'P0001';
    end if;
    select count(*) into n from public.reviews where user_id = new.user_id and created_at > now() - interval '1 minute';
    if n >= 1 then
      raise exception using message = '도배를 막기 위해 후기는 1분에 1개까지 올릴 수 있게 제한하고 있습니다. 잠시 뒤 다시 올려 주세요.', errcode = 'P0001';
    end if;
    select count(*) into n from public.reviews where user_id = new.user_id and created_at > now() - interval '1 day';
    if n >= 5 then
      raise exception using message = '도배를 막기 위해 후기는 하루에 5개까지 남길 수 있게 제한하고 있습니다. 내일 다시 남겨 주세요.', errcode = 'P0001';
    end if;
    select count(*) into n from public.reviews where user_id = new.user_id and lower(btrim(body)) = lower(btrim(new.body));
    if n >= 1 then
      raise exception using message = '도배를 막기 위해 같은 내용의 후기는 한 번만 올릴 수 있게 했습니다.', errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_review() from public, anon, authenticated;

create or replace function public.guard_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare r text; n int;
begin
  r := coalesce(public.spam_reason(new.race_name), public.spam_reason(new.note), public.spam_reason(new.country));
  if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
  if new.url is not null and new.url !~* '^https?://[^\s<>"]+$' then
    raise exception using message = '홈페이지 주소는 http 또는 https 로 시작해야 합니다.', errcode = 'P0001';
  end if;
  if tg_op = 'INSERT' then
    -- 0012: H2 과거 날짜로 넣어 하루 5개 제한을 피하지 못하게
    new.created_at := now();
    new.status := 'pending';
    new.admin_note := null;
    new.nickname := coalesce((select nickname from public.profiles where id = new.requested_by), '러너');
    select count(*) into n from public.race_requests where requested_by = new.requested_by and created_at > now() - interval '1 day';
    if n >= 5 then
      raise exception using message = '도배를 막기 위해 대회 추가 요청은 하루에 5개까지 할 수 있게 제한하고 있습니다. 내일 다시 요청해 주세요.', errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_request() from public, anon, authenticated;

-- 사용자(anon·authenticated)가 쓰는 표 전부에 한 겹 더: INSERT 는 created_at(·updated_at) = now(), UPDATE 는 created_at 그대로.
-- SECURITY INVOKER 라 current_user 가 API 역할 그대로다 → service_role·관리 스크립트·SECURITY DEFINER 함수 안의 쓰기는 건드리지 않는다.
-- jsonb_populate_record 는 표에 없는 칸(updated_at)을 무시하므로 표마다 따로 만들 필요가 없다.
-- 이름을 zz_ 로 시작해 같은 표의 BEFORE 트리거 중 마지막에 돈다(트리거는 이름순).
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

drop trigger if exists zz_force_server_time on public.reviews;
create trigger zz_force_server_time before insert or update on public.reviews
  for each row execute function public.force_server_time();
drop trigger if exists zz_force_server_time on public.race_requests;
create trigger zz_force_server_time before insert or update on public.race_requests
  for each row execute function public.force_server_time();
drop trigger if exists zz_force_server_time on public.profiles;
create trigger zz_force_server_time before insert or update on public.profiles
  for each row execute function public.force_server_time();

-- 위 세 표 말고 관리자가 아닌 사람이 INSERT 할 수 있는 정책이 있으면 알린다(그 표도 같은 트리거가 필요한지 확인)
do $$
declare t record;
begin
  for t in select distinct tablename from pg_policies
            where schemaname = 'public' and cmd in ('INSERT', 'ALL')
              and tablename not in ('reviews', 'race_requests', 'profiles')
              and coalesce(with_check, qual, '') not like '%is_admin%'
  loop
    raise notice '0012 확인 필요: public.% 에 관리자 전용이 아닌 INSERT 정책이 있습니다 (created_at 강제 대상인지 확인)', t.tablename;
  end loop;
end $$;

-- ── [M2] 알림 신청: 로그인 회원은 본인 이메일만, 남의 구독 덮어쓰기 금지, 확인·수신거부 칸 ──────────
alter table public.alert_subscriptions add column if not exists confirmed_at timestamptz;      -- 이메일 주인이 확인한 시각 (발송은 이 값이 있는 행에만)
alter table public.alert_subscriptions add column if not exists pending_since timestamptz;     -- 0012 뒤 비로그인으로 들어온 '확인 전' 행 (7일 지나면 지움)
alter table public.alert_subscriptions add column if not exists unsubscribe_token uuid not null default gen_random_uuid();  -- 메일의 수신거부 링크용
create unique index if not exists alert_subscriptions_unsubscribe_token_key on public.alert_subscriptions (unsubscribe_token);

create or replace function public.subscribe_alert(p_email text, p_race_id text, p_days integer[])
returns void language plpgsql security definer set search_path = public as $$
-- 0012: M2
declare em text := lower(btrim(p_email)); uid uuid := auth.uid(); my_email text; my_ok boolean := false;
begin
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
    raise exception '알림 신청이 너무 많습니다. 내일 다시 시도해 주세요.';
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
    insert into public.alert_subscriptions (email, race_id, days_before, pending_since)
    values (em, p_race_id, p_days, now())
    on conflict (email, race_id) do nothing;
  end if;
  -- 0012: M2 확인 안 된 지 7일 지난 신청은 지운다 (rate_take 와 같은 1% 확률 청소)
  if random() < 0.01 then
    delete from public.alert_subscriptions where confirmed_at is null and pending_since < now() - interval '7 days';
  end if;
end $$;
revoke execute on function public.subscribe_alert(text, text, integer[]) from public;
grant execute on function public.subscribe_alert(text, text, integer[]) to anon, authenticated;

-- ── [M3] 통계: 키 검사 + IP 한도 낮추기 + 오래된 행 정리 ─────────────────────────────────────
create or replace function public.stat_hit(p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare it jsonb; ev text; k text; c int; cnt int := 0; total int := 0;
  today date := (now() at time zone 'Asia/Seoul')::date;  -- 0012: M3
begin
  if jsonb_typeof(p_items) <> 'array' then return 0; end if;
  select coalesce(sum(least(greatest(coalesce((x->>'n')::int, 1), 1), 20)), 0) into total
    from (select x from jsonb_array_elements(p_items) x limit 40) s;
  -- 한 IP 가 하루에 기록할 수 있는 양을 제한해 조회수 부풀리기를 막는다
  -- 0012: M3 하루 1500 → 400
  if not public.rate_take('stat', total, 400) then return 0; end if;
  for it in select * from jsonb_array_elements(p_items) limit 40 loop
    ev := it->>'e';
    k := left(coalesce(lower(trim(it->>'k')), ''), 80);
    c := least(greatest(coalesce((it->>'n')::int, 1), 1), 20);
    if ev not in ('visit','source','search','search_empty','race_view','race_tab','official_click','agency_click',
                  'calendar_add','share','filter','place','map_open','sign_up','request','alert','review','favorite') then
      continue;
    end if;
    -- 0012: M3 키 검사 (src/lib/analytics.ts 의 이벤트별 키). 안 맞는 항목은 조용히 건너뛴다
    k := btrim(regexp_replace(k, '[[:cntrl:]]', '', 'g'));
    if ev in ('race_view','official_click','calendar_add','share','favorite','alert','review','agency_click') then
      -- 대회 id(여행사 클릭은 여행사 id) 는 실제로 있는 것만, 같은 IP·같은 키는 하루 3번까지
      if ev = 'agency_click' then
        if not exists (select 1 from public.agencies where id = k) then continue; end if;
      elsif not exists (select 1 from public.races where id = k) then
        continue;
      end if;
      c := least(c, 3);
      if not public.rate_take('s:' || ev || ':' || k, c, 3) then continue; end if;
    else
      -- 자유 글·짧은 값: 40자, 태그·따옴표·주소 모양 금지, 검색어·요청은 광고 검사, 하루 새 키 500개까지
      k := left(k, 40);
      if k ~ '[<>"''`{}\\]' or k ~ '(https?:|www\.)' then continue; end if;
      if ev in ('search','search_empty','request') and k <> '' and public.spam_reason(k) is not null then continue; end if;
      if not exists (select 1 from public.stat_daily where day = today and event = ev and key = k)
         and (select count(*) from public.stat_daily where day = today and event = ev) >= 500 then
        continue;
      end if;
    end if;
    insert into public.stat_daily(day, event, key, n) values (today, ev, k, c)
    on conflict (day, event, key) do update set n = public.stat_daily.n + excluded.n;
    cnt := cnt + 1;
  end loop;
  -- 0012: M3 400일 지난 통계는 지운다 (관리 화면은 최대 366일까지 본다)
  if random() < 0.01 then
    delete from public.stat_daily where day < today - 400;
  end if;
  return cnt;
end $$;
revoke execute on function public.stat_hit(jsonb) from public;
grant execute on function public.stat_hit(jsonb) to anon, authenticated;

-- ── [L1] 프로필은 본인·관리자만 읽기 (다른 사람 프로필을 읽는 화면 없음 — 후기·요청은 복사된 nickname 칸을 씀) ──
-- to authenticated: anon 은 정책이 없어 0행 (anon 은 is_admin() 실행 권한이 없어, 정책에 넣으면 읽기 자체가 오류가 된다)
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));

-- ── [L2] 비로그인(anon)에게 글쓴이 UUID 를 보이지 않는다 (칸 단위 SELECT 권한) ────────────────
-- 로그인 회원(authenticated)은 그대로: '내 후기' 찾기와 후기 upsert(ON CONFLICT race_id,user_id)에 user_id 가 필요하다.
-- 주의: 앞으로 칸을 새로 만들면 anon 에게 따로 grant 해야 보인다.
do $$
declare t text; hide text; cols text;
begin
  for t, hide in select * from (values ('reviews', 'user_id'), ('race_requests', 'requested_by')) v(t, h) loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
      from information_schema.columns
     where table_schema = 'public' and table_name = t and column_name <> hide;
    execute format('revoke select on public.%I from anon', t);
    execute format('grant select (%s) on public.%I to anon', cols, t);
  end loop;
end $$;

-- ── 사후 점검: 프로필을 모두에게 보이는 다른 SELECT 정책이 남아 있으면 되돌린다 ───────────────
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles'
              and cmd in ('SELECT', 'ALL') and policyname <> 'profiles_read' and coalesce(qual, '') in ('true', '')) then
    raise exception '0012 중단: profiles 에 모두에게 열린 다른 SELECT 정책이 있습니다 (L1 이 효과가 없음).';
  end if;
end $$;

commit;
-- ── [1] 끝 ────────────────────────────────────────────────────────────────────────────────


-- ── [M5] 자동화 RPC 는 service_role 만 (호출자 전환 뒤 따로 실행) ─────────────────────────────
-- 함수 안의 자동화 키 확인(automation_ok)은 그대로 둔다 → service key 와 자동화 키가 둘 다 있어야 한다.
-- 대상: public.automation_* 중 automation_ok(내부용, 이미 회수됨) 을 뺀 전부 (upsert_race·upsert_cost·resolve_request·pending_requests …)
begin;
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname like 'automation\_%' and p.proname <> 'automation_ok' loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
    raise notice '0012 M5: % → service_role 만', f.sig;
  end loop;
end $$;
commit;


-- ── 되돌리기 (필요할 때만, 해당 부분만) ───────────────────────────────────────────────────────
-- M5:  위 do 블록에서 revoke/grant 를 바꿔 'grant execute … to anon, authenticated' 로.
-- L2:  grant select on public.reviews, public.race_requests to anon;
-- L1:  drop policy profiles_read on public.profiles; create policy profiles_read on public.profiles for select using (true);
-- H2:  drop trigger zz_force_server_time on public.reviews; (race_requests, profiles 도)
-- H1:  drop trigger profiles_guard_insert on public.profiles;
-- 함수 본문: 0002(is_admin)·0004(handle_new_user)·0010(나머지) 의 create or replace 를 다시 실행.
-- M2 의 새 칸(confirmed_at·pending_since·unsubscribe_token)은 지우지 않아도 기존 동작에 영향 없음.
