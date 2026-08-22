-- 0004: 지정된 이메일로 가입하면 자동으로 관리자가 되도록

create table if not exists public.admin_emails (
  email text primary key
);

-- RLS 켜고 정책은 두지 않는다 → anon/authenticated 모두 직접 조회 불가.
-- 아래 SECURITY DEFINER 트리거에서만 참조한다.
alter table public.admin_emails enable row level security;

insert into public.admin_emails (email) values ('junubenchoi@gmail.com')
on conflict (email) do nothing;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $fn$
declare
  base text := coalesce(nullif(btrim(new.raw_user_meta_data->>'nickname'), ''), split_part(new.email, '@', 1));
  nick text := left(base, 16);
  n int := 0;
  adm boolean := exists (select 1 from public.admin_emails a where lower(a.email) = lower(new.email));
begin
  if char_length(nick) < 2 then nick := nick || '러너'; end if;
  while exists (select 1 from public.profiles p where lower(p.nickname) = lower(nick)) loop
    n := n + 1;
    nick := left(base, 12) || n::text;
  end loop;
  insert into public.profiles (id, nickname, is_admin) values (new.id, nick, adm)
  on conflict (id) do update set is_admin = excluded.is_admin;
  return new;
end $fn$;

-- 이미 가입한 사용자에게 소급 적용
update public.profiles p set is_admin = true
from auth.users u, public.admin_emails a
where p.id = u.id and lower(u.email) = lower(a.email);

-- 참고: 관리자를 추가하려면
--   insert into public.admin_emails (email) values ('someone@example.com');
-- 그 뒤 해당 이메일로 가입하면 자동으로 관리자가 된다.
-- 이미 가입한 계정을 승격하려면 위 update 문을 다시 실행한다.
