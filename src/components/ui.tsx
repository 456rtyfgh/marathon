import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react';
import { X } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import { fmtCount } from '../i18n/format';

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
    if (open && !d.open) {
      d.showModal();
      d.focus({ preventScroll: true }); // 첫 버튼에 포커스 링이 잡히지 않게 패널 자체에 둔다
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={variant}
      aria-label={label}
      tabIndex={-1}
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

export function CloseButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t } = useLang();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label ?? t('common.close')}
      className="grid size-11 shrink-0 sm:size-9 place-items-center rounded-ctl text-ink-3 transition hover:bg-sunken hover:text-ink active:scale-95"
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
    sm: 'h-11 px-3 text-[15px] sm:h-9',
    md: 'h-11 px-4 text-[15px] sm:h-10',
  };
  return (
    <button
      {...rest}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-ctl font-semibold transition active:translate-y-px disabled:pointer-events-none disabled:opacity-40 ${tones[tone]} ${sizes[size]} ${className}`}
    />
  );
}

/** 목록 '더 보기 (N개 남음)'. 대회 목록 묶음·지난 대회가 같이 쓴다 */
export function MoreButton({ left, onClick, className = '' }: { left: number; onClick: () => void; className?: string }) {
  const { lang, t } = useLang();
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-ctl bg-sunken px-4 text-[15px] font-semibold whitespace-nowrap transition hover:bg-line active:translate-y-px sm:h-10 ${className}`}
    >
      {t('more.label')} <span className="font-normal text-ink-2">(<span className="num">{fmtCount(left, lang)}</span>{t('more.leftPost')})</span>
    </button>
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
    <label className={`flex flex-col gap-2 ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-[13px] font-semibold text-ink-2">
        {label}
        {hint && <span className="ml-2 font-normal text-ink-3">{hint}</span>}
      </span>
      {children}
      {error && <span className="text-[13px] text-ink">{error}</span>}
    </label>
  );
}

export const inputCls =
  // 높이는 min-h 로: textarea 가 h-auto 를 덧붙여 쓰므로 고정 높이를 두지 않는다. 휴대폰 16px = iOS 확대 방지
  'min-h-11 w-full rounded-ctl border border-line bg-surface px-3 text-[16px] text-ink outline-none transition placeholder:text-ink-3 focus:border-ink disabled:opacity-50 sm:min-h-10 sm:text-[15px]';

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
    <div role="tablist" className="flex gap-4 overflow-x-auto border-b border-line px-5 sm:gap-5 sm:px-7">
      {items.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={`-mb-px h-12 shrink-0 border-b-2 text-[15px] font-semibold whitespace-nowrap transition ${
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
  return <p className={`rounded-ctl px-3 py-3 text-[15px] leading-relaxed ${cls}`}>{children}</p>;
}
