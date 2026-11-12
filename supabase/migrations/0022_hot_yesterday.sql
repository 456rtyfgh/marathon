-- 0022: 첫 화면 '많이 본 대회' — 7일 가중 점수(hot) 대신 어제(서울 날짜) 대회 상세 조회 수. 반환 모양은 그대로.
create or replace function public.race_public_stats()
 returns table(race_id text, views bigint, saves bigint, hot bigint, avg_rating numeric, review_count integer)
 language sql stable security definer set search_path to 'public'
as $function$
  with s as (
    select key as race_id,
      coalesce(sum(n) filter (where event = 'race_view'), 0) as views,
      coalesce(sum(n) filter (where event in ('calendar_add', 'favorite')), 0) as saves,
      coalesce(sum(n) filter (where event = 'race_view' and day = (now() at time zone 'Asia/Seoul')::date - 1), 0) as hot
    from public.stat_daily
    where event in ('race_view','calendar_add','favorite') and key <> ''
    group by key
  )
  select coalesce(s.race_id, rt.race_id), coalesce(s.views, 0)::bigint, coalesce(s.saves, 0)::bigint, coalesce(s.hot, 0)::bigint,
         rt.avg_rating, coalesce(rt.review_count, 0)::int
  from s full join public.race_ratings rt on rt.race_id = s.race_id;
$function$;
