/**
 * prerender.mjs · seo-pages.mjs · sitemap.mjs 가 같이 쓰는 값.
 * 크롤링용 정적 목록 페이지(/m/YYYY-MM/, /c/<나라>/)를 어떤 범위로 만드는지는 여기 한 곳에서만 정한다
 * — 세 스크립트가 각자 계산하면 sitemap·링크가 실제로 없는 페이지를 가리킬 수 있다.
 */
import { existsSync, readFileSync } from 'node:fs';
import { DIST_TEXT, ENTRY_TEXT, fmtDate, fmtMonth } from '../src/i18n/format.ts';
import { countryName, provinceName, whereText } from '../src/i18n/names.ts';
import { STATUS_LABEL, entryStatus, isEntryConfirmed } from '../src/lib/util.ts';
import { distanceBucket } from '../src/lib/distanceFilter.ts';

export const ORIGIN = process.env.SITE_ORIGIN || 'https://marathon82.com';
export const snap = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
/**
 * 한국 시간 오늘. 환경변수 SEO_TODAY=YYYY-MM-DD 가 있으면 그 날(날짜 시뮬레이션·테스트 전용. 형식·달력이 틀리면 무시).
 * 빌드는 환경변수 없이 돌려 실제 오늘을 쓴다. 한 번만 계산하므로 날짜를 바꾸려면 새 프로세스로 돌린다.
 */
const realToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const forced = process.env.SEO_TODAY;
const forcedOk = !!forced && /^\d{4}-\d{2}-\d{2}$/.test(forced) && !Number.isNaN(Date.parse(forced + 'T00:00:00Z')) && new Date(forced + 'T00:00:00Z').toISOString().slice(0, 10) === forced;
export const today = forcedOk ? forced : realToday();

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const ldJson = (v) =>
  `<script type="application/ld+json">${JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')}</script>`;

export const ENTRY = { lottery: '추첨', fcfs: '선착순', qualifying: '기록 기준', tour_only: '여행사 전용', open: '상시 접수' };
/** '2027년 2월 28일' — 공용 날짜 규칙(src/lib/dateFormat.ts) */
export const fmt = (iso) => fmtDate(iso, 'ko');
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

/**
 * 목록 화면이 보는 대회 값: 홈 목록 데이터(/d/<hash>.json, scripts/data-split.mjs 의 listRace)에는 notes_ko 가 취소 태그만 남는다.
 * 접수 상태는 이 값으로 계산한다 — 정적 페이지가 상세 값('공식: 접수 중(마감일 미공지…)' 같은 notes_ko 메모)에 기대 상태를 만들면
 * 홈 목록과 숫자·상태가 엇갈리고, 상세 값을 목록 페이지로 새게 한다(데이터 무단 수집 방지 원칙).
 */
const CANCEL_TAG = /^\s*\[(취소|중단)\]/;
const listViews = new WeakMap();
const listView = (r) => {
  let v = listViews.get(r);
  if (!v) {
    const tag = r.notes_ko?.match(CANCEL_TAG);
    v = { ...r, notes_ko: tag ? `[${tag[1]}]` : null };
    listViews.set(r, v);
  }
  return v;
};
/** 홈 목록과 같은 접수 상태 (src/lib/util.ts 의 entryStatus 는 Date 를 받는다) */
export const entryStatusOf = (r, day = today) => entryStatus(listView(r), new Date(day + 'T00:00:00Z'));
/**
 * 접수 중 = 홈 목록의 entryStatus(r) === 'open' 과 같다(홈 '지금 접수 중' 현황판·접수 상태 필터와 같은 수).
 * 취소·조기 마감·접수 예정·마감·일정 미공개(접수 일정 미확정 포함)는 제외. 규칙은 util.ts 한 곳에서만 정한다(여기서 따로 계산하지 않는다)
 */
export const isEntryOpen = (r, day = today) => entryStatusOf(r, day) === 'open';
export { STATUS_LABEL, isEntryConfirmed };
export const STATUS_EN = { open: 'Open', upcoming: 'Opens soon', soldout: 'Sold out', closed: 'Closed', unknown: 'Dates TBA', cancelled: 'Cancelled' };

const isKr = (r) => r.country_code === 'KR';

// ── 시·도별 (/kr/<id>/) ──
// src/lib/places.ts 와 같게 유지 (places.ts 는 ./subregions 를 확장자 없이 import 해서 node 에서 바로 못 불러 옮겨 적었다.
// scripts/seo-pages-check.mjs 가 id 가 같은지 확인한다)
export const PROVINCES = [
  { id: 'seoul', name: '서울', keys: ['서울'] },
  { id: 'gyeonggi', name: '경기', keys: ['경기'] },
  { id: 'incheon', name: '인천', keys: ['인천'] },
  { id: 'gangwon', name: '강원', keys: ['강원'] },
  { id: 'north-chungcheong', name: '충북', keys: ['충북', '충청북'] },
  { id: 'south-chungcheong', name: '충남', keys: ['충남', '충청남'] },
  { id: 'daejeon', name: '대전', keys: ['대전'] },
  { id: 'sejong', name: '세종', keys: ['세종'] },
  { id: 'north-jeolla', name: '전북', keys: ['전북', '전라북'] },
  { id: 'south-jeolla', name: '전남', keys: ['전남', '전라남'] },
  { id: 'gwangju', name: '광주', keys: ['광주'] },
  { id: 'north-gyeongsang', name: '경북', keys: ['경북', '경상북'] },
  { id: 'south-gyeongsang', name: '경남', keys: ['경남', '경상남'] },
  { id: 'daegu', name: '대구', keys: ['대구'] },
  { id: 'ulsan', name: '울산', keys: ['울산'] },
  { id: 'busan', name: '부산', keys: ['부산'] },
  { id: 'jeju', name: '제주', keys: ['제주', '서귀포'] },
];
/** src/lib/places.ts 의 provinceOf 와 같은 규칙 */
export const provinceOf = (r) => {
  const head = (r.city_ko || '').trim().split(/[\s·]/)[0];
  for (const p of PROVINCES) if (p.keys.some((k) => head.startsWith(k))) return p.id;
  return null;
};
export const regionPath = (id) => `/kr/${id}/`;
/** 다가오는 국내 대회가 1개 이상 있는 시·도만 */
export const regionPages = PROVINCES.map((p) => ({
  id: p.id,
  name: p.name,
  nameEn: provinceName(p.id, 'en'),
  path: regionPath(p.id),
  races: upcoming.filter((r) => isKr(r) && provinceOf(r) === p.id),
})).filter((p) => p.races.length > 0);

