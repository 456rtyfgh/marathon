/**
 * GA 워커 단위 확인 (구글·Supabase 는 안 부른다): node scripts/ga-test.mjs
 * worker/ga.ts·gaRoute.ts 를 esbuild 로 임시 묶어 import 하고, fetch 는 가짜를 넣는다.
 * 서비스 계정 키는 실행 중 메모리에서 만든 가짜 RSA 키 — 파일로 쓰지 않는다.
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'ga-test-'));
const out = join(tmp, 'ga.mjs');
await build({
  stdin: {
    contents: "export * from './worker/ga.ts'; export * from './worker/gaRoute.ts'; export * from './src/lib/gaTypes.ts';",
    resolveDir: root,
    loader: 'ts',
  },
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  logLevel: 'error',
});
const ga = await import(pathToFileURL(out).href);
rmSync(tmp, { recursive: true, force: true });

let pass = 0;
let failN = 0;
function ok(cond, name) {
  if (cond) pass++;
  else failN++;
  console.log(`${cond ? '✔' : '✘'} ${name}`);
}

/* ── 가짜 서비스 계정 (메모리에서만) ─────────────────── */
const { subtle } = globalThis.crypto;
const pair = await subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const pkcs8 = Buffer.from(await subtle.exportKey('pkcs8', pair.privateKey)).toString('base64');
const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
const EMAIL = 'tester@fake-project.iam.gserviceaccount.com';
const SA_JSON = JSON.stringify({ type: 'service_account', client_email: EMAIL, private_key: pem, token_uri: 'https://oauth2.googleapis.com/token' });
const KEY_PIECE = pkcs8.slice(40, 80); // 응답·로그에 이 조각이 보이면 키가 샌 것

