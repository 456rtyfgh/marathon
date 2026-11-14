/**
 * 빌드 뒤 크롤링용 정적 목록 페이지를 만든다: dist/m/YYYY-MM/index.html (월별), dist/c/<나라>/index.html (나라별),
 * 검색어 랜딩 dist/YYYY/, dist/kr/, dist/abroad/, dist/trail/, dist/entry-open/ (목록은 seo-lib.mjs 의 LANDINGS·landingPages),
 * 시·도별 dist/kr/<id>/, 거리별 dist/distance/<bucket>/, 이번 주말 dist/weekend/, 넘김 dist/open/ (seo-lib.mjs 의 regionPages·distancePages·weekend).
 * 첫 화면은 React 앱이라 검색엔진이 대회 페이지(/r/id)로 가는 링크를 다 못 따라갈 수 있어, 자바스크립트 없이
 * 읽히는 가벼운 HTML 로 모든 대회 링크를 깔아 둔다. _routes.json 밖이라 함수를 안 쓴다(정적 파일).
 * SPA 껍데기를 쓰지 않는 이유: React 가 뜨면 /m/… 에서도 홈 목록으로 바뀌어 canonical 과 본문이 어긋난다.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  ORIGIN, ENTRY, LANDINGS, countries, countryPath, esc, fmt, headLinks, isCancelled, isEntryOpen, ldJson, monthLabel, monthPath, months, races, svgSize, today,
  upcoming, whereOf, yearPath, years,
  LANDINGS_EN, SITE_NAME_EN, countryNameEn, distEn, enPath, entryEn, fmtEn, inCountryEn, monthLabelEn, raceNameEn, whereEn, yearsEn,
  STATUS_EN, STATUS_LABEL, distancePages, entryStatusOf, regionPages, weekend, ENTRY_EN,
} from './seo-lib.mjs';
import { isEntryConfirmed } from '../src/lib/util.ts';
import { KO_WEEKDAY } from '../src/lib/dateFormat.ts';
import { noticeHtml } from '../src/lib/notice.ts';

const DIST_LABEL = { 풀: '풀코스', 하프: '하프' };
const SYMBOL = svgSize('/brand/symbol.svg', 32);
const WORD = svgSize('/brand/wordmark.svg', 18);
const hasPublic = (p) => existsSync(new URL(`../public${p}`, import.meta.url));

// 링크의 aria-label 이 이름을 읽어 주므로 로고 그림 alt 는 비운다
const logo = () => {
  if (!SYMBOL) return '<span class="brand-text">마라톤 캘린더</span>';
  const pic = (base, size) =>
    `<picture><source srcset="${base.replace('.svg', '-inverse.svg')}" media="(prefers-color-scheme: dark)"><img src="${base}" width="${size.width}" height="${size.height}" alt=""></picture>`;
  return pic('/brand/symbol.svg', SYMBOL) + (WORD ? pic('/brand/wordmark.svg', WORD) : '<span class="brand-text">마라톤 캘린더</span>');
};

// 휴대폰: 누르는 것은 44px 이상 — 머리말·경로·월/나라 링크와 대회 이름은 줄 높이 44px, 대회 카드는 카드 전체가 링크(a::after),
// 문장·제목 속 링크는 줄 높이를 건드리지 않고 위아래 눌리는 자리만 넓힌다. 긴 영문 이름·주소는 칸 안에서 꺾는다(overflow-wrap).
// (약관 페이지 scripts/terms.mjs 의 STYLE 과 같은 꼴 — 수치를 맞춘다)
const STYLE = `:root{color-scheme:light dark;--bg:#f1f2f4;--fg:#15171a;--mute:#5d636b;--line:#dcdfe3;--card:#fff;--link:#0b57d0}
@media (prefers-color-scheme:dark){:root{--bg:#0e0f11;--fg:#e8eaed;--mute:#9aa0a6;--line:#2a2d31;--card:#17191c;--link:#8ab4f8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;word-break:keep-all;overflow-wrap:anywhere}
a{color:var(--link)}header{display:flex;align-items:center;justify-content:space-between;gap:1rem;max-width:56rem;margin:0 auto;padding:.5rem 1rem}header a{display:inline-flex;align-items:center;min-height:44px}
.brand{display:flex;align-items:center;gap:.5rem;text-decoration:none;color:var(--fg)}.brand img{display:block;max-width:100%;height:auto}.brand{min-width:0}.brand picture{min-width:0}.brand picture:first-child,header>a:last-child{flex:none;white-space:nowrap}.brand-text{font-weight:800;font-size:1.1rem}
main{max-width:56rem;margin:0 auto;padding:0 1rem 3rem}h1{font-size:1.6rem;line-height:1.3;margin:.5rem 0}h2{font-size:1.15rem;margin:2rem 0 .5rem;padding-top:1rem;border-top:1px solid var(--line)}
.crumb,.lead,.meta{color:var(--mute)}.crumb{font-size:.9rem;margin:.25rem 0}.crumb a{display:inline-flex;align-items:center;min-height:44px}ul.races{list-style:none;padding:0;margin:0}
ul.races li{position:relative;background:var(--card);border:1px solid var(--line);border-radius:.6rem;padding:.15rem .9rem .7rem;margin:.4rem 0}
ul.races a{display:inline-flex;align-items:center;min-width:44px;min-height:44px;font-weight:700}ul.races a::after{content:"";position:absolute;inset:0;border-radius:.6rem}.meta{display:block;font-size:.9rem}ul.races .meta{margin-top:-.4rem}.x{color:#c5221f;font-weight:700}
nav.links{display:flex;flex-wrap:wrap;gap:0 .1rem;margin:0 -.4rem;font-size:.95rem}nav.links a,nav.links strong{display:inline-flex;align-items:center;min-height:44px;padding:0 .4rem}footer{max-width:56rem;margin:0 auto;padding:2rem 1rem;color:var(--mute);font-size:.9rem}footer a,h2 a,main p a{padding:.85rem 0}`;

/**
 * status: 접수 상태 글자를 넣는다 (새 목록 페이지·/entry-open/ 만). 취소 대회는 앞에 [대회 취소] 가 있어 넣지 않는다.
 * status 줄은 접수 일정이 공식 확정(isEntryConfirmed)일 때만 접수 기간을 적는다 — 미확정이면 상태가 '일정 미공개'라 날짜와 어긋난다.
 * status 가 아닌 기존 월별·나라별·연도별 줄은 그대로.
 */
