-- 0014: 커뮤니티 1단계 — 러닝톡(전체)·대회별 '이야기' 글과 댓글 (사진 없음)
--
-- 실행 (Cowork, SQL 편집기에서 파일 통째로 한 번). begin … commit 한 트랜잭션이라 중간에 실패하면 아무것도 안 바뀐다.
--   두 번 돌려도 같은 결과(create … if not exists / create or replace / drop … if exists).
--   ※ 이 파일은 community 브랜치에서 쓰기만 했다. 로컬 PGlite 로만 시험했다(scripts/community-sql-test.mjs).
--
-- 읽기 권한 (화면만이 아니라 DB 에서 막는다)
--   · 목록 정보(제목·카테고리·대회·닉네임·작성일·댓글 수)는 누구나 — RPC community_list, 또는 posts 의 공개 칸
--   · 본문(posts.body)은 anon·authenticated 둘 다 칸 권한이 없다 → RPC community_post 가 메일 인증 회원에게만 넣어 준다
--     (미인증 회원도 DB 역할은 authenticated 라 칸 권한만으로는 못 가른다)
--   · 댓글(comments)은 anon 권한 없음, authenticated 는 메일 인증(auth.users.email_confirmed_at)일 때만 행이 보인다
--   · anon 은 posts.user_id 를 못 본다(0012 L2 와 같은 칸 단위 권한)
-- 쓰기: 본인만(메일 인증 + 가입 10분 + 정지 아님), 관리자는 관리자 RPC 로. 지우기는 status='deleted'(제목·본문 비움)만.
-- 탈퇴(0011 delete_my_account): auth.users 삭제 → 이 파일의 표는 on delete cascade 로 그 회원 글·댓글·좋아요·신고가 같이 지워진다
--   (그 회원 글에 달린 다른 회원 댓글도 글과 함께 지워진다). delete_my_account 는 고치지 않는다.
--
-- 기존 함수는 고치지 않는다(guard_is_admin·sync_nickname·delete_my_account …). 프로필에 붙는 일은 별도 트리거로 더한다.
-- 되돌리기: 파일 맨 아래 주석.

begin;

-- ── [0] 사전 점검: 기대는 함수·표가 있는지 ─────────────────────────────────────────────
do $$
begin
  if to_regprocedure('public.spam_reason(text)') is null
     or to_regprocedure('public.is_admin()') is null
     or to_regprocedure('public.force_server_time()') is null
     or to_regprocedure('public.delete_my_account()') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.races') is null then
    raise exception '0014 중단: spam_reason / is_admin / force_server_time / delete_my_account / profiles / races 중 없는 것이 있습니다 (0010~0012 먼저).';
  end if;
end $$;

-- ── [1] 표 ──────────────────────────────────────────────────────────────────────────
-- 글쓰기 정지 (관리자 RPC admin_ban 으로만 바뀜, 'infinity' = 영구)
alter table public.profiles add column if not exists banned_until timestamptz;

create table if not exists public.posts (
  id            uuid primary key default gen_random_uuid(),
  race_id       text references public.races(id) on delete set null,
  category      text not null check (category in ('question','companion','info','free')),
  title         text not null,
  body          text not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  nickname      text not null,
  comment_count integer not null default 0,
  like_count    integer not null default 0,
  report_count  integer not null default 0,
  status        text not null default 'visible' check (status in ('visible','hidden','deleted')),
  hidden_until  timestamptz,  -- 임시조치(권리 침해 신고) 끝나는 때
  hidden_reason text check (hidden_reason in ('reports','admin','rights')),
  edited        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- 지운 글은 제목·본문을 비운다 ('삭제된 글입니다' 자리만 남음)
  constraint posts_title_len check (status = 'deleted' or char_length(btrim(title)) between 2 and 60),
  constraint posts_body_len  check (status = 'deleted' or char_length(btrim(body)) between 1 and 3000)
);

create table if not exists public.comments (
  id            uuid primary key default gen_random_uuid(),
  post_id       uuid not null references public.posts(id) on delete cascade,
  parent_id     uuid references public.comments(id) on delete cascade,  -- 대댓글 1단계 (부모의 parent_id 는 null — 트리거)
  body          text not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  nickname      text not null,
  status        text not null default 'visible' check (status in ('visible','hidden','deleted')),
  report_count  integer not null default 0,
  hidden_until  timestamptz,
  hidden_reason text check (hidden_reason in ('reports','admin','rights')),
  edited        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint comments_body_len check (status = 'deleted' or char_length(btrim(body)) between 1 and 1000)
);

