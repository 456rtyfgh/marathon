/**
 * 사이트 설명 글(/about/·/faq/)의 내용과 사이트 전체 구조화 데이터(Organization·WebSite)를 한 곳에서 만든다.
 * scripts/info-pages.mjs (페이지), scripts/prerender.mjs (홈 구조화 데이터·빙 meta), scripts/sitemap.mjs, scripts/geo-check.mjs 가 쓴다.
 * 모든 수치는 public/data.json 에서 계산한다(하드코딩 금지). 글에 쓴 기능 설명은 src/ 의 실제 동작을 확인해 적었다(주석에 근거).
 */
import { CONTACT_EMAIL } from '../src/lib/policy.ts';
import { LANDINGS, ORIGIN, countries, distancePages, enPath, esc, fmt, fmtEn, races, regionPages, today, upcoming, weekend, years } from './seo-lib.mjs';

export const ORG_ID = `${ORIGIN}/#organization`;
/** about/faq 본문을 고친 날. 글을 고칠 때만 손으로 바꾼다 — today 로 두면 매일 lastmod 가 바뀌어 IndexNow 가 날마다 다시 보낸다 */
export const INFO_UPDATED = '2026-11-14';
export const INFO_PATHS = { about: '/about/', faq: '/faq/' };
/** sitemap 에 넣을 about/faq (한국어 + 영어) */
export const INFO_PAGES = [
  ...Object.values(INFO_PATHS).map((path) => ({ path, lastmod: INFO_UPDATED })),
  ...Object.values(INFO_PATHS).map((path) => ({ path: enPath(path), lastmod: INFO_UPDATED })),
];
/**
 * 빙 웹마스터 도구 소유 확인 값(meta msvalidate.01 의 content). 사용자가 나중에 등록해 채운다 — 빈 값이면 prerender 가 태그를 출력하지 않는다.
 * 환경변수 BING_SITE_VERIFICATION(deploy.yml 의 저장소 변수)이 있으면 그 값이 우선한다.
 * 빙은 구글 서치콘솔에서 가져오기로 등록할 수도 있어 BingSiteAuth.xml 파일은 만들지 않는다.
 */
export const BING_SITE_VERIFICATION = '';
export const bingVerification = () => (process.env.BING_SITE_VERIFICATION || BING_SITE_VERIFICATION || '').trim();

export const INSTAGRAM_URL = 'https://www.instagram.com/marathon.82/';
// 런약사 유튜브 채널 주소는 확실하지 않아 sameAs·링크에 넣지 않는다(소개 문장에 이름만). 확정되면 SAME_AS 에 추가.
const SAME_AS = [INSTAGRAM_URL];

// ── 구조화 데이터: Organization 은 홈(ko·en)과 /about/(ko·en) 에만, WebSite 는 홈에만 ──
const ORG_TEXT = {
  ko: { name: '마라톤 캘린더', alternateName: ['마라톤82', 'Marathon Calendar'], contactType: '고객 문의' },
  en: { name: 'Marathon Calendar', alternateName: ['마라톤 캘린더', '마라톤82'], contactType: 'customer support' },
};
export const orgLd = (lang) => {
  const t = ORG_TEXT[lang];
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORG_ID,
    name: t.name,
    alternateName: t.alternateName,
    url: `${ORIGIN}/`,
    logo: `${ORIGIN}/brand/logo-512.png`,
    email: CONTACT_EMAIL,
    contactPoint: { '@type': 'ContactPoint', contactType: t.contactType, email: CONTACT_EMAIL },
    sameAs: SAME_AS,
  };
};
const WEBSITE_TEXT = {
  ko: {
    name: '마라톤 캘린더',
    alternateName: ['마라톤캘린더', '마라톤82', 'Marathon Calendar', 'marathon82'],
    home: `${ORIGIN}/`,
    description: '국내·해외 마라톤 대회 일정과 접수 기간, 참가비, 여행사 패키지를 모은 사이트',
  },
  en: {
    name: 'Marathon Calendar',
    alternateName: ['마라톤 캘린더', '마라톤캘린더', '마라톤82', 'marathon82'],
    home: `${ORIGIN}/en/`,
    description: 'Marathon race dates, registration windows, entry fees and tour packages for races in Korea and worldwide',
  },
};
/** SearchAction 은 앱이 실제로 읽는 검색 주소(?q=, src/App.tsx)만 쓴다 */
export const websiteLd = (lang) => {
  const t = WEBSITE_TEXT[lang];
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${t.home}#website`,
    name: t.name,
    alternateName: t.alternateName,
    url: t.home,
    inLanguage: lang,
    description: t.description,
    publisher: { '@id': ORG_ID },
    potentialAction: { '@type': 'SearchAction', target: `${t.home}?q={search_term_string}`, 'query-input': 'required name=search_term_string' },
  };
};

