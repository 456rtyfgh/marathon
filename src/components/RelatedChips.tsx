import type { Chip } from '../lib/relatedSearches';
import { useLang } from '../i18n';

/**
 * 검색창 아래 칩 줄. 검색어가 있으면 '관련 검색어', 비면 '많이 찾는 검색어'.
 * 누르면 그 말로 검색어가 바뀐다 (켜짐 상태가 없는 동작 칩 — aria-pressed 없음).
 * 모양은 필터 칩과 같다 (밝은 바탕·같은 높이). 좁은 화면은 한 줄 가로 스크롤.
 */
export default function RelatedChips({ chips, popular, onPick }: { chips: Chip[]; popular: boolean; onPick: (term: string) => void }) {
  const { t } = useLang();
  if (!chips.length) return null;
  return (
    <nav aria-label={t(popular ? 'search.popular' : 'search.related')} className="mx-auto max-w-6xl px-4 pt-4 sm:px-6">
      <div className="-mx-4 flex min-h-11 items-center gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:py-0 [&>*]:shrink-0">
        <span className="pr-1 text-[13px] font-semibold whitespace-nowrap text-ink-3">{t(popular ? 'search.popular' : 'search.related')}</span>
        {chips.map((c) => (
          <button
            key={c.term}
            type="button"
            onClick={() => onPick(c.term)}
            className="inline-flex h-11 items-center rounded-ctl border border-line bg-surface px-3 text-[15px] font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-sunken hover:text-ink active:translate-y-px sm:h-10"
          >
            {c.term}
          </button>
        ))}
      </div>
    </nav>
  );
}
