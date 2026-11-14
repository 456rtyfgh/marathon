/**
 * 빌드 뒤 dist/index.html 의 <div id="root"> 안에 대회 목록을 글자로 미리 넣는다.
 * 검색엔진(구글·네이버)이 자바스크립트를 실행하지 않아도 "마라톤 일정" 내용을 읽고 각 대회 페이지(/r/id)와
 * 월별·나라별 목록 페이지(/m/…, /c/… — scripts/seo-pages.mjs)로 따라갈 수 있게 하기 위함.
 * 화면이 뜨면 React 가 이 내용을 바로 갈아 끼운다.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { ENTRY, LANDINGS, ORIGIN, countries, countryPath, esc, fmt, isCancelled, ldJson, monthLabel, monthPath, months, today, upcoming, whereOf } from './seo-lib.mjs';
import { LANDINGS_EN, SITE_NAME_EN, countryNameEn, enPath, entryEn, fmtEn, monthLabelEn, raceNameEn, whereEn } from './seo-lib.mjs';
import { distancePages, regionPages } from './seo-lib.mjs';
import { readSplit } from './data-split.mjs';
import { noticeHtml } from '../src/lib/notice.ts';
import { entryStatus } from '../src/lib/util.ts';
import { LIST_DEFAULTS, byRaceDate, inScope, matchesAnyStatus } from '../src/lib/listPrefs.ts';

const dist = new URL('../dist/index.html', import.meta.url);
// 국내 수는 앱 소개 문구·범위 탭과 같은 기준(isDomestic)으로
const kr = upcoming.filter((r) => inScope(r, 'kr')).length;
// 첫 화면 기본 목록 (src/lib/listPrefs.ts 의 LIST_DEFAULTS: 국내 · 접수 중 · 대회 날짜순) — 앱이 처음 그리는 목록과 같은 대회·순서
const todayDate = new Date(today + 'T00:00:00Z');
const defaults = byRaceDate(
  upcoming.filter((r) => inScope(r, LIST_DEFAULTS.scope) && matchesAnyStatus(r, entryStatus(r, todayDate), LIST_DEFAULTS.status, todayDate)),
);
const defaultIds = new Set(defaults.map((r) => r.id));
/** 구조화 데이터 ItemList 순서: 기본 목록 → 나머지 다가오는 대회(날짜순) */
const ldOrder = [...defaults, ...upcoming.filter((r) => !defaultIds.has(r.id))].slice(0, 100);
const byMonth = new Map();
for (const r of upcoming) {
  const k = r.race_date.slice(0, 7);
  byMonth.set(k, [...(byMonth.get(k) ?? []), r]);
}
// 월별 목록: 첫 240개는 접수 정보까지, 나머지는 이름·날짜만 (HTML 크기를 줄이되 모든 대회로 가는 링크는 남긴다)
// 기본 목록(defaults)은 늘 접수 정보까지 (full=true, 240 세기에 넣지 않는다)
const FULL = 240;
let n = 0;
const item = (r, full = n++ < FULL) => {
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
  .join(' · ')}</p></nav>
<nav aria-label="주제별 마라톤 일정"><h2>주제별 마라톤 일정</h2><p>${LANDINGS.map((l) => `<a href="${l.path}">${esc(l.name)}</a>`).join(' · ')}</p></nav>
<nav aria-label="시·도별·거리별 국내 마라톤 일정"><h2>시·도별·거리별 국내 마라톤 일정</h2><p>${regionPages
  .map((p) => `<a href="${p.path}">${esc(p.name)}</a>`)
  .join(' · ')}</p><p>${distancePages.map((d) => `<a href="${d.path}">${esc(d.name)}</a>`).join(' · ')}</p></nav>`;
const html = `<main class="seo-pre" style="max-width:72rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
<h1>마라톤 캘린더</h1>
<p>국내·해외 마라톤 대회 일정과 접수 기간을 대회 날짜순으로 모았습니다. 국내 ${kr}개, 해외 ${upcoming.length - kr}개.</p>
<p>국내 ${kr}개, 해외 ${upcoming.length - kr}개 마라톤·트레일러닝 대회의 날짜, 접수 시작·마감일, 추첨·선착순 여부, 참가비, 여행사 패키지와 예상 경비를 모았습니다. 서울마라톤, 춘천마라톤, JTBC 서울마라톤, 도쿄·오사카·보스턴·뉴욕·베를린·런던 마라톤 일정을 한눈에 확인하세요.</p>
<section aria-label="지금 접수 중인 국내 마라톤"><h2>지금 접수 중인 국내 마라톤</h2><ul>${defaults.map((r) => item(r, true)).join('')}</ul></section>
${nav}
${[...byMonth.entries()].map(([ym, rs]) => `<h2><a href="${monthPath(ym)}">${monthLabel(ym)} 마라톤 일정</a></h2><ul>${rs.map((r) => item(r)).join('')}</ul>`).join('\n')}
${noticeHtml('ko')}
</main>`;

const ld = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: '다가오는 마라톤 대회',
  itemListElement: ldOrder.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/r/${r.id}`, name: r.name_ko })),
};

