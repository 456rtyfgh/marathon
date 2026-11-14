/**
 * 저장·캘린더 추가 뒤 '접수 시작·마감 알림 받기' 제안 (PLAN 파트 A · 인터페이스 2).
 * 알림 신청 목록(alert_subscriptions)은 브라우저에서 읽을 수 없어, '이미 알림 있음'은
 * 이 브라우저에서 신청에 성공한 기록(ALERTED_KEY) + 회원의 '저장한 대회 알림'(saved_races)으로 본다.
 * localStorage 를 못 쓰면(사생활 모드 등) 기록만 빠지고 화면은 그대로 돈다.
 */
import type { Race } from './types.ts';
import { TODAY, daysBetween, entryStatus, isCancelled } from './util.ts';

export const NUDGE_DISMISSED_KEY = 'marathon-cal:alert-nudge-dismissed';
export const ALERTED_KEY = 'marathon-cal:alerted';
/** 목록이 끝없이 늘지 않게 최근 것만 남긴다 */
const MAX_IDS = 500;

function readIds(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function addId(key: string, id: string) {
  try {
    const ids = readIds(key).filter((x) => x !== id);
    ids.push(id);
    localStorage.setItem(key, JSON.stringify(ids.slice(-MAX_IDS)));
  } catch {
    /* 저장 못 하면 다음에 제안이 다시 뜰 뿐이다 */
  }
}

export const isNudgeDismissed = (raceId: string): boolean => readIds(NUDGE_DISMISSED_KEY).includes(raceId);
export const dismissNudge = (raceId: string): void => addId(NUDGE_DISMISSED_KEY, raceId);
/** AlertForm 신청 성공 때 */
export const markAlerted = (raceId: string): void => addId(ALERTED_KEY, raceId);
export const hasLocalAlert = (raceId: string): boolean => readIds(ALERTED_KEY).includes(raceId);

/** 제안을 보여도 되는 대회: 취소 아님 · 대회일이 오늘이거나 그 뒤 · 접수 예정·접수 중·일정 미공개 */
export function nudgeEligible(race: Race, today: Date = TODAY()): boolean {
  if (isCancelled(race)) return false;
  if (daysBetween(today, race.race_date) < 0) return false;
  const st = entryStatus(race, today);
  return st === 'upcoming' || st === 'open' || st === 'unknown';
}
