/**
 * 방문 통계 두 갈래
 *  1) Google Analytics 4 — 방문자 수·유입 경로·기기 등 전체 그림 (analytics.google.com)
 *  2) 자체 집계 — 검색어, 많이 본 대회, 공식 홈페이지·여행사 클릭 수 같은 "광고 영업용 숫자"를
 *     일별 합계로만 DB 에 쌓아 관리 화면 [통계] 탭에서 바로 본다. 사람을 알아볼 정보는 보내지 않는다.
 * 이벤트 이름은 지난 통계와 이어져야 하므로 바꾸지 말 것.
 */
type Params = Record<string, string | number | boolean | undefined | null>;
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

// 측정 ID 는 페이지 소스에 그대로 보이는 공개 값이라 기본값으로 넣어 둔다 (env 로 덮어쓸 수 있음)
const GA_ID = import.meta.env.VITE_GA_ID || 'G-CJKPZCKZMB';
const SB_URL = import.meta.env.VITE_SUPABASE_URL;
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;
const isLocal = typeof location !== 'undefined' && /^(localhost|127\.|\[::1\])/.test(location.hostname);
const gaOn = !!GA_ID && /^G-[A-Z0-9]+$/.test(GA_ID) && typeof window !== 'undefined' && !isLocal;
const statOn = !!SB_URL && !!SB_KEY && typeof window !== 'undefined' && !isLocal;

/* ── 자체 집계: 모았다가 한꺼번에 보낸다 ───────────────────────── */
type Hit = { e: string; k: string };
let queue: Hit[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (!queue.length || !statOn) return;
  // 같은 (이벤트, 키) 는 합쳐서 보낸다
  const merged = new Map<string, { e: string; k: string; n: number }>();
  for (const h of queue) {
    const id = `${h.e}\u0000${h.k}`;
    const m = merged.get(id);
    if (m) m.n++;
    else merged.set(id, { ...h, n: 1 });
  }
  queue = [];
  const items = [...merged.values()].slice(0, 40);
  fetch(`${SB_URL}/rest/v1/rpc/stat_hit`, {
    method: 'POST',
    keepalive: true,
    headers: { apikey: SB_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_items: items }),
  }).catch(() => {});
}

function stat(e: string, k: string | number | undefined | null = '') {
  if (!statOn) return;
  queue.push({ e, k: String(k ?? '').trim().toLowerCase().slice(0, 80) });
  if (queue.length >= 25) flush();
  else if (!timer) timer = setTimeout(flush, 8000);
}

/** GA 이벤트 이름 → 자체 집계 (이벤트, 키) */
function toStat(name: string, p: Params) {
  switch (name) {
    case 'race_view':
    case 'official_click':
    case 'calendar_add':
    case 'share':
    case 'favorite':
      return stat(name, p.race_id as string);
    case 'agency_click':
      return stat(name, p.agency_id as string);
    case 'race_tab':
      return stat(name, p.tab as string);
    case 'search':
      stat('search', p.search_term as string);
      if (p.results === 0) stat('search_empty', p.search_term as string);
      return;
    case 'filter':
      return stat('filter', `${p.name}:${p.value}`);
    case 'map_select':
      return stat('place', p.place as string);
    case 'map_open':
      return stat('map_open', p.scope as string);
    case 'sign_up':
      return stat('sign_up', p.result as string);
    case 'request_submit':
      return stat('request', p.race_name as string);
    case 'alert_subscribe':
      return stat('alert', p.race_id as string);
    case 'review_submit':
      return stat('review', p.race_id as string);
  }
}

function source(): string {
  const q = new URLSearchParams(location.search);
  const utm = q.get('utm_source');
  if (utm) return utm;
  try {
    if (!document.referrer) return '(직접)';
    const h = new URL(document.referrer).hostname.replace(/^www\./, '');
    return h === location.hostname ? '' : h;
  } catch {
    return '(직접)';
  }
}

export function initAnalytics() {
  if (typeof window === 'undefined') return;
  if (gaOn && !window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true });
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(s);
  }
  // 방문은 탭 하나(세션)당 한 번만 센다
  try {
    if (!sessionStorage.getItem('mc:visit')) {
      sessionStorage.setItem('mc:visit', '1');
      stat('visit');
      const src = source();
      if (src) stat('source', src);
    }
  } catch {
    stat('visit');
  }
  addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush());
  addEventListener('pagehide', flush);
}

export function track(name: string, params: Params = {}) {
  if (gaOn) window.gtag?.('event', name, params);
  toStat(name, params);
}

/** 대회 상세(/r/…)를 연 것도 한 페이지로 센다 */
export function pageView(title: string) {
  if (gaOn) window.gtag?.('event', 'page_view', { page_location: location.href, page_title: title });
}
