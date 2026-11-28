-- 0024: 자체 집계 이벤트 'search_filtered_empty' 허용.
--   검색어를 쳤는데 '지금 켜 둔 필터' 때문에 0개였던 경우 (전체에서는 결과가 있음). 전체에서도 0개면 기존 search_empty.
--   stat_hit 은 알려진 이벤트 이름만 기록하므로 이 이벤트를 넣지 않으면 조용히 버려진다.
-- 아직 적용하지 않은 파일이다 (이 브랜치는 DB 를 바꾸지 않는다). 운영 DB 의 stat_hit 정의가 0012 와 다른지
-- (대시보드에서 고친 적이 있는지) 확인한 뒤 적용할 것. 본문은 0012 의 stat_hit 에서 아래 두 곳만 바꿨다:
--   (1) 허용 이벤트 목록에 'search_filtered_empty'   (2) 검색어 광고 검사 대상에 'search_filtered_empty'
-- 한 번 더 돌려도 같다 (create or replace).

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
    -- 0024: search_filtered_empty 추가
    if ev not in ('visit','source','search','search_empty','search_filtered_empty','race_view','race_tab','official_click','agency_click',
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
      -- 0024: search_filtered_empty 도 검색어라 광고 검사
      if ev in ('search','search_empty','search_filtered_empty','request') and k <> '' and public.spam_reason(k) is not null then continue; end if;
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
