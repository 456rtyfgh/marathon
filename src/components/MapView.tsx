import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

type MapData = { viewBox: string; locations: { id: string; d: string }[] };

const cache: Partial<Record<'kr' | 'world', MapData>> = {};
const loaders = {
  kr: () => import('../maps/korea.json').then((m) => m.default as MapData),
  world: () => import('../maps/world.json').then((m) => m.default as MapData),
};

/**
 * 시·도(국내) 또는 나라(해외) 별 대회 수를 색으로 보여 주는 지도.
 * 색이 칠해진 곳을 누르면 그 지역 대회만 목록에 남는다.
 */
export default function MapView({
  kind,
  counts,
  names,
  selected,
  focus,
  onSelect,
}: {
  kind: 'kr' | 'world';
  counts: Record<string, number>;
  names: Record<string, string>;
  selected: string | null;
  /** 이 지역들이 꽉 차게 확대 (예: 유럽 나라들) */
  focus: string[];
  onSelect: (id: string | null) => void;
}) {
  const [map, setMap] = useState<MapData | undefined>(cache[kind]);
  const [box, setBox] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const refs = useRef(new Map<string, SVGPathElement>());

  useEffect(() => {
    let live = true;
    if (cache[kind]) setMap(cache[kind]);
    else
      loaders[kind]().then((m) => {
        cache[kind] = m;
        if (live) setMap(m);
      });
    return () => {
      live = false;
    };
  }, [kind]);

  const focusKey = focus.join(',');
  useLayoutEffect(() => {
    if (!map) return;
    const ids = focus.filter((id) => refs.current.has(id));
    if (!ids.length) return setBox(null);
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const id of ids) {
      const b = refs.current.get(id)!.getBBox();
      // 러시아·미국처럼 큰 나라가 끼면 화면이 다시 넓어지므로 아주 넓은 나라는 빼고 본다
      if (kind === 'world' && b.width > 180 && ids.length > 1) continue;
      x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
      x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height);
    }
    if (!isFinite(x1)) return setBox(null);
    const [, , vw, vh] = map.viewBox.split(' ').map(Number);
    const ratio = vw / vh;
    let w = x2 - x1, h = y2 - y1;
    const pad = Math.max(w, h) * 0.06 + 4;
    w += pad * 2; h += pad * 2;
    if (w / h > ratio) h = w / ratio; else w = h * ratio;
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
    setBox(`${(cx - w / 2).toFixed(1)} ${(cy - h / 2).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, focusKey, kind]);

  const max = useMemo(() => Math.max(1, ...Object.values(counts)), [counts]);

  if (!map) {
    return <div className={`animate-pulse rounded-box bg-sunken ${kind === 'kr' ? 'aspect-[524/631] max-h-[420px]' : 'aspect-[1010/666]'}`} />;
  }

  const inFocus = (id: string) => !focus.length || focus.includes(id);
  const fill = (id: string) => {
    if (id === selected) return 'var(--ink)';
    const n = inFocus(id) ? counts[id] ?? 0 : 0;
    if (!n) return 'var(--sunken)';
    // 1개도 눈에 띄게 35% 에서 시작해 많을수록 진하게
    const pct = Math.round(35 + 65 * Math.sqrt(n / max));
    return `color-mix(in oklab, var(--accent) ${pct}%, var(--sunken))`;
  };

  const tip = hover ?? selected;

  return (
    <div className="relative">
      <svg
        viewBox={box ?? map.viewBox}
        className={`block w-full ${kind === 'kr' ? 'mx-auto max-h-[440px]' : 'max-h-[460px]'}`}
        role="group"
        aria-label={kind === 'kr' ? '시·도별 대회 지도' : '나라별 대회 지도'}
        onMouseLeave={() => setHover(null)}
      >
        {map.locations.map(({ id, d }) => {
          const n = inFocus(id) ? counts[id] ?? 0 : 0;
          return (
            <path
              key={id}
              ref={(el) => {
                if (el) refs.current.set(id, el);
                else refs.current.delete(id);
              }}
              d={d}
              fill={fill(id)}
              stroke="var(--bg)"
              strokeWidth={kind === 'kr' ? 1.2 : 0.4}
              vectorEffect="non-scaling-stroke"
              className={n ? 'cursor-pointer transition-[fill] duration-150 hover:brightness-95 focus:outline-none' : ''}
              {...(n
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': `${names[id] ?? id} 대회 ${n}개`,
                    'aria-pressed': id === selected,
                    onClick: () => onSelect(id === selected ? null : id),
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(id === selected ? null : id);
                      }
                    },
                    onMouseEnter: () => setHover(id),
                    onFocus: () => setHover(id),
                  }
                : { 'aria-hidden': true })}
            />
          );
        })}
      </svg>
      {tip && counts[tip] ? (
        <div className="pointer-events-none absolute top-2 left-2 rounded-ctl bg-surface px-2.5 py-1.5 text-[14px] shadow-[0_1px_3px_rgb(0_0_0/0.12)]">
          <span className="font-semibold">{names[tip] ?? tip}</span>
          <span className="num ml-1.5 text-[16px] font-semibold">{counts[tip]}</span>
          <span className="text-ink-3">개</span>
        </div>
      ) : null}
    </div>
  );
}