const item = (r, { showWhere = true, status = false } = {}) => {
  const showDates = !status || isEntryConfirmed(r);
  const entry = [
    ENTRY[r.entry_type],
    // status 줄: '상시 접수 접수 …부터' 처럼 '접수' 가 겹치면 뒤의 것을 뺀다
    showDates && r.entry_opens && `${status && ENTRY[r.entry_type]?.endsWith('접수') ? '' : '접수 '}${fmt(r.entry_opens)}부터`,
    showDates && r.entry_closes && `${fmt(r.entry_closes)}까지`,
  ].filter(Boolean).join(' ');
  const dist = (r.distances ?? []).map((d) => DIST_LABEL[d] ?? d).join('·');
  const st = status && !isCancelled(r) ? STATUS_LABEL[entryStatusOf(r)] : '';
  const meta = [fmt(r.race_date), showWhere && whereOf(r), dist, st, entry].filter(Boolean).join(' · ');
  return `<li>${isCancelled(r) ? '<span class="x">[대회 취소]</span> ' : ''}<a href="/r/${esc(r.id)}">${esc(r.name_ko)}</a><span class="meta">${esc(meta)}</span></li>`;
};

/** noindex: 검색 결과에 넣지 않을 페이지(대회 0개). 기본 false → 기존 페이지 출력은 그대로 */
function page({ path, title, description, h1, lead, crumbs, body, list, noindex = false }) {
  const url = `${ORIGIN}${path}`;
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${ORIGIN}${c.path}` })),
  };
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: h1,
    itemListElement: list.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}/r/${r.id}`, name: r.name_ko })),
  };
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex,follow">\n' : ''}<link rel="canonical" href="${url}">
${headLinks(url, { ko: url, en: `${ORIGIN}${enPath(path)}` })}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${hasPublic('/apple-touch-icon.png') ? '<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n' : ''}<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f1f2f4">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0e0f11">
<meta property="og:type" content="website">
<meta property="og:site_name" content="마라톤 캘린더">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<style>${STYLE}</style>
${ldJson(breadcrumb)}
${ldJson(itemList)}
</head>
<body>
<header><a class="brand" href="/" aria-label="마라톤 캘린더 홈">${logo()}</a><a href="/">전체 일정·검색</a></header>
<main>
<p class="crumb">${crumbs.map((c, i) => (i === crumbs.length - 1 ? esc(c.name) : `<a href="${c.path}">${esc(c.name)}</a>`)).join(' › ')}</p>
<h1>${esc(h1)}</h1>
<p class="lead">${esc(lead)}</p>
${body}
</main>
<footer><a href="/">마라톤 캘린더</a> — 국내·해외 마라톤·트레일러닝 대회 일정과 접수 기간. 날짜·접수 기간은 바뀔 수 있으니 공식 홈페이지에서 한 번 더 확인하세요.<br>문의 <a href="mailto:marathon82@kakao.com">marathon82@kakao.com</a>${noticeHtml('ko')}</footer>
</body>
</html>
`;
}

const monthNav = (current) =>
  `<h2>월별 마라톤 일정</h2><nav class="links" aria-label="월별">${months
    .map((ym) => (ym === current ? `<strong>${monthLabel(ym)}</strong>` : `<a href="${monthPath(ym)}">${monthLabel(ym)}</a>`))
    .join('')}</nav>`;
const countryNav = (current) =>
  `<h2>나라별 마라톤 일정</h2><nav class="links" aria-label="나라별">${countries
    .map((c) => (c.code === current ? `<strong>${esc(c.name)}</strong>` : `<a href="${countryPath(c.code)}">${esc(c.name)} (${c.races.length})</a>`))
    .join('')}</nav>`;
const topicNav = (current) =>
  `<h2>주제별 마라톤 일정</h2><nav class="links" aria-label="주제별">${LANDINGS.map((l) =>
    l.path === current ? `<strong>${esc(l.name)}</strong>` : `<a href="${l.path}">${esc(l.name)}</a>`,
  ).join('')}</nav>`;
/** 시·도별·거리별 국내 대회 링크 (대회 있는 곳만). current: 지금 페이지 주소 */
const regionLinks = (current) =>
  regionPages.map((p) => (p.path === current ? `<strong>${esc(p.name)}</strong>` : `<a href="${p.path}">${esc(p.name)} (${p.races.length})</a>`)).join('');
const placeNav = (current) =>
  `<h2>시·도별·거리별 국내 마라톤 일정</h2><nav class="links" aria-label="시·도별">${regionLinks(current)}</nav><nav class="links" aria-label="거리별">${distancePages
    .map((d) => (d.path === current ? `<strong>${esc(d.name)}</strong>` : `<a href="${d.path}">${esc(d.name)} (${d.races.length})</a>`))
    .join('')}</nav>`;
const names = (rs, n = 3) => rs.filter((r) => !isCancelled(r)).slice(0, n).map((r) => r.name_ko).join(', ');

const out = (path, html) => {
  const dir = new URL(`../dist${path}`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('index.html', dir), html);
};

// 월별
for (const [i, ym] of months.entries()) {
  const rs = races.filter((r) => r.race_date.startsWith(ym));
  const kr = rs.filter((r) => r.country_code === 'KR');
  const abroad = rs.filter((r) => r.country_code !== 'KR');
  const label = monthLabel(ym);
  const prev = months[i - 1];
  const next = months[i + 1];
  const past = ym < today.slice(0, 7);
  const body = [
    `<nav class="links" aria-label="이전·다음 달">${prev ? `<a href="${monthPath(prev)}">← ${monthLabel(prev)}</a>` : ''}${next ? `<a href="${monthPath(next)}">${monthLabel(next)} →</a>` : ''}</nav>`,
    kr.length ? `<h2>${label} 국내 마라톤 (${kr.length}개)</h2><ul class="races">${kr.map((r) => item(r)).join('')}</ul>` : '',
    abroad.length ? `<h2>${label} 해외 마라톤 (${abroad.length}개)</h2><ul class="races">${abroad.map((r) => item(r)).join('')}</ul>` : '',
    monthNav(ym),
    countryNav(null),
    topicNav(null),
    placeNav(null),
  ].join('\n');
  out(
    monthPath(ym),
    page({
      path: monthPath(ym),
      title: `${label} 마라톤 일정 — 국내 ${kr.length}개·해외 ${abroad.length}개 대회 접수 | 마라톤 캘린더`,
      description: `${label}${past ? '에 열린' : '에 열리는'} 마라톤·트레일러닝 대회 ${rs.length}개(국내 ${kr.length}, 해외 ${abroad.length})의 날짜, 장소, 종목, 접수 기간. ${names(rs)} 등.`.slice(0, 160),
      h1: `${label} 마라톤 일정`,
      lead: `${label}${past ? '에 열린' : '에 열리는'} 국내 ${kr.length}개, 해외 ${abroad.length}개 대회입니다. 대회 이름을 누르면 접수 기간·참가비·공식 홈페이지를 볼 수 있습니다.`,
      crumbs: [{ name: '마라톤 캘린더', path: '/' }, { name: `${label} 마라톤 일정`, path: monthPath(ym) }],
      body,
      list: rs,
    }),
  );
}

// 나라별
for (const c of countries) {
  const up = c.races.filter((r) => r.race_date >= today);
  const past = c.races.filter((r) => r.race_date < today);
  const byM = new Map();
  for (const r of up) byM.set(r.race_date.slice(0, 7), [...(byM.get(r.race_date.slice(0, 7)) ?? []), r]);
  const years = [...new Set(up.map((r) => r.race_date.slice(0, 4)))].join('·');
  const isKr = c.code === 'kr';
  const name = isKr ? '국내' : c.name;
  const trail = c.races.filter((r) => r.discipline === 'trail').length;
  const body = [
    ...[...byM.entries()].map(
      ([ym, rs]) => `<h2><a href="${monthPath(ym)}">${monthLabel(ym)}</a> ${esc(name)} 마라톤 (${rs.length}개)</h2><ul class="races">${rs.map((r) => item(r, { showWhere: true })).join('')}</ul>`,
    ),
    past.length ? `<h2>지난 대회 (${past.length}개)</h2><ul class="races">${past.reverse().map((r) => item(r)).join('')}</ul>` : '',
    countryNav(c.code),
    monthNav(null),
    topicNav(null),
  ].join('\n');
  out(
    countryPath(c.code),
    page({
      path: countryPath(c.code),
      title: `${name} 마라톤 대회 일정${years ? ` ${years}` : ''} — 접수 기간 | 마라톤 캘린더`,
      description: `${isKr ? '국내' : `${c.name}`} 마라톤${trail ? '·트레일러닝' : ''} 대회 ${c.races.length}개의 날짜, 도시, 종목, 접수 시작·마감일과 공식 홈페이지. ${names(up)} 등.`.slice(0, 160),
      h1: `${name} 마라톤 대회 일정${years ? ` ${years}` : ''}`,
      lead: `${isKr ? '국내' : `${c.name}에서 열리는`} 대회 ${up.length}개를 날짜순으로 모았습니다${trail ? ` (트레일러닝 ${trail}개 포함)` : ''}. 대회 이름을 누르면 접수 방식·참가비·공식 홈페이지를 볼 수 있습니다.`,
      crumbs: [{ name: '마라톤 캘린더', path: '/' }, { name: `${name} 마라톤 일정`, path: countryPath(c.code) }],
      body,
      list: c.races,
    }),
  );
}

// 검색어 랜딩 (연도별·국내·해외·트레일·접수 중)
const isKr = (r) => r.country_code === 'KR';
const yearsText = (rs) => [...new Set(rs.map((r) => r.race_date.slice(0, 4)))].join('·');
const crumbsOf = (path, name) => [{ name: '마라톤 캘린더', path: '/' }, { name, path }];
/** 설명 끝 '대회 이름 3개 등.' — 이름이 하나도 없으면(접수 중 0개, 다 지난 해) 빼서 '.  등.' 이 남지 않게 */
const etc = (rs) => (names(rs) ? ` ${names(rs)} 등.` : '');
/** 달마다 h2(월별 페이지 링크) 아래 국내·해외 두 묶음 */
const byMonthBody = (rs, { split = true, status = false } = {}) => {
  const li = (r) => item(r, { status });
  const byM = new Map();
  for (const r of rs) byM.set(r.race_date.slice(0, 7), [...(byM.get(r.race_date.slice(0, 7)) ?? []), r]);
  return [...byM.entries()]
    .map(([ym, ms]) => {
      const head = `<h2><a href="${monthPath(ym)}">${monthLabel(ym)}</a> 마라톤 일정 (${ms.length}개)</h2>`;
      if (!split) return `${head}<ul class="races">${ms.map(li).join('')}</ul>`;
      const kr = ms.filter(isKr);
      const ab = ms.filter((r) => !isKr(r));
      return [
        head,
        kr.length ? `<h3>국내 (${kr.length}개)</h3><ul class="races">${kr.map(li).join('')}</ul>` : '',
        ab.length ? `<h3>해외 (${ab.length}개)</h3><ul class="races">${ab.map(li).join('')}</ul>` : '',
      ].join('');
    })
    .join('\n');
};
const footNav = (path) => [monthNav(null), countryNav(null), topicNav(path), placeNav(path)].join('\n');

// 연도별
for (const y of years) {
  const path = yearPath(y);
  const rs = races.filter((r) => r.race_date.startsWith(y));
  const kr = rs.filter(isKr).length;
  const ab = rs.length - kr;
  const hasPast = rs.some((r) => r.race_date < today);
  out(
    path,
    page({
      path,
      title: `${y} 마라톤 일정 — 국내 ${kr}개·해외 ${ab}개 대회 접수 기간 | 마라톤 캘린더`,
      description: `${y}년 국내·해외 마라톤·트레일러닝 대회 ${rs.length}개(국내 ${kr}, 해외 ${ab})의 날짜, 장소, 종목, 접수 시작·마감일을 달별로.${etc(rs.some((r) => r.race_date >= today) ? rs.filter((r) => r.race_date >= today) : rs)}`.slice(0, 160),
      h1: `${y} 마라톤 일정`,
      lead: `${y}년에 열리는 국내 ${kr}개, 해외 ${ab}개 대회를 달별로 모았습니다${hasPast ? '(이미 열린 대회 포함)' : ''}. 대회 이름을 누르면 접수 기간·참가비·공식 홈페이지를 볼 수 있습니다.`,
      crumbs: crumbsOf(path, `${y} 마라톤 일정`),
      body: [byMonthBody(rs), footNav(path)].join('\n'),
      list: rs,
    }),
  );
}

// 국내
{
  const path = '/kr/';
  const rs = upcoming.filter(isKr);
  const ys = yearsText(rs);
  out(
    path,
    page({
      path,
      title: `국내 마라톤 일정 ${ys} — 대회 접수 기간 | 마라톤 캘린더`,
      description: `다가오는 국내 마라톤·트레일러닝 대회 ${rs.length}개의 날짜, 도시, 종목, 접수 시작·마감일과 추첨·선착순 여부.${etc(rs)}`.slice(0, 160),
      h1: '국내 마라톤 대회 일정',
      lead: `앞으로 열리는 국내 대회 ${rs.length}개를 날짜순으로 모았습니다. 대회 이름을 누르면 접수 방식·참가비·공식 홈페이지를 볼 수 있습니다.`,
      crumbs: crumbsOf(path, '국내 마라톤 일정'),
      body: [
        `<p><a href="${countryPath('kr')}">지난 대회까지 보기 (국내 마라톤 전체)</a></p>`,
        `<nav class="links" aria-label="시·도별">${regionLinks(null)}</nav>`,
        byMonthBody(rs, { split: false }),
        footNav(path),
      ].join('\n'),
      list: rs,
      noindex: !rs.length, // 다가오는 대회가 0개인 날(데이터가 다 지난 경우)에는 검색 결과에 넣지 않는다
    }),
  );
}

// 해외
{
  const path = '/abroad/';
  const rs = upcoming.filter((r) => !isKr(r));
  const ys = yearsText(rs);
  const n = new Set(rs.map((r) => r.country_code)).size;
  out(
    path,
    page({
      path,
      title: `해외 마라톤 일정 ${ys} — 나라별 대회 접수 | 마라톤 캘린더`,
      description: `다가오는 해외 마라톤·트레일러닝 대회 ${rs.length}개(${n}개 나라)의 날짜, 도시, 종목, 추첨·선착순 접수 기간.${etc(rs)}`.slice(0, 160),
      h1: '해외 마라톤 대회 일정',
      lead: `앞으로 열리는 해외 대회 ${rs.length}개(${n}개 나라)를 날짜순으로 모았습니다. 대회 이름을 누르면 접수 방식·참가비·여행사 패키지를 볼 수 있습니다.`,
      crumbs: crumbsOf(path, '해외 마라톤 일정'),
      body: [byMonthBody(rs, { split: false }), footNav(path)].join('\n'),
      list: rs,
      noindex: !rs.length, // 다가오는 대회가 0개인 날(데이터가 다 지난 경우)에는 검색 결과에 넣지 않는다
    }),
  );
}

// 트레일러닝
{
  const path = '/trail/';
  const rs = upcoming.filter((r) => r.discipline === 'trail');
  const kr = rs.filter(isKr).length;
  const ys = yearsText(rs);
  out(
    path,
    page({
      path,
      title: `트레일러닝 대회 일정 ${ys} — 국내·해외 접수 | 마라톤 캘린더`,
      description: `다가오는 트레일러닝 대회 ${rs.length}개(국내 ${kr}, 해외 ${rs.length - kr})의 날짜, 장소, 거리, 접수 시작·마감일.${etc(rs)}`.slice(0, 160),
      h1: '트레일러닝 대회 일정',
      lead: `앞으로 열리는 트레일러닝 대회 국내 ${kr}개, 해외 ${rs.length - kr}개를 날짜순으로 모았습니다. 대회 이름을 누르면 접수 방식·참가비·공식 홈페이지를 볼 수 있습니다.`,
      crumbs: crumbsOf(path, '트레일러닝 대회 일정'),
      body: [byMonthBody(rs), footNav(path)].join('\n'),
      list: rs,
      noindex: !rs.length, // 다가오는 대회가 0개인 날(데이터가 다 지난 경우)에는 검색 결과에 넣지 않는다
    }),
  );
}

// 지금 접수 중 (홈 '지금 접수 중' 과 같은 규칙·같은 범위: 다가오는 대회 중 isEntryOpen)
{
  const path = '/entry-open/';
  const rs = upcoming
    .filter((r) => isEntryOpen(r))
    .sort((a, b) => (a.entry_closes ?? '9999').localeCompare(b.entry_closes ?? '9999') || a.race_date.localeCompare(b.race_date));
  const kr = rs.filter(isKr);
  const ab = rs.filter((r) => !isKr(r));
  const day = fmt(today);
  out(
    path,
    page({
      path,
      title: `지금 접수 중인 마라톤 대회 ${rs.length}개 — ${day} 기준 | 마라톤 캘린더`,
      description: `${day} 기준 접수 중인 국내 ${kr.length}개·해외 ${ab.length}개 마라톤·트레일러닝 대회를 접수 마감이 가까운 순서로.${etc(rs)}`.slice(0, 160),
      h1: '지금 접수 중인 마라톤 대회',
      lead: rs.length
        ? `${fmt(today)} 기준 접수 중인 대회 ${rs.length}개(국내 ${kr.length}, 해외 ${ab.length})를 마감이 가까운 순서로 모았습니다. 목록은 매일 새로 만들어집니다(만든 날 기준). 선착순 대회는 마감일 전에 일찍 끝날 수 있습니다.`
        : `${fmt(today)} 기준 접수 중인 대회가 없습니다. 목록은 매일 새로 만들어집니다(만든 날 기준). 접수 예정인 대회는 전체 일정에서 볼 수 있습니다.`,
      crumbs: crumbsOf(path, '지금 접수 중인 대회'),
      body: [
        rs.length ? '' : '<p>지금 접수 중인 대회가 없습니다.</p>',
        kr.length ? `<h2>국내 접수 중 (${kr.length}개)</h2><ul class="races">${kr.map((r) => item(r, { status: true })).join('')}</ul>` : '',
        ab.length ? `<h2>해외 접수 중 (${ab.length}개)</h2><ul class="races">${ab.map((r) => item(r, { status: true })).join('')}</ul>` : '',
        footNav(path),
      ].join('\n'),
      list: [...kr, ...ab], // 화면 순서(국내 → 해외)와 같게
      noindex: !rs.length,
    }),
  );
}


// ── 영어판: dist/en/… (한국어 페이지와 같은 목록·같은 순서, 주소만 /en 접두). 위 한국어 코드는 그대로 두고 따로 만든다 ──
/** 영어 숫자: 1056 → '1,056' (PLAN 2-2) */
const num = (n) => n.toLocaleString('en-US');
const logoEn = () => {
  if (!SYMBOL) return `<span class="brand-text">${SITE_NAME_EN}</span>`;
  const pic = (base, size) =>
    `<picture><source srcset="${base.replace('.svg', '-inverse.svg')}" media="(prefers-color-scheme: dark)"><img src="${base}" width="${size.width}" height="${size.height}" alt=""></picture>`;
  return pic('/brand/symbol.svg', SYMBOL) + (WORD ? pic('/brand/wordmark.svg', WORD) : `<span class="brand-text">${SITE_NAME_EN}</span>`);
};

const itemEn = (r, { status = false } = {}) => {
  const st = status && !isCancelled(r) ? STATUS_EN[entryStatusOf(r)] : '';
  // status 줄은 접수 일정이 확정일 때만 접수 기간을 적는다 (한국어 item 과 같은 규칙)
  const entry = !status || isEntryConfirmed(r) ? entryEn(r) : ENTRY_EN[r.entry_type] ?? '';
  const meta = [fmtEn(r.race_date), whereEn(r), distEn(r), st, entry].filter(Boolean).join(' · ');
  return `<li>${isCancelled(r) ? '<span class="x">[Cancelled]</span> ' : ''}<a href="${enPath(`/r/${esc(r.id)}`)}">${esc(raceNameEn(r))}</a><span class="meta">${esc(meta)}</span></li>`;
};

/** koPath: 짝이 되는 한국어 주소 ('/m/2027-02/'). 영어 주소는 /en + koPath */
function pageEn({ koPath, title, description, h1, lead, crumbs, body, list, noindex = false }) {
  const path = enPath(koPath);
  const url = `${ORIGIN}${path}`;
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${ORIGIN}${c.path}` })),
  };
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: h1,
    itemListElement: list.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}${enPath(`/r/${r.id}`)}`, name: raceNameEn(r) })),
  };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex,follow">\n' : ''}<link rel="canonical" href="${url}">
${headLinks(url, { ko: `${ORIGIN}${koPath}`, en: url })}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${hasPublic('/apple-touch-icon.png') ? '<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n' : ''}<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f1f2f4">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0e0f11">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME_EN}">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="ko_KR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<style>${STYLE}</style>
${ldJson(breadcrumb)}
${ldJson(itemList)}
</head>
<body>
<header><a class="brand" href="/en/" aria-label="${SITE_NAME_EN} home">${logoEn()}</a><a href="/en/">All races &amp; search</a></header>
<main>
<p class="crumb">${crumbs.map((c, i) => (i === crumbs.length - 1 ? esc(c.name) : `<a href="${c.path}">${esc(c.name)}</a>`)).join(' › ')}</p>
<h1>${esc(h1)}</h1>
<p class="lead">${esc(lead)}</p>
${body}
</main>
<footer><a href="/en/">${SITE_NAME_EN}</a> — Marathon and trail race dates and registration windows in Korea and worldwide. Dates and registration windows can change, so double-check on the official website.<br>Contact <a href="mailto:marathon82@kakao.com">marathon82@kakao.com</a>${noticeHtml('en')}</footer>
</body>
</html>
`;
}

