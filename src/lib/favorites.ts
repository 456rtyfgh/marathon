import { useCallback, useEffect, useState } from 'react';

const KEY = 'marathon-cal:favorites';

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 이 브라우저에만 저장되는 관심 대회 목록 */
export function useFavorites() {
  const [ids, setIds] = useState<string[]>(read);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setIds(read());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggle = useCallback((id: string) => {
    setIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* 저장 불가한 환경이면 이번 방문 동안만 유지 */
      }
      return next;
    });
  }, []);

  return { ids, has: (id: string) => ids.includes(id), toggle };
}