// 첫 화면에 먼저 필요한 것 미리 받기 (lighthouse 로 첫 화면이 실제로 받는 순서를 보고 고름, .duo-data/seo-report.md)
//  - 글꼴: Wanted Sans 라틴·숫자 조각(split.90)과 Barlow Condensed 700. 파일명에 해시가 붙어 원본 index.html 에는 못 넣는다.
//  - 목록 파일(/d/<hash>.json): 앱이 JS 를 다 받은 뒤에야 요청해 LCP 가 늦어진다. src/lib/data.ts 의 fetch(__DATA_LIST_URL__) 과 같은 모드(crossorigin)로.
//    주소는 vite.config.ts 의 __DATA_LIST_URL__ 와 같은 값 (같은 public/data.json → 같은 해시, scripts/data-split.mjs).
//  - Supabase: 첫 화면 통계(race_public_stats)를 바로 부른다 → 연결만 미리.
const assets = readdirSync(new URL('../dist/assets/', import.meta.url));
const FONTS = [/^WantedSansVariable\.split\.90-[\w-]+\.woff2$/, /^barlow-condensed-latin-700-normal-[\w-]+\.woff2$/];
const preloads = [
  ...FONTS.map((re) => assets.find((f) => re.test(f)))
    .filter(Boolean)
    .map((f) => `<link rel="preload" href="/assets/${f}" as="font" type="font/woff2" crossorigin>`),
  `<link rel="preload" href="${readSplit().listPath}" as="fetch" crossorigin>`,
  '<link rel="preconnect" href="https://zhwmfvkwtmakieatlqtz.supabase.co" crossorigin>',
];

const built = readFileSync(dist, 'utf8');
let page = built;
page = page.replace('<div id="root"></div>', `<div id="root">${html}</div>`);
// id 로 표시: 대회 페이지(worker/site.ts)는 이 홈 목록 구조화 데이터를 지운다
page = page.replace('</head>', `${preloads.join('\n')}\n${ldJson(ld).replace('<script ', '<script id="ld-itemlist" ')}\n</head>`);
writeFileSync(dist, page);
console.log(`prerender: 대회 ${upcoming.length}개 링크(접수 정보 ${Math.min(FULL, upcoming.length)}개), 미리 받기·연결 ${preloads.length}개`);
console.log(`prerender: 첫 화면 기본 목록(국내·접수 중·대회 날짜순) ${defaults.length}개`);

// ── 영어 첫 화면 dist/en/index.html: 빌드된 index.html 복사본에서 머리말·구조화 데이터·미리 그린 목록만 영어로 (같은 JS·CSS) ──
// 대회 영어 SSR(worker/site.ts 의 /en/r/<id>)도 이 파일을 바탕으로 쓴다.
const TITLE_EN = 'Marathon Calendar — 2026–2027 Race Dates & Registration, Korea and Worldwide';
const DESC_EN =
  'Marathon dates and registration open and close dates for 2026–2027, in Korea and worldwide, all in one place. Lottery or first-come entry, entry fees, tour packages and trail races — never miss registration for Seoul, Chuncheon, JTBC Seoul, Tokyo, Boston or Berlin.';
const OG_DESC_EN = 'Entry types and registration windows for marathons in Korea and worldwide';
const KEYWORDS_EN =
  'marathon calendar, marathon schedule, marathon race dates, 2026 marathons, 2027 marathon calendar, marathon registration, marathons in Korea, marathons in Japan, half marathon schedule, 10k races, Tokyo Marathon lottery, Boston Marathon, Chuncheon Marathon, Seoul Marathon, JTBC Seoul Marathon';

let m = 0;
const itemEn = (r, full = m++ < FULL) => {
  const entry = full ? entryEn(r) : '';
  return `<li>${isCancelled(r) ? '[Cancelled] ' : ''}<a href="${enPath(`/r/${esc(r.id)}`)}">${esc(raceNameEn(r))}</a> — ${fmtEn(r.race_date)}, ${esc(whereEn(r))}${entry ? `, ${esc(entry)}` : ''}</li>`;
};
const navEn = `<nav aria-label="Marathons by month"><h2>Marathons by Month</h2><p>${months
  .filter((ym) => ym >= today.slice(0, 7))
  .map((ym) => `<a href="${enPath(monthPath(ym))}">${monthLabelEn(ym)}</a>`)
  .join(' · ')}</p></nav>
<nav aria-label="Marathons by country"><h2>Marathons by Country</h2><p>${countries
  .map((c) => `<a href="${enPath(countryPath(c.code))}">${esc(countryNameEn(c.code.toUpperCase()))}</a>`)
  .join(' · ')}</p></nav>
<nav aria-label="Marathons by topic"><h2>Marathons by Topic</h2><p>${LANDINGS_EN.map((l) => `<a href="${l.path}">${esc(l.name)}</a>`).join(' · ')}</p></nav>
<nav aria-label="Races in Korea by region and distance"><h2>Races in Korea by Region and Distance</h2><p>${regionPages
  .map((p) => `<a href="${enPath(p.path)}">${esc(p.nameEn)}</a>`)
  .join(' · ')}</p><p>${distancePages.map((d) => `<a href="${enPath(d.path)}">${esc(d.nameEn)}</a>`).join(' · ')}</p></nav>`;