const countryLabelEn = (c) => countryNameEn(c.code.toUpperCase());
const monthNavEn = (current) =>
  `<h2>Marathons by Month</h2><nav class="links" aria-label="By month">${months
    .map((ym) => (ym === current ? `<strong>${monthLabelEn(ym)}</strong>` : `<a href="${enPath(monthPath(ym))}">${monthLabelEn(ym)}</a>`))
    .join('')}</nav>`;
const countryNavEn = (current) =>
  `<h2>Marathons by Country</h2><nav class="links" aria-label="By country">${countries
    .map((c) => (c.code === current ? `<strong>${esc(countryLabelEn(c))}</strong>` : `<a href="${enPath(countryPath(c.code))}">${esc(countryLabelEn(c))} (${num(c.races.length)})</a>`))
    .join('')}</nav>`;
const topicNavEn = (current) =>
  `<h2>Marathons by Topic</h2><nav class="links" aria-label="By topic">${LANDINGS_EN.map((l) =>
    l.path === current ? `<strong>${esc(l.name)}</strong>` : `<a href="${l.path}">${esc(l.name)}</a>`,
  ).join('')}</nav>`;
const regionLinksEn = (current) =>
  regionPages
    .map((p) => (enPath(p.path) === current ? `<strong>${esc(p.nameEn)}</strong>` : `<a href="${enPath(p.path)}">${esc(p.nameEn)} (${num(p.races.length)})</a>`))
    .join('');
