import type { Race } from './types.ts';

/*
 * 필터 밖 결과: 검색어에 맞는 대회(필터 무관, 지난 대회 포함) 중 지금 목록에 안 보이는 것.
 * 다가오는 대회가 먼저(대회일 빠른 순), 그다음 지난 대회(최근 먼저). Node 에서도 돌리므로 import 는 .ts.
 */
export type Hidden = {
  /** 다가오는 대회 중 필터 때문에 안 보이는 것 (필터를 풀면 목록에 나온다) */
  upcoming: Race[];
  /** 이미 끝난 대회 (필터를 풀어도 '끝난 대회' 접힘 안에만 있다) */
  past: Race[];
  /** upcoming + past */
  total: number;
};

/** 한 번에 보여 주는 최대 수 */
export const HIDDEN_SHOW = 5;
/** 현재 결과가 이 수 이하면 0개가 아니어도 '필터 때문에 안 보이는 대회' 를 아래에 알린다 */
export const FEW_RESULTS = 5;

/**
 * @param candidates 검색어에 맞는 대회들 (다가오는 대회 검색 결과 ∪ 전체 검색 결과)
 * @param shown      지금 목록에 보이는 대회들
 * @param today      오늘 'YYYY-MM-DD' (이 날짜 이후가 다가오는 대회)
 */
export function hiddenRaces(candidates: Iterable<Race>, shown: Set<Race>, today: string): Hidden {
  const seen = new Set<string>();
  const upcoming: Race[] = [];
  const past: Race[] = [];
  for (const r of candidates) {
    if (shown.has(r) || seen.has(r.id)) continue;
    seen.add(r.id);
    (r.race_date >= today ? upcoming : past).push(r);
  }
  upcoming.sort((a, b) => a.race_date.localeCompare(b.race_date) || a.id.localeCompare(b.id));
  past.sort((a, b) => b.race_date.localeCompare(a.race_date) || a.id.localeCompare(b.id));
  return { upcoming, past, total: upcoming.length + past.length };
}

/** 화면에 보여 줄 대회: 다가오는 것 먼저, 최대 n 개 */
export const pickHidden = (h: Hidden, n = HIDDEN_SHOW): Race[] => [...h.upcoming, ...h.past].slice(0, n);

/** 검색 기록용: 0개가 필터 탓이면 'filtered', 전체에서도 0개면 'none', 결과가 있으면 null */
export function emptyKind(shown: number, hiddenTotal: number): 'filtered' | 'none' | null {
  if (shown > 0) return null;
  return hiddenTotal > 0 ? 'filtered' : 'none';
}
