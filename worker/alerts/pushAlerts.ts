/**
 * '오늘 보낼 알림 목록'(mailalert 브랜치의 worker/alerts/dueAlerts — 아직 없음)을 받아 휴대폰 알림으로 보낸다.
 * 연결 방법은 .duo-data/push.md. 여기서는 목록을 계산하지 않는다 — 받은 줄을 기기마다 보내고, 끝난 구독만 지운다.
 *
 *   const due = await dueAlerts(env);                         // 메일 쪽 (expected 날짜는 이미 빠져 있음)
 *   await sendDueAlertPushes(due.map(toPushAlert), env, supabasePushStore(env));
 *
 * DB: supabase/migrations/0018_push.sql 의 automation_push_targets · automation_push_remove (자동화 키 'alerts', service_role).
 */
import { sendPush, type PushPayload, type SendOptions, type VapidEnv } from './push.ts';

/** 알림 한 줄. dueAlerts 의 결과를 이 모양으로 바꿔 넘긴다 (받는 사람은 user_id 나 계정 email 중 하나 이상) */
export interface PushAlert {
  user_id?: string | null;
  email?: string | null;
  race_id: string;
  race_name_ko: string;
  race_name_en?: string | null;
  /** 접수 시작 / 접수 마감 */
  kind: 'opens' | 'closes';
  /** 그 날짜 'YYYY-MM-DD' (확정된 날짜만) */
  date: string;
  /** 며칠 전 알림인지 (0 이면 오늘) */
  days_before: number;
}

/** automation_push_targets 한 줄 */
export interface PushTarget {
  user_id: string;
  email: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  lang: 'ko' | 'en';
}

export interface PushStore {
  targets(userIds: string[], emails: string[]): Promise<PushTarget[]>;
  remove(endpoints: string[]): Promise<number>;
}

export interface PushDbEnv {
  SUPABASE_URL: string;
  /** service_role 키 (자동화 함수는 service_role 만 부를 수 있다 — 0012 M5) */
  SUPABASE_SERVICE_KEY: string;
  /** automation_keys 의 'alerts' 원문 (메일 쪽과 같은 값) */
  ALERTS_AUTOMATION_KEY: string;
}

/** Supabase RPC 로 기기 목록 읽기·끝난 구독 지우기 */
export function supabasePushStore(env: PushDbEnv, doFetch: typeof fetch = fetch): PushStore {
  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const r = await doFetch(`${env.SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_key: env.ALERTS_AUTOMATION_KEY, ...args }),
    });
    // 오류 문구에는 상태와 DB 메시지만 (키 값은 넣지 않는다)
    if (!r.ok) throw new Error(`${name} ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()) as T;
  };
  return {
    targets: (userIds, emails) =>
      rpc<PushTarget[]>('automation_push_targets', { p_user_ids: userIds.length ? userIds : null, p_emails: emails.length ? emails : null }),
    remove: (endpoints) => (endpoints.length ? rpc<number>('automation_push_remove', { p_endpoints: endpoints }) : Promise.resolve(0)),
  };
}

const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 알림 문구 (한국어·영어). 누르면 대회 상세 */
export function alertMessage(a: PushAlert, lang: 'ko' | 'en'): PushPayload {
  const [, m, d] = a.date.split('-').map(Number);
  const id = encodeURIComponent(a.race_id);
  const tag = `${a.race_id}:${a.kind}`;
  if (lang === 'en') {
    const name = a.race_name_en?.trim() || a.race_name_ko;
    const what = a.kind === 'opens' ? 'opens' : 'closes';
    const when = a.days_before <= 0 ? 'today' : a.days_before === 1 ? 'tomorrow' : `in ${a.days_before} days`;
    return { title: `${name}: entry ${what} ${when}`, body: `Entry ${what} ${MONTH_EN[m - 1]} ${d}. Tap to see the race.`, url: `/en/r/${id}`, tag, lang };
  }
  const what = a.kind === 'opens' ? '시작' : '마감';
  const when = a.days_before <= 0 ? '오늘' : `D-${a.days_before}`;
  return { title: `${a.race_name_ko} 접수 ${what} ${when}`, body: `${m}월 ${d}일 접수 ${what}. 눌러서 대회 정보를 확인하세요.`, url: `/r/${id}`, tag, lang };
}

export interface PushReport {
  /** 받을 기기가 있던 알림 줄 수 */
  alerts: number;
  sent: number;
  failed: number;
  /** 410/404 로 지운 구독 수 */
  removed: number;
  /** 실패 사유 몇 개 (상태 코드·푸시 서비스 문구만) */
  errors: string[];
}

/** 받은 알림 줄을 그 사람의 모든 기기로 보낸다. 같은 대회·같은 종류는 tag 가 같아 기기에서 하나로 합쳐진다 */
export async function sendDueAlertPushes(
  alerts: PushAlert[],
  env: VapidEnv,
  store: PushStore,
  opts: SendOptions & { concurrency?: number } = {},
): Promise<PushReport> {
  const report: PushReport = { alerts: 0, sent: 0, failed: 0, removed: 0, errors: [] };
  if (!alerts.length) return report;
  const userIds = [...new Set(alerts.map((a) => a.user_id).filter((x): x is string => !!x))];
  const emails = [...new Set(alerts.map((a) => a.email?.trim().toLowerCase()).filter((x): x is string => !!x))];
  const targets = await store.targets(userIds, emails);

  const jobs: { a: PushAlert; t: PushTarget }[] = [];
  for (const a of alerts) {
    const mail = a.email?.trim().toLowerCase();
    const mine = targets.filter((t) => (a.user_id && t.user_id === a.user_id) || (mail && t.email === mail));
    // 같은 기기가 user_id·email 둘 다로 잡혀도 한 번만
    const seen = new Set<string>();
    for (const t of mine) {
      if (seen.has(t.endpoint)) continue;
      seen.add(t.endpoint);
      jobs.push({ a, t });
    }
    if (mine.length) report.alerts++;
  }

  const gone = new Set<string>();
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const { a, t } = jobs[next++];
      if (gone.has(t.endpoint)) continue;
      const r = await sendPush({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, alertMessage(a, t.lang), env, opts);
      if (r.ok) report.sent++;
      else {
        report.failed++;
        if (r.gone) gone.add(t.endpoint);
        if (report.errors.length < 10) report.errors.push(`${r.status} ${new URL(t.endpoint).host}: ${r.error}`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.concurrency ?? 6, jobs.length)) }, worker));
  if (gone.size) report.removed = await store.remove([...gone]);
  return report;
}
