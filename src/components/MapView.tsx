import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Plus, Minus, ArrowsIn, ArrowLeft } from '@phosphor-icons/react';
import { union, type Box } from '../lib/geo';
import { MAP_SELECTED, mapFill, mapStep } from '../lib/mapColor';
import MapLegend from './MapLegend';
// 지도는 JS 모듈 대신 JSON 파일로 받아 res.json() 으로 읽는다 (800KB 짜리 JS 를 해석·실행하지 않게)
import koreaUrl from '../maps/korea.json?url';
import worldUrl from '../maps/world.json?url';
// 조각별 경계 상자 중 가장 큰 것 = geo.ts 의 mainBox(d). 791KB 의 d 를 화면에서 훑지 않게 미리 계산해 둔 것
// (지도 json 이 바뀌면 다시 만든다: node .duo-data/perf/gen-boxes.mjs)
import koreaBoxes from '../maps/korea-boxes.json';
import worldBoxes from '../maps/world-boxes.json';

type Kind = 'kr' | 'world';
type MapData = { viewBox: string; locations: { id: string; d: string }[]; boxes: Map<string, Box> };
type Pt = { x: number; y: number };

const BOXES: Record<Kind, Record<string, number[]>> = { kr: koreaBoxes, world: worldBoxes };
const URLS: Record<Kind, string> = { kr: koreaUrl, world: worldUrl };
const cache: Partial<Record<Kind, MapData>> = {};
// 받는 중인 것은 같이 기다린다 (StrictMode 의 두 번 실행에도 한 번만 받고 한 번만 읽게)
const pending: Partial<Record<Kind, Promise<MapData>>> = {};
const load = (kind: Kind) =>
  (pending[kind] ??= fetch(URLS[kind])
    .then((r) => r.json() as Promise<Omit<MapData, 'boxes'>>)
    .then((m) => ({
      ...m,
      boxes: new Map(Object.entries(BOXES[kind]).map(([id, [x, y, w, h]]) => [id, { x, y, w, h }])),
    })));
const NO_BOXES = new Map<string, Box>();

const MAX_ZOOM = 8;
/** 이만큼 움직이기 전까지는 탭(지역 선택)으로 본다 */
const TAP_SLOP = 6;
/** 세계 지도에서 지역으로 확대할 때 최소 폭 (지도 단위, 전체 1010). 한국·일본도 주변이 보이게 */
const MIN_FIT_W = 100;
/** 나라 하나를 고를 때 최소 폭. 싱가포르·홍콩처럼 아주 작은 나라도 눈에 띄게 더 들어간다 */
const MIN_PICK_W = 60;
/** 국내 지도에서 시·도 하나를 고를 때 최소 폭 (지도 단위, 전체 524). 세종·대전·광주도 둘레가 보이게 */
const MIN_PROVINCE_W = 120;
/** 이보다 넓은 나라(러시아·캐나다 등)는 대회가 가장 많은 나라가 아니면 맞춤에서 뺀다 */
const HUGE_W = 180;
/** 대회 비중이 이보다 작은 나라가 화면을 25% 넘게 넓히면 맞춤에서 뺀다 (그린란드·북마리아나 등) */
const MINOR_SHARE = 0.03;

const parseBox = (s: string): Box => {
  const [x, y, w, h] = s.split(' ').map(Number);
  return { x, y, w, h };
};
const fmtBox = (b: Box) => `${b.x.toFixed(2)} ${b.y.toFixed(2)} ${b.w.toFixed(2)} ${b.h.toFixed(2)}`;
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const area = (b: Box) => b.w * b.h;
const grow = (b: Box, f: number): Box => ({ x: b.x - b.w * f, y: b.y - b.h * f, w: b.w * (1 + 2 * f), h: b.h * (1 + 2 * f) });
/** 두 상자가 겹치는 부분 (안 겹치면 null) */
const clip = (a: Box, b: Box): Box | null => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
};

