/**
 * 저장·캘린더 추가 뒤 알림 제안을 띄울지 정하는 흐름 (PLAN 파트 B).
 * React·Supabase 를 부르지 않는 순수 모듈이라 node 로 바로 테스트한다 (scripts/alert-nudge-test.mjs).
 *
 * 규칙: 가장 마지막 offer 만 유효하다. 읽는 사이 cancel / resetMember / 다른 offer 가 있었으면 false.
 * 회원의 saved_races 는 flow 하나가 사는 동안(= 패널이 열린 동안) 한 번만 읽고 캐시한다.
 */
import type { Race } from './types.ts';
import { shouldOfferNudge } from './alertNudge.ts';

export type NudgeFrom = 'save' | 'cal';

export interface NudgeFlowDeps {
  /** 훅에서는 member.ts 의 getAlertPrefs 를 넘긴다 */
  getPrefs: () => Promise<{ saved_races: boolean } | null>;
  /** 기본 4000. 넘으면 이번 판정은 false, 캐시하지 않는다 */
  timeoutMs?: number;
  today?: () => Date;
}

export interface NudgeFlow {
  /** 호출마다 이전 판정을 무효로 하고 새로 판정한다. 규칙을 통과하고 그동안 cancel/reset/다른 offer 가 없었으면 true */
  offer(race: Race, signedIn: boolean): Promise<boolean>;
  /** 진행 중 판정 무효(저장 해제·대회 전환 때) */
  cancel(): void;
  /** saved_races 캐시를 버리고 진행 중 판정도 무효(로그인 상태가 바뀔 때) */
  resetMember(): void;
}

const TIMED_OUT = Symbol('timeout');

export function createNudgeFlow(deps: NudgeFlowDeps): NudgeFlow {
  const timeoutMs = deps.timeoutMs ?? 4000;
  let seq = 0; // offer·cancel·resetMember 마다 올린다 — 시작 때 값과 다르면 그 판정은 버린다
  let epoch = 0; // 회원 상태가 바뀔 때만 올린다 — 다르면 읽은 값을 캐시하지 않는다
  let savedAlerts: boolean | null = null; // null = 아직 안 읽음

  async function readSavedAlerts(): Promise<boolean | typeof TIMED_OUT> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs);
    });
    // 못 읽으면(reject, 또는 동기 throw) 알림 없음으로 본다
    let read: Promise<boolean>;
    try {
      read = deps.getPrefs().then(
        (p) => p?.saved_races ?? false,
        () => false,
      );
    } catch {
      read = Promise.resolve(false);
    }
    try {
      return await Promise.race([read, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async offer(race, signedIn) {
      const mySeq = ++seq;
      const now = () => deps.today?.();
      if (!shouldOfferNudge(race, now())) return false;
      if (!signedIn) return true;
      if (savedAlerts == null) {
        const myEpoch = epoch;
        const v = await readSavedAlerts();
        if (v === TIMED_OUT) return false;
        if (myEpoch === epoch) savedAlerts = v;
        if (mySeq !== seq) return false;
        // 읽는 사이 닫기·신청이 있었을 수 있다
        if (!shouldOfferNudge(race, now())) return false;
        return !v;
      }
      return !savedAlerts;
    },
    cancel() {
      seq++;
    },
    resetMember() {
      seq++;
      epoch++;
      savedAlerts = null;
    },
  };
}
