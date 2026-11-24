/**
 * 휴대폰 머리말의 메뉴 버튼 + 화면 아래에서 올라오는 시트 (native <dialog>. 스타일은 index.css 의 dialog.menu 를
 * home.css 가 덮어쓴다 — 엄지가 닿는 아래쪽 시트, 위쪽 닫기 버튼).
 * 닫히는 경우: ESC · 뒤 막 누르기 · 닫기 버튼 · 뒤로 가기 · 항목 고르기 · 화면이 NAV_INLINE_MIN 이상으로 넓어짐.
 * 열 때 히스토리에 한 칸을 넣어 뒤로 가기로 닫히게 하고, 다른 방법으로 닫히면 그 칸을 도로 뺀다.
 * 항목의 onSelect 는 그 칸이 빠진 뒤에 부른다 — onSelect 가 주소를 바꾸는데(러닝톡·언어 전환) 순서가 바뀌면 주소가 꼬인다.
 * 한 화면에 하나만 그린다 (id="nav-menu" 고정).
 * '앱 설치' 줄(data-menu-item="install")은 groups 와 별개로 여기서 그린다: 언어 줄 묶음 끝(없으면 마지막 묶음 앞 새 묶음).
 * 이미 앱으로 열었으면 숨김 · 설치 창을 열 수 있으면 설치 창 · 아이폰이면 '공유 → 홈 화면에 추가' 안내 · 그 밖엔 브라우저 메뉴 안내.
 */
import { Fragment, useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Export, List, X } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import { ensureServiceWorker, isMobile, record, useInstall } from '../lib/installApp';

/** 이 너비(px)부터는 항목이 머리말에 펼쳐지고 메뉴 버튼이 없다 (Tailwind md 와 같은 값) */
export const NAV_INLINE_MIN = 768;

export interface MenuItem {
  /** 'talk' | 'request' | 'admin' | 'lang' | 'login' | 'me' | 'logout' — 줄에 data-menu-item="<id>" 로 찍힌다 */
  id: string;
  label: string;
  /** 있으면 <a href>, 없으면 <button type="button"> */
  href?: string;
  /** 메뉴가 닫히고 히스토리 정리까지 끝난 뒤에 불린다 */
  onSelect: () => void;
  /** 오른쪽 보조 글자 (닉네임). 길면 말줄임 */
  hint?: string;
  /** 글자가 화면 언어와 다를 때 (언어 전환 줄) */
  lang?: 'ko' | 'en';
  /** 'primary' = 기존 Button(primary) 모양으로 가로 꽉 차게 (로그인) */
  tone?: 'primary';
}

/** 우리가 부른 history.back() 의 popstate 를 기다리는 시간. 안 오면 그냥 다음 일을 한다 */
const BACK_WAIT = 300;

const rowCls =
  'flex min-h-12 w-full items-center justify-between gap-4 rounded-ctl px-3 text-left text-[16px] font-semibold whitespace-nowrap text-ink transition-colors hover:bg-sunken active:bg-sunken focus-visible:-outline-offset-2';
// 기존 Button(primary)·CloseButton 과 같은 생김새. 그쪽은 sm 부터 36~40px 로 줄어들어, 시트 안에서는 크기를 고정해 따로 그린다
const primaryCls =
  'flex h-12 w-full items-center justify-center rounded-ctl bg-ink px-4 text-[16px] font-semibold whitespace-nowrap text-bg transition hover:opacity-85 active:translate-y-px';
const closeCls =
  'grid size-11 shrink-0 place-items-center rounded-ctl text-ink-3 transition hover:bg-sunken hover:text-ink active:scale-95';

