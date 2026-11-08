import { lazy, memo, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, MapTrifold } from '@phosphor-icons/react';
import type { Race, Region } from '../lib/types';
import { REGIONS } from '../lib/types';
import { isDomestic } from '../lib/util';
import { PROVINCES, placeOf } from '../lib/places';
import { SUBREGIONS, SUBREGION_NAME, isSubCountry, isSubregionId, subCountryOf, subOf, type SubCountry } from '../lib/subregions';
import { EAST_ASIA, EAST_ASIA_ENTRY, countryRegion } from '../lib/geo';
import { track } from '../lib/analytics';
import type { MapBack } from './MapView';

const MapView = lazy(() => import('./MapView'));

export type Scope = 'all' | 'kr' | 'abroad';

const OVERSEAS = REGIONS.filter((r) => r !== '한국') as Region[];
/** 나라 칩은 이만큼만 먼저 보여 준다 */
const CHIP_LIMIT = 12;
/** 지역을 안 골랐을 때의 focus. 그릴 때마다 새 [] 를 넘기면 지도 path 묶음의 memo 가 깨진다 */
const NO_ZONE: string[] = [];
/** 주·도 정보가 아직 없는 나라의 counts (그릴 때마다 새 {} 를 넘기지 않게) */
const NO_COUNTS: Record<string, number> = {};

/**
 * 지역 막대(시·도 / 지역 칩) + 나라 칩 + 지도.
 * 고른 지역·나라는 App 의 regions·place 로 올려 보내 목록 필터와 같이 움직인다.
 * props 가 같으면 다시 그리지 않는다 (검색 입력 등으로 App 이 다시 그려져도 지도는 그대로).
 */
export default memo(MapSection);

