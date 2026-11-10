import { useEffect, useRef, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes } from 'react';
import { X } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import { fmtCount } from '../i18n/format';

/* ── 패널과 뒤로 가기 ───────────────────────────────────────────
 * 열린 패널 한 겹마다 히스토리 한 칸. 그 칸의 history.state.panelDepth = 그 칸에서 열려 있어야 하는 패널 수(없으면 0).
 *  - 뒤로 가기(popstate): 지금 칸의 깊이보다 위에 있는 패널을 닫는다.
 *  - 닫기 버튼·밖 누르기·ESC·제출 완료로 닫히면: 남는 칸을 도로 뺀다(history.go). 뺀 뒤 주소가 앱이 정해 둔 주소와 다르면 맞춘다
 *    (/r/<id> 로 바로 들어와 X 를 누른 경우 — 빠진 자리의 주소가 /r/<id> 라서).
 * 패널마다 따로 넣고 빼지 않고 한 곳(sync)에서 '열린 패널 수'와 panelDepth 를 맞춘다. 맞추기는 한 박자 뒤(setTimeout 0)라
 *  - StrictMode 의 효과 두 번 실행, 한 패널이 닫히며 다른 패널이 열리는 순간(수가 그대로)에는 히스토리를 건드리지 않고,
 *  - 닫을 때 App 의 주소 맞춤 효과(부모라 Panel 효과보다 늦게 돈다)가 끝난 주소를 읽는다.
 * 러닝톡은 App 의 openTalk 이 주소 칸(/community)을 panelDepth 와 함께 직접 넣는다 — 깊이가 이미 맞아 여기서 더 넣지 않는다.
 * history.state 를 지우는 코드가 있어도(깊이 0 으로 보임) 깨지지는 않는다: 뒤로 가기에 패널이 닫히는 쪽으로 간다.
 * 뒤로 가기로 닫는 것은 '자기 칸이 잡힌(anchored)' 패널뿐이다. 휴대폰 메뉴는 자기 칸이 빠지는 popstate 안에서 항목의 동작(패널 열기)을
 * 부르고 React 가 그 자리에서 패널을 그린다 — 그 같은 popstate 를 방금 열린 패널의 '뒤로 가기'로 읽으면 열리자마자 닫힌다.
 */
type Layer = { close: () => void; anchored: boolean };
const layers: Layer[] = [];
let syncTimer: ReturnType<typeof setTimeout> | undefined;
let popTimer: ReturnType<typeof setTimeout> | undefined;
/** 우리가 부른 history.go() 의 popstate 를 기다리는 중 */
let awaitingPop = false;
/** 칸을 뺀 뒤 맞출 주소 (닫을 때 앱이 정해 둔 주소) */
let urlAfterPop: string | null = null;
/** 패널이 (뒤로 가기가 아닌 이유로도) 닫혔다 — 다음 맞춤 때 그 시점의 주소를 '앱이 정해 둔 주소'로 적어 둔다 */
let closedSinceSync = false;
/** 한 번의 닫힘에서 칸을 빼는 횟수 한도 (히스토리가 예상과 달라도 끝없이 뒤로 가지 않게) */
let popBudget = 0;

const panelDepth = () => (history.state as { panelDepth?: number } | null)?.panelDepth ?? 0;
const here = () => location.pathname + location.search + location.hash;

function syncHistory() {
  if (awaitingPop) return; // 우리 popstate 가 온 뒤(afterOwnPop)에 다시 맞춘다
  const want = layers.length;
  const have = panelDepth();
  if (want > have) {
    urlAfterPop = null;
    for (let d = have + 1; d <= want; d++) history.pushState({ ...(history.state ?? {}), panelDepth: d }, '');
  } else if (want < have && popBudget > 0) {
    popBudget--;
    awaitingPop = true;
    history.go(want - have);
    // popstate 가 안 오면(막힌 경우) 그냥 넘어간다
    popTimer = setTimeout(afterOwnPop, 400);
  } else {
    settleUrl();
  }
  // 지금 칸의 깊이 안에 든 패널은 자기 칸이 있다 — 이제부터 뒤로 가기로 닫을 수 있다
  const depth = panelDepth();
  layers.forEach((l, i) => {
    if (i < depth) l.anchored = true;
  });
}

function settleUrl() {
  // 칸을 뺀 자리의 주소가 앱이 정해 둔 주소와 다르면 맞춘다
  if (urlAfterPop != null && here() !== urlAfterPop) history.replaceState(history.state, '', urlAfterPop);
  urlAfterPop = null;
}

