/**
 * 빌드 뒤 dist/llms.txt 를 만든다 (llmstxt.org 형식: 사이트 소개 + 주요 페이지 링크 목록).
 * 대회 데이터 덤프는 넣지 않는다 — 대회별 /r/<id> 링크·대회 이름 목록도 없다. 수치는 public/data.json 에서 센다.
 * 입력은 scripts/seo-lib.mjs 의 export 와 src/lib/policy.ts 의 CONTACT_EMAIL 뿐이다(파트 B 의 info-lib.mjs 를 읽지 않는다).
 * about·faq 주소는 seo-lib 의 INFO_PATHS — 그 페이지(scripts/info-pages.mjs)가 아직 없으면 경고만 하고 링크는 남긴다.
 * public/robots.txt 는 AI 봇을 막아 두었다. 이 파일은 그 결정을 바꾸지 않고, 읽는 쪽이 있을 때를 위한 안내일 뿐이다.
 */
import { existsSync, writeFileSync } from 'node:fs';
import {
  INFO_PATHS, LANDINGS, LANDINGS_EN, ORIGIN, SITE_NAME_EN, countries, distancePages, enPath, monthLabel, monthLabelEn, monthPath, months, races, regionPages, today, upcoming, weekend,
} from './seo-lib.mjs';
import { CONTACT_EMAIL } from '../src/lib/policy.ts';

const DIST = new URL('../dist/', import.meta.url);
const num = (n) => n.toLocaleString('en-US');
const isKr = (r) => r.country_code === 'KR';
const kr = races.filter(isKr).length;
const abroad = races.length - kr;
const trail = races.filter((r) => r.discipline === 'trail').length;
// '해외 …개 나라' 라서 한국(/c/kr/)은 빼고 센다 (소개 페이지 /about/ 의 수와 같은 기준)
const nCountries = countries.filter((c) => c.code !== 'kr').length;
const upKr = upcoming.filter(isKr).length;
const upAbroad = upcoming.length - upKr;
const upTrail = upcoming.filter((r) => r.discipline === 'trail').length;
const firstYear = races[0].race_date.slice(0, 4);
const lastYear = races.at(-1).race_date.slice(0, 4);
const span = firstYear === lastYear ? firstYear : `${firstYear}–${lastYear}`;

const missing = [];
const warnings = [];
const exists = (path) => existsSync(new URL(`.${path}index.html`, DIST));
/** 링크 한 줄. 대상 페이지가 dist 에 없으면 목록에서 빼고 기록한다 (about·faq 만 예외: 경고만) */
const link = (path, name, note) => {
  const isInfo = Object.values(INFO_PATHS).some((p) => path === p || path === enPath(p));
  if (!exists(path)) {
    if (isInfo) warnings.push(path);
    else {
      missing.push(path);
      return '';
    }
  }
  return `- [${name}](${ORIGIN}${path})${note ? `: ${note}` : ''}`;
};
const lines = (...ls) => ls.filter(Boolean).join('\n');

const landingKo = (path) => LANDINGS.find((l) => l.path === path);
const landingEn = (path) => LANDINGS_EN.find((l) => l.path === enPath(path));
const yearsKo = LANDINGS.filter((l) => /^\/\d{4}\/$/.test(l.path));
const yearsEn = LANDINGS_EN.filter((l) => /^\/en\/\d{4}\/$/.test(l.path));
const futureMonths = months.filter((ym) => ym >= today.slice(0, 7));

