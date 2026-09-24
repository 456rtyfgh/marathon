import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react';
import { X } from '@phosphor-icons/react';

/* ── 오른쪽에서 열리는 패널 (native <dialog>) ─────────────────── */

export function Panel({
  open,
  onClose,
  label,
  children,
  variant = 'panel',
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  children: ReactNode;
  variant?: 'panel' | 'sheet';
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={variant}
      aria-label={label}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // 배경(::backdrop) 클릭 시 닫기
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && children}
    </dialog>
  );
}

export function CloseButton({ onClick, label = '닫기' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-9 shrink-0 place-items-center rounded-ctl text-ink-3 transition hover:bg-sunken hover:text-ink active:scale-95"
    >
      <X size={18} weight="bold" />
    </button>
  );
}

/* ── 버튼 ─────────────────────────────────────────────────────── */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: 'primary' | 'accent' | 'quiet' | 'danger';
  size?: 'sm' | 'md';
};

export function Button({ tone = 'primary', size = 'md', className = '', ...rest }: BtnProps) {
  const tones = {
    primary: 'bg-ink text-bg hover:opacity-85',
    accent: 'bg-accent text-on-accent hover:brightness-95',
    quiet: 'bg-sunken text-ink hover:bg-line',
    danger: 'bg-sunken text-ink hover:bg-line underline decoration-ink-3 underline-offset-4',
  };
  const sizes = {
    sm: 'h-8 px-3 text-[13px]',
    md: 'h-10 px-4 text-sm',
  };
  return (
    <button
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-ctl font-semibold transition active:translate-y-px disabled:pointer-events-none disabled:opacity-40 ${tones[tone]} ${sizes[size]} ${className}`}
    />
  );
}

/* ── 입력 ─────────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  error,
  children,
  wide,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-[13px] font-semibold text-ink-2">
        {label}
        {hint && <span className="ml-1.5 font-normal text-ink-3">{hint}</span>}
      </span>
      {children}
      {error && <span className="text-[13px] text-ink">{error}</span>}
    </label>
  );
}

export const inputCls =
  'h-10 w-full rounded-ctl border border-line bg-surface px-3 text-[15px] text-ink outline-none transition placeholder:text-ink-3 focus:border-ink disabled:opacity-50';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />;
}

/* ── 탭 ───────────────────────────────────────────────────────── */

export function Tabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (v: T) => void;
  items: [T, ReactNode][];
}) {
  return (
    <div role="tablist" className="flex gap-5 overflow-x-auto border-b border-line px-5 sm:px-7">
      {items.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`-mb-px shrink-0 border-b-2 py-3 text-[15px] font-semibold transition ${
            value === id ? 'border-ink text-ink' : 'border-transparent text-ink-3 hover:text-ink-2'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ── 알림 문구 ────────────────────────────────────────────────── */

export function Note({ tone = 'info', children }: { tone?: 'info' | 'ok' | 'error'; children: ReactNode }) {
  const cls = {
    info: 'bg-sunken text-ink-2',
    ok: 'bg-accent text-on-accent',
    error: 'bg-sunken text-ink border-l-2 border-ink',
  }[tone];
  return <p className={`rounded-ctl px-3 py-2.5 text-sm leading-relaxed ${cls}`}>{children}</p>;
}
