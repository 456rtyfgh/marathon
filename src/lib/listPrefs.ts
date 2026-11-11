/**
 * 첫 화면 대회 목록의 기본값(지역·정렬·상태)과 그 적용 규칙. 앱(App.tsx)과 프리렌더(scripts/prerender.mjs)가 같이 쓴다
 * — node 에서도 import 되게 import 는 '.ts' 확장자로, 런타임 import 는 ./util.ts 하나만.
 *
 * 규칙: 사용자가 고른 값(pick, 주소 쿼리 포함)이 이긴다. 안 고른(null) 값만 기본값.
 * 검색어가 있으면 안 고른 지역·상태 기본값은 풀린다(전체·모두) — 국내·접수 중에 묶여 해외 대회가 검색되지 않는 일이 없게.
 * 대회 날짜(여행 기간)를 고르면 안 고른 상태 기본값만 풀린다(모두) — 그 기간 대회가 '접수 중' 에 묶여 적게 보이지 않게.
 */
import type { Race } from './types.ts';
import { daysBetween, isDomestic, type EntryStatus } from './util.ts';

export type ListScope = 'all' | 'kr' | 'abroad';
export type ListSort = 'entry' | 'race_date' | 'views' | 'saves' | 'size' | 'flight';
export type StatusFilter = EntryStatus | 'closing7' | 'opening30';

/** 처음 온 사람의 기본값 — 바꿀 일이 있으면 여기 한 곳만 */
export const LIST_DEFAULTS: { scope: ListScope; sort: ListSort; status: StatusFilter[] } = {
  scope: 'kr',
  sort: 'race_date',
  status: ['open'],
};

/** 사용자가 고른 값. null = 아직 안 고름 → 기본값 */
export type ListPicks = { scope: ListScope | null; sort: ListSort | null; status: StatusFilter[] | null };
export const NO_PICKS: ListPicks = { scope: null, sort: null, status: null };

const SCOPES: readonly ListScope[] = ['all', 'kr', 'abroad'];
const SORTS: readonly ListSort[] = ['entry', 'race_date', 'views', 'saves', 'size', 'flight'];
/** 주소로 받는 상태 값 (화면에서 고를 수 있는 것들: 칩 open·upcoming·closed, 현황판 closing7·opening30) */
const STATUS_QUERY: readonly StatusFilter[] = ['open', 'upcoming', 'unknown', 'closed', 'closing7', 'opening30'];

/**
 * 주소 쿼리(location.search 문자열)에서 pick 읽기. 없는/잘못된 값은 null.
 * ?status= (빈 값)은 '모두'(= []), ?status=open,foo 는 맞는 것만, 하나도 안 맞으면 null.
 */
export function picksFromSearch(search: string): ListPicks {
  const p = new URLSearchParams(search);
  const scope = p.get('scope');
  const sort = p.get('sort');
  const status = p.get('status');
  let st: StatusFilter[] | null = null;
  if (status != null) {
    const parts = status
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) st = [];
    else {
      const ok = [...new Set(parts.filter((s): s is StatusFilter => (STATUS_QUERY as readonly string[]).includes(s)))];
      st = ok.length ? ok : null;
    }
  }
  return {
    scope: scope != null && (SCOPES as readonly string[]).includes(scope) ? (scope as ListScope) : null,
    sort: sort != null && (SORTS as readonly string[]).includes(sort) ? (sort as ListSort) : null,
    status: st,
  };
}

/** 검색 중 '모두' — 렌더마다 새 [] 를 만들지 않게 하나만 (useMemo 의존성이 매번 바뀌지 않게) */
const ALL_STATUS: StatusFilter[] = [];

/**
 * 실제 적용 값. searching=true 면 고르지 않은 scope→'all', status→[].
 * dated=true(대회 날짜를 하나라도 고름)면 고르지 않은 status→[] (scope 는 그대로).
 * 안 고른 status 는 늘 같은 배열(LIST_DEFAULTS.status 또는 ALL_STATUS)을 돌려준다 — 고쳐 쓰지 말 것.
 */
export function resolveListPrefs(
  picks: ListPicks,
  opts: { searching: boolean; dated?: boolean },
): { scope: ListScope; sort: ListSort; status: StatusFilter[] } {
  return {
    scope: picks.scope ?? (opts.searching ? 'all' : LIST_DEFAULTS.scope),
    sort: picks.sort ?? LIST_DEFAULTS.sort,
    status: picks.status ?? (opts.searching || opts.dated ? ALL_STATUS : LIST_DEFAULTS.status),
  };
}

/** 대회 날짜 범위 (여행 기간). 'YYYY-MM-DD' 또는 null(그쪽 끝 없음) */
export type DateRange = { from: string | null; to: string | null };
export const NO_RANGE: DateRange = { from: null, to: null };

/** 'YYYY-MM-DD' 이고 실제 있는 날짜면 그대로, 아니면 null (2027-02-30 은 버림) */
export function validDate(v: string | null | undefined): string | null {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = new Date(v + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v ? v : null;
}

/** ?from=2027-03-01&to=2027-03-10 → 형식이 맞는 값만. from>to 면 서로 바꾼다 */
export function rangeFromSearch(search: string): DateRange {
  const p = new URLSearchParams(search);
  const from = validDate(p.get('from'));
  const to = validDate(p.get('to'));
  return orderRange({ from, to });
}

/** from>to 면 서로 바꾼다 — iOS 달력은 input 의 min·max 를 막지 않아 거꾸로 고를 수 있다 */
export function orderRange(r: DateRange): DateRange {
  return r.from && r.to && r.from > r.to ? { from: r.to, to: r.from } : r;
}

/** race_date 가 범위 안인지 (양 끝 포함, 한쪽만 있으면 그쪽만 비교) */
export function inDateRange(r: Race, range: DateRange): boolean {
  if (range.from && r.race_date < range.from) return false;
  if (range.to && r.race_date > range.to) return false;
  return true;
}

/** 상태 필터 하나에 맞는지. st = entryStatus(r, today) */
export function matchesStatus(r: Race, st: EntryStatus, s: StatusFilter, today: Date): boolean {
  if (s === 'closing7') return st === 'open' && !!r.entry_closes && daysBetween(today, r.entry_closes) <= 7;
  if (s === 'opening30') return st === 'upcoming' && !!r.entry_opens && daysBetween(today, r.entry_opens) <= 30;
  // '접수 끝' 칩은 정원이 차서 일찍 끝난 대회도 함께 보여 준다
  if (s === 'closed') return st === 'closed' || st === 'soldout';
  return st === s;
}

/** status 가 [] 이면 true, 아니면 하나라도 맞으면 true (합집합) */
export function matchesAnyStatus(r: Race, st: EntryStatus, status: StatusFilter[], today: Date): boolean {
  return !status.length || status.some((s) => matchesStatus(r, st, s, today));
}

/** 범위 안인지 (isDomestic 기준) */
export function inScope(r: Race, scope: ListScope): boolean {
  if (scope === 'kr') return isDomestic(r);
  if (scope === 'abroad') return !isDomestic(r);
  return true;
}

/** 대회 날짜순(가까운 날 먼저). 같은 날은 name_ko(ko 순), 그래도 같으면 id — 새 배열 반환 (프리렌더 seo-lib 의 races 정렬과 같은 순서) */
export function byRaceDate(list: Race[]): Race[] {
  return [...list].sort(
    (a, b) =>
      a.race_date.localeCompare(b.race_date) ||
      a.name_ko.localeCompare(b.name_ko, 'ko') ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}
