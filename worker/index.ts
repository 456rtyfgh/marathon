/**
 * 정적 파일(첫 화면, /data.json 포함)은 Cloudflare 가 워커 없이 바로 내보낸다 — 방문이 몰려도 워커·DB 를 거의 안 쓴다.
 * 이 워커는 세 가지만 한다.
 * 1) /r/대회id 공유 링크에 대회별 제목·설명(og 태그)을 넣어 카톡·메신저 미리보기를 채운다. (정보는 /data.json 에서)
 *    /cal/대회id.ics 는 캘린더 일정 파일을 바로 내보낸다 (아이폰 사파리는 열자마자 '캘린더에 추가').
 * 2) /__ping 으로 Supabase 연결 확인.
 * 3) 이틀마다 Supabase 에 가벼운 요청을 보내 무료 플랜 자동 일시정지를 막는다.
 */
import { raceIcs, type CalKind } from '../src/lib/ics';

interface Env {
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_KEY: string;
}

interface RaceMeta {
  id: string;
  name_ko: string;
  name_en?: string;
  country_code?: string;
  distances?: string[];
  entry_fee?: number | null;
  entry_fee_currency?: string;
  notes_ko?: string | null;
  official_url: string;
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


// 무료 플랜 자동 일시정지 방지: 읽기만으로는 활동으로 안 잡힐 때가 있어 매일 한 줄을 쓴다.
// 일시적 실패에 대비해 세 번까지 다시 시도한다.
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

const fmt = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
};