const b64urlDecode = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
async function verifyJwt(jwt) {
  const [h, c, s] = jwt.split('.');
  const good = await subtle.verify('RSASSA-PKCS1-v1_5', pair.publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`));
  return { header: JSON.parse(b64urlDecode(h)), claims: JSON.parse(b64urlDecode(c)), good, parts: jwt.split('.').length };
}

/* ── 1. 서비스 계정·JWT ───────────────────────────────── */
const sa = ga.parseServiceAccount(SA_JSON);
ok(sa.client_email === EMAIL, 'parseServiceAccount: client_email');
for (const bad of ['not json', '{"client_email":"a@b"}', '{"private_key":"x"}', 'null']) {
  let code = '';
  try {
    ga.parseServiceAccount(bad);
  } catch (e) {
    code = e.code;
  }
  ok(code === 'bad_key', `parseServiceAccount(${bad}) → bad_key`);
}

const NOW = 1_800_000_000;
const jwt = await ga.signJwt(sa, NOW);
const v = await verifyJwt(jwt);
ok(v.parts === 3 && !/[+/=]/.test(jwt), 'JWT: 세 부분, base64url');
ok(v.header.alg === 'RS256' && v.header.typ === 'JWT', 'JWT header RS256');
ok(
  v.claims.iss === EMAIL &&
    v.claims.scope === 'https://www.googleapis.com/auth/analytics.readonly' &&
    v.claims.aud === 'https://oauth2.googleapis.com/token' &&
    v.claims.iat === NOW &&
    v.claims.exp === NOW + 3600,
  'JWT claims (iss, scope, aud, iat, exp)',
);
ok(v.good, 'JWT 서명이 공개키로 검증됨');
// 붙여넣기에서 줄바꿈이 '\n' 글자로 남은 키도 받는다
const saEscaped = { client_email: EMAIL, private_key: pem.replace(/\n/g, '\\n') };
ok((await verifyJwt(await ga.signJwt(saEscaped, NOW))).good, "'\\n' 글자로 들어온 키도 서명됨");
let badPem = '';
try {
  await ga.signJwt({ client_email: EMAIL, private_key: '-----BEGIN PRIVATE KEY-----\n!!!\n-----END PRIVATE KEY-----' }, NOW);
} catch (e) {
  badPem = e.code;
}
ok(badPem === 'bad_key', '깨진 PEM → bad_key');

/* ── 가짜 fetch ───────────────────────────────────────── */
const SB = 'https://sb.example.test';
const ymd = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const kstDaysAgo = (n) => ymd(new Date(Date.now() - n * 86400e3));
const YESTERDAY = kstDaysAgo(1);
const THREE_AGO = kstDaysAgo(3);

/** 요청 본문 한 개 → 그럴듯한 GA 보고서 */
function fakeReport(req) {
  const dims = (req.dimensions ?? []).map((d) => d.name);
  const mets = (req.metrics ?? []).map((m) => m.name);
  const rep = (dh, rows) => ({
    dimensionHeaders: dh.map((name) => ({ name })),
    metricHeaders: mets.map((name) => ({ name, type: 'TYPE_INTEGER' })),
    rows: rows.map(([d, m]) => ({ dimensionValues: d.map((value) => ({ value })), metricValues: m.map((x) => ({ value: String(x) })) })),
    rowCount: rows.length,
  });
  if (!dims.length && req.dateRanges?.length === 2)
    return rep(['dateRange'], [
      [['cur'], [120, 80, 150, 16200, 0.523, 900]],
      [['prev'], [100, 70, 140, 9000, 0.5, 800]],
    ]);
  if (!dims.length) return rep([], [[[], [7]]]);
  const d = dims.join('+');
  if (d === 'date')
    return rep(['date'], [
      [[THREE_AGO.replace(/-/g, '')], [10, 12]],
      [[YESTERDAY.replace(/-/g, '')], [20, 25]],
    ]);
  if (d === 'country')
    return rep(['country'], Array.from({ length: 12 }, (_, i) => [[`나라${i}`], [100 - i]]).reverse());
  if (d === 'pagePath+pageTitle') return rep(dims, [[['/r/tokyo', '도쿄 마라톤'], [55]], [['/', '마라톤 캘린더'], [300]]]);
  if (d === 'eventName')
    return rep(['eventName'], [[['official_click'], [33]], [['page_view'], [999]], [['favorite'], [0]], [['share'], [4]]]);
  if (d === 'deviceCategory') return rep(dims, [[['mobile'], [80]], [['desktop'], [35]], [['tablet'], [5]]]);
  if (d === 'unifiedScreenName') return rep(dims, [[['마라톤 캘린더'], [5]], [['(not set)'], [1]]]);
  return rep(dims, [[['(not set)'], [3]], [['Organic Search'], [70]]]);
}

/**
 * opts: admin(true|false|'503'|'throw'), token('ok'|400), ga(200|403|429|500)
 * calls 에 [종류, url, init] 을 쌓는다
 */
function makeFetch(opts = {}) {
  const calls = [];
  const o = { admin: true, token: 'ok', ga: 200, ...opts };
  const fn = async (url, init = {}) => {
    calls.push([url.startsWith(SB) ? 'sb' : url.includes('oauth2') ? 'token' : 'ga', url, init]);
    const res = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.startsWith(SB)) {
      if (o.admin === 'throw') throw new TypeError('network');
      if (o.admin === '503') return res({ message: 'down' }, 503);
      if (init.headers?.Authorization === 'Bearer bad-jwt') return res({ message: 'JWT expired' }, 401);
      return res(o.admin === true);
    }
    if (url === 'https://oauth2.googleapis.com/token') {
      if (o.token !== 'ok') return res({ error: 'invalid_grant' }, o.token);
      return res({ access_token: 'ya29.fake', expires_in: 3599, token_type: 'Bearer' });
    }
    if (o.ga !== 200) return res({ error: { code: o.ga, message: 'nope' } }, o.ga);
    const body = JSON.parse(init.body);
    if (url.endsWith(':batchRunReports')) return res({ reports: body.requests.map(fakeReport) });
    if (url.endsWith(':runRealtimeReport') || url.endsWith(':runReport')) return res(fakeReport(body));
    return res({}, 404);
  };
  return { fn, calls, count: (k) => calls.filter((c) => c[0] === k).length };
}

/* ── 2. access token ──────────────────────────────────── */
ga.resetTokenCache();
{
  const f = makeFetch();
  const T0 = 1_800_000_000_000;
  const t1 = await ga.getAccessToken(sa, f.fn, T0);
  const [, url, init] = f.calls[0];
  const form = new URLSearchParams(init.body);
  ok(t1 === 'ya29.fake' && url === 'https://oauth2.googleapis.com/token' && init.method === 'POST', '토큰: POST oauth2 토큰 주소');
  ok(form.get('grant_type') === 'urn:ietf:params:oauth:grant-type:jwt-bearer', '토큰: grant_type jwt-bearer');
  ok((await verifyJwt(form.get('assertion'))).good, '토큰: assertion 이 서명 검증됨');
  await ga.getAccessToken(sa, f.fn, T0 + 30 * 60_000);
  ok(f.count('token') === 1, '토큰: 만료 전에는 캐시(다시 안 부름)');
  await ga.getAccessToken(sa, f.fn, T0 + 3599_000 - 30_000);
  ok(f.count('token') === 2, '토큰: 만료 60초 전부터는 새로 받음');
  ga.resetTokenCache();
  let code = '';
  try {
    await ga.getAccessToken(sa, makeFetch({ token: 400 }).fn, T0);
  } catch (e) {
    code = e.code;
  }
  ok(code === 'google_auth', '토큰: 구글 400 → google_auth');
}

/* ── 3. 요청 조립 ─────────────────────────────────────── */
// 2026-11-09T15:30Z = 서울 11-10 00:30 → 오늘은 서울 날짜 11-10
const FIXED = new Date('2026-11-09T15:30:00Z');
{
  const d = ga.rangeDates('7d', FIXED);
  ok(
    d.days === 7 && d.cur.startDate === '2026-11-03' && d.cur.endDate === '2026-11-09' && d.prev.startDate === '2026-10-27' && d.prev.endDate === '2026-11-02',
    'rangeDates 7d: 서울 날짜 기준 (cur 11-03~11-09, prev 10-27~11-02)',
  );
}
for (const [range, cur, prev] of [
  ['7d', ['2026-11-03', '2026-11-09'], ['2026-10-27', '2026-11-02']],
  ['28d', ['2026-10-13', '2026-11-09'], ['2026-09-15', '2026-10-12']],
  ['90d', ['2026-08-12', '2026-11-09'], ['2026-05-14', '2026-08-11']],
]) {
  const reqs = ga.buildReportRequests(range, FIXED);
  const t = reqs[0];
  ok(
    reqs.length === 8 &&
      t.dateRanges[0].startDate === cur[0] &&
      t.dateRanges[0].endDate === cur[1] &&
      t.dateRanges[1].startDate === prev[0] &&
      t.dateRanges[1].endDate === prev[1],
    `요청 ${range}: 8개, 지금/직전 기간 날짜`,
  );
  ok(
    reqs.slice(1).every((r) => r.dateRanges.length === 1 && r.dateRanges[0].startDate === cur[0] && r.dateRanges[0].endDate === cur[1]),
    `요청 ${range}: 나머지는 지금 기간만`,
  );
  const p = ga.parseReport(range, [], FIXED).period;
  ok(p.start === cur[0] && p.end === cur[1] && p.prevStart === prev[0] && p.prevEnd === prev[1], `해석 ${range}: period = 요청 기간`);
}
{
  const reqs = ga.buildReportRequests('7d');
  const dimsOf = (r) => (r.dimensions ?? []).map((d) => d.name).join('+');
  ok(
    JSON.stringify(reqs.map(dimsOf)) ===
      JSON.stringify(['', 'date', 'sessionDefaultChannelGroup', 'sessionSourceMedium', 'country', 'deviceCategory', 'pagePath+pageTitle', 'eventName']),
    '요청: 차원 순서',
  );
  ok(
    JSON.stringify(reqs[0].metrics.map((x) => x.name)) ===
      JSON.stringify(['activeUsers', 'newUsers', 'sessions', 'userEngagementDuration', 'engagementRate', 'screenPageViews']),
    '요청: 합계 지표 6개',
  );
  ok(JSON.stringify(reqs[7].dimensionFilter.filter.inListFilter.values) === JSON.stringify([...ga.GA_KEY_EVENTS]), '요청: 이벤트 필터 = GA_KEY_EVENTS');
  ok(reqs[3].limit === '10' && reqs[4].limit === '10' && reqs[6].limit === '10' && reqs[2].limit === '8', '요청: 상위 개수 제한');
  const rt = ga.buildRealtimeRequests();
  ok(rt.length === 3 && rt[1].dimensions[0].name === 'country' && rt[2].dimensions[0].name === 'unifiedScreenName' && rt[1].limit === '5', '실시간 요청: 합계·국가·페이지 상위 5');
}

/* ── 4. fetchReport / 해석 ────────────────────────────── */
ga.resetTokenCache();
{
  const f = makeFetch();
  const rep = await ga.fetchReport(sa, '7d', f.fn);
  const gaCalls = f.calls.filter((c) => c[0] === 'ga');
  ok(f.count('token') === 1, 'fetchReport: 토큰은 한 번만');
  ok(
    gaCalls.length === 2 &&
      gaCalls.every((c) => c[1] === 'https://analyticsdata.googleapis.com/v1beta/properties/562569875:batchRunReports'),
    'fetchReport: batchRunReports 2번 (속성 562569875)',
  );
  const sizes = gaCalls.map((c) => JSON.parse(c[2].body).requests.length).sort();
  ok(JSON.stringify(sizes) === '[3,5]', 'fetchReport: 5개 + 3개로 나눔');
  ok(gaCalls.every((c) => c[2].headers.Authorization === 'Bearer ya29.fake'), 'fetchReport: Bearer 토큰');
  ok(rep.configured === true && rep.range === '7d', '보고서: configured, range');
  ok(rep.totals.activeUsers.value === 120 && rep.totals.activeUsers.prev === 100, '보고서: 활성 사용자 지금/직전');
  ok(rep.totals.engagementPerUser.value === 135 && rep.totals.engagementPerUser.prev === 90, '보고서: 사용자당 참여 시간 = 참여 시간 / 활성 사용자');
  ok(rep.totals.engagementRate.value === 0.523 && rep.totals.pageViews.value === 900 && rep.totals.newUsers.prev === 70, '보고서: 참여율·페이지뷰·새 사용자');
  ok(rep.daily.length === 7 && rep.daily.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.date)), '일별: 7일, YYYY-MM-DD');
  ok(rep.daily[6].date === YESTERDAY && rep.daily[6].activeUsers === 20 && rep.daily[6].sessions === 25, '일별: 마지막 날 = 어제 (서울)');
  ok(rep.daily.find((d) => d.date === THREE_AGO)?.activeUsers === 10 && rep.daily.filter((d) => d.activeUsers === 0).length === 5, '일별: 빈 날은 0');
  ok(rep.period.end === YESTERDAY && rep.period.start === rep.daily[0].date, '기간: start~end = 일별 처음~끝');
  ok(new Date(rep.period.prevEnd).getTime() + 86400e3 === new Date(rep.period.start).getTime(), '기간: 직전 기간은 바로 앞');
  ok(rep.countries.length === 10 && rep.countries[0].value === 100 && rep.countries[0].label === '나라0', '국가: 상위 10, 큰 순');
  ok(rep.pages[0].label === '/' && rep.pages[0].extra === '마라톤 캘린더' && rep.pages[1].extra === '도쿄 마라톤', '페이지: 경로 + 제목, 큰 순');
  ok(JSON.stringify(rep.events) === JSON.stringify([{ label: 'official_click', value: 33 }, { label: 'share', value: 4 }]), '이벤트: 목록 밖·0 은 빠짐');
  ok(rep.devices.length === 3 && rep.channels[0].label === 'Organic Search' && rep.sourceMedium.some((r) => r.label === '(not set)'), '기기·채널·소스 (not set 유지)');
  // 빈 응답(방문 0)도 깨지지 않음
  const empty = ga.parseReport('28d', [{ reports: [{}, {}, {}, {}, {}] }, { reports: [{}, {}, {}] }]);
  ok(empty.daily.length === 28 && empty.totals.sessions.value === 0 && empty.totals.engagementPerUser.value === 0 && empty.pages.length === 0, '빈 응답: 0 과 빈 표');

  const rt = await ga.fetchRealtime(sa, f.fn);
  const rtCalls = f.calls.filter((c) => c[1].endsWith(':runRealtimeReport'));
  ok(rtCalls.length === 3, '실시간: runRealtimeReport 3번');
  ok(rt.activeUsers === 7 && rt.pages[0].label === '마라톤 캘린더' && rt.countries.length <= 5, '실시간: 합계·페이지');
  const one = await ga.callGa(sa, 'runReport', ga.buildReportRequests('7d')[4], f.fn);
  ok(f.calls.at(-1)[1].endsWith(':runReport') && one.rows.length === 12, 'callGa: runReport 도 부를 수 있음');
}

/* ── 5. /api/admin/ga ─────────────────────────────────── */
const logs = [];
const origErr = console.error;
const origWarn = console.warn;
console.error = (...a) => logs.push(a.join(' '));
console.warn = (...a) => logs.push(a.join(' '));
const bodies = [];
async function call({ env = {}, auth = 'Bearer user-jwt', q = '?range=7d', method = 'GET', fetch: f = makeFetch(), now } = {}) {
  ga.resetGaCache();
  const headers = auth ? { Authorization: auth } : {};
  const res = await ga.gaRoute(new Request(`https://marathon82.com/api/admin/ga${q}`, { method, headers }), { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'anon-key', ...env }, f.fn, now);
  const text = await res.text();
  bodies.push(text);
  return { res, status: res.status, json: JSON.parse(text), f };
}
const nostore = (r) => r.res.headers.get('Cache-Control') === 'private, no-store' && r.res.headers.get('Content-Type').startsWith('application/json');
const KEY = { GA_SERVICE_ACCOUNT: SA_JSON };

{
  let r = await call({ auth: null });
  ok(r.status === 403 && r.json.error === 'forbidden' && r.f.calls.length === 0, '라우트: 토큰 없음 → 403, 아무것도 안 부름');
  ok(nostore(r), '라우트: 403 도 private, no-store');
  r = await call({ auth: 'Basic abc' });
  ok(r.status === 403, '라우트: Bearer 아님 → 403');
  r = await call({ fetch: makeFetch({ admin: false }), env: KEY });
  ok(r.status === 403 && r.f.count('token') === 0 && r.f.count('ga') === 0, '라우트: is_admin false → 403 (키가 있어도 구글 안 부름)');
  r = await call({ auth: 'Bearer bad-jwt' });
  ok(r.status === 403, '라우트: Supabase 401(토큰 만료) → 403');
  const sbCall = r.f.calls[0];
  ok(
    sbCall[1] === `${SB}/rest/v1/rpc/is_admin` && sbCall[2].method === 'POST' && sbCall[2].headers.apikey === 'anon-key' && sbCall[2].body === '{}',
    '라우트: rpc/is_admin 을 POST, apikey + 사용자 토큰',
  );
  r = await call({ fetch: makeFetch({ admin: '503' }) });
  ok(r.status === 502 && r.json.error === 'auth_unavailable', '라우트: Supabase 503 → 502 auth_unavailable');
  r = await call({ fetch: makeFetch({ admin: 'throw' }) });
  ok(r.status === 502 && r.json.error === 'auth_unavailable', '라우트: Supabase 네트워크 오류 → 502');
  r = await call({ env: { SUPABASE_URL: '', SUPABASE_ANON_KEY: '' } });
  ok(r.status === 500 && r.json.error === 'no_supabase', '라우트: Supabase 주소 없음 → 500 no_supabase');
  r = await call({ method: 'POST' });
  ok(r.status === 405 && r.json.error === 'method', '라우트: POST → 405');

  r = await call({ q: '?range=1y' });
  ok(r.status === 400 && r.json.error === 'bad_range' && /7d, 28d, 90d/.test(r.json.message), '라우트: 범위 틀림 → 400');
  r = await call({ q: '' });
  ok(r.status === 400, '라우트: 범위 없음 → 400');
  r = await call();
  ok(r.status === 200 && JSON.stringify(r.json) === '{"configured":false}' && nostore(r), '라우트: 관리자 + 키 없음 → 200 {configured:false}');
  r = await call({ q: '?realtime=1' });
  ok(r.status === 200 && r.json.configured === false, '라우트: 실시간 + 키 없음 → {configured:false}');
  r = await call({ env: { GA_SERVICE_ACCOUNT: '   ' } });
  ok(r.json.configured === false, '라우트: 키가 공백뿐 → 설정 안 됨');

  r = await call({ env: { GA_SERVICE_ACCOUNT: 'not json' } });
  ok(r.status === 500 && r.json.error === 'bad_key', '라우트: 키 JSON 아님 → 500 bad_key');
  ga.resetTokenCache();
  r = await call({ env: KEY, fetch: makeFetch({ token: 400 }) });
  ok(r.status === 502 && r.json.error === 'google_auth', '라우트: 구글 토큰 실패 → 502 google_auth');
  ga.resetTokenCache();
  r = await call({ env: KEY, fetch: makeFetch({ ga: 403 }) });
  ok(r.status === 502 && r.json.error === 'ga_forbidden' && /뷰어/.test(r.json.message), '라우트: GA 403 → 502 ga_forbidden');
  r = await call({ env: KEY, fetch: makeFetch({ ga: 429 }) });
  ok(r.status === 502 && r.json.error === 'ga_quota', '라우트: GA 429 → 502 ga_quota');
  r = await call({ env: KEY, fetch: makeFetch({ ga: 500 }) });
  ok(r.status === 502 && r.json.error === 'ga_failed' && r.json.message.includes('(상태 500)'), '라우트: GA 500 → 502 ga_failed (상태 500)');
  ok(nostore(r), '라우트: 오류도 private, no-store');
}

// 캐시 (resetGaCache 를 안 하고 연달아 부른다)
{
  ga.resetGaCache();
  ga.resetTokenCache();
  const f = makeFetch();
  const env = { SUPABASE_URL: SB, SUPABASE_ANON_KEY: 'anon-key', ...KEY };
  const req = (q) => new Request(`https://marathon82.com/api/admin/ga${q}`, { headers: { Authorization: 'Bearer user-jwt' } });
  const T = 1_900_000_000_000;
  const r1 = await ga.gaRoute(req('?range=7d'), env, f.fn, T);
  const j1 = await r1.json();
  ok(r1.status === 200 && j1.configured === true && j1.range === '7d' && j1.daily.length === 7, '라우트: 관리자 + 키 → 200 GaReport');
  ok(r1.headers.get('Cache-Control') === 'private, no-store', '라우트: 200 도 private, no-store');
  const gaAfter1 = f.count('ga');
  await ga.gaRoute(req('?range=7d'), env, f.fn, T + 4 * 60_000);
  ok(f.count('ga') === gaAfter1 && f.count('sb') === 2, '라우트: 5분 안에는 구글 안 부름 (관리자 확인은 매번)');
  await ga.gaRoute(req('?range=28d'), env, f.fn, T + 4 * 60_000);
  ok(f.count('ga') === gaAfter1 + 2, '라우트: 다른 범위는 따로 받음');
  await ga.gaRoute(req('?range=7d'), env, f.fn, T + 5 * 60_000 + 1);
  ok(f.count('ga') === gaAfter1 + 4, '라우트: 5분 지나면 다시 받음');
  const rt1 = await (await ga.gaRoute(req('?realtime=1'), env, f.fn, T)).json();
  ok(rt1.configured === true && rt1.activeUsers === 7 && Array.isArray(rt1.countries), '라우트: 실시간 → configured + activeUsers');
  const gaRt = f.count('ga');
  await ga.gaRoute(req('?realtime=1'), env, f.fn, T + 20_000);
  ok(f.count('ga') === gaRt, '라우트: 실시간 25초 캐시');
  await ga.gaRoute(req('?realtime=1'), env, f.fn, T + 26_000);
  ok(f.count('ga') === gaRt + 3, '라우트: 실시간 25초 지나면 다시');
  const nonAdmin = await ga.gaRoute(req('?range=7d'), env, makeFetch({ admin: false }).fn, T + 1000);
  ok(nonAdmin.status === 403, '라우트: 캐시가 있어도 비관리자는 403');
  // 오류는 캐시 안 함
  ga.resetGaCache();
  await ga.gaRoute(req('?range=90d'), env, makeFetch({ ga: 500 }).fn, T);
  const f2 = makeFetch();
  const after = await ga.gaRoute(req('?range=90d'), env, f2.fn, T + 1000);
  ok(after.status === 200 && f2.count('ga') === 2, '라우트: 오류는 캐시 안 함');
  bodies.push(JSON.stringify(j1), JSON.stringify(rt1));
}

console.error = origErr;
console.warn = origWarn;
const leaked = [...bodies, ...logs].some((s) => s.includes(KEY_PIECE) || s.includes('PRIVATE KEY'));
ok(!leaked, '응답 본문·로그 어디에도 키 내용 없음');

console.log(`\n${pass} 통과, ${failN} 실패`);
process.exit(failN ? 1 : 0);
