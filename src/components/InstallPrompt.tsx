import { useEffect, useState } from 'react';
import { DeviceMobile, Export, X } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import { track } from '../lib/analytics';

/** 처음 들어온 사람에게 '앱으로 받기' 팝업 (홈 화면 추가). 한 번 닫으면 14일 동안 안 띄움. 이미 앱으로 열었으면 안 띄움. */
type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = 'mc:install-dismissed';
const DAYS = 14;

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const mobile = () => /android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || ios();

function dismissedRecently(): boolean {
  try {
    const v = Number(localStorage.getItem(KEY) || 0);
    return v > 0 && Date.now() - v < DAYS * 86400e3;
  } catch {
    return false;
  }
}

export default function InstallPrompt() {
  const { lang } = useLang();
  const ko = lang !== 'en';
  const [bip, setBip] = useState<BIP | null>(null);
  const [open, setOpen] = useState(false);
  const isIos = ios();

  useEffect(() => {
    if (standalone() || dismissedRecently() || !mobile()) return;
    // 설치 가능 판정을 받으려면 서비스 워커가 있어야 하는 브라우저가 있어 미리 등록(캐시 없음, 알림용 sw.js)
    navigator.serviceWorker?.getRegistration('/').then((r) => r ?? navigator.serviceWorker.register('/sw.js', { scope: '/' })).catch(() => {});
    const onBip = (e: Event) => {
      e.preventDefault();
      setBip(e as BIP);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    // 첫 화면이 뜨고 잠깐 뒤에 띄운다
    const timer = setTimeout(() => setOpen(true), 1500);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBip);
      clearTimeout(timer);
    };
  }, []);

  if (!open) return null;

  const close = (why: string) => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* 저장 못 해도 이번엔 닫힘 */
    }
    track('install', { action: why });
    setOpen(false);
  };

  const install = async () => {
    if (!bip) return;
    await bip.prompt();
    const { outcome } = await bip.userChoice;
    close(outcome === 'accepted' ? 'installed' : 'declined');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => close('outside')}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        className="w-full max-w-md rounded-t-2xl bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <img src="/brand/logo-192.png" alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <h2 id="install-title" className="text-[17px] font-bold">
              {ko ? '마라톤 캘린더를 앱으로 받기' : 'Get Marathon Calendar as an app'}
            </h2>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-2">
              {ko
                ? '홈 화면에서 바로 열고, 저장한 대회의 접수 시작·마감 알림을 휴대폰으로 받을 수 있어요.'
                : 'Open it from your home screen and get entry open and close alerts for saved races on your phone.'}
            </p>
          </div>
          <button onClick={() => close('x')} aria-label={ko ? '닫기' : 'Close'} className="-mt-1 -mr-1 inline-flex h-11 w-11 items-center justify-center text-ink-3">
            <X size={20} weight="bold" />
          </button>
        </div>

        {bip ? (
          <button
            onClick={install}
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-ctl bg-ink text-[16px] font-bold text-bg"
          >
            <DeviceMobile size={20} weight="bold" />
            {ko ? '앱 설치하기' : 'Install app'}
          </button>
        ) : isIos ? (
          <ol className="mt-4 space-y-2 rounded-box bg-sunken p-4 text-[14px] leading-relaxed">
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
          <p className="mt-4 rounded-box bg-sunken p-4 text-[14px] leading-relaxed">
            {ko
              ? "브라우저 메뉴(⋮)에서 '앱 설치' 또는 '홈 화면에 추가'를 누르세요."
              : "Open the browser menu (⋮) and tap 'Install app' or 'Add to Home screen'."}
          </p>
        )}

        <button onClick={() => close('later')} className="mt-2 inline-flex h-11 w-full items-center justify-center text-[15px] font-semibold text-ink-3">
          {ko ? '다음에 할게요' : 'Maybe later'}
        </button>
      </div>
    </div>
  );
}
