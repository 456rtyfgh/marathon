/**
 * 빌드 뒤 크롤링용 정적 목록 페이지를 만든다: dist/m/YYYY-MM/index.html (월별), dist/c/<나라>/index.html (나라별).
 * 첫 화면은 React 앱이라 검색엔진이 대회 페이지(/r/id)로 가는 링크를 다 못 따라갈 수 있어, 자바스크립트 없이
 * 읽히는 가벼운 HTML 로 모든 대회 링크를 깔아 둔다. _routes.json 밖이라 함수를 안 쓴다(정적 파일).
 * SPA 껍데기를 쓰지 않는 이유: React 가 뜨면 /m/… 에서도 홈 목록으로 바뀌어 canonical 과 본문이 어긋난다.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import {
  ORIGIN, ENTRY, countries, countryPath, esc, fmt, isCancelled, ldJson, monthLabel, monthPath, months, races, svgSize, today, whereOf,
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
<footer><a href="/">마라톤 캘린더</a> — 국내·해외 마라톤·트레일러닝 대회 일정과 접수 기간. 날짜·접수 기간은 바뀔 수 있으니 공식 홈페이지에서 한 번 더 확인하세요.</footer>
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

console.log(`seo-pages: 월별 ${months.length}개, 나라별 ${countries.length}개 목록 페이지`);
