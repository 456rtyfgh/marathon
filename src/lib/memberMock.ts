/**
 * 개발 서버 전용 회원 DB 흉내: 로그인 흉내(/?amock=member|admin, lib/auth.tsx)일 때 member.ts 의
 * 내 대회(user_races)·기록 요약·구독 주소·알림 설정 호출을 서버 대신 이 브라우저 localStorage 로 처리한다.
 * '내 정보' 화면(기록 요약·지난 대회 등록)을 Supabase 없이 확인하려고 둔다. 빌드에서는 import.meta.env.DEV 가 false 라 빠진다.
 * ?rmock=reset 이면 흉내 기록을 비우고 시작한다. ?p0019=off 면 참가 횟수 칸(0019)이 없는 DB 처럼 군다.
 */
import type { AlertPrefs, RaceRecord, RecordSummary } from './member';

const KEY = 'marathon-cal:dev-records-mock';

/** 요약의 연도 계산용 대회 날짜 (목록 파일에서) */
let dates: Promise<Map<string, string>> | null = null;
const raceDates = () =>
  (dates ??= fetch(__DATA_LIST_URL__)
    .then((r) => r.json() as Promise<{ races?: { id: string; race_date: string }[] }>)
    .then((j) => new Map((j.races ?? []).map((r) => [r.id, r.race_date])))
    .catch(() => new Map()));

const read = <T,>(k: string, d: T): T => {
  try {
    return (JSON.parse(localStorage.getItem(k) ?? 'null') as T) ?? d;
  } catch {
    return d;
  }
};
const write = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));
const wait = () => new Promise((r) => setTimeout(r, 120));

export function devMemberMock() {
  const q = new URLSearchParams(location.search);
  const who = q.get('amock');
  if (who !== 'member' && who !== 'admin') return null;
  if (q.get('rmock') === 'reset') localStorage.removeItem(KEY);
  const participation = q.get('p0019') !== 'off';
  // 0019 전 DB 흉내: 참가 횟수·해 칸을 돌려주지 않는다
  const rows = () =>
    read<RaceRecord[]>(KEY, []).map((r) => {
      if (participation) return r;
      const { participation_count: _c, years: _y, last_year: _l, ...old } = r;
      return old as RaceRecord;
    });
  return {
    participation,
    async list(): Promise<RaceRecord[]> {
      await wait();
      return rows();
    },
    async save(r: Partial<RaceRecord> & Pick<RaceRecord, 'race_id' | 'status'>): Promise<RaceRecord> {
      await wait();
      // DB 트리거(0019)처럼 years 가 있으면 횟수·마지막 해를 맞춘다
      const years = r.years?.length ? [...new Set(r.years)].sort((a, b) => b - a) : null;
      const extra = participation ? { participation_count: years ? years.length : (r.participation_count ?? 1), years, last_year: years ? years[0] : (r.last_year ?? null) } : {};
      const row = { ...r, ...extra, updated_at: new Date().toISOString() } as RaceRecord;
      write(KEY, [...rows().filter((x) => x.race_id !== r.race_id), row]);
      return row;
    },
    async remove(id: string): Promise<void> {
      await wait();
      write(KEY, rows().filter((x) => x.race_id !== id));
    },
    async merge(ids: string[]): Promise<RaceRecord[]> {
      const have = new Set(rows().map((x) => x.race_id));
      const add = ids
        .filter((id) => !have.has(id))
        .map((race_id): RaceRecord => ({ race_id, status: 'registered', distance: null, distance_km: null, finish_sec: null, participation_count: 1, years: null, last_year: null, updated_at: new Date().toISOString() }));
      write(KEY, [...rows(), ...add]);
      return rows();
    },
    async summary(year: number): Promise<RecordSummary> {
      const date = await raceDates();
      const done = rows().filter((x) => x.status === 'finished');
      // 0019 의 my_record_summary 와 같은 규칙: years → last_year → 대회 날짜
      const inYear = done.filter((x) =>
        x.years?.length ? x.years.includes(year) : x.last_year != null ? x.last_year === year : date.get(x.race_id)?.startsWith(String(year)),
      );
      const best = (km: number) => {
        const s = done.filter((x) => x.distance_km === km && x.finish_sec != null).map((x) => x.finish_sec!);
        return s.length ? Math.min(...s) : null;
      };
      return {
        year_count: inYear.length,
        year_km: inYear.reduce((n, x) => n + (x.distance_km ?? 0), 0),
        best_full_sec: best(42.195),
        best_half_sec: best(21.0975),
      };
    },
    async alertPrefs(): Promise<AlertPrefs | null> {
      return null;
    },
    async tokenInfo(): Promise<string | null> {
      return null;
    },
  };
}
