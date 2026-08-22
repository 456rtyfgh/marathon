-- 0003: 대회 추가 요청 + 주간 자동 갱신용 자동화 키

/* ── 사용자가 "이 대회 넣어주세요" 요청 ────────────────── */
create table if not exists public.race_requests (
  id          uuid primary key default gen_random_uuid(),
  race_name   text not null check (char_length(btrim(race_name)) between 2 and 120),
  country     text,
  race_month  text,                     -- "2027-03" 같은 대략 시기 (모르면 비움)
  url         text,
  note        text check (note is null or char_length(note) <= 500),
  requested_by uuid references auth.users(id) on delete set null,
  nickname    text,
  status      text not null default 'pending' check (status in ('pending','added','rejected','duplicate')),
  admin_note  text,
  created_at  timestamptz not null default now()
);

create index if not exists race_requests_status_idx on public.race_requests (status, created_at desc);

alter table public.race_requests enable row level security;

-- 목록은 공개 (어떤 대회가 요청됐는지 서로 보고 중복 요청을 줄인다)
drop policy if exists reqs_read on public.race_requests;
create policy reqs_read on public.race_requests for select using (true);

-- 요청은 로그인 사용자만
drop policy if exists reqs_insert on public.race_requests;
create policy reqs_insert on public.race_requests for insert to authenticated
  with check (auth.uid() = requested_by);

-- 상태 변경·삭제는 관리자만
drop policy if exists reqs_admin on public.race_requests;
create policy reqs_admin on public.race_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists reqs_admin_del on public.race_requests;
create policy reqs_admin_del on public.race_requests for delete to authenticated
  using (public.is_admin());

/* ── 자동화 키 (주간 갱신 작업이 쓰는 비밀값의 해시만 저장) ── */
create table if not exists public.automation_keys (
  name        text primary key,
  key_hash    text not null,
  created_at  timestamptz not null default now(),
  last_used_at timestamptz
);

alter table public.automation_keys enable row level security;
-- 정책 없음 = anon/authenticated 모두 직접 접근 불가. 아래 함수로만 검증한다.

create or replace function public.automation_ok(p_name text, p_key text) returns boolean
language plpgsql security definer set search_path = public, extensions as $fn$
declare ok boolean;
begin
  select k.key_hash = encode(digest(p_key, 'sha256'), 'hex') into ok
  from public.automation_keys k where k.name = p_name;
  if coalesce(ok, false) then
    update public.automation_keys set last_used_at = now() where name = p_name;
  end if;
  return coalesce(ok, false);
end $fn$;

