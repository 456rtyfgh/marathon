/**
 * 후기·요청 글의 광고·도배 1차 거르기 (DB 트리거 public.spam_reason 과 같은 규칙).
 * 화면에서 먼저 막아 바로 이유를 보여 주고, 최종 판단은 DB 가 한다.
 */
import type { Lang } from '../i18n/lang';
import { translate } from '../i18n/t';

export function spamReason(text: string | null | undefined, lang: Lang = 'ko'): string | null {
  const t = (text ?? '').toLowerCase();
  if (!t) return null;
  if (/(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|kr|co|io|me|ly|link|xyz|top|shop|site|info|biz|cc|to)(\/|\s|$))/.test(t))
    return translate(lang, 'spam.url');
  if (/(open\.kakao|오픈\s*채팅|오픈톡|카톡\s*(id|아이디)|텔레\s*그램|telegram|t\.me|라인\s*(id|아이디)|카카오\s*(id|아이디))/.test(t))
    return translate(lang, 'spam.contact');
  if (/0\s*1\s*[016789][\s.-]*\d{3,4}[\s.-]*\d{4}/.test(t)) return translate(lang, 'spam.phone');
  if (
    /(카지노|바카라|토토|슬롯|먹튀|홀덤|배팅|베팅|도박|대출|급전|부업|재택\s*알바|수익\s*보장|고수익|리딩방|코인\s*추천|주식\s*추천|성인|조건\s*만남|출장\s*안마|19금|비아그라|casino|baccarat|betting|viagra|loan)/.test(t)
  )
    return translate(lang, 'spam.words');
  if (/(.)\1{9,}/.test(t)) return translate(lang, 'spam.repeat');
  return null;
}

/**
 * 서버가 돌려준 한국어 안내(도배·광고 차단 등)는 그대로 보여 준다.
 * 영어 화면은 한국어를 그대로 보이지 않고, 하루 제한이면 그 안내를, 아니면 fallback 을 쓴다
 */
export const friendlyError = (e: unknown, fallback: string, lang: Lang = 'ko') => {
  const m = e instanceof Error ? e.message : '';
  const ok = /[가-힣]/.test(m) && m.length < 120;
  if (lang === 'en') return ok && /하루에 5개/.test(m) ? translate('en', 'spam.daily') : fallback;
  return ok ? m : fallback;
};
