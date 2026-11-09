/**
 * 커뮤니티(러닝톡) 워커 경로 — worker/site.ts 의 siteFetch 가 부른다.
 *  - GET /api/community?race=<id>&cat=<category>&before=<cursor> : 글 목록 20개(keyset). 우리 사이트 안에서 부른 것만.
 *      Supabase rpc/community_list 를 공개 키(anon)로 부른다 — 본문·글쓴이 id 는 DB 가 아예 안 준다.
 *      첫 페이지(before 없음)는 Cloudflare Cache API 에 45초 (커스텀 도메인에서만 동작. pages.dev·로컬은 매번 조회).
 *  - GET /community, /en/community          : 첫 화면 HTML 에 러닝톡 제목·설명·첫 페이지 글 제목 목록만 넣는다.
 *  - GET /community/<uuid>, /en/community/<uuid> : 검색엔진용 글 페이지 — 제목·카테고리·대회·닉네임·작성일·댓글 수만(본문 없음).
 *      구조화 데이터 DiscussionForumPosting 에 isAccessibleForFree=false + hasPart(cssSelector 회원 전용 영역).
 *      없는 글·숨김·삭제·임시조치는 404 + noindex (화면은 그대로 떠서 '삭제된 글' 자리를 보인다).
 */
import {
  CATEGORIES,
  LIMITS,
  MEMBERS_ONLY_CLASS,
  decodeCursor,
  encodeCursor,
  isUuid,
  type Category,
  type PostDetail,
  type PostListItem,
  type PostListResponse,
} from '../src/lib/communityTypes';
import type { Lang } from '../src/i18n/lang.ts';
import { fmtDate } from '../src/i18n/format.ts';
import { PUBLIC_SB } from './gaRoute';
import { SECURITY_HEADERS, SITE, blocked, loadRaces, sameSite, type SiteEnv } from './site';

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
interface CacheLike {
  match(key: string): Promise<Response | undefined>;
  put(key: string, res: Response): Promise<void>;
}
/** 시험에서 fetch·캐시를 바꿔 끼운다 */
export interface CommunityDeps {
  fetch?: FetchFn;
  cache?: CacheLike | null;
}
const defaultCache = (): CacheLike | null => (globalThis as { caches?: { default?: CacheLike } }).caches?.default ?? null;

const LIST_TTL = 45; // 초
const PAGE_TTL = 60;

const CAT_TEXT: Record<Lang, Record<Category, string>> = {
  ko: { question: '질문', companion: '동행·크루', info: '대회 정보', free: '자유' },
  en: { question: 'Questions', companion: 'Buddies & crews', info: 'Race info', free: 'Open chat' },
};
const TEXT = {
  ko: {
    name: '러닝톡',
    site: '마라톤 캘린더',
    listTitle: '러닝톡 — 마라톤 대회 질문·동행·정보 | 마라톤 캘린더',
    listDesc: '마라톤 대회별 질문, 동행·크루 모집, 대회 정보, 자유 이야기를 나누는 러너 게시판입니다. 글 내용과 댓글은 메일 인증 회원에게 보입니다.',
    locked: '회원만 볼 수 있는 내용입니다. 회원 가입하고 메일 인증하면 볼 수 있어요.',
    comments: (n: number) => `댓글 ${n}개`,
    likes: (n: number) => `좋아요 ${n}`,
    tail: '본문과 댓글은 메일 인증 회원에게 보입니다.',
    post: '러닝톡 글',
    raceLink: '대회 일정·접수 보기',
    empty: '아직 글이 없습니다.',
    crumb: '위치',
  },
  en: {
    name: 'Running Talk',
    site: 'Marathon Calendar',
    listTitle: 'Running Talk — Marathon Q&A, Buddies & Race Info | Marathon Calendar',
    listDesc: 'A runners’ board for race questions, finding buddies and crews, race info and open chat. Posts and comments are visible to members with a confirmed email.',
    locked: 'Members only. Sign up and confirm your email to read this post.',
    comments: (n: number) => `${n} comment${n === 1 ? '' : 's'}`,
    likes: (n: number) => `${n} like${n === 1 ? '' : 's'}`,
    tail: 'Post and comments are visible to members with a confirmed email.',
    post: 'Running Talk post',
    raceLink: 'Race dates & registration',
    empty: 'No posts yet.',
    crumb: 'Breadcrumb',
  },
} as const;

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
/** <script> 안에 넣는 JSON (site.ts 와 같은 규칙) */
const jsonForScript = (v: unknown) =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
/** 작성 시각(UTC ISO) → 한국 날짜 'YYYY-MM-DD' */
const kstDay = (iso: string) => new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 10);
const prefix = (lang: Lang) => (lang === 'en' ? '/en' : '');
export const postPath = (id: string, lang: Lang = 'ko') => `${prefix(lang)}/community/${id}`;

