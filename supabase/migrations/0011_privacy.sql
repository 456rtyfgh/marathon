-- 0011: 개인정보 — 회원 탈퇴 (화면: 내 정보 → 회원 탈퇴 → supabase.rpc('delete_my_account'))
--
-- ※ 이 파일은 privacy 브랜치에서 쓰기만 했다. 실행은 Cowork 가 한다(이 세션은 실행하지 않음).
-- ※ 0010 까지 실행된 DB 위에서 몇 번을 다시 돌려도 안전하다(create or replace, 권한 재지정만).
-- ※ 0001~0010 의 테이블·트리거 함수(handle_new_user, guard_review, guard_request, sync_nickname)는 고치지 않는다.
--
-- 탈퇴하면 즉시 파기하는 것 / 남는 것 (처리방침·탈퇴 화면 문구와 같은 내용)
--   · auth.users 행(이메일·암호화한 비밀번호·user_metadata 의 닉네임과 동의 기록) → 삭제
--   · profiles(닉네임)                         → auth.users 삭제 때 cascade 로 삭제
--   · reviews(내가 쓴 후기)                     → auth.users 삭제 때 cascade 로 삭제
--       (익명화는 하지 않는다: reviews.user_id 가 not null 이고 guard_review 가 user_id 변경을 막아서,
--        익명화하려면 0002·0010 을 고쳐야 한다 — main 의 보안 작업과 겹치므로 삭제로 처리)
--   · alert_subscriptions 중 이 계정 이메일과 같은 구독 → 삭제
--   · race_requests(대회 추가 요청·마감 제보)    → 글은 남기고 작성자(requested_by)·닉네임 사본을 비움
--
-- 실행 전 확인 (Cowork):
--   select tgname, tgtype from pg_trigger where tgrelid = 'public.race_requests'::regclass and not tgisinternal;
--   guard_request 가 UPDATE 에도 붙어 있으면, 아래 update 때 예전 요청 글(race_name·note·country·url)이
--   지금의 스팸 규칙에 걸려 탈퇴 전체가 실패할 수 있다(requested_by 의 on delete set null 도 같은 트리거를 부른다).
--   그런 행이 있는지:
--     select id from public.race_requests
--     where coalesce(public.spam_reason(race_name), public.spam_reason(note), public.spam_reason(country)) is not null
--        or (url is not null and url !~* '^https?://[^\s<>"]+$');

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
  mail text;
begin
  if uid is null then
    raise exception using message = '로그인이 필요합니다.', errcode = '42501';
  end if;

  select lower(btrim(u.email)) into mail from auth.users u where u.id = uid;

  -- 요청 글은 남기되 누가 썼는지는 지운다 (화면은 nickname 이 null 이면 '익명'으로 보여 준다)
  update public.race_requests
     set nickname = null, requested_by = null
   where requested_by = uid;

  -- 같은 이메일로 신청한 일정 알림 (subscribe_alert 는 lower(btrim(email)) 로 저장한다)
  if mail is not null then
    delete from public.alert_subscriptions where email = mail;
  end if;

  -- 계정 삭제 → profiles·reviews 는 on delete cascade
  delete from auth.users where id = uid;
end $$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
