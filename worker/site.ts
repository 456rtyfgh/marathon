/**
 * 마라톤 캘린더 사이트 (Cloudflare Pages, 주소 marathon82.com)
 * 정적 파일(첫 화면, /data.json …)은 Pages 가 함수 없이 바로 내보낸다 — 방문이 몰려도 함수·DB 를 거의 안 쓴다.
 * 여기 함수는 _routes.json 으로 두 경로에서만 돈다.
 *  - /r/대회id      : 공유 링크. 대회별 제목·설명(og 태그), 검색엔진용 본문, 구조화 데이터를 넣는다.
 *  - /cal/대회id.ics: 캘린더 일정 파일 (아이폰 사파리는 열자마자 '캘린더에 추가').
 *  - /__ping        : DB 연결 확인 (한 번 깨우기)
 */
import { raceIcs, type CalKind } from '../src/lib/ics';
import { keepalive } from './keepalive';

// 사이트 전체 CSP (public/_headers 의 값과 같게 유지)
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com https://*.doubleclick.net https://www.google.com https://www.google.co.kr",
  "font-src 'self' data:",
  "connect-src 'self' https://zhwmfvkwtmakieatlqtz.supabase.co wss://zhwmfvkwtmakieatlqtz.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.doubleclick.net https://www.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

/** 대표 주소. pages.dev 로 들어온 공유 링크는 여기로 영구 이동한다. */
export const SITE = 'https://marathon82.com';
const OLD_HOST = 'marathoncalendar.pages.dev';

// 공개 값(브라우저에도 들어 있는 publishable key)
const DB = { SUPABASE_URL: 'https://zhwmfvkwtmakieatlqtz.supabase.co', SUPABASE_KEY: 'sb_publishable_uOBwP5-BbK7keBuq3gsMAg_Oil1yg6O' };

export interface SiteEnv {
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
}
type Env = SiteEnv;

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
  discipline?: string | null;
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
const fmt = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
};

/** 한국 시간 오늘 'YYYY-MM-DD' */
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
/** src/lib/util.ts 의 CANCEL_TAG_RE 와 같은 규칙 (워커 묶음에 화면 코드를 끌어오지 않으려고 따로 둔다) */
const CANCEL_TAG_RE = /^\s*\[(취소|중단)\]\s*/;
const isCancelled = (r: RaceMeta) => !!r.notes_ko && CANCEL_TAG_RE.test(r.notes_ko);
const whereOf = (r: RaceMeta) => (r.country_code === 'KR' ? r.city_ko : `${r.country_ko} ${r.city_ko}`);
const DIST: Record<string, string> = { 풀: '풀코스', 하프: '하프' };
const distText = (r: RaceMeta) => (r.distances ?? []).map((d) => DIST[d] ?? d).join('·');
/** 받침 있으면 '은', 없으면 '는' (한글이 아니면 '은') */
const eun = (w: string) => {
  const c = w.trim().slice(-1).charCodeAt(0) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 === 0 ? '는' : '은';
};
const kindText = (r: RaceMeta) => (r.discipline === 'trail' ? '트레일러닝 대회' : '마라톤 대회');

function entryText(r: RaceMeta): string {
  const how = ENTRY[r.entry_type] ? `${ENTRY[r.entry_type]} 접수` : '접수';
  if (r.entry_opens && r.entry_closes && r.entry_opens === r.entry_closes) return `${how} ${fmt(r.entry_opens)} 하루`;
  if (r.entry_opens && r.entry_closes) return `${how} ${fmt(r.entry_opens)}부터 ${fmt(r.entry_closes)}까지`;
  if (r.entry_closes) return `${how} ${fmt(r.entry_closes)} 마감`;
  if (r.entry_opens) return `${how} ${fmt(r.entry_opens)} 시작`;
  return `${how} 기간 미공개`;
}

/** 검색 결과 설명: 날짜·도시·거리·접수 시작/마감을 문장으로, 160자 안쪽 (넘치면 꼬리부터 뺀다) */
function describe(r: RaceMeta): string {
  const head = `${isCancelled(r) ? '[대회 취소] ' : ''}${r.name_ko}${eun(r.name_ko)} ${fmt(r.race_date)} ${whereOf(r)}에서 열리는 ${kindText(r)}입니다.`;
  const dist = distText(r) ? ` 종목 ${distText(r)}.` : '';
  const entry = ` ${entryText(r)}.`;
  const tail = ' 일정, 비용, 후기를 확인하세요.';
  for (const s of [head + dist + entry + tail, head + dist + entry, head + entry]) if (s.length <= 160) return s;
  return (head + entry).slice(0, 159) + '…';
}