create table if not exists public.post_likes (
  post_id    uuid not null references public.posts(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.reports (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post','comment')),
  target_id   uuid not null,
  reporter    uuid not null references auth.users(id) on delete cascade,
  reason      text not null check (reason in ('spam','abuse','privacy','rights','other')),
  note        text check (note is null or char_length(note) <= 300),
  created_at  timestamptz not null default now(),
  resolved_at timestamptz,  -- 관리자가 처리한 때
  unique (target_type, target_id, reporter)
);

create table if not exists public.banned_words (
  word       text primary key check (word = lower(btrim(word)) and char_length(word) between 1 and 40),
  created_at timestamptz not null default now()
);

create index if not exists posts_list_idx on public.posts (created_at desc, id desc) where status <> 'deleted';
create index if not exists posts_race_idx on public.posts (race_id, created_at desc, id desc) where status <> 'deleted';
create index if not exists posts_cat_idx on public.posts (category, created_at desc, id desc) where status <> 'deleted';
create index if not exists posts_user_idx on public.posts (user_id, created_at);
create index if not exists comments_post_idx on public.comments (post_id, created_at);
create index if not exists comments_user_idx on public.comments (user_id, created_at);
create index if not exists comments_parent_idx on public.comments (parent_id);
create index if not exists post_likes_user_idx on public.post_likes (user_id);
create index if not exists reports_open_idx on public.reports (target_type, target_id) where resolved_at is null;
create index if not exists reports_reporter_idx on public.reports (reporter, created_at);

-- ── [2] 도우미 함수 ──────────────────────────────────────────────────────────────────
-- 지금 로그인한 사람이 메일 인증을 마쳤는지 (본문·댓글 읽기 기준)
create or replace function public.is_verified() returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select u.email_confirmed_at is not null from auth.users u where u.id = auth.uid()), false);
$$;
revoke execute on function public.is_verified() from public, anon;
grant execute on function public.is_verified() to authenticated;

-- DB 상태 → 화면 상태 (src/lib/communityTypes.ts PostState 와 같은 규칙, 이 함수 한 곳에서만)
create or replace function public.community_state(p_status text, p_reason text) returns text
language sql immutable set search_path = public as $$
  select case when p_status = 'visible' then 'visible'
              when p_status = 'deleted' then 'deleted'
              when p_reason = 'rights' then 'temp_hidden'
              else 'hidden' end;
$$;
revoke execute on function public.community_state(text, text) from public, anon, authenticated;

