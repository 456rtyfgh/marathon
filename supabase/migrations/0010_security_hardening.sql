-- 1) search_path 고정
alter function public.touch_updated_at() set search_path = public;
alter function public.spam_reason(text) set search_path = public;

-- 2) 트리거 전용 함수는 API 로 못 부르게
revoke execute on function public.guard_is_admin() from public, anon, authenticated;
revoke execute on function public.guard_review() from public, anon, authenticated;
revoke execute on function public.guard_request() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 3) 테이블 권한 최소화 (RLS 위에 한 겹 더)
revoke insert, update, delete, truncate on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;
revoke all on public.admin_emails, public.automation_keys, public.alert_subscriptions, public.heartbeat, public.stat_daily from anon, authenticated;
revoke insert, update, delete on public.race_ratings from authenticated;

-- 4) 회원 글: 닉네임은 프로필 값으로 고정, 요청 상태는 사용자가 못 정함
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
revoke execute on function public.guard_review() from public, anon, authenticated;
revoke execute on function public.guard_request() from public, anon, authenticated;

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
    if char_length(btrim(coalesce(new.nickname, ''))) not between 2 and 16 then
      raise exception using message = '닉네임은 2자에서 16자 사이로 정해 주세요.', errcode = 'P0001';
    end if;
    r := public.spam_reason(new.nickname);
    if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
    if not old.is_admin and lower(new.nickname) ~ '(관리자|운영자|운영진|admin|마라톤\s*캘린더)' then
      raise exception using message = '운영진으로 오해할 수 있는 닉네임은 쓸 수 없습니다.', errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_is_admin() from public, anon, authenticated;

-- 5) 링크 컬럼은 http(s) 만
alter table public.races drop constraint if exists races_official_url_http;
alter table public.races add constraint races_official_url_http check (official_url ~* '^https?://') not valid;
alter table public.races validate constraint races_official_url_http;
alter table public.races drop constraint if exists races_source_url_http;
alter table public.races add constraint races_source_url_http check (source_url is null or source_url ~* '^https?://') not valid;
alter table public.packages drop constraint if exists packages_url_http;
alter table public.packages add constraint packages_url_http check (url is null or url ~* '^https?://') not valid;
alter table public.agencies drop constraint if exists agencies_url_http;
alter table public.agencies add constraint agencies_url_http check (url is null or url ~* '^https?://') not valid;
alter table public.race_requests drop constraint if exists race_requests_url_http;
alter table public.race_requests add constraint race_requests_url_http check (url is null or url = '' or url ~* '^https?://') not valid;

