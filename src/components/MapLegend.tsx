import { MAP_SELECTED, mapFill, mapLegend } from '../lib/mapColor';
import { useLang } from '../i18n';

/** 지도 범례 '적음 ■■■■■ 많음 · ■ 선택'. 위치(absolute 등)는 감싸는 쪽에서 정한다 */
export default function MapLegend({ max, selected = true }: { max: number; selected?: boolean }) {
  const { t } = useLang();
  const bands = mapLegend(max);
  const range = (from: number, to: number) => (from === to ? t('legend.one', { a: from }) : t('legend.range', { a: from, b: to }));
  const label = t('legend.aria', { ranges: bands.map((b) => range(b.from, b.to)).join(t('legend.sep')) });
  return (
    <div
      role="img"
      aria-label={label}
      className="pointer-events-none inline-flex items-center gap-2 rounded-ctl bg-surface/90 px-2 py-1 text-[13px] leading-none text-ink-2 sm:text-[12px] shadow-[0_1px_2px_var(--shadow)]"
    >
      <span>{t('legend.less')}</span>
      <span className="flex gap-px" aria-hidden>
        {bands.map((b) => (
          <span key={b.step} className="h-2.5 w-3.5 first:rounded-l-tag last:rounded-r-tag" style={{ background: mapFill(b.step) }} />
        ))}
      </span>
      <span>{t('legend.more')}</span>
      {selected && (
        <>
          <span className="h-3 w-px bg-line" aria-hidden />
          <span className="size-2.5 rounded-tag" style={{ background: MAP_SELECTED }} aria-hidden />
          <span>{t('legend.selected')}</span>
        </>
      )}
    </div>
  );
}
