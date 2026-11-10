/**
 * 마라톤 캘린더 사이트 (Cloudflare Pages, 주소 marathon82.com)
 * 정적 파일(첫 화면, 목록 페이지 …)은 Pages 가 함수 없이 바로 내보낸다 — 방문이 몰려도 함수·DB 를 거의 안 쓴다.
 * 여기 함수는 _routes.json 으로 아래 경로에서만 돈다.
 *  - /r/대회id      : 공유 링크. 대회별 제목·설명(og 태그), 검색엔진용 본문, 구조화 데이터를 넣는다.
 *  - /en/r/대회id   : 같은 내용의 영어판 (영어 첫 화면 dist/en/index.html 을 바탕으로).
 *  - /r/대회id.json : 앱이 대회를 열 때 받는 상세(전체 필드·패키지·여행사·경비). 우리 사이트 안에서 부른 것만.
 *  - /d/<hash>.json : 앱의 대회 목록 파일(목록 필드만). 우리 사이트 안에서 부른 것만. 전체 파일(/d/f-…)은 늘 404.
 *  - /data.json     : 예전 주소 — 404 (원본은 빌드 입력일 뿐 내보내지 않는다).
 *  - /cal/대회id.ics: 캘린더 일정 파일. 로그인 회원만(Authorization: Bearer, worker/memberCal.ts). ?lang=en 이면 영어.
 *  - /cal/u/토큰.ics: 회원의 '내 일정 구독' 캘린더 (저장한 대회 전부, worker/memberCal.ts).
 *  - /api/admin/ga  : 관리 화면 GA 분석 숫자 (관리자만, worker/gaRoute.ts). 그 밖 /api/* 는 404.
 *  - /api/community : 러닝톡 글 목록(제목 등만, 본문 없음). 우리 사이트 안에서 부른 것만 (worker/community.ts).
 *  - /community, /community/<글id> (+ /en/…) : 러닝톡 목록·글의 검색엔진용 제목·구조화 데이터 (본문 없음, worker/community.ts).
 *  - /unsubscribe?t=… : 알림 메일 수신 거부 (GET 은 확인 버튼, POST 가 처리 — worker/alerts/unsubscribe.ts).
 */
import { calRoute, feedRoute } from './memberCal';
import { PROVINCE_NAME, provinceOf } from '../src/lib/places';
import type { Lang } from '../src/i18n/lang.ts';
import { DIST_TEXT, ENTRY_TEXT, fmtDate, fmtMoney, fmtMonth } from '../src/i18n/format.ts';
import { cityName, countryName, provinceName, whereText } from '../src/i18n/names.ts';
import { BLOCKED_TEXT, DATA_NOTICE, noticeHtml } from '../src/lib/notice.ts';
import { gaRoute, type GaEnv } from './gaRoute';
import { communityApi, communityPage } from './community';
import { unsubscribeRoute } from './alerts/unsubscribe';

// 목록·전체 파일 주소 (scripts/pages.mjs 가 esbuild define 으로 넣는다 — scripts/data-split.mjs)
declare const __LIST_PATH__: string;
declare const __FULL_PATH__: string;
const LIST_PATH = typeof __LIST_PATH__ === 'string' ? __LIST_PATH__ : '';
const FULL_PATH = typeof __FULL_PATH__ === 'string' ? __FULL_PATH__ : '';

// 사이트 전체 CSP (public/_headers 의 값과 같게 유지)
export const CSP = [
  "default-src 'self'",
  "script-src 'self' https://www.googletagmanager.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com",
  "font-src 'self' data:",
  "connect-src 'self' https://zhwmfvkwtmakieatlqtz.supabase.co https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests',
].join('; ');

/** 대표 주소. pages.dev 로 들어온 공유 링크는 여기로 영구 이동한다. */
export const SITE = 'https://marathon82.com';
const OLD_HOST = 'marathoncalendar.pages.dev';

export interface SiteEnv extends GaEnv {
  ASSETS: { fetch: (req: Request | string) => Promise<Response> };
  /** 있으면 러닝톡이 공개 Supabase 대신 이 주소를 부른다 (로컬 확인용 — 배포 환경엔 없음) */
  COMMUNITY_SUPABASE_URL?: string;
}
type Env = SiteEnv;

interface RaceMeta {
  id: string;
  name_ko: string;
  name_en?: string;
  country_code?: string;
  distances?: string[];
  entry_fee?: number | null;
  entry_fee_currency?: string;
  notes_ko?: string | null;
  /** 영어 메모 (비면 영어 페이지에 메모를 안 넣는다) */
  notes_en?: string | null;
  official_url: string;
  city_ko: string;
  country_ko: string;
  race_date: string;
  entry_type: string;
  entry_opens: string | null;
  entry_closes: string | null;
  discipline?: string | null;
  /** confirmed | expected | tbc — 앱 화면은 confirmed 가 아니면 '일정 예상/미정' 으로 보인다 */
  entry_confidence?: string;
  sold_out_on?: string | null;
}

