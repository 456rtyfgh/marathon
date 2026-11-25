import { Check } from '@phosphor-icons/react';
import type { RegionHit } from '../lib/regions';
import { useLang } from '../i18n';

/**
 * 검색어가 지역 이름일 때 결과 위에 나오는 두 줄.
 * 1) '<지역> 지역 대회 N개' 묶음 칩 — 누르면 그 지역 대회만 (다시 누르면 풀림)
 * 2) 시·도 묶음이면 그 아래 시·군·구 칩(많은 순, 대회 수 포함) — 누르면 그 구·시·군만, '전체' 로 시·도 전체로 돌아간다
 * 칩 모양은 RelatedChips 와 같고, 켜진 칩은 검정 꽉 채움이 아니라 테두리 + 체크.
 */
export type GuChip = { gu: string; label: string; count: number };

const chipBase =
  'inline-flex h-11 items-center gap-1 rounded-ctl px-3 text-[15px] font-semibold whitespace-nowrap transition-colors active:translate-y-px sm:h-10';
const OFF = 'border border-line bg-surface text-ink-2 hover:bg-sunken hover:text-ink';
const ON = 'border border-ink bg-surface text-ink';
const row =
  '-mx-4 flex min-h-11 items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0 [&>*]:shrink-0';

export default function RegionResults({
  hits,
  pick,
  onPick,
  guChips,
  guPick,
  onGuPick,
}: {
  hits: RegionHit[];
  pick: string | null;
  onPick: (key: string | null) => void;
  /** 시·도 묶음에 딸린 시·군·구 칩 (없으면 빈 목록) */
  guChips: GuChip[];
  guPick: string | null;
  onGuPick: (gu: string | null) => void;
}) {
  const { t } = useLang();
  if (!hits.length) return null;
  return (
    <div className="px-4 pt-4">
      <nav aria-label={t('region.label')}>
        <div className={row}>
          {hits.map((h) => {
            const on = pick === h.key;
            return (
              <button
                key={h.key}
                type="button"
                aria-pressed={on}
                onClick={() => onPick(on ? null : h.key)}
                className={`${chipBase} ${on ? ON : OFF}`}
              >
                {on && <Check size={14} weight="bold" aria-hidden />}
                {t(h.races.length === 1 ? 'region.count1' : 'region.count', { label: h.label, n: h.races.length })}
              </button>
            );
          })}
        </div>
      </nav>
      {guChips.length > 0 && (
        <nav aria-label={t('region.guLabel')} className="pt-2">
          <div className={row}>
            <button type="button" aria-pressed={guPick === null} onClick={() => onGuPick(null)} className={`${chipBase} ${guPick === null ? ON : OFF}`}>
              {guPick === null && <Check size={14} weight="bold" aria-hidden />}
              {t('region.all')}
            </button>
            {guChips.map((c) => {
              const on = guPick === c.gu;
              return (
                <button key={c.gu} type="button" aria-pressed={on} onClick={() => onGuPick(on ? null : c.gu)} className={`${chipBase} ${on ? ON : OFF}`}>
                  {on && <Check size={14} weight="bold" aria-hidden />}
                  {c.label}
                  <span className="num text-ink-3">{c.count}</span>
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
