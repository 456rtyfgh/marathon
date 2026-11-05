/**
 * 예전 주소 marathon.junubenchoi.workers.dev 를 맡는 워커.
 *  - 모든 요청을 새 주소(marathoncalendar.pages.dev)로 영구 이동(301)시킨다. 공유 링크·북마크가 그대로 이어진다.
 *  - /__ping : Supabase 연결 확인
 *  - 매일 두 번 Supabase 에 한 줄을 써서 무료 플랜 자동 일시정지를 막는다 (Pages 에는 예약 실행이 없어 여기 둔다).
 */
interface Env {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
  SITE_ORIGIN: string;
}

async function keepalive(env: Env): Promise<{ ok: boolean; status: number; body: string }> {
  let last = { ok: false, status: 0, body: '' };
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/keepalive`, {
        method: 'POST',
        headers: { apikey: env.SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: '{}',
      });
      last = { ok: r.ok, status: r.status, body: (await r.text()).slice(0, 200) };
      if (r.ok) return last;
    } catch (e) {
      last = { ok: false, status: 0, body: String(e) };
    }
    await new Promise((res) => setTimeout(res, 5000 * (i + 1)));
  }
  console.error('keepalive failed', last);
  return last;
}


export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/__ping') {
      const r = await keepalive(env);
      return new Response(`supabase ${r.status} ${r.body}`, { status: r.ok ? 200 : 502 });
    }
    return Response.redirect(env.SITE_ORIGIN + url.pathname + url.search, 301);
  },
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    ctx.waitUntil(
      keepalive(env).then((r) => {
        if (!r.ok) throw new Error(`keepalive failed: ${r.status} ${r.body}`);
      }),
    );
  },
};
