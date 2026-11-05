/**
 * 후기·요청 글의 광고·도배 1차 거르기 (DB 트리거 public.spam_reason 과 같은 규칙).
 * 화면에서 먼저 막아 바로 이유를 보여 주고, 최종 판단은 DB 가 한다.
 */
export function spamReason(text: string | null | undefined): string | null {
  const t = (text ?? '').toLowerCase();
  if (!t) return null;
  if (/(https?:\/\/|www\.|[a-z0-9-]+\.(com|net|kr|co|io|me|ly|link|xyz|top|shop|site|info|biz|cc|to)(\/|\s|$))/.test(t))
    return '광고·홍보 글을 막기 위해 후기와 요청에는 웹 주소를 넣을 수 없게 했습니다. 주소를 빼고 다시 올려 주세요.';
  if (/(open\.kakao|오픈\s*채팅|오픈톡|카톡\s*(id|아이디)|텔레\s*그램|telegram|t\.me|라인\s*(id|아이디)|카카오\s*(id|아이디))/.test(t))
    return '광고·홍보 글을 막기 위해 카톡 아이디·오픈채팅·텔레그램 같은 연락처는 넣을 수 없게 했습니다.';
  if (/0\s*1\s*[016789][\s.-]*\d{3,4}[\s.-]*\d{4}/.test(t)) return '광고·홍보 글을 막기 위해 전화번호는 넣을 수 없게 했습니다.';
  if (
    /(카지노|바카라|토토|슬롯|먹튀|홀덤|배팅|베팅|도박|대출|급전|부업|재택\s*알바|수익\s*보장|고수익|리딩방|코인\s*추천|주식\s*추천|성인|조건\s*만남|출장\s*안마|19금|비아그라|casino|baccarat|betting|viagra|loan)/.test(t)
  )
    return '도박·대출·성인 광고를 막기 위해 일부 단어가 들어간 글은 올릴 수 없게 했습니다. 표현을 바꿔 다시 올려 주세요.';
  if (/(.)\1{9,}/.test(t)) return '도배를 막기 위해 같은 글자를 10번 넘게 이어 쓴 글은 올릴 수 없게 했습니다.';
  return null;
}

/** 서버가 돌려준 한국어 안내(도배·광고 차단 등)는 그대로 보여 준다 */
export const friendlyError = (e: unknown, fallback: string) => {
  const m = e instanceof Error ? e.message : '';
  return /[가-힣]/.test(m) && m.length < 120 ? m : fallback;
};