/** b 를 가운데 그대로 두고 화면 비율(ratio = 가로/세로)에 맞게 넓힌다 */
const toRatio = (b: Box, ratio: number): Box => {
  let { w, h } = b;
  if (w / h > ratio) h = w / ratio;
  else w = h * ratio;
  return { x: b.x + (b.w - w) / 2, y: b.y + (b.h - h) / 2, w, h };
};

/**
 * 시·도(국내) 또는 나라(해외) 별 대회 수를 색으로 보여 주는 지도.
 * 색이 칠해진 곳을 누르면 onSelect(id) — 지역 확대인지 나라 선택인지는 부모(MapSection)가 정한다.
 * selected(고른 나라·시·도) → focus(지역 나라들) 순으로 그곳이 꽉 차게 확대한다.
 * 두 손가락·휠로 더 확대하고, 확대한 뒤에는 끌어서 옮긴다.
 */
export default function MapView({
  kind,
  counts,
  names,
  selected,
  focus,
  onSelect,
  onBack,
}: {
  kind: Kind;
  counts: Record<string, number>;
  names: Record<string, string>;
  selected: string | null;
  /** 이 지역들이 꽉 차게 확대 (예: 유럽 나라들). 밖의 나라는 흐리게 */
  focus: string[];
  onSelect: (id: string) => void;
  /** 지역·시·도 확대 중일 때 '전체 지도' 버튼 */
  onBack?: () => void;
}) {
  const [map, setMap] = useState<MapData | undefined>(cache[kind]);
  // 처음 화면(지금 맞춤 영역). 제스처 계산은 ref 로, 그리기 판단은 state 로
  const [base, setBase] = useState<Box | null>(null);
  const baseRef = useRef<Box | null>(null);
  const boundsRef = useRef<Box | null>(null);
  // 지금 보이는 영역. 제스처 중에는 ref 로 바로 그리고 배율만 state 로 둔다
  const view = useRef<Box | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panned, setPanned] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [ratio, setRatio] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let live = true;
    if (cache[kind]) setMap(cache[kind]);
    else
      load(kind).then((m) => {
        cache[kind] = m;
        if (live) setMap(m);
      });
    return () => {
      live = false;
    };
  }, [kind]);

  // 그려지는 상자 비율. CSS 로 크기를 정하므로 viewBox 를 바꿔도 크기는 안 바뀐다 (되먹임 없음)
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const r = svg.getBoundingClientRect();
      if (r.width && r.height) setRatio(Math.round((r.width / r.height) * 100) / 100);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [map]);

  /** 조각별 경계 상자 중 가장 큰 것 (미국은 본토, 프랑스는 본토) */
  const boxes = map?.boxes ?? NO_BOXES;

  /** ids 가 꽉 차게. 큰 나라·대회 적은 먼 나라는 화면을 넓히지 않게 뺀다 */
  const fitIds = useCallback(
    (ids: string[], minW = MIN_FIT_W): Box | null => {
      const list = ids.filter((id) => boxes.has(id)).sort((a, b) => (counts[b] ?? 0) - (counts[a] ?? 0));
      const total = list.reduce((s, id) => s + (counts[id] ?? 0), 0) || 1;
      let acc: Box | null = null;
      for (const id of list) {
        const b = boxes.get(id)!;
        if (!acc) {
          acc = b;
          continue;
        }
        // 큰 나라는 지금 영역 둘레 25% 안쪽만 넣는다 (캐나다는 남쪽 도시 쪽만, 북극 쪽까지 넓히지 않게)
        const c = b.w > HUGE_W ? clip(b, grow(acc, 0.25)) : b;
        if (!c) continue;
        const next = union(acc, c);
        if ((counts[id] ?? 0) / total < MINOR_SHARE && area(next) > area(acc) * 1.25) continue;
        acc = next;
      }
      if (!acc) return null;
      let { x, y, w, h } = acc;
      if (w < minW) (x -= (minW - w) / 2), (w = minW);
      const minH = minW / 1.6;
      if (h < minH) (y -= (minH - h) / 2), (h = minH);
      const pad = Math.max(w, h) * 0.04 + 2;
      return { x: x - pad, y: y - pad, w: w + pad * 2, h: h + pad * 2 };
    },
    [boxes, counts],
  );

  /** 확대·이동 (clamp=false 는 애니메이션 중간 프레임: 배율 제한 없이 그대로 그림) */
  const apply = useCallback((v: Box, clamp = true) => {
    const base = baseRef.current;
    const bounds = boundsRef.current;
    if (!base || !bounds) return;
    let next = v;
    if (clamp) {
      const w = Math.min(Math.max(v.w, base.w / MAX_ZOOM), base.w);
      const h = (w * base.h) / base.w;
      // 확대 배율이 바뀌었으면 가운데를 기준으로 맞춘다 (밖으로 못 나가게 아래에서 다시 자름)
      let x = v.x + (v.w - w) / 2;
      let y = v.y + (v.h - h) / 2;
      x = w >= bounds.w ? bounds.x + (bounds.w - w) / 2 : Math.min(Math.max(x, bounds.x), bounds.x + bounds.w - w);
      y = h >= bounds.h ? bounds.y + (bounds.h - h) / 2 : Math.min(Math.max(y, bounds.y), bounds.y + bounds.h - h);
      next = { x, y, w, h };
    }
    view.current = next;
    svgRef.current?.setAttribute('viewBox', fmtBox(next));
    setZoom(Math.round((base.w / next.w) * 100) / 100);
    setPanned(Math.abs(next.x - base.x) > base.w * 0.005 || Math.abs(next.y - base.y) > base.h * 0.005);
  }, []);

  // 버튼·지역 전환 때만 짧게 움직임을 준다 (손가락·휠은 바로 따라가야 하므로 애니메이션 없음)
  const anim = useRef(0);
  const animateTo = useCallback(
    (target: Box, ms = 200) => {
      const from = view.current;
      cancelAnimationFrame(anim.current);
      if (!from || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply(target);
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min((t - t0) / ms, 1);
        const e = 1 - Math.pow(1 - p, 3);
        if (p < 1) {
          apply(
            {
              x: from.x + (target.x - from.x) * e,
              y: from.y + (target.y - from.y) * e,
              w: from.w + (target.w - from.w) * e,
              h: from.h + (target.h - from.h) * e,
            },
            false,
          );
          anim.current = requestAnimationFrame(step);
        } else apply(target);
      };
      anim.current = requestAnimationFrame(step);
    },
    [apply],
  );
  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // 맞춤 대상: 고른 나라·시·도 → 지역 나라들 → 지도 전체
  const picked = !!selected && boxes.has(selected);
  const target = picked ? [selected!] : focus;
  const targetKey = `${kind}|${target.join(',')}|${ratio}`;
  const lastKey = useRef('');
  useLayoutEffect(() => {
    if (!map || !ratio) return;
    const full = parseBox(map.viewBox);
    const minW = kind === 'kr' ? MIN_PROVINCE_W : picked && focus.length > 1 ? MIN_PICK_W : MIN_FIT_W;
    const b = toRatio(fitIds(target, minW) ?? full, ratio);
    const prev = lastKey.current;
    lastKey.current = targetKey;
    baseRef.current = b;
    const f = toRatio(full, ratio);
    const x1 = Math.min(f.x, b.x), y1 = Math.min(f.y, b.y);
    boundsRef.current = { x: x1, y: y1, w: Math.max(f.x + f.w, b.x + b.w) - x1, h: Math.max(f.y + f.h, b.y + b.h) - y1 };
    setBase(b);
    // 같은 지도에서 지역·나라만 바뀌었으면 부드럽게 옮겨 가고, 처음·크기 변경은 바로
    const sameMap = prev.split('|')[0] === kind && prev.split('|')[2] === String(ratio);
    if (sameMap && prev !== targetKey) animateTo(b, 320);
    else apply(b);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, targetKey]);

  /**
   * 화면 좌표 prev 아래에 있던 지도 지점이 cur 로 오도록, f 배 확대하면서 옮긴다.
   * 한 손가락 드래그는 f=1, 핀치는 손가락 사이 거리 비율, 휠은 커서 위치 기준.
   */
  const move = useCallback(
    (prev: Pt, cur: Pt, f: number) => {
      const svg = svgRef.current;
      const v = view.current;
      const base = baseRef.current;
      if (!svg || !v || !base) return;
      const r = svg.getBoundingClientRect();
      if (!r.width || !r.height) return;
      // viewBox 비율은 늘 같으므로 그려지는 영역의 위치(가로·세로 여백)는 확대해도 그대로
      const a = Math.min(r.width / v.w, r.height / v.h);
      const ox = r.left + (r.width - v.w * a) / 2;
      const oy = r.top + (r.height - v.h * a) / 2;
      const w = Math.min(Math.max(v.w / f, base.w / MAX_ZOOM), base.w);
      const a2 = (a * v.w) / w;
      const qx = v.x + (prev.x - ox) / a;
      const qy = v.y + (prev.y - oy) / a;
      const h = (w * v.h) / v.w;
      apply({ x: qx - (cur.x - ox) / a2, y: qy - (cur.y - oy) / a2, w, h });
    },
    [apply],
  );

  const zoomBy = (f: number) => {
    const v = view.current;
    const base = baseRef.current;
    if (!v || !base) return;
    const w = Math.min(Math.max(v.w / f, base.w / MAX_ZOOM), base.w);
    const h = (w * v.h) / v.w;
    animateTo({ x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h });
  };

  /* ── 포인터 (마우스·터치·펜 공통) ───────────────────────── */
  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef({ start: { x: 0, y: 0 }, dragging: false, suppressClick: false });

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnimationFrame(anim.current);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      gesture.current.start = { x: e.clientX, y: e.clientY };
      gesture.current.dragging = false;
    } else {
      // 두 번째 손가락이 닿으면 탭이 아니라 핀치
      gesture.current.dragging = true;
      for (const id of pointers.current.keys()) {
        try {
          e.currentTarget.setPointerCapture(id);
        } catch {
          /* 이미 떨어진 손가락 */
        }
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const ps = pointers.current;
    const old = ps.get(e.pointerId);
    if (!old) return;
    const cur = { x: e.clientX, y: e.clientY };
    const g = gesture.current;
    if (!g.dragging) {
      if (dist(cur, g.start) < TAP_SLOP) return;
      g.dragging = true;
      // 드래그로 확정된 뒤에만 잡는다 (먼저 잡으면 탭이 지역 path 대신 svg 로 가서 선택이 안 된다)
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* 포인터가 이미 끝났으면 무시 */
      }
    }
    if (ps.size >= 2) {
      const [ida, idb] = [...ps.keys()];
      const otherId = e.pointerId === ida ? idb : ida;
      const other = ps.get(otherId)!;
      const d0 = dist(old, other);
      const d1 = dist(cur, other);
      if (d0 > 0) move(mid(old, other), mid(cur, other), d1 / d0);
    } else {
      move(old, cur, 1);
    }
    ps.set(e.pointerId, cur);
  };

  const onPointerEnd = (e: React.PointerEvent<SVGSVGElement>) => {
    const ps = pointers.current;
    if (!ps.has(e.pointerId)) return;
    ps.delete(e.pointerId);
    if (ps.size === 0 && gesture.current.dragging) {
      // 드래그 직후 따라오는 click 은 지역 선택으로 치지 않는다
      gesture.current.suppressClick = true;
      setTimeout(() => (gesture.current.suppressClick = false), 0);
    }
  };

  /* ── 휠·트랙패드 (non-passive 라 직접 붙인다) ─────────────── */
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.deltaY) return;
      // 처음 화면에서 더 줄이려는 휠은 그대로 페이지 스크롤로 보낸다
      if (e.deltaY > 0 && zoomRef.current <= 1) return;
      e.preventDefault();
      cancelAnimationFrame(anim.current);
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      // 트랙패드 핀치(ctrlKey)는 값이 작게 와서 더 민감하게
      const f = Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.002));
      const p = { x: e.clientX, y: e.clientY };
      move(p, p, f);
    };
    // 맥 사파리 트랙패드 핀치는 휠 대신 gesture 이벤트로 온다 (터치 기기는 포인터로 처리하므로 제외)
    let lastScale = 1;
    const fine = matchMedia('(pointer: fine)').matches;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      lastScale = 1;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const ge = e as Event & { scale: number; clientX: number; clientY: number };
      const p = { x: ge.clientX, y: ge.clientY };
      move(p, p, ge.scale / lastScale);
      lastScale = ge.scale;
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    if (fine) {
      svg.addEventListener('gesturestart', onGestureStart);
      svg.addEventListener('gesturechange', onGestureChange);
    }
    return () => {
      svg.removeEventListener('wheel', onWheel);
      svg.removeEventListener('gesturestart', onGestureStart);
      svg.removeEventListener('gesturechange', onGestureChange);
    };
  }, [move, map]);

  // 세계 지도의 한국은 국내 대회 전체라 다른 나라보다 훨씬 많다 → 단계 기준에서 빼야 다른 나라 색이 다 연해지지 않는다
  const max = useMemo(
    () => Math.max(1, ...Object.entries(counts).filter(([id]) => kind === 'kr' || id !== 'kr').map(([, n]) => n)),
    [counts, kind],
  );

  // 부모가 그릴 때마다 새로 만드는 onSelect 를 path 묶음(Paths)에 그대로 넘기면 memo 가 깨진다 → 늘 같은 함수로 감싼다
  const onSelectRef = useRef(onSelect);
  useLayoutEffect(() => {
    onSelectRef.current = onSelect;
  });
  const select = useCallback((id: string) => onSelectRef.current(id), []);

  // CSS 로 크기를 정한다 (viewBox 와 상관없이 → 비율 측정과 되먹임 없음). PC 에서 더 크게
  const size =
    kind === 'kr'
      ? 'aspect-[524/631] max-h-[340px] sm:max-h-[520px]'
      : 'aspect-[5/4] max-h-[420px] sm:aspect-auto sm:h-[min(62vh,560px)] sm:max-h-none';

  if (!map) {
    return <div className={`w-full animate-pulse rounded-box bg-sunken ${size}`} />;
  }

  const sel = kind === 'world' && selected ? boxes.get(selected) : undefined;
  const ring =
    sel && base && Math.max(sel.w, sel.h) < base.w * 0.03
      ? { x: sel.x + sel.w / 2, y: sel.y + sel.h / 2, r: Math.max(base.w * 0.035, Math.max(sel.w, sel.h)) }
      : null;

  const tip = hover ?? selected;
  const zoomed = zoom > 1.001;
  const moved = zoomed || panned;
  const ctl =
    'grid size-11 place-items-center bg-surface text-ink transition hover:bg-sunken active:bg-line disabled:text-ink-3 disabled:hover:bg-surface sm:size-8';

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={view.current ? fmtBox(view.current) : map.viewBox}
        className={`block w-full select-none ${size} ${zoomed ? 'cursor-grab active:cursor-grabbing' : ''}`}
        // 처음 화면에서는 한 손가락 세로 스와이프를 페이지 스크롤로 넘기고, 확대한 뒤에는 지도를 옮긴다
        style={{ touchAction: zoomed ? 'none' : 'pan-y', WebkitTapHighlightColor: 'transparent' }}
        role="group"
        aria-label={kind === 'kr' ? '시·도별 대회 지도' : '나라별 대회 지도'}
        onMouseLeave={() => setHover(null)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(e) => {
          if (gesture.current.suppressClick) {
            e.stopPropagation();
            e.preventDefault();
          }
        }}
      >
        <Paths
          map={map}
          kind={kind}
          counts={counts}
          names={names}
          max={max}
          selected={selected}
          focus={focus}
          onSelect={select}
          onHover={setHover}
        />

        {ring && (
          // 화면에서 몇 px 밖에 안 되는 나라(싱가포르 등)를 골랐을 때 위치를 알려 주는 고리
          <circle
            cx={ring.x}
            cy={ring.y}
            r={ring.r}
            fill="none"
            stroke={MAP_SELECTED}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        )}
      </svg>
      <div className="pointer-events-none absolute top-2 left-2 flex flex-col items-start gap-1.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="pointer-events-auto inline-flex h-11 items-center gap-1.5 rounded-ctl border border-line bg-surface px-3 text-[14px] font-semibold text-ink shadow-[0_1px_2px_var(--shadow)] transition hover:bg-sunken active:translate-y-px sm:h-8"
          >
            <ArrowLeft size={14} weight="bold" />
            전체 지도
          </button>
        )}
        {tip && counts[tip] ? (
          <div className="rounded-ctl bg-surface px-2.5 py-1.5 text-[14px] shadow-[0_1px_3px_var(--shadow-strong)]">
            <span className="font-semibold">{names[tip] ?? tip}</span>
            <span className="num ml-1.5 text-[16px] font-semibold">{counts[tip]}</span>
            <span className="text-ink-3">개</span>
          </div>
        ) : null}
      </div>
      {/* 국내 지도는 왼쪽 아래가 제주라 가리지 않게 오른쪽 아래(남해 바다) */}
      <div className={`absolute bottom-2 ${kind === 'kr' ? 'right-2' : 'left-2'}`}>
        <MapLegend max={max} />
      </div>
      <div className="absolute top-2 right-2 flex flex-col divide-y divide-line overflow-hidden rounded-ctl border border-line shadow-[0_1px_2px_var(--shadow)]">
        <button type="button" className={ctl} onClick={() => zoomBy(1.6)} disabled={zoom >= MAX_ZOOM} aria-label="지도 확대">
          <Plus size={16} weight="bold" />
        </button>
        <button type="button" className={ctl} onClick={() => zoomBy(1 / 1.6)} disabled={!zoomed} aria-label="지도 축소">
          <Minus size={16} weight="bold" />
        </button>
        <button type="button" className={ctl} onClick={() => base && animateTo(base)} disabled={!moved} aria-label="지도 처음 화면으로">
          <ArrowsIn size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}

