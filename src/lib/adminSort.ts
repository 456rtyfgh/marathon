/**
 * 관리 화면 목록 정렬 (대회 고르기·후기 링크 대회·통계·요청). 화면 글자는 관리 화면처럼 한국어만.
 * 대회 기본은 '대회 날짜 가까운 순': 오늘 이후 대회를 날짜 순으로 먼저, 지난 대회는 뒤에 최근 것부터.
 */
import type { Race } from './types';

export type RaceSort = 'date' | 'name' | 'updated';
export const RACE_SORT_LABEL: Record<RaceSort, string> = { date: '날짜', name: '이름', updated: '최근 수정' };
export const RACE_SORT_DESC: Record<RaceSort, string> = {
  date: '대회 날짜 가까운 순 · 지난 대회는 뒤',
  name: '이름 가나다순',
  updated: '최근 고친 것부터',
};

/** DB 의 races 에는 updated_at(고칠 때 트리거가 바꿈)이 있다. 목록 파일 값엔 없으니 확인 날짜로 대신한다 */
const touched = (r: Race) => (r as Race & { updated_at?: string | null }).updated_at ?? r.last_verified ?? '';

const byName = (a: Race, b: Race) => a.name_ko.localeCompare(b.name_ko, 'ko') || a.id.localeCompare(b.id);

export interface RaceGroup {
  label: string | null;
  races: Race[];
}

/** 정렬한 대회를 묶음으로. 날짜순만 '다가오는 대회'·'지난 대회' 두 묶음, 나머지는 한 묶음(label null) */
export function sortRaces(races: Race[], sort: RaceSort, today: string): RaceGroup[] {
  if (sort === 'name') return [{ label: null, races: [...races].sort(byName) }];
  if (sort === 'updated')
    return [{ label: null, races: [...races].sort((a, b) => touched(b).localeCompare(touched(a)) || byName(a, b)) }];
  const up = races.filter((r) => r.race_date >= today).sort((a, b) => a.race_date.localeCompare(b.race_date) || byName(a, b));
  const past = races.filter((r) => r.race_date < today).sort((a, b) => b.race_date.localeCompare(a.race_date) || byName(a, b));
  return [
    { label: `다가오는 대회 ${up.length}`, races: up },
    { label: `지난 대회 ${past.length}`, races: past },
  ].filter((g) => g.races.length);
}

/** 고르기 목록 한 줄: '2027-06-13 · 윈더미어 마라톤 · 윈더미어 (windermere)' — 이름이 같은 대회도 날짜·도시·id 로 구분된다 */
export const raceOptionLabel = (r: Race) => `${r.race_date} · ${r.name_ko}${r.city_ko ? ` · ${r.city_ko}` : ''} (${r.id})`;

/** 대회 추가 요청·마감 제보 정렬 */
export type RequestSort = 'status' | 'newest';
export const REQUEST_SORT_LABEL: Record<RequestSort, string> = { status: '상태별', newest: '최신순' };
export const REQUEST_SORT_DESC: Record<RequestSort, string> = {
  status: '확인 전 먼저 · 그 안에서 최신순',
  newest: '들어온 날 최신순',
};
const STATUS_RANK: Record<string, number> = { pending: 0, added: 1, duplicate: 2, rejected: 3 };

export function sortRequests<T extends { status: string; created_at: string; id: string }>(rows: T[], sort: RequestSort): T[] {
  return [...rows].sort(
    (a, b) =>
      (sort === 'status' ? (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) : 0) ||
      b.created_at.localeCompare(a.created_at) ||
      a.id.localeCompare(b.id),
  );
}

/** 통계 한 칸(event·key)이 여러 줄로 와도 한 줄로 합친다 → 같은 항목이 두 번 보이지 않게 */
export function mergeStatRows<T extends { event: string; key: string; n: number }>(rows: T[]): T[] {
  const m = new Map<string, T>();
  for (const r of rows) {
    const k = `${r.event}\u0000${r.key}`;
    const prev = m.get(k);
    m.set(k, prev ? { ...prev, n: prev.n + r.n } : { ...r });
  }
  return [...m.values()];
}
