import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { MagnifyingGlass, SlidersHorizontal, CaretDown, Check, X, BookmarkSimple, CheckSquare, Plus } from '@phosphor-icons/react';
import type { Race, EntryType, Region, Discipline } from './lib/types';
import { DISCIPLINES } from './lib/types';
import { loadDataset, emptyDataset, type Dataset } from './lib/data';
import {
  entryStatus,
  entrySortKey,
  isCancelled,
  daysBetween,
  todayISO,
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
import { AuthBar, AuthForm } from './components/AuthPanel';
import { Panel, Note, MoreButton } from './components/ui';
import { Logo } from './components/Logo';
import MapSection, { type Scope } from './components/MapSection';
import { matchesPlaces, placeOf } from './lib/places';
import { buildIndex, searchRaces, suggestRaces } from './lib/search';
import { scrollToResults, RESULTS_EMPTY_ID } from './lib/scrollToResults';
import { ResultsAnnouncer } from './components/ResultsAnnouncer';
import { track, pageView } from './lib/analytics';
import { langPath, useLang, type Key } from './i18n';
import { DISCIPLINE_TEXT, ENTRY_TEXT, fmtCount, fmtMonth } from './i18n/format';
import { countryName, raceName, whereText } from './i18n/names';

// 상세·요청·관리 패널은 열 때만 필요하므로 첫 화면 번들에서 뺀다 (목록이 뜬 뒤 미리 받아 둔다 —
// 처음 열 때 받으면, 탭을 열어 둔 채 새로 배포된 뒤에는 옛 청크가 없어 화면 전체가 깨진다)
const loadRaceDetail = () => import('./components/RaceDetail');
const loadAdminPanel = () => import('./components/AdminPanel');
const loadRequestPanel = () => import('./components/RequestPanel');
const RaceDetail = lazy(loadRaceDetail);
const AdminPanel = lazy(loadAdminPanel);
const RequestPanel = lazy(loadRequestPanel);

// 지난 대회 '더 보기' 한 번에 붙이는 수
const PAGE = 80;
// 다가오는 대회: 묶음마다 처음 GROUP_PAGE 개, '더 보기' 한 번에 GROUP_MORE 개. 검색·필터로 SHOW_ALL_UNDER 개 이하면 전부
const GROUP_PAGE = 12;
const GROUP_MORE = 24;
const SHOW_ALL_UNDER = 30;

const ENTRY_TYPES: EntryType[] = ['lottery', 'fcfs', 'qualifying', 'open', 'tour_only'];
type Sort = 'entry' | 'race_date' | 'views' | 'saves' | 'size' | 'flight';
type StatusFilter = EntryStatus | 'closing7' | 'opening30';

const STATUS_GROUP: Record<EntryStatus, Key> = {
  open: 'group.open',
  upcoming: 'group.upcoming',
  unknown: 'group.unknown',
  soldout: 'group.soldout',
  closed: 'group.closed',
  cancelled: 'group.cancelled',
};

export default function App() {
  return (
    <AuthProvider>
      <Main />
    </AuthProvider>
  );
}

function Main() {
  const { lang, setLang, t } = useLang();
  const auth = useAuth();
  const { profile } = auth;
  // 내장 데이터로 즉시 그리고, 서버 응답이 오면 교체한다.
  const [data, setData] = useState<Dataset>(emptyDataset);
  const [remote, setRemote] = useState<'loading' | 'ok' | 'fallback'>('loading');
  // ?q=검색어 로 들어오면 (구글 검색창 바로가기 등) 그 검색어로 시작
  const [q, setQ] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  const [scope, setScope] = useState<Scope>('all');
  const [regions, setRegions] = useState<Region[]>([]);
  // 지도·칩에서 고른 곳들 (여러 곳이면 합집합): 국내는 시·도 id, 해외는 나라 코드(소문자)·주·도('US-CA'), 'kr' 은 국내 전체
  const [places, setPlaces] = useState<string[]>([]);
  const [types, setTypes] = useState<EntryType[]>([]);
  // 접수 상태 (여러 개면 합집합)
  const [status, setStatus] = useState<StatusFilter[]>([]);
  const [majorOnly, setMajorOnly] = useState(false);
  const [maxFlight, setMaxFlight] = useState(24);
  const [sort, setSort] = useState<Sort>('entry');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
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
  useEffect(() => {
    if (remote === 'loading') return;
    const t = setTimeout(() => {
      // 미리 받기가 실패해도(오프라인 등) 열 때 다시 받으므로 여기서는 조용히 넘긴다
      loadRaceDetail().catch(() => {});
      loadRequestPanel().catch(() => {});
      if (profile?.is_admin) loadAdminPanel().catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [remote, profile?.is_admin]);
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
    const id = location.pathname.match(/^(?:\/en)?\/r\/([a-z0-9-]+)/)?.[1] ?? new URLSearchParams(location.search).get('r');
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
    u.pathname = langPath(selected ? `/r/${selected.id}` : '/', lang);
    history.replaceState(null, '', u.pathname + u.search + u.hash);
    document.title = selected
      ? t('title.race', { name: raceName(selected, lang), year: selected.race_date.slice(0, 4) })
      : t('title.home');
  }, [selected, deepLinked, lang, t]);

  // 조회 기록은 대회를 열 때만 (언어를 바꿔 제목만 바뀔 때는 남기지 않는다). 제목은 위 효과가 먼저 바꾼다
  useEffect(() => {
    if (!deepLinked) return;
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

  // 오늘(한국 날짜)이 바뀔 때만 새 Date — 렌더마다 새로 만들면 아래 메모가 매번 다시 계산된다
  const todayKey = todayISO();
  const today = useMemo(() => new Date(todayKey + 'T00:00:00Z'), [todayKey]);
  const ratingMap = useMemo(() => new Map((data?.ratings ?? []).map((r) => [r.race_id, r])), [data]);
  // 대회마다 한 번만 계산해 두는 값 (검색·필터·정렬 때마다 1359개를 다시 계산하지 않게)
  const info = useMemo(() => {
    const m = new Map<Race, { domestic: boolean; place: string | null; status: EntryStatus; sortKey: number }>();
    for (const r of data.races) {
      const domestic = isDomestic(r);
      m.set(r, {
        domestic,
        place: placeOf(r, domestic),
        status: entryStatus(r, today),
        sortKey: entrySortKey(r, today),
      });
    }
    return m;
  }, [data, today]);

  const upcomingRaces = useMemo(
    () => (data ? data.races.filter((r) => daysBetween(today, r.race_date) >= 0) : []),
    [data, today],
  );
  // 검색 색인 (정규화·자모를 대회마다 한 번만) — 검색은 지금처럼 다가오는 대회만
  const searchIndex = useMemo(() => buildIndex(upcomingRaces, lang), [upcomingRaces, lang]);
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

  const hotList = useMemo(
    () =>
      upcomingRaces
        .filter((r) => (ratingMap.get(r.id)?.hot ?? 0) > 0 && !isCancelled(r))
        .sort((a, b) => (ratingMap.get(b.id)?.hot ?? 0) - (ratingMap.get(a.id)?.hot ?? 0))
        .slice(0, 6),
    [upcomingRaces, ratingMap],
  );

  // 검색창은 바로 바뀌고, 목록은 입력을 막지 않게 뒤따라 바뀐다 (목록·결과 문구는 모두 dq 기준)
  const dq = useDeferredValue(q);
  // 검색어에 맞는 대회 (띄어쓰기·다른 표기·꼬리말·오타 — src/lib/search.ts). 필터·정렬을 바꿀 때는 다시 계산하지 않는다
  const hits = useMemo(() => (dq.trim() ? searchRaces(searchIndex, dq) : null), [searchIndex, dq]);

  const groups = useMemo(() => {
    const statusMatch = (r: Race, st: EntryStatus, s: StatusFilter) => {
      if (s === 'closing7') return st === 'open' && !!r.entry_closes && daysBetween(today, r.entry_closes) <= 7;
      if (s === 'opening30') return st === 'upcoming' && !!r.entry_opens && daysBetween(today, r.entry_opens) <= 30;
      // '접수 끝' 칩은 정원이 차서 일찍 끝난 대회도 함께 보여 준다
      if (s === 'closed') return st === 'closed' || st === 'soldout';
      return st === s;
    };
    const matches = (r: Race) => {
      const x = info.get(r)!;
      if (favOnly && !fav.ids.includes(r.id)) return false;
      if (regOnly && !reg.ids.includes(r.id)) return false;
      if (discipline && (isTrail(r) ? 'trail' : 'road') !== discipline) return false;
      if (scope === 'kr' && !x.domestic) return false;
      if (scope === 'abroad' && x.domestic) return false;
      if (majorOnly && !r.is_major) return false;
      if (regions.length && !regions.includes(r.region)) return false;
      if (!matchesPlaces(r, x.domestic, places)) return false;
      if (types.length && !types.includes(r.entry_type)) return false;
      if (status.length && !status.some((s) => statusMatch(r, x.status, s))) return false;
      if (!x.domestic && r.flight_hours != null && r.flight_hours > maxFlight) return false;
      if (hits && !hits.has(r)) return false;
      return true;
    };
    const list = upcomingRaces.filter(matches);
    const byEntry = (a: Race, b: Race) => info.get(a)!.sortKey - info.get(b)!.sortKey;
    // 접수한 대회만 볼 때는 접수 상태가 의미 없으니 대회일 순 한 묶음
    if (regOnly) {
      const sorted = [...list].sort((a, b) => a.race_date.localeCompare(b.race_date));
      return [{ key: 'registered', title: t('group.registered'), races: sorted }];
    }
    if (sort === 'entry') {
      const order: EntryStatus[] = ['open', 'upcoming', 'unknown', 'soldout', 'closed', 'cancelled'];
      return order
        .map((st) => ({
          key: st,
          title: t(STATUS_GROUP[st]),
          races: list.filter((r) => info.get(r)!.status === st).sort(byEntry),
        }))
        .filter((g) => g.races.length);
    }
    if (sort === 'race_date') {
      const sorted = [...list].sort((a, b) => a.race_date.localeCompare(b.race_date));
      const map = new Map<string, Race[]>();
      for (const r of sorted) {
        const p = dateParts(r.race_date);
        const k = `${p.y}년 ${p.m}월`;
        const g = map.get(k);
        if (g) g.push(r);
        else map.set(k, [r]);
      }
      return [...map.entries()].map(([k, races]) => ({ key: k, title: lang === 'en' ? fmtMonth(races[0].race_date, 'en') : k, races }));
    }
    const sorted = [...list].sort((a, b) => {
      if (sort === 'flight') return (a.flight_hours ?? 99) - (b.flight_hours ?? 99);
      if (sort === 'size') return (b.field_size ?? -1) - (a.field_size ?? -1) || byEntry(a, b);
      // 조회·저장 수는 목록 행에 보이는 숫자(race_public_stats 의 views/saves) 그대로
      const sa = ratingMap.get(a.id);
      const sb = ratingMap.get(b.id);
      const views = (sb?.views ?? 0) - (sa?.views ?? 0);
      const saves = (sb?.saves ?? 0) - (sa?.saves ?? 0);
      return (sort === 'saves' ? saves || views : views || saves) || byEntry(a, b);
    });
    const title =
      sort === 'flight'
        ? t('group.flight')
        : sort === 'size'
          ? t('group.size')
          : sort === 'saves'
            ? t('group.saves')
            : t('group.views');
    return [{ key: 'all', title, races: sorted }];
  }, [upcomingRaces, info, hits, scope, regions, places, types, status, majorOnly, maxFlight, sort, today, ratingMap, favOnly, fav.ids, regOnly, reg.ids, discipline, lang, t]);

  const shown = groups.reduce((n, g) => n + g.races.length, 0);
  // 검색 결과 0개일 때 '혹시 이 대회인가요?' (필터와 무관하게 다가오는 대회 중). 결과 수(shown)에는 넣지 않는다 → search_empty 기록 그대로
  const suggestions = useMemo(
    () => (shown === 0 && dq.trim() ? suggestRaces(searchIndex, dq, 3) : []),
    [shown, dq, searchIndex],
  );
  const activeFilters =
    types.length + status.length + (majorOnly ? 1 : 0) + (maxFlight < 24 ? 1 : 0) + (discipline ? 1 : 0);

  const reset = () => {
    setQ('');
    setScope('all');
    setRegions([]);
    setPlaces([]);
    setTypes([]);
    setStatus([]);
    setMajorOnly(false);
    setMaxFlight(24);
    setFavOnly(false);
    setRegOnly(false);
    setDiscipline(null);
  };

  const openRace = useCallback((r: Race) => setSelected(r), []);
  // 상세 맨 아래 '비슷한 대회' 에 넘기는 값 (RaceDetail 의 선택 props — 펼쳐서 넘겨 그쪽 props 가 아직 없어도 타입 검사가 통과한다)
  const similarProps = { races: upcomingRaces, ratingMap, isFavorite: fav.has, isRegistered: reg.has, onOpenRace: openRace };

  // 검색어: 입력이 1.2초 멈추면 한 번 기록 (결과 0건이면 '찾는데 없는 대회'로 따로 센다)
  const shownRef = useRef(0);
  shownRef.current = shown;
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const t = setTimeout(() => track('search', { search_term: term, results: shownRef.current }), 1200);
    return () => clearTimeout(t);
  }, [q]);

  // 검색창에서 엔터(모바일 '검색' 키): 키보드를 닫고 결과(0개면 '찾지 못했습니다' 안내)로 내려간다.
  // 입력 중엔 스크롤하지 않는다. 목록(dq)이 입력(q)을 따라잡은 뒤에 한 번만
  // (목록을 불러오는 중이면 다 불러온 뒤에 — 그 사이 위쪽 '요즘 많이 보는 대회' 가 생겨 목록이 밀려 내려가므로)
  const searchRef = useRef<HTMLInputElement>(null);
  const jumpRef = useRef(false);
  const onSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    searchRef.current?.blur();
    if (dq === q && remote !== 'loading') scrollToResults();
    else jumpRef.current = true;
  };
  useEffect(() => {
    if (!jumpRef.current || dq !== q || remote === 'loading') return;
    jumpRef.current = false;
    scrollToResults();
  }, [dq, q, remote]);
  useEffect(() => {
    if (maxFlight >= 24) return;
    const t = setTimeout(() => track('filter', { name: 'flight', value: `${maxFlight}h` }), 1200);
    return () => clearTimeout(t);
  }, [maxFlight]);

  // 묶음(접수 중·곧 시작…)마다 처음 GROUP_PAGE 개만, '더 보기' 한 번에 GROUP_MORE 개씩 더.
  // 다시 접는 건 필터·정렬 값이 바뀔 때만 — groups 는 저장·접수 표시에도 다시 만들어져서 거기에 걸면 ☆ 하나에 접혀 버린다
  const foldKey = JSON.stringify([dq.trim(), scope, regions, places, types, status, majorOnly, maxFlight, sort, favOnly, regOnly, discipline]);
  const [unfold, setUnfold] = useState<{ key: string; n: Record<string, number> }>({ key: foldKey, n: {} });
  // 키가 바뀌는 순간 비운다 (렌더 중 갱신). 비교만 하면 검색어를 지워 원래 키로 돌아올 때 예전 펼침이 되살아난다
  if (unfold.key !== foldKey) setUnfold({ key: foldKey, n: {} });
  const opened = unfold.key === foldKey ? unfold.n : null;
  const showMore = (g: string, now: number) => setUnfold({ key: foldKey, n: { ...opened, [g]: now + GROUP_MORE } });
  // 검색·필터로 좁혀서 결과가 적으면 접지 않고 전부
  const narrowed = !!dq.trim() || activeFilters > 0 || places.length > 0 || regions.length > 0 || favOnly || regOnly;
  const showAll = narrowed && shown <= SHOW_ALL_UNDER;
  const visible = useMemo(
    () =>
      groups.map((g) => {
        let n = showAll ? g.races.length : opened?.[g.key] ?? GROUP_PAGE;
        // 몇 개 안 남았으면 버튼 대신 그냥 보여 준다
        if (g.races.length - n <= 3) n = g.races.length;
        return { ...g, races: g.races.slice(0, n), total: g.races.length };
      }),
    [groups, opened, showAll],
  );

  // 지도는 넘기는 값이 바뀔 때만 다시 그린다 (검색 입력·☆·상세 열기로 path 수백 개를 다시 그리지 않게)
  const mapSection = useMemo(
    () => (
      <MapSection
        scope={scope}
        races={upcomingRaces}
        regions={regions}
        onRegions={setRegions}
        places={places}
        onPlaces={setPlaces}
        onScope={setScope}
      />
    ),
    [scope, upcomingRaces, regions, places],
  );

  const openRequest = (from: string) => {
    track('request_open', { from });
    setShowRequest(true);
  };

  const toggle = <T,>(list: T[], set: (v: T[]) => void, v: T) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  /** 현황판 숫자: 그것만 고른다 (그것만 골라져 있으면 풀기). 칩에서 더 얹으면 합쳐진다 */
  const pickStatus = (s: StatusFilter) => {
    const only = status.length === 1 && status[0] === s;
    if (!only) track('filter', { name: 'status', value: s });
    setStatus(only ? [] : [s]);
    setSort('entry');
    document.getElementById('list')?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="min-h-dvh">
      <a
        href="#list"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-ctl focus:bg-ink focus:px-3 focus:py-2 focus:text-bg"
      >
        {t('app.skip')}
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-bg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href={langPath('/', lang)} className="flex items-center">
            <Logo />
          </a>
          <nav className="flex items-center gap-1 sm:gap-2">
            <button
              onClick={() => openRequest('header')}
              className="hidden h-8 items-center rounded-ctl px-3 text-[14px] font-semibold text-ink-2 transition hover:bg-sunken hover:text-ink sm:inline-flex"
            >
              {t('header.request')}
            </button>
            {profile?.is_admin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="inline-flex h-8 items-center rounded-ctl px-3 text-[14px] font-semibold text-ink-2 transition hover:bg-sunken hover:text-ink"
              >
                {t('header.admin')}
              </button>
            )}
            {/* 언어 전환: 글자는 두 언어 모두 'EN / 한', 지금 언어 쪽만 진하게 */}
            <button
              onClick={() => {
                const next = lang === 'ko' ? 'en' : 'ko';
                track('lang', { value: next });
                setLang(next);
              }}
              aria-label={t('lang.switch')}
              lang={lang === 'ko' ? 'en' : 'ko'}
              className="inline-flex h-8 items-center rounded-ctl px-3 text-[14px] font-semibold text-ink-2 transition hover:bg-sunken hover:text-ink"
            >
              <span>
                <span className={lang === 'en' ? 'text-ink' : undefined}>EN</span>
                {' / '}
                <span className={lang === 'ko' ? 'text-ink' : undefined}>한</span>
              </span>
            </button>
            <AuthBar onOpen={() => setAuthMode('in')} />
          </nav>
        </div>
      </header>

      <main>
        {auth.justConfirmed && (
          <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
            <div className="flex items-center justify-between gap-3 rounded-box bg-accent px-4 py-3 text-on-accent">
              <span className="text-[15px] font-semibold">{t('app.confirmed')}</span>
              <button onClick={auth.clearFlags} aria-label={t('common.close')} className="grid size-8 place-items-center rounded-ctl hover:bg-on-accent/10">
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>
        )}

        {/* 소개 + 현황판 */}
        <section className="mx-auto grid max-w-6xl gap-8 px-4 pt-10 pb-8 sm:px-6 md:grid-cols-[1fr_auto] md:items-end md:pt-14 md:pb-10">
          <div>
            <h1 className="text-[34px] leading-[1.12] font-extrabold tracking-[-0.03em] sm:text-[46px]">
              {t('site.name')}
            </h1>
            <p className="mt-4 max-w-[42ch] text-[16px] leading-relaxed text-balance text-ink-2 sm:text-[17px]">
              {remote === 'loading' ? t('app.lead') : t('app.leadCount', { kr: fmtCount(stats.kr, lang), abroad: fmtCount(stats.abroad, lang) })}</p>
          </div>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-box bg-line md:w-[27rem]">
            <Stat label={t('stat.open')} value={stats.open} active={status.includes('open')} onClick={() => pickStatus('open')} />
            <Stat
              label={t('stat.closing7')}
              value={stats.closing7}
              active={status.includes('closing7')}
              hot={stats.closing7 > 0}
              onClick={() => pickStatus('closing7')}
            />
            <Stat
              label={t('stat.opening30')}
              value={stats.opening30}
              active={status.includes('opening30')}
              onClick={() => pickStatus('opening30')}
            />
          </div>
        </section>

        {/* 요즘 인기: 최근 7일 조회·저장이 많은 대회 */}
        {hotList.length >= 3 && (
          <section className="mx-auto max-w-6xl px-4 pb-6 sm:px-6" aria-label={t('hot.aria')}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-bold">{t('hot.title')}</h2>
              <button
                onClick={() => {
                  setSort('views');
                  track('filter', { name: 'sort', value: 'views' });
                  document.getElementById('list')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }}
                className="text-[13px] font-semibold text-ink-3 underline underline-offset-4 hover:text-ink"
              >
                {t('hot.all')}
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
                      <span className="num text-[13px] font-bold text-ink-3">{t('hot.rank', { n: i + 1 })}</span>
                      <span className="line-clamp-2 text-[15px] leading-snug font-bold">{raceName(r, lang)}</span>
                      <span className="text-[13px] text-ink-3">
                        {t('date.md', { m: p.m, d: p.d, mon: p.mon })} ·{' '}
                        {lang === 'en'
                          ? isDomestic(r)
                            ? whereText(r, 'en').split(', ').at(-1)
                            : countryName(r.country_code, r.country_ko, 'en')
                          : isDomestic(r)
                            ? r.city_ko.split(' ')[0]
                            : r.country_ko}
                      </span>
                      <span className="mt-auto text-[12px] text-ink-3">
                        {t('views.pre')}
                        <span className="num text-[13px]">{shortCount(st?.views ?? 0, lang)}</span>
                        {t('views.post', { count: st?.views ?? 0 })}
                        {(st?.saves ?? 0) > 0 && (
                          <>
                            {t('saves.sep')}
                            {t('saves.pre')}
                            <span className="num text-[13px]">{shortCount(st!.saves!, lang)}</span>
                            {t('saves.post', { count: st!.saves! })}
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
            <div role="radiogroup" aria-label={t('scope.aria')} className="grid w-full grid-cols-3 rounded-ctl bg-sunken p-1 sm:inline-flex sm:w-auto">
              {(
                [
                  ['all', t('scope.all'), stats.kr + stats.abroad],
                  ['kr', t('scope.kr'), stats.kr],
                  ['abroad', t('scope.abroad'), stats.abroad],
                ] as [Scope, string, number][]
              ).map(([s, label, n]) => (
                <button
                  key={s}
                  role="radio"
                  aria-checked={scope === s}
                  onClick={() => {
                    setScope(s);
                    setRegions([]);
                    setPlaces([]);
                    if (s !== scope) track('filter', { name: 'scope', value: s });
                  }}
                  className={`flex h-9 items-center gap-1.5 rounded-[4px] px-3 sm:h-8 text-[14px] font-semibold transition ${
                    scope === s ? 'bg-surface text-ink shadow-[0_1px_2px_var(--shadow)]' : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {label}
                  <span className="num text-[15px] text-ink-3">{fmtCount(n, lang)}</span>
                </button>
              ))}
            </div>

            <form role="search" onSubmit={onSearchSubmit} className="order-first w-full sm:order-none sm:w-auto sm:flex-1">
              <label className="relative block">
                <span className="sr-only">{t('search.label')}</span>
                <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
                <input
                  ref={searchRef}
                  type="search"
                  enterKeyHint="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('search.placeholder')}
                  className="h-10 w-full rounded-ctl border border-line bg-surface pr-3 pl-9 text-[15px] outline-none transition placeholder:text-ink-3 focus:border-ink"
                />
              </label>
            </form>
            {/* 휴대폰은 헤더 버튼이 숨겨져 있어 검색창 바로 밑에 (PC 는 바로 위 헤더 버튼이 같은 역할) */}
            <p className="order-first -mt-0.5 flex w-full items-baseline justify-end gap-1.5 text-[13px] text-ink-3 sm:hidden">
              {t('request.missing')}
              <button
                onClick={() => openRequest('search')}
                className="-my-2 py-2 font-semibold text-ink-2 underline underline-offset-4 hover:text-ink"
              >
                {t('request.short')}
              </button>
            </p>

            <div className="flex w-full items-center justify-end gap-2 sm:ml-0 sm:w-auto">
              <label className="relative">
                <span className="sr-only">{t('sort.label')}</span>
                <select
                  value={sort}
                  onChange={(e) => {
                    setSort(e.target.value as Sort);
                    track('filter', { name: 'sort', value: e.target.value });
                  }}
                  className="h-10 appearance-none rounded-ctl border border-line bg-surface pr-9 pl-3 text-[14px] font-semibold outline-none focus:border-ink"
                >
                  <option value="entry">{t('sort.entry')}</option>
                  <option value="race_date">{t('sort.race_date')}</option>
                  <option value="views">{t('sort.views')}</option>
                  <option value="saves">{t('sort.saves')}</option>
                  <option value="size">{t('sort.size')}</option>
                  <option value="flight">{t('sort.flight')}</option>
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
                  <span className="sr-only">{t('fav.only')}</span>
                </button>
              )}
              {reg.ids.length > 0 && (
                <button
                  onClick={() => {
                    if (!regOnly) track('filter', { name: 'registered', value: 'on' });
                    setRegOnly((v) => !v);
                  }}
                  aria-pressed={regOnly}
                  title={t('reg.title')}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-ctl border px-3 text-[14px] font-semibold transition ${
                    regOnly ? 'border-ink bg-ink text-bg' : 'border-line bg-surface hover:border-ink'
                  }`}
                >
                  <CheckSquare size={16} weight={regOnly ? 'fill' : 'bold'} />
                  <span className="hidden sm:inline">{t('reg.title')}</span>
                  <span className="num text-[15px]">{reg.ids.length}</span>
                  <span className="sr-only sm:hidden">{t('reg.only')}</span>
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
                {t('filter.button')}
                {activeFilters > 0 && <span className="num text-[15px]">{activeFilters}</span>}
              </button>
            </div>
          </div>

          {filtersOpen && (
            <div className="border-t border-line">
              <div className="mx-auto grid max-w-6xl gap-4 px-4 py-4 sm:px-6 md:grid-cols-2">
                <FilterGroup label={t('filter.discipline')}>
                  {DISCIPLINES.map((d) => (
                    <Chip
                      key={d}
                      on={discipline === d}
                      onClick={() => {
                        if (discipline !== d) track('filter', { name: 'discipline', value: d });
                        setDiscipline(discipline === d ? null : d);
                      }}
                    >
                      {DISCIPLINE_TEXT[lang][d]}
                    </Chip>
                  ))}
                </FilterGroup>
                <FilterGroup label={t('filter.entry')}>
                  {ENTRY_TYPES.map((et) => (
                    <Chip key={et} on={types.includes(et)} onClick={() => {
                        if (!types.includes(et)) track('filter', { name: 'entry_type', value: et });
                        toggle(types, setTypes, et);
                      }}>
                      {ENTRY_TEXT[lang][et]}
                    </Chip>
                  ))}
                </FilterGroup>
                <FilterGroup label={t('filter.status')}>
                  {(
                    [
                      ['open', t('filter.open')],
                      ['upcoming', t('filter.upcoming')],
                      ['closed', t('filter.closed')],
                    ] as [EntryStatus, string][]
                  ).map(([s, label]) => (
                    <Chip
                      key={s}
                      on={status.includes(s)}
                      onClick={() => {
                        if (!status.includes(s)) track('filter', { name: 'status', value: s });
                        toggle(status, setStatus, s);
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
                    {t('filter.major')}
                  </Chip>
                </FilterGroup>
                {scope !== 'kr' && (
                  <FilterGroup label={t('filter.flight')}>
                    <input
                      type="range"
                      min={2}
                      max={24}
                      value={maxFlight}
                      onChange={(e) => setMaxFlight(Number(e.target.value))}
                      className="w-40"
                      aria-label={t('filter.flightAria')}
                    />
                    <span className="num text-[16px] font-semibold">{maxFlight >= 24 ? t('filter.noLimit') : t('filter.hours', { n: maxFlight })}</span>
                  </FilterGroup>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 지역 막대 + 지도 */}
        {mapSection}

        {/* 목록 */}
        <section id="list" className="mx-auto max-w-6xl scroll-mt-32 px-1 pb-16 sm:px-2">
          <ResultsAnnouncer query={dq.trim()} count={shown} suggestions={suggestions.length} loading={remote === 'loading'} />
          {remote === 'loading' ? (
            <div className="space-y-px pt-8" aria-busy="true" aria-label={t('list.loading')}>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-[88px] animate-pulse bg-surface" />
              ))}
            </div>
          ) : shown === 0 ? (
            <div id={RESULTS_EMPTY_ID} className="scroll-mt-32 px-3 py-20 text-center">
              <p className="text-[17px] font-semibold">{dq.trim() ? t('list.notFound', { q: dq.trim() }) : t('list.noMatch')}</p>
              <p className="mx-auto mt-1.5 max-w-[34ch] text-[15px] break-keep text-balance text-ink-2">
                {t('list.emptyHelp')}
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <button
                  onClick={() => openRequest(dq.trim() ? 'empty_search' : 'empty')}
                  className="inline-flex h-10 items-center gap-1.5 rounded-ctl bg-ink px-4 text-sm font-semibold text-bg hover:opacity-85"
                >
                  <Plus size={14} weight="bold" aria-hidden />
                  {t('header.request')}
                </button>
                <button onClick={reset} className="h-10 rounded-ctl bg-sunken px-4 text-sm font-semibold hover:bg-line">
                  {dq.trim() ? t('list.clearAll') : t('list.clearFilters')}
                </button>
              </div>
              {suggestions.length > 0 && (
                <div className="mt-12 text-left">
                  <h2 className="pb-2 text-[17px] font-bold tracking-tight sm:px-2">{t('list.didYouMean')}</h2>
                  <ul className="-mx-3 divide-y divide-line border-y border-line">
                    {suggestions.map((r) => (
                      <RaceRow key={r.id} race={r} rating={ratingMap.get(r.id)} favorite={fav.has(r.id)} registered={reg.has(r.id)} onOpen={openRace} />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            visible.map((g, i) => (
              <div key={g.key} className="pt-8">
                <div className="flex items-baseline justify-between gap-3 px-3 pb-2 sm:px-5">
                  <h2 className="flex items-baseline gap-2">
                    <span className="text-[19px] font-extrabold tracking-tight">{g.title}</span>
                    <span className="num text-[18px] font-semibold text-ink-3">{fmtCount(g.total, lang)}</span>
                  </h2>
                  {/* 하단 안내까지 내려가지 않아도 보이게 첫 묶음 제목 줄에 (헤더 버튼은 휴대폰에서 숨김) */}
                  {i === 0 && (
                    <button
                      onClick={() => openRequest('list')}
                      className="inline-flex shrink-0 items-center gap-1 rounded-ctl px-2 py-1 text-[14px] font-semibold text-ink-2 transition hover:bg-sunken hover:text-ink"
                    >
                      <Plus size={14} weight="bold" aria-hidden />
                      <span>
                        <span className="hidden sm:inline">{t('list.missingLead')}</span>
                        {t('request.short')}
                      </span>
                    </button>
                  )}
                </div>
                <ul className="divide-y divide-line border-y border-line">
                  {g.races.map((r) => (
                    <RaceRow key={r.id} race={r} rating={ratingMap.get(r.id)} favorite={fav.has(r.id)} registered={reg.has(r.id)} onOpen={openRace} />
                  ))}
                </ul>
                {g.races.length < g.total && (
                  <div className="px-3 pt-3 sm:px-5">
                    <MoreButton left={g.total - g.races.length} onClick={() => showMore(g.key, g.races.length)} />
                  </div>
                )}
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
                {t(showPast ? 'past.hide' : 'past.show', { n: fmtCount(pastRaces.length, lang) })}
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
                <MoreButton className="mt-3" left={pastRaces.length - pastLimit} onClick={() => setPastLimit((n) => n + PAGE)} />
              )}
            </div>
          )}
        </section>

        {/* 요청 안내 */}
        <section className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[22px] font-extrabold tracking-tight">{t('bottom.title')}</h2>
              <p className="mt-1 text-[15px] text-ink-2">{t('bottom.text')}</p>
            </div>
            <button
              onClick={() => openRequest('bottom')}
              className="h-11 shrink-0 self-start rounded-ctl bg-accent px-5 text-[15px] font-bold text-on-accent transition hover:brightness-95 active:translate-y-px md:self-auto"
            >
              {t('header.request')}
            </button>
          </div>
        </section>

        <footer className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-8 text-[13px] leading-relaxed text-ink-3 sm:px-6">
            <p className="max-w-[70ch]">{t('footer.1')}</p>
            <p className="mt-2 max-w-[70ch]">{t('footer.2')}</p>
            <p className="mt-2 max-w-[70ch]">
              {t('footer.contact')}{' '}
              <a href="mailto:marathon82@kakao.com" className="underline underline-offset-2 hover:no-underline">
                marathon82@kakao.com
              </a>
            </p>
          </div>
        </footer>
      </main>

      <Panel open={!!selected} onClose={() => setSelected(null)} label={selected ? raceName(selected, lang) : t('panel.race')}>
        {selected && (
          <Suspense fallback={null}>
            <RaceDetail
              key={selected.id}
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
              {...similarProps}
            />
          </Suspense>
        )}
      </Panel>

      <Panel open={showRequest} onClose={() => setShowRequest(false)} label={t('header.request')}>
        <Suspense fallback={null}>
          <RequestPanel onClose={() => setShowRequest(false)} onLogin={() => setAuthMode('in')} />
        </Suspense>
      </Panel>

      <Panel open={showAdmin && !!profile?.is_admin} onClose={() => setShowAdmin(false)} label={t('header.admin')}>
        <Suspense fallback={null}>
          <AdminPanel races={data.races} onClose={() => setShowAdmin(false)} onSaved={() => reload(true)} />
        </Suspense>
      </Panel>

      <Panel
        variant="sheet"
        open={authMode !== null}
        onClose={() => {
          setAuthMode(null);
          auth.clearFlags();
        }}
        label={t('panel.login')}
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
          <Note tone="error">{t('app.loadError')}</Note>
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
