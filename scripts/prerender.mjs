/**
 * 빌드 뒤 dist/index.html 의 <div id="root"> 안에 대회 목록을 글자로 미리 넣는다.
 * 검색엔진(구글·네이버)이 자바스크립트를 실행하지 않아도 "마라톤 일정" 내용을 읽고 각 대회 페이지(/r/id)로
 * 따라갈 수 있게 하기 위함. 화면이 뜨면 React 가 이 내용을 바로 갈아 끼운다.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGIN = process.env.SITE_ORIGIN || 'https://marathoncalendar.pages.dev';
const dist = new URL('../dist/index.html', import.meta.url);
const snap = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const ENTRY = { lottery: '추첨', fcfs: '선착순', qualifying: '기록 기준', tour_only: '여행사 전용', open: '상시 접수' };
const fmt = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
};

const upcoming = snap.races.filter((r) => r.race_date >= today).sort((a, b) => a.race_date.localeCompare(b.race_date));
const kr = upcoming.filter((r) => r.country_code === 'KR').length;
const byMonth = new Map();
for (const r of upcoming.slice(0, 240)) {
  const k = `${r.race_date.slice(0, 4)}년 ${Number(r.race_date.slice(5, 7))}월`;
  byMonth.set(k, [...(byMonth.get(k) ?? []), r]);
}
const item = (r) => {
  const where = r.country_code === 'KR' ? r.city_ko : `${r.country_ko} ${r.city_ko}`;
  const entry = [ENTRY[r.entry_type], r.entry_opens && `접수 ${fmt(r.entry_opens)}부터`, r.entry_closes && `${fmt(r.entry_closes)}까지`]
    .filter(Boolean)
    .join(' ');
  return `<li><a href="/r/${esc(r.id)}">${esc(r.name_ko)}</a> — ${fmt(r.race_date)}, ${esc(where)}${entry ? `, ${esc(entry)}` : ''}</li>`;
};
const html = `<main class="seo-pre" style="max-width:72rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
<h1>마라톤 캘린더 — 국내·해외 마라톤 대회 일정과 접수 기간</h1>
<p>국내 ${kr}개, 해외 ${upcoming.length - kr}개 마라톤 대회의 날짜, 접수 시작·마감일, 추첨·선착순 여부, 참가비, 여행사 패키지와 예상 경비를 모았습니다. 서울마라톤, 춘천마라톤, JTBC 서울마라톤, 도쿄·오사카·보스턴·뉴욕·베를린·런던 마라톤 일정을 한눈에 확인하세요.</p>
${[...byMonth.entries()].map(([m, rs]) => `<h2>${m} 마라톤 일정</h2><ul>${rs.map(item).join('')}</ul>`).join('\n')}
</main>`;

const ld = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: '다가오는 마라톤 대회',
  itemListElement: upcoming.slice(0, 100).map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/r/${r.id}`, name: r.name_ko })),
};

let page = readFileSync(dist, 'utf8');
page = page.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
const safeJson = JSON.stringify(ld).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
page = page.replace('</head>', `<script type="application/ld+json">${safeJson}</script>\n</head>`);
writeFileSync(dist, page);
console.log(`prerender: ${Math.min(upcoming.length, 240)}개 대회를 첫 화면 HTML 에 넣음`);
