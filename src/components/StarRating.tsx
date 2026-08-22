interface Props {
  value: number;
  onChange?: (v: number) => void;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

const SIZE = { sm: 'text-sm', md: 'text-lg', lg: 'text-2xl' };

export default function StarRating({ value, onChange, size = 'md', label }: Props) {
  const editable = Boolean(onChange);
  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-14 shrink-0 text-xs text-zinc-500">{label}</span>}
      <div className={`flex ${SIZE[size]} leading-none`} role={editable ? 'radiogroup' : undefined}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = n <= Math.round(value);
          const cls = on ? 'text-amber-400' : 'text-zinc-700';
          if (!editable) {
            return (
              <span key={n} className={cls} aria-hidden>
                ★
              </span>
            );
          }
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === Math.round(value)}
              aria-label={`${n}점`}
              onClick={() => onChange!(n)}
              className={`${cls} transition hover:scale-110 hover:text-amber-300`}
            >
              ★
            </button>
          );
        })}
      </div>
      {value > 0 && (
        <span className="text-xs tabular-nums text-zinc-400">{value.toFixed(1).replace('.0', '')}</span>
      )}
    </div>
  );
}
