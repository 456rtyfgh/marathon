/** Supabase 무료 플랜 자동 일시정지를 막으려고 heartbeat 한 줄을 쓴다 (세 번까지 재시도). */
export interface DbEnv {
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

export async function keepalive(env: DbEnv): Promise<{ ok: boolean; status: number; body: string }> {
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


