/**
 * 예약 실행 전용 워커 (공개 주소 없음). 매일 두 번 Supabase 를 깨워 무료 플랜 자동 일시정지를 막는다.
 * Pages 에는 예약 실행이 없어서 이것만 따로 둔다.
 */
import { keepalive, type DbEnv } from './keepalive';

export default {
  fetch: () => new Response('not found', { status: 404 }),
  async scheduled(_event: unknown, env: DbEnv, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    ctx.waitUntil(
      keepalive(env).then((r) => {
        if (!r.ok) throw new Error(`keepalive failed: ${r.status} ${r.body}`);
      }),
    );
  },
};
