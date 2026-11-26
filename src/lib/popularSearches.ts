import { useEffect, useState } from 'react';
import type { Popular } from './relatedSearches';

/*
 * 인기 검색어: 배포 때 scripts/snapshot.mjs 가 만든 정적 파일 /popular-searches.json
 * ({ generated_at, days, source, terms: [{ term, n }] }). 받지 못하거나 모양이 다르면 빈 목록 — 칩 줄만 안 나온다.
 */
const FILE = '/popular-searches.json';
const MAX = 100;

/** 파일 내용을 검사해 쓸 수 있는 것만 (term 은 1~20자 글, n 은 숫자) */
export function parsePopular(raw: unknown): Popular[] {
  const terms = (raw as { terms?: unknown } | null)?.terms;
  if (!Array.isArray(terms)) return [];
  const out: Popular[] = [];
  for (const t of terms) {
    const term = (t as { term?: unknown } | null)?.term;
    const n = Number((t as { n?: unknown } | null)?.n);
    if (typeof term !== 'string') continue;
    const s = term.trim();
    if (!s || s.length > 20) continue;
    out.push({ term: s, n: Number.isFinite(n) ? n : 0 });
  }
  return out.sort((a, b) => b.n - a.n).slice(0, MAX);
}

let cache: Promise<Popular[]> | null = null;
/** 한 번만 받는다 (실패해도 다시 받지 않는다 — 새로고침하면 다시). 주소가 없을 때 SPA 가 html 을 돌려주면 json 이 아니라 빈 목록 */
export function loadPopular(): Promise<Popular[]> {
  cache ??= fetch(FILE)
    .then((r) => (r.ok && /json/i.test(r.headers.get('content-type') ?? '') ? r.json() : null))
    .then(parsePopular)
    .catch(() => []);
  return cache;
}

const NONE: Popular[] = [];
/** 인기 검색어 목록 (받는 동안·실패하면 빈 목록 — 같은 배열을 돌려줘 useMemo 의존성이 흔들리지 않는다) */
export function usePopularSearches(): Popular[] {
  const [list, setList] = useState<Popular[]>(NONE);
  useEffect(() => {
    let alive = true;
    loadPopular().then((v) => {
      if (alive && v.length) setList(v);
    });
    return () => {
      alive = false;
    };
  }, []);
  return list;
}
