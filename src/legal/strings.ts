/** 처리방침·약관 페이지와 푸터 링크 문구 (PLAN 3-7: 파트 B 문구는 i18n 사전 대신 여기 { ko, en } 로 둔다) */
import type { Lang } from '../i18n';

type L = { ko: string; en: string };

export const LEGAL = {
  privacy: { ko: '개인정보 처리방침', en: 'Privacy Policy' },
  terms: { ko: '이용약관', en: 'Terms of Use' },
  /** 푸터 GA 문장 뒤에 붙는 링크 */
  more: { ko: '자세히 보기', en: 'Learn more' },
  home: { ko: '마라톤 캘린더 홈으로', en: 'Back to Marathon Calendar' },
  effective: { ko: '시행일', en: 'Effective date' },
  revisions: { ko: '개정 이력', en: 'Revision history' },
  version: { ko: '버전(시행일)', en: 'Version (effective date)' },
  change: { ko: '내용', en: 'Change' },
  contact: { ko: '문의', en: 'Contact' },
  switchLang: { ko: 'Switch to English', en: '한국어로 보기' },
} satisfies Record<string, L>;

export const pick = (l: L, lang: Lang) => l[lang];