const placeNavEn = (current) =>
  `<h2>Races in Korea by Region and Distance</h2><nav class="links" aria-label="By region">${regionLinksEn(current)}</nav><nav class="links" aria-label="By distance">${distancePages
    .map((d) => (enPath(d.path) === current ? `<strong>${esc(d.nameEn)}</strong>` : `<a href="${enPath(d.path)}">${esc(d.nameEn)} (${num(d.races.length)})</a>`))
    .join('')}</nav>`;
const footNavEn = (path) => [monthNavEn(null), countryNavEn(null), topicNavEn(path), placeNavEn(path)].join('\n');
const namesEn = (rs, n = 3) => rs.filter((r) => !isCancelled(r)).slice(0, n).map(raceNameEn).join(', ');
/** 설명 끝 'Including A, B, C.' — 이름이 없으면 뺀다 */
const etcEn = (rs) => (namesEn(rs) ? ` Including ${namesEn(rs)}.` : '');
const crumbsEn = (path, name) => [{ name: SITE_NAME_EN, path: '/en/' }, { name, path }];
const SELECT = 'Select a race to see its registration dates, entry fee and official website.';
const byMonthBodyEn = (rs, { split = true, status = false } = {}) => {
  const li = (r) => itemEn(r, { status });
  const byM = new Map();
  for (const r of rs) byM.set(r.race_date.slice(0, 7), [...(byM.get(r.race_date.slice(0, 7)) ?? []), r]);
  return [...byM.entries()]
    .map(([ym, ms]) => {
      const head = `<h2><a href="${enPath(monthPath(ym))}">${monthLabelEn(ym)}</a> Marathons (${num(ms.length)})</h2>`;
      if (!split) return `${head}<ul class="races">${ms.map(li).join('')}</ul>`;
      const kr = ms.filter(isKr);
      const ab = ms.filter((r) => !isKr(r));
      return [
        head,
        kr.length ? `<h3>Korea (${num(kr.length)})</h3><ul class="races">${kr.map(li).join('')}</ul>` : '',
        ab.length ? `<h3>Abroad (${num(ab.length)})</h3><ul class="races">${ab.map(li).join('')}</ul>` : '',
      ].join('');
    })
    .join('\n');
};

