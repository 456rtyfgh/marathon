import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initAnalytics } from './lib/analytics';
import { LangProvider, applyLang, initialLang } from './i18n';

// 예전 주소(marathoncalendar.pages.dev)로 들어오면 대표 주소로 옮긴다
if (location.hostname === 'marathoncalendar.pages.dev') {
  location.replace('https://marathon82.com' + location.pathname + location.search + location.hash);
}

// 첫 렌더 전에 언어를 정하고 주소(/en 꼴)·<html lang> 을 맞춘다 — 한국어 첫 화면은 그대로
const lang = initialLang();
applyLang(lang);

initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider initial={lang}>
      <App />
    </LangProvider>
  </StrictMode>,
);
