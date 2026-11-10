-- 0019: 내 대회(user_races)에 '몇 번 참가했는지' — 같은 대회를 여러 해 뛴 것을 한 줄로
--
-- ※ pastrace 브랜치에서 쓰기만 했다. 실행은 Cowork 가 한다(SQL 편집기에서 파일 전체를 한 번에).
-- ※ begin … commit 한 트랜잭션 — 중간에 실패하면 아무것도 안 바뀐다. 두 번 돌려도 같은 결과
--   (add column if not exists / drop constraint·trigger if exists 후 다시 만들기 / create or replace).
-- ※ 0013 이 실행된 DB 위에서 돈다([0] 사전 점검). 바꾼 줄 위에는 "-- 0019:" 표시.
--
-- 더하는 칸 (user_races)
--   participation_count smallint  1~99, 기본 1   이 대회에 참가한 횟수
--   years               smallint[] 선택          참가한 해 목록(1900~2100, 99개까지). 넣으면 DB 가 중복을 빼고 최근 순으로 정리하고
--                                                participation_count = 개수, last_year = 가장 최근 해로 맞춘다(트리거)
--   last_year           smallint   선택          마지막으로 참가한 해 (years 없이 횟수만 적을 때)
--   최고 기록·종목은 원래 칸(distance·distance_km·finish_sec) 그대로 — 여러 번 뛰었으면 '그 대회 최고 기록'으로 쓴다.
--
-- 권한: 새 칸 3개만 authenticated 에 insert·update 칸 권한을 더한다(0013 과 같은 칸 단위 grant).
--       RLS 정책(본인 행만)·탈퇴 cascade(auth.users on delete cascade)는 같은 표라 그대로 — 맨 아래 사후 점검이 다시 확인한다.
-- 바꾸는 함수: my_record_summary — '올해 참가' 를 대회 행 날짜 대신 참가한 해(years → last_year → 대회 날짜 순)로 센다.
--             반환 모양은 그대로(화면 코드 변경 없이 0019 전·후 모두 동작).
--
-- 실행 뒤 확인 (Cowork):
--   select column_name, data_type, column_default from information_schema.columns
--    where table_schema = 'public' and table_name = 'user_races' and column_name in ('participation_count', 'years', 'last_year');
--   select has_column_privilege('authenticated', 'public.user_races', 'years', 'UPDATE');   -- true
--   select has_column_privilege('anon', 'public.user_races', 'years', 'SELECT');            -- false
--
-- 되돌리기: 파일 맨 아래 주석.

begin;

-- ── [0] 사전 점검 ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if to_regclass('public.user_races') is null
     or to_regprocedure('public.my_record_summary(integer)') is null then
    raise exception '0019 중단: public.user_races / my_record_summary(integer) 가 없습니다 (0013 먼저).';
  end if;
end $$;

-- ── 칸 더하기 ─────────────────────────────────────────────────────────────────────────────────
alter table public.user_races add column if not exists participation_count smallint not null default 1;
alter table public.user_races add column if not exists years smallint[];
alter table public.user_races add column if not exists last_year smallint;

alter table public.user_races drop constraint if exists user_races_count_range;
alter table public.user_races add constraint user_races_count_range check (participation_count between 1 and 99);
alter table public.user_races drop constraint if exists user_races_years_range;
alter table public.user_races add constraint user_races_years_range check (
  years is null or (
    cardinality(years) between 1 and 99
    and array_position(years, null) is null          -- null 이 섞이면 아래 all() 이 null(=통과)이 되므로 따로 막는다
    and 1900 <= all(years) and 2100 >= all(years)
    and participation_count = cardinality(years)
  )
);
alter table public.user_races drop constraint if exists user_races_last_year_range;
alter table public.user_races add constraint user_races_last_year_range check (last_year is null or last_year between 1900 and 2100);

-- years 정리: 중복 빼고 최근 순, 빈 배열은 null. years 가 있으면 횟수·마지막 해를 거기에 맞춘다.
-- (check 는 트리거 뒤에 검사되므로 화면이 횟수를 다르게 보내도 여기서 맞춰진다)
create or replace function public.user_races_participation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.years is not null then
    new.years := (select array_agg(distinct y order by y desc) from unnest(new.years) y where y is not null);
  end if;
  if new.years is not null and cardinality(new.years) > 0 then
    new.participation_count := cardinality(new.years);
    new.last_year := new.years[1];
  else
    new.years := null;
  end if;
  return new;
