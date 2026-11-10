/**
 * App 이 가진 저장·내 대회 상태를 내 정보 창(AuthBar → ProfileForm → SavedRaces)으로 넘기는 다리.
 * 훅(useFavorites·useRegistered)을 화면에서 다시 부르면 상태가 둘로 갈라져 저장 해제가 목록·상세에 안 보인다 — 그래서 App 의 것을 그대로 넘긴다.
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Race } from './types';
import type { RaceRecord } from './member';
import { TODAY, todayISO } from './util';
import { buildMyRaces, type MyRaces } from './myRaces';

export interface MyRacesBridge {
  /** App 의 data.races (지난 대회 포함 전체) */
  races: Race[];
  /** 대회 목록 받는 중(races 가 비어 있다)이거나 회원 저장 목록을 계정과 맞추는 중(favIds 가 비어 보인다) — 빈 상태 안내 대신 '불러오는 중' */
  loading: boolean;
  favIds: string[];
  toggleFavorite: (id: string) => void;
  /** 저장 목록이 계정과 맞춰졌나 (false = 브라우저 저장분으로 동작 중) */
  favSynced: boolean;
  /** useRegistered().ids — 동기화 전 브라우저 '접수했어요' 포함 */
  registeredIds: string[];
  records: ReadonlyMap<string, RaceRecord>;
  loggedIn: boolean;
  /** 대회 상세 열기 (상세 창이 내 정보 창 위로 뜬다) */
  openRace: (r: Race) => void;
  onLogin: () => void;
}

const Ctx = createContext<MyRacesBridge | null>(null);

export function MyRacesProvider({ value, children }: { value: MyRacesBridge; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// 훅을 Provider 와 같은 파일에 둔다(auth.tsx·i18n 과 같은 꼴) — 이 파일을 고치면 fast refresh 대신 새로 읽을 뿐이다
/** Provider 밖이면 null */
// oxlint-disable-next-line react/only-export-components
export const useMyRaces = (): MyRacesBridge | null => useContext(Ctx);

/** bridge + buildMyRaces. 날짜가 바뀌면(todayISO) 다시 계산한다 */
// oxlint-disable-next-line react/only-export-components
export const useMyRaceList = (): { bridge: MyRacesBridge; list: MyRaces } | null => {
  const bridge = useContext(Ctx);
  const day = todayISO();
  const list = useMemo(
    () =>
      bridge
        ? buildMyRaces({ races: bridge.races, favIds: bridge.favIds, records: bridge.records, registeredIds: bridge.registeredIds }, TODAY())
        : null,
    // day 가 바뀌면 TODAY() 도 바뀐다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bridge?.races, bridge?.favIds, bridge?.records, bridge?.registeredIds, day],
  );
  return bridge && list ? { bridge, list } : null;
};