// 월별 (영어)
for (const [i, ym] of months.entries()) {
  const rs = races.filter((r) => r.race_date.startsWith(ym));
  const kr = rs.filter(isKr);
  const abroad = rs.filter((r) => !isKr(r));
  const label = monthLabelEn(ym);
  const prev = months[i - 1];
  const next = months[i + 1];
  const when = ym < today.slice(0, 7) ? 'held' : 'taking place';
  const koPath = monthPath(ym);
  const body = [
    `<nav class="links" aria-label="Previous and next month">${prev ? `<a href="${enPath(monthPath(prev))}">← ${monthLabelEn(prev)}</a>` : ''}${next ? `<a href="${enPath(monthPath(next))}">${monthLabelEn(next)} →</a>` : ''}</nav>`,
    kr.length ? `<h2>${label} Races in Korea (${num(kr.length)})</h2><ul class="races">${kr.map(itemEn).join('')}</ul>` : '',
    abroad.length ? `<h2>${label} Races Abroad (${num(abroad.length)})</h2><ul class="races">${abroad.map(itemEn).join('')}</ul>` : '',
    monthNavEn(ym),
    countryNavEn(null),
    topicNavEn(null),
    placeNavEn(null),
  ].join('\n');
  out(
    enPath(koPath),
    pageEn({
      koPath,
      title: `${label} Marathons — ${num(kr.length)} in Korea, ${num(abroad.length)} Abroad | ${SITE_NAME_EN}`,
      description: `Dates, locations, distances and registration windows for ${num(rs.length)} marathons and trail races ${when} in ${label} (${num(kr.length)} in Korea, ${num(abroad.length)} abroad).${etcEn(rs)}`.slice(0, 160),
      h1: `${label} Marathons`,
      lead: `${num(kr.length)} races in Korea and ${num(abroad.length)} abroad ${when} in ${label}. ${SELECT}`,
      crumbs: crumbsEn(enPath(koPath), `${label} Marathons`),
      body,
      list: rs,
    }),
  );
}

