import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { MagnifyingGlass, SlidersHorizontal, CaretDown, Check, X, BookmarkSimple, MapTrifold, CheckSquare } from '@phosphor-icons/react';
import type { Race, EntryType, Region, Discipline } from './lib/types';
import { ENTRY_LABEL, REGIONS, DISCIPLINES, DISCIPLINE_LABEL } from './lib/types';
import { loadDataset, emptyDataset, type Dataset } from './lib/data';
import {
  entryStatus,
  entrySortKey,
  daysBetween,
  TODAY,
  isDomestic,
  isTrail,
  dateParts,
  shortCount,
  type EntryStatus,
} from './lib/util';
import { AuthProvider, useAuth } from './lib/auth';
import { useFavorites } from './lib/favorites';
import { useRegistered } from './lib/registered';
import RaceRow from './components/RaceRow';
import RaceDetail from './components/RaceDetail';
import AdminPanel from './components/AdminPanel';
import RequestPanel from './components/RequestPanel';
import { AuthBar, AuthForm } from './components/AuthPanel';
import { Panel, Note } from './components/ui';
import { PROVINCES, placeOf } from './lib/places';
import { track, pageView } from './lib/analytics';

const MapView = lazy(() => import('./components/MapView'));

// 목록이 길어도 처음엔 이만큼만 그리고, 아래로 내려가면 더 붙인다.
const PAGE = 80;

const OVERSEAS = REGIONS.filter((r) => r !== '한국') as Region[];
const ENTRY_TYPES: EntryType[] = ['lottery', 'fcfs', 'qualifying', 'open', 'tour_only'];
type Scope = 'all' | 'kr' | 'abroad';
type Sort = 'entry' | 'race_date' | 'popular' | 'size' | 'flight';
type StatusFilter = EntryStatus | 'closing7' | 'opening30';