// ── Supabase ────────────────────────────────────────────────────────────────────────
/** 공개 키(anon)로 RPC. 네트워크·HTTP 오류는 throw (부른 쪽이 '확인 불가'로 다룬다) */
async function rpc<T>(env: SiteEnv, name: string, args: Record<string, unknown>, fetchFn: FetchFn): Promise<T> {
  const base = (env.COMMUNITY_SUPABASE_URL || PUBLIC_SB.url).replace(/\/+$/, '');
  const res = await fetchFn(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: PUBLIC_SB.key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`supabase ${name} ${res.status}`);
  return (await res.json()) as T;
}
const netFetch: FetchFn = (input, init) => fetch(input, init);

/** RPC 행 → PostListItem (모르는 칸은 버리고 꼴을 맞춘다) */
function toItem(r: Record<string, unknown>): PostListItem | null {
  if (typeof r?.id !== 'string' || typeof r.created_at !== 'string' || !CATEGORIES.includes(r.category as Category)) return null;
  const state = r.state === 'visible' || r.state === 'deleted' || r.state === 'temp_hidden' || r.state === 'hidden' ? r.state : null;
  if (!state) return null;
  return {
    id: r.id,
    race_id: typeof r.race_id === 'string' ? r.race_id : null,
    category: r.category as Category,
    title: typeof r.title === 'string' ? r.title : null,
    nickname: typeof r.nickname === 'string' ? r.nickname : null,
    created_at: r.created_at,
    comment_count: Number(r.comment_count) || 0,
    like_count: Number(r.like_count) || 0,
    edited: r.edited === true,
    state,
  };
}

async function fetchList(env: SiteEnv, fetchFn: FetchFn, race: string | null, cat: string | null, cur: { at: string; id: string } | null) {
  const rows = await rpc<unknown>(
    env,
    'community_list',
    { p_race: race, p_cat: cat, p_before_at: cur?.at ?? null, p_before_id: cur?.id ?? null, p_limit: LIMITS.page },
    fetchFn,
  );
  if (!Array.isArray(rows)) throw new Error('community_list: not array');
  const items = rows.map(toItem).filter((x): x is PostListItem => !!x);
  const last = items.at(-1);
  const out: PostListResponse = { items, next: rows.length >= LIMITS.page && last ? encodeCursor(last) : null };
  return out;
}

// ── /api/community ──────────────────────────────────────────────────────────────────
const apiJson = (body: string, status = 200) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // 브라우저는 매번 묻는다(새 글이 바로 보이게). 서버 쪽 45초 캐시는 Cache API 가 맡는다
      'Cache-Control': status === 200 ? 'private, max-age=0' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

