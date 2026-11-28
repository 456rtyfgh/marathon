/**
 * 앱 설치(홈 화면 추가) 상태를 첫 방문 팝업(InstallPrompt)과 휴대폰 메뉴(MobileMenu)가 함께 쓴다.
 * beforeinstallprompt 는 한 번만 오고, 먼저 preventDefault 한 쪽만 prompt() 를 부를 수 있어서
 * 컴포넌트가 아니라 이 모듈이 로드될 때 붙여 보관한다.
 * 자체 집계(stat_hit)의 'install' 이벤트 키: INSTALL_ACTIONS (짧은 영문, 바꾸지 말 것).
 */
import { useEffect, useState } from 'react';
import { track } from './analytics';

/** prompt=설치 창을 열 수 있음 · ios=공유 → 홈 화면에 추가 안내 · manual=설치 창을 못 열어 브라우저 메뉴 안내 · none=이미 앱으로 열림 */
export type InstallKind = 'prompt' | 'ios' | 'manual' | 'none';
export const INSTALL_ACTIONS = ['shown', 'accepted', 'dismissed', 'installed', 'ios_guide'] as const;
export type InstallAction = (typeof INSTALL_ACTIONS)[number];

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** 순수 판정 (node 테스트용) */
export function pickKind(s: { standalone: boolean; installed: boolean; hasPrompt: boolean; ios: boolean }): InstallKind {
  if (s.standalone || s.installed) return 'none';
  if (s.hasPrompt) return 'prompt';
  return s.ios ? 'ios' : 'manual';
}

/** 아이폰·아이패드 (아이패드 사파리는 맥으로 보인다) */
export function isIosUa(ua: string, platform = '', touchPoints = 0): boolean {
  return /iphone|ipad|ipod/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}

const hasWindow = typeof window !== 'undefined';
export const isStandalone = () =>
  hasWindow &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
export const isIos = () => hasWindow && isIosUa(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
export const isMobile = () => hasWindow && (/android|iphone|ipad|ipod|mobile/i.test(navigator.userAgent) || isIos());

export function record(action: InstallAction) {
  track('install', { action });
}

let bip: BIP | null = null;
/** 설치 창이 떠 있는 동안 (그새 팝업·메뉴가 안내 글로 바뀌지 않게 'prompt' 로 둔다) */
let prompting = false;
let installed = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

if (hasWindow) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    bip = e as BIP;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    if (installed) return;
    installed = true;
    bip = null;
    record('installed');
    notify();
  });
}

/** 설치 가능 판정을 받으려면 서비스 워커가 있어야 하는 브라우저가 있어 미리 등록 (캐시 없음, 알림용 sw.js) */
export function ensureServiceWorker() {
  if (!hasWindow || isStandalone()) return;
  navigator.serviceWorker?.getRegistration('/').then((r) => r ?? navigator.serviceWorker.register('/sw.js', { scope: '/' })).catch(() => {});
}

export function installKind(): InstallKind {
  if (!hasWindow) return 'none';
  return pickKind({ standalone: isStandalone(), installed, hasPrompt: !!bip || prompting, ios: isIos() });
}

/** 설치 창을 연다 (prompt 일 때만). 수락·거절을 기록한다 — 팝업·메뉴 어디서 열었든 */
export async function runInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  const e = bip;
  if (!e) return 'unavailable';
  bip = null; // prompt() 는 한 번만 부를 수 있다 (떠 있는 동안 또 누르면 unavailable)
  prompting = true;
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    const r = outcome === 'accepted' ? 'accepted' : 'dismissed';
    record(r);
    return r;
  } catch {
    return 'unavailable';
  } finally {
    prompting = false;
    notify();
  }
}

/** 이벤트 도착·설치 완료에 맞춰 다시 그린다 */
export function useInstall() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    return () => {
      subs.delete(f);
    };
  }, []);
  return { kind: installKind(), install: runInstall, installed };
}
