import './home.css';
import { lazy, Suspense, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
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
  dateParts,
  fmtDateShort,
  shortCount,
  type EntryStatus,
} from './lib/util';
import { AuthProvider, useAuth } from './lib/auth';
import { useFavorites } from './lib/favorites';
import { useRegistered } from './lib/registered';
import { MyRacesProvider, type MyRacesBridge } from './lib/myRacesContext';
import { clearIntent, peekIntent, saveIntent, type AfterLogin, type GateAction, type GateIntent } from './lib/memberGate';
import RaceRow from './components/RaceRow';
import { AuthBar, AuthForm } from './components/AuthPanel';
import { Panel, Note, MoreButton } from './components/ui';
import { Logo } from './components/Logo';
import { MobileMenu, type MenuItem } from './components/MobileMenu';
import MapSection, { type Scope } from './components/MapSection';
import { byRaceDate, inScope, matchesAnyStatus, matchesStatus, picksFromSearch, resolveListPrefs, type ListPicks, type ListSort, type StatusFilter } from './lib/listPrefs';
import { matchesPlaces, placeOf } from './lib/places';
import { buildIndex, searchRaces, suggestRaces } from './lib/search';
import { scrollToResults, RESULTS_EMPTY_ID } from './lib/scrollToResults';
import { ResultsAnnouncer } from './components/ResultsAnnouncer';
import { track, pageView } from './lib/analytics';
import { langPath, useLang, type Key } from './i18n';
import { DISCIPLINE_TEXT, ENTRY_TEXT, fmtCount, fmtMonth } from './i18n/format';
import { countryName, raceName, whereText } from './i18n/names';
import { PRIVACY_PATH, TERMS_PATH } from './lib/policy';
import { LEGAL } from './legal/strings';
import { COMMUNITY_NAV, COMMUNITY_PATH, isCommunityPath, stripCommunityQuery } from './community/route';

// 상세·요청·관리 패널은 열 때만 필요하므로 첫 화면 번들에서 뺀다 (목록이 뜬 뒤 미리 받아 둔다 —
// 처음 열 때 받으면, 탭을 열어 둔 채 새로 배포된 뒤에는 옛 청크가 없어 화면 전체가 깨진다)
const loadRaceDetail = () => import('./components/RaceDetail');
const loadAdminPanel = () => import('./components/AdminPanel');
const loadRequestPanel = () => import('./components/RequestPanel');
const RaceDetail = lazy(loadRaceDetail);
const AdminPanel = lazy(loadAdminPanel);
const RequestPanel = lazy(loadRequestPanel);
const loadCommunityPage = () => import('./community/CommunityPage');
const CommunityPage = lazy(loadCommunityPage);

// 지난 대회 '더 보기' 한 번에 붙이는 수
const PAGE = 80;
// 다가오는 대회: 묶음마다 처음 GROUP_PAGE 개, '더 보기' 한 번에 GROUP_MORE 개. 검색·필터로 SHOW_ALL_UNDER 개 이하면 전부
const GROUP_PAGE = 12;
const GROUP_MORE = 24;
const SHOW_ALL_UNDER = 30;

const ENTRY_TYPES: EntryType[] = ['lottery', 'fcfs', 'qualifying', 'open', 'tour_only'];