export async function communityApi(req: Request, env: SiteEnv, deps: CommunityDeps = {}): Promise<Response> {
  if (req.method !== 'GET') return apiJson(JSON.stringify({ error: 'method', message: 'GET 만 받습니다.' }), 405);
  if (!sameSite(req)) return blocked();
  const url = new URL(req.url);
  const param = (k: string) => url.searchParams.get(k) || null;
  const race = param('race');
  const cat = param('cat');
  const before = param('before');
  const bad = () => apiJson(JSON.stringify({ error: 'bad_param', message: '잘못된 요청입니다.' }), 400);
  if (race !== null && !/^[a-z0-9-]{2,40}$/.test(race)) return bad();
  if (cat !== null && !CATEGORIES.includes(cat as Category)) return bad();
  const cur = before === null ? null : decodeCursor(before);
  if (before !== null && !cur) return bad();

  const fetchFn = deps.fetch ?? netFetch;
  const cache = deps.cache === undefined ? defaultCache() : deps.cache;
  // 첫 페이지만 캐시. 키는 정규화한 주소(다른 파라미터·순서와 무관)
  const key = cur ? null : `${SITE}/api/community?race=${race ?? ''}&cat=${cat ?? ''}`;
  if (key && cache) {
    const hit = await cache.match(key).catch(() => undefined);
    if (hit) return apiJson(await hit.text());
  }
  let body: string;
  try {
    body = JSON.stringify(await fetchList(env, fetchFn, race, cat, cur));
  } catch {
    return apiJson(JSON.stringify({ error: 'unavailable', message: '글 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.' }), 502);
  }
  if (key && cache) {
    await cache
      .put(key, new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': `public, max-age=${LIST_TTL}` } }))
      .catch(() => {});
  }
  return apiJson(body);
}

// ── 프리렌더 내용 (HTMLRewriter 없이 시험할 수 있게 순수 함수로) ─────────────────────────
export interface PageParts {
  title: string;
  desc: string;
  canonical: string;
  root: string;
  lds: unknown[];
}

/** 글 페이지 (state 가 visible 인 글만 부른다) */
export function postParts(d: PostDetail, raceName: string | null, lang: Lang): PageParts {
  const t = TEXT[lang];
  const p = d.post;
  const title = p.title ?? '';
  const nick = p.nickname ?? '';
  const day = kstDay(p.created_at);
  const cat = CAT_TEXT[lang][p.category];
  const koUrl = `${SITE}${postPath(p.id)}`;
  const url = `${SITE}${postPath(p.id, lang)}`;
  const listUrl = `${SITE}${prefix(lang)}/community`;
  const meta = [cat, raceName, nick, fmtDate(day, lang), t.comments(p.comment_count)].filter(Boolean).join(' · ');
  let desc = `${meta} — ${t.post}. ${t.tail}`;
  if (desc.length > 160) desc = `${meta}`.slice(0, 159) + '…';
  const raceHref = p.race_id ? `${prefix(lang)}/r/${encodeURIComponent(p.race_id)}` : '';
  const root = `<main style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
<nav aria-label="${t.crumb}"><a href="${prefix(lang)}/">${t.site}</a> › <a href="${prefix(lang)}/community">${t.name}</a>${
    p.race_id && raceName ? ` › <a href="${prefix(lang)}/community?race=${encodeURIComponent(p.race_id)}">${esc(raceName)}</a>` : ''
  }</nav>
<article>
<p>${esc(cat)}</p>
<h1>${esc(title)}</h1>
<p>${esc(nick)} · <time datetime="${esc(p.created_at)}">${esc(fmtDate(day, lang))}</time> · ${t.comments(p.comment_count)} · ${t.likes(p.like_count)}</p>
<div class="${MEMBERS_ONLY_CLASS}"><p>${t.locked}</p></div>
</article>
${raceHref && raceName ? `<p><a href="${raceHref}">${esc(raceName)} — ${t.raceLink}</a></p>` : ''}
</main>`;
  const posting: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    '@id': koUrl,
    url: koUrl,
    headline: title,
    inLanguage: 'ko',
    datePublished: p.created_at,
    dateModified: p.updated_at,
    author: { '@type': 'Person', name: nick },
    commentCount: p.comment_count,
    interactionStatistic: [
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/LikeAction', userInteractionCount: p.like_count },
      { '@type': 'InteractionCounter', interactionType: 'https://schema.org/CommentAction', userInteractionCount: p.comment_count },
    ],
    isAccessibleForFree: false,
    hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: `.${MEMBERS_ONLY_CLASS}` },
    isPartOf: { '@type': 'WebPage', name: t.name, url: listUrl },
    ...(p.race_id && raceName ? { about: { '@type': 'SportsEvent', name: raceName, url: `${SITE}${raceHref}` } } : {}),
  };
  const crumbs = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t.site, item: `${SITE}${prefix(lang)}/` },
      { '@type': 'ListItem', position: 2, name: t.name, item: listUrl },
      { '@type': 'ListItem', position: 3, name: title, item: url },
    ],
  };
  return { title: `${title} — ${t.name} | ${t.site}`, desc, canonical: koUrl, root, lds: [posting, crumbs] };
}

/** 러닝톡 목록 페이지 (첫 페이지 글 제목만) */
export function listParts(items: PostListItem[], raceNames: Map<string, string>, lang: Lang): PageParts {
  const t = TEXT[lang];
  const shown = items.filter((x) => x.state === 'visible' && x.title);
  const li = (x: PostListItem) => {
    const rn = x.race_id ? raceNames.get(x.race_id) : undefined;
    const meta = [rn, x.nickname, fmtDate(kstDay(x.created_at), lang), t.comments(x.comment_count)].filter(Boolean).map(esc).join(' · ');
    return `<li><a href="${postPath(x.id, lang)}">[${esc(CAT_TEXT[lang][x.category])}] ${esc(x.title)}</a> — ${meta}</li>`;
  };
  const root = `<main style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
<nav aria-label="${t.crumb}"><a href="${prefix(lang)}/">${t.site}</a> › ${t.name}</nav>
<h1>${t.name}</h1>
<p>${esc(t.listDesc)}</p>
${shown.length ? `<ul>${shown.map(li).join('')}</ul>` : `<p>${t.empty}</p>`}
</main>`;
  return { title: t.listTitle, desc: t.listDesc, canonical: `${SITE}${prefix(lang)}/community`, root, lds: [] };
}

