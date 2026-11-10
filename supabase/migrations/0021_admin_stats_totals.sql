-- 0021: 관리 '자체 통계' 합계가 GA 보다 작게 나오던 문제 — 0020 이 이벤트마다 상위 40개 키만 돌려줘서
-- 화면 합계(대회 상세 조회·공식 홈페이지 이동 등)가 상위 40개 대회 합만 됐다. 이벤트별 전체 합계 줄(total:*)을 따로 돌려준다.
create or replace function public.admin_stats(p_days integer default 30)
returns table(event text, key text, n bigint)
language plpgsql stable security definer set search_path to 'public' as $function$
declare since date := (now() at time zone 'Asia/Seoul')::date - greatest(least(p_days, 366), 1);
begin
  if not public.is_admin() then raise exception '관리자만 볼 수 있습니다.'; end if;
  return query
    with agg as (
      select s.event, s.key, sum(s.n)::bigint as n from public.stat_daily s where s.day > since group by s.event, s.key
    ), ranked as (
      select a.*, row_number() over (partition by a.event order by a.n desc, a.key) as rn from agg a
    ), daily as (
      select 'day:' || s.event as event, s.day::text as key, sum(s.n)::bigint as n
        from public.stat_daily s where s.event in ('visit','race_view','search') and s.day > since group by s.event, s.day
    ), totals as (
      select 'total:' || a.event as event, ''::text as key, sum(a.n)::bigint as n from agg a group by a.event
    )
    select t.event, t.key, t.n from totals t
    union all
    select d.event, d.key, d.n from daily d
    union all
    select r.event, r.key, r.n from ranked r where r.rn <= 40;
end $function$;
