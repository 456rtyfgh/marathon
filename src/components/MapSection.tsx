import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { Check, MapTrifold } from '@phosphor-icons/react';
import type { Race, Region } from '../lib/types';
import { REGIONS } from '../lib/types';
import { isDomestic } from '../lib/util';
import { PROVINCES, placeOf } from '../lib/places';
import { track } from '../lib/analytics';

const MapView = lazy(() => import('./MapView'));

export type Scope = 'all' | 'kr' | 'abroad';

const OVERSEAS = REGIONS.filter((r) => r !== '한국') as Region[];

/**
 * 지역 막대(시·도 / 지역 칩) + 나라 칩 + 지도.
 * 고른 지역·나라는 App 의 regions·place 로 올려 보내 목록 필터와 같이 움직인다.
 */
export default function MapSection({
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
  }, [races, scope, regions]);

  const pickPlace = (id: string | null) => {
    if (id === 'kr' && scope !== 'kr') {
      onScope('kr');
      onRegions([]);
      onPlace(null);
    } else onPlace(id);
    if (id) track('map_select', { place: id });
    document.getElementById('list')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

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
                    onRegions(regions.includes(r) ? regions.filter((x) => x !== r) : [r]);
                    onPlace(null);
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
          <Chip on onClick={() => onPlace(null)}>
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
