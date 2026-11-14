/**
 * 앱 푸터의 검색용 목록 페이지 링크 (scripts/seo-pages.mjs 가 만드는 정적 페이지).
 * 문구는 i18n 사전 대신 여기 { ko, en } 로 둔다(src/legal/strings.ts 의 LEGAL 과 같은 방식).
 * 영어 주소는 langPath(path, 'en') 로 /en 을 붙인다. 시·도별은 많아서 넣지 않는다(/kr/ 페이지에서 이어진다).
 */
export const SEO_LINKS: { path: string; ko: string; en: string }[] = [
  { path: '/entry-open/', ko: '접수 중', en: 'Open now' },
  { path: '/weekend/', ko: '이번 주말', en: 'This weekend' },
  { path: '/distance/full/', ko: '풀코스', en: 'Full marathons' },
  { path: '/distance/half/', ko: '하프', en: 'Half marathons' },
  { path: '/distance/10k/', ko: '10km', en: '10K races' },
  { path: '/kr/', ko: '국내', en: 'Korea' },
  { path: '/abroad/', ko: '해외', en: 'Abroad' },
];

/** 링크 줄의 접근성 이름 */
export const SEO_LINKS_LABEL = { ko: '마라톤 일정 모아 보기', en: 'Browse race lists' };
