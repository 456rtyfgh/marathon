/*
  0016 러닝 이벤트 — races.discipline 에 'event' 허용 (브랜드 기록 측정·선발전 같은 행사)

  · races.discipline 칸은 마이그레이션 파일 밖(대시보드)에서 생겨서 저장소에 정의가 없다.
    그래서 칸 종류를 보고 갈래를 탄다:
      - enum 이면 'event' 값을 덧붙인다
      - text 면 discipline 을 건드리는 check 제약을 모두 지우고
        (road·trail·event 만 허용) 제약 하나로 다시 건다. null 은 그대로 허용(로드로 본다)
  · 기존 행은 바꾸지 않는다.
  · automation_upsert_race 는 다시 만들지 않는다. 지금 DB 에 있는 함수가 discipline 을
    p_race 에서 그대로 넣는다면 손댈 게 없다. 넣지 않는다면 아래 '확인' 쿼리로 보고
    Cowork 가 따로 고친다(.duo-data/event.md 참고).
  · 여러 번 실행해도 같다.
*/
do $mig$
declare
  typ   regtype;
  con   record;
begin
  select a.atttypid::regtype into typ
  from pg_attribute a
  where a.attrelid = 'public.races'::regclass and a.attname = 'discipline' and not a.attisdropped;

  if typ is null then
    -- 칸이 없으면 만든다 (없을 리 없지만 새 환경 대비)
    alter table public.races add column discipline text not null default 'road';
    typ := 'text'::regtype;
  end if;

  if exists (select 1 from pg_type t where t.oid = typ::oid and t.typtype = 'e') then
    execute format('alter type %s add value if not exists %L', typ, 'event');
  else
    for con in
      select c.conname
      from pg_constraint c
      where c.conrelid = 'public.races'::regclass
        and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%discipline%'
    loop
      execute format('alter table public.races drop constraint %I', con.conname);
    end loop;
    alter table public.races
      add constraint races_discipline_check
      check (discipline is null or discipline in ('road', 'trail', 'event'));
  end if;
end $mig$;

/*
  확인 (실행 뒤):
    select pg_get_constraintdef(oid) from pg_constraint
      where conrelid = 'public.races'::regclass and conname = 'races_discipline_check';
    select position('discipline' in pg_get_functiondef('public.automation_upsert_race(text, jsonb)'::regprocedure)) > 0
      as upsert_has_discipline;
    select discipline, count(*) from public.races group by 1;
*/
