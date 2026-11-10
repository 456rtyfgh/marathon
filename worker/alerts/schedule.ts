/** 예약 실행 시각 (wrangler.cron.jsonc 의 triggers.crons 와 같은 값) */
export const ALERT_CRON = '0 23 * * *'; // 08:00 KST — 알림 메일
export const KEEPALIVE_CRON = '17 3,15 * * *'; // 12:17·00:17 KST — DB 깨우기 (12:17 에는 알림 메일 재시도도)

/** 이 예약 실행에서 알림 메일을 보낼지: 08:00 KST + 12:17 KST 재시도 (00:17 KST 는 깨우기만) */
export function shouldSendAlerts(cron: string | undefined, scheduledTime: number): boolean {
  if (cron === ALERT_CRON) return true;
  return cron === KEEPALIVE_CRON && new Date(scheduledTime).getUTCHours() === 3;
}

/** DB 깨우기는 알림 시각(08:00)엔 하지 않는다 — 기존 두 번 그대로 */
export const shouldKeepalive = (cron: string | undefined) => cron !== ALERT_CRON;
