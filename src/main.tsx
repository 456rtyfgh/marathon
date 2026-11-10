import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initAnalytics } from './lib/analytics';
import { PRIVACY_PATH } from './lib/policy';
import { LangProvider, applyLang, initialLang, stripLang } from './i18n';

// 예전 주소(marathoncalendar.pages.dev)로 들어오면 대표 주소로 옮긴다
if (location.hostname === 'marathoncalendar.pages.dev') {
  location.replace('https://marathon82.com' + location.pathname + location.search + location.hash);
}

// 첫 렌더 전에 언어를 정하고 주소(/en 꼴)·<html lang> 을 맞춘다 — 한국어 첫 화면은 그대로
const lang = initialLang();
applyLang(lang);

initAnalytics();

// 처리방침은 App 바깥에서 따로 그린다 (App 의 hooks 를 건드리지 않게, 본문은 그 페이지에서만 받는다). 약관은 정적 페이지 scripts/terms.mjs
const path = stripLang(location.pathname).replace(/(.)\/+$/, '$1');
const legal = path === PRIVACY_PATH ? 'privacy' : null;

// 첫 로딩 화면(index.html #boot)은 앱이 처음 그려진 뒤 살짝 흐리게 하고 지운다
// requestAnimationFrame 은 뒤에 숨은 탭에서 멈추므로 setTimeout 으로
const hideBoot = () =>
  setTimeout(() => {
    const b = document.getElementById('boot');
    if (!b) return;
    b.classList.add('done');
    setTimeout(() => b.remove(), 250);
  }, 30);

const render = (node: ReactNode) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LangProvider initial={lang}>{node}</LangProvider>
    </StrictMode>,
  );
  hideBoot();
};
// 혹시 앱이 오래 걸리거나 실패해도 8초 뒤에는 로딩 화면을 걷는다
setTimeout(hideBoot, 8000);

if (legal) import('./legal/LegalPage').then(({ default: LegalPage }) => render(<LegalPage kind={legal} />));
else render(<App />);
