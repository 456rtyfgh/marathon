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
    <div ref={box} className="relative">
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
        <div
          id={id}
          role="menu"
          className="absolute right-0 z-30 mt-2 min-w-[11rem] overflow-hidden rounded-box border border-line bg-surface py-1 shadow-lg"
        >
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
                className={`flex min-h-11 w-full items-center gap-3 px-4 text-left text-[15px] hover:bg-sunken ${on ? 'font-bold' : ''}`}
              >
                <span className="inline-flex w-4 justify-center">{on && <Check size={16} weight="bold" />}</span>
                {t(`sort.${k}`)}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
