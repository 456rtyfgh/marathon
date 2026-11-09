/**
 * 구글 애널리틱스(GA4) Data API 호출 (관리 화면 GA 분석용, worker/gaRoute.ts 가 쓴다).
 *  - 서비스 계정 JSON(Pages 비밀 변수 GA_SERVICE_ACCOUNT)으로 RS256 JWT 를 WebCrypto 로 서명 → 구글 토큰 교환
 *  - 받은 access token 은 이 워커 인스턴스 메모리에 만료 60초 전까지 둔다
 *  - batchRunReports 2번(보고서 8개) + runRealtimeReport 3번으로 화면에 필요한 숫자를 한 번에 받는다
 * 키 값(private_key)은 어디에도 남기지 않는다 — 오류 메시지·로그에도 넣지 않는다.
 */
import { GA_KEY_EVENTS, type GaDay, type GaRange, type GaRealtime, type GaReport, type GaRow } from '../src/lib/gaTypes';

export const GA_PROPERTY = '562569875';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const API = `https://analyticsdata.googleapis.com/v1beta/properties/${GA_PROPERTY}`;
/** 기간 날짜 계산 기준 (GA 속성 시간대 — 한국 사이트라 서울) */
const TIME_ZONE = 'Asia/Seoul';
const RANGE_DAYS: Record<GaRange, number> = { '7d': 7, '28d': 28, '90d': 90 };

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
const netFetch: FetchFn = (input, init) => fetch(input, init);

/** gaRoute 가 code 로 한국어 메시지를 고른다. status 는 우리 응답 상태, upstream 은 구글 응답 상태 */
export class GaFail extends Error {
  code: string;
  status: number;
  upstream?: number;
  constructor(code: string, status: number, upstream?: number) {
    super(code);
    this.code = code;
    this.status = status;
    this.upstream = upstream;
  }
}

/* ── 서비스 계정·JWT ───────────────────────────────────── */

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function parseServiceAccount(raw: string): ServiceAccount {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    throw new GaFail('bad_key', 500);
  }
  const o = v as Partial<ServiceAccount> | null;
  if (!o || typeof o.client_email !== 'string' || !o.client_email || typeof o.private_key !== 'string' || !o.private_key)
    throw new GaFail('bad_key', 500);
  return { client_email: o.client_email, private_key: o.private_key, token_uri: o.token_uri };
}

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const b64urlJson = (o: unknown) => b64url(enc.encode(JSON.stringify(o)));

/** PEM(PKCS#8) → 서명 키. 머리·꼬리 줄과 공백(붙여넣다 남은 '\n' 글자 포함)을 지우고 base64 를 푼다 */
async function importKey(pem: string): Promise<CryptoKey> {
  try {
    const body = pem.replace(/-----[^-]+-----/g, '').replace(/\\n/g, '').replace(/\s+/g, '');
    const bin = atob(body);
    const der = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
    return await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  } catch {
    throw new GaFail('bad_key', 500);
  }
}

export async function signJwt(sa: ServiceAccount, nowSec: number): Promise<string> {
  const head = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const claims = b64urlJson({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSec, exp: nowSec + 3600 });
  const input = `${head}.${claims}`;
  const key = await importKey(sa.private_key);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(input));
  return `${input}.${b64url(new Uint8Array(sig))}`;
}

/* ── access token (인스턴스 메모리 캐시) ───────────────── */

const tokens = new Map<string, { token: string; expMs: number }>();

/** 테스트용: 토큰 캐시 비우기 */
export const resetTokenCache = () => tokens.clear();

