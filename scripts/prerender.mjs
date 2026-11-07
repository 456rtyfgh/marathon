/**
 * 빌드 뒤 dist/index.html 의 <div id="root"> 안에 대회 목록을 글자로 미리 넣는다.
 * 검색엔진(구글·네이버)이 자바스크립트를 실행하지 않아도 "마라톤 일정" 내용을 읽고 각 대회 페이지(/r/id)와
 * 월별·나라별 목록 페이지(/m/…, /c/… — scripts/seo-pages.mjs)로 따라갈 수 있게 하기 위함.
 * 화면이 뜨면 React 가 이 내용을 바로 갈아 끼운다.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ENTRY, ORIGIN, countries, countryPath, esc, fmt, isCancelled, ldJson, monthLabel, monthPath, months, today, upcoming, whereOf } from './seo-lib.mjs';

const dist = new URL('../dist/index.html', import.meta.url);
const kr = upcoming.filter((r) => r.country_code === 'KR').length;
const byMonth = new Map();
for (const r of upcoming) {
  const k = r.race_date.slice(0, 7);
  byMonth.set(k, [...(byMonth.get(k) ?? []), r]);
}
// 첫 240개는 접수 정보까지, 나머지는 이름·날짜만 (HTML 크기를 줄이되 모든 대회로 가는 링크는 남긴다)
const FULL = 240;
let n = 0;
const item = (r) => {
  const full = n++ < FULL;
  const entry = full
    ? [ENTRY[r.entry_type], r.entry_opens && `접수 ${fmt(r.entry_opens)}부터`, r.entry_closes && `${fmt(r.entry_closes)}까지`].filter(Boolean).join(' ')
    : '';
  return `<li>${isCancelled(r) ? '[대회 취소] ' : ''}<a href="/r/${esc(r.id)}">${esc(r.name_ko)}</a> — ${fmt(r.race_date)}, ${esc(whereOf(r))}${entry ? `, ${esc(entry)}` : ''}</li>`;
};
const nav = `<nav aria-label="월별 마라톤 일정"><h2>월별 마라톤 일정</h2><p>${months
  .filter((ym) => ym >= today.slice(0, 7))
  .map((ym) => `<a href="${monthPath(ym)}">${monthLabel(ym)}</a>`)
  .join(' · ')}</p></nav>
<nav aria-label="나라별 마라톤 일정"><h2>나라별 마라톤 일정</h2><p>${countries
  .map((c) => `<a href="${countryPath(c.code)}">${esc(c.code === 'kr' ? '국내' : c.name)}</a>`)
  .join(' · ')}</p></nav>`;
const html = `<main class="seo-pre" style="max-width:72rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
<h1>마라톤 캘린더 — 2026·2027 국내·해외 마라톤 대회 일정과 접수 기간</h1>
<p>국내 ${kr}개, 해외 ${upcoming.length - kr}개 마라톤·트레일러닝 대회의 날짜, 접수 시작·마감일, 추첨·선착순 여부, 참가비, 여행사 패키지와 예상 경비를 모았습니다. 서울마라톤, 춘천마라톤, JTBC 서울마라톤, 도쿄·오사카·보스턴·뉴욕·베를린·런던 마라톤 일정을 한눈에 확인하세요.</p>
${nav}
${[...byMonth.entries()].map(([ym, rs]) => `<h2><a href="${monthPath(ym)}">${monthLabel(ym)} 마라톤 일정</a></h2><ul>${rs.map(item).join('')}</ul>`).join('\n')}
</main>`;

const ld = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: '다가오는 마라톤 대회',
  itemListElement: upcoming.slice(0, 100).map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/r/${r.id}`, name: r.name_ko })),
};

// 첫 화면에 먼저 필요한 것 미리 받기 (lighthouse 로 첫 화면이 실제로 받는 순서를 보고 고름, .duo-data/seo-report.md)
//  - 글꼴: Wanted Sans 라틴·숫자 조각(split.90)과 Barlow Condensed 700. 파일명에 해시가 붙어 원본 index.html 에는 못 넣는다.
//  - /data.json: 앱이 JS 를 다 받은 뒤에야 요청해 LCP 가 늦어진다. src/lib/data.ts 의 fetch('/data.json') 과 같은 모드(crossorigin)로.
//  - Supabase: 첫 화면 통계(race_public_stats)를 바로 부른다 → 연결만 미리.
const assets = readdirSync(new URL('../dist/assets/', import.meta.url));
const FONTS = [/^WantedSansVariable\.split\.90-[\w-]+\.woff2$/, /^barlow-condensed-latin-700-normal-[\w-]+\.woff2$/];
const preloads = [
  ...FONTS.map((re) => assets.find((f) => re.test(f)))
    .filter(Boolean)
    .map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin>`),
  '<link rel="preload" href="/data.json" as="fetch" crossorigin>',
  '<link rel="preconnect" href="https://zhwmfvkwtmakieatlqtz.supabase.co" crossorigin>',
];

let page = readFileSync(dist, 'utf8');
page = page.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
// id 로 표시: 대회 페이지(worker/site.ts)는 이 홈 목록 구조화 데이터를 지운다
page = page.replace('</head>', `${preloads.join('\n')}\n${ldJson(ld).replace('<script ', '<script id="ld-itemlist" ')}\n</head>`);
writeFileSync(dist, page);
console.log(`prerender: 대회 ${upcoming.length}개 링크(접수 정보 ${Math.min(FULL, upcoming.length)}개), 미리 받기·연결 ${preloads.length}개`);