// 나라별 (영어)
for (const c of countries) {
  const up = c.races.filter((r) => r.race_date >= today);
  const past = c.races.filter((r) => r.race_date < today);
  const byM = new Map();
  for (const r of up) byM.set(r.race_date.slice(0, 7), [...(byM.get(r.race_date.slice(0, 7)) ?? []), r]);
  const ys = yearsEn([...new Set(up.map((r) => r.race_date.slice(0, 4)))]);
  const name = countryLabelEn(c);
  const inName = inCountryEn(name);
  const trail = c.races.filter((r) => r.discipline === 'trail').length;
  const koPath = countryPath(c.code);
  const body = [
    ...[...byM.entries()].map(
      ([ym, rs]) => `<h2><a href="${enPath(monthPath(ym))}">${monthLabelEn(ym)}</a> — ${esc(name)} (${num(rs.length)})</h2><ul class="races">${rs.map(itemEn).join('')}</ul>`,
    ),
    past.length ? `<h2>Past races (${num(past.length)})</h2><ul class="races">${[...past].reverse().map(itemEn).join('')}</ul>` : '',
    countryNavEn(c.code),
    monthNavEn(null),
    topicNavEn(null),
  ].join('\n');
  out(
    enPath(koPath),
    pageEn({
      koPath,
      title: `Marathons in ${inName}${ys ? ` ${ys}` : ''} — Race Dates & Registration | ${SITE_NAME_EN}`,
      description: `Dates, cities, distances, registration open and close dates, and official websites for ${num(c.races.length)} marathon${trail ? ' and trail' : ''} races in ${inName}.${etcEn(up)}`.slice(0, 160),
      h1: `Marathons in ${inName}${ys ? ` ${ys}` : ''}`,
      lead: `${num(up.length)} upcoming races in ${inName}, sorted by date${trail ? ` (including ${num(trail)} trail races)` : ''}. Select a race to see its entry type, fee and official website.`,
      crumbs: crumbsEn(enPath(koPath), `Marathons in ${inName}`),
      body,
      list: c.races,
    }),
  );
}

// 연도별 (영어)
for (const y of years) {
  const koPath = yearPath(y);
  const rs = races.filter((r) => r.race_date.startsWith(y));
  const kr = rs.filter(isKr).length;
  const ab = rs.length - kr;
  const hasPast = rs.some((r) => r.race_date < today);
  const up = rs.filter((r) => r.race_date >= today);
  out(
    enPath(koPath),
    pageEn({
      koPath,
      title: `${y} Marathon Calendar — ${num(kr)} in Korea, ${num(ab)} Abroad | ${SITE_NAME_EN}`,
      description: `Dates, locations, distances and registration open and close dates for ${num(rs.length)} marathons and trail races in ${y} (${num(kr)} in Korea, ${num(ab)} abroad), month by month.${etcEn(up.length ? up : rs)}`.slice(0, 160),
      h1: `${y} Marathon Calendar`,
      lead: `${num(kr)} races in Korea and ${num(ab)} abroad in ${y}, month by month${hasPast ? ' (including races already held)' : ''}. ${SELECT}`,
      crumbs: crumbsEn(enPath(koPath), `${y} Marathon Calendar`),
      body: [byMonthBodyEn(rs), footNavEn(enPath(koPath))].join('\n'),
      list: rs,
    }),
  );
}

// 국내 (영어)
{
  const koPath = '/kr/';
  const rs = upcoming.filter(isKr);
  const ys = yearsEn([...new Set(rs.map((r) => r.race_date.slice(0, 4)))]);
  out(
    enPath(koPath),
    pageEn({
      koPath,
      title: `Marathons in South Korea ${ys} — Race Registration | ${SITE_NAME_EN}`,
      description: `Dates, cities, distances, registration open and close dates, and lottery or first-come entry for ${num(rs.length)} upcoming marathons and trail races in South Korea.${etcEn(rs)}`.slice(0, 160),
      h1: 'Marathons in South Korea',
      lead: `${num(rs.length)} upcoming races in South Korea, sorted by date. Select a race to see its entry type, fee and official website.`,
      crumbs: crumbsEn(enPath(koPath), 'Marathons in South Korea'),
      body: [
        `<p><a href="${enPath(countryPath('kr'))}">Include past races (all marathons in South Korea)</a></p>`,
        `<nav class="links" aria-label="By region">${regionLinksEn(null)}</nav>`,
        byMonthBodyEn(rs, { split: false }),
        footNavEn(enPath(koPath)),
      ].join('\n'),
      list: rs,
      noindex: !rs.length, // 다가오는 대회가 0개인 날(데이터가 다 지난 경우)에는 검색 결과에 넣지 않는다
    }),
  );
}

// 해외 (영어)
{
  const koPath = '/abroad/';
  const rs = upcoming.filter((r) => !isKr(r));
  const ys = yearsEn([...new Set(rs.map((r) => r.race_date.slice(0, 4)))]);
  const n = new Set(rs.map((r) => r.country_code)).size;
  out(
    enPath(koPath),
    pageEn({
      koPath,
      title: `Marathons Outside Korea ${ys} — Race Registration by Country | ${SITE_NAME_EN}`,
      description: `Dates, cities, distances and lottery or first-come registration windows for ${num(rs.length)} upcoming marathons and trail races in ${n} countries outside Korea.${etcEn(rs)}`.slice(0, 160),
      h1: 'Marathons Outside Korea',
      lead: `${num(rs.length)} upcoming races in ${n} countries outside Korea, sorted by date. Select a race to see its entry type, fee and tour packages.`,
      crumbs: crumbsEn(enPath(koPath), 'Marathons Outside Korea'),
      body: [byMonthBodyEn(rs, { split: false }), footNavEn(enPath(koPath))].join('\n'),
      list: rs,
      noindex: !rs.length, // 다가오는 대회가 0개인 날(데이터가 다 지난 경우)에는 검색 결과에 넣지 않는다
    }),
  );
}

// 트레일러닝 (영어)
{
  const koPath = '/trail/';
  const rs = upcoming.filter((r) => r.discipline === 'trail');
  const kr = rs.filter(isKr).length;
  const ys = yearsEn([...new Set(rs.map((r) => r.race_date.slice(0, 4)))]);
  out(
    enPath(koPath),
    pageEn({
      koPath,
      title: `Trail Races ${ys} — Korea and Worldwide Registration | ${SITE_NAME_EN}`,
      description: `Dates, locations, distances and registration open and close dates for ${num(rs.length)} upcoming trail races (${num(kr)} in Korea, ${num(rs.length - kr)} abroad).${etcEn(rs)}`.slice(0, 160),
      h1: 'Trail Races',
      lead: `${num(kr)} upcoming trail races in Korea and ${num(rs.length - kr)} abroad, sorted by date. Select a race to see its entry type, fee and official website.`,
      crumbs: crumbsEn(enPath(koPath), 'Trail Races'),
      body: [byMonthBodyEn(rs), footNavEn(enPath(koPath))].join('\n'),
      list: rs,
      noindex: !rs.length, // 다가오는 대회가 0개인 날(데이터가 다 지난 경우)에는 검색 결과에 넣지 않는다
    }),
  );
}