const ENTRY: Record<string, string> = {
  lottery: '추첨',
  fcfs: '선착순',
  qualifying: '기록 기준',
  tour_only: '여행사 전용',
  open: '상시 접수',
};


// 무료 플랜 자동 일시정지 방지: 읽기만으로는 활동으로 안 잡힐 때가 있어 매일 한 줄을 쓴다.
// 일시적 실패에 대비해 세 번까지 다시 시도한다.
/** '2027년 2월 28일' — 공용 날짜 규칙(src/lib/dateFormat.ts) */
const fmt = (iso: string) => fmtDate(iso, 'ko');

/** 한국 시간 오늘 'YYYY-MM-DD' */
const todayKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
/** src/lib/util.ts 의 CANCEL_TAG_RE 와 같은 규칙 (워커 묶음에 화면 코드를 끌어오지 않으려고 따로 둔다) */
const CANCEL_TAG_RE = /^\s*\[(취소|중단)\]\s*/;
const isCancelled = (r: RaceMeta) => !!r.notes_ko && CANCEL_TAG_RE.test(r.notes_ko);
const whereOf = (r: RaceMeta) => (r.country_code === 'KR' ? r.city_ko : `${r.country_ko} ${r.city_ko}`);
const DIST: Record<string, string> = { 풀: '풀코스', 하프: '하프' };
const distText = (r: RaceMeta) => (r.distances ?? []).map((d) => DIST[d] ?? d).join('·');
/** 받침 있으면 '은', 없으면 '는' (한글이 아니면 '은') */
const eun = (w: string) => {
  const c = w.trim().slice(-1).charCodeAt(0) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 === 0 ? '는' : '은';
};
const kindText = (r: RaceMeta) =>
  r.discipline === 'trail' ? '트레일러닝 대회' : r.discipline === 'event' ? '러닝 이벤트' : '마라톤 대회';

function entryText(r: RaceMeta): string {
  const how = ENTRY[r.entry_type] ? `${ENTRY[r.entry_type]} 접수` : '접수';
  if (r.entry_opens && r.entry_closes && r.entry_opens === r.entry_closes) return `${how} ${fmt(r.entry_opens)} 하루`;
  if (r.entry_opens && r.entry_closes) return `${how} ${fmt(r.entry_opens)}부터 ${fmt(r.entry_closes)}까지`;
  if (r.entry_closes) return `${how} ${fmt(r.entry_closes)} 마감`;
  if (r.entry_opens) return `${how} ${fmt(r.entry_opens)} 시작`;
  return `${how} 기간 미공개`;
}

/** 검색 결과 설명: 날짜·도시·거리·접수 시작/마감을 문장으로, 160자 안쪽 (넘치면 꼬리부터 뺀다) */
function describe(r: RaceMeta): string {
  const head = `${isCancelled(r) ? '[대회 취소] ' : ''}${r.name_ko}${eun(r.name_ko)} ${fmt(r.race_date)} ${whereOf(r)}에서 열리는 ${kindText(r)}입니다.`;
  const dist = distText(r) ? ` 종목 ${distText(r)}.` : '';
  const entry = ` ${entryText(r)}.`;
  const tail = ' 일정, 비용, 후기를 확인하세요.';
  for (const s of [head + dist + entry + tail, head + dist + entry, head + entry]) if (s.length <= 160) return s;
  return (head + entry).slice(0, 159) + '…';
}

/** <script> 안에 넣는 JSON: '</script>' 같은 글자로 태그를 빠져나가지 못하게 < > & 를 이스케이프 */
const jsonForScript = (v: unknown) =>
  JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const httpUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : '');

/** 함수가 내보내는 HTML 에도 정적 파일과 같은 보안 헤더를 붙인다 (public/_headers 와 맞출 것) */
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Content-Security-Policy': CSP,
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

// 정적 목록 페이지(scripts/seo-pages.mjs) 와 같은 주소·이름
const COUNTRY_PATH = (r: RaceMeta) => (r.country_code ? `/c/${r.country_code.toLowerCase()}/` : '');
const countryCrumb = (r: RaceMeta) => `${r.country_code === 'KR' ? '국내' : r.country_ko} 마라톤 일정`;

/** 대회 목록 한 줄 (scripts/seo-pages.mjs 의 목록과 같은 모양) */
const raceLi = (x: RaceMeta) =>
  `<li><a href="/r/${encodeURIComponent(x.id)}">${esc(x.name_ko)} ${x.race_date.slice(0, 4)}</a> — ${fmt(x.race_date)} · ${esc(whereOf(x))}</li>`;
