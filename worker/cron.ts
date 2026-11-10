/**
 * 예약 실행 전용 워커 (공개 주소 없음). Pages 에는 예약 실행이 없어서 이것만 따로 둔다.
 *  - 17 3,15 * * *  (12:17·00:17 KST) Supabase 를 깨워 무료 플랜 자동 일시정지를 막는다
 *  - 0 23 * * *     (08:00 KST) 일정 알림 메일 보내기 (worker/alerts/email.ts)
 *  - 12:17 KST 에는 알림 메일 한 번 더 — 아침에 잠깐 실패한 것만 나간다 (보낸 것은 DB 기록으로 건너뜀)
 */
import { keepalive, type DbEnv } from './keepalive';
import { sendAlertEmails, type EmailEnv } from './alerts/email';
import { shouldKeepalive, shouldSendAlerts } from './alerts/schedule';

type CronEnv = DbEnv & Partial<EmailEnv>;

export default {
  fetch: () => new Response('not found', { status: 404 }),
  async scheduled(event: { cron?: string; scheduledTime?: number }, env: CronEnv, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    if (shouldKeepalive(event.cron)) {
      ctx.waitUntil(
        keepalive(env).then((r) => {
          if (!r.ok) throw new Error(`keepalive failed: ${r.status} ${r.body}`);
        }),
      );
    }
    if (shouldSendAlerts(event.cron, event.scheduledTime ?? Date.now())) {
      ctx.waitUntil(
        sendAlertEmails(env as EmailEnv).catch((e) => {
          console.error('[alerts] 실행 실패:', e instanceof Error ? e.message : 'error');
          throw e;
        }),
      );
    }
  },
};
