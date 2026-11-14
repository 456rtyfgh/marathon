/**
 * 빌드 뒤 사이트 설명 정적 페이지를 만든다: dist/about/·dist/faq/ (한국어), dist/en/about/·dist/en/faq/ (영어).
 * 글 내용·구조화 데이터는 scripts/info-lib.mjs. 틀과 스타일은 이용약관 페이지(scripts/terms.mjs)처럼 가벼운 자체 틀 —
 * 색은 기존 회색·흰색·링크 파랑 변수만 쓴다. 본문은 접지 않고 질문마다 h2 + 답 본문.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { ORIGIN, enPath, esc, headLinks, ldJson, weekend } from './seo-lib.mjs';
import { INFO_PATHS, INFO_UPDATED, aboutContent, faqContent, hasLanding, orgLd, plain } from './info-lib.mjs';
import { noticeHtml } from '../src/lib/notice.ts';
import { CONTACT_EMAIL } from '../src/lib/policy.ts';

// 휴대폰: 링크 줄 높이 44px 이상, 긴 문장·주소는 칸 안에서 꺾는다(overflow-wrap). 약관 페이지 STYLE 과 같은 변수.
const STYLE = `:root{color-scheme:light dark;--bg:#f1f2f4;--fg:#15171a;--mute:#5d636b;--line:#dcdfe3;--card:#fff;--link:#0b57d0}
@media (prefers-color-scheme:dark){:root{--bg:#0e0f11;--fg:#e8eaed;--mute:#9aa0a6;--line:#2a2d31;--card:#17191c;--link:#8ab4f8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;word-break:keep-all;overflow-wrap:anywhere}
a{color:var(--link)}header{display:flex;align-items:center;justify-content:space-between;gap:1rem;max-width:48rem;margin:0 auto;padding:.5rem 1rem}
header a{display:inline-flex;align-items:center;min-height:44px}.brand{font-weight:800;font-size:1.1rem;text-decoration:none;color:var(--fg)}
main{max-width:48rem;margin:0 auto;padding:0 1rem 3rem}h1{font-size:1.6rem;line-height:1.3;margin:.5rem 0}
h2{font-size:1.1rem;line-height:1.45;margin:2rem 0 .5rem;padding-top:1rem;border-top:1px solid var(--line)}
.crumb,.lead,.meta{color:var(--mute)}.crumb{font-size:.9rem;margin:.25rem 0}.crumb a{display:inline-flex;align-items:center;min-height:44px}
ul{padding-left:1.4rem}li{margin:.35rem 0}main p a,main li a{padding:.5rem 0}
nav.links{display:flex;flex-wrap:wrap;gap:0 .1rem;margin:0 -.4rem;font-size:.95rem}nav.links a,nav.links strong{display:inline-flex;align-items:center;min-height:44px;padding:0 .4rem}
footer{max-width:48rem;margin:0 auto;padding:1rem 1rem 2rem;color:var(--mute);font-size:.9rem}footer a{padding:.5rem 0}footer p{margin:.5rem 0}`;

const T = {
  ko: { home: '/', site: '마라톤 캘린더', back: '전체 일정·검색', homeCrumb: '마라톤 캘린더', other: 'English', locale: 'ko_KR', terms: '/terms', termsLabel: '이용약관' },
  en: { home: '/en/', site: 'Marathon Calendar', back: 'All races & search', homeCrumb: 'Marathon Calendar', other: '한국어', locale: 'en_US', terms: '/en/terms', termsLabel: 'Terms of Use' },
};
const hasPublic = (p) => existsSync(new URL(`../public${p}`, import.meta.url));
const pathFor = (path, lang) => (lang === 'en' ? enPath(path) : path);

/** 페이지 아래 이동 링크: about ↔ faq, 국내·해외·트레일, 약관, 언어 전환 (있는 페이지만) */
const footLinks = (lang, current) => {
  const x = T[lang];
  const L = (path, ko, en) => (path === current ? `<strong>${esc(lang === 'ko' ? ko : en)}</strong>` : `<a href="${pathFor(path, lang)}">${esc(lang === 'ko' ? ko : en)}</a>`);
  return [
    L(INFO_PATHS.about, '마라톤 캘린더란', 'About'),
    L(INFO_PATHS.faq, '자주 묻는 질문', 'FAQ'),
    L('/kr/', '국내 마라톤', 'Korea'),
    L('/abroad/', '해외 마라톤', 'Abroad'),
    L('/trail/', '트레일러닝', 'Trail'),
    ...(hasLanding('/entry-open/') ? [L('/entry-open/', '접수 중', 'Open now')] : []),
    ...(weekend.races.length && hasLanding('/weekend/') ? [L('/weekend/', '이번 주말', 'This weekend')] : []),
    `<a href="${x.terms}">${esc(x.termsLabel)}</a>`,
    `<a href="${pathFor(current, lang === 'ko' ? 'en' : 'ko')}" hreflang="${lang === 'ko' ? 'en' : 'ko'}">${esc(x.other)}</a>`,
  ].join('');
};

