/**
 * 정적 파일은 Cloudflare assets 가 먼저 처리하고, 이 워커는 두 가지만 한다.
 * 1) 예전 주소(runworld.*)로 들어오면 새 주소로 보낸다.
 * 2) 이틀마다 Supabase 에 가벼운 요청을 보내 무료 플랜 자동 일시정지를 막는다.
 */
interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

async function ping(env: Env) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/races?select=id&limit=1`, {
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` },
  });
  return r.status;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/__ping') return new Response(`supabase ${await ping(env)}`);
    return env.ASSETS.fetch(req);
  },
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    ctx.waitUntil(ping(env));
  },
};
