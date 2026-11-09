/**
 * 빌드 뒤 이용약관 정적 페이지를 만든다: dist/terms.html (/terms), dist/en/terms.html (/en/terms).
 * 인용한 법 조항은 국가법령정보센터 원문으로 확인한 것만 (.duo-data/antiscrape-legal.md).
 * 조(條)는 <section id="…"> 하나씩이다 — 개인정보 처리 조항 등을 붙일 때는 SECTIONS 에 같은 꼴로 한 칸 더 넣는다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { ORIGIN, esc, headLinks } from './seo-lib.mjs';
import { TERMS_PATH, noticeHtml } from '../src/lib/notice.ts';

/** 시행일 */
const EFFECTIVE = { iso: '2026-11-09', ko: '2026년 11월 9일', en: 'November 9, 2026' };
const MAIL = 'marathon82@kakao.com';
const mail = `<a href="mailto:${MAIL}">${MAIL}</a>`;
const LAW = {
  copyright: 'https://www.law.go.kr/법령/저작권법',
  unfair: 'https://www.law.go.kr/법령/부정경쟁방지및영업비밀보호에관한법률',
  network: 'https://www.law.go.kr/법령/정보통신망이용촉진및정보보호등에관한법률',
};

const STYLE = `:root{color-scheme:light dark;--bg:#f1f2f4;--fg:#15171a;--mute:#5d636b;--line:#dcdfe3;--card:#fff;--link:#0b57d0}
@media (prefers-color-scheme:dark){:root{--bg:#0e0f11;--fg:#e8eaed;--mute:#9aa0a6;--line:#2a2d31;--card:#17191c;--link:#8ab4f8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 system-ui,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;word-break:keep-all}
a{color:var(--link)}header{display:flex;align-items:center;justify-content:space-between;gap:1rem;max-width:48rem;margin:0 auto;padding:1rem}
.brand{font-weight:800;font-size:1.1rem;text-decoration:none;color:var(--fg)}
main{max-width:48rem;margin:0 auto;padding:0 1rem 3rem}h1{font-size:1.6rem;line-height:1.3;margin:.5rem 0}
h2{font-size:1.1rem;margin:2rem 0 .5rem;padding-top:1rem;border-top:1px solid var(--line)}
.lead,.meta{color:var(--mute)}ol,ul{padding-left:1.4rem}li{margin:.25rem 0}
footer{max-width:48rem;margin:0 auto;padding:2rem 1rem;color:var(--mute);font-size:.9rem}`;