function render(lang, c, ld, bodyHtml) {
  const x = T[lang];
  const url = `${ORIGIN}${pathFor(c.path, lang)}`;
  const alt = { ko: `${ORIGIN}${c.path}`, en: `${ORIGIN}${enPath(c.path)}` };
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(c.title)}</title>
<meta name="description" content="${esc(c.description)}">
<link rel="canonical" href="${url}">
${headLinks(url, alt)}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
${hasPublic('/apple-touch-icon.png') ? '<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n' : ''}<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f1f2f4">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0e0f11">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(x.site)}">
<meta property="og:locale" content="${x.locale}">
<meta property="og:title" content="${esc(c.title)}">
<meta property="og:description" content="${esc(c.description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<style>${STYLE}</style>
${ld.map(ldJson).join('\n')}
</head>
<body>
<header><a class="brand" href="${x.home}">${esc(x.site)}</a><a href="${x.home}">${esc(x.back)}</a></header>
<main>
<p class="crumb"><a href="${x.home}">${esc(x.homeCrumb)}</a> › ${esc(c.crumb)}</p>
<h1>${esc(c.h1)}</h1>
<p class="lead">${esc(c.lead)}</p>
${bodyHtml}
<nav class="links" aria-label="${lang === 'ko' ? '이동' : 'More pages'}">${footLinks(lang, c.path)}</nav>
</main>
<footer><p>${lang === 'ko' ? '문의' : 'Contact'} <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a> · ${lang === 'ko' ? '내용을 고친 날' : 'Last updated'} ${INFO_UPDATED}</p>${noticeHtml(lang)}</footer>
</body>
</html>
`;
}

const breadcrumb = (lang, c) => ({
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: T[lang].homeCrumb, item: `${ORIGIN}${T[lang].home}` },
    { '@type': 'ListItem', position: 2, name: c.crumb, item: `${ORIGIN}${pathFor(c.path, lang)}` },
  ],
});

const out = (path, html) => {
  const dir = new URL(`../dist${path}`, import.meta.url);
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('index.html', dir), html);
};

const sections = (c) => c.sections.map((s) => `<section id="${s.id}">\n<h2>${esc(s.h)}</h2>\n${s.html}\n</section>`).join('\n');
const faqBody = (c) => c.items.map((it, i) => `<section id="q${i + 1}">\n<h2>${esc(it.q)}</h2>\n${it.a}\n</section>`).join('\n');

let made = 0;
for (const lang of ['ko', 'en']) {
  const url = (c) => `${ORIGIN}${pathFor(c.path, lang)}`;

  const about = aboutContent(lang);
  // 사이트 운영 주체(Organization)는 홈과 이 페이지에만 전체 정의를 둔다 (같은 @id)
  const { '@context': _ctx, ...org } = orgLd(lang);
  const aboutLd = [
    breadcrumb(lang, about),
    { '@context': 'https://schema.org', '@type': 'AboutPage', '@id': `${url(about)}#webpage`, url: url(about), name: about.title, description: about.description, inLanguage: lang, dateModified: INFO_UPDATED, mainEntity: org },
  ];
  out(pathFor(about.path, lang), render(lang, about, aboutLd, sections(about)));

  const faq = faqContent(lang);
  if (faq.items.length < 8 || faq.items.length > 12) throw new Error(`info-pages: FAQ 질문 수 ${faq.items.length} (8~12개여야 함)`);
  const faqLd = [
    breadcrumb(lang, faq),
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      '@id': `${url(faq)}#faq`,
      url: url(faq),
      inLanguage: lang,
      mainEntity: faq.items.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: plain(it.a) } })),
    },
  ];
  out(pathFor(faq.path, lang), render(lang, faq, faqLd, faqBody(faq)));
  made += 2;
  for (const c of [about, faq]) if ([...c.description].length > 160) console.warn(`info-pages: 경고 — ${lang} ${c.path} description ${[...c.description].length}자 (160자 초과)`);
}
console.log(`info-pages: ${made}개 (/about/·/faq/ 한국어·영어), FAQ ${faqContent('ko').items.length}개`);
