/**
 * 접수 상태 → 색 묶음 (목록 RaceRow · 내 정보 SavedRaces · 대회 상세 RaceDetail).
 * 색은 보조 — 글자는 그대로 두고 연한 배경 + 진한 글자만 바꾼다. 색 값은 src/index.css 의 --st-* 토큰.
 * 런타임 import 없음 (node 테스트 scripts/status-tone-test.mjs 에서 import 한다).
 */
import type { EntryStatus } from './util.ts';

export type StatusTone = 'open' | 'upcoming' | 'closed' | 'tbd' | 'cancelled';

/** 취소 'cancelled', 접수 중(마감일 미공지·정원 찰 때까지 포함) 'open', 접수 예정 'upcoming',
 *  접수 마감·조기 마감 'closed', 접수 미정·일정 미공개·예상 'tbd' */
export function toneOf(status: EntryStatus): StatusTone {
  switch (status) {
    case 'cancelled':
      return 'cancelled';
    case 'open':
      return 'open';
    case 'upcoming':
      return 'upcoming';
    case 'closed':
    case 'soldout':
      return 'closed';
    default:
      return 'tbd';
  }
}

/** 배지용 (연한 배경 + 진한 글자). Tailwind 가 찾을 수 있게 클래스 이름을 통째로 적는다 */
export const TONE_BADGE: Record<StatusTone, string> = {
  open: 'bg-st-open text-st-open-ink',
  upcoming: 'bg-st-upcoming text-st-upcoming-ink',
  closed: 'bg-st-closed text-st-closed-ink',
  tbd: 'bg-st-tbd text-st-tbd-ink',
  cancelled: 'bg-st-cancelled text-st-cancelled-ink',
};

/** 배경 없이 글자만 칠할 때 (surface·bg 위) */
export const TONE_TEXT: Record<StatusTone, string> = {
  open: 'text-st-open-ink',
  upcoming: 'text-st-upcoming-ink',
  closed: 'text-st-closed-ink',
  tbd: 'text-st-tbd-ink',
  cancelled: 'text-st-cancelled-ink',
};