-- 쓸 수 있는 회원인지: 메일 인증 → 가입 10분 → 정지. 안 되면 이유(한국어), 되면 null
create or replace function public.community_write_reason(p_user uuid) returns text
language plpgsql stable security definer set search_path = public, auth as $$
declare confirmed timestamptz; joined timestamptz; ban timestamptz;
begin
  select u.email_confirmed_at, u.created_at into confirmed, joined from auth.users u where u.id = p_user;
  if p_user is null or confirmed is null then
    return '도배·광고 계정을 막기 위해 러닝톡은 메일 인증을 마친 회원만 쓸 수 있게 했습니다.';
  end if;
  if joined > now() - interval '10 minutes' then
    return '도배·광고 계정을 막기 위해 가입하고 10분이 지나야 러닝톡에 쓸 수 있게 했습니다. 조금 뒤에 다시 올려 주세요.';
  end if;
  select p.banned_until into ban from public.profiles p where p.id = p_user;
  if ban = 'infinity'::timestamptz then
    return '운영 정책 위반으로 러닝톡 글쓰기가 제한된 계정입니다.';
  elsif ban > now() then
    return format('운영 정책 위반으로 %s까지 러닝톡 글쓰기가 제한되어 있습니다.', to_char(ban at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI'));
  end if;
  return null;
end $$;
revoke execute on function public.community_write_reason(uuid) from public, anon, authenticated;

-- 글·댓글 내용 검사: 외부 링크 1개까지(메신저·단축 링크는 0개), 링크를 뺀 글로 spam_reason, 금칙어
-- (spam_reason 은 인터넷 주소를 하나도 허용하지 않아서, 허용한 링크 1개를 지운 뒤에 부른다)
create or replace function public.community_text_reason(p_text text) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  t text := lower(coalesce(p_text, ''));
  url_re constant text := '(https?://|www\.)[^\s<>"]+';
  links int; r text;
begin
  if btrim(t) = '' then return null; end if;
  if t ~ '(open\.kakao|t\.me/|telegram|bit\.ly|han\.gl|me2\.do|tinyurl|goo\.gl|vo\.la|url\.kr|is\.gd|cutt\.ly)' then
    return '도배·광고를 막기 위해 메신저·단축 링크는 올릴 수 없게 했습니다.';
  end if;
  select count(*) into links
    from regexp_matches(t, '((?:https?://|www\.)[^\s<>"]+)', 'g') m
   where m[1] !~ '^(https?://)?(www\.)?marathon82\.com(/|$)';
  if links > 1 then
    return '도배·광고를 막기 위해 외부 링크는 1개까지만 넣을 수 있게 했습니다.';
  end if;
  r := public.spam_reason(regexp_replace(t, url_re, ' ', 'g'));
  if r is not null then return r; end if;
  if exists (select 1 from public.banned_words w where position(w.word in t) > 0) then
    return '운영 정책상 쓸 수 없는 단어가 들어 있습니다. 표현을 바꿔 주세요.';
  end if;
  return null;
end $$;
revoke execute on function public.community_text_reason(text) from public, anon, authenticated;

-- ── [3] 글 가드 ─────────────────────────────────────────────────────────────────────
-- 사용자 수정 분기: 트리거 안의 갱신(카운터·신고 자동 숨김·닉네임 동기화, 깊이 ≥2)과 관리자(RPC·관리자 직접 수정)와
--   로그인 사용자가 없는 서버 작업(SQL 편집기·service_role)은 건너뛴다.
--   (security definer 라 current_user 는 함수 주인이라 역할 판별에 못 쓴다)
create or replace function public.guard_post()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare r text; n int;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.status := 'visible';
    new.hidden_until := null;
    new.hidden_reason := null;
    new.edited := false;
    new.comment_count := 0;
    new.like_count := 0;
    new.report_count := 0;
    new.title := btrim(coalesce(new.title, ''));
    new.body := btrim(coalesce(new.body, ''));
    r := public.community_write_reason(new.user_id);
    if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
    new.nickname := coalesce((select p.nickname from public.profiles p where p.id = new.user_id), '러너');
    r := public.community_text_reason(new.title || ' ' || new.body);
    if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
    select count(*) into n from public.posts
     where user_id = new.user_id and created_at > now() - interval '1 day' and lower(btrim(body)) = lower(new.body);
    if n >= 1 then
      raise exception using message = '도배를 막기 위해 같은 내용의 글은 한 번만 올릴 수 있게 했습니다.', errcode = 'P0001';
    end if;
    select count(*) into n from public.posts where user_id = new.user_id and created_at > now() - interval '1 minute';
    if n >= 1 then
      raise exception using message = '도배를 막기 위해 글은 1분에 1개까지 올릴 수 있게 제한하고 있습니다. 잠시 뒤 다시 올려 주세요.', errcode = 'P0001';
    end if;
    select count(*) into n from public.posts where user_id = new.user_id and created_at > now() - interval '1 day';
    if n >= 10 then
      raise exception using message = '도배를 막기 위해 글은 하루에 10개까지 올릴 수 있게 제한하고 있습니다. 내일 다시 올려 주세요.', errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  if pg_trigger_depth() = 1 and auth.uid() is not null and not public.is_admin() then
    -- 사용자가 바꿀 수 없는 칸은 그대로
    new.id := old.id;
    new.user_id := old.user_id;
    new.nickname := old.nickname;
    new.comment_count := old.comment_count;
    new.like_count := old.like_count;
    new.report_count := old.report_count;
    new.hidden_until := old.hidden_until;
    new.hidden_reason := old.hidden_reason;
    new.created_at := old.created_at;
    if old.status = 'deleted' then
      raise exception using message = '삭제된 글은 고칠 수 없습니다.', errcode = 'P0001';
    end if;
    if new.status is distinct from old.status and new.status is distinct from 'deleted' then
      raise exception using message = '글 상태는 바꿀 수 없습니다. 숨김 처리된 글은 운영자 검토를 기다려 주세요.', errcode = 'P0001';
    end if;
    if new.status = 'deleted' then
      -- 지우기: 제목·본문을 비운다 (정지 중에도 지울 수는 있다)
      new.title := '';
      new.body := '';
      new.category := old.category;
      new.race_id := old.race_id;
      new.edited := old.edited;
      new.updated_at := now();
      return new;
    end if;
    r := public.community_write_reason(old.user_id);
    if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
    new.title := btrim(coalesce(new.title, ''));
    new.body := btrim(coalesce(new.body, ''));
    if new.title is distinct from old.title or new.body is distinct from old.body then
      r := public.community_text_reason(new.title || ' ' || new.body);
      if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
      new.edited := true;
    else
      new.edited := old.edited;
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- 관리자·트리거·서버 작업: 지우면 제목·본문을 비우는 것만
  if new.status = 'deleted' and old.status is distinct from 'deleted' then
    new.title := '';
    new.body := '';
  end if;
  return new;
end $$;
revoke execute on function public.guard_post() from public, anon, authenticated;
drop trigger if exists posts_guard on public.posts;
create trigger posts_guard before insert or update on public.posts
  for each row execute function public.guard_post();
drop trigger if exists zz_force_server_time on public.posts;
create trigger zz_force_server_time before insert or update on public.posts
  for each row execute function public.force_server_time();

-- ── [4] 댓글 가드 ───────────────────────────────────────────────────────────────────
create or replace function public.guard_comment()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare r text; n int; pst text; ppost uuid; pparent uuid; pstat text;
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    new.status := 'visible';
    new.hidden_until := null;
    new.hidden_reason := null;
    new.edited := false;
    new.report_count := 0;
    new.body := btrim(coalesce(new.body, ''));
    r := public.community_write_reason(new.user_id);
    if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
    select p.status into pst from public.posts p where p.id = new.post_id;
    if pst is distinct from 'visible' then
      raise exception using message = '댓글을 달 수 없는 글입니다(삭제·숨김).', errcode = 'P0001';
    end if;
    if new.parent_id is not null then
      select c.post_id, c.parent_id, c.status into ppost, pparent, pstat from public.comments c where c.id = new.parent_id;
      if ppost is null or ppost <> new.post_id then
        raise exception using message = '답글을 달 댓글을 찾지 못했습니다.', errcode = 'P0001';
      end if;
      if pparent is not null then
        raise exception using message = '답글에는 다시 답글을 달 수 없습니다.', errcode = 'P0001';
      end if;
      if pstat <> 'visible' then
        raise exception using message = '삭제·숨김된 댓글에는 답글을 달 수 없습니다.', errcode = 'P0001';
      end if;
    end if;
    new.nickname := coalesce((select p.nickname from public.profiles p where p.id = new.user_id), '러너');
    r := public.community_text_reason(new.body);
    if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
    -- 같은 댓글 반복: 같은 글에서는 언제든, 다른 글에서는 1시간 안
    select count(*) into n from public.comments
     where user_id = new.user_id and lower(btrim(body)) = lower(new.body)
       and (post_id = new.post_id or created_at > now() - interval '1 hour');
    if n >= 1 then
      raise exception using message = '도배를 막기 위해 같은 내용의 댓글은 한 번만 올릴 수 있게 했습니다.', errcode = 'P0001';
    end if;
    select count(*) into n from public.comments where user_id = new.user_id and created_at > now() - interval '1 minute';
    if n >= 3 then
      raise exception using message = '도배를 막기 위해 댓글은 1분에 3개까지 올릴 수 있게 제한하고 있습니다. 잠시 뒤 다시 올려 주세요.', errcode = 'P0001';
    end if;
    select count(*) into n from public.comments where user_id = new.user_id and created_at > now() - interval '1 day';
    if n >= 50 then
      raise exception using message = '도배를 막기 위해 댓글은 하루에 50개까지 올릴 수 있게 제한하고 있습니다. 내일 다시 올려 주세요.', errcode = 'P0001';
    end if;
    return new;
  end if;

  -- UPDATE
  if pg_trigger_depth() = 1 and auth.uid() is not null and not public.is_admin() then
    new.id := old.id;
    new.post_id := old.post_id;
    new.parent_id := old.parent_id;
    new.user_id := old.user_id;
    new.nickname := old.nickname;
    new.report_count := old.report_count;
    new.hidden_until := old.hidden_until;
    new.hidden_reason := old.hidden_reason;
    new.created_at := old.created_at;
    if old.status = 'deleted' then
      raise exception using message = '삭제된 댓글은 고칠 수 없습니다.', errcode = 'P0001';
    end if;
    if new.status is distinct from old.status and new.status is distinct from 'deleted' then
      raise exception using message = '댓글 상태는 바꿀 수 없습니다.', errcode = 'P0001';
    end if;
    if new.status = 'deleted' then
      new.body := '';
      new.edited := old.edited;
      new.updated_at := now();
      return new;
    end if;
    r := public.community_write_reason(old.user_id);
    if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
    new.body := btrim(coalesce(new.body, ''));
    if new.body is distinct from old.body then
      r := public.community_text_reason(new.body);
      if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
      new.edited := true;
    else
      new.edited := old.edited;
    end if;
    new.updated_at := now();
    return new;
  end if;

  if new.status = 'deleted' and old.status is distinct from 'deleted' then
    new.body := '';
  end if;
  return new;
end $$;
revoke execute on function public.guard_comment() from public, anon, authenticated;
drop trigger if exists comments_guard on public.comments;
create trigger comments_guard before insert or update on public.comments
  for each row execute function public.guard_comment();
drop trigger if exists zz_force_server_time on public.comments;
create trigger zz_force_server_time before insert or update on public.comments
  for each row execute function public.force_server_time();

-- ── [5] 좋아요·신고 가드 ─────────────────────────────────────────────────────────────
create or replace function public.guard_post_like()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare r text;
begin
  new.created_at := now();
  r := public.community_write_reason(new.user_id);
  if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
  if not exists (select 1 from public.posts p where p.id = new.post_id and p.status = 'visible') then
    raise exception using message = '좋아요를 누를 수 없는 글입니다(삭제·숨김).', errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.guard_post_like() from public, anon, authenticated;
drop trigger if exists post_likes_guard on public.post_likes;
create trigger post_likes_guard before insert on public.post_likes
  for each row execute function public.guard_post_like();
drop trigger if exists zz_force_server_time on public.post_likes;
create trigger zz_force_server_time before insert or update on public.post_likes
  for each row execute function public.force_server_time();

create or replace function public.guard_report()
returns trigger language plpgsql security definer set search_path = public, auth as $$
declare r text; tgt_owner uuid; st text; n int;
begin
  new.created_at := now();
  new.resolved_at := null;
  new.note := nullif(btrim(coalesce(new.note, '')), '');
  r := public.community_write_reason(new.reporter);
  if r is not null then raise exception using message = r, errcode = 'P0001'; end if;
  if new.target_type = 'post' then
    select p.user_id, p.status into tgt_owner, st from public.posts p where p.id = new.target_id;
  else
    select c.user_id, c.status into tgt_owner, st from public.comments c where c.id = new.target_id;
  end if;
  if tgt_owner is null or st <> 'visible' then
    raise exception using message = '신고할 글을 찾지 못했습니다(이미 삭제·숨김).', errcode = 'P0001';
  end if;
  if tgt_owner = new.reporter then
    raise exception using message = '내가 쓴 글은 신고할 수 없습니다.', errcode = 'P0001';
  end if;
  select count(*) into n from public.reports where reporter = new.reporter and created_at > now() - interval '1 day';
  if n >= 20 then
    raise exception using message = '신고는 하루에 20건까지 받고 있습니다. 급한 권리 침해는 문의 메일로 알려 주세요.', errcode = 'P0001';
  end if;
  return new;
end $$;
revoke execute on function public.guard_report() from public, anon, authenticated;
drop trigger if exists reports_guard on public.reports;
create trigger reports_guard before insert on public.reports
  for each row execute function public.guard_report();
drop trigger if exists zz_force_server_time on public.reports;
create trigger zz_force_server_time before insert or update on public.reports
  for each row execute function public.force_server_time();

-- ── [6] 카운터·신고 자동 숨김 ────────────────────────────────────────────────────────
-- comment_count = 그 글의 visible 댓글 수
create or replace function public.community_count_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare d int := 0; pid uuid;
begin
  if tg_op = 'INSERT' then
    pid := new.post_id; d := case when new.status = 'visible' then 1 else 0 end;
  elsif tg_op = 'DELETE' then
    pid := old.post_id; d := case when old.status = 'visible' then -1 else 0 end;
  else
    pid := new.post_id;
    d := (case when new.status = 'visible' then 1 else 0 end) - (case when old.status = 'visible' then 1 else 0 end);
  end if;
  if d <> 0 then
    update public.posts set comment_count = greatest(comment_count + d, 0) where id = pid;
  end if;
  return null;
end $$;
revoke execute on function public.community_count_comment() from public, anon, authenticated;
drop trigger if exists comments_count on public.comments;
create trigger comments_count after insert or delete or update of status on public.comments
  for each row execute function public.community_count_comment();

create or replace function public.community_count_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end $$;
revoke execute on function public.community_count_like() from public, anon, authenticated;
drop trigger if exists post_likes_count on public.post_likes;
create trigger post_likes_count after insert or delete on public.post_likes
  for each row execute function public.community_count_like();

-- 신고: report_count +1, 아직 처리 안 된 신고가 3건이 되면 숨김(관리자 검토 — 신고함에 뜬다)
create or replace function public.community_count_report()
returns trigger language plpgsql security definer set search_path = public as $$
declare open_n int;
begin
  select count(*) into open_n from public.reports
   where target_type = new.target_type and target_id = new.target_id and resolved_at is null;
  if new.target_type = 'post' then
    update public.posts set report_count = report_count + 1,
           status = case when open_n >= 3 and status = 'visible' then 'hidden' else status end,
           hidden_reason = case when open_n >= 3 and status = 'visible' then 'reports' else hidden_reason end
     where id = new.target_id;
  else
    update public.comments set report_count = report_count + 1,
           status = case when open_n >= 3 and status = 'visible' then 'hidden' else status end,
           hidden_reason = case when open_n >= 3 and status = 'visible' then 'reports' else hidden_reason end
     where id = new.target_id;
  end if;
  return null;
end $$;
revoke execute on function public.community_count_report() from public, anon, authenticated;
drop trigger if exists reports_count on public.reports;
create trigger reports_count after insert on public.reports
  for each row execute function public.community_count_report();

-- 글·댓글 행이 실제로 지워지면(탈퇴 cascade) 그 대상의 신고도 지운다 (대상 없는 신고가 신고함에 남지 않게)
create or replace function public.community_drop_reports()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.reports where target_type = tg_argv[0] and target_id = old.id;
  return null;
end $$;
revoke execute on function public.community_drop_reports() from public, anon, authenticated;
drop trigger if exists posts_drop_reports on public.posts;
create trigger posts_drop_reports after delete on public.posts
  for each row execute function public.community_drop_reports('post');
drop trigger if exists comments_drop_reports on public.comments;
create trigger comments_drop_reports after delete on public.comments
  for each row execute function public.community_drop_reports('comment');

-- ── [7] 프로필: 정지 칸 잠금, 닉네임 사본 갱신 (기존 guard_is_admin·sync_nickname 은 그대로) ─────
create or replace function public.guard_banned_until()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.banned_until := null;
    else
      new.banned_until := old.banned_until;
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_banned_until() from public, anon, authenticated;
drop trigger if exists profiles_guard_banned on public.profiles;
create trigger profiles_guard_banned before insert or update on public.profiles
  for each row execute function public.guard_banned_until();

create or replace function public.sync_nickname_community()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.nickname is distinct from old.nickname then
    update public.posts set nickname = new.nickname where user_id = new.id;
    update public.comments set nickname = new.nickname where user_id = new.id;
  end if;
  return null;
end $$;
revoke execute on function public.sync_nickname_community() from public, anon, authenticated;
drop trigger if exists profiles_sync_nickname_community on public.profiles;
create trigger profiles_sync_nickname_community after update of nickname on public.profiles
  for each row execute function public.sync_nickname_community();

-- ── [8] 권한·RLS ────────────────────────────────────────────────────────────────────
alter table public.posts        enable row level security;
alter table public.comments     enable row level security;
alter table public.post_likes   enable row level security;
alter table public.reports      enable row level security;
alter table public.banned_words enable row level security;

-- Supabase 는 새 표를 API 역할에 전부 열어 둔다 → 먼저 다 닫고 필요한 칸만 연다
revoke all on public.posts, public.comments, public.post_likes, public.reports, public.banned_words from anon, authenticated;

-- 글: 본문(body)은 아무 API 역할에도 칸 권한이 없다(RPC community_post 로만). anon 은 user_id 도 못 본다.
-- 주의: 앞으로 posts 에 칸을 새로 만들면 아래 grant 에 따로 넣어야 보인다.
grant select (id, race_id, category, title, nickname, comment_count, like_count, report_count, status,
              hidden_until, hidden_reason, edited, created_at, updated_at) on public.posts to anon;
grant select (id, race_id, category, title, nickname, comment_count, like_count, report_count, status,
              hidden_until, hidden_reason, edited, created_at, updated_at, user_id) on public.posts to authenticated;
grant insert (race_id, category, title, body, user_id) on public.posts to authenticated;
grant update (title, body, category, race_id, status) on public.posts to authenticated;

-- 댓글: anon 은 아무것도. authenticated 는 칸 권한은 있지만 정책이 메일 인증 회원에게만 행을 보인다.
grant select (id, post_id, parent_id, body, user_id, nickname, status, report_count, hidden_until, hidden_reason,
              edited, created_at, updated_at) on public.comments to authenticated;
grant insert (post_id, parent_id, body, user_id) on public.comments to authenticated;
grant update (body, status) on public.comments to authenticated;

grant select, delete on public.post_likes to authenticated;
grant insert (post_id, user_id) on public.post_likes to authenticated;
grant insert (target_type, target_id, reporter, reason, note) on public.reports to authenticated;
-- banned_words: API 역할 권한 없음 (관리자 RPC 로만)

-- anon 은 is_admin()·is_verified() 를 부를 권한이 없다 → 정책을 역할별로 나눈다
drop policy if exists posts_read_anon on public.posts;
create policy posts_read_anon on public.posts for select to anon using (status = 'visible');
drop policy if exists posts_read_auth on public.posts;
create policy posts_read_auth on public.posts for select to authenticated
  using (status = 'visible' or user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists posts_insert_own on public.posts;
create policy posts_insert_own on public.posts for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists posts_update_own on public.posts;
create policy posts_update_own on public.posts for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to authenticated
  using ((select public.is_verified()) and (status = 'visible' or user_id = (select auth.uid()) or (select public.is_admin())));
drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists comments_update_own on public.comments;
create policy comments_update_own on public.comments for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists post_likes_read_own on public.post_likes;
create policy post_likes_read_own on public.post_likes for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists post_likes_insert_own on public.post_likes;
create policy post_likes_insert_own on public.post_likes for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists post_likes_delete_own on public.post_likes;
create policy post_likes_delete_own on public.post_likes for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports for insert to authenticated with check (reporter = (select auth.uid()));

-- ── [9] 읽기 RPC ────────────────────────────────────────────────────────────────────
-- 목록 (워커 /api/community 가 anon 으로 부른다). 본문·user_id 없음. visible + 임시조치(제목·닉네임 비움)만.
-- 지운 글('삭제된 글입니다')은 공개 목록에 빈 줄로 늘어놓지 않고 글 상세·공유 링크·내 글에서만 보인다.
create or replace function public.community_list(
  p_race text default null, p_cat text default null,
  p_before_at timestamptz default null, p_before_id uuid default null, p_limit int default 20)
returns table (id uuid, race_id text, category text, title text, nickname text, created_at timestamptz,
               comment_count int, like_count int, edited boolean, state text)
language sql stable security definer set search_path = public as $$
  select p.id, p.race_id, p.category,
         case when p.status = 'visible' then p.title end,
         case when p.status = 'visible' then p.nickname end,
         p.created_at, p.comment_count, p.like_count, p.edited,
         public.community_state(p.status, p.hidden_reason)
    from public.posts p
   where (p.status = 'visible' or (p.status = 'hidden' and p.hidden_reason = 'rights'))
     and (p_race is null or p.race_id = p_race)
     and (p_cat is null or p.category = p_cat)
     and (p_before_at is null
          or (p.created_at, p.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by p.created_at desc, p.id desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50);
$$;
revoke execute on function public.community_list(text, text, timestamptz, uuid, int) from public;
grant execute on function public.community_list(text, text, timestamptz, uuid, int) to anon, authenticated;

-- 글 하나 (src/lib/communityTypes.ts PostDetail 꼴). 본문·댓글은 메일 인증 회원(또는 관리자)에게만.
-- 없음 / 숨김(작성자·관리자 아님) → null. 숨김·임시조치 글은 작성자·관리자에게 제목·본문을 보인다.
create or replace function public.community_post(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  p public.posts; uid uuid := auth.uid(); adm boolean := public.is_admin();
  st text; own boolean; show boolean; locked boolean; cmts jsonb := '[]'::jsonb;
begin
  select * into p from public.posts where posts.id = p_id;
  if not found then return null; end if;
  own := uid is not null and p.user_id = uid;
  st := public.community_state(p.status, p.hidden_reason);
  if st = 'hidden' and not (own or adm) then return null; end if;
  locked := not (public.is_verified() or adm);
  show := st = 'visible' or (st in ('hidden', 'temp_hidden') and (own or adm));
  if not locked then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id, 'parent_id', c.parent_id,
             'nickname', case when cs.vis then c.nickname end,
             'body', case when cs.vis then c.body end,
             'created_at', c.created_at, 'edited', c.edited,
             'state', public.community_state(c.status, c.hidden_reason),
             'mine', uid is not null and c.user_id = uid)
           order by c.created_at, c.id), '[]'::jsonb)
      into cmts
      from public.comments c
     cross join lateral (select c.status = 'visible'
                                or (c.status = 'hidden' and (adm or (uid is not null and c.user_id = uid))) as vis) cs
     where c.post_id = p.id;
  end if;
  return jsonb_build_object(
    'post', jsonb_build_object(
      'id', p.id, 'race_id', p.race_id, 'category', p.category,
      'title', case when show then p.title end,
      'nickname', case when show then p.nickname end,
      'created_at', p.created_at, 'updated_at', p.updated_at,
      'comment_count', p.comment_count, 'like_count', p.like_count, 'edited', p.edited,
      'state', st,
      'body', case when show and not locked then p.body end,
      'mine', own,
      'liked', uid is not null and exists (select 1 from public.post_likes l where l.post_id = p.id and l.user_id = uid)),
    'locked', locked,
    'comments', cmts);
end $$;
revoke execute on function public.community_post(uuid) from public;
grant execute on function public.community_post(uuid) to anon, authenticated;

-- 내 글 (상태 그대로, 20개씩). 지운 글은 제목이 비어 있어 null.
create or replace function public.community_my_posts(p_before_at timestamptz default null, p_before_id uuid default null)
returns table (id uuid, race_id text, category text, title text, nickname text, created_at timestamptz,
               comment_count int, like_count int, edited boolean, state text)
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception using message = '로그인이 필요합니다.', errcode = '42501';
  end if;
  return query
  select p.id, p.race_id, p.category, nullif(p.title, ''), p.nickname, p.created_at,
         p.comment_count, p.like_count, p.edited, public.community_state(p.status, p.hidden_reason)
    from public.posts p
   where p.user_id = uid
     and (p_before_at is null
          or (p.created_at, p.id) < (p_before_at, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
   order by p.created_at desc, p.id desc
   limit 20;
end $$;
revoke execute on function public.community_my_posts(timestamptz, uuid) from public, anon;
grant execute on function public.community_my_posts(timestamptz, uuid) to authenticated;

-- ── [10] 관리자 RPC ─────────────────────────────────────────────────────────────────
-- 신고함: 미처리 신고가 있거나, 신고로 숨겨졌거나, 임시조치 중(기한 지난 것 포함)인 대상
create or replace function public.admin_community_reports()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.is_admin() then
    raise exception using message = '관리자만 할 수 있습니다.', errcode = '42501';
  end if;
  with targets as (
    select r.target_type, r.target_id from public.reports r where r.resolved_at is null
    union
    select 'post', p.id from public.posts p where p.status = 'hidden' and p.hidden_reason in ('reports', 'rights')
    union
    select 'comment', c.id from public.comments c where c.status = 'hidden' and c.hidden_reason in ('reports', 'rights')
  ), tr as (
    select t.target_type, t.target_id,
           coalesce(p.id, c.post_id) as post_id,
           (select count(*) from public.reports r where r.target_type = t.target_type and r.target_id = t.target_id and r.resolved_at is null) as cnt,
           (select coalesce(jsonb_object_agg(s.reason, s.k), '{}'::jsonb)
              from (select r.reason, count(*) as k from public.reports r
                     where r.target_type = t.target_type and r.target_id = t.target_id and r.resolved_at is null
                     group by r.reason) s) as reasons,
           (select coalesce(jsonb_agg(r.note order by r.created_at desc), '[]'::jsonb) from public.reports r
             where r.target_type = t.target_type and r.target_id = t.target_id and r.resolved_at is null and r.note is not null) as notes,
           coalesce((select max(r.created_at) from public.reports r where r.target_type = t.target_type and r.target_id = t.target_id),
                    coalesce(p.updated_at, c.updated_at)) as last_at,
           coalesce(p.status, c.status) as status,
           coalesce(p.hidden_until, c.hidden_until) as hidden_until,
           coalesce(p.hidden_reason, c.hidden_reason) as hidden_reason,
           coalesce(p.title, (select pp.title from public.posts pp where pp.id = c.post_id)) as title,
           coalesce(p.body, c.body) as body,
           coalesce(p.nickname, c.nickname) as nickname,
           coalesce(p.user_id, c.user_id) as user_id,
           pr.banned_until
      from targets t
      left join public.posts p on t.target_type = 'post' and p.id = t.target_id
      left join public.comments c on t.target_type = 'comment' and c.id = t.target_id
      left join public.profiles pr on pr.id = coalesce(p.user_id, c.user_id)
     where p.id is not null or c.id is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'target_type', target_type, 'target_id', target_id, 'post_id', post_id, 'count', cnt,
           'reasons', reasons, 'notes', notes, 'last_at', last_at, 'status', status,
           'hidden_until', hidden_until, 'hidden_reason', hidden_reason, 'title', title, 'body', body,
           'nickname', nickname, 'user_id', user_id, 'banned_until', banned_until)
         order by last_at desc), '[]'::jsonb)
    into res from tr;
  return res;
end $$;
revoke execute on function public.admin_community_reports() from public, anon;
grant execute on function public.admin_community_reports() to authenticated;

-- 처리: hide 숨김 / restore 되돌리기 / delete 지우기(제목·본문 비움) / temp_hide 임시조치 30일 / dismiss 기각(상태 그대로)
-- 모두 그 대상의 미처리 신고를 처리됨으로.
create or replace function public.admin_community_action(p_type text, p_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
declare st text;
begin
  if not public.is_admin() then
    raise exception using message = '관리자만 할 수 있습니다.', errcode = '42501';
  end if;
  if p_type not in ('post', 'comment') or p_action not in ('hide', 'restore', 'delete', 'temp_hide', 'dismiss') then
    raise exception using message = '알 수 없는 처리입니다.', errcode = 'P0001';
  end if;
  if p_type = 'post' then
    select status into st from public.posts where id = p_id;
  else
    select status into st from public.comments where id = p_id;
  end if;
  if st is null then
    raise exception using message = '대상을 찾지 못했습니다.', errcode = 'P0001';
  end if;
  if st = 'deleted' and p_action in ('restore', 'hide', 'temp_hide') then
    raise exception using message = '삭제된 글은 되돌리거나 숨길 수 없습니다.', errcode = 'P0001';
  end if;
  if p_action <> 'dismiss' then
    if p_type = 'post' then
      update public.posts set
        status = case p_action when 'restore' then 'visible' when 'delete' then 'deleted' else 'hidden' end,
        hidden_reason = case p_action when 'hide' then 'admin' when 'temp_hide' then 'rights' end,
        hidden_until = case when p_action = 'temp_hide' then now() + interval '30 days' end
       where id = p_id;
    else
      update public.comments set
        status = case p_action when 'restore' then 'visible' when 'delete' then 'deleted' else 'hidden' end,
        hidden_reason = case p_action when 'hide' then 'admin' when 'temp_hide' then 'rights' end,
        hidden_until = case when p_action = 'temp_hide' then now() + interval '30 days' end
       where id = p_id;
    end if;
  end if;
  update public.reports set resolved_at = now()
   where target_type = p_type and target_id = p_id and resolved_at is null;
end $$;
revoke execute on function public.admin_community_action(text, uuid, text) from public, anon;
grant execute on function public.admin_community_action(text, uuid, text) to authenticated;

-- 작성자 정지: p_days 1~365 = 그 날수, null = 영구, 0 = 해제
create or replace function public.admin_ban(p_user uuid, p_days int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception using message = '관리자만 할 수 있습니다.', errcode = '42501';
  end if;
  if p_days is not null and (p_days < 0 or p_days > 365) then
    raise exception using message = '정지 기간은 0(해제)~365일 또는 영구(null)여야 합니다.', errcode = 'P0001';
  end if;
  update public.profiles
     set banned_until = case when p_days is null then 'infinity'::timestamptz
                             when p_days = 0 then null
                             else now() + make_interval(days => p_days) end
   where id = p_user;
  if not found then
    raise exception using message = '회원을 찾지 못했습니다.', errcode = 'P0001';
  end if;
end $$;
revoke execute on function public.admin_ban(uuid, int) from public, anon;
grant execute on function public.admin_ban(uuid, int) to authenticated;

create or replace function public.admin_banned_words()
returns setof text language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception using message = '관리자만 할 수 있습니다.', errcode = '42501';
  end if;
  return query select w.word from public.banned_words w order by w.word;
end $$;
revoke execute on function public.admin_banned_words() from public, anon;
grant execute on function public.admin_banned_words() to authenticated;

create or replace function public.admin_banned_word_add(p_word text)
returns void language plpgsql security definer set search_path = public as $$
declare w text := lower(btrim(coalesce(p_word, '')));
begin
  if not public.is_admin() then
    raise exception using message = '관리자만 할 수 있습니다.', errcode = '42501';
  end if;
  if char_length(w) not between 1 and 40 then
    raise exception using message = '금칙어는 1~40자로 넣어 주세요.', errcode = 'P0001';
  end if;
  insert into public.banned_words (word) values (w) on conflict (word) do nothing;
end $$;
revoke execute on function public.admin_banned_word_add(text) from public, anon;
grant execute on function public.admin_banned_word_add(text) to authenticated;

create or replace function public.admin_banned_word_remove(p_word text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception using message = '관리자만 할 수 있습니다.', errcode = '42501';
  end if;
  delete from public.banned_words where word = lower(btrim(coalesce(p_word, '')));
end $$;
revoke execute on function public.admin_banned_word_remove(text) from public, anon;
grant execute on function public.admin_banned_word_remove(text) to authenticated;

-- ── 사후 점검: 본문·댓글·글쓴이가 새어 나가는 권한이 남아 있으면 되돌린다 ─────────────────
do $$
begin
  if has_column_privilege('anon', 'public.posts', 'body', 'SELECT')
     or has_column_privilege('authenticated', 'public.posts', 'body', 'SELECT')
     or has_column_privilege('anon', 'public.posts', 'user_id', 'SELECT')
     or has_table_privilege('anon', 'public.comments', 'SELECT')
     or has_table_privilege('anon', 'public.reports', 'SELECT')
     or has_table_privilege('authenticated', 'public.reports', 'SELECT')
     or has_table_privilege('anon', 'public.banned_words', 'SELECT')
     or has_table_privilege('authenticated', 'public.banned_words', 'SELECT') then
    raise exception '0014 중단: 본문·댓글·신고·금칙어를 API 역할이 직접 읽을 수 있는 권한이 남아 있습니다.';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('posts', 'comments')
              and cmd in ('SELECT', 'ALL') and policyname not in ('posts_read_anon', 'posts_read_auth', 'comments_read')) then
    raise exception '0014 중단: posts·comments 에 이 파일이 만들지 않은 SELECT 정책이 있습니다.';
  end if;
end $$;

commit;


-- ── 되돌리기 (필요할 때만) ────────────────────────────────────────────────────────────
-- 표(글·댓글이 모두 지워진다):
--   drop table if exists public.reports, public.post_likes, public.comments, public.posts, public.banned_words cascade;
-- 프로필 트리거·칸:
--   drop trigger if exists profiles_guard_banned on public.profiles;
--   drop trigger if exists profiles_sync_nickname_community on public.profiles;
--   alter table public.profiles drop column if exists banned_until;
-- 함수:
--   drop function if exists public.community_list(text, text, timestamptz, uuid, int), public.community_post(uuid),
--     public.community_my_posts(timestamptz, uuid), public.admin_community_reports(), public.admin_community_action(text, uuid, text),
--     public.admin_ban(uuid, int), public.admin_banned_words(), public.admin_banned_word_add(text), public.admin_banned_word_remove(text),
--     public.guard_post(), public.guard_comment(), public.guard_post_like(), public.guard_report(), public.community_count_comment(),
--     public.community_count_like(), public.community_count_report(), public.community_drop_reports(), public.guard_banned_until(),
--     public.sync_nickname_community(), public.community_text_reason(text), public.community_write_reason(uuid),
--     public.community_state(text, text), public.is_verified();
