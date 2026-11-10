/**
 * 알림 메일 워커 확인 — 진짜 Resend·Supabase 는 안 부른다: node scripts/alerts-worker-test.mjs
 *  - worker/alerts/*.ts · worker/cron.ts 를 esbuild 로 임시 묶어 import
 *  - fetch 를 가짜로: Supabase RPC 는 로컬 PGlite(0017 실제 SQL, service_role 로)에서 돌리고, Resend 는 기록만 하는 가짜
 *  → dueAlerts · 발송 · 중복 방지 · expected 제외 · 하루 한도 · 재시도 · 실패 기록 · 로그에 비밀값 없음
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { kstDay, makeDb, migration0017 } from './alerts-db.mjs';

const root = new URL('../', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'alerts-test-'));
const out = join(tmp, 'alerts.mjs');
await build({
  stdin: {
    contents: "export * from './worker/alerts/due.ts'; export * from './worker/alerts/email.ts'; export * from './worker/alerts/schedule.ts'; export * from './worker/alerts/unsubscribe.ts'; export { default as cron } from './worker/cron.ts';",
    resolveDir: root,
    loader: 'ts',
  },
  outfile: out, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'error',
});
const W = await import(pathToFileURL(out).href);
rmSync(tmp, { recursive: true, force: true });

let pass = 0;
let failN = 0;
function ok(cond, name, extra = '') {
  if (cond) pass++;
  else failN++;
  console.log(`${cond ? '✔' : '✘'} ${name}${!cond && extra ? ` — ${extra}` : ''}`);
}

// ── 로그 붙잡기 (비밀값이 찍히는지 본다) ──
const logs = [];
const orig = { log: console.log, error: console.error };
const capture = (on) => {
  if (on) {
    console.log = (...a) => logs.push(a.join(' '));
    console.error = (...a) => logs.push(a.join(' '));
  } else Object.assign(console, orig);
};

// ── 로컬 DB ──
const db = await makeDb();
await db.exec(migration0017());
const KEY = 'alerts-key-SECRET-123';
const SB_SECRET = 'sb_secret_TEST_ONLY_456';
const RESEND = 're_TEST_ONLY_789';
await db.exec(`insert into public.automation_keys (name, key_hash) values ('alerts', encode(extensions.digest('${KEY}', 'sha256'), 'hex'))`);

const T = kstDay();
const day = (n) => kstDay(n);
await db.exec(`
  insert into public.races (id, name_ko, name_en, city_ko, country_ko, country_code, region, race_date, date_confidence,
                            entry_type, entry_opens, entry_closes, entry_confidence, official_url, notes_ko) values
   ('tokyo',  '도쿄 마라톤', 'Tokyo Marathon', '도쿄', '일본', 'JP', '일본', '${day(120)}', 'confirmed', 'lottery', '${day(3)}', '${day(20)}', 'confirmed', 'https://www.marathon.tokyo', null),
   ('exp',    '예상 마라톤', 'Expected Marathon', '오사카', '일본', 'JP', '일본', '${day(3)}', 'expected', 'fcfs', '${day(3)}', '${day(14)}', 'expected', 'https://exp.example', null),
   ('cxl',    '취소 마라톤', 'Cancelled Marathon', '나고야', '일본', 'JP', '일본', '${day(3)}', 'confirmed', 'fcfs', '${day(3)}', null, 'confirmed', 'https://cxl.example', '[취소] 태풍'),
   ('berlin', '베를린 마라톤', 'Berlin Marathon', '베를린', '독일', 'DE', '유럽', '${day(1)}', 'confirmed', 'lottery', null, null, 'confirmed', 'https://www.bmw-berlin-marathon.com', null),
   ('xss',    '<b>나쁜</b> 마라톤', 'Bad <script>', '서울', '한국', 'KR', '아시아', '${day(200)}', 'confirmed', 'fcfs', null, '${day(3)}', 'confirmed', 'https://bad.example/?q="><script>', null);
`);
const M = (await db.query(`insert into auth.users (email, email_confirmed_at) values ('en.member@x.com', now()) returning id`)).rows[0].id;
await db.exec(`
  insert into public.alert_subscriptions (email, race_id, days_before, confirmed_at) values
    ('kim@x.com', 'tokyo', '{14,3}', now()), ('kim@x.com', 'exp', '{3}', now()), ('kim@x.com', 'cxl', '{3}', now()),
    ('kim@x.com', 'berlin', '{1}', now()),
    ('lee@x.com', 'exp', '{3}', now()),
    ('park@x.com', 'xss', '{3}', now());
  insert into public.user_alert_prefs (user_id, saved_races, days_before, lang) values ('${M}', true, '{3}', 'en');
  insert into public.user_favorites (user_id, race_id) values ('${M}', 'tokyo');
`);

// ── 가짜 fetch ──
const SB = 'https://sb.test';
const PUBLIC_SB = 'https://zhwmfvkwtmakieatlqtz.supabase.co'; // worker/memberCal.ts 의 공개 주소 (가짜 fetch 가 가로챔)
let sbCalls = [];
let resendCalls = [];
let resendPlan = []; // 차례로 꺼내 쓰는 응답 (비면 200)
let sbFailNext = 0;
async function fakeFetch(url, init = {}) {
  const u = new URL(url);
  const body = init.body ? JSON.parse(init.body) : {};
  if (u.origin === SB || u.origin === PUBLIC_SB) {
    const fn = u.pathname.replace('/rest/v1/rpc/', '');
    sbCalls.push({ fn, headers: init.headers, body, origin: u.origin });
    if (fn === 'unsubscribe_alert') {
      // 사이트 함수는 공개 키(anon)로 부른다
      await db.exec('set role anon');
      try {
        const r = (await db.query('select public.unsubscribe_alert($1::uuid[]) j', [`{${body.p_tokens.join(',')}}`])).rows[0].j;
        return new Response(JSON.stringify(r), { status: 200 });
      } catch (e) {
        return new Response(JSON.stringify({ message: e.message }), { status: 400 });
      } finally {
        await db.exec('reset role');
      }
    }
    if (sbFailNext > 0) {
      sbFailNext--;
      return new Response('{"message":"upstream"}', { status: 503 });
    }
    if (fn === 'keepalive') return new Response('null', { status: 200 });
    if (init.headers?.apikey !== SB_SECRET) return new Response('{"message":"permission denied"}', { status: 401 });
    try {
      await db.exec('set role service_role');
      let r;
      if (fn === 'automation_due_alerts') r = (await db.query('select public.automation_due_alerts($1, $2::date, $3) j', [body.p_key, body.p_date, body.p_channel])).rows[0].j;
      else if (fn === 'automation_mark_sent') r = (await db.query('select public.automation_mark_sent($1, $2::jsonb, $3) j', [body.p_key, JSON.stringify(body.p_items), body.p_channel])).rows[0].j;
      else return new Response('{}', { status: 404 });
      return new Response(JSON.stringify(r), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } catch (e) {
      return new Response(JSON.stringify({ message: e.message }), { status: 400 });
    } finally {
      await db.exec('reset role');
    }
  }
  if (url === 'https://api.resend.com/emails') {
    resendCalls.push({ headers: init.headers, body });
    const p = resendPlan.shift();
    if (p === 'throw') throw new TypeError('network down');
    if (p) return new Response(JSON.stringify(p.body ?? {}), { status: p.status, headers: p.headers ?? {} });
    return new Response(JSON.stringify({ id: `re_${resendCalls.length}` }), { status: 200 });
  }
  throw new Error(`unexpected fetch ${url}`);
}
const deps = { fetch: fakeFetch, sleep: async () => {}, gapMs: 0 };
const env = { SUPABASE_URL: SB, SUPABASE_SECRET_KEY: SB_SECRET, AUTOMATION_KEY: KEY, RESEND_API_KEY: RESEND, SITE_ORIGIN: 'https://marathon82.com', ALERT_DAILY_LIMIT: '100' };
const reset = () => {
  sbCalls = [];
  resendCalls = [];
  resendPlan = [];
};
const logRows = async () => (await db.query(`select email, race_id, kind, status, message_id from public.alert_send_log order by email, race_id, kind`)).rows;

// ── 1. dueAlerts (공용) ──
let due = await W.dueAlerts(env, deps);
ok(due.date === T && due.channel === 'email', 'dueAlerts: KST 오늘·채널', JSON.stringify({ d: due.date, T }));
const by = Object.fromEntries(due.groups.map((g) => [g.email, g]));
ok(JSON.stringify(Object.keys(by).sort()) === '["en.member@x.com","kim@x.com","park@x.com"]', 'dueAlerts: 받는 사람 (expected 만 있는 lee 는 없음)', JSON.stringify(Object.keys(by)));
ok(by['kim@x.com'].items.map((i) => `${i.race_id}:${i.kind}`).join(',') === 'berlin:race_day,tokyo:entry_opens', 'dueAlerts: 대회일 D-1 + 접수 시작 D-3 (expected·취소 빠짐)',
  by['kim@x.com'].items.map((i) => `${i.race_id}:${i.kind}`).join(','));
ok(sbCalls[0].headers.apikey === SB_SECRET && !sbCalls[0].headers.Authorization && sbCalls[0].body.p_key === KEY, 'dueAlerts: service 키는 apikey 헤더로 (sb_secret_ 는 Authorization 없음), 자동화 키는 본문');
const jwtEnv = { ...env, SUPABASE_SECRET_KEY: 'eyJhbGciOi.fake' };
reset();
await W.dueAlerts(jwtEnv, deps).catch(() => {});
ok(sbCalls[0].headers.Authorization === 'Bearer eyJhbGciOi.fake', '예전 service_role JWT 면 Authorization 도');
let pushDue = await W.dueAlerts(env, { ...deps, channel: 'push' });
ok(pushDue.channel === 'push' && pushDue.groups.find((g) => g.email === 'en.member@x.com')?.user_id === M, "dueAlerts(channel 'push'): 회원 user_id 포함 (푸시 쪽 재사용)");
let e = await W.dueAlerts({ ...env, AUTOMATION_KEY: 'wrong' }, deps).catch((x) => x);
ok(e instanceof W.AlertsRpcError && e.status === 400 && /automation key rejected/.test(e.message), '틀린 자동화 키 → 오류 (다시 시도 안 함)', String(e));

// ── 2. 메일 문안 ──
const ko = W.renderAlertEmail(by['kim@x.com']);
ok(/^\[마라톤 캘린더\] 베를린 마라톤 대회일 D-1 외 1건$/.test(ko.subject), '한국어 제목 (여러 건 묶음)', ko.subject);
ok(ko.html.includes('https://www.marathon.tokyo') && ko.html.includes('https://marathon82.com/r/tokyo') && ko.text.includes('https://marathon82.com/r/berlin'), '한국어: 공식(접수) 링크 + 사이트 상세 링크');
ok(new RegExp(`${day(3).slice(0, 4)}년 \\d+월 \\d+일 \\(.\\)`).test(ko.html) && ko.text.includes(`${Number(day(3).slice(0, 4))}년`), '날짜에 연도 포함', ko.text.slice(0, 200));
ok(ko.html.includes('https://marathon82.com/unsubscribe?t=') && ko.listUnsubscribe.split('t=')[1].split(',').length === 4, "수신 거부 링크 (대회별 + '모두' = 이 주소 확인된 구독 4개)", ko.listUnsubscribe);
ok(ko.text.includes('광고가 없는 정보성 메일') && !/\(광고\)/.test(ko.subject), '정보성 메일 표기, 광고 표기 없음');
const en = W.renderAlertEmail(by['en.member@x.com']);
ok(/^\[Marathon Calendar\] Tokyo Marathon — registration opens in 3 days \([A-Z][a-z]{2}, [A-Z][a-z]{2} \d+, \d{4}\)$/.test(en.subject), '영어 제목 (연도 포함)', en.subject);
ok(en.html.includes('https://marathon82.com/en/r/tokyo') && en.listUnsubscribe.endsWith('&lang=en') && en.text.includes('informational email (no ads)') && !/[가-힣]/.test(en.text), '영어: /en 상세 링크·영어 수신 거부·한글 없음', en.text);
const bad = W.renderAlertEmail(by['park@x.com']);
ok(!bad.html.includes('<b>나쁜') && bad.html.includes('&lt;b&gt;나쁜') && !bad.html.includes('"><script>') && bad.html.includes('&quot;&gt;&lt;script&gt;'), 'HTML 이스케이프 (이름·주소)');
const jsGroup = { ...by['park@x.com'], items: by['park@x.com'].items.map((i) => ({ ...i, official_url: 'javascript:alert(1)' })) };
ok(!W.renderAlertEmail(jsGroup).html.includes('javascript:'), 'http(s) 아닌 공식 주소는 링크로 안 씀');
ok(W.fmtDateLong('2027-01-13', 'ko') === '2027년 1월 13일 (수)' && W.fmtDateLong('2027-01-13', 'en') === 'Wed, Jan 13, 2027', 'fmtDateLong');

// ── 3. 보내기 + 중복 방지 ──
reset();
capture(true);
let s = await W.sendAlertEmails(env, deps);
capture(false);
ok(s.sent === 3 && s.failed === 0 && s.deferred === 0 && resendCalls.length === 3, '3통 보냄', JSON.stringify(s));
const c0 = resendCalls.find((c) => c.body.to[0] === 'kim@x.com');
ok(c0.headers.Authorization === `Bearer ${RESEND}` && c0.body.from === '마라톤 캘린더 <noreply@marathon82.com>' && /^alert-[0-9a-f]{48}$/.test(c0.headers['Idempotency-Key']),
  'Resend 요청: 키 헤더·보내는 주소·Idempotency-Key', JSON.stringify(c0.headers).replace(RESEND, '***'));
ok(c0.body.headers['List-Unsubscribe'].startsWith('<https://marathon82.com/unsubscribe?t=') && c0.body.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', 'List-Unsubscribe 헤더');
ok(resendCalls.find((c) => c.body.to[0] === 'en.member@x.com').body.from === 'Marathon Calendar <noreply@marathon82.com>', '영어 사용자는 영어 보내는 이름');
ok(!resendCalls.some((c) => JSON.stringify(c.body).includes('exp.example') || JSON.stringify(c.body).includes('cxl.example')), 'expected·취소 대회는 어떤 메일에도 없음');
let rows = await logRows();
ok(rows.length === 4 && rows.every((r) => r.status === 'sent' && /^re_\d$/.test(r.message_id)), '발송 기록 4건 (메일 id 포함)', JSON.stringify(rows));
reset();
s = await W.sendAlertEmails(env, deps);
ok(s.sent === 0 && resendCalls.length === 0, '다시 돌려도 0통 (중복 방지)', JSON.stringify(s));
ok(logs.length > 0 && !logs.some((l) => l.includes(RESEND) || l.includes(SB_SECRET) || l.includes(KEY) || l.includes('kim@x.com')), '로그에 비밀값·이메일 전체 없음', logs.join(' | '));

// ── 4. 하루 한도 → 다음 날 이어서 ──
await db.exec(`delete from public.alert_send_log`);
reset();
s = await W.sendAlertEmails({ ...env, ALERT_DAILY_LIMIT: '1' }, deps);
ok(s.sent === 1 && s.deferred === 2 && s.stopped === 'daily limit', '한도 1: 1통 보내고 2명 다음으로', JSON.stringify(s));
reset();
s = await W.sendAlertEmails({ ...env, ALERT_DAILY_LIMIT: '1' }, deps);
ok(s.sent === 0 && s.deferred === 2, '같은 날 다시 돌려도 한도 그대로 (오늘 보낸 수를 DB 에서 셈)', JSON.stringify(s));
reset();
s = await W.sendAlertEmails({ ...env, ALERT_DAILY_LIMIT: '100' }, { ...deps, date: day(1) });
ok(s.sent === 2 && s.date === day(1), '다음 날: 남은 2명 보냄', JSON.stringify(s));
const late = resendCalls.map((c) => c.body.subject).join(' / ');
ok(/D-2|in 2 days/.test(late), '이어 보낸 메일은 남은 날(D-2)로 표시', late);
ok(!resendCalls.some((c) => c.body.to[0] === 'kim@x.com'), '어제 받은 사람은 다음 날 다시 안 받음', late);

// ── 5. 실패 처리 ──
await db.exec(`delete from public.alert_send_log`);
reset();
resendPlan = [{ status: 500 }, 'throw']; // 첫 사람: 500 → 연결 실패 → 성공
s = await W.sendAlertEmails(env, deps);
ok(s.sent === 3 && resendCalls.length === 5, 'Resend 500·연결 실패 → 다시 시도해서 성공', JSON.stringify(s));
ok(new Set(resendCalls.slice(0, 3).map((c) => c.headers['Idempotency-Key'])).size === 1, '재시도는 같은 Idempotency-Key');
await db.exec(`delete from public.alert_send_log`);
reset();
resendPlan = [{ status: 503 }, { status: 503 }, { status: 503 }, { status: 422, body: { name: 'validation_error' } }];
s = await W.sendAlertEmails(env, deps);
ok(s.retryLater === 1 && s.failed === 1 && s.sent === 1, '세 번 다 5xx → 다음 실행으로 / 422 → 포기', JSON.stringify(s));
rows = await logRows();
ok(rows.filter((r) => r.status === 'failed').length >= 1 && rows.filter((r) => r.status === 'sent').length >= 1, "422 는 'failed' 로 기록, 5xx 는 기록 안 함", JSON.stringify(rows));
reset();
s = await W.sendAlertEmails(env, deps);
ok(s.sent === 1 && resendCalls.length === 1, '다음 실행(12:17 재시도): 5xx 였던 사람만 보냄, failed 는 다시 안 보냄', JSON.stringify(s));
await db.exec(`delete from public.alert_send_log`);
reset();
resendPlan = [{ status: 429, body: { name: 'daily_quota_exceeded' } }];
s = await W.sendAlertEmails(env, deps);
ok(s.stopped === 'resend quota' && resendCalls.length === 1 && s.deferred === 2, 'Resend 하루 한도(429 quota) → 바로 멈추고 다음으로', JSON.stringify(s));
reset();
resendPlan = [{ status: 429, body: { name: 'rate_limit_exceeded' }, headers: { 'retry-after': '1' } }];
s = await W.sendAlertEmails(env, deps);
ok(s.sent === 3 && resendCalls.length === 4, '초당 한도(429 rate) → 기다렸다 다시', JSON.stringify(s));
await db.exec(`delete from public.alert_send_log`);
reset();
resendPlan = [{ status: 401, body: { name: 'invalid_api_key' } }];
s = await W.sendAlertEmails(env, deps);
ok(s.stopped === 'resend auth' && resendCalls.length === 1 && (await logRows()).length === 0, 'Resend 키 거절 → 멈춤, 아무것도 기록 안 함', JSON.stringify(s));
reset();
sbFailNext = 1;
s = await W.sendAlertEmails(env, deps);
ok(s.sent === 3 && sbCalls[0].fn === 'automation_due_alerts' && sbCalls[1].fn === 'automation_due_alerts', 'Supabase 503 → 다시 시도', JSON.stringify(s));

// ── 6. 설정 없음 ──
reset();
capture(true);
s = await W.sendAlertEmails({ SUPABASE_URL: SB, SUPABASE_SECRET_KEY: '', AUTOMATION_KEY: KEY }, deps);
capture(false);
ok(/SUPABASE_SECRET_KEY, RESEND_API_KEY/.test(s.stopped ?? '') && sbCalls.length + resendCalls.length === 0, '비밀값 없음 → 이름만 알리고 아무것도 안 부름', s.stopped);

// ── 7. 수신 거부 페이지 ──
const tokKim = (await db.query(`select unsubscribe_token::text t from public.alert_subscriptions where email = 'kim@x.com' and race_id = 'tokyo'`)).rows[0].t;
const tokM = (await db.query(`select unsubscribe_token::text t from public.user_alert_prefs where user_id = '${M}'`)).rows[0].t;
const U = (q, method = 'GET', body) => new Request(`https://marathon82.com/unsubscribe${q}`, { method, body });
reset();
let res = await W.unsubscribeRoute(U(`?t=${tokKim}`), {}, fakeFetch);
let html = await res.text();
ok(res.status === 200 && /<form method="post"/.test(html) && sbCalls.length === 0, 'GET: 확인 버튼만 (아무것도 안 바꿈 — 메일 검사기가 열어도 안전)');
ok(res.headers.get('X-Robots-Tag') === 'noindex' && res.headers.get('Cache-Control') === 'private, no-store' && res.headers.get('Referrer-Policy') === 'no-referrer', 'noindex·no-store·no-referrer');
res = await W.unsubscribeRoute(U('?t=nope'), {}, fakeFetch);
ok(res.status === 400 && sbCalls.length === 0, '토큰 형식 틀림 → 400, RPC 안 부름');
res = await W.unsubscribeRoute(U(`?t=${tokKim},${tokM}&lang=en`, 'POST', 'List-Unsubscribe=One-Click'), {}, fakeFetch);
html = await res.text();
ok(res.status === 200 && /Done\./.test(html) && sbCalls[0]?.fn === 'unsubscribe_alert' && sbCalls[0].headers.apikey.startsWith('sb_publishable_'), 'POST(원클릭): 공개 키로 unsubscribe_alert → 영어 완료 화면', `${res.status} ${JSON.stringify(sbCalls[0]?.headers)}`);
const left = (await db.query(`select (select count(*) from public.alert_subscriptions where unsubscribe_token = '${tokKim}')::int a, (select saved_races from public.user_alert_prefs where user_id = '${M}') b`)).rows[0];
ok(left.a === 0 && left.b === false, '실제로 구독 삭제 + 저장 대회 알림 꺼짐', JSON.stringify(left));
reset();
await db.exec(`delete from public.alert_send_log`);
due = await W.dueAlerts(env, deps);
ok(!due.groups.some((g) => g.email === 'en.member@x.com') && !due.groups.find((g) => g.email === 'kim@x.com')?.items.some((i) => i.race_id === 'tokyo'), '수신 거부 뒤엔 오늘 알림에서도 빠짐');
res = await W.unsubscribeRoute(U(`?t=${tokKim}`, 'DELETE'), {}, fakeFetch);
ok(res.status === 405, '다른 메서드 → 405');

// ── 8. 예약 실행 ──
const at = (h) => Date.UTC(2026, 10, 10, h, 17);
ok(W.shouldSendAlerts('0 23 * * *', Date.UTC(2026, 10, 10, 23)) && W.shouldSendAlerts('17 3,15 * * *', at(3)) && !W.shouldSendAlerts('17 3,15 * * *', at(15)),
  '08:00 KST 보냄 · 12:17 KST 재시도 · 00:17 KST 는 안 보냄');
ok(!W.shouldKeepalive('0 23 * * *') && W.shouldKeepalive('17 3,15 * * *'), '08:00 은 DB 깨우기 안 함 (기존 두 번 그대로)');
const realFetch = globalThis.fetch;
globalThis.fetch = fakeFetch;
reset();
const waits = [];
await W.cron.scheduled({ cron: '17 3,15 * * *', scheduledTime: at(15) }, { ...env, SUPABASE_KEY: 'pub' }, { waitUntil: (p) => waits.push(p) });
await Promise.allSettled(waits);
ok(sbCalls.map((c) => c.fn).join() === 'keepalive' && resendCalls.length === 0, 'cron 15:17 UTC → 깨우기만', sbCalls.map((c) => c.fn).join());
globalThis.fetch = realFetch;

console.log(`\n${pass} ok, ${failN} fail`);
process.exit(failN ? 1 : 0);
