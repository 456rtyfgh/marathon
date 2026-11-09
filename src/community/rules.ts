/**
 * 러닝톡 글·댓글 미리 검사 (DB community_text_reason 과 같은 규칙 — PLAN 3.2). 화면에서 먼저 이유를 보여 주고, 최종 판단은 DB 가 한다.
 * ① 사이트 밖 링크 2개 이상 금지 ② 메신저·단축 주소는 1개라도 금지 ③ 링크를 지운 글로 spamReason (금칙어는 서버만 안다)
 */
import type { Lang } from '../i18n/lang';
import { spamReason } from '../lib/spam';
import { LIMITS } from '../lib/communityTypes';
import { COMMUNITY_TEXT } from './strings';

const URL_RE = /(https?:\/\/|www\.)[^\s<>"]+/gi;
const MESSENGER_RE = /(open\.kakao|t\.me\/|telegram|bit\.ly|han\.gl|me2\.do|tinyurl|goo\.gl|vo\.la|url\.kr|is\.gd|cutt\.ly)/i;
const OWN_RE = /^(https?:\/\/)?(www\.)?marathon82\.com(\/|$)/i;

export function communityTextReason(text: string, lang: Lang): string | null {
  const s = COMMUNITY_TEXT[lang];
  const urls = text.match(URL_RE) ?? [];
  if (MESSENGER_RE.test(text)) return s.noMessenger;
  if (urls.filter((u) => !OWN_RE.test(u)).length > LIMITS.links) return s.tooManyLinks;
  const rest = text.replace(URL_RE, ' ');
  const spam = spamReason(rest, lang);
  // 남은 글에 'example.com/' 같은 주소가 있으면 후기용 문구 대신 러닝톡 규칙을 알려 준다
  if (spam && spam === spamReason('https://x.com', lang)) return s.bareUrl;
  return spam;
}