const SECTIONS = {
  ko: [
    {
      id: 'purpose',
      h: '제1조 (목적과 적용)',
      body: `<p>이 약관은 마라톤 캘린더(${ORIGIN}, 이하 “사이트”)와 사이트에 실린 대회 정보의 이용 조건을 정합니다. 회원 가입 여부와 관계없이 사이트에 접속하는 모든 사람과, 사람 대신 사이트에 접속하는 프로그램(크롤러·봇·스크립트 등)을 운영하는 자(이하 “이용자”)에게 적용됩니다.</p>`,
    },
    {
      id: 'database',
      h: '제2조 (대회 데이터베이스와 권리)',
      body: `<ol>
<li>사이트에 실린 국내·해외 마라톤·트레일러닝 대회 정보(대회명, 날짜, 장소, 종목, 접수 방식과 기간, 참가비, 공식 홈페이지 주소 등)와 그 목록·분류·검색 구성은 운영자가 직접 조사하고 계속 갱신·검증·보충해 만든 데이터베이스(이하 “대회 데이터베이스”)입니다.</li>
<li>대회 데이터베이스에 대한 권리는 운영자에게 있습니다. 운영자는 「저작권법」 제93조(데이터베이스제작자의 권리), 「부정경쟁방지 및 영업비밀보호에 관한 법률」 제2조 제1호 파목 등 관련 법령에 따른 보호를 주장합니다.</li>
</ol>`,
    },
    {
      id: 'data-use',
      h: '제3조 (데이터 이용 제한)',
      body: `<ol>
<li>누구든지 운영자의 사전 서면 허락 없이 다음 행위를 해서는 안 됩니다.
<ol>
<li>크롤링·스크래핑·봇·자동화된 스크립트, 사이트 화면을 거치지 않은 데이터 파일·API 직접 호출 등 자동화 수단으로 대회 데이터베이스의 전부 또는 일부를 수집하는 행위, 그리고 사이트가 적용한 접근 제한(접속 차단, 요청 횟수 제한 등)을 우회하는 행위</li>
<li>대회 데이터베이스의 전부 또는 상당한 부분을 복제·배포·전송하거나, 일부라도 반복적이거나 체계적으로 복제하는 행위</li>
<li>수집하거나 복제한 대회 정보를 다른 웹사이트·앱·서비스·데이터셋에 재배포하거나, 판매·광고 등 상업적으로 이용하는 행위</li>
</ol></li>
<li>사이트는 자동화 수단에 의한 접근을 허락하지 않습니다. 다만 검색 서비스가 검색 결과에 사이트를 보여 주기 위해 <a href="/robots.txt">robots.txt</a> 에 따라 공개 페이지를 수집·색인하는 것은 허락합니다.</li>
<li>사이트 화면에서 대회 정보를 보고 개인적으로 메모하거나, 대회 페이지 주소를 다른 사람에게 공유하는 것은 이 조의 제한을 받지 않습니다.</li>
</ol>`,
    },
    {
      id: 'enforcement',
      h: '제4조 (위반 시 조치)',
      body: `<ol>
<li>운영자는 제3조를 위반한 접속을 확인하면 미리 알리지 않고 그 접속(IP 주소, 프로그램 등)의 사이트 접근을 차단하거나 제한할 수 있습니다.</li>
<li>운영자는 위반 행위에 대하여 「저작권법」(제123조 침해의 정지 등 청구, 제125조 손해배상의 청구, 제136조 제3항 제3호), 「부정경쟁방지 및 영업비밀보호에 관한 법률」(제4조 금지청구, 제5조 손해배상), 「정보통신망 이용촉진 및 정보보호 등에 관한 법률」(제48조 제1항) 등 관련 법령에 따라 침해 정지·손해배상 청구, 고소 등 법적 조치를 할 수 있습니다.</li>
</ol>`,
    },
    {
      id: 'contact',
      h: '제5조 (이용 허락과 문의)',
      body: `<p>대회 정보를 제3조에서 제한하는 방법으로 이용하려면 이용 목적과 범위를 적어 ${mail} 로 문의해 주세요. 운영자가 서면(이메일 포함)으로 허락한 범위에서만 이용할 수 있습니다.</p>`,
    },
    {
      id: 'addendum',
      h: '부칙',
      body: `<p>이 약관은 ${EFFECTIVE.ko}부터 시행합니다.</p>
<p class="meta">관련 법령 원문: <a href="${LAW.copyright}">저작권법</a> · <a href="${LAW.unfair}">부정경쟁방지 및 영업비밀보호에 관한 법률</a> · <a href="${LAW.network}">정보통신망 이용촉진 및 정보보호 등에 관한 법률</a> (국가법령정보센터)</p>`,
    },
  ],
  en: [
    {
      id: 'purpose',
      h: 'Article 1 (Purpose and Scope)',
      body: `<p>These Terms set out the conditions for using Marathon Calendar (${ORIGIN}, the “Site”) and the race information on it. They apply to everyone who accesses the Site, whether or not they have an account, and to anyone who operates a program (crawler, bot, script, etc.) that accesses the Site on their behalf (each a “User”).</p>`,
    },
    {
      id: 'database',
      h: 'Article 2 (Race Database and Rights)',
      body: `<ol>
<li>The marathon and trail race information on the Site (race names, dates, locations, distances, entry type and registration windows, entry fees, official website addresses, etc.) and the way it is listed, categorized and searchable form a database that the operator researches and keeps updating, verifying and supplementing (the “Race Database”).</li>
<li>The rights to the Race Database belong to the operator. The operator asserts the protection given by Article 93 of the Korean Copyright Act (rights of database producers), Article 2(1)(pa) of the Unfair Competition Prevention and Trade Secret Protection Act and other applicable laws.</li>
</ol>`,
    },
    {
      id: 'data-use',
      h: 'Article 3 (Restrictions on Use of Data)',
      body: `<ol>
<li>No one may do any of the following without the operator’s prior written permission:
<ol>
<li>Collect all or part of the Race Database by automated means, such as crawling, scraping, bots, automated scripts, or calling data files or APIs directly without going through the Site’s pages; or circumvent access restrictions applied by the Site (blocking, rate limits, etc.).</li>
<li>Copy, distribute or transmit all or a substantial part of the Race Database, or copy any part of it repeatedly or systematically.</li>
<li>Redistribute collected or copied race information on other websites, apps, services or datasets, or use it commercially, for example by selling it or using it for advertising.</li>
</ol></li>
<li>The Site does not permit access by automated means. However, search services may collect and index public pages in accordance with <a href="/robots.txt">robots.txt</a> in order to show the Site in search results.</li>
<li>Viewing race information on the Site and taking personal notes, or sharing the address of a race page with others, is not restricted by this Article.</li>
</ol>`,
    },
    {
      id: 'enforcement',
      h: 'Article 4 (Measures Against Violations)',
      body: `<ol>
<li>If the operator finds access that violates Article 3, it may block or restrict that access (IP address, program, etc.) without prior notice.</li>
<li>The operator may take legal action against violations under the Copyright Act (Article 123 claims to stop infringement, Article 125 claims for damages, Article 136(3)(iii)), the Unfair Competition Prevention and Trade Secret Protection Act (Article 4 injunctions, Article 5 damages), the Act on Promotion of Information and Communications Network Utilization and Information Protection (Article 48(1)) and other applicable laws, including claims to stop the infringement, claims for damages and criminal complaints.</li>
</ol>`,
    },
    {
      id: 'contact',
      h: 'Article 5 (Permission and Contact)',
      body: `<p>To use race information in a way restricted by Article 3, contact ${mail} with the purpose and scope of the use. You may use it only within the scope the operator permits in writing (including by email).</p>`,
    },
    {
      id: 'addendum',
      h: 'Addendum',
      body: `<p>These Terms take effect on ${EFFECTIVE.en}.</p>
<p>These Terms are a translation of the Korean version. If the two differ, the <a href="${TERMS_PATH.ko}">Korean version</a> prevails.</p>`,
    },
  ],
};

