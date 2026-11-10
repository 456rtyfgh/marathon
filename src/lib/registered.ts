import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import {
  deleteRecord,
  isMemberNotReady,
  listRecords,
  mergeRegistered,
  saveRecord as saveRecordRemote,
  type RaceRecord,
} from './member';

const KEY = 'marathon-cal:registered';

/** 이 훅 밖(내 정보의 '지난 대회 등록')에서 기록을 바꾼 뒤 보내는 창 이벤트 — 받으면 계정 기록을 다시 읽는다 */
export const RECORDS_CHANGED = 'marathon-cal:records-changed';

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* 저장 불가한 환경이면 이번 방문 동안만 유지 */
  }
}

const warn = (e: unknown) => {
  if (!isMemberNotReady(e)) console.warn('records sync:', e);
};

const toMap = (rows: RaceRecord[]) => new Map(rows.map((r) => [r.race_id, r]));
const EMPTY: Map<string, RaceRecord> = new Map();

export type RecordInput = Pick<RaceRecord, 'race_id' | 'status'> &
  Partial<Pick<RaceRecord, 'distance' | 'distance_km' | 'finish_sec' | 'participation_count' | 'years' | 'last_year'>>;

/**
 * 접수를 마친 대회('접수했어요')와 참가 기록('참가했어요' + 종목·기록).
 * 비회원은 지금처럼 '접수했어요' 만 이 브라우저에. 회원은 계정(user_races)에 — 로그인할 때 브라우저 저장분을 status 'registered' 로 합치고
 * 브라우저 목록은 비운다. ids/has 는 status 'registered' 만(목록 배지·'접수한 대회' 필터가 예전과 같게), 완주 기록은 records 로만 본다.
 * 계정 표가 아직 없거나(0013 실행 전) 실패하면 브라우저 저장 동작 그대로(synced = false, 기록 저장 불가).
 */
export function useRegistered() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [local, setLocal] = useState<string[]>(read);
  const [remote, setRemote] = useState<{ uid: string; map: Map<string, RaceRecord> } | null>(null);
  const synced = uid && remote?.uid === uid ? remote.map : null;

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setLocal(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    let ready = false;
    (async () => {
      const first = read();
      let rows = await mergeRegistered(first);
      const now = read();
      if (now.some((x) => !first.includes(x))) rows = await mergeRegistered(now);
      if (!alive) return;
      write([]);
      setLocal([]);
      setRemote({ uid, map: toMap(rows) });
      ready = true;
    })().catch(warn);
    const reload = () => {
      if (ready) listRecords().then((rows) => alive && setRemote({ uid, map: toMap(rows) }), warn);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(RECORDS_CHANGED, reload);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(RECORDS_CHANGED, reload);
    };
  }, [uid]);

  const ids = useMemo(
    () => (synced ? [...synced.values()].filter((r) => r.status === 'registered').map((r) => r.race_id) : local),
    [synced, local],
  );

  const put = useCallback(
    (id: string, row: RaceRecord | undefined) =>
      setRemote((prev) => {
        if (!uid || prev?.uid !== uid) return prev;
        const map = new Map(prev.map);
        if (row) map.set(id, row);
        else map.delete(id);
        return { uid, map };
      }),
    [uid],
  );

  /** 기록 저장(upsert). 회원·계정 준비가 끝난 뒤에만 — 아니면 throw */
  const saveRecord = useCallback(
    async (r: RecordInput) => {
      if (!synced) throw new Error('not synced');
      // 대회 상세는 종목·기록만 보낸다 — 내 정보에서 적은 참가 횟수·해는 그대로 둔다(빠진 칸을 비우는 saveRecord 라서)
      const prev = synced.get(r.race_id);
      const keep = prev?.status === 'finished' && r.status === 'finished' && r.participation_count === undefined && r.years === undefined;
      const row = await saveRecordRemote(keep ? { ...r, participation_count: prev.participation_count, years: prev.years, last_year: prev.last_year } : r);
      put(r.race_id, row);
      return row;
    },
    [synced, put],
  );

  /** 기록 지우기(접수·참가 표시 모두 해제) */
  const clearRecord = useCallback(
    async (id: string) => {
      if (!synced) throw new Error('not synced');
      await deleteRecord(id);
      put(id, undefined);
    },
    [synced, put],
  );

  /** '접수했어요' 켜고 끄기 (예전 동작 그대로. 회원은 계정에 낙관적 반영, 실패하면 되돌림) */
  const toggle = useCallback(
    (id: string) => {
      if (!synced) {
        setLocal((prev) => {
          const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
          write(next);
          return next;
        });
        return;
      }
      const before = synced.get(id);
      const fail = (e: unknown) => {
        console.warn('records save:', e);
        put(id, before);
      };
      if (before?.status === 'registered') {
        put(id, undefined);
        deleteRecord(id).catch(fail);
      } else {
        put(id, { race_id: id, status: 'registered', distance: null, distance_km: null, finish_sec: null, participation_count: 1, years: null, last_year: null, updated_at: new Date().toISOString() });
        saveRecordRemote({ race_id: id, status: 'registered' }).then((row) => put(id, row), fail);
      }
    },
    [synced, put],
  );

  const has = useCallback((id: string) => ids.includes(id), [ids]);
  const records = synced ?? EMPTY;
  return useMemo(
    () => ({ ids, has, toggle, records, synced: synced != null, saveRecord, clearRecord }),
    [ids, has, toggle, records, synced, saveRecord, clearRecord],
  );
}