/** groups: 묶음 배열. 묶음 사이에 구분선. className 은 메뉴 버튼에만 붙는다(시트에는 안 붙음) */
export function MobileMenu({ groups, className = '' }: { groups: MenuItem[][]; className?: string }) {
  const { t, lang } = useLang();
  const ko = lang !== 'en';
  const [open, setOpen] = useState(false);
  const { kind: installKind, install } = useInstall();
  /** 아이폰·브라우저 메뉴 안내를 펼쳤나 (시트를 열 때마다 접힌 채로) */
  const [guide, setGuide] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  /** 지금 열려 있나 (이벤트 핸들러가 최신 값을 보게) */
  const openRef = useRef(false);
  /** 열면서 히스토리에 한 칸 넣어 둔 상태 (App 이 history.state 를 지우므로 state 가 아니라 여기에 기억한다) */
  const pushed = useRef(false);
  /** 우리가 부른 history.back() 의 popstate 를 기다리는 중 + 그 뒤에 할 일 */
  const waiting = useRef(false);
  const after = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const openMenu = () => {
    if (openRef.current || waiting.current) return;
    // 누르는 순간에 넣는다 (effect 에서 넣으면 StrictMode 에서 두 번 들어간다)
    history.pushState(history.state, '');
    pushed.current = true;
    openRef.current = true;
    setGuide(false); // 지난번에 펼친 설치 안내는 접어서 연다
    setOpen(true);
  };

  /** 히스토리 정리가 끝난 뒤: 미뤄 둔 일을 한다 (ref 만 만진다) */
  const settle = useCallback(() => {
    clearTimeout(timer.current);
    waiting.current = false;
    const fn = after.current;
    after.current = null;
    fn?.();
  }, []);

  /** 닫는다. then 은 넣어 둔 히스토리 한 칸이 빠진 뒤에 부른다 */
  const close = useCallback(
    (then?: () => void) => {
      if (!openRef.current) return;
      openRef.current = false;
      setOpen(false);
      after.current = then ?? null;
      waiting.current = true;
      if (pushed.current) {
        pushed.current = false;
        history.back();
        timer.current = setTimeout(settle, BACK_WAIT);
      } else {
        timer.current = setTimeout(settle, 0); // 닫힘(포커스 복귀)이 먼저 그려진 뒤에
      }
    },
    [settle],
  );

  // 상태 → dialog. 닫히면 포커스를 메뉴 버튼으로 (dialog 기본 복귀는 history.back() 이 끼면 믿기 어렵다)
  const wasOpen = useRef(false);
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) {
      if (!d.open) {
        d.showModal();
        d.focus({ preventScroll: true }); // 첫 항목에 포커스 링이 잡히지 않게 시트 자체에 둔다
      }
    } else if (wasOpen.current) {
      if (d.open) d.close();
      buttonRef.current?.focus({ preventScroll: true });
    }
    wasOpen.current = open;
  }, [open]);

  // 팝업을 닫은 사람도 메뉴의 '앱 설치' 로 설치 창을 열 수 있게 서비스 워커를 미리 둔다 (처음 한 번)
  useEffect(() => {
    if (isMobile()) ensureServiceWorker(); // 데스크톱 방문자에게까지 등록하지 않는다 (팝업도 휴대폰에서만 했다)
  }, []);

  const pickInstall = () => {
    if (installKind === 'prompt') {
      // 설치 창은 누른 순간(사용자 동작 안)에 연다. 메뉴는 함께 닫는다
      void install();
      close();
      return;
    }
    const next = !guide;
    setGuide(next);
    if (next && installKind === 'ios') record('ios_guide');
  };

  const guideShown = guide && installKind !== 'prompt';
  const installRow =
    installKind === 'none' ? null : (
      <li key="install">
        <button
          type="button"
          data-menu-item="install"
          onClick={pickInstall}
          aria-expanded={installKind === 'prompt' ? undefined : guide}
          aria-controls={guideShown ? 'nav-install-guide' : undefined}
          className={rowCls}
        >
          <span className="shrink-0">{ko ? '앱 설치' : 'Install app'}</span>
        </button>
        {guideShown && (
          <div id="nav-install-guide" className="mx-3 mb-2">
            {installKind === 'ios' ? (
              <ol className="space-y-2 rounded-box bg-sunken p-4 text-[14px] leading-relaxed">
                <li className="flex items-center gap-2">
                  <span className="num font-bold">1.</span>
                  {ko ? '사파리 아래쪽' : 'In Safari, tap'}
                  <Export size={18} weight="bold" aria-label={ko ? '공유' : 'Share'} />
                  {ko ? '(공유) 버튼을 누르고' : '(Share)'}
                </li>
                <li>
                  <span className="num font-bold">2.</span> {ko ? "'홈 화면에 추가'를 고르면 끝이에요." : "choose 'Add to Home Screen'."}
                </li>
              </ol>
            ) : (
              <p className="rounded-box bg-sunken p-4 text-[14px] leading-relaxed">
                {ko
                  ? "브라우저 메뉴(⋮)에서 '앱 설치' 또는 '홈 화면에 추가'를 누르세요."
                  : "Open the browser menu (⋮) and tap 'Install app' or 'Add to Home screen'."}
              </p>
            )}
          </div>
        )}
      </li>
    );
  // 언어 줄 묶음 끝에 붙인다. 언어 줄이 없으면 마지막 묶음(로그인) 앞에 새 묶음으로
  const langGroup = groups.findIndex((g) => g.some((item) => item.id === 'lang'));
  const ownGroup = langGroup < 0 && !!installRow;
  const installAt = langGroup >= 0 ? langGroup : Math.max(0, groups.length - 1);

  useEffect(() => {
    const onPop = () => {
      if (waiting.current) return settle(); // 우리가 뺀 칸
      if (!openRef.current) return;
      // 사용자가 뒤로 가기를 눌렀다: 칸은 이미 빠졌으니 닫기만
      pushed.current = false;
      openRef.current = false;
      setOpen(false);
    };
    const wide = matchMedia(`(min-width: ${NAV_INLINE_MIN}px)`);
    const onWide = () => {
      if (wide.matches) close();
    };
    addEventListener('popstate', onPop);
    wide.addEventListener('change', onWide);
    return () => {
      removeEventListener('popstate', onPop);
      wide.removeEventListener('change', onWide);
      clearTimeout(timer.current);
    };
  }, [close, settle]);

  const pick = (item: MenuItem) => (e: MouseEvent) => {
    // 링크를 ⌘/Ctrl/Shift 와 함께 누르면 브라우저에 맡긴다(새 탭). 메뉴는 그대로
    if (item.href && (e.metaKey || e.ctrlKey || e.shiftKey)) return;
    e.preventDefault();
    close(item.onSelect);
  };

  // modal dialog 라도 Chrome 은 마지막 항목에서 Tab 을 누르면 포커스를 주소창 쪽으로 내보낸다 → 직접 가둔다
  const trapTab = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.key !== 'Tab') return;
    const d = e.currentTarget;
    const stops = [...d.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
    if (!stops.length) return;
    const first = stops[0];
    const last = stops[stops.length - 1];
    const at = document.activeElement;
    if (e.shiftKey ? at === first || at === d : at === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        data-nav-menu-button
        aria-label={t('header.menu')}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="nav-menu"
        onClick={openMenu}
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-ctl text-ink-2 transition-colors hover:bg-sunken hover:text-ink ${className}`}
      >
        <List size={22} aria-hidden />
      </button>
      <dialog
        ref={dialogRef}
        id="nav-menu"
        className="menu"
        aria-label={t('header.menu')}
        tabIndex={-1}
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        // 브라우저가 스스로 닫은 경우(ESC 를 연달아 누름 등)에도 상태·히스토리를 맞춘다.
        // close 이벤트는 다음 화면 그리기 때 늦게 온다 — 그 사이 다시 열렸으면(open) 지난 닫힘의 이벤트라 넘긴다
        onClose={(e) => {
          if (!e.currentTarget.open) close();
        }}
        onClick={(e) => {
          // 뒤 막(::backdrop) 누르면 닫기. 시트 자기 여백(아래 안전 영역 — home.css 의 padding-bottom)을 눌러도 target 은 dialog 라
          // 눌린 자리가 시트 밖일 때만 닫는다 (안 가리면 '로그인' 아래 빈 자리를 스친 손가락에 메뉴가 닫힌다)
          if (e.target !== e.currentTarget) return;
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
        }}
        onKeyDown={trapTab}
      >
        <div className="flex items-center justify-between pt-1 pr-1 pl-4">
          <span className="text-[13px] font-semibold text-ink-3">{t('header.menu')}</span>
          <button type="button" onClick={() => close()} aria-label={t('common.close')} className={closeCls}>
            <X size={18} weight="bold" aria-hidden />
          </button>
        </div>
        {groups.map((group, i) => (
          <Fragment key={i}>
            {ownGroup && i === installAt && <ul className={`p-1 ${i ? 'border-t border-line' : ''}`}>{installRow}</ul>}
            <ul className={`p-1 ${i || (ownGroup && i === installAt) ? 'border-t border-line' : ''}`}>
              {group.map((item) => {
                const body =
                  item.tone === 'primary' ? (
                    item.label
                  ) : (
                    <>
                      <span className="shrink-0">{item.label}</span>
                      {item.hint && <span className="min-w-0 truncate text-[14px] font-normal text-ink-3">{item.hint}</span>}
                    </>
                  );
                const common = {
                  'data-menu-item': item.id,
                  lang: item.lang,
                  onClick: pick(item),
                  className: item.tone === 'primary' ? primaryCls : rowCls,
                };
                return (
                  <li key={item.id} className={item.tone === 'primary' ? 'px-3 py-2' : undefined}>
                    {item.href ? (
                      <a href={item.href} {...common}>
                        {body}
                      </a>
                    ) : (
                      <button type="button" {...common}>
                        {body}
                      </button>
                    )}
                  </li>
                );
              })}
              {!ownGroup && i === installAt && installRow}
            </ul>
          </Fragment>
        ))}
      </dialog>
    </>
  );
}