/**
 * 나라·시·도 path 묶음. 색·선택·지역(focus)이 바뀔 때만 다시 그린다
 * (확대·이동·hover 말풍선으로 MapView 가 다시 그려질 때는 path 256개를 건드리지 않는다).
 */
const Paths = memo(function Paths({
  map,
  kind,
  counts,
  names,
  max,
  selected,
  focus,
  onSelect,
  onHover,
}: {
  map: MapData;
  kind: Kind;
  counts: Record<string, number>;
  names: Record<string, string>;
  max: number;
  selected: string | null;
  focus: string[];
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const inFocus = (id: string) => !focus.length || focus.includes(id);
  const fill = (id: string) => {
    if (id === selected) return MAP_SELECTED;
    // 세계 지도의 한국은 max 보다 크므로 가장 진한 단계
    return mapFill(mapStep(counts[id] ?? 0, max));
  };
  return map.locations.map(({ id, d }) => {
    const n = counts[id] ?? 0;
    // 지역 확대 중 밖의 나라도 누를 수 있게 두고(그 지역으로 옮겨 감) 색만 흐리게
    const dim = n > 0 && !inFocus(id) && id !== selected;
    return (
      <path
        key={id}
        d={d}
        fill={fill(id)}
        fillOpacity={dim ? 0.45 : undefined}
        stroke="var(--bg)"
        strokeWidth={kind === 'kr' ? 1.2 : 0.4}
        vectorEffect="non-scaling-stroke"
        className={n ? 'cursor-pointer transition-[fill,fill-opacity] duration-150 hover:brightness-95 focus:outline-none' : ''}
        {...(n
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': `${names[id] ?? id} 대회 ${n}개`,
              'aria-pressed': id === selected,
              onClick: () => onSelect(id),
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(id);
                }
              },
              onMouseEnter: () => onHover(id),
              onFocus: () => onHover(id),
            }
          : { 'aria-hidden': true })}
      />
    );
  });
});