// 지금 접수 중 (영어, 한국어와 같은 규칙·같은 순서)
{
  const koPath = '/entry-open/';
  const rs = upcoming
    .filter((r) => isEntryOpen(r))
    .sort((a, b) => (a.entry_closes ?? '9999').localeCompare(b.entry_closes ?? '9999') || a.race_date.localeCompare(b.race_date));
  const kr = rs.filter(isKr);
  const ab = rs.filter((r) => !isKr(r));
  const day = fmtEn(today);
  out(
    enPath(koPath),
    pageEn({
      koPath,
      title: `${num(rs.length)} Races Open for Registration — as of ${day} | ${SITE_NAME_EN}`,
      description: `Marathons and trail races open for registration as of ${day}: ${num(kr.length)} in Korea and ${num(ab.length)} abroad, sorted by closing date.${etcEn(rs)}`.slice(0, 160),
      h1: 'Races Open for Registration',
      lead: rs.length
        ? `${num(rs.length)} races open for registration as of ${fmtEn(today)} (${num(kr.length)} in Korea, ${num(ab.length)} abroad), sorted by closing date. This list is rebuilt daily (as of the build date). First-come races can sell out before the closing date.`
        : `No races are open for registration as of ${fmtEn(today)}. This list is rebuilt daily (as of the build date). Upcoming races are in the full calendar.`,
      crumbs: crumbsEn(enPath(koPath), 'Races Open for Registration'),
      body: [
        rs.length ? '' : '<p>No races are open for registration right now.</p>',
        kr.length ? `<h2>Open in Korea (${num(kr.length)})</h2><ul class="races">${kr.map((r) => itemEn(r, { status: true })).join('')}</ul>` : '',
        ab.length ? `<h2>Open Abroad (${num(ab.length)})</h2><ul class="races">${ab.map((r) => itemEn(r, { status: true })).join('')}</ul>` : '',
        footNavEn(enPath(koPath)),
      ].join('\n'),
      list: [...kr, ...ab], // 화면 순서(Korea → Abroad)와 같게
      noindex: !rs.length,
    }),
  );
}

// ── 검색 유입 목록 페이지: 시·도별(/kr/<id>/), 거리별(/distance/<bucket>/), 이번 주말(/weekend/), /open/ 넘김 (한국어·영어) ──
// 범위·주소는 seo-lib.mjs 의 regionPages·distancePages·weekend 한 곳에서만 정한다(0개 시·도·거리는 거기서 빠진다)
const KR_CRUMB = { name: '국내 마라톤 일정', path: '/kr/' };
const KR_CRUMB_EN = { name: 'Marathons in South Korea', path: '/en/kr/' };
const ysEnOf = (rs) => yearsEn([...new Set(rs.map((r) => r.race_date.slice(0, 4)))]);

// 시·도별
for (const p of regionPages) {
  const rs = p.races;
  const ys = yearsText(rs);
  const open = rs.filter((r) => entryStatusOf(r) === 'open').length;
  out(
    p.path,
    page({
      path: p.path,
      title: `${ys} ${p.name} 마라톤 대회 일정 — 마라톤 캘린더`,
      description: `다가오는 ${p.name} 지역 마라톤·러닝 대회 ${rs.length}개(접수 중 ${open}개)의 날짜, 장소, 종목, 접수 상태와 접수 시작·마감일.${etc(rs)}`.slice(0, 160),
      h1: `${p.name} 마라톤 대회 일정`,
      lead: `앞으로 열리는 ${p.name} 지역 대회 ${rs.length}개(접수 중 ${open}개)를 날짜순으로 모았습니다. 대회 이름을 누르면 접수 방식·참가비·공식 홈페이지를 볼 수 있습니다.`,
      crumbs: [{ name: '마라톤 캘린더', path: '/' }, KR_CRUMB, { name: `${p.name} 마라톤 일정`, path: p.path }],
      body: [byMonthBody(rs, { split: false, status: true }), footNav(p.path)].join('\n'),
      list: rs,
    }),
  );
  const koPath = p.path;
  const en = enPath(koPath);
  out(
    en,
    pageEn({
      koPath,
      title: `Marathons in ${p.nameEn}, South Korea ${ysEnOf(rs)} — Race Dates & Registration | ${SITE_NAME_EN}`,
      description: `Dates, locations, distances, registration status and open and close dates for ${num(rs.length)} upcoming races in ${p.nameEn}, South Korea (${num(open)} open now).${etcEn(rs)}`.slice(0, 160),
      h1: `Marathons in ${p.nameEn}, South Korea`,
      lead: `${num(rs.length)} upcoming races in ${p.nameEn} (${num(open)} open for registration), sorted by date. Select a race to see its entry type, fee and official website.`,
      crumbs: [{ name: SITE_NAME_EN, path: '/en/' }, KR_CRUMB_EN, { name: `Marathons in ${p.nameEn}`, path: en }],
      body: [byMonthBodyEn(rs, { split: false, status: true }), footNavEn(en)].join('\n'),
      list: rs,
    }),
  );
}

// 거리별 (국내 다가오는 대회)
for (const d of distancePages) {
  const rs = d.races;
  const ys = yearsText(rs);
  const open = rs.filter((r) => entryStatusOf(r) === 'open').length;
  const label = d.bucket === 'full' ? '풀코스 마라톤' : d.bucket === 'half' ? '하프 마라톤' : '10km 마라톤';
  out(
    d.path,
    page({
      path: d.path,
      title: `${ys} 국내 ${label} 대회 일정 — 마라톤 캘린더`,
      description: `${d.name} 종목이 있는 다가오는 국내 대회 ${rs.length}개(접수 중 ${open}개)의 날짜, 장소, 접수 상태와 접수 시작·마감일.${etc(rs)}`.slice(0, 160),
      h1: `국내 ${label} 대회 일정`,
      lead: `${d.name} 종목이 있는 국내 대회 ${rs.length}개(접수 중 ${open}개)를 날짜순으로 모았습니다. 대회 이름을 누르면 접수 방식·참가비·공식 홈페이지를 볼 수 있습니다.`,
      crumbs: [{ name: '마라톤 캘린더', path: '/' }, KR_CRUMB, { name: `${label} 일정`, path: d.path }],
      body: [`<p><a href="/abroad/">해외 대회는 해외 마라톤 일정에서 보기</a></p>`, byMonthBody(rs, { split: false, status: true }), footNav(d.path)].join('\n'),
      list: rs,
    }),
  );
  const koPath = d.path;
  const en = enPath(koPath);
  out(
    en,
    pageEn({
      koPath,
      title: `${d.nameEn} in South Korea ${ysEnOf(rs)} — Race Dates & Registration | ${SITE_NAME_EN}`,
      description: `Dates, locations, registration status and open and close dates for ${num(rs.length)} upcoming races in South Korea with a ${d.bucket === '10k' ? '10K' : d.bucket === 'half' ? 'half marathon' : 'full marathon'} course (${num(open)} open now).${etcEn(rs)}`.slice(0, 160),
      h1: `${d.nameEn} in South Korea`,
      lead: `${num(rs.length)} upcoming races in South Korea with a ${d.bucket === '10k' ? '10K' : d.bucket === 'half' ? 'half marathon' : 'full marathon'} course (${num(open)} open for registration), sorted by date. ${SELECT}`,
      crumbs: [{ name: SITE_NAME_EN, path: '/en/' }, KR_CRUMB_EN, { name: `${d.nameEn} in South Korea`, path: en }],
      body: [`<p><a href="/en/abroad/">Races outside Korea are in Marathons Outside Korea</a></p>`, byMonthBodyEn(rs, { split: false, status: true }), footNavEn(en)].join('\n'),
      list: rs,
    }),
  );
}

