-- 0015: 관리자 대회 수정 (.duo-data/adminedit.md)
--
-- 실행 (Cowork, SQL 편집기에서 순서대로):
--   [0] 진단 — 읽기만. 결과를 adminedit.md '확인 못 함' 칸에 붙여 주세요. (아무것도 바꾸지 않음)
--   [1] 관리자 수정 기록 — begin … commit 한 트랜잭션. 바로 실행해도 기존 동작은 그대로다.
--   [2] (선택) 자동화가 관리자 수정 칸을 덮지 않게 — 매일 갱신 작업(upsert.py·automation_upsert_race)이
--       관리자가 30일 안에 고친 칸을 그대로 두게 된다. 운영 방식을 정한 뒤에만 실행.
--   두 번 돌려도 같은 결과(create … if not exists / create or replace / drop … if exists).
--
-- 바꾸지 않는 것: races 의 정책(0010 races_admin_write_ins/_upd/_del)·칸 권한·is_admin()(0012) — 그대로 맞다
--   (scripts/admin-edit-sql-test.mjs 로 확인: 비로그인·일반 회원·메일 미인증 관리자는 막히고 인증 관리자는 저장됨).
--   races 표에 칸도 더하지 않는다 — 더하면 snapshot.mjs 가 그 칸까지 떠서 공개 /r/<id>.json 에 나간다.
--
-- 되돌리기: 파일 맨 아래 주석.


-- ── [0] 진단 (읽기만) ─────────────────────────────────────────────────────────────────────
-- (a) 관리자 계정이 서버에서도 관리자인가: is_admin 이 true 인데 email_confirmed_at 이 비어 있으면 0012 이후 저장이 막힌다
-- select a.email, u.id is not null as signed_up, u.email_confirmed_at, p.is_admin, u.last_sign_in_at,
--        u.raw_app_meta_data->>'provider' as provider
--   from public.admin_emails a
--   left join auth.users u on lower(u.email) = lower(a.email)
--   left join public.profiles p on p.id = u.id;
-- (b) races 쓰기 정책 (0010 이후: races_read + races_admin_write_ins/_upd/_del 이어야 함)
-- select policyname, cmd, roles, qual, with_check from pg_policies where schemaname = 'public' and tablename = 'races' order by policyname;
-- (c) races 표·칸 권한: authenticated 에 INSERT/UPDATE/DELETE 가 있어야 함 (anon 은 SELECT 만)
-- select grantee, privilege_type from information_schema.role_table_grants
--  where table_schema = 'public' and table_name = 'races' and grantee in ('anon', 'authenticated') order by 1, 2;
-- select grantee, privilege_type, count(*) from information_schema.column_privileges
--  where table_schema = 'public' and table_name = 'races' and grantee in ('anon', 'authenticated') group by 1, 2 order by 1, 2;
-- (d) races 트리거 (races_touch 만 있어야 함. zz_force_server_time 은 races 에 없음)
-- select tgname, pg_get_triggerdef(oid) from pg_trigger where tgrelid = 'public.races'::regclass and not tgisinternal;
-- (e) 자동화 함수의 지금 본문 — on conflict 에서 어떤 칸을 덮는지
-- select pg_get_functiondef('public.automation_upsert_race(text,jsonb)'::regprocedure);


-- ── [1] 관리자 수정 기록 ──────────────────────────────────────────────────────────────────
begin;

do $$
begin
  if to_regclass('public.races') is null or to_regprocedure('public.is_admin()') is null then
    raise exception '0015 중단: races 표나 is_admin() 이 없습니다 (0001~0012 먼저).';
  end if;
end $$;

-- 대회마다 관리자가 화면에서 고친 칸·시각·사람. races 와 따로 두어 공개 스냅샷(/d/·/r/)에 나가지 않는다.
create table if not exists public.race_admin_edits (
  race_id    text primary key references public.races(id) on delete cascade,
  fields     text[] not null default '{}',   -- 고친 칸 이름 (합집합)
  last_fields text[] not null default '{}',  -- 마지막 저장에서 고친 칸
  edited_at  timestamptz not null default now(),
  edited_by  uuid references auth.users(id) on delete set null
);
alter table public.race_admin_edits enable row level security;
revoke all on public.race_admin_edits from public, anon, authenticated;
grant select on public.race_admin_edits to authenticated;
drop policy if exists race_admin_edits_read on public.race_admin_edits;
create policy race_admin_edits_read on public.race_admin_edits for select to authenticated
  using ((select public.is_admin()));

