import { useEffect, useMemo, useState } from 'react';
import type { Race, EntryType, Region } from './lib/types';
import { ENTRY_LABEL, REGIONS } from './lib/types';
import { loadDataset, type Dataset } from './lib/data';
import { entryStatus, entrySortKey, daysBetween, TODAY, isDomestic, type EntryStatus } from './lib/util';
import { AuthProvider, useAuth } from './lib/auth';
import RaceCard from './components/RaceCard';
import RaceDetail from './components/RaceDetail';
import AdminPanel from './components/AdminPanel';
import RequestPanel from './components/RequestPanel';
import { AuthBar, AuthModal } from './components/AuthPanel';

const OVERSEAS: Region[] = REGIONS.filter((r) => r !== '한국') as Region[];
const ENTRY_TYPES: EntryType[] = ['lottery', 'fcfs', 'qualifying', 'open', 'tour_only'];
const STATUSES: [EntryStatus, string][] = [
  ['open', '신청 중'],
  ['upcoming', '오픈 예정'],
  ['closed', '마감'],
];
type Scope = 'all' | 'kr' | 'abroad';
type Sort = 'entry' | 'race_date' | 'flight' | 'rating';

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}

function Main() {
  const { profile } = useAuth();
  const [data, setData] = useState<Dataset | null>(null);
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [regions, setRegions] = useState<Region[]>([]);
  const [types, setTypes] = useState<EntryType[]>([]);
  const [statuses, setStatuses] = useState<EntryStatus[]>([]);
  const [majorOnly, setMajorOnly] = useState(false);
  const [maxFlight, setMaxFlight] = useState(24);
  const [sort, setSort] = useState<Sort>('entry');
  const [selected, setSelected] = useState<Race | null>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showRequest, setShowRequest] = useState(false);

  const reload = () => loadDataset().then(setData);
  useEffect(() => {
    reload();
  }, []);

  const today = TODAY();
  const ratingMap = useMemo(
    () => new Map((data?.ratings ?? []).map((r) => [r.race_id, r])),
    [data],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const out = data.races.filter((r) => {
      if (scope === 'kr' && !isDomestic(r)) return false;
      if (scope === 'abroad' && isDomestic(r)) return false;
      if (majorOnly && !r.is_major) return false;
      if (regions.length && !regions.includes(r.region)) return false;
      if (types.length && !types.includes(r.entry_type)) return false;
      if (statuses.length && !statuses.includes(entryStatus(r, today))) return false;
      if (!isDomestic(r) && r.flight_hours != null && r.flight_hours > maxFlight) return false;
      if (needle) {
        const hay = `${r.name_ko} ${r.name_en} ${r.city_ko} ${r.country_ko}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    return out.sort((a, b) => {
      if (sort === 'flight') return (a.flight_hours ?? 99) - (b.flight_hours ?? 99);
      if (sort === 'race_date') return a.race_date.localeCompare(b.race_date);
      if (sort === 'rating') {
        const ra = Number(ratingMap.get(a.id)?.avg_rating ?? 0);
        const rb = Number(ratingMap.get(b.id)?.avg_rating ?? 0);
        if (rb !== ra) return rb - ra;
        return entrySortKey(a, today) - entrySortKey(b, today);
      }
      return entrySortKey(a, today) - entrySortKey(b, today);
    });
  }, [data, q, scope, regions, types, statuses, majorOnly, maxFlight, sort, today, ratingMap]);

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

  const counts = useMemo(() => {
    if (!data) return { kr: 0, abroad: 0 };
    return {
      kr: data.races.filter(isDomestic).length,
      abroad: data.races.filter((r) => !isDomestic(r)).length,
    };
  }, [data]);

  const toggle = <T,>(list: T[], set: (v: T[]) => void, v: T) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const reset = () => {
    setQ('');
    setScope('all');
    setRegions([]);
    setTypes([]);
    setStatuses([]);
    setMajorOnly(false);
    setMaxFlight(24);
  };

  const active =
    q || scope !== 'all' || regions.length || types.length || statuses.length || majorOnly || maxFlight < 24;

  if (!data) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-zinc-500">불러오는 중…</div>;
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-50 sm:text-2xl">
                마라톤 <span className="text-emerald-400">캘린더</span>
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                국내 {counts.kr}개 · 해외 {counts.abroad}개 — 일정·신청 방식·비용·후기를 한 곳에서
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => setShowRequest(true)}
                className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
              >
                대회 추가 요청
              </button>
              {profile?.is_admin && (
                <button
                  onClick={() => setShowAdmin(true)}
                  className="rounded-lg bg-amber-400/15 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-400/25"
                >
                  관리자
                </button>
              )}
              <AuthBar onOpen={() => setShowAuth(true)} />
            </div>
          </div>
        </div>
      </header>

      {closingSoon.length > 0 && (
        <div className="border-b border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-xs font-semibold tracking-wide text-rose-400">마감 임박</span>
              {closingSoon.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelected(r)}
                  className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300 transition hover:bg-zinc-700"
                >
                  {r.name_ko}{' '}
                  <span className="font-semibold text-rose-400">D-{daysBetween(today, r.entry_closes!)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <div className="space-y-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex flex-wrap gap-2">
            <div className="flex overflow-hidden rounded-lg border border-zinc-700">
              {(
                [
                  ['all', '전체'],
                  ['kr', `국내 ${counts.kr}`],
                  ['abroad', `해외 ${counts.abroad}`],
                ] as [Scope, string][]
              ).map(([s, label]) => (
                <button
                  key={s}
                  onClick={() => {
                    setScope(s);
                    setRegions([]);
                  }}
                  className={`px-3 py-2 text-xs font-medium transition ${
                    scope === s ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-950 text-zinc-400 hover:bg-zinc-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="대회명 · 도시 · 국가 검색"
              className="min-w-[180px] flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-200 outline-none focus:border-emerald-500"
            >
              <option value="entry">접수 임박순</option>
              <option value="race_date">대회일 순</option>
              <option value="rating">평점 높은 순</option>
              <option value="flight">이동 시간 짧은 순</option>
            </select>
          </div>

          {scope !== 'kr' && (
            <FilterRow label="지역">
              {(scope === 'abroad' ? OVERSEAS : REGIONS).map((r) => (
                <Chip key={r} on={regions.includes(r)} onClick={() => toggle(regions, setRegions, r)}>
                  {r}
                </Chip>
              ))}
            </FilterRow>
          )}

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

          {scope !== 'kr' && (
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
            </div>
          )}

          {active && (
            <button
              onClick={reset}
              className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            >
              필터 초기화
            </button>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            <span className="font-semibold text-zinc-300">{filtered.length}</span>개 대회
          </p>
          <p className="text-xs text-zinc-600">
            데이터 출처: {data.source === 'supabase' ? 'Supabase (매주 갱신)' : '내장 시드'}
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
            <p className="text-sm text-zinc-500">조건에 맞는 대회가 없습니다.</p>
            <button
              onClick={() => setShowRequest(true)}
              className="mt-3 rounded-lg bg-zinc-800 px-4 py-2 text-xs text-zinc-200 transition hover:bg-zinc-700"
            >
              찾는 대회 추가 요청하기
            </button>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((r) => (
              <RaceCard key={r.id} race={r} rating={ratingMap.get(r.id)} onOpen={() => setSelected(r)} />
            ))}
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 text-center">
          <p className="text-sm text-zinc-300">보고 싶은 대회가 목록에 없나요?</p>
          <p className="mt-1 text-xs text-zinc-500">
            요청해 주시면 매주 돌아가는 정보 갱신 작업이 확인해서 넣습니다.
          </p>
          <button
            onClick={() => setShowRequest(true)}
            className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
          >
            대회 추가 요청
          </button>
        </div>

        <footer className="mt-12 border-t border-zinc-800 pt-6 text-xs leading-relaxed text-zinc-600">
          <p>
            대회 일정과 신청 기간은 주최 측 사정으로 예고 없이 변경될 수 있습니다. &lsquo;예상&rsquo;·&lsquo;미정&rsquo;
            표시가 붙은 항목은 직전 회차 패턴을 기준으로 추정한 값이며, 신청 전 각 대회 공식 홈페이지에서 반드시
            확인하세요. 비용 계산기의 금액은 참고용 추정치입니다. 후기 중 &lsquo;다른 사이트 후기&rsquo;는 링크만
            모아둔 것이며 본문의 저작권은 원저작자에게 있습니다.
          </p>
        </footer>
      </main>

      {selected && (
        <RaceDetail
          race={selected}
          agencies={data.agencies}
          packages={data.packages}
          costs={data.costs}
          rating={ratingMap.get(selected.id)}
          onClose={() => setSelected(null)}
          onLogin={() => setShowAuth(true)}
        />
      )}
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
      {showRequest && <RequestPanel onClose={() => setShowRequest(false)} onLogin={() => setShowAuth(true)} />}
      {showAdmin && profile?.is_admin && (
        <AdminPanel races={data.races} onClose={() => setShowAdmin(false)} onSaved={reload} />
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

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
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