// 이번 주말 (빌드 때 계산 → 제목·첫 문단에 날짜 범위를 쓴다)
{
  const { from, to, path, races: rs } = weekend;
  const md = (iso) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일(${KO_WEEKDAY[new Date(iso + 'T00:00:00Z').getUTCDay()]})`;
  const range = from === to ? md(from) : from.slice(0, 7) === to.slice(0, 7) ? `${md(from)}~${md(to).replace(/^\d+월 /, '')}` : `${md(from)}~${md(to)}`;
  const rangeY = `${from.slice(0, 4)}년 ${range}`;
  const kr = rs.filter(isKr);
  const ab = rs.filter((r) => !isKr(r));
  out(
    path,
    page({
      path,
      title: `이번 주말 마라톤 대회 ${range} — 마라톤 캘린더`,
      description: `이번 주말(${rangeY}) 열리는 마라톤·러닝 대회 국내 ${kr.length}개·해외 ${ab.length}개의 날짜, 장소, 종목, 접수 상태.${etc(rs)}`.slice(0, 160),
      h1: `이번 주말 마라톤 대회 (${range})`,
      lead: rs.length
        ? `${rangeY}에 열리는 국내 ${kr.length}개, 해외 ${ab.length}개 대회입니다. 목록은 매일 새로 만들어집니다(만든 날 ${fmt(today)} 기준). 대회 이름을 누르면 접수 방식·참가비·공식 홈페이지를 볼 수 있습니다.`
        : `${rangeY}에 열리는 대회가 없습니다. 목록은 매일 새로 만들어집니다(만든 날 ${fmt(today)} 기준). 다가오는 대회는 전체 일정에서 볼 수 있습니다.`,
      crumbs: crumbsOf(path, '이번 주말 마라톤'),
      body: [
        rs.length ? '' : '<p>이번 주말에 열리는 대회가 없습니다.</p>',
        kr.length ? `<h2>국내 (${kr.length}개)</h2><ul class="races">${kr.map((r) => item(r, { status: true })).join('')}</ul>` : '',
        ab.length ? `<h2>해외 (${ab.length}개)</h2><ul class="races">${ab.map((r) => item(r, { status: true })).join('')}</ul>` : '',
        footNav(path),
      ].join('\n'),
      list: rs,
      noindex: !rs.length,
    }),
  );
  const EN_MD = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const mdEn = (iso) => EN_MD.format(new Date(iso + 'T00:00:00Z'));
  const rangeEn =
    from === to
      ? `${mdEn(from)}, ${from.slice(0, 4)}`
      : from.slice(0, 4) !== to.slice(0, 4)
        ? `${mdEn(from)}, ${from.slice(0, 4)} – ${mdEn(to)}, ${to.slice(0, 4)}`
        : from.slice(0, 7) === to.slice(0, 7)
          ? `${mdEn(from)}–${Number(to.slice(8, 10))}, ${to.slice(0, 4)}`
          : `${mdEn(from)}–${mdEn(to)}, ${to.slice(0, 4)}`;
  const koPath = path;
  const en = enPath(koPath);
  out(
    en,
    pageEn({
      koPath,
      title: `Marathons This Weekend, ${rangeEn} | ${SITE_NAME_EN}`,
      description: `Marathons and running races this weekend (${rangeEn}): ${num(kr.length)} in Korea and ${num(ab.length)} abroad, with dates, locations, distances and registration status.${etcEn(rs)}`.slice(0, 160),
      h1: `Marathons This Weekend (${rangeEn})`,
      lead: rs.length
        ? `${num(kr.length)} races in Korea and ${num(ab.length)} abroad on ${rangeEn}. This list is rebuilt daily (as of ${fmtEn(today)}). ${SELECT}`
        : `No races are taking place on ${rangeEn}. This list is rebuilt daily (as of ${fmtEn(today)}). Upcoming races are in the full calendar.`,
      crumbs: crumbsEn(en, 'Marathons This Weekend'),
      body: [
        rs.length ? '' : '<p>No races are taking place this weekend.</p>',
        kr.length ? `<h2>Korea (${num(kr.length)})</h2><ul class="races">${kr.map((r) => itemEn(r, { status: true })).join('')}</ul>` : '',
        ab.length ? `<h2>Abroad (${num(ab.length)})</h2><ul class="races">${ab.map((r) => itemEn(r, { status: true })).join('')}</ul>` : '',
        footNavEn(en),
      ].join('\n'),
      list: rs,
      noindex: !rs.length,
    }),
  );
}

// /open/ → /entry-open/ 넘김 (같은 내용이라 중복 페이지를 만들지 않는다. canonical 이 가리키는 쪽만 색인되게 noindex 는 넣지 않는다)
const forward = ({ lang, target, title, text }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="canonical" href="${ORIGIN}${target}">
<meta http-equiv="refresh" content="0;url=${target}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<style>${STYLE}</style>
</head>
<body>
<main><p class="lead"><a href="${target}">${esc(text)}</a></p></main>
</body>
</html>
`;
out('/open/', forward({ lang: 'ko', target: '/entry-open/', title: '접수 중인 마라톤 — 마라톤 캘린더', text: '지금 접수 중인 마라톤 대회 보기' }));
out(enPath('/open/'), forward({ lang: 'en', target: enPath('/entry-open/'), title: `Open Marathons — ${SITE_NAME_EN}`, text: 'See races open for registration' }));

console.log(`seo-pages: 월별 ${months.length}개, 나라별 ${countries.length}개, 검색어 랜딩 ${LANDINGS.length}개 목록 페이지 (한국어·영어 각각)`);
console.log(`seo-pages: 시·도별 ${regionPages.length}개, 거리별 ${distancePages.length}개, 이번 주말 1개(${weekend.from}~${weekend.to}, 대회 ${weekend.races.length}개${weekend.races.length ? '' : ' → noindex'}), /open/ 넘김 1개 (한국어·영어 각각)`);
