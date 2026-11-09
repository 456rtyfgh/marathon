/**
 * prerender.mjs · seo-pages.mjs · sitemap.mjs 가 같이 쓰는 값.
 * 크롤링용 정적 목록 페이지(/m/YYYY-MM/, /c/<나라>/)를 어떤 범위로 만드는지는 여기 한 곳에서만 정한다
 * — 세 스크립트가 각자 계산하면 sitemap·링크가 실제로 없는 페이지를 가리킬 수 있다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { DIST_TEXT, ENTRY_TEXT, fmtDate, fmtMonth } from '../src/i18n/format.ts';
import { countryName, whereText } from '../src/i18n/names.ts';

export const ORIGIN = process.env.SITE_ORIGIN || 'https://marathon82.com';
export const snap = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
/** 한국 시간 오늘 */
export const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const ldJson = (v) =>
  `<script type="application/ld+json">${JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}</script>`;

export const ENTRY = { lottery: '추첨', fcfs: '선착순', qualifying: '기록 기준', tour_only: '여행사 전용', open: '상시 접수' };
export const fmt = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${y}년 ${m}월 ${d}일`;
};
/** src/lib/util.ts 의 CANCEL_TAG_RE 와 같은 규칙 */
export const isCancelled = (r) => !!r.notes_ko && /^\s*\[(취소|중단)\]\s*/.test(r.notes_ko);
export const whereOf = (r) => (r.country_code === 'KR' ? r.city_ko : `${r.country_ko} ${r.city_ko}`);

export const races = [...snap.races].sort((a, b) => a.race_date.localeCompare(b.race_date) || a.name_ko.localeCompare(b.name_ko, 'ko'));
export const upcoming = races.filter((r) => r.race_date >= today);

/** 월별 페이지: 대회가 1개 이상 있는 모든 달 (지난 달 포함) */
export const months = [...new Set(races.map((r) => r.race_date.slice(0, 7)))].sort();
export const monthLabel = (ym) => `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`;
export const monthPath = (ym) => `/m/${ym}/`;

/** 나라별 페이지: 대회가 1개 이상 있는 모든 나라. 한국 → 일본 → 대회 많은 순 */
const byCountry = new Map();
for (const r of races) {
  if (!r.country_code) continue;
  const k = r.country_code.toLowerCase();
  if (!byCountry.has(k)) byCountry.set(k, { code: k, name: r.country_ko, races: [] });
  byCountry.get(k).races.push(r);
}
const RANK = { kr: 0, jp: 1 };
export const countries = [...byCountry.values()].sort((a, b) => (RANK[a.code] ?? 9) - (RANK[b.code] ?? 9) || b.races.length - a.races.length);
export const countryPath = (code) => `/c/${code.toLowerCase()}/`;

/** 연도별 페이지: 대회가 1개 이상 있는 모든 연도 */
export const years = [...new Set(races.map((r) => r.race_date.slice(0, 4)))].sort();
export const yearPath = (y) => `/${y}/`;

/** src/lib/util.ts 의 entryStatus(r) === 'open' 과 같은 규칙 (접수 일정 확정, 오늘이 접수 시작~마감 안, 조기 마감 아님) */
export const isEntryOpen = (r, day = today) => {
  if (isCancelled(r)) return false;
  if (r.entry_confidence === 'expected' || r.entry_confidence === 'tbc') return false;
  if (!r.entry_opens && !r.entry_closes) return false;
  if (r.entry_opens && r.entry_opens > day) return false;
  if (r.sold_out_on && r.sold_out_on <= day) return false;
  if (r.entry_closes && r.entry_closes < day) return false;
  return true;
};

/** 검색어 랜딩 페이지 (scripts/seo-pages.mjs 가 만든다). 링크 글자는 name */
export const LANDINGS = [
  ...years.map((y) => ({ path: yearPath(y), name: `${y} 마라톤 일정` })),
  { path: '/kr/', name: '국내 마라톤 일정' },
  { path: '/abroad/', name: '해외 마라톤 일정' },
  { path: '/trail/', name: '트레일러닝 대회 일정' },
  { path: '/entry-open/', name: '지금 접수 중인 대회' },
];
const isKr = (r) => r.country_code === 'KR';
export const landingPages = [
  ...years.map((y) => ({ path: yearPath(y), races: races.filter((r) => r.race_date.startsWith(y)) })),
  { path: '/kr/', races: upcoming.filter(isKr) },
  { path: '/abroad/', races: upcoming.filter((r) => !isKr(r)) },
  { path: '/trail/', races: upcoming.filter((r) => r.discipline === 'trail') },
  { path: '/entry-open/', races: upcoming.filter((r) => isEntryOpen(r)), lastmod: today },
];

/** 정적 목록 페이지 전부 (sitemap 용) */
export const listPages = [
  ...months.map((ym) => ({ path: monthPath(ym), races: races.filter((r) => r.race_date.startsWith(ym)) })),
  ...countries.map((c) => ({ path: countryPath(c.code), races: c.races })),
  ...landingPages,
];

export const RSS_PATH = '/rss.xml';
/**
 * 정적 페이지 <head> 에 넣는 hreflang·RSS 링크. altUrls = { ko, en } (짝 페이지 주소).
 * ko·x-default → 한국어 주소, en → 영어 주소. url 이 영어 주소면 RSS 제목도 영어.
 */
export const headLinks = (url, altUrls = { ko: url, en: url }) =>
  `<link rel="alternate" hreflang="ko" href="${altUrls.ko}">\n<link rel="alternate" hreflang="en" href="${altUrls.en}">\n<link rel="alternate" hreflang="x-default" href="${altUrls.ko}">\n<link rel="alternate" type="application/rss+xml" title="${url === altUrls.en && url !== altUrls.ko ? 'Marathon Calendar' : '마라톤 캘린더'}" href="${ORIGIN}${RSS_PATH}">`;
/** 목록 안 대회들의 last_verified 중 가장 늦은 날 (없으면 오늘) */
export const lastmodOf = (rs) => rs.map((r) => r.last_verified).filter(Boolean).sort().at(-1) ?? today;

// ── 영어판 (/en/…). 한국어 주소 앞에 /en 만 붙인다 (PLAN 2-1) ──
export const SITE_NAME_EN = 'Marathon Calendar';
export const enPath = (path) => `/en${path}`;
export const raceNameEn = (r) => r.name_en?.trim() || r.name_ko;
export const fmtEn = (iso) => fmtDate(iso, 'en');
export const monthLabelEn = (ym) => fmtMonth(ym, 'en');
export const whereEn = (r) => whereText(r, 'en');
export const countryNameEn = (code) => countryName(code, code, 'en');
/** 'in …' 뒤에 쓸 나라 이름: 'the United States'·'the Netherlands' 처럼 관사가 붙는 나라만 the (worker/site.ts 의 inCountryEn 과 같게) */
const THE_COUNTRY = /^(United |Netherlands$|Philippines$|Maldives$|Bahamas$|Gambia$|Dominican Republic$|Czech Republic$|Central African Republic$)|Islands$/;
export const inCountryEn = (name) => (THE_COUNTRY.test(name) ? `the ${name}` : name);
export const ENTRY_EN = ENTRY_TEXT.en;
export const distEn = (r) => (r.distances ?? []).map(DIST_TEXT.en).join(', ');
/** 연도 묶음 '2026–2027' (하나면 그대로) */
export const yearsEn = (ys) => (ys.length > 1 ? `${ys[0]}–${ys.at(-1)}` : ys[0] ?? '');
/** 영어 접수 글: 'Lottery, registration Aug 1, 2026 – Aug 31, 2026' */
export const entryEn = (r) => {
  const how = ENTRY_EN[r.entry_type];
  const o = r.entry_opens && fmtEn(r.entry_opens);
  const c = r.entry_closes && fmtEn(r.entry_closes);
  const when = o && c ? (o === c ? `registration ${o} only` : `registration ${o} – ${c}`) : o ? `registration opens ${o}` : c ? `registration closes ${c}` : '';
  return [how, when].filter(Boolean).join(', ');
};

export const LANDINGS_EN = [
  ...years.map((y) => ({ path: enPath(yearPath(y)), name: `${y} Marathon Calendar` })),
  { path: '/en/kr/', name: 'Marathons in South Korea' },
  { path: '/en/abroad/', name: 'Marathons Outside Korea' },
  { path: '/en/trail/', name: 'Trail Races' },
  { path: '/en/entry-open/', name: 'Races Open for Registration' },
];
/** 영어 정적 목록 페이지 전부 (sitemap 용) — 한국어 listPages 와 짝 */
export const listPagesEn = listPages.map((p) => ({ ...p, path: enPath(p.path) }));

/** 로고 <img> 크기: 브랜드 SVG 의 viewBox 비율로 계산 (없으면 null → 글자 로고) */
export function svgSize(path, height) {
  const f = new URL(`../public${path}`, import.meta.url);
  if (!existsSync(f)) return null;
  const m = readFileSync(f, 'utf8').match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/);
  if (!m) return null;
  return { width: Math.round((Number(m[1]) / Number(m[2])) * height), height };
}
