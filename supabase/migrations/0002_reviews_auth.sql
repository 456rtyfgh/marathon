-- 0002: 로그인(Supabase Auth) · 후기 · 외부 후기 링크 · 관리자 권한

/* ── 프로필 ────────────────────────────────────────────── */
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 2 and 16),
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_nickname_key on public.profiles (lower(nickname));

-- 가입 시 프로필 자동 생성 (닉네임은 user_metadata.nickname, 없으면 이메일 앞부분)
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  base text := coalesce(nullif(btrim(new.raw_user_meta_data->>'nickname'), ''), split_part(new.email, '@', 1));
  nick text := left(base, 16);
  n int := 0;
begin
  if char_length(nick) < 2 then nick := nick || '러너'; end if;
  while exists (select 1 from public.profiles p where lower(p.nickname) = lower(nick)) loop
    n := n + 1;
    nick := left(base, 12) || n::text;
  end loop;
  insert into public.profiles (id, nickname) values (new.id, nick)
  on conflict (id) do nothing;
  return new;
end $fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

/* ── 관리자 판별 ───────────────────────────────────────── */
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$fn$;

grant execute on function public.is_admin() to anon, authenticated;

/* ── 후기 ──────────────────────────────────────────────── */
create table if not exists public.reviews (
  id             uuid primary key default gen_random_uuid(),
  race_id        text not null references public.races(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  nickname       text not null,
  rating         smallint not null check (rating between 1 and 5),
  race_year      smallint check (race_year between 1990 and 2100),
  finish_time    text check (finish_time is null or char_length(finish_time) <= 12),
  body           text not null check (char_length(btrim(body)) between 10 and 3000),
  course_rating  smallint check (course_rating between 1 and 5),
  support_rating smallint check (support_rating between 1 and 5),
  value_rating   smallint check (value_rating between 1 and 5),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (race_id, user_id)
);

create index if not exists reviews_race_idx on public.reviews (race_id, created_at desc);

drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

/* ── 외부 후기 링크 (본문 없이 링크만) ─────────────────── */
create table if not exists public.external_reviews (
  id           uuid primary key default gen_random_uuid(),
  race_id      text not null references public.races(id) on delete cascade,
  title        text not null,
  source       text not null,
  url          text not null check (url ~ '^https?://'),
  author       text,
  published_at date,
  kind         text not null default 'blog' check (kind in ('blog','youtube','community','news','etc')),
  summary      text,
  created_at   timestamptz not null default now()
);

create index if not exists ext_reviews_race_idx on public.external_reviews (race_id);

/* ── 평점 집계 뷰 ──────────────────────────────────────── */
create or replace view public.race_ratings
with (security_invoker = on) as
  select race_id,
         round(avg(rating)::numeric, 2) as avg_rating,
         count(*)::int                  as review_count
  from public.reviews
  group by race_id;

grant select on public.race_ratings to anon, authenticated;

/* ── RLS ───────────────────────────────────────────────── */
alter table public.profiles         enable row level security;
alter table public.reviews          enable row level security;
alter table public.external_reviews enable row level security;

-- 프로필: 공개 읽기(닉네임 표시용), 본인만 닉네임 수정. is_admin 은 아래 트리거로 잠근다.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (true);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- 본인이 스스로 관리자가 되는 것을 막는다.
create or replace function public.guard_is_admin() returns trigger
language plpgsql security definer set search_path = public as $fn$
begin
  if new.is_admin is distinct from old.is_admin and not public.is_admin() then
    new.is_admin := old.is_admin;
  end if;
  return new;
end $fn$;

drop trigger if exists profiles_guard_admin on public.profiles;
create trigger profiles_guard_admin before update on public.profiles
  for each row execute function public.guard_is_admin();

-- 후기: 누구나 읽기, 로그인 사용자만 본인 명의로 작성/수정/삭제 (관리자는 삭제 가능)
drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select using (true);

drop policy if exists reviews_insert_own on public.reviews;
create policy reviews_insert_own on public.reviews for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists reviews_update_own on public.reviews;
create policy reviews_update_own on public.reviews for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists reviews_delete_own on public.reviews;
create policy reviews_delete_own on public.reviews for delete to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- 외부 후기 링크: 누구나 읽기, 관리자만 등록/수정/삭제
drop policy if exists ext_read on public.external_reviews;
create policy ext_read on public.external_reviews for select using (true);

drop policy if exists ext_write on public.external_reviews;
create policy ext_write on public.external_reviews for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

/* ── 대회·패키지·여행사·비용: 관리자만 쓰기 ────────────── */
drop policy if exists races_admin_write on public.races;
create policy races_admin_write on public.races for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists packages_admin_write on public.packages;
create policy packages_admin_write on public.packages for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists agencies_admin_write on public.agencies;
create policy agencies_admin_write on public.agencies for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists costs_admin_write on public.cost_baselines;
create policy costs_admin_write on public.cost_baselines for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

/* ── races.region 에 '한국' 허용 ───────────────────────── */
alter table public.races drop constraint if exists races_region_check;
alter table public.races add constraint races_region_check
  check (region in ('한국','일본','아시아','오세아니아','유럽','북미','기타'));
