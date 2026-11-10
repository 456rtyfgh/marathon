/**
 * 예약 실행에서 휴대폰 알림 보내기: dueAlerts(channel 'push') → sendDueAlertPushes → markSent(channel 'push').
 * 메일(sendAlertEmails)과 같은 실행(worker/cron.ts)에서 따로 부른다 — 기록이 채널마다 따로라 메일을 보냈어도 푸시는 따로 나간다.
 *
 *  - 기기 하나 이상에 보낸 알림만 'sent' 로 기록한다. 기기가 없는 사람·모든 기기에서 실패한 알림은 기록하지 않는다
 *    (12:17 재시도와 다음 날 실행에서 다시 본다 — DB 규칙상 3일까지만 이어서 나온다).
 *  - VAPID 값이 없으면 보내지 않고 이름만 로그에 (푸시를 아직 켜지 않은 상태로 본다). 예외를 던지지 않고 요약을 돌려준다.
 *  - 비밀값 이름은 메일 쪽과 같다: SUPABASE_URL, SUPABASE_SECRET_KEY, AUTOMATION_KEY(+ VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT).
 */
import { dueAlerts, markSent, marksFor, missingEnv, type AlertGroup, type AlertItem, type AlertsDeps, type AlertsEnv } from './due.ts';
import { sendDueAlertPushes, supabasePushStore, type PushAlert, type PushStore } from './pushAlerts.ts';
import type { SendOptions, VapidEnv } from './push.ts';

export type PushRunEnv = AlertsEnv & VapidEnv;

export interface PushRunSummary {
  date: string;
  /** 오늘 보낼 알림 줄 (기기 유무와 상관없이) */
  due: number;
  /** 기기 하나 이상에 보낸 알림 줄 */
  delivered: number;
  sent: number;
  failed: number;
  removed: number;
  stopped?: string;
}

const KIND: Record<AlertItem['kind'], PushAlert['kind']> = { entry_opens: 'opens', entry_closes: 'closes', race_day: 'race_day' };

/** dueAlerts 한 묶음 → 푸시 알림 줄 (item 과 짝) */
export function toPushAlerts(g: AlertGroup): { alert: PushAlert; item: AlertItem }[] {
  return (g.items ?? []).map((item) => ({
    item,
    alert: {
      user_id: g.user_id,
      email: g.email,
      race_id: item.race_id,
      race_name_ko: item.name_ko,
      race_name_en: item.name_en,
      kind: KIND[item.kind],
      date: item.event_date,
      days_before: item.days_left,
    },
  }));
}

export async function sendAlertPushes(
  env: Partial<PushRunEnv>,
  deps: AlertsDeps & { date?: string; store?: PushStore; push?: SendOptions } = {},
): Promise<PushRunSummary> {
  const sum: PushRunSummary = { date: deps.date ?? '', due: 0, delivered: 0, sent: 0, failed: 0, removed: 0 };
  const missing = missingEnv(env as Record<string, unknown>, [
    'SUPABASE_URL',
    'SUPABASE_SECRET_KEY',
    'AUTOMATION_KEY',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'VAPID_SUBJECT',
  ]);
  if (missing.length) {
    sum.stopped = `missing env: ${missing.join(', ')}`;
    console.log('[push] 설정 없음 → 보내지 않음:', missing.join(', '));
    return sum;
  }
  const e = env as PushRunEnv;
  const due = await dueAlerts(e, { channel: 'push', date: deps.date, ...deps });
  sum.date = due.date;

  const pairs: { g: AlertGroup; alert: PushAlert; item: AlertItem }[] = [];
  for (const g of due.groups) for (const p of toPushAlerts(g)) pairs.push({ g, ...p });
  sum.due = pairs.length;
  if (!pairs.length) {
    console.log(`[push] ${due.date} 보낼 알림 없음`);
    return sum;
  }

  const store =
    deps.store ??
    supabasePushStore(
      { SUPABASE_URL: e.SUPABASE_URL, SUPABASE_SERVICE_KEY: e.SUPABASE_SECRET_KEY, ALERTS_AUTOMATION_KEY: e.AUTOMATION_KEY },
      (deps.fetch as typeof fetch | undefined) ?? fetch,
    );
  const report = await sendDueAlertPushes(
    pairs.map((p) => p.alert),
    e,
    store,
    { ...deps.push, fetch: deps.push?.fetch ?? (deps.fetch as typeof fetch | undefined) },
  );
  sum.sent = report.sent;
  sum.failed = report.failed;
  sum.removed = report.removed;
  sum.delivered = report.delivered.length;
  if (report.errors.length) console.error('[push] 실패 일부:', report.errors.join(' | '));

  // 보낸 줄만 묶음별로 기록
  const ok = new Set(report.delivered);
  const byGroup = new Map<AlertGroup, AlertItem[]>();
  for (const p of pairs) if (ok.has(p.alert)) byGroup.set(p.g, [...(byGroup.get(p.g) ?? []), p.item]);
  const marks = [...byGroup].flatMap(([g, items]) => marksFor(g, items, { status: 'sent', message_id: null }));
  if (marks.length) {
    try {
      await markSent(e, marks, { channel: 'push', ...deps });
    } catch (err) {
      // 기록 실패 → 다음 실행에 다시 나갈 수 있다 (같은 tag 라 기기에서는 하나로 합쳐진다)
      sum.stopped = 'mark_sent failed';
      console.error('[push] 기록 실패:', err instanceof Error ? err.message : 'error');
    }
  }
  console.log(`[push] 끝: ${JSON.stringify(sum)}`);
  return sum;
}
