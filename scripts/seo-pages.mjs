/**
 * 빌드 뒤 크롤링용 정적 목록 페이지를 만든다: dist/m/YYYY-MM/index.html (월별), dist/c/<나라>/index.html (나라별),
 * 검색어 랜딩 dist/YYYY/, dist/kr/, dist/abroad/, dist/trail/, dist/entry-open/ (목록은 seo-lib.mjs 의 LANDINGS·landingPages).
 * 첫 화면은 React 앱이라 검색엔진이 대회 페이지(/r/id)로 가는 링크를 다 못 따라갈 수 있어, 자바스크립트 없이
 * 읽히는 가벼운 HTML 로 모든 대회 링크를 깔아 둔다. _routes.json 밖이라 함수를 안 쓴다(정적 파일).
 * SPA 껍데기를 쓰지 않는 이유: React 가 뜨면 /m/… 에서도 홈 목록으로 바뀌어 canonical 과 본문이 어긋난다.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  ORIGIN, ENTRY, LANDINGS, countries, countryPath, esc, fmt, headLinks, isCancelled, isEntryOpen, ldJson, monthLabel, monthPath, months, races, svgSize, today,
  upcoming, whereOf, yearPath, years,
  LANDINGS_EN, SITE_NAME_EN, countryNameEn, distEn, enPath, entryEn, fmtEn, monthLabelEn, raceNameEn, whereEn, yearsEn,
} from './seo-lib.mjs';

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

const STYLE = `:root{color-scheme:light dark;--bg:#f1f2f4;--fg:#15171a;--mute:#5d636b;--line:#dcdfe3;--card:#fff;--link:#0b57d0}
@media (prefers-color-scheme:dark){:root{--bg:#0e0f11;--fg:#e8eaed;--mute:#9aa0a6;--line:#2a2d31;--card:#17191c;--link:#8ab4f8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;word-break:keep-all}
a{color:var(--link)}header{display:flex;align-items:center;justify-content:space-between;gap:1rem;max-width:56rem;margin:0 auto;padding:1rem}
.brand{display:flex;align-items:center;gap:.5rem;text-decoration:none;color:var(--fg)}.brand img{display:block}.brand-text{font-weight:800;font-size:1.1rem}
main{max-width:56rem;margin:0 auto;padding:0 1rem 3rem}h1{font-size:1.6rem;line-height:1.3;margin:.5rem 0}h2{font-size:1.15rem;margin:2rem 0 .5rem;padding-top:1rem;border-top:1px solid var(--line)}
.crumb,.lead,.meta{color:var(--mute)}.crumb{font-size:.9rem}ul.races{list-style:none;padding:0;margin:0}
ul.races li{background:var(--card);border:1px solid var(--line);border-radius:.6rem;padding:.7rem .9rem;margin:.4rem 0}
ul.races a{font-weight:700}.meta{display:block;font-size:.9rem}.x{color:#c5221f;font-weight:700}
nav.links{display:flex;flex-wrap:wrap;gap:.4rem .9rem;font-size:.95rem}footer{max-width:56rem;margin:0 auto;padding:2rem 1rem;color:var(--mute);font-size:.9rem}`;

const item = (r, { showWhere = true } = {}) => {
  const entry = [
    ENTRY[r.entry_type],
    r.entry_opens && `접수 ${fmt(r.entry_opens)}부터`,
    r.entry_closes && `${fmt(r.entry_closes)}까지`,
  ].filter(Boolean).join(' ');
  const dist = (r.distances ?? []).map((d) => DIST_LABEL[d] ?? d).join('·');
  const meta = [fmt(r.race_date), showWhere && whereOf(r), dist, entry].filter(Boolean).join(' · ');
  return `<li>${isCancelled(r) ? '<span class="x">[대회 취소]</span> ' : ''}<a href="/r/${esc(r.id)}">${esc(r.name_ko)}</a><span class="meta">${esc(meta)}</span></li>`;
};

function page({ path, title, description, h1, lead, crumbs, body, list }) {
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
<link rel="canonical" href="${url}">
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
<footer><a href="/">마라톤 캘린더</a> — 국내·해외 마라톤·트레일러닝 대회 일정과 접수 기간. 날짜·접수 기간은 바뀔 수 있으니 공식 홈페이지에서 한 번 더 확인하세요.<br>문의 <a href="mailto:marathon82@kakao.com">marathon82@kakao.com</a></footer>
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
const byMonthBody = (rs, { split = true } = {}) => {
  const byM = new Map();
  for (const r of rs) byM.set(r.race_date.slice(0, 7), [...(byM.get(r.race_date.slice(0, 7)) ?? []), r]);
  return [...byM.entries()]
    .map(([ym, ms]) => {
      const head = `<h2><a href="${monthPath(ym)}">${monthLabel(ym)}</a> 마라톤 일정 (${ms.length}개)</h2>`;
      if (!split) return `${head}<ul class="races">${ms.map((r) => item(r)).join('')}</ul>`;
      const kr = ms.filter(isKr);
      const ab = ms.filter((r) => !isKr(r));
      return [
        head,
        kr.length ? `<h3>국내 (${kr.length}개)</h3><ul class="races">${kr.map((r) => item(r)).join('')}</ul>` : '',
        ab.length ? `<h3>해외 (${ab.length}개)</h3><ul class="races">${ab.map((r) => item(r)).join('')}</ul>` : '',
      ].join('');
    })
    .join('\n');
};
const footNav = (path) => [monthNav(null), countryNav(null), topicNav(path)].join('\n');

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
      body: [`<p><a href="${countryPath('kr')}">지난 대회까지 보기 (국내 마라톤 전체)</a></p>`, byMonthBody(rs, { split: false }), footNav(path)].join('\n'),
      list: rs,
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
  const day = `${Number(today.slice(5, 7))}월 ${Number(today.slice(8, 10))}일`;
  out(
    path,
    page({
      path,
      title: `지금 접수 중인 마라톤 대회 ${rs.length}개 — ${day} 기준 | 마라톤 캘린더`,
      description: `${day} 기준 접수 중인 국내 ${kr.length}개·해외 ${ab.length}개 마라톤·트레일러닝 대회를 접수 마감이 가까운 순서로.${etc(rs)}`.slice(0, 160),
      h1: '지금 접수 중인 마라톤 대회',
      lead: `${fmt(today)} 기준 접수 중인 대회 ${rs.length}개(국내 ${kr.length}, 해외 ${ab.length})를 마감이 가까운 순서로 모았습니다. 목록은 매일 새로 만들어집니다(만든 날 기준). 선착순 대회는 마감일 전에 일찍 끝날 수 있습니다.`,
      crumbs: crumbsOf(path, '지금 접수 중인 대회'),
      body: [
        rs.length ? '' : '<p>지금 접수 중인 대회가 없습니다.</p>',
        kr.length ? `<h2>국내 접수 중 (${kr.length}개)</h2><ul class="races">${kr.map((r) => item(r)).join('')}</ul>` : '',
        ab.length ? `<h2>해외 접수 중 (${ab.length}개)</h2><ul class="races">${ab.map((r) => item(r)).join('')}</ul>` : '',
        footNav(path),
      ].join('\n'),
      list: rs,
    }),
  );
}


// ── 영어판: dist/en/… (한국어 페이지와 같은 목록·같은 순서, 주소만 /en 접두). 위 한국어 코드는 그대로 두고 따로 만든다 ──
const logoEn = () => {
  if (!SYMBOL) return `<span class="brand-text">${SITE_NAME_EN}</span>`;
  const pic = (base, size) =>
    `<picture><source srcset="${base.replace('.svg', '-inverse.svg')}" media="(prefers-color-scheme: dark)"><img src="${base}" width="${size.width}" height="${size.height}" alt=""></picture>`;
  return pic('/brand/symbol.svg', SYMBOL) + (WORD ? pic('/brand/wordmark.svg', WORD) : `<span class="brand-text">${SITE_NAME_EN}</span>`);
};

const itemEn = (r) => {
  const meta = [fmtEn(r.race_date), whereEn(r), distEn(r), entryEn(r)].filter(Boolean).join(' · ');
  return `<li>${isCancelled(r) ? '<span class="x">[Cancelled]</span> ' : ''}<a href="${enPath(`/r/${esc(r.id)}`)}">${esc(raceNameEn(r))}</a><span class="meta">${esc(meta)}</span></li>`;
};

/** koPath: 짝이 되는 한국어 주소 ('/m/2027-02/'). 영어 주소는 /en + koPath */
function pageEn({ koPath, title, description, h1, lead, crumbs, body, list }) {
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
<link rel="canonical" href="${url}">
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
<footer><a href="/en/">${SITE_NAME_EN}</a> — Marathon and trail race dates and registration windows in Korea and worldwide. Dates and registration windows can change, so double-check on the official website.<br>Contact <a href="mailto:marathon82@kakao.com">marathon82@kakao.com</a></footer>
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
    .map((c) => (c.code === current ? `<strong>${esc(countryLabelEn(c))}</strong>` : `<a href="${enPath(countryPath(c.code))}">${esc(countryLabelEn(c))} (${c.races.length})</a>`))
    .join('')}</nav>`;
const topicNavEn = (current) =>
  `<h2>Marathons by Topic</h2><nav class="links" aria-label="By topic">${LANDINGS_EN.map((l) =>
    l.path === current ? `<strong>${esc(l.name)}</strong>` : `<a href="${l.path}">${esc(l.name)}</a>`,
  ).join('')}</nav>`;
const footNavEn = (path) => [monthNavEn(null), countryNavEn(null), topicNavEn(path)].join('\n');
const namesEn = (rs, n = 3) => rs.filter((r) => !isCancelled(r)).slice(0, n).map(raceNameEn).join(', ');
/** 설명 끝 'Including A, B, C.' — 이름이 없으면 뺀다 */
const etcEn = (rs) => (namesEn(rs) ? ` Including ${namesEn(rs)}.` : '');
const crumbsEn = (path, name) => [{ name: SITE_NAME_EN, path: '/en/' }, { name, path }];
const SELECT = 'Select a race to see its registration dates, entry fee and official website.';
const byMonthBodyEn = (rs, { split = true } = {}) => {
  const byM = new Map();
  for (const r of rs) byM.set(r.race_date.slice(0, 7), [...(byM.get(r.race_date.slice(0, 7)) ?? []), r]);
  return [...byM.entries()]
    .map(([ym, ms]) => {
      const head = `<h2><a href="${enPath(monthPath(ym))}">${monthLabelEn(ym)}</a> Marathons (${ms.length})</h2>`;
      if (!split) return `${head}<ul class="races">${ms.map(itemEn).join('')}</ul>`;
      const kr = ms.filter(isKr);
      const ab = ms.filter((r) => !isKr(r));
      return [
        head,
        kr.length ? `<h3>Korea (${kr.length})</h3><ul class="races">${kr.map(itemEn).join('')}</ul>` : '',
        ab.length ? `<h3>Abroad (${ab.length})</h3><ul class="races">${ab.map(itemEn).join('')}</ul>` : '',
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
    kr.length ? `<h2>${label} Races in Korea (${kr.length})</h2><ul class="races">${kr.map(itemEn).join('')}</ul>` : '',
    abroad.length ? `<h2>${label} Races Abroad (${abroad.length})</h2><ul class="races">${abroad.map(itemEn).join('')}</ul>` : '',
    monthNavEn(ym),
    countryNavEn(null),
    topicNavEn(null),
  ].join('\n');
  out(
    enPath(koPath),
    pageEn({
      koPath,
      title: `${label} Marathons — ${kr.length} in Korea, ${abroad.length} Abroad | ${SITE_NAME_EN}`,
      description: `Dates, locations, distances and registration windows for ${rs.length} marathons and trail races ${when} in ${label} (${kr.length} in Korea, ${abroad.length} abroad).${etcEn(rs)}`.slice(0, 160),
      h1: `${label} Marathons`,
      lead: `${kr.length} races in Korea and ${abroad.length} abroad ${when} in ${label}. ${SELECT}`,
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
  const trail = c.races.filter((r) => r.discipline === 'trail').length;
  const koPath = countryPath(c.code);
  const body = [
    ...[...byM.entries()].map(
      ([ym, rs]) => `<h2><a href="${enPath(monthPath(ym))}">${monthLabelEn(ym)}</a> — ${esc(name)} (${rs.length})</h2><ul class="races">${rs.map(itemEn).join('')}</ul>`,
    ),
    past.length ? `<h2>Past races (${past.length})</h2><ul class="races">${[...past].reverse().map(itemEn).join('')}</ul>` : '',
    countryNavEn(c.code),
    monthNavEn(null),
    topicNavEn(null),
  ].join('\n');
  out(
    enPath(koPath),
    pageEn({
      koPath,
      title: `Marathons in ${name}${ys ? ` ${ys}` : ''} — Race Dates & Registration | ${SITE_NAME_EN}`,
      description: `Dates, cities, distances, registration open and close dates, and official websites for ${c.races.length} marathon${trail ? ' and trail' : ''} races in ${name}.${etcEn(up)}`.slice(0, 160),
      h1: `Marathons in ${name}${ys ? ` ${ys}` : ''}`,
      lead: `${up.length} upcoming races in ${name}, sorted by date${trail ? ` (including ${trail} trail races)` : ''}. Select a race to see its entry type, fee and official website.`,
      crumbs: crumbsEn(enPath(koPath), `Marathons in ${name}`),
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
      title: `${y} Marathon Calendar — ${kr} in Korea, ${ab} Abroad | ${SITE_NAME_EN}`,
      description: `Dates, locations, distances and registration open and close dates for ${rs.length} marathons and trail races in ${y} (${kr} in Korea, ${ab} abroad), month by month.${etcEn(up.length ? up : rs)}`.slice(0, 160),
      h1: `${y} Marathon Calendar`,
      lead: `${kr} races in Korea and ${ab} abroad in ${y}, month by month${hasPast ? ' (including races already held)' : ''}. ${SELECT}`,
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
      description: `Dates, cities, distances, registration open and close dates, and lottery or first-come entry for ${rs.length} upcoming marathons and trail races in South Korea.${etcEn(rs)}`.slice(0, 160),
      h1: 'Marathons in South Korea',
      lead: `${rs.length} upcoming races in South Korea, sorted by date. Select a race to see its entry type, fee and official website.`,
      crumbs: crumbsEn(enPath(koPath), 'Marathons in South Korea'),
      body: [`<p><a href="${enPath(countryPath('kr'))}">Include past races (all marathons in South Korea)</a></p>`, byMonthBodyEn(rs, { split: false }), footNavEn(enPath(koPath))].join('\n'),
      list: rs,
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
      description: `Dates, cities, distances and lottery or first-come registration windows for ${rs.length} upcoming marathons and trail races in ${n} countries outside Korea.${etcEn(rs)}`.slice(0, 160),
      h1: 'Marathons Outside Korea',
      lead: `${rs.length} upcoming races in ${n} countries outside Korea, sorted by date. Select a race to see its entry type, fee and tour packages.`,
      crumbs: crumbsEn(enPath(koPath), 'Marathons Outside Korea'),
      body: [byMonthBodyEn(rs, { split: false }), footNavEn(enPath(koPath))].join('\n'),
      list: rs,
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
      description: `Dates, locations, distances and registration open and close dates for ${rs.length} upcoming trail races (${kr} in Korea, ${rs.length - kr} abroad).${etcEn(rs)}`.slice(0, 160),
      h1: 'Trail Races',
      lead: `${kr} upcoming trail races in Korea and ${rs.length - kr} abroad, sorted by date. Select a race to see its entry type, fee and official website.`,
      crumbs: crumbsEn(enPath(koPath), 'Trail Races'),
      body: [byMonthBodyEn(rs), footNavEn(enPath(koPath))].join('\n'),
      list: rs,
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
  const day = fmtEn(today).replace(/, \d{4}$/, '');
  out(
    enPath(koPath),
    pageEn({
      koPath,
      title: `${rs.length} Races Open for Registration — as of ${day} | ${SITE_NAME_EN}`,
      description: `Marathons and trail races open for registration as of ${day}: ${kr.length} in Korea and ${ab.length} abroad, sorted by closing date.${etcEn(rs)}`.slice(0, 160),
      h1: 'Races Open for Registration',
      lead: `${rs.length} races open for registration as of ${fmtEn(today)} (${kr.length} in Korea, ${ab.length} abroad), sorted by closing date. This list is rebuilt daily (as of the build date). First-come races can sell out before the closing date.`,
      crumbs: crumbsEn(enPath(koPath), 'Races Open for Registration'),
      body: [
        rs.length ? '' : '<p>No races are open for registration right now.</p>',
        kr.length ? `<h2>Open in Korea (${kr.length})</h2><ul class="races">${kr.map(itemEn).join('')}</ul>` : '',
        ab.length ? `<h2>Open Abroad (${ab.length})</h2><ul class="races">${ab.map(itemEn).join('')}</ul>` : '',
        footNavEn(enPath(koPath)),
      ].join('\n'),
      list: rs,
    }),
  );
}

console.log(`seo-pages: 월별 ${months.length}개, 나라별 ${countries.length}개, 검색어 랜딩 ${LANDINGS.length}개 목록 페이지 (한국어·영어 각각)`);
