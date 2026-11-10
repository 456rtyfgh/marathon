/**
 * 오늘 보낼 일정 알림 (메일·휴대폰 푸시 공용). DB 규칙은 supabase/migrations/0017_alert_send.sql 에 있다:
 *  - 'confirmed' 날짜만 (expected·tbc 제외), 취소·중단 대회 제외, 조기 마감이면 '접수 마감' 제외
 *  - 알림 날짜 = 일정 − days_before. 못 보낸 것은 3일까지 이어서. 보낸 것은 alert_send_log 로 다시 안 보냄
 *  - 채널('email' | 'push')마다 기록이 따로 → 메일을 보냈어도 푸시는 따로 나간다
 *
 * 쓰는 법 (푸시 쪽도 같게):
 *   const due = await dueAlerts(env, { channel: 'push' });
 *   for (const g of due.groups) { ...보내기...; await markSent(env, marksFor(g, g.items, { message_id }), { channel: 'push' }); }
 *
 * 비밀값은 env 이름만 쓴다: SUPABASE_URL, SUPABASE_SECRET_KEY(service 키 — 0012 [M5] 뒤 automation_* 는 service_role 만),
 * AUTOMATION_KEY(automation_keys.name = 'alerts' 의 원문). 값·응답 본문의 키는 로그에 남기지 않는다.
 */

export type AlertKind = 'entry_opens' | 'entry_closes' | 'race_day';
export type AlertChannel = 'email' | 'push';
export type AlertLang = 'ko' | 'en';

export interface AlertItem {
  race_id: string;
  kind: AlertKind;
  /** 알리는 일정 날짜 YYYY-MM-DD (접수 시작일·마감일·대회일) */
  event_date: string;
  /** 원래 보내기로 한 날 = event_date − days_before (기록 키) */
  scheduled_for: string;
  /** 오늘부터 일정까지 남은 날 (이어 보낸 알림이면 days_before 보다 작다) */
  days_left: number;
  name_ko: string;
  name_en: string;
  city_ko: string;
  country_ko: string;
  race_date: string;
  official_url: string;
  /** 이 대회 알림만 끄는 토큰들 (/unsubscribe?t=a,b) */
  unsubscribe_tokens: string[];
}

export interface AlertGroup {
  /** 소문자 이메일. 한 그룹 = 한 사람 = 메일 한 통 */
  email: string;
  /** 같은 이메일의 메일 인증된 회원 id (없으면 null — 푸시는 회원만 가능) */
  user_id: string | null;
  lang: AlertLang;
  /** 이 주소의 모든 알림을 끄는 토큰들 */
  unsubscribe_tokens: string[];
  /** 가까운 일정 순 */
  items: AlertItem[];
}

export interface DueAlerts {
  /** 기준 날짜(KST) YYYY-MM-DD */
  date: string;
  channel: AlertChannel;
  /** 오늘(KST) 이 채널로 이미 보낸 통 수 (메일 하루 한도 계산용) */
  sent_today: number;
  /** 가장 가까운 일정 순 */
  groups: AlertGroup[];
}

export interface SentMark {
  email: string;
  race_id: string;
  kind: AlertKind;
  event_date: string;
  scheduled_for: string;
  /** 'failed' = 주소 오류처럼 다시 보내도 안 되는 것 (다시 안 보냄). 잠깐 실패는 기록하지 말 것 → 다음 실행에서 다시 */
  status?: 'sent' | 'failed';
  message_id?: string | null;
}

export interface AlertsEnv {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  AUTOMATION_KEY: string;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export interface AlertsDeps {
  fetch?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** 설정이 빠졌으면 이름만 알려 준다 (값은 안 찍음) */
export function missingEnv(env: Partial<Record<string, unknown>>, names: string[]): string[] {
  return names.filter((n) => typeof env[n] !== 'string' || !(env[n] as string).trim());
}

/** service 키 헤더: 새 sb_secret_ 키는 apikey 만, 예전 service_role JWT(eyJ…)는 Authorization 도 (scripts/link_audit.py 와 같음) */
function sbHeaders(env: AlertsEnv): Record<string, string> {
  const k = env.SUPABASE_SECRET_KEY.trim();
  const h: Record<string, string> = { apikey: k, 'Content-Type': 'application/json' };
  if (k.startsWith('eyJ')) h.Authorization = `Bearer ${k}`;
  return h;
}

export class AlertsRpcError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Supabase RPC 한 번. 연결 실패·5xx·429 는 세 번까지 다시 (5초·10초 쉬고), 4xx 는 바로 오류 */
async function rpc<T>(env: AlertsEnv, fn: string, body: unknown, deps: AlertsDeps = {}): Promise<T> {
  const f = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? realSleep;
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`;
  let last: AlertsRpcError = new AlertsRpcError(`${fn}: not called`, 0);
  for (let i = 0; i < 3; i++) {
    if (i) await sleep(5000 * i);
    let r: Response;
    try {
      r = await f(url, { method: 'POST', headers: sbHeaders(env), body: JSON.stringify(body) });
    } catch (e) {
      last = new AlertsRpcError(`${fn}: network ${e instanceof Error ? e.name : 'error'}`, 0);
      continue;
    }
    if (r.ok) return (await r.json()) as T;
    // 응답 본문은 PostgREST 오류 문구(키 없음) — 그래도 짧게
    const msg = (await r.text().catch(() => '')).slice(0, 200);
    last = new AlertsRpcError(`${fn}: HTTP ${r.status} ${msg}`, r.status);
    if (r.status < 500 && r.status !== 429) throw last;
  }
  throw last;
}

/** 오늘(또는 date) 보낼 알림. date 를 안 주면 DB 가 KST 오늘로 */
export async function dueAlerts(
  env: AlertsEnv,
  opts: { date?: string; channel?: AlertChannel } & AlertsDeps = {},
): Promise<DueAlerts> {
  const res = await rpc<DueAlerts>(
    env,
    'automation_due_alerts',
    { p_key: env.AUTOMATION_KEY, p_date: opts.date ?? null, p_channel: opts.channel ?? 'email' },
    opts,
  );
  return { ...res, groups: res.groups ?? [] };
}

/** 보낸(또는 영구 실패한) 알림 기록. 새로 기록한 수를 돌려준다 (이미 있으면 0) */
export async function markSent(
  env: AlertsEnv,
  marks: SentMark[],
  opts: { channel?: AlertChannel } & AlertsDeps = {},
): Promise<number> {
  if (!marks.length) return 0;
  return rpc<number>(env, 'automation_mark_sent', { p_key: env.AUTOMATION_KEY, p_items: marks, p_channel: opts.channel ?? 'email' }, opts);
}

/** 그룹의 항목들 → markSent 에 넘길 기록 */
export function marksFor(group: AlertGroup, items: AlertItem[] = group.items, extra: Pick<SentMark, 'status' | 'message_id'> = {}): SentMark[] {
  return items.map((i) => ({
    email: group.email,
    race_id: i.race_id,
    kind: i.kind,
    event_date: i.event_date,
    scheduled_for: i.scheduled_for,
    ...extra,
  }));
}

/** 로그용: a***@example.com (주소 전체를 로그에 남기지 않는다) */
export function maskEmail(email: string): string {
  const [u, d] = email.split('@');
  return `${(u ?? '').slice(0, 1)}***@${d ?? ''}`;
}