/** 켜짐·고름·펼침 모양(테두리 있는 버튼): 검정으로 채우지 않고 밝은 바탕 + 진한 2px 테두리. 테두리 없는 칩·칸은 inset 2px 로 같은 모양 */
const ON_BORDERED = 'border-ink bg-surface text-ink shadow-[inset_0_0_0_1px_var(--ink)]';
/** 도구 막대(검색·범위·정렬·필터) id — 휴대폰 아래 고정 줄의 '필터' 가 여기로 올라온다 */
const TOOLS_ID = 'tools';
/** 머리말 높이(px, h-14) — 그 뒤로 올라간 것은 안 보인다 */
const HEADER_H = 56;
/** 인기 대회 1·2·3위 배지 (금·은·동 — 색은 home.css) */
const MEDAL = ['medal medal-1', 'medal medal-2', 'medal medal-3'];

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
  // 범위·정렬·접수 상태: 사용자가 고른 값(주소 ?scope= ?sort= ?status= 포함). 안 고른 값(null)은 기본값(국내·대회 날짜·접수 중)
  // — 실제 적용 값은 아래 resolveListPrefs (lib/listPrefs)
  const [picks, setPicks] = useState<ListPicks>(() => picksFromSearch(location.search));
  const setScope = useCallback((v: Scope) => setPicks((p) => ({ ...p, scope: v })), []);
  const setStatus = useCallback((v: StatusFilter[]) => setPicks((p) => ({ ...p, status: v })), []);
  const setSort = useCallback((v: ListSort) => setPicks((p) => ({ ...p, sort: v })), []);
  const [regions, setRegions] = useState<Region[]>([]);
  // 지도·칩에서 고른 곳들 (여러 곳이면 합집합): 국내는 시·도 id, 해외는 나라 코드(소문자)·주·도('US-CA'), 'kr' 은 국내 전체
  const [places, setPlaces] = useState<string[]>([]);
  const [types, setTypes] = useState<EntryType[]>([]);
  const [majorOnly, setMajorOnly] = useState(false);
  const [maxFlight, setMaxFlight] = useState(24);
  const [filtersOpen, setFiltersOpen] = useState(true);
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
  const [authMode, setAuthMode] = useState<null | 'in' | 'up' | 'reset'>(null);
  // 비회원이 회원 기능을 눌러 로그인 시트를 열 때: 무엇을 하려던 건지 남겨 두고 로그인 뒤 이어 한다 (lib/memberGate)
  const openLogin = useCallback((mode: 'in' | 'up' = 'in', intent?: GateIntent) => {
    if (intent) saveIntent(intent);
    setAuthMode(mode);
  }, []);
  const [resume, setResume] = useState<AfterLogin | null>(null);
  const [pendingAction, setPendingAction] = useState<{ raceId: string; action: GateAction } | null>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showRequest, setShowRequest] = useState(false);
  // 내 정보 창: 머리말(AuthBar)과 휴대폰 메뉴 둘 다 연다
  const [meOpen, setMeOpen] = useState(false);
  // 러닝톡: /community… 주소로 들어오거나 상단 메뉴를 누르면 연다
  const [talkOpen, setTalkOpen] = useState(() => isCommunityPath(location.pathname));
  const closeTalk = () => {
    stripCommunityQuery();
    setTalkOpen(false);
  };

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
      loadCommunityPage().catch(() => {});
      import('./community/MyPosts').catch(() => {}); // 내 정보(AuthPanel)가 lazy 로 여는 것
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

  // 세션이 생기면(로그인·가입 확인 링크·새로고침) 남겨 둔 의도를 꺼내 바로 지우고,
  // 대회 목록에 그 대회가 들어오면 열어서 하려던 동작(캘린더 고르기·알림 탭·기록 입력)을 펼친다
  const uid = auth.session?.user.id;
  const [seenUid, setSeenUid] = useState(uid);
  if (uid !== seenUid) {
    setSeenUid(uid);
    const i = uid ? peekIntent() : null;
    if (i) setResume(i);
  }
  useEffect(() => {
    if (uid) clearIntent();
  }, [uid]);
  // (아래 둘은 렌더 중 상태 맞추기 — 조건이 바로 풀려 한 번만 다시 그린다)
  if (resume) {
    const r = data.races.find((x) => x.id === resume.raceId);
    if (r || remote !== 'loading') setResume(null);
    if (r) {
      setSelected(r);
      setPendingAction({ raceId: r.id, action: resume.action });
    }
  }
  // 다른 대회로 옮기거나 닫으면 이어 하기는 끝
  if (pendingAction && selected?.id !== pendingAction.raceId && !resume) setPendingAction(null);

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
    if (!deepLinked || (!selected && talkOpen)) return; // 러닝톡 주소는 CommunityPage 가 맡는다
    const u = new URL(location.href);
    u.searchParams.delete('r');
    u.pathname = langPath(selected ? `/r/${selected.id}` : '/', lang);
    // history.state 는 그대로 둔다 — 열린 패널이 거기에 겹 수(panelDepth)를 적어 둔다 (components/ui.tsx 의 Panel)
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    document.title = selected
      ? t('title.race', { name: raceName(selected, lang), year: selected.race_date.slice(0, 4) })
      : t('title.home');
  }, [selected, deepLinked, lang, t, talkOpen]);

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

  // 소개 문구의 국내·해외 수 (사이트 전체 소개라 필터와 무관하게 다가오는 대회 전부 — 프리렌더와 같은 숫자)
  const stats = useMemo(
    () => ({
      kr: upcomingRaces.filter(isDomestic).length,
      abroad: upcomingRaces.filter((r) => !isDomestic(r)).length,
    }),
    [upcomingRaces],
  );

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
  // 실제 적용 값: 고른 값이 이기고, 검색 중에는 고르지 않은 지역·접수 상태 기본값을 푼다(전체·모두)
  const { scope, sort, status } = resolveListPrefs(picks, { searching: !!dq.trim() });
  // 범위 탭 숫자 = 그 범위에서 지금 상태 필터에 맞는 수, 현황판 숫자 = 지금 범위 안의 수 (화면에 적용된 조건과 맞춘다)
  const counts = useMemo(() => {
    const st = (r: Race) => info.get(r)!.status;
    const inStatus = upcomingRaces.filter((r) => matchesAnyStatus(r, st(r), status, today));
    const kr = inStatus.filter((r) => info.get(r)!.domestic).length;
    const inRange = upcomingRaces.filter((r) => inScope(r, scope));
    return {
      kr,
      abroad: inStatus.length - kr,
      open: inRange.filter((r) => st(r) === 'open').length,
      closing7: inRange.filter((r) => matchesStatus(r, st(r), 'closing7', today)).length,
      opening30: inRange.filter((r) => matchesStatus(r, st(r), 'opening30', today)).length,
    };
  }, [upcomingRaces, info, status, scope, today]);
  // 검색어에 맞는 대회 (띄어쓰기·다른 표기·꼬리말·오타 — src/lib/search.ts). 필터·정렬을 바꿀 때는 다시 계산하지 않는다
  const hits = useMemo(() => (dq.trim() ? searchRaces(searchIndex, dq) : null), [searchIndex, dq]);

  const groups = useMemo(() => {
    const matches = (r: Race) => {
      const x = info.get(r)!;
      if (favOnly && !fav.ids.includes(r.id)) return false;
      if (regOnly && !reg.ids.includes(r.id)) return false;
      if (discipline && (r.discipline ?? 'road') !== discipline) return false;
      if (!inScope(r, scope)) return false;
      if (majorOnly && !r.is_major) return false;
      if (regions.length && !regions.includes(r.region)) return false;
      if (!matchesPlaces(r, x.domestic, places)) return false;
      if (types.length && !types.includes(r.entry_type)) return false;
      if (!matchesAnyStatus(r, x.status, status, today)) return false;
      if (!x.domestic && r.flight_hours != null && r.flight_hours > maxFlight) return false;
      if (hits && !hits.has(r)) return false;
      return true;
    };
    const list = upcomingRaces.filter(matches);
    const byEntry = (a: Race, b: Race) => info.get(a)!.sortKey - info.get(b)!.sortKey;
    // 접수한 대회만 볼 때는 접수 상태가 의미 없으니 대회일 순 한 묶음
    if (regOnly) {
      const sorted = byRaceDate(list);
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
      const sorted = byRaceDate(list);
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
  // 내 정보 '저장한 대회' 에 넘기는 값 — 같은 fav·reg 상태를 써야 저장 해제가 목록·상세에도 바로 보인다 (lib/myRacesContext)
  const myRacesBridge = useMemo<MyRacesBridge>(
    () => ({
      races: data.races,
      // 대회 목록 받는 중이거나, 회원의 저장 목록을 계정과 맞추는 중(그동안 저장 목록이 비어 보인다)
      loading: remote === 'loading' || fav.syncing,
      favIds: fav.ids,
      toggleFavorite: fav.toggle,
      favSynced: fav.synced,
      registeredIds: reg.ids,
      records: reg.records,
      loggedIn: !!auth.session,
      openRace,
      onLogin: () => openLogin('in'),
    }),
    [data.races, remote, fav.ids, fav.toggle, fav.synced, fav.syncing, reg.ids, reg.records, auth.session, openRace, openLogin],
  );
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

  // 지도 숫자도 지금 상태 필터를 거친 대회로 센다 (범위는 MapSection 이 scope 로 거른다)
  const mapRaces = useMemo(
    () => (status.length ? upcomingRaces.filter((r) => matchesAnyStatus(r, info.get(r)!.status, status, today)) : upcomingRaces),
    [upcomingRaces, info, status, today],
  );
  // 지도·지역 칩으로 곳을 고르면 지금 보이는 범위도 고른 값으로 굳힌다. 안 그러면 기본 '국내' 지도에서 서울을 고른 뒤 검색할 때
  // 범위만 '전체'로 풀리고 서울 선택은 남아(탭은 전체인데 목록은 서울만), 검색 중 해외 나라를 고르고 검색어를 지우면 '국내'로 돌아가 0개가 된다
  const pinScope = useCallback(() => setPicks((p) => (p.scope ? p : { ...p, scope })), [scope]);
  const onMapRegions = useCallback(
    (v: Region[]) => {
      setRegions(v);
      pinScope();
    },
    [pinScope],
  );
  const onMapPlaces = useCallback(
    (v: string[]) => {
      setPlaces(v);
      pinScope();
    },
    [pinScope],
  );
  // 지도는 넘기는 값이 바뀔 때만 다시 그린다 (검색 입력·☆·상세 열기로 path 수백 개를 다시 그리지 않게)
  const mapSection = useMemo(
    () => (
      <MapSection
        scope={scope}
        races={mapRaces}
        regions={regions}
        onRegions={onMapRegions}
        places={places}
        onPlaces={onMapPlaces}
        onScope={setScope}
      />
    ),
    [scope, mapRaces, regions, places, setScope, onMapRegions, onMapPlaces],
  );

  const openRequest = (from: string) => {
    track('request_open', { from });
    setShowRequest(true);
  };

  // 머리말 버튼과 휴대폰 메뉴가 같이 쓰는 일
  const openTalk = () => {
    // 이 칸이 곧 러닝톡 패널의 칸이라는 표시(panelDepth) — Panel 이 같은 주소로 한 칸을 더 넣지 않게
    const st = (history.state ?? {}) as { panelDepth?: number };
    history.pushState({ ...st, panelDepth: (st.panelDepth ?? 0) + 1 }, '', langPath(COMMUNITY_PATH, lang));
    setTalkOpen(true);
  };
  const nextLang = lang === 'ko' ? 'en' : 'ko';
  const switchLang = () => {
    track('lang', { value: nextLang });
    setLang(nextLang);
  };
  // 휴대폰(767px 이하) 메뉴 항목 — 머리말에 펼쳐 보이는 것과 같은 일을 한다
  const menuGroups: MenuItem[][] = [
    [
      { id: 'talk', label: COMMUNITY_NAV[lang], href: langPath(COMMUNITY_PATH, lang), onSelect: openTalk },
      { id: 'request', label: t('header.request'), onSelect: () => openRequest('header') },
      ...(profile?.is_admin ? [{ id: 'admin', label: t('header.admin'), onSelect: () => setShowAdmin(true) }] : []),
    ],
    [{ id: 'lang', label: t('lang.switch'), lang: nextLang, onSelect: switchLang }],
    auth.session
      ? [
          { id: 'me', label: t('auth.me'), hint: profile?.nickname ?? auth.session.user.email, onSelect: () => setMeOpen(true) },
          { id: 'logout', label: t('auth.logout'), onSelect: () => void auth.signOut() },
        ]
      : [{ id: 'login', label: t('auth.login'), tone: 'primary', onSelect: () => openLogin('in') }],
  ];

  const toggle = <T,>(list: T[], set: (v: T[]) => void, v: T) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  // 정렬 고르기 — 도구 막대와 휴대폰 아래 고정 줄(MobileListBar)이 같이 쓴다
  const pickSort = (v: ListSort) => {
    setSort(v);
    track('filter', { name: 'sort', value: v });
  };
  // 도구 막대의 정렬·필터 줄. 이 줄이 화면 위로 사라지면 휴대폰에서는 아래 고정 줄이 대신 나온다
  const toolsRef = useRef<HTMLDivElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  /** 아래 고정 줄의 '필터': 필터를 펼치고 도구 막대(검색·범위·정렬·필터)로 올라간다 */
  const toFilters = () => {
    setFiltersOpen(true);
    requestAnimationFrame(() => {
      // 누른 버튼(아래 고정 줄)은 도구 막대가 보이면 사라진다 → 초점을 도구 막대의 필터 버튼으로 옮겨 둔다
      // (안 옮기면 초점이 문서 맨 위로 떨어져 키보드·화면 낭독기 사용자가 자리를 잃는다)
      filterBtnRef.current?.focus({ preventScroll: true });
      document.getElementById(TOOLS_ID)?.scrollIntoView({ block: 'start' });
    });
  };

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
        {/* 휴대폰(767px 이하): 로고 · 러닝톡 · 메뉴 버튼, 나머지는 메뉴 안. 768px 부터 펼쳐 보인다 (MobileMenu 의 NAV_INLINE_MIN) */}
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
          {/* 자리가 모자라도 로고는 줄지 않게 (예전엔 관리자 화면에서 워드마크가 찌그러졌다) */}
          <a href={langPath('/', lang)} className="flex h-11 shrink-0 items-center">
            <Logo />
          </a>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a
              href={langPath(COMMUNITY_PATH, lang)}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                e.preventDefault();
                openTalk();
              }}
              // 360px 미만(확대 표시한 휴대폰 320px 등)은 로고 옆에 자리가 없어 숨긴다 — 넘치면 메뉴 버튼이 화면 밖으로 밀린다. 메뉴 안에는 늘 있다
              className="inline-flex h-11 items-center rounded-ctl px-2.5 text-[15px] font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-sunken hover:text-ink max-[360px]:hidden md:h-9 md:px-3"
            >
              {COMMUNITY_NAV[lang]}
            </a>
            <button
              onClick={() => openRequest('header')}
              className="hidden h-9 items-center rounded-ctl px-3 text-[15px] font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-sunken hover:text-ink md:inline-flex"
            >
              {t('header.request')}
            </button>
            {profile?.is_admin && (
              <button
                onClick={() => setShowAdmin(true)}
                className="hidden h-9 items-center rounded-ctl px-3 text-[15px] font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-sunken hover:text-ink md:inline-flex"
              >
                {t('header.admin')}
              </button>
            )}
            {/* 언어 전환: 글자는 두 언어 모두 'EN / 한', 지금 언어 쪽만 진하게 */}
            <button
              onClick={switchLang}
              aria-label={t('lang.switch')}
              lang={nextLang}
              className="hidden h-9 items-center rounded-ctl px-3 text-[15px] font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-sunken hover:text-ink md:inline-flex"
            >
              <span>
                <span className={lang === 'en' ? 'text-ink' : undefined}>EN</span>
                {' / '}
                <span className={lang === 'ko' ? 'text-ink' : undefined}>한</span>
              </span>
            </button>
            <MyRacesProvider value={myRacesBridge}>
              <AuthBar onOpen={() => openLogin('in')} meOpen={meOpen} onMeOpenChange={setMeOpen} />
            </MyRacesProvider>
            <MobileMenu groups={menuGroups} className="md:hidden" />
          </nav>
        </div>
      </header>

      <main>
        {auth.justConfirmed && (
          <div className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
            <div className="flex items-center justify-between gap-3 rounded-box bg-accent px-4 py-3 text-on-accent">
              <span className="text-[15px] font-semibold">{t('app.confirmed')}</span>
              <button onClick={auth.clearFlags} aria-label={t('common.close')} className="-my-2 grid size-11 place-items-center rounded-ctl hover:bg-on-accent/10 sm:size-9">
                <X size={16} weight="bold" />
              </button>
            </div>
          </div>
        )}

        {/* 소개 + 현황판 */}
        <section className="mx-auto grid max-w-6xl gap-8 px-4 pt-8 pb-8 sm:px-6 md:grid-cols-[1fr_auto] md:items-end md:pt-12 md:pb-12">
          <div>
            <h1 className="text-[34px] leading-[1.12] font-extrabold tracking-[-0.03em] sm:text-[46px]">
              {t('site.name')}
            </h1>
            {/* 불러오는 동안에도 대회 수가 들어간 문장만큼 자리를 잡아 둔다 (안 보이는 겹침 칸) — 수가 들어오며 줄이 늘어 아래가 밀리지 않게 */}
            <p className="mt-4 grid max-w-[42ch] text-[15px] leading-relaxed text-balance text-ink-2 sm:text-[17px]">
              <span className="col-start-1 row-start-1">
                {remote === 'loading' ? t('app.lead') : t('app.leadCount', { kr: fmtCount(stats.kr, lang), abroad: fmtCount(stats.abroad, lang) })}
              </span>
              {remote === 'loading' && (
                <span aria-hidden className="invisible col-start-1 row-start-1">
                  {t('app.leadCount', { kr: '000', abroad: fmtCount(1000, lang) })}
                </span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-px overflow-hidden rounded-box bg-line md:w-[27rem]">
            <Stat label={t('stat.open')} value={counts.open} active={status.includes('open')} onClick={() => pickStatus('open')} />
            <Stat
              label={t('stat.closing7')}
              value={counts.closing7}
              active={status.includes('closing7')}
              hot={counts.closing7 > 0}
              onClick={() => pickStatus('closing7')}
            />
            <Stat
              label={t('stat.opening30')}
              value={counts.opening30}
              active={status.includes('opening30')}
              onClick={() => pickStatus('opening30')}
            />
          </div>
        </section>


        {/* 도구 막대 */}
        <div id={TOOLS_ID} className="scroll-mt-14 border-y border-line bg-bg sm:sticky sm:top-14 sm:z-20">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3 sm:px-6">
            <div role="radiogroup" aria-label={t('scope.aria')} className="grid w-full grid-cols-3 rounded-ctl bg-sunken p-1 sm:inline-flex sm:w-auto">
              {(
                [
                  ['all', t('scope.all'), counts.kr + counts.abroad],
                  ['kr', t('scope.kr'), counts.kr],
                  ['abroad', t('scope.abroad'), counts.abroad],
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
                  className={`flex h-11 items-center justify-center gap-2 rounded-[4px] px-3 text-[15px] font-semibold whitespace-nowrap transition-colors sm:h-8 sm:justify-start ${
                    scope === s ? 'bg-surface text-ink shadow-[0_1px_2px_var(--shadow)]' : 'text-ink-3 hover:text-ink'
                  }`}
                >
                  {label}
                  <span className="num text-[15px] text-ink-3">{fmtCount(n, lang)}</span>
                </button>
              ))}
            </div>

            <form role="search" onSubmit={onSearchSubmit} className="order-first w-full lg:order-none lg:w-auto lg:flex-1">
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
                  className="h-11 w-full rounded-ctl border border-line bg-surface pr-3 pl-9 text-[16px] outline-none transition-colors placeholder:text-ink-3 focus:border-ink sm:h-10 sm:text-[15px]"
                />
              </label>
            </form>
            {/* 휴대폰은 헤더 버튼이 숨겨져 있어 검색창 바로 밑에 (PC 는 바로 위 헤더 버튼이 같은 역할) */}
            <p className="order-first -mt-1 flex w-full items-center justify-end gap-2 text-[13px] text-ink-3 sm:hidden">
              {t('request.missing')}
              <button
                onClick={() => openRequest('search')}
                className="-my-3 inline-flex min-h-11 items-center font-semibold whitespace-nowrap text-ink-2 underline underline-offset-4 hover:text-ink"
              >
                {t('request.short')}
              </button>
            </p>

            {/* 1024px 아래(태블릿)는 검색이 첫 줄 전체, 범위·정렬·필터가 둘째 줄 — 한 줄에 다 넣으면 검색칸이 너무 좁다 */}
            <div ref={toolsRef} className="flex w-full items-center justify-end gap-2 sm:ml-auto sm:w-auto lg:ml-0">
              <SortSelect value={sort} onChange={pickSort} />
              {fav.ids.length > 0 && (
                <button
                  onClick={() => {
                    if (!favOnly) track('filter', { name: 'favorites', value: 'on' });
                    setFavOnly((v) => !v);
                  }}
                  aria-pressed={favOnly}
                  className={`inline-flex h-11 items-center gap-2 rounded-ctl border px-3 text-[15px] font-semibold whitespace-nowrap transition-colors sm:h-10 ${
                    favOnly ? ON_BORDERED : 'border-line bg-surface hover:border-ink'
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
                  className={`inline-flex h-11 items-center gap-2 rounded-ctl border px-3 text-[15px] font-semibold whitespace-nowrap transition-colors sm:h-10 ${
                    regOnly ? ON_BORDERED : 'border-line bg-surface hover:border-ink'
                  }`}
                >
                  <CheckSquare size={16} weight={regOnly ? 'fill' : 'bold'} />
                  <span className="hidden sm:inline">{t('reg.title')}</span>
                  <span className="num text-[15px]">{reg.ids.length}</span>
                  <span className="sr-only sm:hidden">{t('reg.only')}</span>
                </button>
              )}
              <button
                ref={filterBtnRef}
                onClick={() => setFiltersOpen((v) => !v)}
                aria-expanded={filtersOpen}
                className={`inline-flex h-11 items-center gap-2 rounded-ctl border px-3 text-[15px] font-semibold whitespace-nowrap transition-colors sm:h-10 ${
                  filtersOpen || activeFilters ? ON_BORDERED : 'border-line bg-surface hover:border-ink'
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
                      className="h-11 w-40 sm:h-10"
                      aria-label={t('filter.flightAria')}
                    />
                    <span className="num text-[15px] font-semibold">{maxFlight >= 24 ? t('filter.noLimit') : t('filter.hours', { n: maxFlight })}</span>
                  </FilterGroup>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 지역 막대 + 지도 */}
        {mapSection}

        {/* 목록 */}
        {/* 휴대폰은 위에 붙는 것이 머리말(56px)뿐이라 그만큼만 띄운다 (sm 부터는 고정 도구 막대 높이까지) */}
        <section id="list" className="mx-auto max-w-6xl scroll-mt-14 pb-16 sm:scroll-mt-44 sm:px-6 lg:scroll-mt-32">
          <ResultsAnnouncer query={dq.trim()} count={shown} suggestions={suggestions.length} loading={remote === 'loading'} />
          {remote === 'loading' ? (
            <div className="space-y-px pt-8" aria-busy="true" aria-label={t('list.loading')}>
              {/* 실제 카드(104px 안팎)와 같은 높이 — 목록이 뜰 때 아래가 덜 움직인다 */}
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="h-[104px] animate-pulse bg-surface" />
              ))}
            </div>
          ) : shown === 0 ? (
            <div id={RESULTS_EMPTY_ID} className="scroll-mt-14 px-4 py-20 text-center sm:scroll-mt-44 lg:scroll-mt-32">
              <p className="text-[17px] font-semibold">{dq.trim() ? t('list.notFound', { q: dq.trim() }) : t('list.noMatch')}</p>
              <p className="mx-auto mt-2 max-w-[34ch] text-[15px] break-keep text-balance text-ink-2">
                {t('list.emptyHelp')}
              </p>
              {/* 좁은 화면(360px 영어)에서는 두 버튼이 한 줄에 안 들어간다 → 줄바꿈 */}
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button
                  onClick={() => openRequest(dq.trim() ? 'empty_search' : 'empty')}
                  className="inline-flex h-11 items-center gap-2 rounded-ctl bg-ink px-4 text-[15px] font-semibold whitespace-nowrap text-bg hover:opacity-85 sm:h-10"
                >
                  <Plus size={14} weight="bold" aria-hidden />
                  {t('header.request')}
                </button>
                <button onClick={reset} className="h-11 rounded-ctl bg-sunken px-4 text-[15px] font-semibold whitespace-nowrap hover:bg-line sm:h-10">
                  {dq.trim() ? t('list.clearAll') : t('list.clearFilters')}
                </button>
              </div>
              {suggestions.length > 0 && (
                <div className="mt-12 text-left">
                  <h2 className="pb-2 text-[17px] font-bold tracking-tight">{t('list.didYouMean')}</h2>
                  <ul className="-mx-4 divide-y divide-line border-t border-line">
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
                <div className="flex items-baseline justify-between gap-3 px-4 pb-2">
                  <h2 className="flex items-baseline gap-2">
                    <span className="text-[20px] font-bold tracking-tight">{g.title}</span>
                    <span className="num text-[20px] font-semibold text-ink-3">{fmtCount(g.total, lang)}</span>
                  </h2>
                  {/* 하단 안내까지 내려가지 않아도 보이게 첫 묶음 제목 줄에 (헤더 버튼은 휴대폰에서 숨김) */}
                  {i === 0 && (
                    <button
                      onClick={() => openRequest('list')}
                      className="-my-3 -mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-ctl px-2 text-[15px] font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-sunken hover:text-ink"
                    >
                      <Plus size={14} weight="bold" aria-hidden />
                      <span>
                        <span className="hidden sm:inline">{t('list.missingLead')}</span>
                        {t('request.short')}
                      </span>
                    </button>
                  )}
                </div>
                <ul className="divide-y divide-line border-t border-line">
                  {g.races.map((r) => (
                    <RaceRow key={r.id} race={r} rating={ratingMap.get(r.id)} favorite={fav.has(r.id)} registered={reg.has(r.id)} onOpen={openRace} />
                  ))}
                </ul>
                {g.races.length < g.total && (
                  <div className="px-4 pt-3">
                    <MoreButton left={g.total - g.races.length} onClick={() => showMore(g.key, g.races.length)} />
                  </div>
                )}
              </div>
            ))
          )}

          {pastRaces.length > 0 && (
            <div className="px-4 pt-10">
              <button
                onClick={() => setShowPast((v) => !v)}
                aria-expanded={showPast}
                className="-my-3 inline-flex min-h-11 items-center gap-2 text-[15px] font-semibold text-ink-3 hover:text-ink"
              >
                {t(showPast ? 'past.hide' : 'past.show', { n: fmtCount(pastRaces.length, lang) })}
                <CaretDown size={14} className={showPast ? 'rotate-180' : ''} />
              </button>
              {showPast && (
                <ul className="-mx-4 mt-3 divide-y divide-line border-t border-line opacity-70">
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
        {/* 요즘 인기: 최근 7일 조회·저장이 많은 대회 */}
        {hotList.length >= 3 && (
          <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6" aria-label={t('hot.aria')}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[17px] font-bold">{t('hot.title')}</h2>
              <button
                onClick={() => {
                  // '조회순 전체 보기': 고르지 않은 지역·상태는 기본(국내·접수 중) 대신 전체·모두로 — 위 인기 대회(해외·접수 전 포함)가 목록에서 빠지지 않게
                  setPicks((p) => ({ scope: p.scope ?? 'all', status: p.status ?? [], sort: 'views' }));
                  track('filter', { name: 'sort', value: 'views' });
                  document.getElementById('list')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
                }}
                className="-my-3 inline-flex min-h-11 items-center text-[13px] font-semibold whitespace-nowrap text-ink-3 underline underline-offset-4 hover:text-ink"
              >
                {t('hot.all')}
              </button>
            </div>
            {/* 휴대폰: 두 줄씩 세 줄 (옆으로 밀지 않아도 1~6위가 다 보인다). sm 부터 3칸, lg 6칸 */}
            <ol className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {hotList.map((r, i) => {
                const st = ratingMap.get(r.id);
                return (
                  <li key={r.id} className="min-w-0">
                    <button
                      onClick={() => openRace(r)}
                      className="flex h-full w-full flex-col items-start gap-1 rounded-box bg-surface px-4 py-3 text-left transition-colors hover:bg-sunken"
                    >
                      {/* 1·2·3위: 순위 글자 옆 금·은·동 원(home.css 의 .medal). 순위는 글자가 말하므로 배지는 읽지 않는다 */}
                      <span className="num flex h-5 items-center gap-2 text-[13px] font-semibold text-ink-3">
                        {i < 3 && <span aria-hidden className={MEDAL[i]} />}
                        {t('hot.rank', { n: i + 1 })}
                      </span>
                      <span className="line-clamp-2 text-[15px] leading-snug font-bold [overflow-wrap:anywhere]">{raceName(r, lang)}</span>
                      <span className="text-[13px] text-ink-3">
                        {fmtDateShort(r.race_date, lang)} ·{' '}
                        {lang === 'en'
                          ? isDomestic(r)
                            ? whereText(r, 'en').split(', ').at(-1)
                            : countryName(r.country_code, r.country_ko, 'en')
                          : isDomestic(r)
                            ? r.city_ko.split(' ')[0]
                            : r.country_ko}
                      </span>
                      <span className="mt-auto pt-1 text-[13px] text-ink-3 sm:text-[12px]">
                        {t('views.pre')}
                        <span className="num">{shortCount(st?.views ?? 0, lang)}</span>
                        {t('views.post', { count: st?.views ?? 0 })}
                        {(st?.saves ?? 0) > 0 && (
                          <>
                            {t('saves.sep')}
                            {t('saves.pre')}
                            <span className="num">{shortCount(st!.saves!, lang)}</span>
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
        <section className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-12 sm:px-6 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-[20px] font-bold tracking-tight">{t('bottom.title')}</h2>
              <p className="mt-2 text-[15px] text-ink-2">{t('bottom.text')}</p>
            </div>
            <button
              onClick={() => openRequest('bottom')}
              className="h-11 shrink-0 self-start rounded-ctl bg-accent px-5 text-[15px] font-bold whitespace-nowrap text-on-accent transition hover:brightness-95 active:translate-y-px md:self-auto"
            >
              {t('header.request')}
            </button>
          </div>
        </section>

        <footer className="border-t border-line">
          {/* 휴대폰: 글자 14px, 아래 고정 줄(정렬·필터)에 마지막 줄이 가리지 않게 아래 여백을 더 둔다.
              문장 속 링크는 줄 높이를 건드리지 않고 위아래 16px 씩 눌리는 자리만 넓힌다(44px 이상) */}
          <div className="mx-auto max-w-6xl px-4 pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] text-[14px] leading-relaxed text-ink-3 sm:px-6 sm:pb-8 sm:text-[13px]">
            <p className="max-w-[70ch]">{t('footer.1')}</p>
            <p className="mt-2 max-w-[70ch]">
              {t('footer.2')}{' '}
              <a href={`${langPath(PRIVACY_PATH, lang)}#cookies`} className="py-4 underline underline-offset-2 hover:no-underline sm:py-3">
                {LEGAL.more[lang]}
              </a>
            </p>
            <p className="mt-2 max-w-[70ch]">
              {t('footer.contact')}{' '}
              <a href="mailto:marathon82@kakao.com" className="py-4 underline underline-offset-2 hover:no-underline sm:py-3">
                marathon82@kakao.com
              </a>
            </p>
            <p className="mt-2 max-w-[70ch]">{t('footer.notice')}</p>
            <p className="mt-2 flex flex-wrap gap-x-6">
              <a
                href={langPath(PRIVACY_PATH, lang)}
                className="inline-flex min-h-11 items-center font-bold text-ink-2 underline underline-offset-2 hover:no-underline sm:min-h-9"
              >
                {LEGAL.privacy[lang]}
              </a>
              <a href={langPath(TERMS_PATH, lang)} className="inline-flex min-h-11 items-center underline underline-offset-2 hover:no-underline sm:min-h-9">
                {LEGAL.terms[lang]}
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
              onLogin={openLogin}
              initialAction={pendingAction?.raceId === selected.id ? pendingAction.action : undefined}
              record={reg.records.get(selected.id)}
              recordsReady={reg.synced}
              onSaveRecord={reg.saveRecord}
              onClearRecord={reg.clearRecord}
              onRaceSaved={(r) => { setSelected(r); reload(true).finally(() => setData((d) => ({ ...d, races: d.races.map((x) => (x.id === r.id ? r : x)) }))); }}
              {...similarProps}
            />
          </Suspense>
        )}
      </Panel>

      <Panel open={talkOpen} onClose={closeTalk} label={COMMUNITY_NAV[lang]}>
        <Suspense fallback={null}>
          {talkOpen && <CommunityPage races={data.races} onClose={closeTalk} onLogin={() => setAuthMode('in')} />}
        </Suspense>
      </Panel>

      <Panel open={showRequest} onClose={() => setShowRequest(false)} label={t('header.request')}>
        <Suspense fallback={null}>
          <RequestPanel onClose={() => setShowRequest(false)} onLogin={() => openLogin('in')} />
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

      {/* 휴대폰: 목록을 내려 도구 막대가 안 보이면 화면 아래에 정렬·필터를 붙여 둔다 */}
      <MobileListBar
        watch={toolsRef}
        sort={sort}
        // 목록 한가운데서 정렬을 바꾸면 순서가 통째로 바뀐다 → 새 순서의 첫머리부터 보이게 목록 위로
        onSort={(v) => {
          pickSort(v);
          requestAnimationFrame(() => document.getElementById('list')?.scrollIntoView({ block: 'start' }));
        }}
        activeFilters={activeFilters}
        onFilters={toFilters}
      />

      {remote !== 'fallback' ? null : (
        // 휴대폰에서는 아래 고정 줄(정렬·필터) 위로
        <div className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 max-w-xs sm:bottom-4">
          <Note tone="error">{t('app.loadError')}</Note>
        </div>
      )}
    </div>
  );
}

/** 정렬 고르기 (도구 막대와 휴대폰 아래 고정 줄이 같이 쓴다). grow: 남는 폭을 채운다 */
function SortSelect({ value, onChange, grow }: { value: ListSort; onChange: (v: ListSort) => void; grow?: boolean }) {
  const { t } = useLang();
  return (
    <label className={`relative ${grow ? 'min-w-0 flex-1' : ''}`}>
      <span className="sr-only">{t('sort.label')}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as ListSort)}
        className={`h-11 appearance-none rounded-ctl border border-line bg-surface pr-9 pl-3 text-[16px] font-semibold outline-none focus:border-ink sm:h-10 sm:text-[15px] ${grow ? 'w-full' : ''}`}
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
  );
}

/**
 * 휴대폰(640px 미만) 전용 아래 고정 줄: 정렬 + 필터. 도구 막대의 정렬·필터 줄(watch)이 머리말 위로 사라졌을 때만 보인다
 * (엄지가 닿는 자리 — 목록을 수천 px 내려도 정렬을 바꾸거나 필터로 돌아갈 수 있게).
 * 새 동작이 아니라 도구 막대의 같은 정렬·같은 필터다: 정렬은 그 자리에서 바뀌고, '필터' 는 필터를 펼친 도구 막대로 올라간다.
 */
function MobileListBar({
  watch,
  sort,
  onSort,
  activeFilters,
  onFilters,
}: {
  watch: RefObject<HTMLElement | null>;
  sort: ListSort;
  onSort: (v: ListSort) => void;
  activeFilters: number;
  onFilters: () => void;
}) {
  const { t } = useLang();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = watch.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // 위쪽 56px 은 머리말에 가린 자리. 줄이 그 위로 다 올라갔을 때만 켠다.
    // 보는 범위를 아래로 넉넉히 늘려, 줄이 화면 아래에 있을 때도 '보임'으로 친다 → '안 보임' = 머리말 아래 선보다 위, 하나뿐이다.
    // (화면 높이까지만 보면, 낮은 화면에서는 줄이 처음부터 화면 아래라 한 번에 뛰어 내려갈 때 — 줄인 움직임 설정에서 현황판·검색이
    //  목록으로 보낼 때 — '안 보임 → 안 보임'이라 알림이 오지 않아 끝내 켜지지 않는다. 맨 위로 뛸 때는 반대로 안 꺼진다)
    // 알림이 밀려 한꺼번에 여러 개 오면 마지막 것이 지금 상태다 (첫 것을 쓰면 옛 상태로 굳는다)
    const io = new IntersectionObserver((entries) => setShown(!entries[entries.length - 1].isIntersecting), {
      rootMargin: `-${HEADER_H}px 0px 9999px 0px`,
    });
    io.observe(el);
    return () => io.disconnect();
  }, [watch]);
  if (!shown) return null;
  return (
    <div
      role="group"
      aria-label={`${t('sort.label')} · ${t('filter.button')}`}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] shadow-[0_-1px_3px_var(--shadow)] sm:hidden"
    >
      <div className="flex items-center gap-2 px-4 py-2">
        <SortSelect value={sort} onChange={onSort} grow />
        <button
          type="button"
          onClick={onFilters}
          className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-ctl border px-3 text-[15px] font-semibold whitespace-nowrap transition-colors ${
            activeFilters ? ON_BORDERED : 'border-line bg-surface hover:border-ink'
          }`}
        >
          <SlidersHorizontal size={16} weight="bold" />
          {t('filter.button')}
          {activeFilters > 0 && <span className="num text-[15px]">{activeFilters}</span>}
        </button>
      </div>
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
      // 고른 칸: 검정으로 채우지 않고 밝은 바탕 + 진한 2px 테두리 (양 끝 칸은 상자 모서리를 따라 둥글게)
      className={`flex flex-col items-start justify-between gap-2 px-4 py-4 text-left transition-colors first:rounded-l-box last:rounded-r-box ${
        active
          ? 'bg-surface text-ink shadow-[inset_0_0_0_2px_var(--ink)]'
          : hot
            ? 'bg-accent text-on-accent hover:brightness-95'
            : 'bg-surface hover:bg-sunken'
      }`}
    >
      {/* 라벨이 두 줄(영어)이어도 숫자는 세 칸 모두 아래쪽에 같은 선으로 */}
      <span className={`text-[13px] leading-snug ${active ? 'text-ink-3' : hot ? 'opacity-85' : 'text-ink-3'}`}>{label}</span>
      <span className="num text-[34px] leading-none font-bold sm:text-[40px]">{value}</span>
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    // 휴대폰: 칩 한 줄 가로 스크롤(화면 끝까지, 끝 여백 16px, 위아래 4px 는 초점 테두리 자리)
    // sm 이상: 줄바꿈, 둘째 줄도 라벨 밑이 아니라 칩 칸에서 시작
    <div className="grid grid-cols-[4rem_minmax(0,1fr)] items-start gap-x-2">
      <span className="flex h-11 items-center text-[13px] font-semibold text-ink-3 sm:h-10">{label}</span>
      <div className="-my-1 -mr-4 flex min-h-11 items-center gap-2 overflow-x-auto py-1 pr-4 [scrollbar-width:none] sm:my-0 sm:mr-0 sm:min-h-10 sm:flex-wrap sm:overflow-visible sm:py-0 sm:pr-0 [&>*]:shrink-0">
        {children}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex h-11 items-center gap-1 rounded-ctl px-3 text-[15px] font-semibold whitespace-nowrap transition-colors active:translate-y-px sm:h-10 ${
        on ? 'bg-surface text-ink shadow-[inset_0_0_0_2px_var(--ink)]' : 'bg-surface text-ink-2 hover:bg-sunken hover:text-ink'
      }`}
    >
      {on && <Check size={14} weight="bold" />}
      {children}
    </button>
  );
}
