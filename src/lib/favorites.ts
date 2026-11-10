import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import { addFavorite, isMemberNotReady, listFavorites, mergeFavorites, removeFavorite } from './member';

const KEY = 'marathon-cal:favorites';

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
  if (!isMemberNotReady(e)) console.warn('favorites sync:', e);
};

/**
 * 관심(저장한) 대회 목록.
 * 비회원은 이 브라우저(localStorage)에만. 회원은 계정(user_favorites)에 — 로그인할 때(새로고침 포함) 브라우저 저장분을 합치고
 * 브라우저 목록은 비운다(이후 계정이 기준. 안 비우면 로그인 중 지운 대회가 다음 로그인 때 되살아난다).
 * 계정 표가 아직 없거나(0013 실행 전) 합치기에 실패하면 브라우저 저장 동작 그대로.
 */
export function useFavorites() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [local, setLocal] = useState<string[]>(read);
  // 계정과 맞춘 목록. 지금 로그인한 회원 것일 때만 쓴다(아니면 = 비회원·준비 전·실패 → 브라우저 목록)
  const [remote, setRemote] = useState<{ uid: string; ids: string[] } | null>(null);
  const synced = uid && remote?.uid === uid ? remote.ids : null;

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
      let ids = await mergeFavorites(first);
      // 합치는 동안 브라우저에 더 저장했으면 한 번 더 합친다
      const now = read();
      if (now.some((x) => !first.includes(x))) ids = await mergeFavorites(now);
      if (!alive) return;
      write([]);
      setLocal([]);
      setRemote({ uid, ids });
      ready = true;
    })().catch(warn);
    // 다른 기기에서 바꾼 것도 이 탭으로 돌아오면 보이게
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !ready) return;
      listFavorites().then((ids) => alive && setRemote({ uid, ids }), warn);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [uid]);

  const ids = synced ?? local;

  const toggle = useCallback(
    (id: string) => {
      if (!synced || !uid) {
        setLocal((prev) => {
          const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
          write(next);
          return next;
        });
        return;
      }
      const adding = !synced.includes(id);
      const apply = (add: boolean) =>
        setRemote((prev) =>
          prev?.uid !== uid ? prev : { uid, ids: add ? (prev.ids.includes(id) ? prev.ids : [...prev.ids, id]) : prev.ids.filter((x) => x !== id) },
        );
      apply(adding);
      (adding ? addFavorite(id) : removeFavorite(id)).catch((e) => {
        console.warn('favorites save:', e);
        apply(!adding); // 저장 실패 → 되돌림
      });
    },
    [synced, uid],
  );

  const has = useCallback((id: string) => ids.includes(id), [ids]);
  return useMemo(() => ({ ids, has, toggle, synced: synced != null }), [ids, has, toggle, synced]);
}
