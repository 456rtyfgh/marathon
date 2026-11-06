import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { initAnalytics } from './lib/analytics';

// 예전 주소(marathoncalendar.pages.dev)로 들어오면 대표 주소로 옮긴다
if (location.hostname === 'marathoncalendar.pages.dev') {
  location.replace('https://marathon82.com' + location.pathname + location.search + location.hash);
}

initAnalytics();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
