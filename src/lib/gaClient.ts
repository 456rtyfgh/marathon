/**
 * 관리 화면 → 같은 출처 /api/admin/ga (PLAN 1-2·1-5). 로그인한 사용자의 Supabase access token 을 Bearer 로 보낸다.
 * 모킹 모드(개발 서버 전용): 주소에 ?gamock=ok|off|error|slow 가 있으면 서버 대신 gaMock.ts 를 쓴다.
 */
import { supabase } from './supabase';
import type { GaRange, GaRealtimeResponse, GaReportResponse } from './gaTypes';

/** fromServer = 서버가 준 한국어 message 그대로 (화면이 번역하지 않는다). status 0 = 요청 전 (로그인 없음) */
export class GaFetchError extends Error {
  status: number;
  fromServer: boolean;
  constructor(message: string, status: number, fromServer: boolean) {
    super(message);
    this.name = 'GaFetchError';
    this.status = status;
    this.fromServer = fromServer;
  }
}

const failed = (status: number) => new GaFetchError(`불러오지 못했습니다. (상태 ${status})`, status, false);

/** 개발 서버이고 주소에 gamock 이 있으면 그 값 ('' 이면 ok), 아니면 null */
function mockMode(): string | null {
  if (!import.meta.env.DEV) return null;
  return new URLSearchParams(location.search).get('gamock');
}

async function get<T extends { configured: boolean }>(query: string, signal?: AbortSignal): Promise<T> {
  if (import.meta.env.DEV) {
    const mode = mockMode();
    if (mode !== null) {
      const { mockGa } = await import('./gaMock');
      return (await mockGa(query, mode, signal)) as T;
    }
  }
  if (!supabase) throw new GaFetchError('로그인이 필요합니다.', 0, false);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new GaFetchError('로그인이 필요합니다.', 0, false);

  const res = await fetch(`/api/admin/ga?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch (e) {
    if (signal?.aborted) throw e;
    body = null; // 개발 서버가 /api/... 에 index.html 을 돌려주는 경우 등
  }
  if (!res.ok) {
    const msg = (body as { message?: unknown } | null)?.message;
    if (typeof msg === 'string' && msg) throw new GaFetchError(msg, res.status, true);
    throw failed(res.status);
  }
  if (!body || typeof body !== 'object' || typeof (body as { configured?: unknown }).configured !== 'boolean') throw failed(res.status);
  return body as T;
}

/** 기간 보고서. 오류면 GaFetchError throw */
export const fetchGaReport = (range: GaRange, signal?: AbortSignal) =>
  get<GaReportResponse>(`range=${encodeURIComponent(range)}`, signal);

/** 최근 30분 실시간 */
export const fetchGaRealtime = (signal?: AbortSignal) => get<GaRealtimeResponse>('realtime=1', signal);
