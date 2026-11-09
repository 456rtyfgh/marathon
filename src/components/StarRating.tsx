import { Star } from '@phosphor-icons/react';
import { useLang } from '../i18n';

interface Props {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  label?: string;
}

export default function StarRating({ value, onChange, size = 18, label }: Props) {
  const { t } = useLang();
  const editable = Boolean(onChange);
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-20 shrink-0 text-[13px] text-ink-2">{label}</span>}
      <div className={`flex ${editable ? '' : 'gap-1'}`} role={editable ? 'radiogroup' : 'img'} aria-label={editable ? label ?? t('star.aria') : t('star.value', { v: value.toFixed(1) })}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n <= rounded;
          const icon = <Star size={size} weight={on ? 'fill' : 'regular'} className={on ? 'text-ink' : 'text-line'} />;
          if (!editable) return <span key={n}>{icon}</span>;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === rounded}
              aria-label={t('star.n', { n })}
              onClick={() => onChange!(n)}
              className="grid h-11 min-w-8 place-items-center rounded-tag transition hover:scale-110 active:scale-95 sm:h-10"
            >
              {icon}
            </button>
          );
        })}
      </div>
      {editable && value > 0 && <span className="num text-[15px] font-semibold whitespace-nowrap text-ink-2">{t('star.n', { n: value })}</span>}
    </div>
  );
}