function MapSection({
  scope,
  races,
  regions,
  onRegions,
  place,
  onPlace,
  onScope,
}: {
  scope: Scope;
  /** 지난 대회를 뺀 전체. 국내/해외 거르기는 여기서 */
  races: Race[];
  regions: Region[];
  onRegions: (r: Region[]) => void;
  place: string | null;
  onPlace: (id: string | null) => void;
  onScope: (s: Scope) => void;
}) {
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

  // 지역 막대·지도에 쓰는 숫자 (국내/해외 선택만 반영해서 다른 필터를 바꿔도 지도가 흔들리지 않게)
  const geo = useMemo(() => {
    const base = races.filter((r) => (scope === 'kr' ? isDomestic(r) : scope === 'abroad' ? !isDomestic(r) : true));
    const region: Partial<Record<Region, number>> = {};
    const province: Record<string, number> = {};
    const country: Record<string, number> = {};
    // 주·도 지도 나라별 주·도 대회 수 (나라마다 따로 — 섞이면 5단계 기준(max)이 틀어진다)
    const sub: Partial<Record<SubCountry, Record<string, number>>> = {};
    const names: Record<string, string> = { kr: '한국' };
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
        const s = isSubCountry(c) ? subOf(r) : null;
        if (s) (sub[c as SubCountry] ??= {})[s] = (sub[c as SubCountry]?.[s] ?? 0) + 1;
      }
    }
    for (const p of PROVINCES) names[p.id] = p.name;
    for (const [id, name] of SUBREGION_NAME) names[id] = name;
    // 지역별 나라 (대회 많은 순). 한국 지역은 'kr' 하나
    const regionOf = countryRegion(base);
    const byRegion: Partial<Record<Region, string[]>> = {};
    for (const c of Object.keys(country).sort((a, b) => country[b] - country[a])) {
      const r = regionOf[c];
      if (r) (byRegion[r] ??= []).push(c);
    }
    return { region, province, country, sub, names, regionOf, byRegion };
  }, [races, scope]);

  // 지역 칩은 하나만 고르므로 지도도 그 지역으로 확대
  const zone = scope === 'kr' ? null : (regions[0] ?? null);
  const zoneIds = zone ? (geo.byRegion[zone] ?? NO_ZONE) : NO_ZONE;
  const [allChips, setAllChips] = useState(false);
  useEffect(() => setAllChips(false), [zone]);
  // 대회 많은 나라(미국·일본 등)를 고르면 세계 지도 대신 그 나라 주·도 지도 (한국의 시·도 지도와 같은 방식)
  const sub = scope === 'kr' ? null : subCountryOf(place);
  const subPicked = sub && isSubregionId(place) ? place : null;
  const subIds = useMemo(
    () =>
      sub
        ? SUBREGIONS[sub].list
            .filter((s) => geo.sub[sub]?.[s.id])
            .sort((a, b) => (geo.sub[sub]?.[b.id] ?? 0) - (geo.sub[sub]?.[a.id] ?? 0))
            .map((s) => s.id)
        : NO_ZONE,
    [sub, geo],
  );
  // '+N개 더' 를 펼친 나라 (다른 나라로 바뀌면 저절로 접힌다)
  const [allSubFor, setAllSubFor] = useState<SubCountry | null>(null);
  const allSubChips = !!sub && allSubFor === sub;
  // 동아시아 확대 (지도 전용 — 목록 필터 regions 는 그대로). 한국·일본은 지역이 나라 하나라 첫 클릭은 이걸로
  const [near, setNear] = useState(false);
  const nearOn = near && scope !== 'kr' && !zone && !sub;
  useEffect(() => setNear(false), [scope]);
  // 지역·주·도 지도가 생기면 푼다. 지역이 없어질 때는 그대로 (다른 지역 확대 중 한국·일본 클릭 = 지역 풀고 동아시아로)
  useEffect(() => {
    if (zone || sub) setNear(false);
  }, [zone, sub]);

  const toList = () => document.getElementById('list')?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  /** 한국을 고르면 세계 지도에서 확대하는 대신 국내(시·도) 지도로 — 국내 탭을 누른 것과 같은 상태 */
  const toKorea = () => {
    onScope('kr');
    onRegions([]);
    onPlace(null);
    track('filter', { name: 'scope', value: 'kr' });
  };

  /** 국내 지도에서 세계 지도로 — 도구 막대 '전체' 탭을 누른 것과 같은 상태 */
  const toWorld = () => {
    onScope('all');
    onRegions([]);
    onPlace(null);
    track('filter', { name: 'scope', value: 'all' });
  };

  // 안전망: 다른 경로로 세계 지도에서 한국이 골라져도 국내 지도로 (사용자가 누른 게 아닐 수 있어 기록은 남기지 않는다)
  useEffect(() => {
    if (scope !== 'kr' && place === 'kr') {
      onScope('kr');
      onRegions([]);
      onPlace(null);
    }
  }, [scope, place, onScope, onRegions, onPlace]);

  /** 나라·시·도 고르기 (다시 누르면 풀림 — 그 나라 주·도를 고른 중이어도). 목록으로 스크롤은 지도에서 고를 때 또는 지도를 접어 둔 때만 */
  const pick = (id: string, scroll: boolean) => {
    if (scope !== 'kr' && id === 'kr') return toKorea();
    const next = place === id || subCountryOf(place) === id ? null : id;
    onPlace(next);
    if (next) {
      track('map_select', { place: next });
      // 주·도 지도로 바뀌는 나라는 바뀐 지도를 보도록 스크롤하지 않는다 (지도를 접어 둔 때만)
      if (scroll && (!mapOpen || !isSubCountry(next))) toList();
    }
  };

  /** 주·도 고르기. 고른 주·도를 다시 누르면 그 나라 전체 */
  const pickSub = (id: string, scroll: boolean) => {
    if (!sub) return;
    if (place === id) return onPlace(sub);
    onPlace(id);
    track('map_select', { place: id });
    if (scroll) toList();
  };

  /** 지역으로 확대. 나라 하나뿐인 지역(일본)은 그 나라도 같이 고른다 (두 번 누르지 않게). 한국은 국내 지도로 */
  const enterZone = (r: Region) => {
    if (r === '한국') return toKorea();
    const ids = geo.byRegion[r] ?? [];
    onRegions([r]);
    onPlace(ids.length === 1 ? ids[0] : null);
    if (ids.length === 1) track('map_select', { place: ids[0] });
  };

  const leaveZone = () => {
    onRegions([]);
    onPlace(null);
  };

  /** 지도 클릭: 국내는 시·도 확대+선택, 세계 지도는 처음엔 지역 확대, 그 지역 안에서는 나라 선택 */
  const onMapSelect = (id: string) => {
    // 그 시·도로 확대되는 걸 보도록 스크롤하지 않는다
    if (scope === 'kr') return pick(id, false);
    if (sub) return pickSub(id, false);
    // 동아시아 확대 중: 그 안의 나라는 선택, 밖의 나라는 아래 규칙대로 그 지역으로
    if (nearOn) {
      setNear(false);
      if (id === 'kr') return toKorea();
      if (EAST_ASIA.includes(id)) {
        const r = geo.regionOf[id];
        if (!r) return;
        if (r === '일본') return enterZone(r);
        onRegions([r]);
        onPlace(id);
        track('map_select', { place: id });
        if (!isSubCountry(id)) toList();
        return;
      }
    }
    // 한국·일본 첫 클릭은 바로 들어가지 않고 동아시아로 확대만 ('아시아' 확대 중이면 아래에서 바로 선택)
    if (EAST_ASIA_ENTRY.includes(id) && zone !== '아시아' && zone !== geo.regionOf[id]) {
      if (zone) leaveZone();
      setNear(true);
      track('map_region', { region: '동아시아' });
      return;
    }
    if (id === 'kr') return toKorea();
    const r = geo.regionOf[id];
    if (!r) return pick(id, true);
    if (zone !== r) {
      track('map_region', { region: r });
      return enterZone(r);
    }
    pick(id, zoneIds.length > 1);
  };

  /** 지도 왼쪽 위 돌아가기 버튼과 한 단계 위(바다 클릭·Esc): 주·도 고름 → 나라 전체 → 세계 */
  const nav = (): { backs: MapBack[]; up?: () => void } => {
    const toAll = (onClick: () => void): MapBack => ({ label: '전체 지도', icon: 'back', onClick });
    const world = (onClick: () => void): MapBack => ({ label: '세계 지도', icon: 'world', onClick });
    if (nearOn) return { backs: [toAll(() => setNear(false))], up: () => setNear(false) };
    if (sub) {
      if (subPicked) return { backs: [toAll(() => onPlace(sub)), world(leaveZone)], up: () => onPlace(sub) };
      return { backs: [world(leaveZone)], up: leaveZone };
    }
    if (zone) return { backs: [toAll(leaveZone)], up: leaveZone };
    if (scope === 'kr') {
      if (place) return { backs: [toAll(() => onPlace(null)), world(toWorld)], up: () => onPlace(null) };
      return { backs: [world(toWorld)], up: toWorld };
    }
    return { backs: [] };
  };
  const { backs, up } = nav();

  return (
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
                <Chip key={p.id} on={place === p.id} onClick={() => pick(p.id, !mapOpen)}>
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
                    if (regions.includes(r)) return leaveZone();
                    track('filter', { name: 'region', value: r });
                    enterZone(r);
                  }}
                >
                  {r}
                  <span className="num ml-0.5 text-[14px] opacity-80">{geo.region[r]}</span>
                </Chip>
              ))}
      </div>

      {zoneIds.length > 1 && (
        <div className="-mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
          <span className="shrink-0 text-[13px] font-semibold text-ink-3">나라</span>
          {zoneIds
            // 아시아·유럽은 30개가 넘어 지도를 밀어내므로 대회 많은 순 앞쪽만 (고른 나라는 늘 보이게)
            .filter((c, i) => allChips || i < CHIP_LIMIT || c === place || c === sub)
            .map((c) => (
              // 지도가 펼쳐져 있으면 그 나라로 확대되는 걸 보도록 스크롤하지 않는다
              <Chip key={c} on={place === c || c === sub} onClick={() => pick(c, !mapOpen)}>
                {geo.names[c]}
                <span className="num ml-0.5 text-[14px] opacity-80">{geo.country[c]}</span>
              </Chip>
            ))}
          {zoneIds.length > CHIP_LIMIT + 1 && (
            <button
              type="button"
              onClick={() => setAllChips((v) => !v)}
              aria-expanded={allChips}
              className="inline-flex h-10 items-center rounded-ctl px-2 text-[14px] font-semibold text-ink-2 transition hover:bg-sunken hover:text-ink sm:h-8"
            >
              {allChips ? '접기' : `+${zoneIds.length - CHIP_LIMIT}개 더`}
            </button>
          )}
        </div>
      )}

      {sub && subIds.length > 0 && (
        <div className="-mx-4 mt-2 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&>button]:shrink-0 [&>button]:whitespace-nowrap">
          <span className="shrink-0 text-[13px] font-semibold text-ink-3">{SUBREGIONS[sub].unit}</span>
          {subIds
            .filter((id, i) => allSubChips || i < CHIP_LIMIT || id === place)
            .map((id) => (
              <Chip key={id} on={place === id} onClick={() => pickSub(id, !mapOpen)}>
                {geo.names[id]}
                <span className="num ml-0.5 text-[14px] opacity-80">{geo.sub[sub]?.[id]}</span>
              </Chip>
            ))}
          {subIds.length > CHIP_LIMIT + 1 && (
            <button
              type="button"
              onClick={() => setAllSubFor(allSubChips ? null : sub)}
              aria-expanded={allSubChips}
              className="inline-flex h-10 items-center rounded-ctl px-2 text-[14px] font-semibold text-ink-2 transition hover:bg-sunken hover:text-ink sm:h-8"
            >
              {allSubChips ? '접기' : `+${subIds.length - CHIP_LIMIT}개 더`}
            </button>
          )}
        </div>
      )}

      {place && !(scope === 'kr' || regions.length) && (
        <div className="mt-2">
          <Chip on onClick={() => onPlace(null)}>
            {geo.names[place] ?? place}
          </Chip>
        </div>
      )}

      {mapOpen && (
        <div className="mt-3 rounded-box border border-line bg-surface p-1.5 sm:p-2">
          <Suspense fallback={<div className="aspect-[5/4] animate-pulse rounded-box bg-sunken sm:aspect-auto sm:h-[min(62vh,560px)]" />}>
            <MapView
              kind={scope === 'kr' ? 'kr' : (sub ?? 'world')}
              counts={scope === 'kr' ? geo.province : sub ? (geo.sub[sub] ?? NO_COUNTS) : geo.country}
              names={geo.names}
              selected={sub ? subPicked : place}
              focus={sub ? NO_ZONE : nearOn ? EAST_ASIA : zoneIds}
              onSelect={onMapSelect}
              backs={backs}
              onUp={up}
            />
          </Suspense>
          {scope !== 'kr' && place === 'kr' && (
            <p className="mt-2 px-1.5 text-[13px] text-ink-2">
              국내 대회 {geo.country.kr ?? 0}개를 보고 있습니다.{' '}
              <button
                type="button"
                onClick={() => {
                  onScope('kr');
                  leaveZone();
                }}
                className="font-semibold text-ink underline underline-offset-2 hover:no-underline"
              >
                시·도별 지도로 보기
              </button>
            </p>
          )}
          <p className="mt-2 flex flex-wrap justify-between gap-2 px-1.5 pb-1 text-[12px] text-ink-3">
            <span>
              {scope === 'kr'
                ? '시·도를 누르면 그곳 대회만 보입니다.'
                : sub
                  ? '주·도를 누르면 그곳 대회만 보입니다.'
                  : zone || nearOn
                  ? '나라를 누르면 그 나라 대회만 보입니다. 다른 지역 나라를 누르면 그 지역으로 옮겨 갑니다.'
                  : '나라를 누르면 그 지역(아시아·유럽 등)으로 확대되고, 한 번 더 누르면 그 나라 대회만 보입니다.'}{' '}
              색이 진할수록 대회가 많습니다. 두 손가락이나 휠로 확대하고 끌어서 옮깁니다.
            </span>
            {sub ? (
              <span>
                지도{' '}
                <a href="https://www.naturalearthdata.com/" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Natural Earth
                </a>{' '}
                (공개 도메인)
              </span>
            ) : (
              <span>
                지도{' '}
                <a href="https://github.com/VictorCazanave/svg-maps" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  svg-maps
                </a>{' '}
                (CC BY 4.0)
              </span>
            )}
          </p>
        </div>
      )}
    </section>
  );
}

// App 의 Chip 과 같은 모양 (지도 영역 전용 사본)
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
