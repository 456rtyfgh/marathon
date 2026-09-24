import { Star } from '@phosphor-icons/react';

interface Props {
  value: number;
  onChange?: (v: number) => void;
  size?: number;
  label?: string;
}

export default function StarRating({ value, onChange, size = 18, label }: Props) {
  const editable = Boolean(onChange);
  const rounded = Math.round(value);
  return (
    <div className="flex items-center gap-3">
      {label && <span className="w-16 shrink-0 text-[14px] text-ink-2">{label}</span>}
      <div className="flex gap-0.5" role={editable ? 'radiogroup' : 'img'} aria-label={editable ? label ?? '별점' : `별점 ${value.toFixed(1)}점`}>
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
              aria-label={`${n}점`}
              onClick={() => onChange!(n)}
              className="rounded-tag p-0.5 transition hover:scale-110 active:scale-95"
            >
              {icon}
            </button>
          );
        })}
      </div>
      {editable && value > 0 && <span className="num text-[16px] font-semibold text-ink-2">{value}점</span>}
    </div>
  );
}