const TEXT = {
  ko: {
    title: '이용약관 | 마라톤 캘린더',
    h1: '이용약관',
    desc: '마라톤 캘린더 이용약관: 대회 정보 데이터베이스의 권리와 자동 수집·무단 복제·재배포 금지, 위반 시 조치.',
    site: '마라톤 캘린더',
    home: '/',
    back: '전체 일정·검색',
    lead: `시행일 ${EFFECTIVE.ko}`,
  },
  en: {
    title: 'Terms of Use | Marathon Calendar',
    h1: 'Terms of Use',
    desc: 'Marathon Calendar Terms of Use: rights in the race database, the ban on automated collection, unauthorized copying and redistribution, and measures against violations.',
    site: 'Marathon Calendar',
    home: '/en/',
    back: 'All races & search',
    lead: `Effective ${EFFECTIVE.en}`,
  },
};

function page(lang) {
  const x = TEXT[lang];
  const url = `${ORIGIN}${TERMS_PATH[lang]}`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(x.title)}</title>
<meta name="description" content="${esc(x.desc)}">
<link rel="canonical" href="${url}">
${headLinks(url, { ko: `${ORIGIN}${TERMS_PATH.ko}`, en: `${ORIGIN}${TERMS_PATH.en}` })}
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f1f2f4">
<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0e0f11">
<style>${STYLE}</style>
</head>
<body>
<header><a class="brand" href="${x.home}">${esc(x.site)}</a><a href="${x.home}">${esc(x.back)}</a></header>
<main>
<h1>${esc(x.h1)}</h1>
<p class="lead">${esc(x.lead)} · <a href="${TERMS_PATH[lang === 'ko' ? 'en' : 'ko']}" hreflang="${lang === 'ko' ? 'en' : 'ko'}">${lang === 'ko' ? 'English' : '한국어'}</a></p>
${SECTIONS[lang].map((s) => `<section id="${s.id}">\n<h2>${esc(s.h)}</h2>\n${s.body}\n</section>`).join('\n')}
</main>
<footer><a href="${x.home}">${esc(x.site)}</a> — ${lang === 'ko' ? '문의' : 'Contact'} ${mail}${noticeHtml(lang)}</footer>
</body>
</html>
`;
}

mkdirSync(new URL('../dist/en/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/terms.html', import.meta.url), page('ko'));
writeFileSync(new URL('../dist/en/terms.html', import.meta.url), page('en'));
console.log(`terms: /terms, /en/terms (시행 ${EFFECTIVE.iso})`);
