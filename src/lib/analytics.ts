/**
 * Google Analytics 4. 측정 ID(VITE_GA_ID, G-로 시작)가 있을 때만 켜진다.
 * 대회를 몇 번 열었는지, 공식 홈페이지로 몇 명이 넘어갔는지 같은 숫자는
 * 여행사·대회 측에 보여 줄 근거가 되므로 이벤트 이름을 바꾸지 말 것.
 */
type Params = Record<string, string | number | boolean | undefined>;
type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const ID = import.meta.env.VITE_GA_ID;
const on = !!ID && /^G-[A-Z0-9]+$/.test(ID) && typeof window !== 'undefined' && !/^(localhost|127\.)/.test(location.hostname);

export function initAnalytics() {
  if (!on || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', ID, { anonymize_ip: true });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${ID}`;
  document.head.appendChild(s);
}

export function track(name: string, params: Params = {}) {
  if (on) window.gtag?.('event', name, params);
}

/** 대회 상세(?r=…)를 연 것도 한 페이지로 센다 */
export function pageView(title: string) {
  if (on) window.gtag?.('event', 'page_view', { page_location: location.href, page_title: title });
}
