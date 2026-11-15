import type { ReactNode } from 'react';
import type { Race } from '../lib/types';
import { pickHidden, type Hidden } from '../lib/outsideFilter';
import { useLang } from '../i18n';
import { fmtCount } from '../i18n/format';

/**
 * 필터 때문에 안 보이는 대회 안내 (검색어는 그대로).
 *  - empty: 현재 필터에서 결과 0개 — 빈 결과 화면을 대신한다 (제목·버튼·대회 최대 5개)
 *  - few: 결과가 몇 개 안 될 때 목록 아래 한 줄 + 대회 최대 5개
 * 버튼은 '필터만 풀기' (검색어는 두고). 필터를 풀어도 나오지 않는 이미 끝난 대회만 있으면 버튼 없이 알리기만 한다.
 */
export default function SearchAssist({
  variant,
  query,
  hidden,
  onClear,
  renderRow,
}: {
  variant: 'empty' | 'few';
  query: string;
  hidden: Hidden;
  onClear: () => void;
  renderRow: (r: Race) => ReactNode;
}) {
  const { lang, t } = useLang();
  const canClear = hidden.upcoming.length > 0;
  const shownRaces = pickHidden(hidden);
  const rest = hidden.total - shownRaces.length;
  const n = fmtCount(hidden.total, lang);
  const title = canClear ? t('search.hiddenTitle', { n }) : t('search.pastOnlyTitle', { q: query, n });
  const clearBtn = canClear ? (
    <button
      type="button"
      onClick={onClear}
      className={
        variant === 'empty'
          ? 'inline-flex h-11 items-center rounded-ctl bg-ink px-4 text-[15px] font-semibold whitespace-nowrap text-bg hover:opacity-85 sm:h-10'
          : 'inline-flex h-11 shrink-0 items-center rounded-ctl bg-sunken px-4 text-[15px] font-semibold whitespace-nowrap hover:bg-line sm:h-10'
      }
    >
      {t('search.clearKeep')}
    </button>
  ) : null;
  const list = (
    <>
      <ul className="-mx-4 divide-y divide-line border-t border-line">{shownRaces.map(renderRow)}</ul>
      {rest > 0 && <p className="pt-3 text-[14px] text-ink-3">{t('search.hiddenMore', { n: fmtCount(rest, lang) })}</p>}
    </>
  );
  const sub = [canClear ? t(variant === 'few' ? 'search.hiddenHelpFew' : 'search.hiddenHelp') : t('search.pastOnlyHelp'), canClear && hidden.past.length > 0 ? t('search.hiddenPast', { n: fmtCount(hidden.past.length, lang) }) : '']
    .filter(Boolean)
    .join(' ');

  if (variant === 'empty')
    return (
      <div className="px-4 pt-14 pb-4">
        <div className="text-center">
          <p className="text-[17px] font-semibold break-keep text-balance">{title}</p>
          <p className="mx-auto mt-2 max-w-[38ch] text-[15px] break-keep text-balance text-ink-2">{sub}</p>
          {clearBtn && <div className="mt-5 flex justify-center">{clearBtn}</div>}
        </div>
        <div className="mt-10 text-left">
          <h2 className="pb-2 text-[17px] font-bold tracking-tight">{t(canClear ? 'search.hiddenList' : 'search.pastList')}</h2>
          {list}
        </div>
      </div>
    );

  return (
    <div className="px-4 pt-10">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pb-3">
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold tracking-tight break-keep">{title}</h2>
          <p className="mt-0.5 text-[14px] break-keep text-ink-2">{sub}</p>
        </div>
        {clearBtn}
      </div>
      {list}
    </div>
  );
}