function afterOwnPop() {
  clearTimeout(popTimer);
  awaitingPop = false;
  syncHistory(); // 아직 남은 칸이 있으면(러닝톡에서 글을 연 채 닫음) 더 빼고, 그 사이 열린 패널이 있으면 넣는다
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    popBudget = 6;
    // 패널이 닫힌 뒤의 맞춤: 이 시점의 주소가 앱이 정해 둔 주소다(App 의 주소 맞춤 효과가 이미 돌았다).
    // 뒤로·앞으로 가기만 있었던 맞춤(닫힌 패널 없음)에서는 적지 않는다 — 앞으로 가기로 온 칸의 옛 주소를 되살리지 않게
    if (!awaitingPop) urlAfterPop = closedSinceSync ? here() : null;
    closedSinceSync = false;
    syncHistory();
  }, 0);
}

function onPopState() {
  if (awaitingPop) return afterOwnPop(); // 우리가 뺀 칸
  // 사용자가 뒤로(또는 앞으로) 갔다: 그 칸의 깊이보다 위에 있는 패널을 위에서부터 닫는다
  const have = panelDepth();
  for (let i = layers.length - 1; i >= have; i--) if (layers[i]?.anchored) layers[i].close();
  // 닫히지 않은 패널이 남았거나(다시 칸을 넣는다) 앞으로 가기로 패널 없는 칸에 왔으면(그 칸을 뺀다) 다음 박자에 맞춘다
  scheduleSync();
}

// 모듈을 읽을 때 등록한다(앱이 그려지기 전) — 같은 popstate 를 듣는 화면 코드(휴대폰 메뉴·러닝톡)보다 먼저 돌게
if (typeof window !== 'undefined') window.addEventListener('popstate', onPopState, true);

function addLayer(layer: Layer) {
  layers.push(layer);
  scheduleSync();
}

function removeLayer(layer: Layer) {
  const i = layers.indexOf(layer);
  if (i >= 0) layers.splice(i, 1);
  closedSinceSync = true;
  scheduleSync();
}

/* ── 패널 (native <dialog>): 640px 부터 오른쪽에서, 휴대폰은 아래에서 올라온다 (index.css) ── */

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
  // 뒤로 가기로 닫을 때 부를 최신 onClose (효과를 onClose 가 바뀔 때마다 다시 돌리지 않게)
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      d.focus({ preventScroll: true }); // 첫 버튼에 포커스 링이 잡히지 않게 패널 자체에 둔다
    }
    if (!open && d.open) d.close();
  }, [open]);

  // 열려 있는 동안 히스토리 한 칸을 차지한다 (위 '패널과 뒤로 가기')
  useEffect(() => {
    if (!open) return;
    const layer: Layer = { close: () => closeRef.current(), anchored: false };
    addLayer(layer);
    return () => removeLayer(layer);
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={variant}
      aria-label={label}
      tabIndex={-1}
      // React 는 close·cancel 을 컴포넌트 트리로 올려 보낸다 — 창 안에 연 창(내 정보 > 지난 대회 등록)을 닫을 때 바깥 창까지 닫히지 않게 막는다
      onClose={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onCancel={(e) => {
        e.preventDefault();
        e.stopPropagation();
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
  const listRef = useRef<HTMLDivElement>(null);
  // 고른 탭이 가로로 잘려 있거나 줄 밖에 있으면 보이게 줄을 민다. 탭을 직접 누를 때뿐 아니라 다른 버튼이 탭을 바꿀 때도
  // (대회 상세 아래 고정 줄의 '알림' — 영어 360px 에서는 Alerts 탭이 줄 밖이라 고른 탭이 하나도 안 보였다).
  // 줄의 scrollLeft 만 고친다 — scrollIntoView 는 패널의 세로 스크롤까지 건드릴 수 있다
  useEffect(() => {
    const list = listRef.current;
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !tab) return;
    const box = list.getBoundingClientRect();
    const r = tab.getBoundingClientRect();
    const pad = 12; // 줄 양옆 여백(px-3)만큼 띄운다
    if (r.left < box.left + pad) list.scrollLeft -= box.left + pad - r.left;
    else if (r.right > box.right - pad) list.scrollLeft += r.right - (box.right - pad);
  }, [value]);

  return (
    // 휴대폰: 탭마다 가로 44px 이상(글자 양옆 8px), 넘치면 가로로 밀어 본다 — 오른쪽 끝에서 잘려 보이는 탭이 '더 있음' 표시.
    // 아래 선은 테두리 대신 안쪽 그림자로 그린다(세로로 1px 넘쳐 스크롤 상자가 되지 않게). 640px 부터는 예전 간격 그대로
    <div
      ref={listRef}
      role="tablist"
      className="flex gap-1 overflow-x-auto px-3 shadow-[inset_0_-1px_0_var(--line)] [scrollbar-width:none] sm:gap-5 sm:px-7"
    >
      {items.map(([id, label]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          onClick={(e) => {
            onChange(id);
            // 이미 고른 탭이 잘려 있을 때 누르면 다 보이게 (고른 탭이 바뀌는 경우는 위 효과가 민다)
            e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          }}
          className={`h-12 min-w-11 shrink-0 border-b-2 px-2 text-[15px] font-semibold whitespace-nowrap transition sm:min-w-0 sm:px-0 ${
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
