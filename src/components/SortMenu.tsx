import { useEffect, useId, useRef, useState } from 'react';
import { Check, SortAscending } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import type { ListSort } from '../lib/listPrefs';

const ORDER: ListSort[] = ['entry', 'race_date', 'views', 'saves', 'size', 'flight'];

/** 유튜브 스튜디오식 정렬: 버튼에는 '정렬 기준'만, 누르면 기준 목록(고른 것 체크) */
export default function SortMenu({ value, onChange }: { value: ListSort; onChange: (v: ListSort) => void }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        ref={btn}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        className="inline-flex h-11 items-center gap-2 rounded-ctl border border-line bg-surface px-3 text-[15px] font-semibold whitespace-nowrap hover:border-ink sm:h-10"
      >
        <SortAscending size={18} weight="bold" />
        {t('sort.by')}
      </button>
      {open && (
        <>
        {/* 휴대폰: 화면 아래에서 올라오는 시트(부모 칸에 잘리지 않게 fixed), 넓은 화면: 버튼 아래 펼침 */}
        <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" aria-hidden="true" onClick={() => setOpen(false)} />
        <div
          id={id}
          role="menu"
          className="fixed inset-x-0 bottom-0 z-50 overflow-hidden rounded-t-2xl border-t border-line bg-surface py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:mt-2 sm:min-w-[11rem] sm:rounded-box sm:border sm:py-1 sm:pb-1 sm:shadow-lg"
        >
          <p className="px-4 pt-1 pb-2 text-[13px] font-semibold text-ink-3 sm:hidden">{t('sort.by')}</p>
          {ORDER.map((k) => {
            const on = k === value;
            return (
              <button
                key={k}
                type="button"
                role="menuitemradio"
                aria-checked={on}
                onClick={() => {
                  onChange(k);
                  setOpen(false);
                }}
                className={`flex min-h-12 w-full sm:min-h-11 items-center gap-3 px-4 text-left text-[15px] hover:bg-sunken ${on ? 'font-bold' : ''}`}
              >
                <span className="inline-flex w-4 justify-center">{on && <Check size={16} weight="bold" />}</span>
                {t(`sort.${k}`)}
              </button>
            );
          })}
        </div>
        </>
      )}
    </div>
  );
}