// ── 수치 (data.json 에서 계산) ──
const isKr = (r) => r.country_code === 'KR';
const num = (n) => n.toLocaleString('en-US');
export const facts = (() => {
  const kr = races.filter(isKr).length;
  const abroadCodes = new Set(races.filter((r) => !isKr(r) && r.country_code).map((r) => r.country_code));
  return {
    total: races.length,
    upcoming: upcoming.length,
    kr,
    abroad: races.length - kr,
    abroadCountries: abroadCodes.size,
    trail: races.filter((r) => r.discipline === 'trail').length,
    // 연도별 대회 수 (오늘 연도 이후만, 최대 2개 — FAQ 의 '2026·2027 일정')
    yearCounts: years
      .filter((y) => y >= today.slice(0, 4))
      .slice(0, 2)
      .map((y) => ({ y, n: races.filter((r) => r.race_date.startsWith(y)).length })),
  };
})();
export const hasLanding = (path) => LANDINGS.some((l) => l.path === path);

// ── 글 조각 ──
const a = (path, text, lang) => `<a href="${lang === 'en' ? enPath(path) : path}">${esc(text)}</a>`;
const mail = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;
const ig = `<a href="${INSTAGRAM_URL}" rel="noopener">@marathon.82</a>`;
const terms = { ko: '/terms', en: '/en/terms' };

/** 태그를 떼고 엔티티를 풀어 JSON-LD·description 용 글로 */
export const plain = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();

/** 연도 묶음 '2026·2027' */
const yearsText = (lang) => facts.yearCounts.map((c) => c.y).join(lang === 'en' ? '–' : '·');

