import { MAP_SELECTED, mapFill, mapLegend } from '../lib/mapColor';

/** 지도 범례 '적음 ■■■■■ 많음 · ■ 선택'. 위치(absolute 등)는 감싸는 쪽에서 정한다 */
export default function MapLegend({ max, selected = true }: { max: number; selected?: boolean }) {
  const bands = mapLegend(max);
  const range = (from: number, to: number) => (from === to ? `${from}개` : `${from}~${to}개`);
  const label = `대회 수: ${bands.map((b) => range(b.from, b.to)).join(', ')} 순으로 진해짐`;
  return (
    <div
      role="img"
      aria-label={label}
      className="pointer-events-none inline-flex items-center gap-1.5 rounded-ctl bg-surface/90 px-2 py-1 text-[12px] leading-none text-ink-2 shadow-[0_1px_2px_var(--shadow)]"
    >
      <span>적음</span>
      <span className="flex gap-px" aria-hidden>
        {bands.map((b) => (
          <span key={b.step} className="h-2.5 w-3.5 first:rounded-l-tag last:rounded-r-tag" style={{ background: mapFill(b.step) }} />
        ))}
      </span>
      <span>많음</span>
      {selected && (
        <>
          <span className="mx-0.5 h-3 w-px bg-line" aria-hidden />
          <span className="size-2.5 rounded-tag" style={{ background: MAP_SELECTED }} aria-hidden />
          <span>선택</span>
        </>
      )}
    </div>
  );
}