/** <script> 안에 넣는 JSON: '</script>' 같은 글자로 태그를 빠져나가지 못하게 < > & 를 이스케이프 */
const jsonForScript = (v: unknown) =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const httpUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : '');

/** 함수가 내보내는 HTML 에도 정적 파일과 같은 보안 헤더를 붙인다 (public/_headers 와 맞출 것) */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': CSP,
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// 정적 목록 페이지(scripts/seo-pages.mjs) 와 같은 주소·이름
const COUNTRY_PATH = (r: RaceMeta) => (r.country_code ? `/c/${r.country_code.toLowerCase()}/` : '');
const countryCrumb = (r: RaceMeta) => `${r.country_code === 'KR' ? '국내' : r.country_ko} 마라톤 일정`;

function raceHtml(r: RaceMeta, desc: string): string {
  const cancelled = isCancelled(r);
  const note = r.notes_ko?.replace(CANCEL_TAG_RE, '').trim();
  const cpath = COUNTRY_PATH(r);
  const rows: [string, string][] = [
    ['대회 날짜', fmt(r.race_date)],
    ['장소', whereOf(r)],
    ['접수 방식', ENTRY[r.entry_type] ?? ''],
    ['접수 기간', [r.entry_opens && `${fmt(r.entry_opens)}부터`, r.entry_closes && `${fmt(r.entry_closes)}까지`].filter(Boolean).join(' ') || '미공개'],
    ['종목', distText(r)],
    ['참가비', r.entry_fee != null ? `${r.entry_fee.toLocaleString()} ${r.entry_fee_currency ?? ''}` : '미공개'],
  ];
  return `<main style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
<nav aria-label="위치"><a href="/">마라톤 캘린더</a>${cpath ? ` › <a href="${cpath}">${esc(countryCrumb(r))}</a>` : ''} › <a href="/m/${r.race_date.slice(0, 7)}/">${Number(r.race_date.slice(0, 4))}년 ${Number(r.race_date.slice(5, 7))}월</a></nav>
<h1>${esc(r.name_ko)} ${r.race_date.slice(0, 4)} 일정·접수 기간</h1>
${cancelled ? '<p><strong>대회 취소</strong> — 주최 측이 이 대회를 취소(중단)했습니다.</p>' : ''}
${r.name_en ? `<p>${esc(r.name_en)}</p>` : ''}
<p>${esc(desc)}</p>
<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
${note ? `<p>${esc(note)}</p>` : ''}
${httpUrl(r.official_url) ? `<p><a href="${esc(httpUrl(r.official_url))}" rel="nofollow noopener">공식 홈페이지</a></p>` : ''}
</main>`;
}

/** 주최 측 페이지로 쓸 수 있는 공식 주소 (네이버 검색 링크 같은 대체 링크는 빼고) */
const organizerUrl = (r: RaceMeta) => {
  const u = httpUrl(r.official_url);
  return u && !/search\.naver\.com|google\.[a-z.]+\/search/i.test(u) ? u : '';
};

/** 접수 상태 → schema.org availability (날짜를 모르면 넣지 않는다) */
function availability(r: RaceMeta, today: string): string | undefined {
  if (isCancelled(r)) return undefined;
  if (r.entry_opens && today < r.entry_opens) return 'https://schema.org/PreOrder';
  if (r.entry_closes && today > r.entry_closes) return 'https://schema.org/SoldOut';
  if (r.entry_opens && r.entry_closes) return 'https://schema.org/InStock';
  return undefined;
}

const ORG = { '@type': 'Organization', name: '마라톤 캘린더', url: SITE, logo: `${SITE}/brand/logo-512.png` };