-- 6) IP 별 하루 한도 (IP 는 해시로만 보관, 이틀 지나면 지움)
create table if not exists public.rate_limits (
  bucket text not null,
  ip_hash text not null,
  day date not null default (now() at time zone 'Asia/Seoul')::date,
  n integer not null default 0,
  primary key (bucket, ip_hash, day)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.rate_take(p_bucket text, p_cost int, p_limit int)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare h jsonb; ip text; ih text; used int;
begin
  begin
    h := current_setting('request.headers', true)::jsonb;
  exception when others then h := null;
  end;
  ip := coalesce(h->>'cf-connecting-ip', split_part(h->>'x-forwarded-for', ',', 1), 'unknown');
  ih := encode(extensions.digest(ip || ':marathon-calendar', 'sha256'), 'hex');
  insert into public.rate_limits(bucket, ip_hash, n) values (p_bucket, ih, p_cost)
  on conflict (bucket, ip_hash, day) do update set n = public.rate_limits.n + excluded.n
  returning n into used;
  if random() < 0.01 then
    delete from public.rate_limits where day < (now() at time zone 'Asia/Seoul')::date - 2;
  end if;
  return used <= p_limit;
end $$;
revoke execute on function public.rate_take(text, int, int) from public, anon, authenticated;

create or replace function public.stat_hit(p_items jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
declare it jsonb; ev text; k text; c int; cnt int := 0; total int := 0;
begin
  if jsonb_typeof(p_items) <> 'array' then return 0; end if;
  select coalesce(sum(least(greatest(coalesce((x->>'n')::int, 1), 1), 20)), 0) into total
    from (select x from jsonb_array_elements(p_items) x limit 40) s;
  -- 한 IP 가 하루에 기록할 수 있는 양을 제한해 조회수 부풀리기를 막는다
  if not public.rate_take('stat', total, 1500) then return 0; end if;
  for it in select * from jsonb_array_elements(p_items) limit 40 loop
    ev := it->>'e';
    k := left(coalesce(lower(trim(it->>'k')), ''), 80);
    c := least(greatest(coalesce((it->>'n')::int, 1), 1), 20);
    if ev not in ('visit','source','search','search_empty','race_view','race_tab','official_click','agency_click',
                  'calendar_add','share','filter','place','map_open','sign_up','request','alert','review','favorite') then
      continue;
    end if;
    insert into public.stat_daily(day, event, key, n) values ((now() at time zone 'Asia/Seoul')::date, ev, k, c)
    on conflict (day, event, key) do update set n = public.stat_daily.n + excluded.n;
    cnt := cnt + 1;
  end loop;
  return cnt;
end $$;

create or replace function public.subscribe_alert(p_email text, p_race_id text, p_days integer[])
returns void language plpgsql security definer set search_path = public as $$
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
  if not public.rate_take('alert', 1, 20) then
    raise exception '알림 신청이 너무 많습니다. 내일 다시 시도해 주세요.';
  end if;
  if (select count(*) from public.alert_subscriptions where email = lower(btrim(p_email))) >= 50 then
    raise exception '한 이메일로는 대회 50개까지 알림을 받을 수 있습니다.';
  end if;
  insert into public.alert_subscriptions (email, race_id, days_before)
  values (lower(btrim(p_email)), p_race_id, p_days)
  on conflict (email, race_id) do update set days_before = excluded.days_before;
end $$;

-- 자동화 키 무차별 대입 방지: IP 당 하루 5000번
create or replace function public.automation_ok(p_name text, p_key text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare ok boolean;
begin
  if not public.rate_take('automation', 1, 5000) then return false; end if;
  select k.key_hash = encode(extensions.digest(p_key, 'sha256'), 'hex') into ok
  from public.automation_keys k where k.name = p_name;
  if coalesce(ok, false) then
    update public.automation_keys set last_used_at = now() where name = p_name;
  end if;
  return coalesce(ok, false);
end $$;
revoke execute on function public.automation_ok(text, text) from public, anon, authenticated;

-- 7) RLS: auth.uid() 를 한 번만 계산 + 관리자 쓰기 정책을 읽기와 분리
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists reviews_delete_own on public.reviews;
create policy reviews_delete_own on public.reviews for delete to authenticated using ((select auth.uid()) = user_id or (select public.is_admin()));
drop policy if exists reqs_insert on public.race_requests;
create policy reqs_insert on public.race_requests for insert to authenticated with check ((select auth.uid()) = requested_by);

do $$
declare t text; pol text;
begin
  for t, pol in select * from (values ('agencies','agencies_admin_write'),('packages','packages_admin_write'),('cost_baselines','costs_admin_write'),('external_reviews','ext_write'),('races','races_admin_write')) v(t, p) loop
    execute format('drop policy if exists %I on public.%I', pol, t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select public.is_admin()))', pol || '_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', pol || '_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select public.is_admin()))', pol || '_del', t);
  end loop;
end $$;

-- 8) 외래 키 인덱스
create index if not exists alert_subscriptions_race_id_idx on public.alert_subscriptions(race_id);
create index if not exists packages_agency_id_idx on public.packages(agency_id);
create index if not exists race_requests_requested_by_idx on public.race_requests(requested_by);
create index if not exists reviews_user_id_idx on public.reviews(user_id, created_at);

-- 닉네임 변경 (0011)
create unique index if not exists profiles_nickname_lower_uniq on public.profiles (lower(nickname));
create or replace function public.sync_nickname()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.nickname is distinct from old.nickname then
    update public.reviews set nickname = new.nickname where user_id = new.id;
    update public.race_requests set nickname = new.nickname where requested_by = new.id;
  end if;
  return null;
end $$;
revoke execute on function public.sync_nickname() from public, anon, authenticated;
drop trigger if exists profiles_sync_nickname on public.profiles;
create trigger profiles_sync_nickname after update of nickname on public.profiles for each row execute function public.sync_nickname();
