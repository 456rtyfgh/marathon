-- 해외마라톤 캘린더 — 초기 스키마
-- 적용: psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql

create extension if not exists pgcrypto;

-- ── 대회 ────────────────────────────────────────────────
create table if not exists public.races (
  id                text primary key,
  name_ko           text not null,
  name_en           text not null,
  city_ko           text not null,
  country_ko        text not null,
  country_code      text not null,
  region            text not null check (region in ('일본','아시아','오세아니아','유럽','북미','기타')),
  race_date         date not null,
  date_confidence   text not null default 'confirmed' check (date_confidence in ('confirmed','expected','tbc')),
  is_major          boolean not null default false,
  entry_type        text not null check (entry_type in ('lottery','fcfs','qualifying','tour_only','open')),
  entry_opens       date,
  entry_closes      date,
  entry_confidence  text not null default 'confirmed' check (entry_confidence in ('confirmed','expected','tbc')),
  entry_fee         numeric,
  entry_fee_currency text not null default 'USD',
  distances         text[] not null default '{}',
  field_size        integer,
  course            text check (course in ('평지','완만','언덕')),
  flight_hours      numeric,
  official_url      text not null,
  source_url        text,
  last_verified     date not null default current_date,
  notes_ko          text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists races_race_date_idx on public.races (race_date);
create index if not exists races_entry_closes_idx on public.races (entry_closes);
create index if not exists races_region_idx on public.races (region);

-- ── 여행사 / 패키지 ─────────────────────────────────────
create table if not exists public.agencies (
  id    text primary key,
  name  text not null,
  url   text not null,
  note  text
);

create table if not exists public.packages (
  id              text primary key,
  race_id         text not null references public.races(id) on delete cascade,
  agency_id       text not null references public.agencies(id) on delete cascade,
  title           text not null,
  nights          integer,
  price_solo_krw  bigint,
  price_group_krw bigint,
  group_min       integer,
  includes        text[] not null default '{}',
  url             text not null,
  updated_at      date
);

create index if not exists packages_race_idx on public.packages (race_id);

-- ── 비용 기준 (country_code 단위) ───────────────────────
create table if not exists public.cost_baselines (
  race_id          text primary key,  -- country_code 를 키로 사용
  flight_low_krw   bigint not null,
  flight_mid_krw   bigint not null,
  flight_high_krw  bigint not null,
  hotel_night_krw  bigint not null,
  daily_krw        bigint not null
);

-- ── D-day 알림 구독 ─────────────────────────────────────
create table if not exists public.alert_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  race_id     text not null references public.races(id) on delete cascade,
  days_before integer[] not null default '{14,3}',
  created_at  timestamptz not null default now(),
  unique (email, race_id)
);

-- ── RLS ─────────────────────────────────────────────────
alter table public.races              enable row level security;
alter table public.agencies           enable row level security;
alter table public.packages           enable row level security;
alter table public.cost_baselines     enable row level security;
alter table public.alert_subscriptions enable row level security;

-- 공개 읽기
drop policy if exists races_read on public.races;
create policy races_read on public.races for select using (true);

drop policy if exists agencies_read on public.agencies;
create policy agencies_read on public.agencies for select using (true);

drop policy if exists packages_read on public.packages;
create policy packages_read on public.packages for select using (true);

drop policy if exists costs_read on public.cost_baselines;
create policy costs_read on public.cost_baselines for select using (true);

-- 알림 구독: RLS 를 켠 채 정책을 하나도 두지 않아 anon 의 직접 접근(조회·삽입·수정)을
-- 전부 막고, 아래 SECURITY DEFINER 함수로만 등록/수정하게 한다 (구독자 이메일 보호).
drop policy if exists alerts_insert on public.alert_subscriptions;
drop policy if exists alerts_update on public.alert_subscriptions;

create or replace function public.subscribe_alert(p_email text, p_race_id text, p_days integer[])
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_email is null or position('@' in p_email) < 2 or length(p_email) > 254 then
    raise exception '올바른 이메일 주소가 아닙니다.';
  end if;
  if p_days is null or array_length(p_days,1) is null or array_length(p_days,1) > 6 then
    raise exception '알림 시점을 1~6개 선택해 주세요.';
  end if;
  if not exists (select 1 from public.races where id = p_race_id) then
    raise exception '존재하지 않는 대회입니다.';
  end if;
  insert into public.alert_subscriptions (email, race_id, days_before)
  values (lower(btrim(p_email)), p_race_id, p_days)
  on conflict (email, race_id) do update set days_before = excluded.days_before;
end
$fn$;

revoke all on function public.subscribe_alert(text,text,integer[]) from public;
grant execute on function public.subscribe_alert(text,text,integer[]) to anon, authenticated;

-- updated_at 자동 갱신
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists races_touch on public.races;
create trigger races_touch before update on public.races
  for each row execute function public.touch_updated_at();
