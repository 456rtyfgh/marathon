/**
 * prerender.mjs · seo-pages.mjs · sitemap.mjs 가 같이 쓰는 값.
 * 크롤링용 정적 목록 페이지(/m/YYYY-MM/, /c/<나라>/)를 어떤 범위로 만드는지는 여기 한 곳에서만 정한다
 * — 세 스크립트가 각자 계산하면 sitemap·링크가 실제로 없는 페이지를 가리킬 수 있다.
 */
import { existsSync, readFileSync } from 'node:fs';

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
/** 정적 페이지 <head> 에 넣는 hreflang(자기 주소)·RSS 링크 */
export const headLinks = (url) =>
  `<link rel="alternate" hreflang="ko" href="${url}">\n<link rel="alternate" hreflang="x-default" href="${url}">\n<link rel="alternate" type="application/rss+xml" title="마라톤 캘린더" href="${ORIGIN}${RSS_PATH}">`;
/** 목록 안 대회들의 last_verified 중 가장 늦은 날 (없으면 오늘) */
export const lastmodOf = (rs) => rs.map((r) => r.last_verified).filter(Boolean).sort().at(-1) ?? today;

/** 로고 <img> 크기: 브랜드 SVG 의 viewBox 비율로 계산 (없으면 null → 글자 로고) */
export function svgSize(path, height) {
  const f = new URL(`../public${path}`, import.meta.url);
  if (!existsSync(f)) return null;
  const m = readFileSync(f, 'utf8').match(/viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/);
  if (!m) return null;
  return { width: Math.round((Number(m[1]) / Number(m[2])) * height), height };
}
