/**
 * 내 정보 '저장한 대회' 의 계산 (React·Supabase 없음 — node scripts/myraces-test.mjs 로 확인).
 * 저장(user_favorites) ∪ 내 대회(user_races: 접수했어요·참가했어요)를 묶음·정렬·D-day·요약으로 만든다.
 * 날짜·접수 상태는 util.ts 의 규칙만 쓴다(여기서 새 날짜 규칙을 만들지 않는다).
 */
import type { Race } from './types';
import type { RaceRecord } from './member';
import { TODAY, daysBetween, entryStatus, isCancelled, isEntryConfirmed, type EntryStatus } from './util';

export type MyGroup = 'open' | 'soon' | 'registered' | 'waiting' | 'past';
/** 화면에 보일 묶음 순서 */
export const MY_GROUPS: readonly MyGroup[] = ['open', 'soon', 'registered', 'waiting', 'past'];

export interface MyRaceItem {
  race: Race;
  group: MyGroup;
  /** util.entryStatus(race, today) 그대로 — 배지용 (STATUS_TEXT[lang][status]) */
  status: EntryStatus;
  /** user_favorites 에 있음 → 저장 해제 버튼을 보인다 */
  saved: boolean;
  /** user_races 행 (비동기화 상태에서 '접수했어요' 만 있으면 status 'registered' 인 가짜 행, 나머지 칸 null) */
  record: RaceRecord | null;
  /** 강조할 D-day. open→마감까지(closes) · soon→시작까지(opens) · registered/waiting→대회까지(race) · past·취소·날짜 없음→null */
  dday: { kind: 'closes' | 'opens' | 'race'; days: number } | null;
  /** open 이고 마감까지 0~7일 */
  urgent: boolean;
}

export interface MySummary {
  /** 저장한 대회 수 (목록에 있는 대회만) */
  saved: number;
  /** 접수 중 묶음 수 · 그중 urgent 수 */
  open: number;
  closingSoon: number;
  /** 이번 달(한국 시간) entry_opens 인 대회 수 — 접수 일정 확정(isEntryConfirmed)·취소 아님. 이미 연 것도 포함 */
  opensThisMonth: number;
  /** 접수 완료 묶음 수 */
  registered: number;
  /** past 아닌 항목 수 */
  upcoming: number;
}

export interface MyRaces {
  /** MY_GROUPS 순서로 이어 붙인 전체 */
  items: MyRaceItem[];
  byGroup: Record<MyGroup, MyRaceItem[]>;
  summary: MySummary;
  /** 저장·기록에 있지만 races 에 없는 id (화면에는 안 보이고 개수에도 안 넣는다) */
  missing: string[];
}

export interface MyRacesInput {
  races: Race[];
  favIds: string[];
  /** useRegistered().records (동기화 전이면 빈 Map) */
  records: ReadonlyMap<string, RaceRecord>;
  /** useRegistered().ids — 동기화 전 브라우저 '접수했어요' 까지 포함 */
  registeredIds: string[];
}

/** 묶음 규칙 — 위에서부터 먼저 맞는 것 */
export function groupOf(race: Race, record: RaceRecord | null, today: Date = TODAY()): MyGroup {
  if (record?.status === 'finished' || daysBetween(today, race.race_date) < 0) return 'past';
  if (isCancelled(race)) return 'waiting';
  if (record?.status === 'registered') return 'registered';
  const st = entryStatus(race, today);
  if (st === 'open') return 'open';
  if (st === 'upcoming') return 'soon';
  return 'waiting';
}

function ddayOf(race: Race, group: MyGroup, today: Date): MyRaceItem['dday'] {
  if (group === 'past') return null;
  if (group === 'open') return race.entry_closes ? { kind: 'closes', days: daysBetween(today, race.entry_closes) } : null;
  if (group === 'soon') return race.entry_opens ? { kind: 'opens', days: daysBetween(today, race.entry_opens) } : null;
  if (isCancelled(race)) return null;
  return { kind: 'race', days: daysBetween(today, race.race_date) };
}

const cmpStr = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
/** 없는 날짜는 뒤로 */
const cmpDate = (a: string | null, b: string | null) => (a === b ? 0 : a == null ? 1 : b == null ? -1 : cmpStr(a, b));

function sortGroup(group: MyGroup, list: MyRaceItem[]): MyRaceItem[] {
  const tie = (a: MyRaceItem, b: MyRaceItem) => cmpStr(a.race.race_date, b.race.race_date) || cmpStr(a.race.id, b.race.id);
  const key: (a: MyRaceItem, b: MyRaceItem) => number =
    group === 'open'
      ? (a, b) => cmpDate(a.race.entry_closes, b.race.entry_closes)
      : group === 'soon'
        ? (a, b) => cmpDate(a.race.entry_opens, b.race.entry_opens)
        : group === 'past'
          ? (a, b) => cmpStr(b.race.race_date, a.race.race_date) || cmpStr(a.race.id, b.race.id)
          : () => 0;
  return [...list].sort((a, b) => key(a, b) || tie(a, b));
}

export function buildMyRaces(input: MyRacesInput, today: Date = TODAY()): MyRaces {
  const { races, favIds, records, registeredIds } = input;
  const byId = new Map(races.map((r) => [r.id, r]));
  const fav = new Set(favIds);
  const regIds = new Set(registeredIds);

  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of [...favIds, ...records.keys(), ...registeredIds]) {
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  const byGroup: Record<MyGroup, MyRaceItem[]> = { open: [], soon: [], registered: [], waiting: [], past: [] };
  const missing: string[] = [];
  for (const id of ids) {
    const race = byId.get(id);
    if (!race) {
      missing.push(id);
      continue;
    }
    const record: RaceRecord | null =
      records.get(id) ??
      (regIds.has(id)
        ? { race_id: id, status: 'registered', distance: null, distance_km: null, finish_sec: null, participation_count: 1, years: null, last_year: null, updated_at: '' }
        : null);
    const group = groupOf(race, record, today);
    const dday = ddayOf(race, group, today);
    byGroup[group].push({
      race,
      group,
      status: entryStatus(race, today),
      saved: fav.has(id),
      record,
      dday,
      urgent: group === 'open' && dday != null && dday.days >= 0 && dday.days <= 7,
    });
  }
  for (const g of MY_GROUPS) byGroup[g] = sortGroup(g, byGroup[g]);
  const items = MY_GROUPS.flatMap((g) => byGroup[g]);

  const month = today.toISOString().slice(0, 7);
  const summary: MySummary = {
    saved: items.filter((x) => x.saved).length,
    open: byGroup.open.length,
    closingSoon: byGroup.open.filter((x) => x.urgent).length,
    opensThisMonth: items.filter(
      (x) => x.race.entry_opens?.slice(0, 7) === month && isEntryConfirmed(x.race) && !isCancelled(x.race),
    ).length,
    registered: byGroup.registered.length,
    upcoming: items.length - byGroup.past.length,
  };
  return { items, byGroup, summary, missing };
}
