/**
 * GET /api/admin/ga?range=7d|28d|90d  → GA 보고서 (GaReportResponse)
 * GET /api/admin/ga?realtime=1        → 실시간 30분 (GaRealtimeResponse)
 * 관리자만: Authorization: Bearer <Supabase 사용자 access token> 으로 Supabase rpc/is_admin 이 true 일 때만.
 * 비관리자는 키가 있는지도 알 수 없게, 관리자 확인을 키 확인보다 먼저 한다.
 * 응답은 늘 Cache-Control: private, no-store. 같은 결과는 인스턴스 메모리에 보고서 5분·실시간 25초.
 */
import { GA_RANGES, type GaError, type GaRange } from '../src/lib/gaTypes';
import { fetchRealtime, fetchReport, GaFail, parseServiceAccount } from './ga';

// Supabase 주소·anon 키 (scripts/pages.mjs 가 빌드 때 esbuild define 으로 넣는다 — anon 키는 원래 공개 값)
declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;
const BUILT_SB_URL = typeof __SUPABASE_URL__ === 'string' ? __SUPABASE_URL__ : '';
const BUILT_SB_KEY = typeof __SUPABASE_ANON_KEY__ === 'string' ? __SUPABASE_ANON_KEY__ : '';

export interface GaEnv {
  GA_SERVICE_ACCOUNT?: string;
  /** 있으면 빌드 값 대신 (로컬 wrangler pages dev 에서 가짜 Supabase 로 돌릴 때) */
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
const netFetch: FetchFn = (input, init) => fetch(input, init);

const REPORT_TTL = 5 * 60_000;
const REALTIME_TTL = 25_000;
const cache = new Map<string, { at: number; body: string }>();

/** 테스트용: 결과 캐시 비우기 */
export const resetGaCache = () => cache.clear();

const MESSAGES: Record<string, string> = {
  method: 'GET 만 받습니다.',
  no_supabase: '서버에 Supabase 주소가 설정되지 않았습니다.',
  forbidden: '관리자만 볼 수 있습니다.',
  auth_unavailable: '관리자 확인(Supabase)에 실패했습니다. 잠시 뒤 다시 시도해 주세요.',
  bad_range: '기간은 7d, 28d, 90d 중 하나여야 합니다.',
  bad_key: 'GA_SERVICE_ACCOUNT 값이 서비스 계정 JSON 형식이 아닙니다.',
  google_auth: '구글 인증에 실패했습니다. 서비스 계정 키를 확인해 주세요.',
  ga_forbidden: 'GA 속성에 서비스 계정 권한이 없습니다. GA 관리 → 속성 액세스 관리에 서비스 계정 이메일을 뷰어로 추가해 주세요.',
  ga_quota: 'GA 호출 한도를 넘었습니다. 잠시 뒤 다시 시도해 주세요.',
  ga_failed: 'GA 데이터를 받지 못했습니다.',
  internal: 'GA 데이터를 처리하지 못했습니다.',
};

const reply = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

function fail(code: string, status: number, upstream?: number): Response {
  let message = MESSAGES[code] ?? MESSAGES.internal;
  if (code === 'ga_failed' && upstream) message = `GA 데이터를 받지 못했습니다. (상태 ${upstream})`;
  const body: GaError = { error: code, message };
  return reply(JSON.stringify(body), status);
}

/** Supabase rpc/is_admin 을 그 사용자 토큰으로. true 만 관리자, 그 밖 상태는 false, 네트워크·5xx 는 null(확인 불가) */
async function isAdmin(sbUrl: string, sbKey: string, token: string, fetchFn: FetchFn): Promise<boolean | null> {
  let res: Response;
  try {
    res = await fetchFn(`${sbUrl.replace(/\/+$/, '')}/rest/v1/rpc/is_admin`, {
      method: 'POST',
      headers: { apikey: sbKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
    });
  } catch {
    return null;
  }
  if (res.status >= 500) return null;
  if (!res.ok) return false;
  return (await res.json().catch(() => null)) === true;
}

export async function gaRoute(req: Request, env: GaEnv, fetchFn: FetchFn = netFetch, nowMs = Date.now()): Promise<Response> {
  if (req.method !== 'GET') return fail('method', 405);
  const sbUrl = env.SUPABASE_URL || BUILT_SB_URL;
  const sbKey = env.SUPABASE_ANON_KEY || BUILT_SB_KEY;
  if (!sbUrl || !sbKey) return fail('no_supabase', 500);

  const token = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(\S{1,4096})$/i)?.[1];
  if (!token) return fail('forbidden', 403);
  const admin = await isAdmin(sbUrl, sbKey, token, fetchFn);
  if (admin === null) return fail('auth_unavailable', 502);
  if (!admin) return fail('forbidden', 403);

  const url = new URL(req.url);
  const realtime = url.searchParams.get('realtime') === '1';
  const rangeParam = url.searchParams.get('range');
  const range = GA_RANGES.find((r) => r === rangeParam) as GaRange | undefined;
  if (!realtime && !range) return fail('bad_range', 400);

  const raw = env.GA_SERVICE_ACCOUNT?.trim();
  if (!raw) return reply(JSON.stringify({ configured: false }));

  const key = realtime ? 'realtime' : `report:${range}`;
  const ttl = realtime ? REALTIME_TTL : REPORT_TTL;
  const hit = cache.get(key);
  if (hit && nowMs - hit.at < ttl) return reply(hit.body);

  try {
    const sa = parseServiceAccount(raw);
    const data = realtime ? { configured: true, ...(await fetchRealtime(sa, fetchFn)) } : await fetchReport(sa, range!, fetchFn);
    const body = JSON.stringify(data);
    cache.set(key, { at: nowMs, body });
    return reply(body);
  } catch (e) {
    if (e instanceof GaFail) return fail(e.code, e.status, e.upstream);
    // 예상 못 한 오류: 메시지만 남긴다 (키·응답 본문은 남기지 않는다)
    console.error('ga: internal', e instanceof Error ? e.name : typeof e);
    return fail('internal', 500);
  }
}