const RELATED_MAX = 8;

/** 같은 지역(국내는 시·도, 해외는 나라)·같은 달 대회 고르기 (한국어·영어 공통) */
function relatedPick(r: RaceMeta, list: RaceMeta[], today: string, hasArea: boolean) {
  const kr = r.country_code === 'KR';
  const ok = (x: RaceMeta) => x.id !== r.id && !isCancelled(x);
  const byDate = (a: RaceMeta, b: RaceMeta) => a.race_date.localeCompare(b.race_date) || a.name_ko.localeCompare(b.name_ko, 'ko');
  const pv = kr ? provinceOf(r) : null;
  const area = !hasArea
    ? []
    : list
        .filter((x) => ok(x) && x.race_date >= today && (kr ? x.country_code === 'KR' && provinceOf(x) === pv : !!r.country_code && x.country_code === r.country_code))
        .sort(byDate)
        .slice(0, RELATED_MAX);
  const shown = new Set(area.map((x) => x.id));
  const ym = r.race_date.slice(0, 7);
  const month = list
    .filter((x) => ok(x) && !shown.has(x.id) && x.race_date.startsWith(ym))
    .sort(byDate)
    .slice(0, RELATED_MAX);
  return { kr, area, month, ym, y: r.race_date.slice(0, 4), cpath: COUNTRY_PATH(r) };
}

/** 같은 지역(국내는 시·도, 해외는 나라)·같은 달 대회와 정적 목록 페이지로 가는 링크 */
function relatedHtml(r: RaceMeta, list: RaceMeta[], today: string): string {
  const pv = r.country_code === 'KR' ? provinceOf(r) : null;
  const areaName = r.country_code === 'KR' ? (pv ? PROVINCE_NAME.get(pv) : undefined) : r.country_ko;
  const { kr, area, month, ym, y, cpath } = relatedPick(r, list, today, !!areaName);
  const monthName = `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`;
  const links: [string, string][] = [
    [`/m/${ym}/`, `${monthName} 마라톤 일정`],
    // 국내는 /c/kr/ 와 /kr/ 이름이 같아(국내 마라톤 일정) /kr/ 만. /c/kr/ 는 위 위치 줄에 있다
    ...(cpath && !kr ? [[cpath, countryCrumb(r)] as [string, string]] : []),
    [`/${y}/`, `${y} 마라톤 일정`],
    kr ? ['/kr/', '국내 마라톤 일정'] : ['/abroad/', '해외 마라톤 일정'],
    ...(r.discipline === 'trail' ? [['/trail/', '트레일러닝 대회 일정'] as [string, string]] : []),
  ];
  return [
    area.length ? `<h2>${esc(areaName)} 다른 대회</h2><ul>${area.map(raceLi).join('')}</ul>` : '',
    month.length ? `<h2>${monthName} 다른 대회</h2><ul>${month.map(raceLi).join('')}</ul>` : '',
    `<nav aria-label="대회 일정 목록"><p>${links.map(([href, name]) => `<a href="${href}">${esc(name)}</a>`).join(' · ')}</p></nav>`,
  ].join('\n');
}

/**
 * 자주 묻는 질문 (FAQPage). 앱 화면에 실제로 보이는 값일 때만 넣는다
 * — 접수 일정이 확정(confirmed)이 아니면 화면에 '일정 예상/미정' 으로 보이므로 접수 질문은 뺀다. 취소 대회는 아무것도 넣지 않는다.
 */