const STATUS_GROUP: Record<EntryStatus, string> = {
  open: '지금 접수 중',
  upcoming: '곧 접수 시작',
  unknown: '접수 일정 미공개',
  soldout: '조기 마감',
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
  const [data, setData] = useState<Dataset>(emptyDataset);
  const [remote, setRemote] = useState<'loading' | 'ok' | 'fallback'>('loading');
  // ?q=검색어 로 들어오면 (구글 검색창 바로가기 등) 그 검색어로 시작
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  const [scope, setScope] = useState<Scope>('all');
  const [regions, setRegions] = useState<Region[]>([]);
  // 지도·칩에서 고른 곳: 국내는 시·도 id, 해외는 나라 코드(소문자), 'kr' 은 국내 전체
  const [place, setPlace] = useState<string | null>(null);
  // 지도는 기본으로 펼쳐 둔다 (접어 두면 다음 방문에도 접힌 채로)
  const [mapOpen, setMapOpenState] = useState(() => {
    try {
      return localStorage.getItem('marathon-cal:map') !== 'closed';
    } catch {
      return true;
    }
  });
  const setMapOpen = (fn: (v: boolean) => boolean) =>
    setMapOpenState((v) => {
      const next = fn(v);
      try {
        localStorage.setItem('marathon-cal:map', next ? 'open' : 'closed');
      } catch {
        /* 저장 못 해도 동작에는 지장 없음 */
      }
      return next;
    });
  const [types, setTypes] = useState<EntryType[]>([]);
  const [status, setStatus] = useState<StatusFilter | null>(null);
  const [majorOnly, setMajorOnly] = useState(false);
  const [maxFlight, setMaxFlight] = useState(24);
  const [sort, setSort] = useState<Sort>('entry');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [pastLimit, setPastLimit] = useState(PAGE);
  const fav = useFavorites();
  const [favOnly, setFavOnly] = useState(false);
  const reg = useRegistered();
  const [regOnly, setRegOnly] = useState(false);
  const [discipline, setDiscipline] = useState<Discipline | null>(null);
  // 마지막 접수 표시를 지우면 버튼이 사라지므로 필터도 같이 끈다
  useEffect(() => {
    if (!reg.ids.length) setRegOnly(false);
  }, [reg.ids.length]);

  const [selected, setSelected] = useState<Race | null>(null);
  const [authMode, setAuthMode] = useState<null | 'in' | 'reset'>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showRequest, setShowRequest] = useState(false);

  const reload = (live = false) =>
    loadDataset({ live }).then((d) => {
      setData(d);
      setRemote(d.source === 'none' ? 'fallback' : 'ok');
    });
  useEffect(() => {
    reload();
  }, []);
  // 관리자는 방금 고친 내용이 바로 보이도록 DB 에서 직접 읽는다
  useEffect(() => {
    if (profile?.is_admin) reload(true);
  }, [profile?.is_admin]);

  useEffect(() => {
    if (auth.recovering) setAuthMode('reset');
  }, [auth.recovering]);

  // /r/대회id (또는 예전 ?r=대회id) 로 들어오면 그 대회를 바로 연다 (공유 링크)
  const [deepLinked, setDeepLinked] = useState(false);
  useEffect(() => {
    if (deepLinked) return;
    const id = location.pathname.match(/^\/r\/([a-z0-9-]+)/)?.[1] ?? new URLSearchParams(location.search).get('r');
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
    u.searchParams.delete('r');
    u.pathname = selected ? `/r/${selected.id}` : '/';
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    document.title = selected
      ? `${selected.name_ko} ${selected.race_date.slice(0, 4)} 일정·접수 기간 | 마라톤 캘린더`
      : '마라톤 캘린더 - 2026·2027 국내·해외 마라톤 대회 일정과 접수 기간';
    if (selected) {
      pageView(document.title);
      track('race_view', {
        race_id: selected.id,
        race_name: selected.name_ko,
        region: selected.region,
        country: selected.country_code,
      });
    }
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

  // 지역 막대·지도에 쓰는 숫자 (국내/해외 선택만 반영해서 다른 필터를 바꿔도 지도가 흔들리지 않게)
  const geo = useMemo(() => {
    const base = upcomingRaces.filter((r) => (scope === 'kr' ? isDomestic(r) : scope === 'abroad' ? !isDomestic(r) : true));
    const region: Partial<Record<Region, number>> = {};
    const province: Record<string, number> = {};
    const country: Record<string, number> = {};
    const names: Record<string, string> = { kr: '한국' };
    const inRegion: Record<string, number> = {};
    for (const r of base) {
      region[r.region] = (region[r.region] ?? 0) + 1;
      if (isDomestic(r)) {
        const pv = placeOf(r, true);
        if (pv) province[pv] = (province[pv] ?? 0) + 1;
        country.kr = (country.kr ?? 0) + 1;
      } else {
        const c = r.country_code.toLowerCase();
        country[c] = (country[c] ?? 0) + 1;
        names[c] = r.country_ko;
        if (regions.includes(r.region)) inRegion[c] = (inRegion[c] ?? 0) + 1;
      }
    }
    for (const p of PROVINCES) names[p.id] = p.name;
    const regionCountries = Object.entries(inRegion).sort((a, b) => b[1] - a[1]);
    return { region, province, country, names, regionCountries };
  }, [upcomingRaces, scope, regions]);

  const pickPlace = (id: string | null) => {
    if (id === 'kr' && scope !== 'kr') {
      setScope('kr');
      setRegions([]);
      setPlace(null);
    } else setPlace(id);
    if (id) track('map_select', { place: id });
    document.getElementById('list')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // 인기 점수: 최근 7일(조회 + 저장·공유·공식 홈페이지 이동 가중) 을 먼저, 같으면 누적 조회
  const popScore = (r: Race) => {
    const s = ratingMap.get(r.id);
    return (s?.hot ?? 0) * 1000 + (s?.views ?? 0) + (s?.saves ?? 0) * 3;
  };
  const hotList = useMemo(
    () =>
      upcomingRaces
        .filter((r) => (ratingMap.get(r.id)?.hot ?? 0) > 0)
        .sort((a, b) => (ratingMap.get(b.id)?.hot ?? 0) - (ratingMap.get(a.id)?.hot ?? 0))
        .slice(0, 6),
    [upcomingRaces, ratingMap],
  );

  const matches = (r: Race) => {
    if (favOnly && !fav.has(r.id)) return false;
    if (regOnly && !reg.has(r.id)) return false;
    if (discipline && (isTrail(r) ? 'trail' : 'road') !== discipline) return false;
    if (scope === 'kr' && !isDomestic(r)) return false;
    if (scope === 'abroad' && isDomestic(r)) return false;
    if (majorOnly && !r.is_major) return false;
    if (regions.length && !regions.includes(r.region)) return false;
    if (place && (place === 'kr' ? !isDomestic(r) : placeOf(r, isDomestic(r)) !== place)) return false;
    if (types.length && !types.includes(r.entry_type)) return false;
    if (status) {
      const st = entryStatus(r, today);
      if (status === 'closing7') {
        if (st !== 'open' || !r.entry_closes || daysBetween(today, r.entry_closes) > 7) return false;
      } else if (status === 'opening30') {
        if (st !== 'upcoming' || !r.entry_opens || daysBetween(today, r.entry_opens) > 30) return false;
      } else if (status === 'closed') {
        // '접수 끝' 칩은 정원이 차서 일찍 끝난 대회도 함께 보여 준다
        if (st !== 'closed' && st !== 'soldout') return false;
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
    // 접수한 대회만 볼 때는 접수 상태가 의미 없으니 대회일 순 한 묶음
    if (regOnly) {
      const sorted = [...list].sort((a, b) => a.race_date.localeCompare(b.race_date));
      return [{ key: 'registered', title: '접수한 대회', races: sorted }];
    }
    if (sort === 'entry') {
      const order: EntryStatus[] = ['open', 'upcoming', 'unknown', 'soldout', 'closed'];
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
      if (sort === 'size') return (b.field_size ?? -1) - (a.field_size ?? -1) || byEntry(a, b);
      return popScore(b) - popScore(a) || byEntry(a, b);
    });
    return [{ key: 'all', title: sort === 'flight' ? '가까운 곳부터' : sort === 'size' ? '참가자 많은 순 (규모 미공개 대회는 맨 뒤)' : '인기순 (최근 7일 조회·저장 기준)', races: sorted }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingRaces, q, scope, regions, place, types, status, majorOnly, maxFlight, sort, today, ratingMap, favOnly, fav.ids, regOnly, reg.ids, discipline]);

  const shown = groups.reduce((n, g) => n + g.races.length, 0);
  const activeFilters =
    types.length + (status ? 1 : 0) + (majorOnly ? 1 : 0) + (maxFlight < 24 ? 1 : 0) + (discipline ? 1 : 0);

  const reset = () => {
    setQ('');
    setScope('all');
    setRegions([]);
    setPlace(null);
    setTypes([]);
    setStatus(null);
    setMajorOnly(false);
    setMaxFlight(24);
    setFavOnly(false);
    setRegOnly(false);
    setDiscipline(null);
  };

  const openRace = useCallback((r: Race) => setSelected(r), []);

  // 검색어: 입력이 1.2초 멈추면 한 번 기록 (결과 0건이면 '찾는데 없는 대회'로 따로 센다)
  const shownRef = useRef(0);
  shownRef.current = shown;
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => track('search', { search_term: term, results: shownRef.current }), 1200);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (maxFlight >= 24) return;
    const t = setTimeout(() => track('filter', { name: 'flight', value: `${maxFlight}h` }), 1200);
    return () => clearTimeout(t);
  }, [maxFlight]);

  // 필터·정렬이 바뀌면 처음부터 다시 보여준다
  useEffect(() => setLimit(PAGE), [groups]);

  // 목록 맨 아래가 가까워지면 다음 묶음을 붙인다
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || limit >= shown) return;
    const io = new IntersectionObserver((e) => e[0].isIntersecting && setLimit((n) => n + PAGE), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [limit, shown]);

  // 그룹 순서를 유지한 채 앞에서 limit 개까지만
  const visible = useMemo(() => {
    let left = limit;
    return groups
      .map((g) => {
        const races = g.races.slice(0, Math.max(left, 0));
        left -= races.length;
        return { ...g, races, total: g.races.length };
      })
      .filter((g) => g.races.length);
  }, [groups, limit]);

  const toggle = <T,>(list: T[], set: (v: T[]) => void, v: T) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const pickStatus = (s: StatusFilter) => {
    if (status !== s) track('filter', { name: 'status', value: s });
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

      <header className="sticky top-0 z-30 border-b border-line bg-bg">
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
              <span className="text-[15px] font-semibold">메일 인증이 끝났습니다. 이제 후기를 남길 수 있습니다.</span>
              <button onClick={auth.clearFlags} aria-label="닫기" className="grid size-8 place-items-center rounded-ctl hover:bg-on-accent/10">
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>
        )}

        {/* 소개 + 현황판 */}
        <section className="mx-auto grid max-w-6xl gap-8 px-4 pt-10 pb-8 sm:px-6 md:grid-cols-[1fr_auto] md:items-end md:pt-14 md:pb-10">
          <div>
            <h1 className="text-[34px] leading-[1.12] font-extrabold tracking-[-0.03em] sm:text-[46px]">
              마라톤 접수 일정
            </h1>
            <p className="mt-4 max-w-[42ch] text-[16px] leading-relaxed text-balance text-ink-2 sm:text-[17px]">
              {remote === 'loading' ? '국내·해외 마라톤의 접수 방식과 기간을 접수가 가까운 순서로 모았습니다.' : <>국내 {stats.kr}개, 해외 {stats.abroad}개 대회의 접수 방식과 기간을 접수가 가까운 순서로 모았습니다.
            </>}</p>
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

        {/* 요즘 인기: 최근 7일 조회·저장이 많은 대회 */}
        {hotList.length >= 3 && (
          <section className="mx-auto max-w-6xl px-4 pb-6 sm:px-6" aria-label="요즘 인기 대회">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-bold">요즘 많이 보는 대회</h2>
              <button
                onClick={() => {
                  setSort('popular');
                  track('filter', { name: 'sort', value: 'popular' });
                  document.getElementById('list')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }}
                className="text-[13px] font-semibold text-ink-3 underline underline-offset-4 hover:text-ink"
              >
                인기순 전체 보기
              </button>
            </div>
            <ol className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6">
              {hotList.map((r, i) => {
                const st = ratingMap.get(r.id);
                const p = dateParts(r.race_date);
                return (
                  <li key={r.id} className="w-[11.5rem] shrink-0 sm:w-auto">
                    <button
                      onClick={() => openRace(r)}
                      className="flex h-full w-full flex-col items-start gap-1 rounded-box bg-surface px-3.5 py-3 text-left transition hover:bg-sunken"
                    >
                      <span className="num text-[13px] font-bold text-ink-3">{i + 1}위</span>
                      <span className="line-clamp-2 text-[15px] leading-snug font-bold">{r.name_ko}</span>
                      <span className="text-[13px] text-ink-3">
                        {p.m}월 {p.d}일 · {isDomestic(r) ? r.city_ko.split(' ')[0] : r.country_ko}
                      </span>
                      <span className="mt-auto text-[12px] text-ink-3">
                        조회 <span className="num text-[13px]">{shortCount(st?.views ?? 0)}</span>
                        {(st?.saves ?? 0) > 0 && (
                          <>
                            {' '}· 저장 <span className="num text-[13px]">{shortCount(st!.saves!)}</span>
                          </>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </section>
        )}

        {/* 도구 막대 */}
        <div className="border-y border-line bg-bg sm:sticky sm:top-14 sm:z-20">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-2.5 sm:px-6">
            <div role="radiogroup" aria-label="국내 해외" className="grid w-full grid-cols-3 rounded-ctl bg-sunken p-1 sm:inline-flex sm:w-auto">
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
                    setPlace(null);
                    if (s !== scope) track('filter', { name: 'scope', value: s });
                  }}
                  className={`flex h-9 items-center gap-1.5 rounded-[4px] px-3 sm:h-8 text-[14px] font-semibold transition ${
                    scope === s ? 'bg-surface text-ink shadow-[0_1px_2px_var(--shadow)]' : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {label}
                  <span className="num text-[15px] text-ink-3">{n}</span>
                </button>
              ))}
            </div>

            <label className="relative order-first w-full sm:order-none sm:w-auto sm:flex-1">
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

            <div className="flex w-full items-center justify-end gap-2 sm:ml-0 sm:w-auto">
              <label className="relative">
                <span className="sr-only">정렬</span>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as Sort);
                    track('filter', { name: 'sort', value: e.target.value });
                  }}
                  className="h-10 appearance-none rounded-ctl border border-line bg-surface pr-9 pl-3 text-[14px] font-semibold outline-none focus:border-ink"
                >
                  <option value="entry">접수 순서</option>
                  <option value="race_date">대회 날짜</option>
                  <option value="popular">인기순</option>
                  <option value="size">규모순</option>
                  <option value="flight">가까운 곳</option>
                </select>
                <CaretDown size={14} className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3" />
              </label>
              {fav.ids.length > 0 && (
                <button
                  onClick={() => {
                    if (!favOnly) track('filter', { name: 'favorites', value: 'on' });
                    setFavOnly((v) => !v);
                  }}
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
              {reg.ids.length > 0 && (
                <button
                  onClick={() => {
                    if (!regOnly) track('filter', { name: 'registered', value: 'on' });
                    setRegOnly((v) => !v);
                  }}
                  aria-pressed={regOnly}
                  title="접수한 대회"
                  className={`inline-flex h-10 items-center gap-1.5 rounded-ctl border px-3 text-[14px] font-semibold transition ${
                    regOnly ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:border-ink'
                  }`}
                >
                  <CheckSquare size={16} weight={regOnly ? 'fill' : 'bold'} />
                  <span className="hidden sm:inline">접수한 대회</span>
                  <span className="num text-[15px]">{reg.ids.length}</span>
                  <span className="sr-only sm:hidden">접수한 대회만 보기</span>
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
                <FilterGroup label="종목">
                  {DISCIPLINES.map((d) => (
                    <Chip
                      key={d}
                      on={discipline === d}
                      onClick={() => {
                        if (discipline !== d) track('filter', { name: 'discipline', value: d });
                        setDiscipline(discipline === d ? null : d);
                      }}
                    >
                      {DISCIPLINE_LABEL[d]}
                    </Chip>
                  ))}
                </FilterGroup>
                <FilterGroup label="접수 방식">
                  {ENTRY_TYPES.map((t) => (
                    <Chip key={t} on={types.includes(t)} onClick={() => {
                        if (!types.includes(t)) track('filter', { name: 'entry_type', value: t });
                        toggle(types, setTypes, t);
                      }}>
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
                    <Chip
                      key={s}
                      on={status === s}
                      onClick={() => {
                        if (status !== s) track('filter', { name: 'status', value: s });
                        setStatus(status === s ? null : s);
                      }}
                    >
                      {label}
                    </Chip>
                  ))}
                  <Chip
                    on={majorOnly}
                    onClick={() => {
                      if (!majorOnly) track('filter', { name: 'major', value: 'on' });
                      setMajorOnly(!majorOnly);
                    }}
                  >
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

        {/* 지역 막대 + 지도 */}
        <section className="mx-auto max-w-6xl px-4 pt-4 sm:px-6" aria-label="지역별로 보기">
          <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
            <button
              onClick={() => {
                setMapOpen((v) => !v);
                if (!mapOpen) track('map_open', { scope });
              }}
              aria-expanded={mapOpen}
              className={`inline-flex h-10 shrink-0 items-center gap-1.5 rounded-ctl border px-3 text-[14px] font-semibold transition sm:h-8 ${
                mapOpen ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:border-ink'
              }`}
            >
              <MapTrifold size={16} weight="bold" />
              {mapOpen ? '지도 접기' : '지도로 보기'}
            </button>
            {scope === 'kr'
              ? PROVINCES.filter((p) => geo.province[p.id])
                  .sort((a, b) => (geo.province[b.id] ?? 0) - (geo.province[a.id] ?? 0))
                  .map((p) => (
                    <Chip key={p.id} on={place === p.id} onClick={() => pickPlace(place === p.id ? null : p.id)}>
                      {p.name}
                      <span className="num ml-0.5 text-[14px] opacity-80">{geo.province[p.id]}</span>
                    </Chip>
                  ))
              : (scope === 'abroad' ? OVERSEAS : REGIONS)
                  .filter((r) => geo.region[r])
                  .map((r) => (
                    <Chip
                      key={r}
                      on={regions.includes(r)}
                      onClick={() => {
                        if (!regions.includes(r)) track('filter', { name: 'region', value: r });
                        setRegions(regions.includes(r) ? regions.filter((x) => x !== r) : [r]);
                        setPlace(null);
                      }}
                    >
                      {r}
                      <span className="num ml-0.5 text-[14px] opacity-80">{geo.region[r]}</span>
                    </Chip>
                  ))}
          </div>

          {scope !== 'kr' && regions.length > 0 && geo.regionCountries.length > 1 && (
            <div className="-mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
              <span className="shrink-0 text-[13px] font-semibold text-ink-3">나라</span>
              {geo.regionCountries.map(([c, n]) => (
                <Chip key={c} on={place === c} onClick={() => pickPlace(place === c ? null : c)}>
                  {geo.names[c]}
                  <span className="num ml-0.5 text-[14px] opacity-80">{n}</span>
                </Chip>
              ))}
            </div>
          )}

          {place && !(scope === 'kr' || regions.length) && (
            <div className="mt-2">
              <Chip on onClick={() => setPlace(null)}>
                {geo.names[place] ?? place}
              </Chip>
            </div>
          )}

          {mapOpen && (
            <div className="mt-3 rounded-box border border-line bg-surface p-3 sm:p-4">
              <Suspense fallback={<div className="aspect-[1010/666] animate-pulse rounded-box bg-sunken" />}>
                <MapView
                  kind={scope === 'kr' ? 'kr' : 'world'}
                  counts={scope === 'kr' ? geo.province : geo.country}
                  names={geo.names}
                  selected={place}
                  focus={scope === 'kr' ? [] : regions.length ? geo.regionCountries.map(([c]) => c) : []}
                  onSelect={pickPlace}
                />
              </Suspense>
              <p className="mt-2 flex flex-wrap justify-between gap-2 text-[12px] text-ink-3">
                <span>
                  {scope === 'kr' ? '시·도' : '나라'}를 누르면 그곳 대회만 보입니다. 색이 진할수록 대회가 많습니다. 두 손가락이나
                  휠로 확대하고 끌어서 옮깁니다.
                </span>
                <span>
                  지도{' '}
                  <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                    svg-maps
                  </a>{' '}
                  (CC BY 4.0)
                </span>
              </p>
            </div>
          )}
        </section>

        {/* 목록 */}
        <section id="list" className="mx-auto max-w-6xl scroll-mt-32 px-1 pb-16 sm:px-2">
          {remote === 'loading' ? (
            <div className="space-y-px pt-8" aria-busy="true" aria-label="대회 목록 불러오는 중">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-[88px] animate-pulse bg-surface" />
              ))}
            </div>
          ) : shown === 0 ? (
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
            visible.map((g) => (
              <div key={g.key} className="pt-8">
                <h2 className="flex items-baseline gap-2 px-3 pb-2 sm:px-5">
                  <span className="text-[19px] font-extrabold tracking-tight">{g.title}</span>
                  <span className="num text-[18px] font-semibold text-ink-3">{g.total}</span>
                </h2>
                <ul className="divide-y divide-line border-y border-line">
                  {g.races.map((r) => (
                    <RaceRow key={r.id} race={r} rating={ratingMap.get(r.id)} favorite={fav.has(r.id)} registered={reg.has(r.id)} onOpen={openRace} />
                  ))}
                </ul>
              </div>
            ))
          )}
          {limit < shown && <div ref={sentinel} aria-hidden className="h-px" />}

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
                  {pastRaces.slice(0, pastLimit).map((r) => (
                    <RaceRow key={r.id} race={r} rating={ratingMap.get(r.id)} favorite={fav.has(r.id)} registered={reg.has(r.id)} onOpen={openRace} />
                  ))}
                </ul>
              )}
              {showPast && pastLimit < pastRaces.length && (
                <button
                  onClick={() => setPastLimit((n) => n + PAGE)}
                  className="mt-3 h-9 rounded-ctl bg-sunken px-3 text-[14px] font-semibold hover:bg-line"
                >
                  더 보기 ({pastRaces.length - pastLimit}개 남음)
                </button>
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
            <p className="mt-2 max-w-[70ch]">방문 통계를 내려고 Google Analytics 를 씁니다. 이름이나 이메일처럼 누구인지 알 수 있는 정보는 보내지 않습니다.</p>
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
            registered={reg.has(selected.id)}
            onToggleRegistered={() => reg.toggle(selected.id)}
            onClose={() => setSelected(null)}
            onLogin={() => setAuthMode('in')}
          />
        )}
      </Panel>

      <Panel open={showRequest} onClose={() => setShowRequest(false)} label="대회 추가 요청">
        <RequestPanel onClose={() => setShowRequest(false)} onLogin={() => setAuthMode('in')} />
      </Panel>

      <Panel open={showAdmin && !!profile?.is_admin} onClose={() => setShowAdmin(false)} label="관리">
        {<AdminPanel races={data.races} onClose={() => setShowAdmin(false)} onSaved={() => reload(true)} />}
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
          <Note tone="error">대회 목록을 불러오지 못했습니다. 잠시 뒤 새로고침해 주세요.</Note>
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
      <span className={`text-[13px] ${active ? 'opacity-75' : hot ? 'opacity-85' : 'text-ink-3'}`}>{label}</span>
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
      className={`inline-flex h-10 items-center gap-1 rounded-ctl px-3 text-[14px] sm:h-8 font-semibold transition active:translate-y-px ${
        on ? 'bg-ink text-bg' : 'bg-surface text-ink-2 hover:bg-sunken hover:text-ink'
      }`}
    >
      {on && <Check size={13} weight="bold" />}
      {children}
    </button>
  );
}
