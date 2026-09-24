import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { MagnifyingGlass, SlidersHorizontal, CaretDown, Check, X, BookmarkSimple } from '@phosphor-icons/react';
import type { Race, EntryType, Region } from './lib/types';
import { ENTRY_LABEL, REGIONS } from './lib/types';
import { loadDataset, seedDataset, type Dataset } from './lib/data';
import { entryStatus, entrySortKey, daysBetween, TODAY, isDomestic, dateParts, type EntryStatus } from './lib/util';
import { AuthProvider, useAuth } from './lib/auth';
import { useFavorites } from './lib/favorites';
import RaceRow from './components/RaceRow';
import RaceDetail from './components/RaceDetail';
import AdminPanel from './components/AdminPanel';
import RequestPanel from './components/RequestPanel';
import { AuthBar, AuthForm } from './components/AuthPanel';
import { Panel, Note } from './components/ui';

const OVERSEAS = REGIONS.filter((r) => r !== '한국') as Region[];
const ENTRY_TYPES: EntryType[] = ['lottery', 'fcfs', 'qualifying', 'open', 'tour_only'];
type Scope = 'all' | 'kr' | 'abroad';
type Sort = 'entry' | 'race_date' | 'rating' | 'flight';
type StatusFilter = EntryStatus | 'closing7' | 'opening30';

const STATUS_GROUP: Record<EntryStatus, string> = {
  open: '지금 접수 중',
  upcoming: '곧 접수 시작',
  unknown: '접수 일정 미공개',
  closed: '이번 회차 접수 끝',
};

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}