export async function getAccessToken(sa: ServiceAccount, fetchFn: FetchFn = netFetch, nowMs = Date.now()): Promise<string> {
  const hit = tokens.get(sa.client_email);
  if (hit && hit.expMs - 60_000 > nowMs) return hit.token;
  const assertion = await signJwt(sa, Math.floor(nowMs / 1000));
  let res: Response;
  try {
    res = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
  } catch {
    throw new GaFail('google_auth', 502);
  }
  if (!res.ok) throw new GaFail('google_auth', 502, res.status);
  const j = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!j?.access_token) throw new GaFail('google_auth', 502, res.status);
  tokens.set(sa.client_email, { token: j.access_token, expMs: nowMs + (Number(j.expires_in) || 3600) * 1000 });
  return j.access_token;
}

/* ── GA Data API ───────────────────────────────────────── */

export type GaMethod = 'runReport' | 'batchRunReports' | 'runRealtimeReport';

/** GA Data API v1beta 한 번 부르기 (속성 562569875). 실패는 GaFail 로 */
export async function callGa(sa: ServiceAccount, method: GaMethod, body: object, fetchFn: FetchFn = netFetch): Promise<unknown> {
  const token = await getAccessToken(sa, fetchFn);
  let res: Response;
  try {
    res = await fetchFn(`${API}:${method}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new GaFail('ga_failed', 502);
  }
  if (res.ok) return res.json();
  if (res.status === 401) {
    // 토큰이 먼저 끊겼다 — 다음 요청은 새로 받게
    tokens.delete(sa.client_email);
    throw new GaFail('google_auth', 502, 401);
  }
  if (res.status === 403) throw new GaFail('ga_forbidden', 502, 403);
  if (res.status === 429) throw new GaFail('ga_quota', 502, 429);
  throw new GaFail('ga_failed', 502, res.status);
}

interface DateRange {
  startDate: string;
  endDate: string;
}

/**
 * 서울 날짜 기준 'YYYY-MM-DD' 실제 날짜 (상대 표기 '7daysAgo' 를 쓰면 응답의 기간·일별 0 채우기와 하루 어긋날 수 있다).
 * 7d → 지금 오늘-7~어제, 직전 오늘-14~오늘-8 (오늘은 아직 덜 모여 뺀다)
 */
export function rangeDates(range: GaRange, now: Date = new Date()): { cur: DateRange; prev: DateRange; days: number } {
  const n = RANGE_DAYS[range];
  const today = ymdIn(now);
  return {
    cur: { startDate: addDays(today, -n), endDate: addDays(today, -1) },
    prev: { startDate: addDays(today, -2 * n), endDate: addDays(today, -n - 1) },
    days: n,
  };
}

const m = (name: string) => ({ name });
const byMetric = (metricName: string) => [{ metric: { metricName }, desc: true }];

export function buildReportRequests(range: GaRange, now: Date = new Date()): object[] {
  const { cur, prev, days } = rangeDates(range, now);
  const one = [cur];
  return [
    // 1) 합계 — 지금·직전 두 기간 (응답 줄의 dateRange 차원이 'cur' / 'prev')
    {
      dateRanges: [{ ...cur, name: 'cur' }, { ...prev, name: 'prev' }],
      metrics: ['activeUsers', 'newUsers', 'sessions', 'userEngagementDuration', 'engagementRate', 'screenPageViews'].map(m),
    },
    // 2) 일별
    {
      dateRanges: one,
      dimensions: [m('date')],
      metrics: [m('activeUsers'), m('sessions')],
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: String(days + 5),
    },
    // 3) 유입 채널
    { dateRanges: one, dimensions: [m('sessionDefaultChannelGroup')], metrics: [m('sessions')], orderBys: byMetric('sessions'), limit: '8' },
    // 4) 소스/매체
    { dateRanges: one, dimensions: [m('sessionSourceMedium')], metrics: [m('sessions')], orderBys: byMetric('sessions'), limit: '10' },
    // 5) 국가
    { dateRanges: one, dimensions: [m('country')], metrics: [m('activeUsers')], orderBys: byMetric('activeUsers'), limit: '10' },
    // 6) 기기
    { dateRanges: one, dimensions: [m('deviceCategory')], metrics: [m('activeUsers')], orderBys: byMetric('activeUsers') },
    // 7) 많이 본 페이지
    {
      dateRanges: one,
      dimensions: [m('pagePath'), m('pageTitle')],
      metrics: [m('screenPageViews')],
      orderBys: byMetric('screenPageViews'),
      limit: '10',
    },
    // 8) 주요 이벤트 (analytics.ts 가 보내는 이름만)
    {
      dateRanges: one,
      dimensions: [m('eventName')],
      metrics: [m('eventCount')],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: [...GA_KEY_EVENTS] } } },
      orderBys: byMetric('eventCount'),
    },
  ];
}

/** 실시간(최근 30분): 합계, 국가 상위 5, 페이지(제목) 상위 5. 실시간 API 에는 pagePath 가 없다 */
export function buildRealtimeRequests(): object[] {
  const minuteRanges = [{ startMinutesAgo: 29, endMinutesAgo: 0 }];
  const users = [m('activeUsers')];
  return [
    { metrics: users, minuteRanges },
    { dimensions: [m('country')], metrics: users, minuteRanges, orderBys: byMetric('activeUsers'), limit: '5' },
    { dimensions: [m('unifiedScreenName')], metrics: users, minuteRanges, orderBys: byMetric('activeUsers'), limit: '5' },
  ];
}

/** batchRunReports 는 한 번에 보고서 5개까지 */
const BATCH = 5;

export async function fetchReport(sa: ServiceAccount, range: GaRange, fetchFn: FetchFn = netFetch, now: Date = new Date()): Promise<GaReport> {
  // 요청 날짜와 해석(기간·일별)이 같은 날을 보게 now 를 한 번만 정한다
  const reqs = buildReportRequests(range, now);
  const chunks: object[][] = [];
  for (let i = 0; i < reqs.length; i += BATCH) chunks.push(reqs.slice(i, i + BATCH));
  // 토큰을 먼저 받아 두면 병렬 호출이 토큰을 두 번 받지 않는다
  await getAccessToken(sa, fetchFn);
  const batches = await Promise.all(chunks.map((requests) => callGa(sa, 'batchRunReports', { requests }, fetchFn)));
  return parseReport(range, batches, now);
}

export async function fetchRealtime(sa: ServiceAccount, fetchFn: FetchFn = netFetch): Promise<GaRealtime> {
  await getAccessToken(sa, fetchFn);
  const res = await Promise.all(buildRealtimeRequests().map((b) => callGa(sa, 'runRealtimeReport', b, fetchFn)));
  return parseRealtime(res);
}

/* ── 응답 해석 (순수 함수) ─────────────────────────────── */

interface RawReport {
  dimensionHeaders?: { name?: string }[];
  metricHeaders?: { name?: string }[];
  rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[];
}
interface Row {
  dims: Record<string, string>;
  mets: Record<string, number>;
}

function rowsOf(rep: unknown): Row[] {
  const r = (rep ?? {}) as RawReport;
  const dh = (r.dimensionHeaders ?? []).map((h) => h.name ?? '');
  const mh = (r.metricHeaders ?? []).map((h) => h.name ?? '');
  return (r.rows ?? []).map((row) => {
    const dims: Record<string, string> = {};
    const mets: Record<string, number> = {};
    dh.forEach((n, i) => (dims[n] = row.dimensionValues?.[i]?.value ?? ''));
    mh.forEach((n, i) => {
      const v = Number(row.metricValues?.[i]?.value ?? 0);
      mets[n] = Number.isFinite(v) ? v : 0;
    });
    return { dims, mets };
  });
}

const toRows = (rep: unknown, dim: string, met: string, limit?: number, extra?: string): GaRow[] =>
  rowsOf(rep)
    .map((r): GaRow => ({ label: r.dims[dim] ?? '', ...(extra ? { extra: r.dims[extra] ?? '' } : {}), value: r.mets[met] ?? 0 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

/** 그 시간대의 날짜 'YYYY-MM-DD' */
function ymdIn(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
/** 'YYYY-MM-DD' 에 n 일 더하기 */
function addDays(ymd: string, n: number): string {
  const t = new Date(`${ymd}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const fromGaDate = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s);

/** batches = batchRunReports 응답들 ({reports:[…]}) — buildReportRequests 순서 그대로 */
export function parseReport(range: GaRange, batches: unknown[], now: Date = new Date()): GaReport {
  const reps = batches.flatMap((b) => ((b as { reports?: unknown[] } | null)?.reports ?? []) as unknown[]);
  const [totalsRep, dailyRep, chanRep, srcRep, countryRep, deviceRep, pageRep, eventRep] = reps;
  const n = RANGE_DAYS[range];

  // 합계: dateRange 차원으로 지금/직전 구분 (줄이 없으면 0)
  const tot = rowsOf(totalsRep);
  const pick = (name: 'cur' | 'prev') => tot.find((r) => r.dims.dateRange === name)?.mets ?? {};
  const cur = pick('cur');
  const prev = pick('prev');
  const g = (o: Record<string, number>, k: string) => o[k] ?? 0;
  const metric = (k: string) => ({ value: g(cur, k), prev: g(prev, k) });
  const perUser = (o: Record<string, number>) => (g(o, 'activeUsers') > 0 ? g(o, 'userEngagementDuration') / g(o, 'activeUsers') : 0);

  // 일별: 요청한 기간(rangeDates) 일수만큼, 빈 날은 0
  const byDate = new Map<string, GaDay>();
  for (const r of rowsOf(dailyRep)) {
    const date = fromGaDate(r.dims.date ?? '');
    byDate.set(date, { date, activeUsers: g(r.mets, 'activeUsers'), sessions: g(r.mets, 'sessions') });
  }
  const dates = rangeDates(range, now);
  const start = dates.cur.startDate;
  const end = dates.cur.endDate;
  const daily: GaDay[] = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(start, i);
    daily.push(byDate.get(date) ?? { date, activeUsers: 0, sessions: 0 });
  }

  return {
    configured: true,
    range,
    period: { start, end, prevStart: dates.prev.startDate, prevEnd: dates.prev.endDate },
    totals: {
      activeUsers: metric('activeUsers'),
      newUsers: metric('newUsers'),
      sessions: metric('sessions'),
      engagementPerUser: { value: perUser(cur), prev: perUser(prev) },
      engagementRate: metric('engagementRate'),
      pageViews: metric('screenPageViews'),
    },
    daily,
    channels: toRows(chanRep, 'sessionDefaultChannelGroup', 'sessions', 8),
    sourceMedium: toRows(srcRep, 'sessionSourceMedium', 'sessions', 10),
    countries: toRows(countryRep, 'country', 'activeUsers', 10),
    devices: toRows(deviceRep, 'deviceCategory', 'activeUsers'),
    pages: toRows(pageRep, 'pagePath', 'screenPageViews', 10, 'pageTitle'),
    events: toRows(eventRep, 'eventName', 'eventCount').filter(
      (r) => r.value > 0 && (GA_KEY_EVENTS as readonly string[]).includes(r.label),
    ),
    fetchedAt: now.toISOString(),
  };
}

/** responses = runRealtimeReport 응답 3개 — buildRealtimeRequests 순서 그대로 */
export function parseRealtime(responses: unknown[], now: Date = new Date()): GaRealtime {
  const [totalRep, countryRep, pageRep] = responses;
  return {
    activeUsers: rowsOf(totalRep)[0]?.mets.activeUsers ?? 0,
    countries: toRows(countryRep, 'country', 'activeUsers', 5),
    pages: toRows(pageRep, 'unifiedScreenName', 'activeUsers', 5),
    fetchedAt: now.toISOString(),
  };
}
