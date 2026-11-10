-- 0018: 휴대폰 알림(웹 푸시) 구독 — 기기별 구독 저장 + 발송기가 받을 대상을 읽는 자동화 함수
--
-- ※ push 브랜치에서 쓰기만 했다. 실행은 Cowork 가 한다(SQL 편집기에서 파일 전체를 한 번에).
-- ※ begin … commit 한 트랜잭션 — 중간에 실패하면 아무것도 안 바뀐다. 두 번 돌려도 같은 결과
--   (create table if not exists / create or replace / drop policy if exists 후 다시 만들기).
-- ※ 0013 까지 실행된 DB 위에서 돈다 ([0] 사전 점검).
--
-- 만드는 것
--   표   push_subscriptions   기기(브라우저)마다 한 줄. endpoint 는 푸시 서비스 주소(기기마다 다름, unique),
--                             p256dh·auth 는 그 기기의 암호화 공개키·비밀(base64url). 본인만 읽기·지우기.
--                             넣기·고치기는 push_subscribe() 로만 (같은 기기를 다른 계정이 쓰면 그 계정으로 옮겨야 해서).
--   함수 push_subscribe(endpoint, p256dh, auth, user_agent, lang)   로그인 회원이 이 기기를 등록 (있으면 갱신)
--        automation_push_targets(p_key, p_user_ids, p_emails)      발송기용: 받을 사람들의 기기 목록
--        automation_push_remove(p_key, p_endpoints)                발송기용: 푸시 서비스가 410/404 로 답한 기기 지우기
--   자동화 함수는 메일 쪽(automation_due_alerts)과 같은 방식 — automation_ok('alerts', p_key) + service_role 만.
--   키 이름 'alerts' 의 해시가 automation_keys 에 있어야 한다(메일 쪽과 같은 키를 쓴다. 없으면 맨 아래 '키 넣기').
--   탈퇴: user_id → auth.users on delete cascade → delete_my_account()(0011) 는 고치지 않아도 같이 지워진다.
--
-- 실행 뒤 확인 (Cowork):
--   select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename = 'push_subscriptions';
--   select proname from pg_proc where pronamespace = 'public'::regnamespace and prosrc like '%0018:%';  -- 3개
--
-- 되돌리기: 파일 맨 아래 주석.

begin;

-- ── [0] 사전 점검 ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('auth.users') is null
     or to_regclass('public.automation_keys') is null
     or to_regprocedure('public.automation_ok(text,text)') is null
     or to_regprocedure('public.rate_take(text,integer,integer)') is null
     or to_regprocedure('public.force_server_time()') is null
     or to_regclass('public.user_alert_prefs') is null then
    raise exception '0018 중단: auth.users / automation_keys / automation_ok / rate_take / force_server_time / user_alert_prefs 중 없는 것이 있습니다 (0013 먼저).';
  end if;
end $$;

-- ── 표 ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  -- P-256 공개키(비압축 65바이트 → base64url 87자 안팎), auth 비밀(16바이트 → 22자 안팎)
  p256dh     text not null check (p256dh ~ '^[A-Za-z0-9_-]+=*$' and char_length(p256dh) between 80 and 100),
  auth       text not null check (auth ~ '^[A-Za-z0-9_-]+=*$' and char_length(auth) between 16 and 32),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  lang       text not null default 'ko' check (lang in ('ko', 'en')),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon, authenticated;
-- 본인 기기 목록(어느 기기인지 보여 줄 칸만) 읽기·지우기. 넣기·고치기 권한은 없다 → push_subscribe() 로만.
grant select (id, endpoint, user_agent, lang, created_at), delete on public.push_subscriptions to authenticated;

drop policy if exists push_subscriptions_select on public.push_subscriptions;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists push_subscriptions_delete on public.push_subscriptions;
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ── 기기 등록 (로그인 회원) ───────────────────────────────────────────────────────────────────
-- 같은 endpoint 가 이미 있으면(같은 기기 다시 켜기, 키가 바뀜, 이 기기에서 다른 계정으로 로그인) 지금 계정으로 갱신.
-- 한 사람 기기는 10개까지, 등록은 하루 30번까지.
create or replace function public.push_subscribe(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text, p_lang text)
returns uuid language plpgsql security definer set search_path = public as $$
-- 0018:
declare uid uuid := auth.uid(); n int; out_id uuid;
begin
  if uid is null then
    raise exception using message = '로그인한 회원만 휴대폰 알림을 켤 수 있습니다.', errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint !~ '^https://' or char_length(p_endpoint) > 1000
     or p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]+=*$' or char_length(p_p256dh) not between 80 and 100
     or p_auth is null or p_auth !~ '^[A-Za-z0-9_-]+=*$' or char_length(p_auth) not between 16 and 32 then
    raise exception '알림 구독 정보가 올바르지 않습니다.';
  end if;
  if not public.rate_take('push', 1, 30) then
    raise exception '휴대폰 알림 설정은 하루 30번까지 바꿀 수 있습니다. 내일 다시 시도해 주세요.';
  end if;
  select count(*) into n from public.push_subscriptions where user_id = uid and endpoint <> p_endpoint;
  if n >= 10 then
    raise exception '휴대폰 알림은 기기 10개까지 받을 수 있습니다. 쓰지 않는 기기를 먼저 해제해 주세요.';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, lang)
  values (uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400), case when p_lang = 'en' then 'en' else 'ko' end)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, lang = excluded.lang, created_at = now()
  returning id into out_id;
  return out_id;