function faqLd(r: RaceMeta, today: string) {
  if (isCancelled(r)) return null;
  const qa: [string, string][] = [];
  const confirmed = r.entry_confidence === 'confirmed';
  // 정원이 차서 일찍 끝난 대회는 화면에 마감일 대신 '정원 마감' 이 보인다
  const soldOut = !!r.sold_out_on && r.sold_out_on <= today;
  if (confirmed && r.entry_opens) qa.push([`${r.name_ko} 접수는 언제 시작하나요?`, `${fmt(r.entry_opens)}부터 접수합니다.`]);
  if (confirmed && r.entry_closes && !soldOut) qa.push([`${r.name_ko} 접수 마감은 언제인가요?`, `${fmt(r.entry_closes)}까지 접수합니다.`]);
  if (r.entry_fee != null) qa.push([`${r.name_ko} 참가비는 얼마인가요?`, `${feeText(r)}입니다.`]);
  if (!qa.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
}

const feeText = (r: RaceMeta) => `${(r.entry_fee ?? 0).toLocaleString()} ${r.entry_fee_currency ?? ''}`.trim();

function raceHtml(r: RaceMeta, desc: string, related: string): string {
  const cancelled = isCancelled(r);
  const note = r.notes_ko?.replace(CANCEL_TAG_RE, '').trim();
  const cpath = COUNTRY_PATH(r);
  const rows: [string, string][] = [
    ['대회 날짜', fmt(r.race_date)],
    ['장소', whereOf(r)],
    ['접수 방식', ENTRY[r.entry_type] ?? ''],
    ['접수 기간', [r.entry_opens && `${fmt(r.entry_opens)}부터`, r.entry_closes && `${fmt(r.entry_closes)}까지`].filter(Boolean).join(' ') || '미공개'],
    ['종목', distText(r)],
    ['참가비', r.entry_fee != null ? feeText(r) : '미공개'],
  ];
  return `<main style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
<nav aria-label="위치"><a href="/">마라톤 캘린더</a>${cpath ? ` › <a href="${cpath}">${esc(countryCrumb(r))}</a>` : ''} › <a href="/m/${r.race_date.slice(0, 7)}/">${Number(r.race_date.slice(0, 4))}년 ${Number(r.race_date.slice(5, 7))}월</a></nav>
<h1>${esc(r.name_ko)}</h1>
<p>${r.race_date.slice(0, 4)}년 일정·접수 기간</p>
${cancelled ? '<p><strong>대회 취소</strong> — 주최 측이 이 대회를 취소(중단)했습니다.</p>' : ''}
${r.name_en ? `<p>${esc(r.name_en)}</p>` : ''}
<p>${esc(desc)}</p>
<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
${note ? `<p>${esc(note)}</p>` : ''}
${httpUrl(r.official_url) ? `<p><a href="${esc(httpUrl(r.official_url))}" rel="nofollow noopener">공식 홈페이지</a></p>` : ''}
${related}
${noticeHtml('ko')}
</main>`;
}

// ── 영어판 (/en/r/<id>). 지명·날짜·용어는 src/i18n 을 그대로 쓰고, 한국어 쪽 함수는 위에 그대로 둔다 ──
const SITE_NAME_EN = 'Marathon Calendar';
const nameEn = (r: RaceMeta) => r.name_en?.trim() || r.name_ko;
const fmtEn = (iso: string) => fmtDate(iso, 'en');
const whereEn = (r: RaceMeta) => whereText({ country_code: r.country_code ?? '', city_ko: r.city_ko, country_ko: r.country_ko }, 'en');
const distTextEn = (r: RaceMeta) => (r.distances ?? []).map(DIST_TEXT.en).join(', ');
const entryHowEn = (r: RaceMeta) => (ENTRY_TEXT.en as Record<string, string>)[r.entry_type] ?? '';
/** 'in …' 뒤에 쓸 나라 이름: 관사가 붙는 나라만 'the United States' 처럼 (scripts/seo-lib.mjs 의 inCountryEn 과 같게) */
const THE_COUNTRY = /^(United |Netherlands$|Philippines$|Maldives$|Bahamas$|Gambia$|Dominican Republic$|Czech Republic$|Central African Republic$)|Islands$/;
const inCountryEn = (name: string) => (THE_COUNTRY.test(name) ? `the ${name}` : name);
const countryCrumbEn = (r: RaceMeta) => `Marathons in ${inCountryEn(countryName(r.country_code, r.country_ko, 'en'))}`;
const feeTextEn = (r: RaceMeta) =>
  r.entry_fee == null ? '' : r.entry_fee_currency ? fmtMoney(r.entry_fee, r.entry_fee_currency, 'en') : r.entry_fee.toLocaleString('en-US');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function entryTextEn(r: RaceMeta): string {
  const how = entryHowEn(r);
  const reg = how ? `Registration (${how})` : 'Registration';
  if (r.entry_opens && r.entry_closes && r.entry_opens === r.entry_closes) return `${reg}: ${fmtEn(r.entry_opens)} only`;
  if (r.entry_opens && r.entry_closes) return `${reg}: ${fmtEn(r.entry_opens)} – ${fmtEn(r.entry_closes)}`;
  if (r.entry_closes) return `${reg} closes ${fmtEn(r.entry_closes)}`;
  if (r.entry_opens) return `${reg} opens ${fmtEn(r.entry_opens)}`;
  return `${reg} dates TBA`;
}

/** 검색 결과 설명 (영어, 160자 안쪽 — 넘치면 꼬리부터 뺀다) */
function describeEn(r: RaceMeta): string {
  const head = `${isCancelled(r) ? '[Cancelled] ' : ''}${nameEn(r)} is a ${r.discipline === 'trail' ? 'trail race' : r.discipline === 'event' ? 'running event' : 'marathon'} on ${fmtEn(r.race_date)} in ${whereEn(r)}.`;
  const dist = distTextEn(r) ? ` Distances: ${distTextEn(r)}.` : '';
  const entry = ` ${entryTextEn(r)}.`;
  const tail = ' See dates, costs and reviews.';
  for (const s of [head + dist + entry + tail, head + dist + entry, head + entry]) if (s.length <= 160) return s;
  return (head + entry).slice(0, 159) + '…';
}

const raceLiEn = (x: RaceMeta) =>
  `<li><a href="/en/r/${encodeURIComponent(x.id)}">${esc(nameEn(x))} ${x.race_date.slice(0, 4)}</a> — ${fmtEn(x.race_date)} · ${esc(whereEn(x))}</li>`;

function relatedHtmlEn(r: RaceMeta, list: RaceMeta[], today: string): string {
  const pv = r.country_code === 'KR' ? provinceOf(r) : null;
  const areaName = r.country_code === 'KR' ? (pv ? provinceName(pv, 'en') : undefined) : inCountryEn(countryName(r.country_code, r.country_ko, 'en'));
  const { kr, area, month, ym, y, cpath } = relatedPick(r, list, today, !!areaName);
  const monthName = fmtMonth(ym, 'en');
  const links: [string, string][] = [
    [`/en/m/${ym}/`, `${monthName} Marathons`],
    ...(cpath && !kr ? [[`/en${cpath}`, countryCrumbEn(r)] as [string, string]] : []),
    [`/en/${y}/`, `${y} Marathon Calendar`],
    kr ? ['/en/kr/', 'Marathons in South Korea'] : ['/en/abroad/', 'Marathons Outside Korea'],
    ...(r.discipline === 'trail' ? [['/en/trail/', 'Trail Races'] as [string, string]] : []),
  ];
  return [
    area.length ? `<h2>More races in ${esc(areaName)}</h2><ul>${area.map(raceLiEn).join('')}</ul>` : '',
    month.length ? `<h2>More races in ${monthName}</h2><ul>${month.map(raceLiEn).join('')}</ul>` : '',
    `<nav aria-label="Race calendars"><p>${links.map(([href, name]) => `<a href="${href}">${esc(name)}</a>`).join(' · ')}</p></nav>`,
  ].join('\n');
}

/** 자주 묻는 질문 (영어). 넣는 규칙은 한국어 faqLd 와 같다 */
function faqLdEn(r: RaceMeta, today: string) {
  if (isCancelled(r)) return null;
  const qa: [string, string][] = [];
  const confirmed = r.entry_confidence === 'confirmed';
  const soldOut = !!r.sold_out_on && r.sold_out_on <= today;
  const name = nameEn(r);
  if (confirmed && r.entry_opens) qa.push([`When does registration open for ${name}?`, `Registration opens on ${fmtEn(r.entry_opens)}.`]);
  if (confirmed && r.entry_closes && !soldOut) qa.push([`When does registration close for ${name}?`, `Registration closes on ${fmtEn(r.entry_closes)}.`]);
  if (r.entry_fee != null) qa.push([`How much is the entry fee for ${name}?`, `The entry fee is ${feeTextEn(r)}.`]);
  if (!qa.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    inLanguage: 'en',
    mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };
}

function raceHtmlEn(r: RaceMeta, desc: string, related: string): string {
  const cancelled = isCancelled(r);
  // 영어 메모가 비면 메모를 넣지 않는다 (영어 페이지에 한국어 메모를 섞지 않게)
  const note = r.notes_en?.trim();
  const cpath = COUNTRY_PATH(r);
  const ym = r.race_date.slice(0, 7);
  const reg = [r.entry_opens && `opens ${fmtEn(r.entry_opens)}`, r.entry_closes && `closes ${fmtEn(r.entry_closes)}`].filter(Boolean).join(', ');
  const rows: [string, string][] = [
    ['Race date', fmtEn(r.race_date)],
    ['Location', whereEn(r)],
    ['Entry type', entryHowEn(r)],
    ['Registration', reg ? cap(reg) : 'TBA'],
    ['Distances', distTextEn(r)],
    ['Entry fee', feeTextEn(r) || 'TBA'],
  ];
  return `<main style="max-width:48rem;margin:0 auto;padding:2rem 1rem;font-family:system-ui,sans-serif">
<nav aria-label="Breadcrumb"><a href="/en/">${SITE_NAME_EN}</a>${cpath ? ` › <a href="/en${cpath}">${esc(countryCrumbEn(r))}</a>` : ''} › <a href="/en/m/${ym}/">${fmtMonth(ym, 'en')}</a></nav>
<h1>${esc(nameEn(r))}</h1>
<p>${r.race_date.slice(0, 4)} race date &amp; registration</p>
${cancelled ? '<p><strong>Cancelled</strong> — The organizer has cancelled (suspended) this race.</p>' : ''}
<p>${esc(desc)}</p>
<dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
${note ? `<p>${esc(note)}</p>` : ''}
${httpUrl(r.official_url) ? `<p><a href="${esc(httpUrl(r.official_url))}" rel="nofollow noopener">Official website</a></p>` : ''}
${related}
${noticeHtml('en')}
</main>`;
}

/** 주최 측 페이지로 쓸 수 있는 공식 주소 (네이버 검색 링크 같은 대체 링크는 빼고) */
const organizerUrl = (r: RaceMeta) => {
  const u = httpUrl(r.official_url);
  return u && !/search\.naver\.com|google\.[a-z.]+\/search/i.test(u) ? u : '';
};

/** 접수 상태 → schema.org availability (날짜를 모르면 넣지 않는다) */
function availability(r: RaceMeta, today: string): string | undefined {
  if (isCancelled(r)) return undefined;
  if (r.entry_opens && today < r.entry_opens) return 'https://schema.org/PreOrder';
  if (r.entry_closes && today > r.entry_closes) return 'https://schema.org/SoldOut';
  if (r.entry_opens && r.entry_closes) return 'https://schema.org/InStock';
  return undefined;
}

const ORG = { '@type': 'Organization', name: '마라톤 캘린더', url: SITE, logo: `${SITE}/brand/logo-512.png` };
const ORG_EN = { ...ORG, name: SITE_NAME_EN };

function eventLd(r: RaceMeta, url: string, desc: string, lang: Lang = 'ko') {
  const org = organizerUrl(r);
  const avail = availability(r, todayKst());
  const en = lang === 'en';
  const ev = {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: `${en ? nameEn(r) : r.name_ko} ${r.race_date.slice(0, 4)}`,
    alternateName: en ? r.name_ko : r.name_en || undefined,
    ...(en ? { inLanguage: 'en' } : {}),
    startDate: r.race_date,
    endDate: r.race_date,
    eventStatus: isCancelled(r) ? 'https://schema.org/EventCancelled' : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    sport: r.discipline === 'trail' ? 'Trail running' : r.discipline === 'event' ? 'Running' : 'Marathon',
    description: desc,
    url,
    image: [`${SITE}/og.png`],
    location: {
      '@type': 'Place',
      name: en ? whereEn(r) : whereOf(r),
      address: {
        '@type': 'PostalAddress',
        addressLocality: en ? cityName({ country_code: r.country_code ?? '', city_ko: r.city_ko }, 'en') ?? whereEn(r) : r.city_ko,
        addressCountry: r.country_code || r.country_ko,
      },
    },
    organizer: { '@type': 'Organization', name: en ? nameEn(r) : r.name_ko, ...(org ? { url: org } : {}) },
    offers: {
      '@type': 'Offer',
      url: org || url,
      ...(r.entry_fee != null ? { price: r.entry_fee, priceCurrency: r.entry_fee_currency } : {}),
      ...(avail ? { availability: avail } : {}),
      ...(r.entry_opens ? { validFrom: r.entry_opens } : {}),
    },
    publisher: en ? ORG_EN : ORG,
  };
  const cpath = COUNTRY_PATH(r);
  const crumbs = en
    ? [
        { name: SITE_NAME_EN, item: `${SITE}/en/` },
        ...(cpath ? [{ name: countryCrumbEn(r), item: `${SITE}/en${cpath}` }] : []),
        { name: ev.name, item: url },
      ]
    : [
        { name: '마라톤 캘린더', item: `${SITE}/` },
        ...(cpath ? [{ name: countryCrumb(r), item: `${SITE}${cpath}` }] : []),
        { name: ev.name, item: url },
      ];
  const bc = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, ...c })),
  };
  return [ev, bc];
}