function describe(r: RaceMeta): string {
  const parts = [`${fmt(r.race_date)} ${r.country_ko === '대한민국' ? r.city_ko : `${r.country_ko} ${r.city_ko}`}`];
  parts.push(`접수 ${ENTRY[r.entry_type] ?? ''}`.trim());
  if (r.entry_opens && r.entry_closes && r.entry_opens === r.entry_closes) parts.push(`${fmt(r.entry_opens)} 하루`);
  else if (r.entry_opens && r.entry_closes) parts.push(`${fmt(r.entry_opens)}부터 ${fmt(r.entry_closes)}까지`);
  else if (r.entry_closes) parts.push(`${fmt(r.entry_closes)} 마감`);
  else if (r.entry_opens) parts.push(`${fmt(r.entry_opens)} 시작`);
  return parts.join(', ') + '. 일정, 비용, 후기를 확인하세요.';
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function raceHtml(r: RaceMeta, desc: string): string {
  const where = r.country_ko === '대한민국' ? r.city_ko : `${r.country_ko} ${r.city_ko}`;
  const rows: [string, string][] = [
    ['대회 날짜', fmt(r.race_date)],
    ['장소', where],
    ['접수 방식', ENTRY[r.entry_type] ?? ''],
    ['접수 기간', [r.entry_opens && `${fmt(r.entry_opens)}부터`, r.entry_closes && `${fmt(r.entry_closes)}까지`].filter(Boolean).join(' ') || '미공개'],
    ['종목', (r.distances ?? []).join(', ')],
    ['참가비', r.entry_fee != null ? `${r.entry_fee.toLocaleString()} ${r.entry_fee_currency ?? ''}` : '미공개'],
  ];
  return `<main style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
<p><a href="/">마라톤 캘린더</a></p>
<h1>${esc(r.name_ko)} ${r.race_date.slice(0, 4)} 일정·접수 기간</h1>
${r.name_en ? `<p>${esc(r.name_en)}</p>` : ''}
<p>${esc(desc)}</p>
<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
${r.notes_ko ? `<p>${esc(r.notes_ko)}</p>` : ''}
<p><a href="${esc(r.official_url)}" rel="nofollow">공식 홈페이지</a></p>
</main>`;
}

function eventLd(r: RaceMeta, url: string, desc: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${r.name_ko} ${r.race_date.slice(0, 4)}`,
    alternateName: r.name_en || undefined,
    startDate: r.race_date,
    endDate: r.race_date,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    sport: 'Marathon',
    description: desc,
    url,
    location: {
      '@type': 'Place',
      name: `${r.city_ko}, ${r.country_ko}`,
      address: { '@type': 'PostalAddress', addressLocality: r.city_ko, addressCountry: r.country_code || r.country_ko },
    },
    ...(r.entry_fee != null
      ? { offers: { '@type': 'Offer', price: r.entry_fee, priceCurrency: r.entry_fee_currency, url: r.official_url, ...(r.entry_opens ? { validFrom: r.entry_opens } : {}) } }
      : {}),
  };
}

// 워커 인스턴스마다 data.json 을 10분 동안 기억해 둔다
let cache: { at: number; byId: Map<string, RaceMeta> } | null = null;
async function raceById(req: Request, env: Env, id: string): Promise<RaceMeta | undefined> {
  if (!cache || Date.now() - cache.at > 600_000) {
    const r = await env.ASSETS.fetch(new URL('/data.json', req.url).toString());
    if (!r.ok) return undefined;
    const j = (await r.json()) as { races: RaceMeta[] };
    cache = { at: Date.now(), byId: new Map(j.races.map((x) => [x.id, x])) };
  }
  return cache.byId.get(id);
}

async function withRaceMeta(req: Request, env: Env, id: string): Promise<Response> {
  const page = await env.ASSETS.fetch(new URL('/', req.url).toString());
  let race: RaceMeta | undefined;
  try {
    race = await raceById(req, env, id);
  } catch {
    /* 실패하면 기본 태그 그대로 */
  }
  if (!race) return new Response(page.body, page);

  const title = `${race.name_ko} ${race.race_date.slice(0, 4)} 일정·접수 기간 | 마라톤 캘린더`;
  const desc = describe(race);
  const url = new URL(req.url);
  const canonical = `${url.origin}/r/${encodeURIComponent(race.id)}`;
  const set = (content: string) => ({ element: (el: Element) => el.setAttribute('content', content) });

  const out = new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(title) })
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[property="og:url"]', set(canonical))
    .on('meta[name="twitter:title"]', set(title))
    .on('meta[name="twitter:description"]', set(desc))
    .on('link[rel="canonical"]', { element: (el) => el.setAttribute('href', canonical) })
    // 검색엔진이 읽을 대회 본문과 구조화 데이터 (화면이 뜨면 React 가 갈아 끼운다)
    .on('div#root', { element: (el) => el.setInnerContent(raceHtml(race!, desc), { html: true }) })
    .on('head', { element: (el) => el.append(`<script type="application/ld+json">${JSON.stringify(eventLd(race!, canonical, desc))}</script>`, { html: true }) })
    .transform(page);

  const res = new Response(out.body, out);
  res.headers.set('Cache-Control', 'public, max-age=600');
  return res;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/__ping') {
      const r = await keepalive(env);
      return new Response(`supabase ${r.status} ${r.body}`, { status: r.ok ? 200 : 502 });
    }
    const m = url.pathname.match(/^\/r\/([a-z0-9-]{2,40})\/?$/);
    if (m) return withRaceMeta(req, env, m[1]);
    const c = url.pathname.match(/^\/cal\/([a-z0-9-]{2,40})\.ics$/);
    if (c) {
      const race = await raceById(req, env, c[1]).catch(() => undefined);
      if (!race) return new Response('대회를 찾지 못했습니다.', { status: 404 });
      const allowed: CalKind[] = ['race', 'open', 'close'];
      const kinds = (url.searchParams.get('e') ?? 'race,open,close').split(',').filter((k): k is CalKind => allowed.includes(k as CalKind));
      const body = raceIcs(race, `${url.origin}/r/${race.id}`, kinds.length ? kinds : allowed);
      return new Response(body, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `inline; filename="${race.id}.ics"`,
          'Cache-Control': 'public, max-age=600',
        },
      });
    }
    return env.ASSETS.fetch(req);
  },
  async scheduled(_event: unknown, env: Env, ctx: { waitUntil: (p: Promise<unknown>) => void }) {
    ctx.waitUntil(
      keepalive(env).then((r) => {
        if (!r.ok) throw new Error(`keepalive failed: ${r.status} ${r.body}`);
      }),
    );
  },
};