function eventLd(r: RaceMeta, url: string, desc: string) {
  const org = organizerUrl(r);
  const avail = availability(r, todayKst());
  const ev = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${r.name_ko} ${r.race_date.slice(0, 4)}`,
    alternateName: r.name_en || undefined,
    startDate: r.race_date,
    endDate: r.race_date,
    eventStatus: isCancelled(r) ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    sport: r.discipline === 'trail' ? 'Trail running' : 'Marathon',
    description: desc,
    url,
    image: [`${SITE}/og.png`],
    location: {
      '@type': 'Place',
      name: whereOf(r),
      address: { '@type': 'PostalAddress', addressLocality: r.city_ko, addressCountry: r.country_code || r.country_ko },
    },
    organizer: { '@type': 'Organization', name: r.name_ko, ...(org ? { url: org } : {}) },
    offers: {
      '@type': 'Offer',
      url: org || url,
      ...(r.entry_fee != null ? { price: r.entry_fee, priceCurrency: r.entry_fee_currency } : {}),
      ...(avail ? { availability: avail } : {}),
      ...(r.entry_opens ? { validFrom: r.entry_opens } : {}),
    },
    publisher: ORG,
  };
  const cpath = COUNTRY_PATH(r);
  const crumbs = [
    { name: '마라톤 캘린더', item: `${SITE}/` },
    ...(cpath ? [{ name: countryCrumb(r), item: `${SITE}${cpath}` }] : []),
    { name: ev.name, item: url },
  ];
  const bc = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, ...c })),
  };
  return [ev, bc];
}

// 워커 인스턴스마다 data.json 을 10분 동안 기억해 둔다
let cache: { at: number; byId: Map<string, RaceMeta> } | null = null;
async function raceById(req: Request, env: Env, id: string): Promise<RaceMeta | undefined> {
  if (!cache || Date.now() - cache.at > 600_000) {
    const r = await env.ASSETS.fetch(new URL('/data.json', req.url).toString());
    if (!r.ok) throw new Error(`data.json ${r.status}`);
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
    // 목록을 못 읽었으면 기본 태그 그대로 (없는 대회로 단정하지 않는다)
    return new Response(page.body, page);
  }
  if (!race) {
    // 없는 대회 주소: 홈을 200 으로 주면 구글이 '가짜 정상 페이지(soft 404)'로 본다
    const out = new HTMLRewriter()
      .on('head', { element: (el) => el.append('<meta name="robots" content="noindex">', { html: true }) })
      .on('script#ld-itemlist', { element: (el) => el.remove() })
      .transform(page);
    const res = new Response(out.body, { status: 404, headers: out.headers });
    res.headers.set('Cache-Control', 'public, max-age=600');
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    return res;
  }

  const title = `${race.name_ko} ${race.race_date.slice(0, 4)} 일정·접수 기간 | 마라톤 캘린더`;
  const desc = describe(race);
  const canonical = `${SITE}/r/${encodeURIComponent(race.id)}`;
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
    // 홈 대회 목록(ItemList)은 홈에만 — 대회 페이지에 실리면 구조화 데이터가 겹친다
    .on('script#ld-itemlist', { element: (el) => el.remove() })
    // 검색엔진이 읽을 대회 본문과 구조화 데이터 (화면이 뜨면 React 가 갈아 끼운다)
    .on('div#root', { element: (el) => el.setInnerContent(raceHtml(race!, desc), { html: true }) })
    .on('head', { element: (el) => el.append(`${eventLd(race!, canonical, desc).map((ld) => `<script type="application/ld+json">${jsonForScript(ld)}</script>`).join('')}`, { html: true }) })
    .transform(page);

  const res = new Response(out.body, out);
  res.headers.set('Cache-Control', 'public, max-age=600');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}


export async function siteFetch(req: Request, env: SiteEnv): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/__ping') {
    const r = await keepalive(DB);
    return new Response(`supabase ${r.status} ${r.body}`, { status: r.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
  }
  // 예전 주소로 연 공유 링크는 대표 주소로 (미리보기 주소 xxx.marathoncalendar.pages.dev 는 그대로)
  if (url.hostname === OLD_HOST) return Response.redirect(SITE + url.pathname + url.search, 301);
  const m = url.pathname.match(/^\/r\/([a-z0-9-]{2,40})\/?$/);
  if (m) return withRaceMeta(req, env, m[1]);
  const c = url.pathname.match(/^\/cal\/([a-z0-9-]{2,40})\.ics$/);
  if (c) {
    const race = await raceById(req, env, c[1]).catch(() => undefined);
    if (!race) return new Response('대회를 찾지 못했습니다.', { status: 404 });
    const allowed: CalKind[] = ['race', 'open', 'close'];
    const kinds = (url.searchParams.get('e') ?? 'race,open,close')
      .split(',')
      .filter((k): k is CalKind => allowed.includes(k as CalKind));
    const ics = raceIcs(race, `${SITE}/r/${race.id}`, kinds.length ? kinds : allowed);
    return new Response(ics, {
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="${race.id}.ics"`,
        'Cache-Control': 'public, max-age=600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }
  return env.ASSETS.fetch(req);
}