interface FullData {
  races: RaceMeta[];
  packages?: { race_id: string; agency_id: string }[];
  agencies?: { id: string }[];
  costs?: { race_id: string }[];
}
// 워커 인스턴스마다 전체 파일(/d/f-<hash>.json)을 10분 동안 기억해 둔다
let cache: { at: number; byId: Map<string, RaceMeta>; list: RaceMeta[]; full: FullData } | null = null;
export async function loadRaces(req: Request, env: Env) {
  if (!cache || Date.now() - cache.at > 600_000) {
    if (!FULL_PATH) throw new Error('no full data path');
    const r = await env.ASSETS.fetch(new URL(FULL_PATH, req.url).toString());
    if (!r.ok) throw new Error(`full data ${r.status}`);
    const j = (await r.json()) as FullData;
    cache = { at: Date.now(), byId: new Map(j.races.map((x) => [x.id, x])), list: j.races, full: j };
  }
  return cache;
}
async function raceById(req: Request, env: Env, id: string): Promise<RaceMeta | undefined> {
  return (await loadRaces(req, env)).byId.get(id);
}

async function withRaceMeta(req: Request, env: Env, id: string, lang: Lang = 'ko'): Promise<Response> {
  const en = lang === 'en';
  // 영어는 영어 첫 화면(scripts/prerender.mjs 가 만든 dist/en/index.html, <html lang="en">)을 바탕으로
  const page = await env.ASSETS.fetch(new URL(en ? '/en/' : '/', req.url).toString());
  let race: RaceMeta | undefined;
  try {
    race = await raceById(req, env, id);
  } catch {
    // 목록을 못 읽었으면 기본 태그 그대로 (없는 대회로 단정하지 않는다)
    return new Response(page.body, page);
  }
  if (!race) {
    // 없는 대회 주소: 홈을 200 으로 주면 구글이 '가짜 정상 페이지(soft 404)'로 본다
    const out = new HTMLRewriter()
      .on('head', { element: (el) => el.append('<meta name="robots" content="noindex">', { html: true }) })
      .on('script#ld-itemlist', { element: (el) => el.remove() })
      .transform(page);
    const res = new Response(out.body, { status: 404, headers: out.headers });
    res.headers.set('Cache-Control', 'public, max-age=600');
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
    return res;
  }

  const title = en
    ? `${nameEn(race)} ${race.race_date.slice(0, 4)} — Date & Registration | ${SITE_NAME_EN}`
    : `${race.name_ko} ${race.race_date.slice(0, 4)} 일정·접수 기간 | 마라톤 캘린더`;
  const desc = en ? describeEn(race) : describe(race);
  const koUrl = `${SITE}/r/${encodeURIComponent(race.id)}`;
  const enUrl = `${SITE}/en/r/${encodeURIComponent(race.id)}`;
  const canonical = en ? enUrl : koUrl;
  const set = (content: string) => ({ element: (el: Element) => el.setAttribute('content', content) });
  const today = todayKst();
  const related = en ? relatedHtmlEn(race, cache?.list ?? [], today) : relatedHtml(race, cache?.list ?? [], today);
  const faq = en ? faqLdEn(race, today) : faqLd(race, today);
  const lds = [...eventLd(race, canonical, desc, lang), ...(faq ? [faq] : [])];

  const out = new HTMLRewriter()
    .on('title', { element: (el) => el.setInnerContent(title) })
    .on('meta[name="description"]', set(desc))
    .on('meta[property="og:title"]', set(title))
    .on('meta[property="og:description"]', set(desc))
    .on('meta[property="og:url"]', set(canonical))
    .on('meta[name="twitter:title"]', set(title))
    .on('meta[name="twitter:description"]', set(desc))
    .on('link[rel="canonical"]', { element: (el) => el.setAttribute('href', canonical) })
    // 언어 대체 주소(hreflang)도 이 대회 주소로: ko·x-default → 한국어, en → 영어. RSS 링크(hreflang 없음)는 그대로
    .on('link[rel="alternate"][hreflang]', { element: (el) => el.setAttribute('href', el.getAttribute('hreflang') === 'en' ? enUrl : koUrl) })
    // 홈 대회 목록(ItemList)은 홈에만 — 대회 페이지에 실리면 구조화 데이터가 겹친다
    .on('script#ld-itemlist', { element: (el) => el.remove() })
    // 검색엔진이 읽을 대회 본문과 구조화 데이터 (화면이 뜨면 React 가 갈아 끼운다)
    .on('div#root', { element: (el) => el.setInnerContent((en ? raceHtmlEn : raceHtml)(race!, desc, related), { html: true }) })
    .on('head', { element: (el) => el.append(`${lds.map((ld) => `<script type="application/ld+json">${jsonForScript(ld)}</script>`).join('')}`, { html: true }) })
    .transform(page);

  const res = new Response(out.body, out);
  res.headers.set('Cache-Control', 'public, max-age=600');
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}