/* 주간 작업이 대회를 넣고 갱신할 때 쓰는 함수 */
create or replace function public.automation_upsert_race(p_key text, p_race jsonb)
returns text
language plpgsql security definer set search_path = public as $fn$
declare rid text := p_race->>'id';
begin
  if not public.automation_ok('weekly', p_key) then
    raise exception '자동화 키가 올바르지 않습니다.';
  end if;
  if rid is null or rid !~ '^[a-z0-9-]{2,40}$' then
    raise exception 'id 형식이 올바르지 않습니다: %', rid;
  end if;

  insert into public.races (
    id, name_ko, name_en, city_ko, country_ko, country_code, region, race_date,
    date_confidence, is_major, entry_type, entry_opens, entry_closes, entry_confidence,
    entry_fee, entry_fee_currency, distances, field_size, course, flight_hours,
    official_url, source_url, last_verified, notes_ko
  )
  select
    rid,
    p_race->>'name_ko', coalesce(p_race->>'name_en', p_race->>'name_ko'),
    coalesce(p_race->>'city_ko',''), coalesce(p_race->>'country_ko',''), coalesce(p_race->>'country_code',''),
    coalesce(p_race->>'region','기타'), (p_race->>'race_date')::date,
    coalesce(p_race->>'date_confidence','expected'), coalesce((p_race->>'is_major')::boolean,false),
    coalesce(p_race->>'entry_type','fcfs'),
    nullif(p_race->>'entry_opens','')::date, nullif(p_race->>'entry_closes','')::date,
    coalesce(p_race->>'entry_confidence','expected'),
    nullif(p_race->>'entry_fee','')::numeric, coalesce(p_race->>'entry_fee_currency','USD'),
    coalesce(array(select jsonb_array_elements_text(p_race->'distances')), '{}'::text[]),
    nullif(p_race->>'field_size','')::int, nullif(p_race->>'course',''),
    nullif(p_race->>'flight_hours','')::numeric,
    coalesce(p_race->>'official_url',''), nullif(p_race->>'source_url',''),
    coalesce(nullif(p_race->>'last_verified','')::date, current_date),
    nullif(p_race->>'notes_ko','')
  on conflict (id) do update set
    name_ko = excluded.name_ko, name_en = excluded.name_en,
    city_ko = excluded.city_ko, country_ko = excluded.country_ko,
    country_code = excluded.country_code, region = excluded.region,
    race_date = excluded.race_date, date_confidence = excluded.date_confidence,
    is_major = excluded.is_major, entry_type = excluded.entry_type,
    entry_opens = excluded.entry_opens, entry_closes = excluded.entry_closes,
    entry_confidence = excluded.entry_confidence,
    entry_fee = excluded.entry_fee, entry_fee_currency = excluded.entry_fee_currency,
    distances = excluded.distances, field_size = excluded.field_size,
    course = excluded.course, flight_hours = excluded.flight_hours,
    official_url = excluded.official_url, source_url = excluded.source_url,
    last_verified = excluded.last_verified, notes_ko = excluded.notes_ko;

  return rid;
end $fn$;

create or replace function public.automation_upsert_cost(p_key text, p_cost jsonb)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.automation_ok('weekly', p_key) then
    raise exception '자동화 키가 올바르지 않습니다.';
  end if;
  insert into public.cost_baselines (race_id, flight_low_krw, flight_mid_krw, flight_high_krw, hotel_night_krw, daily_krw)
  values (
    p_cost->>'race_id', (p_cost->>'flight_low_krw')::bigint, (p_cost->>'flight_mid_krw')::bigint,
    (p_cost->>'flight_high_krw')::bigint, (p_cost->>'hotel_night_krw')::bigint, (p_cost->>'daily_krw')::bigint
  )
  on conflict (race_id) do update set
    flight_low_krw = excluded.flight_low_krw, flight_mid_krw = excluded.flight_mid_krw,
    flight_high_krw = excluded.flight_high_krw, hotel_night_krw = excluded.hotel_night_krw,
    daily_krw = excluded.daily_krw;
end $fn$;

/* 주간 작업이 대기 중인 요청을 읽고 처리 상태를 바꾸는 함수 */
create or replace function public.automation_pending_requests(p_key text)
returns setof public.race_requests
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.automation_ok('weekly', p_key) then
    raise exception '자동화 키가 올바르지 않습니다.';
  end if;
  return query select * from public.race_requests where status = 'pending' order by created_at;
end $fn$;

create or replace function public.automation_resolve_request(p_key text, p_id uuid, p_status text, p_note text)
returns void
language plpgsql security definer set search_path = public as $fn$
begin
  if not public.automation_ok('weekly', p_key) then
    raise exception '자동화 키가 올바르지 않습니다.';
  end if;
  if p_status not in ('pending','added','rejected','duplicate') then
    raise exception '허용되지 않는 상태: %', p_status;
  end if;
  update public.race_requests set status = p_status, admin_note = p_note where id = p_id;
end $fn$;

revoke all on function public.automation_upsert_cost(text, jsonb) from public;
grant execute on function public.automation_upsert_cost(text, jsonb) to anon, authenticated;
revoke all on function public.automation_upsert_race(text, jsonb) from public;
revoke all on function public.automation_pending_requests(text) from public;
revoke all on function public.automation_resolve_request(text, uuid, text, text) from public;
grant execute on function public.automation_upsert_race(text, jsonb) to anon, authenticated;
grant execute on function public.automation_pending_requests(text) to anon, authenticated;
grant execute on function public.automation_resolve_request(text, uuid, text, text) to anon, authenticated;