// ── 거리별 (/distance/<bucket>/). /d/* 는 워커가 데이터 파일 주소로 막아 두어(그 밖은 404) /distance/ 를 쓴다 ──
export const distancePath = (bucket) => `/distance/${bucket}/`;
const DISTANCES = [
  { bucket: 'full', name: '풀코스', nameEn: 'Full Marathons' },
  { bucket: 'half', name: '하프', nameEn: 'Half Marathons' },
  { bucket: '10k', name: '10km', nameEn: '10K Races' },
];
/** distanceBucket 이 그 묶음인 거리가 하나라도 있는 다가오는 국내 대회 (0개 묶음은 뺀다) */
export const distancePages = DISTANCES.map((d) => ({
  ...d,
  path: distancePath(d.bucket),
  races: upcoming.filter((r) => isKr(r) && (r.distances ?? []).some((x) => distanceBucket(x) === d.bucket)),
})).filter((d) => d.races.length > 0);

// ── 이번 주말 (/weekend/): 한국 시간 이번 주 토·일. 오늘이 토·일이면 오늘~일요일 ──
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const weekendRange = (day) => {
  const wd = new Date(day + 'T00:00:00Z').getUTCDay(); // 0 일 … 6 토
  if (wd === 0) return { from: day, to: day };
  if (wd === 6) return { from: day, to: addDays(day, 1) };
  return { from: addDays(day, 6 - wd), to: addDays(day, 7 - wd) };
};
const wk = weekendRange(today);
export const weekend = {
  ...wk,
  path: '/weekend/',
  // 국내 먼저, 그 안은 날짜·이름순 (races 가 이미 날짜·이름순)
  races: [...races.filter((r) => r.race_date >= wk.from && r.race_date <= wk.to)].sort((a, b) => Number(isKr(b)) - Number(isKr(a))),
};

const entryOpenRaces = upcoming.filter((r) => isEntryOpen(r));
/**
 * 검색어 랜딩 페이지 (scripts/seo-pages.mjs 가 만든다). 링크 글자는 name.
 * 이번 주말·접수 중은 대회가 0개인 날에도 파일은 만들지만(noindex, 앱 푸터·/open/ 넘김이 가리킴) 여기서는 뺀다 —
 * 목록 nav 에 noindex 페이지로 가는 링크를 깔지 않는다 (2-1-1 빈 페이지 규칙)
 */
export const LANDINGS = [
  ...years.map((y) => ({ path: yearPath(y), name: `${y} 마라톤 일정` })),
  { path: '/kr/', name: '국내 마라톤 일정' },
  { path: '/abroad/', name: '해외 마라톤 일정' },
  { path: '/trail/', name: '트레일러닝 대회 일정' },
  ...(entryOpenRaces.length ? [{ path: '/entry-open/', name: '지금 접수 중인 대회' }] : []),
  ...(weekend.races.length ? [{ path: weekend.path, name: '이번 주말 마라톤' }] : []),
];
export const landingPages = [
  ...years.map((y) => ({ path: yearPath(y), races: races.filter((r) => r.race_date.startsWith(y)) })),
  { path: '/kr/', races: upcoming.filter(isKr) },
  { path: '/abroad/', races: upcoming.filter((r) => !isKr(r)) },
  { path: '/trail/', races: upcoming.filter((r) => r.discipline === 'trail') },
  { path: '/entry-open/', races: entryOpenRaces, lastmod: today },
  // 0개면 noindex 페이지(seo-pages.mjs 의 /kr/·/abroad/·/trail/·/entry-open/)라 sitemap 에서 뺀다
].filter((p) => p.races.length > 0);

/** 정적 목록 페이지 전부 (sitemap 용) */
export const listPages = [
  ...months.map((ym) => ({ path: monthPath(ym), races: races.filter((r) => r.race_date.startsWith(ym)) })),
  ...countries.map((c) => ({ path: countryPath(c.code), races: c.races })),
  ...landingPages,
  ...regionPages.map((p) => ({ path: p.path, races: p.races })),
  ...distancePages.map((d) => ({ path: d.path, races: d.races })),
  // 0개면 noindex 페이지라 sitemap 에서 뺀다
  ...(weekend.races.length ? [{ path: weekend.path, races: weekend.races, lastmod: today }] : []),
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
  ...(entryOpenRaces.length ? [{ path: '/en/entry-open/', name: 'Races Open for Registration' }] : []),
  ...(weekend.races.length ? [{ path: enPath(weekend.path), name: 'Marathons This Weekend' }] : []),
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