/**
 * 우리 사이트 안에서 부른 요청인지 (데이터 파일 무단 수집 막기). Referer·Sec-Fetch-Site 는 위조할 수 있어
 * 손쉬운 수집을 막는 정도다 — 본 방어는 Cloudflare 봇 차단·속도 제한. UA 로 검색엔진을 따로 통과시키지 않는다
 * (검색엔진은 프리렌더 HTML 로 본문을 받고, JS 를 실행하는 구글 렌더러는 페이지 안 fetch 라 일반 방문자처럼 통과).
 * Sec-Fetch-Site 가 없는 옛 브라우저는 Referer 만으로 본다.
 */
export function sameSite(req: Request): boolean {
  const sfs = req.headers.get('Sec-Fetch-Site');
  if (sfs && sfs !== 'same-origin') return false;
  const ref = req.headers.get('Referer');
  if (!ref) return false;
  let origin: string;
  try {
    origin = new URL(ref).origin;
  } catch {
    return false;
  }
  // 미리보기(xxx.pages.dev)·로컬 주소는 자기 주소와 같으면 통과
  return origin === SITE || origin === new URL(req.url).origin;
}

export const blocked = () =>
  new Response(BLOCKED_TEXT, {
    status: 403,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
const notFound = () =>
  new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
  });