const htmlEn = `<main class="seo-pre" style="max-width:72rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
<h1>${SITE_NAME_EN}</h1>
<p>Marathon dates and registration windows in Korea and worldwide, in race-date order. ${kr.toLocaleString('en-US')} in Korea, ${(upcoming.length - kr).toLocaleString('en-US')} abroad.</p>
<p>Race dates, registration open and close dates, lottery or first-come entry, entry fees, tour packages and estimated costs for ${kr.toLocaleString('en-US')} races in Korea and ${(upcoming.length - kr).toLocaleString('en-US')} abroad, marathons and trail races alike. See Seoul, Chuncheon, JTBC Seoul, Tokyo, Osaka, Boston, New York, Berlin and London marathon dates at a glance.</p>
<section aria-label="Open for Registration in Korea"><h2>Open for Registration in Korea</h2><ul>${defaults.map((r) => itemEn(r, true)).join('')}</ul></section>
${navEn}
${[...byMonth.entries()].map(([ym, rs]) => `<h2><a href="${enPath(monthPath(ym))}">${monthLabelEn(ym)} Marathons</a></h2><ul>${rs.map((r) => itemEn(r)).join('')}</ul>`).join('\n')}
${noticeHtml('en')}
</main>`;
const ldEn = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Upcoming marathons',
  itemListElement: ldOrder.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}${enPath(`/r/${r.id}`)}`, name: raceNameEn(r) })),
};

/** index.html 의 구조화 데이터(Organization·WebSite)를 영어로 */
const ldToEn = (v) => {
  if (v['@type'] === 'WebSite')
    return {
      ...v,
      name: SITE_NAME_EN,
      alternateName: ['마라톤 캘린더', '마라톤캘린더', 'marathon82'],
      url: `${ORIGIN}/en/`,
      inLanguage: 'en',
      description: 'Marathon race dates, registration windows, entry fees and tour packages for races in Korea and worldwide',
      potentialAction: { ...v.potentialAction, target: `${ORIGIN}/en/?q={search_term_string}` },
    };
  if (v['@type'] === 'Organization')
    return { ...v, name: SITE_NAME_EN, ...(v.contactPoint ? { contactPoint: { ...v.contactPoint, contactType: 'customer support' } } : {}) };
  return v;
};
const setMeta = (html, attr, key, value) => {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*(")`);
  if (!re.test(html)) throw new Error(`prerender: ${key} 태그를 못 찾음`);
  return html.replace(re, `$1${esc(value)}$2`);
};

let en = built;
en = en.replace('<html lang="ko">', '<html lang="en">');
en = en.replace(/<title>[^<]*<\/title>/, `<title>${esc(TITLE_EN)}</title>`);
// 여러 줄로 쓴 description 도 잡도록 name·content 사이 공백은 아무거나
en = en.replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${esc(DESC_EN)}$2`);
en = setMeta(en, 'name', 'keywords', KEYWORDS_EN);
en = setMeta(en, 'property', 'og:title', SITE_NAME_EN);
en = setMeta(en, 'property', 'og:description', OG_DESC_EN);
en = setMeta(en, 'property', 'og:url', `${ORIGIN}/en/`);
en = setMeta(en, 'property', 'og:site_name', SITE_NAME_EN);
en = en.replace(/(<meta\s+property="og:locale"\s+content=")ko_KR("\s*\/?>)/, '$1en_US$2\n    <meta property="og:locale:alternate" content="ko_KR" />');
en = setMeta(en, 'name', 'twitter:title', SITE_NAME_EN);
en = setMeta(en, 'name', 'twitter:description', OG_DESC_EN);
en = en.replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/, `$1${ORIGIN}/en/$2`);
en = en.replace(/(<link\s+rel="alternate"\s+type="application\/rss\+xml"\s+title=")[^"]*(")/, `$1${SITE_NAME_EN}$2`);
en = en.replace(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, (_, json) => ldJson(ldToEn(JSON.parse(json))));
en = en.replace('<div id="root"></div>', `<div id="root">${htmlEn}</div>`);
en = en.replace('</head>', `${preloads.join('\n')}\n${ldJson(ldEn).replace('<script ', '<script id="ld-itemlist" ')}\n</head>`);
if (!en.includes(`hreflang="en" href="${ORIGIN}/en/"`)) throw new Error('prerender: index.html 에 hreflang en 줄이 없음');
mkdirSync(new URL('../dist/en/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/en/index.html', import.meta.url), en);
console.log('prerender: dist/en/index.html (영어 첫 화면)');