end $$;
revoke execute on function public.user_races_participation() from public, anon, authenticated;

drop trigger if exists user_races_participation on public.user_races;
create trigger user_races_participation before insert or update on public.user_races
  for each row execute function public.user_races_participation();

-- ── 칸 권한 (0013 의 칸 목록 + 새 칸 3개) ───────────────────────────────────────────────────────
grant insert (race_id, status, distance, distance_km, finish_sec, participation_count, years, last_year) on public.user_races to authenticated;
grant update (race_id, status, distance, distance_km, finish_sec, participation_count, years, last_year) on public.user_races to authenticated;

-- ── 요약: 올해 참가를 참가한 해로 센다 ──────────────────────────────────────────────────────────
-- 0019: 대회 행은 끝나면 다음 회차 날짜로 넘어가므로 race_date 의 해만 보면 지난 회차 참가가 다음 해로 셈해진다.
--       years 가 있으면 그 안에 p_year 가 있는지, 없으면 last_year, 그것도 없으면 대회 날짜(0013 그대로).
create or replace function public.my_record_summary(p_year integer)
returns table (year_count integer, year_km numeric, best_full_sec integer, best_half_sec integer)
language sql stable set search_path = public as $$
  with x as (
    select u.distance_km, u.finish_sec,
           -- 0019:
           case when u.years is not null then p_year = any(u.years)
                when u.last_year is not null then u.last_year = p_year
                else extract(year from r.race_date) = p_year end as in_year
    from public.user_races u
    join public.races r on r.id = u.race_id
    where u.user_id = (select auth.uid()) and u.status = 'finished'
  )
  select
    (count(*) filter (where in_year))::int,
    coalesce(sum(distance_km) filter (where in_year), 0),
    min(finish_sec) filter (where distance_km between 42 and 42.5),
    min(finish_sec) filter (where distance_km between 21 and 21.2)
  from x
$$;
revoke execute on function public.my_record_summary(integer) from public, anon, authenticated;
grant execute on function public.my_record_summary(integer) to authenticated;

-- ── 사후 점검: 탈퇴 cascade · RLS · anon 권한 없음 · 새 칸 권한 ─────────────────────────────────
do $$
declare bad text[] := '{}';
begin
  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.user_races'::regclass and c.contype = 'f'
                    and c.confrelid = 'auth.users'::regclass and c.confdeltype = 'c') then
    bad := bad || 'user_races(탈퇴 cascade 없음)'::text;
  end if;
  if not (select c.relrowsecurity from pg_class c where c.oid = 'public.user_races'::regclass) then
    bad := bad || 'user_races(RLS 꺼짐)'::text;
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'user_races') < 4 then
    bad := bad || 'user_races(본인만 정책 4개가 아님)'::text;
  end if;
  if has_table_privilege('anon', 'public.user_races', 'SELECT') or has_table_privilege('anon', 'public.user_races', 'INSERT')
     or has_column_privilege('anon', 'public.user_races', 'years', 'SELECT') then
    bad := bad || 'user_races(anon 권한 있음)'::text;
  end if;
  if not (has_column_privilege('authenticated', 'public.user_races', 'participation_count', 'INSERT')
          and has_column_privilege('authenticated', 'public.user_races', 'years', 'UPDATE')
          and has_column_privilege('authenticated', 'public.user_races', 'last_year', 'UPDATE')) then
    bad := bad || 'user_races(새 칸 권한 없음)'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception '0019 중단: %', array_to_string(bad, ', ');
  end if;
end $$;

commit;


-- ── 되돌리기 (필요할 때만 — 참가 횟수·해 기록이 지워진다) ────────────────────────────────────────
-- my_record_summary: 0013_member.sql 의 create or replace function public.my_record_summary 블록을 다시 실행
-- drop trigger if exists user_races_participation on public.user_races;
-- drop function if exists public.user_races_participation();
-- alter table public.user_races drop column if exists years, drop column if exists last_year, drop column if exists participation_count;
-- (칸을 지우면 그 칸의 grant 도 같이 없어진다)
