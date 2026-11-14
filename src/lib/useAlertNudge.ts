/**
 * 알림 제안 상태 훅 (PLAN 2-3). 판정·경쟁 상태 처리는 alertNudgeFlow.ts 에 있고 여기는 React 상태만 얹는다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Race } from './types';
import { dismissNudge } from './alertNudge';
import { createNudgeFlow, type NudgeFrom } from './alertNudgeFlow';
import { getAlertPrefs } from './member';

export type { NudgeFrom } from './alertNudgeFlow';

export interface AlertNudgeState {
  /** 지금 어느 자리에서 제안이 떠 있는지. null = 안 뜸 */
  from: NudgeFrom | null;
  /** 저장 켬·캘린더 추가 성공 직후 */
  offer: (from: NudgeFrom) => Promise<void>;
  /** 저장을 풀 때: 진행 중 판정 무효 + 'save' 제안만 닫음('cal' 은 둠) */
  cancelSave: () => void;
  /** [닫기]: 이 대회엔 다시 안 뜨게 기록하고 닫음 */
  dismiss: () => void;
  /** [알림 받기]: 닫음만(기록 안 함). 알림 탭 이동은 부르는 쪽이 한다 */
  accept: () => void;
}

export function useAlertNudge(race: Race, signedIn: boolean): AlertNudgeState {
  const [from, setFrom] = useState<NudgeFrom | null>(null);
  const [flow] = useState(() => createNudgeFlow({ getPrefs: () => getAlertPrefs() }));
  const raceRef = useRef(race);
  const signedInRef = useRef(signedIn);
  useEffect(() => {
    raceRef.current = race;
    signedInRef.current = signedIn;
  });

  // 같은 패널에서 다른 대회를 열면 제안을 닫고 읽는 중인 판정을 버린다 (렌더 중 상태 맞추기)
  const [seenRace, setSeenRace] = useState(race.id);
  if (seenRace !== race.id) {
    setSeenRace(race.id);
    setFrom(null);
  }
  useEffect(() => {
    flow.cancel();
  }, [flow, race.id]);

  // 로그인·로그아웃이 되면 읽어 둔 회원 설정을 버린다
  const [seenSignedIn, setSeenSignedIn] = useState(signedIn);
  if (seenSignedIn !== signedIn) {
    setSeenSignedIn(signedIn);
    setFrom(null);
  }
  useEffect(() => {
    flow.resetMember();
  }, [flow, signedIn]);

  useEffect(() => () => flow.cancel(), [flow]);

  const offer = useCallback(
    async (next: NudgeFrom) => {
      const r = raceRef.current;
      const ok = await flow.offer(r, signedInRef.current);
      if (ok && raceRef.current.id === r.id) setFrom(next);
    },
    [flow],
  );
  const cancelSave = useCallback(() => {
    flow.cancel();
    setFrom((f) => (f === 'save' ? null : f));
  }, [flow]);
  const dismiss = useCallback(() => {
    dismissNudge(raceRef.current.id);
    setFrom(null);
  }, []);
  const accept = useCallback(() => setFrom(null), []);

  return { from, offer, cancelSave, dismiss, accept };
}
