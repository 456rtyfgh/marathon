/**
 * 정적 파일은 ASSETS 가 처리하고, 이 워커는 세 가지를 한다.
 * 1) ?r=대회id 공유 링크에 대회별 제목·설명(og 태그)을 넣어 카톡·메신저 미리보기를 채운다.
 * 2) /__ping 으로 Supabase 연결 확인.
 * 3) 이틀마다 Supabase 에 가벼운 요청을 보내 무료 플랜 자동 일시정지를 막는다.
 */
interface Env {
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

interface RaceMeta {
  id: string;
  name_ko: string;
  city_ko: string;
  country_ko: string;
  race_date: string;
  entry_type: string;
  entry_opens: string | null;
  entry_closes: string | null;
}

const ENTRY: Record<string, string> = {
  lottery: '추첨',
  fcfs: '선착순',
  qualifying: '기록 기준',
  tour_only: '여행사 전용',
  open: '상시 접수',
};

const sb = (env: Env, path: string) =>
  fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: env.SUPABASE_KEY, Authorization: `Bearer ${env.SUPABASE_KEY}` },
  });

const fmt = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
};

function describe(r: RaceMeta): string {
  const parts = [`${fmt(r.race_date)} ${r.country_ko === '대한민국' ? r.city_ko : `${r.country_ko} ${r.city_ko}`}`];
  parts.push(`접수 ${ENTRY[r.entry_type] ?? ''}`.trim());
  if (r.entry_opens && r.entry_closes) parts.push(`${fmt(r.entry_opens)}부터 ${fmt(r.entry_closes)}까지`);
  else if (r.entry_closes) parts.push(`${fmt(r.entry_closes)} 마감`);
  else if (r.entry_opens) parts.push(`${fmt(r.entry_opens)} 시작`);
  return parts.join(', ') + '. 일정, 비용, 후기를 확인하세요.';
}

async function withRaceMeta(req: Request, env: Env, id: string): Promise<Response> {
  const page = await env.ASSETS.fetch(new URL('/', req.url).toString());
  let race: RaceMeta | undefined;
  try {
    const r = await sb(
      env,
      `races?id=eq.${encodeURIComponent(id)}&select=id,name_ko,city_ko,country_ko,race_date,entry_type,entry_opens,entry_closes`,
    );
    if (r.ok) race = ((await r.json()) as RaceMeta[])[0];
  } catch {
    /* 실패하면 기본 태그 그대로 */
  }
  if (!race) return page;

  const title = `${race.name_ko} | 마라톤 캘린더`;
  const desc = describe(race);
  const url = new URL(req.url);
  const canonical = `${url.origin}/?r=${encodeURIComponent(race.id)}`;
  const set = (content: string) => ({ element: (el: Element) => el.setAttribute('content', content) });

  const out = new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(title) })
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[property="og:url"]', set(canonical))
    .on('meta[name="twitter:title"]', set(title))
    .on('meta[name="twitter:description"]', set(desc))
    .transform(page);

  const res = new Response(out.body, out);
  res.headers.set('Cache-Control', 'public, max-age=600');
  return res;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/__ping') {
      const r = await sb(env, 'races?select=id&limit=1');
      return new Response(`supabase ${r.status}`);
    }
    const id = url.searchParams.get('r');
    if (url.pathname === '/' && id && /^[a-z0-9-]{2,40}$/.test(id)) return withRaceMeta(req, env, id);
    return env.ASSETS.fetch(req);
  },
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    ctx.waitUntil(sb(env, 'races?select=id&limit=1'));
  },
};
