/**
 * 저작권·이용 제한 고지 (한 곳에서만 정한다).
 * React 화면·워커(worker/site.ts)·빌드 스크립트(scripts/*.mjs) 가 같이 쓰므로 다른 모듈을 import 하지 않는다.
 * 약관 본문은 scripts/terms.mjs (/terms, /en/terms).
 */
export type NoticeLang = 'ko' | 'en';

export const SITE_URL = 'https://marathon82.com';
export const TERMS_PATH: Record<NoticeLang, string> = { ko: '/terms', en: '/en/terms' };

/** 푸터 한 줄 고지 */
export const NOTICE: Record<NoticeLang, string> = {
  ko: '© 2026 마라톤 캘린더. 대회 정보는 직접 조사·검증한 데이터베이스로 저작권법 등으로 보호됩니다. 자동 수집·무단 복제·재배포를 금지합니다.',
  en: '© 2026 Marathon Calendar. Race information is a database we research and verify ourselves and is protected by copyright law and other laws. Automated collection, unauthorized copying and redistribution are prohibited.',
};

const TERMS_LABEL: Record<NoticeLang, string> = { ko: '이용약관', en: 'Terms of Use' };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** 정적 HTML 용 고지 한 줄 (스타일은 감싸는 쪽을 따른다) */
export function noticeHtml(lang: NoticeLang): string {
  return `<p class="site-notice">${esc(NOTICE[lang])} <a href="${TERMS_PATH[lang]}">${TERMS_LABEL[lang]}</a></p>`;
}

/** 데이터 파일(JSON) 맨 앞에 넣는 "_notice" 값 */
export const DATA_NOTICE = {
  copyright: `© 2026 마라톤 캘린더 (${SITE_URL})`,
  notice_ko:
    '이 데이터는 마라톤 캘린더 운영자가 직접 조사·검증해 만든 데이터베이스로 저작권법 등으로 보호됩니다. 크롤링·스크래핑·봇 등 자동화 수단으로 수집하거나, 서면 허락 없이 복제·재배포·상업적으로 이용하는 것을 금지합니다.',
  notice_en:
    'This data is a database researched and verified by the operator of Marathon Calendar and is protected by copyright law and other laws. Collecting it by automated means (crawling, scraping, bots) or copying, redistributing or using it commercially without written permission is prohibited.',
  terms: `${SITE_URL}${TERMS_PATH.ko}`,
};

/** 403 응답 본문 (text/plain) */
export const BLOCKED_TEXT = [
  '403 Forbidden',
  '',
  '이 주소는 마라톤 캘린더 사이트 안에서만 쓸 수 있습니다. 대회 정보는 직접 조사·검증한 데이터베이스로 저작권법 등으로 보호되며, 자동 수집·무단 복제·재배포를 금지합니다.',
  `이용약관: ${SITE_URL}${TERMS_PATH.ko}`,
  '',
  'This address can only be used from within the Marathon Calendar website. Race information is a database we research and verify ourselves and is protected by copyright law and other laws. Automated collection, unauthorized copying and redistribution are prohibited.',
  `Terms of Use: ${SITE_URL}${TERMS_PATH.en}`,
  '',
].join('\n');