-- 로그인한 관리자가 API 로 races 를 고치면(auth.uid() 가 있고 is_admin()) 바뀐 칸을 적는다.
-- 자동화(service_role·SECURITY DEFINER 함수)는 auth.uid() 가 없어 적지 않는다.
create or replace function public.log_race_admin_edit()
returns trigger language plpgsql security definer set search_path = public as $$
declare changed text[];
begin
  if auth.uid() is null or not public.is_admin() then return null; end if;
  select coalesce(array_agg(n.key order by n.key), '{}') into changed
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o using (key)
   where n.value is distinct from o.value and n.key not in ('updated_at', 'created_at');
  if cardinality(changed) = 0 then return null; end if;
  insert into public.race_admin_edits as e (race_id, fields, last_fields, edited_at, edited_by)
  values (new.id, changed, changed, now(), auth.uid())
  on conflict (race_id) do update
    set fields = (select array_agg(distinct f order by f) from unnest(e.fields || excluded.fields) f),
        last_fields = excluded.last_fields,
        edited_at = excluded.edited_at,
        edited_by = excluded.edited_by;
  return null;
end $$;
revoke execute on function public.log_race_admin_edit() from public, anon, authenticated;

drop trigger if exists races_log_admin_edit on public.races;
create trigger races_log_admin_edit after update on public.races
  for each row execute function public.log_race_admin_edit();

commit;
-- ── [1] 끝 ───────────────────────────────────────────────────────────────────────────────


-- ── [2] (선택) 자동화가 관리자 수정 칸을 덮지 않게 ─────────────────────────────────────────
-- 로그인한 사용자(API) 가 아닌 쓰기(auth.uid() 없음: 매일 갱신 작업·service_role·SQL 편집기)가 races 를 update 할 때,
-- 관리자가 30일 안에 고친 칸은 예전 값을 그대로 둔다. 자동화가 일부러 덮어야 하면 같은 트랜잭션에서
--   set local app.overwrite_admin_edits = 'on';
-- 을 먼저 실행한다. 지켜진 칸은 notice 로 알린다.
-- begin;
-- create or replace function public.keep_race_admin_edits()
-- returns trigger language plpgsql security definer set search_path = public as $$
-- declare keep text[]; kept jsonb;
-- begin
--   if auth.uid() is not null then return new; end if;
--   if coalesce(current_setting('app.overwrite_admin_edits', true), '') = 'on' then return new; end if;
--   select e.fields into keep from public.race_admin_edits e
--    where e.race_id = old.id and e.edited_at > now() - interval '30 days';
--   if keep is null then return new; end if;
--   select jsonb_object_agg(o.key, o.value) into kept
--     from jsonb_each(to_jsonb(old)) o
--     join jsonb_each(to_jsonb(new)) n using (key)
--    where o.key = any(keep) and o.value is distinct from n.value;
--   if kept is null then return new; end if;
--   raise notice '0015: % 의 관리자 수정 칸을 지킴: %', old.id, (select string_agg(k, ', ') from jsonb_object_keys(kept) k);
--   return jsonb_populate_record(new, kept);
-- end $$;
-- revoke execute on function public.keep_race_admin_edits() from public, anon, authenticated;
-- drop trigger if exists races_keep_admin_edits on public.races;
-- create trigger races_keep_admin_edits before update on public.races
--   for each row execute function public.keep_race_admin_edits();
-- commit;


-- ── 되돌리기 (필요할 때만) ────────────────────────────────────────────────────────────────
-- [2]: drop trigger if exists races_keep_admin_edits on public.races; drop function if exists public.keep_race_admin_edits();
-- [1]: drop trigger if exists races_log_admin_edit on public.races; drop function if exists public.log_race_admin_edit();
--      drop table if exists public.race_admin_edits;