// ── /about/ ──
export function aboutContent(lang) {
  const f = facts;
  if (lang === 'ko') {
    return {
      path: INFO_PATHS.about,
      title: '마라톤 캘린더(마라톤82)란? 소개·범위·정보 확인 방법 | 마라톤 캘린더',
      description: `마라톤 캘린더(마라톤82)는 국내·해외 마라톤·트레일러닝 대회 ${num(f.total)}개의 날짜와 접수 방식·접수 기간을 모은 사이트입니다. 정보 확인 방법과 '예상' 표시 규칙, 운영자, 연락 방법.`,
      h1: '마라톤 캘린더(마라톤82)란',
      lead: '무엇을 하는 사이트인지, 어떤 대회를 다루는지, 정보를 어떻게 확인하는지 정리했습니다.',
      crumb: '마라톤 캘린더란',
      sections: [
        {
          id: 'what',
          h: '무엇을 하는 사이트인가요',
          html: `<p>마라톤 캘린더(마라톤82, 영문명 Marathon Calendar)는 국내·해외 마라톤·트레일러닝 대회의 날짜와 접수 정보를 한곳에 모아 대회 날짜순으로 보여 주는 사이트입니다.</p>
<p>대회마다 날짜·장소·종목·접수 방식(추첨·선착순·기록 기준·여행사 전용·상시 접수)·접수 시작일과 마감일·참가비·공식 홈페이지 주소를 정리하고, 로그인한 회원에게는 접수 시작·마감 전에 이메일로 알려 주는 접수 알림을 제공합니다. 해외 대회는 여행사 패키지와 예상 경비도 볼 수 있습니다.</p>`,
        },
        {
          id: 'scope',
          h: '다루는 범위',
          html: `<ul>
<li>등록된 대회 ${num(f.total)}개 (이미 끝난 대회 포함, 오늘 이후 대회는 ${num(f.upcoming)}개)</li>
<li>국내 ${num(f.kr)}개 — ${a('/kr/', '국내 마라톤 일정', lang)}</li>
<li>해외 ${num(f.abroad)}개, ${num(f.abroadCountries)}개 나라·지역 — ${a('/abroad/', '해외 마라톤 일정', lang)}</li>
<li>트레일러닝 ${num(f.trail)}개 (국내·해외 합계) — ${a('/trail/', '트레일러닝 대회 일정', lang)}</li>
</ul>
<p>수치는 이 글을 만든 시점(${fmt(today)})의 사이트 데이터를 센 값입니다. 모든 대회를 빠짐없이 담았다고 말할 수는 없고, 목록에 없는 대회는 아래 방법으로 알려 주시면 확인해서 넣습니다.</p>`,
        },
        {
          id: 'verify',
          h: '정보는 어떻게 확인하나요',
          html: `<ul>
<li>대회 날짜·접수 일정은 대회 공식 홈페이지와 접수처 공지를 보고 넣고, 대회 페이지마다 공식 홈페이지 주소를 링크로 둡니다.</li>
<li>대회 상세의 ‘정보 확인’ 날짜는 그 대회 정보를 마지막으로 확인한 날입니다.</li>
<li>일정과 접수 기간은 주최 측 사정으로 바뀔 수 있으니, 신청하기 전에 공식 홈페이지에서 한 번 더 확인해 주세요.</li>
</ul>`,
        },
        {
          id: 'expected',
          h: '‘예상’ 표시 규칙',
          html: `<ul>
<li>대회 날짜가 아직 공식 발표되지 않았으면 날짜 옆에 ‘날짜 예상’이라고 적습니다. 지난 대회를 바탕으로 짐작한 값입니다.</li>
<li>접수 일정이 공식 확정 전이면 ‘예상 …’으로 따로 적고, ‘접수 중’·‘접수 예정’으로 나누지 않고 ‘일정 미공개’로 둡니다. 예상 날짜로는 접수 알림도 보내지 않습니다.</li>
<li>취소·중단된 대회는 ‘대회 취소’, 정원이 차서 접수가 끝난 대회는 ‘조기 마감’으로 표시합니다.</li>
</ul>
<p>자세한 질문은 ${a(INFO_PATHS.faq, '자주 묻는 질문', lang)}에 모아 두었습니다.</p>`,
        },
        {
          id: 'update',
          h: '얼마나 자주 갱신하나요',
          html: `<p>대회 목록은 매일 새벽 3시 23분(한국 시간)에 데이터베이스에서 새로 읽어 사이트에 다시 반영합니다. 이는 반영 주기이며 모든 대회를 매일 확인한다는 뜻은 아닙니다. 대회별 확인일은 각 대회 페이지의 ‘정보 확인’에서 볼 수 있습니다. 목록에 없는 대회의 추가 요청은 매주 월요일 일정을 확인할 때 함께 넣습니다.</p>`,
        },
        {
          id: 'operator',
          h: '누가 운영하나요',
          html: `<p>엄마를 위해 만든 사이트를 학생 개발자 한 명이 혼자 운영하고 있습니다. 런약사 유튜브 채널에 소개된 적이 있습니다.</p>`,
        },
        {
          id: 'contact',
          h: '연락·제보',
          html: `<ul>
<li>문의·정보 정정: ${mail}</li>
<li>인스타그램: ${ig}</li>
<li>목록에 없는 대회: 사이트에 로그인한 뒤 ‘대회 추가 요청’으로 보내 주세요.</li>
<li>조기 마감된 대회: 대회 상세의 ‘마감됐어요 제보’로 알려 주세요.</li>
</ul>
<p>이용 조건은 <a href="${terms.ko}">이용약관</a>에 있습니다. 대회 정보의 자동 수집·무단 복제·재배포는 금지합니다.</p>`,
        },
      ],
    };
  }
  return {
    path: INFO_PATHS.about,
    title: 'About Marathon Calendar — Scope, Data Checks and Contact | Marathon Calendar',
    description: `Marathon Calendar (marathon82) lists dates and registration windows for ${num(f.total)} marathons and trail races in Korea and abroad. How data is checked, and contact.`,
    h1: 'About Marathon Calendar (marathon82)',
    lead: 'What this site does, which races it covers, and how the information is checked.',
    crumb: 'About',
    sections: [
      {
        id: 'what',
        h: 'What the site does',
        html: `<p>Marathon Calendar (also written 마라톤 캘린더 or 마라톤82 in Korean, marathon82 online) gathers the dates and registration details of marathons and trail races in Korea and abroad in one place, in race-date order.</p>
<p>For each race it lists the date, place, distances, how entry works (lottery, first-come, qualifying time, tour-operator only, or open entry), registration open and close dates, the entry fee and a link to the official website. Signed-in members can get email alerts before registration opens or closes. For races abroad you can also see tour packages and estimated costs.</p>`,
      },
      {
        id: 'scope',
        h: 'What it covers',
        html: `<ul>
<li>${num(f.total)} races registered, including races that have already taken place (${num(f.upcoming)} are today or later)</li>
<li>${num(f.kr)} in Korea — ${a('/kr/', 'Marathons in South Korea', lang)}</li>
<li>${num(f.abroad)} abroad, across ${num(f.abroadCountries)} countries and regions — ${a('/abroad/', 'Marathons Outside Korea', lang)}</li>
<li>${num(f.trail)} trail races, in Korea and abroad combined — ${a('/trail/', 'Trail Races', lang)}</li>
</ul>
<p>These figures were counted from the site data when this page was written (${fmtEn(today)}). We cannot claim to list every race; if one is missing, tell us as described below and we will check it and add it.</p>`,
      },
      {
        id: 'verify',
        h: 'How information is checked',
        html: `<ul>
<li>Race dates and registration schedules are entered from the race’s official website and the registration page notices, and every race page links to the official website.</li>
<li>“Last checked” on a race page is the date its information was last verified.</li>
<li>Dates and registration windows can change at the organizer’s discretion, so check the official website once more before you sign up.</li>
</ul>`,
      },
      {
        id: 'expected',
        h: 'What “expected” means',
        html: `<ul>
<li>If a race date has not been officially announced, the page says “date expected”. It is an estimate based on previous editions.</li>
<li>If a registration schedule is not yet official, it is shown as “Expected …” and the race is listed as “Dates TBA” rather than “Open” or “Opens soon”. No registration alerts are sent for an expected date.</li>
<li>Cancelled races are marked “Cancelled”, and races that filled up are marked “Sold out”.</li>
</ul>
<p>More answers are in the ${a(INFO_PATHS.faq, 'FAQ', lang)}.</p>`,
      },
      {
        id: 'update',
        h: 'How often it is updated',
        html: `<p>The race list is re-read from the database and republished every day at 03:23 Korea time. That is how often the site is refreshed, not a promise that every race is re-checked daily; each race page shows its own “Last checked” date. Requests to add missing races are handled when we update the calendar every Monday.</p>`,
      },
      {
        id: 'operator',
        h: 'Who runs it',
        html: `<p>The site started as something built for my mom and is run by one student developer. It has been featured on the YouTube channel 런약사 (Runyaksa).</p>`,
      },
      {
        id: 'contact',
        h: 'Contact and reports',
        html: `<ul>
<li>Questions and corrections: ${mail}</li>
<li>Instagram: ${ig}</li>
<li>A race that is missing: sign in and use “Suggest a race”.</li>
<li>A race that sold out early: use “Report as full” on the race page to tell us.</li>
</ul>
<p>The conditions of use are in the <a href="${terms.en}">Terms of Use</a>. Automated collection, unauthorized copying and redistribution of race information are prohibited.</p>`,
      },
    ],
  };
}