function Main() {
  const auth = useAuth();
  const { profile } = auth;
  // 내장 데이터로 즉시 그리고, 서버 응답이 오면 교체한다.
  const [data, setData] = useState<Dataset>(seedDataset);
  const [remote, setRemote] = useState<'loading' | 'ok' | 'fallback'>('loading');
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [regions, setRegions] = useState<Region[]>([]);
  const [types, setTypes] = useState<EntryType[]>([]);
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [majorOnly, setMajorOnly] = useState(false);
  const [maxFlight, setMaxFlight] = useState(24);
  const [sort, setSort] = useState<Sort>('entry');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const fav = useFavorites();
  const [favOnly, setFavOnly] = useState(false);

  const [selected, setSelected] = useState<Race | null>(null);
  const [authMode, setAuthMode] = useState<null | 'in' | 'reset'>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showRequest, setShowRequest] = useState(false);

  const reload = () =>
    loadDataset().then((d) => {
      setData(d);
      setRemote(d.source === 'supabase' ? 'ok' : 'fallback');
    });
  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (auth.recovering) setAuthMode('reset');
  }, [auth.recovering]);

  // ?r=대회id 로 들어오면 그 대회를 바로 연다 (공유 링크)
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked) return;
    const id = new URLSearchParams(location.search).get('r');
    if (!id) return setDeepLinked(true);
    const r = data.races.find((x) => x.id === id);
    if (r) {
      setSelected(r);
      setDeepLinked(true);
    } else if (remote !== 'loading') setDeepLinked(true);
  }, [data, remote, deepLinked]);

  useEffect(() => {
    if (!deepLinked) return;
    const u = new URL(location.href);
    if (selected) u.searchParams.set('r', selected.id);
    else u.searchParams.delete('r');
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    document.title = selected ? `${selected.name_ko} | 마라톤 캘린더` : '마라톤 캘린더 | 국내·해외 마라톤 접수 일정';
  }, [selected, deepLinked]);

  const today = TODAY();
  const ratingMap = useMemo(() => new Map((data?.ratings ?? []).map((r) => [r.race_id, r])), [data]);

  const upcomingRaces = useMemo(
    () => (data ? data.races.filter((r) => daysBetween(today, r.race_date) >= 0) : []),
    [data, today],
  );
  const pastRaces = useMemo(
    () =>
      data
        ? data.races.filter((r) => daysBetween(today, r.race_date) < 0).sort((a, b) => b.race_date.localeCompare(a.race_date))
        : [],
    [data, today],
  );

  const stats = useMemo(() => {
    const open = upcomingRaces.filter((r) => entryStatus(r, today) === 'open');
    return {
      open: open.length,
      closing7: open.filter((r) => r.entry_closes && daysBetween(today, r.entry_closes) <= 7).length,
      opening30: upcomingRaces.filter(
        (r) => entryStatus(r, today) === 'upcoming' && r.entry_opens && daysBetween(today, r.entry_opens) <= 30,
      ).length,
      kr: upcomingRaces.filter(isDomestic).length,
      abroad: upcomingRaces.filter((r) => !isDomestic(r)).length,
    };
  }, [upcomingRaces, today]);

  const matches = (r: Race) => {
    if (favOnly && !fav.has(r.id)) return false;
    if (scope === 'kr' && !isDomestic(r)) return false;
    if (scope === 'abroad' && isDomestic(r)) return false;
    if (majorOnly && !r.is_major) return false;
    if (regions.length && !regions.includes(r.region)) return false;
    if (types.length && !types.includes(r.entry_type)) return false;
    if (status) {
      const st = entryStatus(r, today);
      if (status === 'closing7') {
        if (st !== 'open' || !r.entry_closes || daysBetween(today, r.entry_closes) > 7) return false;
      } else if (status === 'opening30') {
        if (st !== 'upcoming' || !r.entry_opens || daysBetween(today, r.entry_opens) > 30) return false;
      } else if (st !== status) return false;
    }
    if (!isDomestic(r) && r.flight_hours != null && r.flight_hours > maxFlight) return false;
    const needle = q.trim().toLowerCase();
    if (needle && !`${r.name_ko} ${r.name_en} ${r.city_ko} ${r.country_ko}`.toLowerCase().includes(needle)) return false;
    return true;
  };

  const groups = useMemo(() => {
    const list = upcomingRaces.filter(matches);
    const byEntry = (a: Race, b: Race) => entrySortKey(a, today) - entrySortKey(b, today);
    if (sort === 'entry') {
      const order: EntryStatus[] = ['open', 'upcoming', 'unknown', 'closed'];
      return order
        .map((st) => ({
          key: st,
          title: STATUS_GROUP[st],
          races: list.filter((r) => entryStatus(r, today) === st).sort(byEntry),
        }))
        .filter((g) => g.races.length);
    }
    if (sort === 'race_date') {
      const sorted = [...list].sort((a, b) => a.race_date.localeCompare(b.race_date));
      const map = new Map<string, Race[]>();
      for (const r of sorted) {
        const p = dateParts(r.race_date);
        const k = `${p.y}년 ${p.m}월`;
        map.set(k, [...(map.get(k) ?? []), r]);
      }
      return [...map.entries()].map(([k, races]) => ({ key: k, title: k, races }));
    }
    const sorted = [...list].sort((a, b) => {
      if (sort === 'flight') return (a.flight_hours ?? 99) - (b.flight_hours ?? 99);
      const d = Number(ratingMap.get(b.id)?.avg_rating ?? 0) - Number(ratingMap.get(a.id)?.avg_rating ?? 0);
      return d || byEntry(a, b);
    });
    return [{ key: 'all', title: sort === 'flight' ? '가까운 곳부터' : '평점 높은 순', races: sorted }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingRaces, q, scope, regions, types, status, majorOnly, maxFlight, sort, today, ratingMap, favOnly, fav.ids]);

  const shown = groups.reduce((n, g) => n + g.races.length, 0);
  const activeFilters = regions.length + types.length + (status ? 1 : 0) + (majorOnly ? 1 : 0) + (maxFlight < 24 ? 1 : 0);

  const reset = () => {
    setQ('');
    setScope('all');
    setRegions([]);
    setTypes([]);
    setStatus(null);
    setMajorOnly(false);
    setMaxFlight(24);
    setFavOnly(false);
  };

  const toggle = <T,>(list: T[], set: (v: T[]) => void, v: T) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const pickStatus = (s: StatusFilter) => {
    setStatus((cur) => (cur === s ? null : s));
    setSort('entry');
    document.getElementById('list')?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="min-h-dvh">
      <a
        href="#list"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-ctl focus:bg-ink focus:px-3 focus:py-2 focus:text-bg"
      >
        목록으로 건너뛰기
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5">
            <span className="num grid size-8 place-items-center rounded-tag bg-accent text-[17px] font-bold text-on-accent">42</span>
            <span className="text-[17px] font-extrabold tracking-tight">마라톤 캘린더</span>
          </a>
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => setShowRequest(true)}
              className="hidden h-8 items-center rounded-ctl px-3 text-[14px] font-semibold text-ink-2 transition hover:bg-sunken hover:text-ink sm:inline-flex"
            >
              대회 추가 요청
            </button>
            {profile?.is_admin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="inline-flex h-8 items-center rounded-ctl px-3 text-[14px] font-semibold text-ink-2 transition hover:bg-sunken hover:text-ink"
              >
                관리
              </button>
            )}
            <AuthBar onOpen={() => setAuthMode('in')} />
          </nav>
        </div>
      </header>

      <main>
        {auth.justConfirmed && (
          <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
            <div className="flex items-center justify-between gap-3 rounded-box bg-accent px-4 py-3 text-on-accent">
              <span className="text-[15px] font-semibold">메일 인증이 끝났습니다. 이제 후기를 남길 수 있어요.</span>
              <button onClick={auth.clearFlags} aria-label="닫기" className="grid size-8 place-items-center rounded-ctl hover:bg-black/10">
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>
        )}

        {/* 소개 + 현황판 */}
        <section className="mx-auto grid max-w-6xl gap-8 px-4 pt-10 pb-8 sm:px-6 md:grid-cols-[1fr_auto] md:items-end md:pt-14 md:pb-10">
          <div>
            <h1 className="text-[34px] leading-[1.12] font-extrabold tracking-[-0.03em] sm:text-[46px]">
              마라톤 접수,
              <br />
              이번엔 놓치지 않게
            </h1>
            <p className="mt-4 max-w-[42ch] text-[16px] leading-relaxed text-balance text-ink-2 sm:text-[17px]">
              국내 {stats.kr}개, 해외 {stats.abroad}개 대회의 접수 방식과 마감일을 접수 순서대로 정리했습니다.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-box bg-line md:w-[27rem]">
            <Stat label="지금 접수 중" value={stats.open} active={status === 'open'} onClick={() => pickStatus('open')} />
            <Stat
              label="7일 안에 마감"
              value={stats.closing7}
              active={status === 'closing7'}
              hot={stats.closing7 > 0}
              onClick={() => pickStatus('closing7')}
            />
            <Stat
              label="30일 안에 시작"
              value={stats.opening30}
              active={status === 'opening30'}
              onClick={() => pickStatus('opening30')}
            />
          </div>
        </section>

        {/* 도구 막대 */}
        <div className="sticky top-14 z-20 border-y border-line bg-bg/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
            <div role="radiogroup" aria-label="국내 해외" className="inline-flex rounded-ctl bg-sunken p-1">
              {(
                [
                  ['all', '전체', stats.kr + stats.abroad],
                  ['kr', '국내', stats.kr],
                  ['abroad', '해외', stats.abroad],
                ] as [Scope, string, number][]
              ).map(([s, label, n]) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={scope === s}
                  onClick={() => {
                    setScope(s);
                    setRegions([]);
                  }}
                  className={`flex h-8 items-center gap-1.5 rounded-[4px] px-3 text-[14px] font-semibold transition ${
                    scope === s ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {label}
                  <span className="num text-[15px] text-ink-3">{n}</span>
                </button>
              ))}
            </div>

            <label className="relative order-last w-full sm:order-none sm:w-auto sm:flex-1">
              <span className="sr-only">대회 검색</span>
              <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="대회 이름, 도시, 나라"
                className="h-10 w-full rounded-ctl border border-line bg-surface pr-3 pl-9 text-[15px] outline-none transition placeholder:text-ink-3 focus:border-ink"
              />
            </label>

            <div className="ml-auto flex items-center gap-2 sm:ml-0">
              <label className="relative">
                <span className="sr-only">정렬</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="h-10 appearance-none rounded-ctl border border-line bg-surface pr-9 pl-3 text-[14px] font-semibold outline-none focus:border-ink"
                >
                  <option value="entry">접수 순서</option>
                  <option value="race_date">대회 날짜</option>
                  <option value="rating">평점</option>
                  <option value="flight">가까운 곳</option>
                </select>
                <CaretDown size={14} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3" />
              </label>
              {fav.ids.length > 0 && (
                <button
                  onClick={() => setFavOnly((v) => !v)}
                  aria-pressed={favOnly}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-ctl border px-3 text-[14px] font-semibold transition ${
                    favOnly ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:border-ink'
                  }`}
                >
                  <BookmarkSimple size={16} weight={favOnly ? 'fill' : 'bold'} />
                  <span className="num text-[15px]">{fav.ids.length}</span>
                  <span className="sr-only">관심 대회만 보기</span>
                </button>
              )}
              <button
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                className={`inline-flex h-10 items-center gap-2 rounded-ctl border px-3 text-[14px] font-semibold transition ${
                  filtersOpen || activeFilters ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:border-ink'
                }`}
              >
                <SlidersHorizontal size={16} weight="bold" />
                필터
                {activeFilters > 0 && <span className="num text-[15px]">{activeFilters}</span>}
              </button>
            </div>
          </div>

          {filtersOpen && (
            <div className="border-t border-line">
              <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:px-6 md:grid-cols-2">
                {scope !== 'kr' && (
                  <FilterGroup label="지역">
                    {(scope === 'abroad' ? OVERSEAS : REGIONS).map((r) => (
                      <Chip key={r} on={regions.includes(r)} onClick={() => toggle(regions, setRegions, r)}>
                        {r}
                      </Chip>
                    ))}
                  </FilterGroup>
                )}
                <FilterGroup label="접수 방식">
                  {ENTRY_TYPES.map((t) => (
                    <Chip key={t} on={types.includes(t)} onClick={() => toggle(types, setTypes, t)}>
                      {ENTRY_LABEL[t]}
                    </Chip>
                  ))}
                </FilterGroup>
                <FilterGroup label="접수 상태">
                  {(
                    [
                      ['open', '접수 중'],
                      ['upcoming', '접수 예정'],
                      ['closed', '접수 끝'],
                    ] as [EntryStatus, string][]
                  ).map(([s, label]) => (
                    <Chip key={s} on={status === s} onClick={() => setStatus(status === s ? null : s)}>
                      {label}
                    </Chip>
                  ))}
                  <Chip on={majorOnly} onClick={() => setMajorOnly(!majorOnly)}>
                    메이저만
                  </Chip>
                </FilterGroup>
                {scope !== 'kr' && (
                  <FilterGroup label="비행시간">
                    <input
                      type="range"
                      min={2}
                      max={24}
                      value={maxFlight}
                      onChange={(e) => setMaxFlight(Number(e.target.value))}
                      className="w-40"
                      aria-label="최대 비행시간"
                    />
                    <span className="num text-[16px] font-semibold">{maxFlight >= 24 ? '제한 없음' : `${maxFlight}시간 이내`}</span>
                  </FilterGroup>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 목록 */}
        <section id="list" className="mx-auto max-w-6xl scroll-mt-32 px-1 pb-16 sm:px-2">
          {shown === 0 ? (
            <div className="px-3 py-20 text-center">
              <p className="text-[17px] font-semibold">조건에 맞는 대회가 없습니다.</p>
              <div className="mt-4 flex justify-center gap-3">
                <button onClick={reset} className="h-10 rounded-ctl bg-sunken px-4 text-sm font-semibold hover:bg-line">
                  필터 풀기
                </button>
                <button onClick={() => setShowRequest(true)} className="h-10 rounded-ctl bg-ink px-4 text-sm font-semibold text-bg">
                  대회 추가 요청
                </button>
              </div>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key} className="pt-8">
                <h2 className="flex items-baseline gap-2 px-3 pb-2 sm:px-5">
                  <span className="text-[19px] font-extrabold tracking-tight">{g.title}</span>
                  <span className="num text-[18px] font-semibold text-ink-3">{g.races.length}</span>
                </h2>
                <ul className="divide-y divide-line border-y border-line">
                  {g.races.map((r) => (
                    <RaceRow key={r.id} race={r} rating={ratingMap.get(r.id)} favorite={fav.has(r.id)} onOpen={() => setSelected(r)} />
                  ))}
                </ul>
              </div>
            ))
          )}

          {pastRaces.length > 0 && (
            <div className="px-3 pt-10 sm:px-5">
              <button
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-3 hover:text-ink"
              >
                이미 끝난 대회 {pastRaces.length}개 {showPast ? '접기' : '보기'}
                <CaretDown size={14} className={showPast ? 'rotate-180' : ''} />
              </button>
              {showPast && (
                <ul className="mt-3 divide-y divide-line border-y border-line opacity-70">
                  {pastRaces.map((r) => (
                    <RaceRow key={r.id} race={r} rating={ratingMap.get(r.id)} favorite={fav.has(r.id)} onOpen={() => setSelected(r)} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* 요청 안내 */}
        <section className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[22px] font-extrabold tracking-tight">찾는 대회가 없나요?</h2>
              <p className="mt-1 text-[15px] text-ink-2">알려주시면 매주 월요일 일정을 확인할 때 같이 넣습니다.</p>
            </div>
            <button
              onClick={() => setShowRequest(true)}
              className="h-11 shrink-0 self-start rounded-ctl bg-accent px-5 text-[15px] font-bold text-on-accent transition hover:brightness-95 active:translate-y-px md:self-auto"
            >
              대회 추가 요청
            </button>
          </div>
        </section>

        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-8 text-[13px] leading-relaxed text-ink-3 sm:px-6">
            <p className="max-w-[70ch]">
              일정과 접수 기간은 주최 측 사정으로 바뀔 수 있습니다. 날짜 옆에 예상이라고 적힌 값은 지난 대회를 바탕으로 짐작한
              것이니 신청 전에 공식 홈페이지를 꼭 확인하세요. 비용은 참고용 추정치이고, 다른 곳 후기는 링크만 모았으며 글의
              저작권은 쓴 분에게 있습니다.
            </p>
          </div>
        </footer>
      </main>

      <Panel open={!!selected} onClose={() => setSelected(null)} label={selected?.name_ko ?? '대회 정보'}>
        {selected && (
          <RaceDetail
            race={selected}
            agencies={data.agencies}
            packages={data.packages}
            costs={data.costs}
            rating={ratingMap.get(selected.id)}
            favorite={fav.has(selected.id)}
            onToggleFavorite={() => fav.toggle(selected.id)}
            onClose={() => setSelected(null)}
            onLogin={() => setAuthMode('in')}
          />
        )}
      </Panel>

      <Panel open={showRequest} onClose={() => setShowRequest(false)} label="대회 추가 요청">
        <RequestPanel onClose={() => setShowRequest(false)} onLogin={() => setAuthMode('in')} />
      </Panel>

      <Panel open={showAdmin && !!profile?.is_admin} onClose={() => setShowAdmin(false)} label="관리">
        {<AdminPanel races={data.races} onClose={() => setShowAdmin(false)} onSaved={reload} />}
      </Panel>

      <Panel
        variant="sheet"
        open={authMode !== null}
        onClose={() => {
          setAuthMode(null);
          auth.clearFlags();
        }}
        label="로그인"
      >
        {authMode && (
          <AuthForm
            initial={authMode}
            onClose={() => {
              setAuthMode(null);
              auth.clearFlags();
            }}
          />
        )}
      </Panel>

      {remote !== 'fallback' ? null : (
        <div className="fixed right-4 bottom-4 z-40 max-w-xs">
          <Note tone="info">서버에 연결하지 못해 저장된 기본 목록을 보여주고 있습니다.</Note>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  active,
  hot,
  onClick,
}: {
  label: string;
  value: number;
  active?: boolean;
  hot?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`flex flex-col items-start px-4 py-3.5 text-left transition ${
        active ? 'bg-ink text-bg' : hot ? 'bg-accent text-on-accent hover:brightness-95' : 'bg-surface hover:bg-sunken'
      }`}
    >
      <span className={`text-[13px] ${active || hot ? 'opacity-75' : 'text-ink-3'}`}>{label}</span>
      <span className="num mt-1 text-[40px] leading-none font-bold">{value}</span>
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-16 shrink-0 text-[13px] font-semibold text-ink-3">{label}</span>
      {children}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex h-8 items-center gap-1 rounded-ctl px-3 text-[14px] font-semibold transition active:translate-y-px ${
        on ? 'bg-ink text-bg' : 'bg-surface text-ink-2 hover:bg-sunken hover:text-ink'
      }`}
    >
      {on && <Check size={13} weight="bold" />}
      {children}
    </button>
  );
}
