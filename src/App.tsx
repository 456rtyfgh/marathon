import { useEffect, useMemo, useState } from 'react';
import type { Race, EntryType } from './lib/types';
import { ENTRY_LABEL } from './lib/types';
import { loadDataset, type Dataset } from './lib/data';
import { entryStatus, daysBetween, TODAY, type EntryStatus } from './lib/util';
import RaceCard from './components/RaceCard';
import RaceDetail from './components/RaceDetail';

const REGIONS = ['일본', '아시아', '오세아니아', '유럽', '북미', '기타'] as const;
const ENTRY_TYPES: EntryType[] = ['lottery', 'fcfs', 'qualifying', 'open', 'tour_only'];
const STATUSES: [EntryStatus, string][] = [
  ['open', '신청 중'],
  ['upcoming', '오픈 예정'],
  ['closed', '마감'],
];
type Sort = 'race_date' | 'deadline' | 'flight';

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [q, setQ] = useState('');
  const [regions, setRegions] = useState<string[]>([]);
  const [types, setTypes] = useState<EntryType[]>([]);
  const [statuses, setStatuses] = useState<EntryStatus[]>([]);
  const [majorOnly, setMajorOnly] = useState(false);
  const [maxFlight, setMaxFlight] = useState(24);
  const [sort, setSort] = useState<Sort>('race_date');
  const [selected, setSelected] = useState<Race | null>(null);

  useEffect(() => {
    loadDataset().then(setData);
  }, []);

  const today = TODAY();

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const out = data.races.filter((r) => {
      if (majorOnly && !r.is_major) return false;
      if (regions.length && !regions.includes(r.region)) return false;
      if (types.length && !types.includes(r.entry_type)) return false;
      if (statuses.length && !statuses.includes(entryStatus(r, today))) return false;
      if (r.flight_hours != null && r.flight_hours > maxFlight) return false;
      if (needle) {
        const hay = `${r.name_ko} ${r.name_en} ${r.city_ko} ${r.country_ko}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return out.sort((a, b) => {
      if (sort === 'flight') return (a.flight_hours ?? 99) - (b.flight_hours ?? 99);
      if (sort === 'deadline') {
        const da = a.entry_closes ? daysBetween(today, a.entry_closes) : 9999;
        const db = b.entry_closes ? daysBetween(today, b.entry_closes) : 9999;
        const na = da < 0 ? 9998 : da;
        const nb = db < 0 ? 9998 : db;
        return na - nb;
      }
      return a.race_date.localeCompare(b.race_date);
    });
  }, [data, q, regions, types, statuses, majorOnly, maxFlight, sort, today]);

  const openNow = useMemo(
    () => (data ? data.races.filter((r) => entryStatus(r, today) === 'open') : []),
    [data, today],
  );

  const closingSoon = useMemo(
    () =>
      openNow
        .filter((r) => r.entry_closes && daysBetween(today, r.entry_closes) <= 30)
        .sort((a, b) => daysBetween(today, a.entry_closes!) - daysBetween(today, b.entry_closes!)),
    [openNow, today],
  );

  const toggle = <T,>(list: T[], set: (v: T[]) => void, v: T) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const reset = () => {
    setQ('');
    setRegions([]);
    setTypes([]);
    setStatuses([]);
    setMajorOnly(false);
    setMaxFlight(24);
  };

  const active =
    q || regions.length || types.length || statuses.length || majorOnly || maxFlight < 24;

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">
        불러오는 중…
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">
                해외마라톤 <span className="text-emerald-400">캘린더</span>
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                매년 바뀌는 대회 날짜·신청 방식·비용을 한 곳에서
              </p>
            </div>
            <div className="hidden text-right sm:block">
              <div className="text-2xl font-bold tabular-nums text-emerald-400">{openNow.length}</div>
              <div className="text-xs text-zinc-500">지금 신청 가능</div>
            </div>
          </div>
        </div>
      </header>

      {closingSoon.length > 0 && (
        <div className="border-b border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-xs font-semibold tracking-wide text-rose-400">마감 임박</span>
              {closingSoon.slice(0, 5).map((r) => {
                const d = daysBetween(today, r.entry_closes!);
                return (
                  <button
                    key={r.id}
                    onClick={() => setSelected(r)}
                    className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300 transition hover:bg-zinc-700"
                  >
                    {r.name_ko} <span className="font-semibold text-rose-400">D-{d}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* filters */}
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-wrap gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="대회명 · 도시 · 국가 검색"
              className="min-w-[200px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500"
            >
              <option value="race_date">대회일 순</option>
              <option value="deadline">신청 마감 임박 순</option>
              <option value="flight">이동 시간 짧은 순</option>
            </select>
          </div>

          <FilterRow label="지역">
            {REGIONS.map((r) => (
              <Chip key={r} on={regions.includes(r)} onClick={() => toggle(regions, setRegions, r)}>
                {r}
              </Chip>
            ))}
          </FilterRow>

          <FilterRow label="신청 방식">
            {ENTRY_TYPES.map((t) => (
              <Chip key={t} on={types.includes(t)} onClick={() => toggle(types, setTypes, t)}>
                {ENTRY_LABEL[t]}
              </Chip>
            ))}
          </FilterRow>

          <FilterRow label="상태">
            {STATUSES.map(([s, label]) => (
              <Chip key={s} on={statuses.includes(s)} onClick={() => toggle(statuses, setStatuses, s)}>
                {label}
              </Chip>
            ))}
            <Chip on={majorOnly} onClick={() => setMajorOnly(!majorOnly)}>
              메이저만
            </Chip>
          </FilterRow>

          <div className="flex flex-wrap items-center gap-3">
            <span className="w-16 shrink-0 text-xs font-medium text-zinc-500">이동 시간</span>
            <input
              type="range"
              min={2}
              max={24}
              value={maxFlight}
              onChange={(e) => setMaxFlight(Number(e.target.value))}
              className="max-w-xs flex-1 accent-emerald-400"
            />
            <span className="text-xs tabular-nums text-zinc-300">
              {maxFlight >= 24 ? '제한 없음' : `${maxFlight}시간 이내`}
            </span>
            {active && (
              <button
                onClick={reset}
                className="ml-auto rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                필터 초기화
              </button>
            )}
          </div>
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            <span className="font-semibold text-zinc-300">{filtered.length}</span>개 대회
          </p>
          <p className="text-xs text-zinc-600">
            데이터 출처: {data.source === 'supabase' ? 'Supabase' : '내장 시드'}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-zinc-800 p-12 text-center text-sm text-zinc-500">
            조건에 맞는 대회가 없습니다.
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => (
              <RaceCard key={r.id} race={r} onOpen={() => setSelected(r)} />
            ))}
          </div>
        )}

        <footer className="mt-12 border-t border-zinc-800 pt-6 text-xs leading-relaxed text-zinc-600">
          <p>
            대회 일정과 신청 기간은 주최 측 사정으로 예고 없이 변경될 수 있습니다. &lsquo;예상&rsquo;·&lsquo;미정&rsquo;
            표시가 붙은 항목은 직전 회차 패턴을 기준으로 추정한 값이며, 신청 전 각 대회 공식 홈페이지에서
            반드시 확인하세요. 비용 계산기의 금액은 인천 출발 기준 참고용 추정치입니다.
          </p>
        </footer>
      </main>

      {selected && (
        <RaceDetail
          race={selected}
          agencies={data.agencies}
          packages={data.packages}
          costs={data.costs}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-xs font-medium text-zinc-500">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
        on ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
      }`}
    >
      {children}
    </button>
  );
}