const ko = `# 마라톤 캘린더 (마라톤82)

> 국내·해외 마라톤·트레일러닝 대회 ${num(races.length)}개(${span}년)의 날짜, 접수 시작·마감일, 접수 방식(추첨·선착순 등)을 대회 날짜순으로 모은 사이트입니다. 국내 ${num(kr)}개, 해외 ${num(abroad)}개(${num(nCountries)}개 나라), 트레일러닝 ${num(trail)}개를 담고 있으며, 지금 기준 앞으로 열리는 대회는 ${num(upcoming.length)}개(국내 ${num(upKr)}, 해외 ${num(upAbroad)}, 트레일러닝 ${num(upTrail)})입니다.

마라톤 캘린더(마라톤82, 영어 이름 ${SITE_NAME_EN})는 학생 개발자 한 명이 운영합니다. 날짜나 접수 일정이 아직 확정되지 않은 대회는 '예상'으로 표시합니다. 날짜·접수 기간은 바뀔 수 있으므로 공식 홈페이지에서 한 번 더 확인해야 합니다. 이 파일은 사이트 안내이며 대회 데이터를 담지 않습니다.

## 주요 페이지

${lines(
  link(INFO_PATHS.about, '마라톤 캘린더 소개', '사이트가 무엇이고 정보를 어떻게 다루는지'),
  link(INFO_PATHS.faq, '자주 묻는 질문', '일정·접수 표시와 이용 방법'),
  link('/kr/', landingKo('/kr/')?.name ?? '국내 마라톤 일정', `앞으로 열리는 국내 대회 ${num(upKr)}개`),
  link('/abroad/', landingKo('/abroad/')?.name ?? '해외 마라톤 일정', `앞으로 열리는 해외 대회 ${num(upAbroad)}개`),
  link('/trail/', landingKo('/trail/')?.name ?? '트레일러닝 대회 일정', `앞으로 열리는 트레일러닝 대회 ${num(upTrail)}개`),
  landingKo('/entry-open/') && link('/entry-open/', landingKo('/entry-open/').name, '접수 중인 대회 (빌드한 날 기준)'),
  weekend.races.length ? link(weekend.path, '이번 주말 마라톤', '이번 주 토·일 대회 (빌드한 날 기준)') : '',
  ...yearsKo.map((l) => link(l.path, l.name, '달별 일정')),
)}

## 거리별·지역별

${lines(
  ...distancePages.map((d) => link(d.path, `국내 ${d.name} 대회`, `${num(d.races.length)}개`)),
  ...regionPages.map((p) => link(p.path, `${p.name} 마라톤 일정`, `앞으로 열리는 대회 ${num(p.races.length)}개`)),
)}

## 월별

월별 페이지는 ${ORIGIN}/m/YYYY-MM/ 형식입니다. 대회가 3개 이상인 국내 시·도는 ${ORIGIN}/m/YYYY-MM/<시·도 영문 이름>/ 에서도 볼 수 있습니다(예: 서울 seoul, 경기 gyeonggi). 나라별 페이지는 ${ORIGIN}/c/<국가코드 소문자>/ 형식입니다(예: 일본 jp).

${lines(...futureMonths.map((ym) => link(monthPath(ym), `${monthLabel(ym)} 마라톤 일정`)))}

## English

${lines(
  link(enPath('/'), `${SITE_NAME_EN} (English home)`, 'Marathon and trail race dates and registration windows'),
  link(enPath(INFO_PATHS.about), 'About', 'What this site is and how it handles information'),
  link(enPath(INFO_PATHS.faq), 'FAQ', 'Dates, registration labels and how to use the site'),
  link(enPath('/kr/'), landingEn('/kr/')?.name ?? 'Marathons in South Korea', `${num(upKr)} upcoming races`),
  link(enPath('/abroad/'), landingEn('/abroad/')?.name ?? 'Marathons Outside Korea', `${num(upAbroad)} upcoming races`),
  link(enPath('/trail/'), landingEn('/trail/')?.name ?? 'Trail Races', `${num(upTrail)} upcoming races`),
  landingEn('/entry-open/') && link(enPath('/entry-open/'), landingEn('/entry-open/').name, 'Open for registration (as of the build date)'),
  weekend.races.length ? link(enPath(weekend.path), 'Marathons This Weekend', 'This Saturday and Sunday (as of the build date)') : '',
  ...yearsEn.map((l) => link(l.path, l.name, 'Month by month')),
  ...distancePages.map((d) => link(enPath(d.path), `${d.nameEn} in South Korea`, `${num(d.races.length)} races`)),
  ...regionPages.map((p) => link(enPath(p.path), `Marathons in ${p.nameEn}, South Korea`, `${num(p.races.length)} upcoming races`)),
)}

## 이용 안내 (Terms and contact)

- [이용약관](${ORIGIN}/terms): 대회 정보는 직접 조사·검증한 데이터베이스로 저작권법 등으로 보호되며, 자동 수집·무단 복제·재배포를 금지합니다. / [Terms of Use](${ORIGIN}/en/terms): automated collection, unauthorized copying and redistribution of the race data are prohibited.
- 문의 / Contact: ${CONTACT_EMAIL}
`;

if (missing.length) throw new Error(`llms: dist 에 없는 페이지 링크 ${missing.slice(0, 5).join(' ')}`);
writeFileSync(new URL('llms.txt', DIST), ko);
const nLinks = (ko.match(/\]\(https?:\/\//g) ?? []).length;
console.log(`llms: dist/llms.txt (링크 ${nLinks}개, 대회 데이터 없음)${warnings.length ? ` — 경고: 아직 없는 소개 페이지 ${warnings.join(' ')}` : ''}`);