end $$;
revoke execute on function public.push_subscribe(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.push_subscribe(text, text, text, text, text) to authenticated;

-- ── 발송기용 (worker/alerts/push.ts 를 부르는 쪽) ─────────────────────────────────────────────
-- 받을 사람(회원 id 또는 계정 이메일 — 메일 알림 목록은 이메일로 오므로 둘 다 받는다)의 기기 목록.
-- 이메일은 대소문자 무시, 메일 인증한 계정만. 한 번에 5000명까지.
create or replace function public.automation_push_targets(p_key text, p_user_ids uuid[] default null, p_emails text[] default null)
returns table (user_id uuid, email text, endpoint text, p256dh text, auth text, lang text)
language plpgsql security definer set search_path = public as $$
-- 0018:
begin
  if not public.automation_ok('alerts', p_key) then
    raise exception using message = 'invalid automation key', errcode = '42501';
  end if;
  return query
  select s.user_id, lower(u.email)::text, s.endpoint, s.p256dh, s.auth, s.lang
    from public.push_subscriptions s
    join auth.users u on u.id = s.user_id
   where u.email_confirmed_at is not null
     and (s.user_id = any(coalesce(p_user_ids[1:5000], '{}'))
          or lower(u.email) = any(select lower(e) from unnest(coalesce(p_emails[1:5000], '{}')) e))
   order by s.user_id, s.created_at;
end $$;

-- 푸시 서비스가 410 Gone / 404 Not Found 로 답한 기기(구독이 끝남)를 지운다. 지운 수를 돌려준다.
create or replace function public.automation_push_remove(p_key text, p_endpoints text[])
returns integer language plpgsql security definer set search_path = public as $$
-- 0018:
declare n int;
begin
  if not public.automation_ok('alerts', p_key) then
    raise exception using message = 'invalid automation key', errcode = '42501';
  end if;
  delete from public.push_subscriptions where endpoint = any(coalesce(p_endpoints[1:5000], '{}'));
  get diagnostics n = row_count;
  return n;
end $$;

-- 0012 [M5] 와 같게: 자동화 함수는 service_role 만 (키 확인은 함수 안에서 한 번 더)
revoke execute on function public.automation_push_targets(text, uuid[], text[]) from public, anon, authenticated;
grant execute on function public.automation_push_targets(text, uuid[], text[]) to service_role;
revoke execute on function public.automation_push_remove(text, text[]) from public, anon, authenticated;
grant execute on function public.automation_push_remove(text, text[]) to service_role;

-- ── 사후 점검: 탈퇴 cascade, RLS, anon 권한 없음, 회원이 직접 넣거나 키를 읽지 못함 ──────────────
do $$
declare bad text[] := '{}';
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.push_subscriptions'::regclass and c.contype = 'f'
                    and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'c') then
    bad := bad || 'push_subscriptions(탈퇴 cascade 없음)'::text;
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.push_subscriptions'::regclass) then
    bad := bad || 'push_subscriptions(RLS 꺼짐)'::text;
  end if;
  if has_table_privilege('anon', 'public.push_subscriptions', 'SELECT')
     or has_table_privilege('anon', 'public.push_subscriptions', 'INSERT') then
    bad := bad || 'push_subscriptions(anon 권한 있음)'::text;
  end if;
  if has_table_privilege('authenticated', 'public.push_subscriptions', 'INSERT')
     or has_table_privilege('authenticated', 'public.push_subscriptions', 'UPDATE')
     or has_column_privilege('authenticated', 'public.push_subscriptions', 'p256dh', 'SELECT')
     or has_column_privilege('authenticated', 'public.push_subscriptions', 'auth', 'SELECT') then
    bad := bad || 'push_subscriptions(authenticated 넣기·고치기·키 읽기 권한 있음)'::text;
  end if;
  if has_function_privilege('anon', 'public.automation_push_targets(text,uuid[],text[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.automation_push_targets(text,uuid[],text[])', 'EXECUTE') then
    bad := bad || 'automation_push_targets(anon·authenticated 실행 권한 있음)'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception '0018 중단: %', array_to_string(bad, ', ');
  end if;
end $$;

commit;


-- ── 키 넣기 (automation_keys 에 'alerts' 가 아직 없을 때만, 메일 쪽에서 이미 넣었으면 건너뛴다) ──────────
-- 키 원문은 여기 적지 않는다. 터미널에서 만든 값을 Cloudflare 비밀값(ALERTS_AUTOMATION_KEY)과 아래 둘에 같이 쓴다:
--   openssl rand -hex 32
-- insert into public.automation_keys (name, key_hash)
-- values ('alerts', encode(extensions.digest('<위 값>', 'sha256'), 'hex'))
-- on conflict (name) do update set key_hash = excluded.key_hash;

-- ── 되돌리기 (필요할 때만 — 기기 구독이 같이 지워진다) ───────────────────────────────────────────
-- drop function if exists public.automation_push_remove(text, text[]), public.automation_push_targets(text, uuid[], text[]),
--   public.push_subscribe(text, text, text, text, text);
-- drop table if exists public.push_subscriptions;