// ── /faq/ ──
export function faqContent(lang) {
  const f = facts;
  const ys = f.yearCounts;
  const yl = yearsText(lang);
  const yearLinks = (l) => ys.map((c) => a(`/${c.y}/`, l === 'en' ? `${c.y} Marathon Calendar` : `${c.y} 마라톤 일정`, l)).join(l === 'en' ? ', ' : ' · ');
  const yearCountsKo = ys.map((c) => `${c.y}년 ${num(c.n)}개`).join(', ');
  const yearCountsEn = ys.map((c) => `${num(c.n)} in ${c.y}`).join(', ');
  const open = hasLanding('/entry-open/');
  const wk = weekend.races.length > 0 && hasLanding('/weekend/');
  const sample = regionPages[0];
  const full = distancePages.find((d) => d.bucket === 'full');
  const half = distancePages.find((d) => d.bucket === 'half');
  const d10 = distancePages.find((d) => d.bucket === '10k');

  if (lang === 'ko') {
    const distLinks = [full, half, d10].filter(Boolean).map((d) => a(d.path, d.name, lang));
    const regionLine = sample ? `${a(sample.path, `${sample.name} 마라톤`, lang)}처럼 시·도 이름으로 나뉜 페이지도 있습니다.` : '';
    const items = [
      {
        q: `${yl} 마라톤 일정은 어디서 보나요?`,
        a: `<p>${yearLinks('ko')}에서 연도별로 볼 수 있습니다. 지금 사이트에 등록된 대회는 ${yearCountsKo}입니다. 날짜순 전체 목록과 검색은 ${a('/', '홈', lang)}에서 합니다.</p>`,
      },
      {
        q: '국내 대회만, 또는 지역·거리별로 볼 수 있나요?',
        a: `<p>${a('/kr/', '국내 마라톤 일정', lang)}에서 국내 대회만 볼 수 있고, ${regionLine}${distLinks.length ? ` 거리별로는 ${distLinks.join(' · ')} 페이지가 있습니다.` : ''}${wk ? ` 이번 주 토·일 대회는 ${a('/weekend/', '이번 주말 마라톤', lang)}에 모았습니다.` : ''}</p>`,
      },
      {
        q: '날짜 옆의 ‘예상’은 무슨 뜻인가요?',
        a: `<p>대회 날짜나 접수 일정이 아직 공식 발표되지 않아, 지난 대회를 바탕으로 짐작한 값이라는 뜻입니다. 예상 값은 바뀔 수 있으니 신청 전에 공식 홈페이지를 확인해 주세요. 자세한 규칙은 ${a(INFO_PATHS.about, '마라톤 캘린더란', lang)}에 적었습니다.</p>`,
      },
      {
        q: '‘일정 미공개’(접수 미정)는 무슨 뜻인가요?',
        a: `<p>접수 일정이 공식 확정되기 전이라는 뜻입니다. 이런 대회는 예상 날짜가 있어도 ‘접수 중’이나 ‘접수 예정’으로 분류하지 않고, 예상 날짜로 접수 알림도 보내지 않습니다. 공식 일정이 나오면 정보가 바뀌고 그때부터 알림을 받을 수 있습니다.</p>`,
      },
      {
        q: '지금 접수 중인 대회는 어디서 보나요?',
        a: open
          ? `<p>${a('/entry-open/', '지금 접수 중인 대회', lang)}에서 오늘 접수 중인 대회를 볼 수 있습니다. 홈에서는 ‘접수 상태’ 필터에서 ‘접수 중’을 고르면 같은 기준으로 볼 수 있습니다.</p>`
          : `<p>${a('/', '홈', lang)}의 ‘접수 상태’ 필터에서 ‘접수 중’을 고르면 오늘 접수 중인 대회만 볼 수 있습니다.</p>`,
      },
      {
        q: '접수 알림은 어떻게 받나요?',
        a: `<p>사이트에 회원으로 로그인한 뒤 대회 상세의 ‘알림’ 탭에서 신청합니다. 접수 시작일 또는 마감일 30일·14일·7일·3일·1일 전 중에서 알림 시점을 고르면 회원 이메일로 알려 드리고, 휴대폰 알림을 켜면 같은 때에 기기로도 알려 드립니다. 접수 일정이 확정되기 전인 대회는 공개된 뒤에 알려 드립니다. 취소되었거나 이미 마감된 대회는 신청할 수 없습니다.</p>`,
      },
      {
        q: '추첨·선착순·기록 기준·여행사 전용은 무슨 차이인가요?',
        a: `<p>추첨은 신청 기간 안에 응모하면 무작위로 뽑는 방식이라 빨리 넣는다고 유리하지 않습니다. 선착순은 오픈과 동시에 마감되는 경우가 많아 오픈 시각에 맞춰야 합니다. 기록 기준은 연령대별 공인 기록을 채워야 신청할 수 있고, 여행사 전용은 개인 신청 창구가 없어 여행사 슬롯으로 참가합니다. 상시 접수는 정원에 여유가 있는 동안 신청할 수 있습니다. 각 대회의 접수 방식은 대회 페이지에 적혀 있습니다.</p>`,
      },
      {
        q: '해외 마라톤은 어떻게 접수하나요?',
        a: `<p>${a('/abroad/', '해외 마라톤 일정', lang)}에서 ${num(f.abroad)}개 대회의 접수 방식과 기간을 볼 수 있습니다. 해외 대회는 추첨·선착순·기록 기준이 많고, 개인 접수가 어려운 대회는 여행사 패키지로 참가합니다. 대회 상세의 ‘여행사’ 탭에 등록된 패키지와 ‘비용’ 탭의 예상 경비가 있고, 실제 신청은 대회 공식 홈페이지나 여행사에서 합니다.</p>`,
      },
      {
        q: '트레일러닝 대회 일정도 있나요?',
        a: `<p>${a('/trail/', '트레일러닝 대회 일정', lang)}에서 볼 수 있습니다. 트레일러닝 대회는 국내·해외를 합쳐 ${num(f.trail)}개 등록되어 있습니다.</p>`,
      },
      {
        q: '대회 일정을 내 캘린더에 넣을 수 있나요?',
        a: `<p>회원으로 로그인하면 대회 상세에서 대회 날·접수 시작·접수 마감을 골라 구글 캘린더나 아이폰·기본 캘린더에 넣을 수 있습니다. 접수 시작·마감 일정에는 하루 전 알림이 붙습니다. 저장한 대회 전체를 캘린더 하나로 구독하는 ‘내 일정 구독’도 회원 기능입니다.</p>`,
      },
      {
        q: '정보가 틀렸거나 목록에 없는 대회는 어떻게 알리나요?',
        a: `<p>틀린 정보는 ${mail} 으로 알려 주세요. 목록에 없는 대회는 로그인한 뒤 ‘대회 추가 요청’으로 보낼 수 있고, 매주 월요일 일정을 확인할 때 함께 넣습니다. 조기 마감된 대회는 대회 상세의 ‘마감됐어요 제보’로 알려 주세요.</p>`,
      },
      {
        q: '정보는 얼마나 자주 갱신되나요?',
        a: `<p>대회 목록은 매일 새벽 3시 23분(한국 시간)에 다시 반영합니다. 대회별로 정보를 마지막으로 확인한 날은 대회 상세의 ‘정보 확인’에 적혀 있습니다. 자세한 내용은 ${a(INFO_PATHS.about, '마라톤 캘린더란', lang)}을 봐 주세요.</p>`,
      },
    ];
    return {
      path: INFO_PATHS.faq,
      title: '마라톤 일정 자주 묻는 질문(FAQ) — 접수·예상 일정·알림 | 마라톤 캘린더',
      description: `${yl} 마라톤 일정은 어디서 보는지, ‘예상’·‘일정 미공개’ 표시의 뜻, 접수 알림 받는 법, 해외 마라톤·트레일러닝 접수 등 자주 묻는 질문 ${items.length}가지.`,
      h1: '마라톤 캘린더 자주 묻는 질문',
      lead: '대회 일정을 찾고 접수하는 데 자주 나오는 질문과 이 사이트에서 실제로 되는 방법입니다.',
      crumb: '자주 묻는 질문',
      items,
    };
  }

  const distLinks = [full, half, d10].filter(Boolean).map((d) => a(d.path, d.nameEn, lang));
  const regionLine = sample ? ` There are also pages by province, such as ${a(sample.path, `${sample.nameEn}`, lang)}.` : '';
  const items = [
    {
      q: `Where can I see ${yl} marathon dates?`,
      a: `<p>See ${yearLinks('en')} for each year. The site currently lists ${yearCountsEn}. The full list in date order, with search, is on the ${a('/', 'home page', lang)}.</p>`,
    },
    {
      q: 'Can I see only races in Korea, or filter by region or distance?',
      a: `<p>${a('/kr/', 'Marathons in South Korea', lang)} lists races in Korea only.${regionLine}${distLinks.length ? ` By distance, see ${distLinks.join(', ')}.` : ''}${wk ? ` Races this Saturday and Sunday are on ${a('/weekend/', 'Marathons This Weekend', lang)}.` : ''}</p>`,
    },
    {
      q: 'What does “expected” next to a date mean?',
      a: `<p>It means the race date or registration schedule has not been officially announced and the value is an estimate based on previous editions. Expected values can change, so check the official website before you sign up. The rules are described on the ${a(INFO_PATHS.about, 'About page', lang)}.</p>`,
    },
    {
      q: 'What does “Dates TBA” mean?',
      a: `<p>It means the registration schedule is not officially confirmed yet. Such a race is not listed as “Open” or “Opens soon” even if there is an expected date, and no registration alert is sent for the expected date. Once the official schedule is published, the information is updated and alerts become available.</p>`,
    },
    {
      q: 'Where can I see races that are open for registration right now?',
      a: open
        ? `<p>${a('/entry-open/', 'Races Open for Registration', lang)} lists the races open today. On the ${a('/', 'home page', lang)}, choosing “Open” in the registration status filter gives the same result.</p>`
        : `<p>On the ${a('/', 'home page', lang)}, choose “Open” in the registration status filter to see only the races open today.</p>`,
    },
    {
      q: 'How do I get registration alerts?',
      a: `<p>Sign in as a member and sign up on the “Alerts” tab of a race page. Choose how many days before registration opens or closes to be notified (30, 14, 7, 3 or 1 days) and we email your account address; if you turn on phone notifications, the same alert is also sent to that device. For a race whose schedule is not confirmed yet, we tell you once it is published. You cannot sign up for a cancelled race or one that has already closed.</p>`,
    },
    {
      q: 'What is the difference between lottery, first-come, qualifying and tour-only entry?',
      a: `<p>Lottery means everyone who applies in the window goes into a random draw, so applying early does not help. First-come races often fill the moment registration opens, so be ready at the opening time. Qualifying races require an official time for your age group. Tour-only races have no individual entry and places go through travel agencies. Open entry means you can sign up while places remain. The entry type of each race is on its page.</p>`,
    },
    {
      q: 'How do I register for a marathon abroad?',
      a: `<p>${a('/abroad/', 'Marathons Outside Korea', lang)} shows the entry type and registration window of ${num(f.abroad)} races. Many overseas races use a lottery, first-come entry or qualifying times, and races without individual entry are run through tour packages. A race page has a “Tours” tab with listed packages and a “Costs” tab with estimated costs; you register on the race’s official website or through a travel agency.</p>`,
    },
    {
      q: 'Are trail races listed too?',
      a: `<p>Yes — see ${a('/trail/', 'Trail Races', lang)}. ${num(f.trail)} trail races in Korea and abroad are registered.</p>`,
    },
    {
      q: 'Can I add race dates to my calendar?',
      a: `<p>Once you are signed in as a member, you can pick race day, registration opens or registration closes on a race page and add it to Google Calendar or an Apple or other calendar. Registration events come with a reminder the day before. “My calendar feed”, a single calendar subscription for all the races you have saved, is also a member feature.</p>`,
    },
    {
      q: 'How do I report wrong information or a missing race?',
      a: `<p>Email ${mail} about wrong information. For a race that is not listed, sign in and use “Suggest a race”; requests are handled when we update the calendar every Monday. If a race sold out early, tell us with “Report as full” on the race page.</p>`,
    },
    {
      q: 'How often is the information updated?',
      a: `<p>The race list is republished every day at 03:23 Korea time. Each race page shows the date it was last checked under “Last checked”. See the ${a(INFO_PATHS.about, 'About page', lang)} for details.</p>`,
    },
  ];
  return {
    path: INFO_PATHS.faq,
    title: 'FAQ — Marathon Dates, Registration and Alerts | Marathon Calendar',
    description: `Where to find ${yl} marathon dates, what “expected” and “Dates TBA” mean, registration alerts, entering races abroad and trail races: ${items.length} common questions.`,
    h1: 'Marathon Calendar FAQ',
    lead: 'Common questions about finding and registering for races, and what this site actually offers.',
    crumb: 'FAQ',
    items,
  };
}
