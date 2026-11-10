-- 0020: 관리 '자체 통계' 방문 0 문제 — admin_stats 결과가 API 최대 1000행에서 잘려 visit 줄이 빠졌다.
-- 이벤트마다 많은 순 상위 40개(이벤트 약 18종 × 40 + 일별 최대 270 < 1000) 키만 돌려주고, 일별(day:*) 줄과 합계용 줄이 먼저 오게 정렬한다.
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
    )
    select d.event, d.key, d.n from daily d
    union all
    select r.event, r.key, r.n from ranked r where r.rn <= 40;
end $function$;