// ── /community, /community/<id> ─────────────────────────────────────────────────────
export const ldHtml = (lds: unknown[]) => lds.map((ld) => `<script type="application/ld+json">${jsonForScript(ld)}</script>`).join('');

function finish(out: Response, status: number, cache: string): Response {
  const res = new Response(out.body, { status, headers: out.headers });
  res.headers.set('Cache-Control', cache);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

function notFoundPage(page: Response): Response {
  const out = new HTMLRewriter()
    .on('head', { element: (el) => el.append('<meta name="robots" content="noindex">', { html: true }) })
    .on('script#ld-itemlist', { element: (el) => el.remove() })
    .transform(page);
  return finish(out, 404, `public, max-age=${PAGE_TTL}`);
}

function rewrite(page: Response, parts: PageParts, hreflang: { ko: string; en: string } | null): Response {
  const set = (content: string) => ({ element: (el: Element) => el.setAttribute('content', content) });
  const out = new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(parts.title) })
    .on('meta[name="description"]', set(parts.desc))
    .on('meta[property="og:title"]', set(parts.title))
    .on('meta[property="og:description"]', set(parts.desc))
    .on('meta[property="og:url"]', set(parts.canonical))
    .on('meta[name="twitter:title"]', set(parts.title))
    .on('meta[name="twitter:description"]', set(parts.desc))
    .on('link[rel="canonical"]', { element: (el) => el.setAttribute('href', parts.canonical) })
    // 글 페이지는 한국어 주소 하나를 canonical 로 → 언어 대체 주소는 뺀다. 목록은 ko·en 주소로
    .on('link[rel="alternate"][hreflang]', {
      element: (el) => (hreflang ? el.setAttribute('href', el.getAttribute('hreflang') === 'en' ? hreflang.en : hreflang.ko) : el.remove()),
    })
    .on('script#ld-itemlist', { element: (el) => el.remove() })
    .on('div#root', { element: (el) => el.setInnerContent(parts.root, { html: true }) })
    .on('head', { element: (el) => el.append(ldHtml(parts.lds), { html: true }) })
    .transform(page);
  return finish(out, 200, `public, max-age=${PAGE_TTL}`);
}

async function raceNameMap(req: Request, env: SiteEnv, lang: Lang): Promise<Map<string, string>> {
  try {
    const { list } = await loadRaces(req, env);
    return new Map(list.map((r) => [r.id, (lang === 'en' && r.name_en?.trim()) || r.name_ko]));
  } catch {
    return new Map();
  }
}

/** id 가 null 이면 목록 페이지 */
export async function communityPage(req: Request, env: SiteEnv, id: string | null, lang: Lang, deps: CommunityDeps = {}): Promise<Response> {
  const fetchFn = deps.fetch ?? netFetch;
  const page = await env.ASSETS.fetch(new URL(lang === 'en' ? '/en/' : '/', req.url).toString());

  if (id === null) {
    let items: PostListItem[] = [];
    try {
      items = (await fetchList(env, fetchFn, null, null, null)).items;
    } catch {
      // 목록을 못 받아도 페이지는 낸다 (제목·설명만)
    }
    const names = await raceNameMap(req, env, lang);
    return rewrite(page, listParts(items, names, lang), { ko: `${SITE}/community`, en: `${SITE}/en/community` });
  }

  if (!isUuid(id)) return notFoundPage(page);
  let d: PostDetail | null;
  try {
    d = await rpc<PostDetail | null>(env, 'community_post', { p_id: id }, fetchFn);
  } catch {
    // 확인 못 함: 없는 글로 단정하지 않고 기본 페이지 그대로 (대회 페이지 withRaceMeta 와 같음)
    return finish(page, 200, 'private, no-store');
  }
  if (!d || !d.post || d.post.state !== 'visible' || !d.post.title) return notFoundPage(page);
  const raceName = d.post.race_id ? ((await raceNameMap(req, env, lang)).get(d.post.race_id) ?? null) : null;
  return rewrite(page, postParts(d, raceName, lang), null);
}