const json = (body: BodyInit | null, status = 200) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'private, max-age=300' : 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });

/** 대회 하나의 상세: 전체 필드 + 그 대회 패키지·여행사 + 그 나라 경비 기준 (CostCalculator 의 costFor 와 같은 규칙) */
async function raceDetailJson(req: Request, env: Env, id: string): Promise<Response> {
  let data: Awaited<ReturnType<typeof loadRaces>>;
  try {
    data = await loadRaces(req, env);
  } catch {
    return json(JSON.stringify({ _notice: DATA_NOTICE, error: 'unavailable' }), 503);
  }
  const race = data.byId.get(id);
  if (!race) return json(JSON.stringify({ _notice: DATA_NOTICE, error: 'not_found' }), 404);
  return json(
    JSON.stringify({
      _notice: DATA_NOTICE,
      race,
      packages: (data.full.packages ?? []).filter((p) => p.race_id === race.id),
      // 여행사는 전부(몇 곳뿐) — 패키지가 없는 대회도 여행사 탭이 여행사 목록을 보인다 (PackageTable)
      agencies: data.full.agencies ?? [],
      costs: (data.full.costs ?? []).filter((c) => c.race_id === race.country_code),
    }),
  );
}

export async function siteFetch(req: Request, env: SiteEnv): Promise<Response> {
  const url = new URL(req.url);
  if (url.pathname === '/api/admin/ga') return gaRoute(req, env);
  if (url.pathname === '/api/community') return communityApi(req, env);
  if (url.pathname.startsWith('/api/')) return json(JSON.stringify({ error: 'not_found', message: '없는 주소입니다.' }), 404);
  if (url.pathname === '/data.json') return notFound();
  if (url.pathname === '/unsubscribe') return unsubscribeRoute(req, env);
  if (url.pathname.startsWith('/d/')) {
    if (!LIST_PATH || url.pathname !== LIST_PATH) return notFound();
    if (!sameSite(req)) return blocked();
    const r = await env.ASSETS.fetch(new URL(LIST_PATH, req.url).toString());
    if (!r.ok) return notFound();
    // 정적 파일 응답 헤더(public/_headers 의 공개 캐시 규칙 등)가 섞이지 않게 새로 만든다
    return json(r.body);
  }
  const dj = url.pathname.match(/^\/r\/([a-z0-9-]{2,40})\.json$/);
  if (dj) return sameSite(req) ? raceDetailJson(req, env, dj[1]) : blocked();
  // 예전 주소로 연 공유 링크는 대표 주소로 (미리보기 주소 xxx.marathoncalendar.pages.dev 는 그대로)
  if (url.hostname === OLD_HOST) return Response.redirect(SITE + url.pathname + url.search, 301);
  const m = url.pathname.match(/^\/(en\/)?r\/([a-z0-9-]{2,40})(\/?)$/);
  // 대회 주소는 끝 슬래시 없는 꼴 하나로 (canonical 과 같게, 언어 접두는 그대로)
  if (m?.[3]) return Response.redirect(`${url.origin}${m[1] ? '/en' : ''}/r/${m[2]}${url.search}`, 301);
  if (m) return withRaceMeta(req, env, m[2], m[1] ? 'en' : 'ko');
  const cm = url.pathname.match(/^\/(en\/)?community(?:\/([^/]+))?(\/?)$/);
  // 러닝톡 주소도 끝 슬래시 없는 꼴 하나로
  if (cm?.[3]) return Response.redirect(`${url.origin}${cm[1] ? '/en' : ''}/community${cm[2] ? `/${cm[2]}` : ''}${url.search}`, 301);
  if (cm) return communityPage(req, env, cm[2] ?? null, cm[1] ? 'en' : 'ko');
  const racePage = (id: string, lang: Lang) => `${SITE}${lang === 'en' ? '/en' : ''}/r/${id}`;
  const feed = url.pathname.match(/^\/cal\/u\/([^/]{1,200})\.ics$/);
  if (feed) {
    const findRaces = async (ids: string[]) => {
      const { byId } = await loadRaces(req, env);
      return ids.flatMap((id) => {
        const race = byId.get(id);
        return race ? [{ race, cancelled: isCancelled(race) }] : [];
      });
    };
    return feedRoute(req, env, feed[1], findRaces, racePage);
  }
  const c = url.pathname.match(/^\/cal\/([a-z0-9-]{2,40})\.ics$/);
  if (c) return calRoute(req, env, c[1], (id) => raceById(req, env, id), racePage);
  return env.ASSETS.fetch(req);
}
