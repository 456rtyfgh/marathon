-- 0017 일정 알림 실제 발송 (예약 워커 worker/cron.ts → worker/alerts/*)
-- 실행: Supabase SQL 편집기에서 이 파일 전체를 한 번 (다시 돌려도 같다: if not exists / create or replace).
--
--   automation_due_alerts(p_key, p_date, p_channel)  오늘(KST) 보낼 알림을 이메일별로 묶어 jsonb 로
--   automation_mark_sent(p_key, p_items, p_channel)  보낸(또는 영구 실패한) 알림을 alert_send_log 에 기록
--   unsubscribe_alert(p_tokens uuid[])               메일의 수신 거부 링크 (비로그인 가능, 토큰만으로)
--
-- 규칙
--   · 날짜가 'confirmed' 인 것만 보낸다 — 'expected'(예상)·'tbc' 날짜로는 보내지 않는다 (사이트의 isEntryConfirmed 와 같음).
--     접수 시작·마감은 entry_confidence, 대회일은 date_confidence 를 본다.
--   · 취소·중단된 대회(notes_ko 가 '[취소]'·'[중단]' 으로 시작 — src/lib/util.ts CANCEL_TAG_RE)는 뺀다.
--   · 조기 마감(sold_out_on 이 오늘이거나 지남)이면 '접수 마감' 알림은 뺀다.
--   · 받는 사람: alert_subscriptions 중 confirmed_at 있는 행(접수 시작·마감·대회일)
--               + user_alert_prefs.saved_races = true 인 회원(메일 인증된 auth.users.email)의 user_favorites(접수 시작·마감).
--   · 알림 날짜(scheduled_for) = 일정 날짜 − days_before. 하루 한도로 못 보낸 것은 3일까지 다음 날 이어서 보낸다.
--     같은 (이메일·대회·종류·일정 날짜) 에 더 늦은(가까운) 알림이 이미 나갔으면 옛 알림은 다시 안 보낸다.
--   · 중복 방지: alert_send_log unique (channel, email, race_id, kind, scheduled_for).
--   · 자동화 키는 automation_keys.name = 'alerts' (주간 갱신 'weekly' 와 따로 — 이메일 목록을 읽는 키라서).
--     0012 [M5] 처럼 automation_* 는 service_role 만 부를 수 있다 → 워커는 service 키 + 자동화 키 둘 다 필요.

begin;

-- ── 언어 (메일을 한국어/영어 중 무엇으로) ─────────────────────────────────────────────────────
-- 회원 설정 한 곳(user_alert_prefs.lang)에 둔다. alert_subscriptions.lang 은 따로 정할 때만(없으면 회원 설정 → 'ko').
alter table public.user_alert_prefs add column if not exists lang text not null default 'ko';
alter table public.user_alert_prefs drop constraint if exists user_alert_prefs_lang;
alter table public.user_alert_prefs add constraint user_alert_prefs_lang check (lang in ('ko', 'en'));
grant insert (lang) on public.user_alert_prefs to authenticated;
grant update (lang) on public.user_alert_prefs to authenticated;

alter table public.alert_subscriptions add column if not exists lang text;
alter table public.alert_subscriptions drop constraint if exists alert_subscriptions_lang;
alter table public.alert_subscriptions add constraint alert_subscriptions_lang check (lang is null or lang in ('ko', 'en'));

-- 저장한 대회 알림을 메일에서 끄는 토큰 (표 권한은 select 만 — 본인 행만 읽힘, 바꾸기는 unsubscribe_alert 로만)
alter table public.user_alert_prefs add column if not exists unsubscribe_token uuid not null default gen_random_uuid();
create unique index if not exists user_alert_prefs_unsubscribe_token_key on public.user_alert_prefs (unsubscribe_token);

-- ── 발송 기록 ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.alert_send_log (
  id            bigint generated always as identity primary key,
  channel       text not null default 'email' check (channel in ('email', 'push')),
  email         text not null,
  race_id       text not null references public.races(id) on delete cascade on update cascade,
  kind          text not null check (kind in ('entry_opens', 'entry_closes', 'race_day')),
  event_date    date not null,         -- 알린 일정 날짜 (접수 시작일·마감일·대회일)
  scheduled_for date not null,         -- 원래 보내기로 한 날 = event_date − days_before
  status        text not null default 'sent' check (status in ('sent', 'failed')),  -- failed = 주소 오류 등 다시 보내도 안 되는 것
  message_id    text,                  -- Resend 메일 id (한 통에 여러 알림이 묶이면 같은 값)
  sent_at       timestamptz not null default now(),
  unique (channel, email, race_id, kind, scheduled_for)
);
create index if not exists alert_send_log_sent_at_idx on public.alert_send_log (sent_at);
create index if not exists alert_send_log_race_id_idx on public.alert_send_log (race_id);
alter table public.alert_send_log enable row level security;
revoke all on public.alert_send_log from public, anon, authenticated;
-- 정책 없음 = API 로 직접 못 읽는다. 아래 함수로만.

-- ── 오늘 보낼 알림 ───────────────────────────────────────────────────────────────────────────
-- 반환: { date, channel, sent_today, groups: [ { email, user_id, lang, unsubscribe_tokens[], items: [ {
--          race_id, kind, event_date, scheduled_for, days_left, name_ko, name_en, city_ko, country_ko,
--          race_date, official_url, unsubscribe_tokens[] } ] } ] }
-- groups 는 가장 가까운 일정 순. sent_today = 오늘(KST) 이 channel 로 보낸 통 수(메일 한도 계산용).
create or replace function public.automation_due_alerts(p_key text, p_date date default null, p_channel text default 'email')
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  d date := coalesce(p_date, (now() at time zone 'Asia/Seoul')::date);
  res jsonb;
  sent int;
begin
  if not public.automation_ok('alerts', p_key) then
    raise exception using message = 'automation key rejected', errcode = '28000';
  end if;
  if p_channel is null or p_channel not in ('email', 'push') then
    raise exception using message = 'bad channel', errcode = '22023';
  end if;

  select count(distinct coalesce(l.message_id, l.email)) into sent
    from public.alert_send_log l
   where l.channel = p_channel and l.status = 'sent' and (l.sent_at at time zone 'Asia/Seoul')::date = d;

  with members as (
    select u.id as user_id, lower(btrim(u.email)) as email, p.lang, p.saved_races, p.days_before, p.unsubscribe_token
      from auth.users u left join public.user_alert_prefs p on p.user_id = u.id
     where u.email is not null and u.email_confirmed_at is not null
  ),
  -- 알림 출처: 대회별 구독(src='sub') + 회원의 저장한 대회(src='saved')
  src as (
    select s.email, s.race_id, s.days_before, 'sub'::text as src, s.unsubscribe_token as tok,
           coalesce(s.lang, m.lang, 'ko') as lang, m.user_id,
           array['entry_opens', 'entry_closes', 'race_day'] as kinds
      from public.alert_subscriptions s left join members m on m.email = s.email
     where s.confirmed_at is not null
    union all
    select m.email, f.race_id, m.days_before, 'saved', m.unsubscribe_token, coalesce(m.lang, 'ko'), m.user_id,
           array['entry_opens', 'entry_closes']
      from members m join public.user_favorites f on f.user_id = m.user_id
     where m.saved_races
  ),
  ev as (
    select r.id as race_id, r.name_ko, r.name_en, r.city_ko, r.country_ko, r.race_date, r.official_url, k.kind, k.event_date
      from public.races r
      cross join lateral (values
        ('entry_opens',  case when r.entry_confidence = 'confirmed' then r.entry_opens end),
        ('entry_closes', case when r.entry_confidence = 'confirmed'
                               and coalesce((to_jsonb(r) ->> 'sold_out_on')::date > d, true) then r.entry_closes end),
        ('race_day',     case when r.date_confidence = 'confirmed' then r.race_date end)
      ) as k(kind, event_date)
     where k.event_date is not null
       and k.event_date >= d
       and coalesce(r.notes_ko, '') !~ '^\s*\[(취소|중단)\]'
  ),
  cand as (
    select s.email, s.user_id, s.lang, s.src, s.tok, e.*, (e.event_date - n)::date as scheduled_for
      from src s
      join ev e on e.race_id = s.race_id and e.kind = any (s.kinds)
      cross join lateral unnest(s.days_before) as n
     where n between 0 and 365
       and (e.event_date - n) between d - 3 and d
  ),
  -- 같은 이메일·대회·종류·일정 날짜는 하나로 (가장 늦은 = 가까운 알림), 출처 토큰은 모은다
  pick as (
    select c.email, c.race_id, c.kind, c.event_date,
           max(c.scheduled_for) as scheduled_for,
           (array_agg(c.user_id) filter (where c.user_id is not null))[1] as user_id,
           (array_agg(c.lang order by (c.src = 'saved'), c.lang))[1] as lang,
           array_agg(distinct c.tok) as toks,
           min(c.name_ko) as name_ko, min(c.name_en) as name_en, min(c.city_ko) as city_ko, min(c.country_ko) as country_ko,
           min(c.race_date) as race_date, min(c.official_url) as official_url
      from cand c
     group by c.email, c.race_id, c.kind, c.event_date
  ),
  due as (
    select p.* from pick p
     where not exists (
       select 1 from public.alert_send_log l
        where l.channel = p_channel and l.email = p.email and l.race_id = p.race_id and l.kind = p.kind
          and l.event_date = p.event_date and l.scheduled_for >= p.scheduled_for)
  ),
  -- 이메일 하나의 '모든 알림 끄기' 토큰 (오늘 알림과 상관없이 그 주소의 전부)
  alltok as (
    select s.email, array_agg(distinct s.tok) as toks
      from src s where s.email in (select email from due) group by s.email
  ),
  grp as (
    select d2.email,
           (array_agg(d2.user_id) filter (where d2.user_id is not null))[1] as user_id,
           (array_agg(d2.lang order by d2.event_date))[1] as lang,
           min(d2.event_date) as first_date,
           jsonb_agg(jsonb_build_object(
             'race_id', d2.race_id, 'kind', d2.kind, 'event_date', d2.event_date, 'scheduled_for', d2.scheduled_for,
             'days_left', d2.event_date - d, 'name_ko', d2.name_ko, 'name_en', d2.name_en, 'city_ko', d2.city_ko,
             'country_ko', d2.country_ko, 'race_date', d2.race_date, 'official_url', d2.official_url,
             'unsubscribe_tokens', to_jsonb(d2.toks))
             order by d2.event_date, d2.race_id, d2.kind) as items
      from due d2 group by d2.email
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'email', g.email, 'user_id', g.user_id, 'lang', g.lang,
           'unsubscribe_tokens', to_jsonb(a.toks), 'items', g.items) order by g.first_date, g.email), '[]'::jsonb)
    into res
    from grp g join alltok a on a.email = g.email;

  return jsonb_build_object('date', d, 'channel', p_channel, 'sent_today', sent, 'groups', res);
end $$;

-- ── 보낸 것 기록 ─────────────────────────────────────────────────────────────────────────────
-- p_items: [ { email, race_id, kind, event_date, scheduled_for, status?('sent'|'failed'), message_id? } ] — 새로 기록한 수를 돌려준다.
create or replace function public.automation_mark_sent(p_key text, p_items jsonb, p_channel text default 'email')
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.automation_ok('alerts', p_key) then
    raise exception using message = 'automation key rejected', errcode = '28000';
  end if;
  if p_channel is null or p_channel not in ('email', 'push') then
    raise exception using message = 'bad channel', errcode = '22023';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 500 then
    raise exception using message = 'p_items must be an array (max 500)', errcode = '22023';
  end if;
  insert into public.alert_send_log (channel, email, race_id, kind, event_date, scheduled_for, status, message_id)
  select p_channel, lower(btrim(x ->> 'email')), x ->> 'race_id', x ->> 'kind', (x ->> 'event_date')::date,
         (x ->> 'scheduled_for')::date, coalesce(x ->> 'status', 'sent'), left(x ->> 'message_id', 200)
    from jsonb_array_elements(p_items) x
      join public.races r on r.id = x ->> 'race_id'   -- 그새 지워진 대회는 건너뛴다
  on conflict (channel, email, race_id, kind, scheduled_for) do nothing;
  get diagnostics n = row_count;
  -- 일정이 30일 넘게 지난 기록은 중복 방지에 더 필요 없다 → 지운다 (이메일을 오래 들고 있지 않기)
  delete from public.alert_send_log where event_date < (now() at time zone 'Asia/Seoul')::date - 30;
  return n;
end $$;

-- 0012 [M5] 와 같게: automation_* 는 service_role 만
revoke execute on function public.automation_due_alerts(text, date, text) from public, anon, authenticated;
revoke execute on function public.automation_mark_sent(text, jsonb, text) from public, anon, authenticated;
grant execute on function public.automation_due_alerts(text, date, text) to service_role;
grant execute on function public.automation_mark_sent(text, jsonb, text) to service_role;

-- ── 수신 거부 ────────────────────────────────────────────────────────────────────────────────
-- 토큰(메일 링크의 t=…, 여러 개는 쉼표)으로: 대회 구독 행은 지우고, 저장한 대회 알림은 끈다.
-- 반환: { removed: 지운 구독 수, saved_off: 끈 회원 설정 수 } — 없는 토큰이어도 오류 없이 0 (있는지 알려 주지 않음).
create or replace function public.unsubscribe_alert(p_tokens uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare a int := 0; b int := 0;
begin
  if p_tokens is null or cardinality(p_tokens) = 0 then
    return jsonb_build_object('removed', 0, 'saved_off', 0);
  end if;
  if cardinality(p_tokens) > 100 then
    raise exception using message = 'too many tokens', errcode = '22023';
  end if;
  if not public.rate_take('unsubscribe', 1, 300) then
    raise exception using message = 'too many requests', errcode = 'P0001';
  end if;
  delete from public.alert_subscriptions where unsubscribe_token = any (p_tokens);
  get diagnostics a = row_count;
  update public.user_alert_prefs set saved_races = false where unsubscribe_token = any (p_tokens) and saved_races;
  get diagnostics b = row_count;
  return jsonb_build_object('removed', a, 'saved_off', b);
end $$;
revoke execute on function public.unsubscribe_alert(uuid[]) from public;
grant execute on function public.unsubscribe_alert(uuid[]) to anon, authenticated;

commit;

-- ── 실행 뒤 할 일 (Cowork) ────────────────────────────────────────────────────────────────────
-- 1) 자동화 키 'alerts' 등록 — 값은 여기 쓰지 말고, SQL 편집기에서 직접 넣고 바로 지운다:
--      insert into public.automation_keys (name, key_hash)
--      values ('alerts', encode(extensions.digest('<새 키 값>', 'sha256'), 'hex'))
--      on conflict (name) do update set key_hash = excluded.key_hash;
-- 2) 확인 (키 없이 부르면 거절돼야 한다): select public.automation_due_alerts('x');  → ERROR automation key rejected
--
-- ── 되돌리기 ─────────────────────────────────────────────────────────────────────────────────
-- drop function if exists public.automation_due_alerts(text, date, text), public.automation_mark_sent(text, jsonb, text), public.unsubscribe_alert(uuid[]);
-- drop table if exists public.alert_send_log;
-- alter table public.user_alert_prefs drop column if exists unsubscribe_token, drop column if exists lang;
-- alter table public.alert_subscriptions drop column if exists lang;
-- delete from public.automation_keys where name = 'alerts';
