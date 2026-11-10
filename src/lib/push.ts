/**
 * 휴대폰 알림(웹 푸시) — 브라우저 쪽. 회원이 이 기기에서 켜면:
 *   알림 권한 요청 → 서비스 워커(/sw.js) 등록 → PushManager.subscribe(VAPID 공개키) → DB push_subscribe() 에 저장.
 * 끄면 이 기기 구독을 풀고 DB 에서도 지운다. 다른 기기는 '내 정보' 기기 목록에서 해제.
 * 서비스 워커는 이 기능을 쓰는 사람만 등록한다 (나머지 방문자의 사이트 동작은 그대로).
 * DB: supabase/migrations/0018_push.sql. 보내는 쪽: worker/alerts/push.ts.
 */
import { supabase } from './supabase';
import { MemberNotReady } from './member';
import type { Lang } from '../i18n/lang';

export type PushSupport =
  /** 바로 켤 수 있다 (안드로이드·PC 크롬·엣지·파이어폭스, 홈 화면에 추가한 아이폰) */
  | 'ok'
  /** 아이폰·아이패드 브라우저 — 홈 화면에 추가한 뒤 그 아이콘으로 열어야 켤 수 있다 (iOS 16.4+) */
  | 'ios-install'
  /** 이 기기에서 알림을 막아 두었다 — 브라우저(설정 앱) 설정에서 풀어야 한다 */
  | 'denied'
  /** 이 브라우저는 웹 푸시가 없다 */
  | 'unsupported';

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

const hasPush = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function pushSupport(): PushSupport {
  if (isIOS() && !isStandalone()) return 'ios-install';
  if (!hasPush()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return 'ok';
}

function sb() {
  if (!supabase) throw new MemberNotReady('no supabase');
  return supabase;
}

/**
 * 개발 서버 전용 가짜 DB (push-preview.html?pmock=…): 주소에 pmock 이 있으면 Supabase 대신 메모리 목록.
 * community/api.ts 의 cmock 과 같은 꼴 — import.meta.env.DEV 가 아니면 늘 null 이라 배포 묶음에서 빠진다.
 */
const mockDb: PushDevice[] | null =
  import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('pmock')
    ? [
        {
          id: 'mock-1',
          endpoint: 'https://web.push.apple.com/mock-iphone',
          user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
          lang: 'ko',
          created_at: '2026-10-28T09:00:00Z',
        },
        {
          id: 'mock-2',
          endpoint: 'https://fcm.googleapis.com/fcm/send/mock-windows',
          user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          lang: 'ko',
          created_at: '2026-09-02T09:00:00Z',
        },
      ]
    : null;

// 0018 실행 전(표·함수 없음)이면 MemberNotReady — 화면은 '곧 열립니다'
const MISSING = new Set(['PGRST202', 'PGRST205', '42P01', '42883']);
function check(error: { code?: string; message: string } | null): void {
  if (!error) return;
  if ((error.code && MISSING.has(error.code)) || /could not find the (function|table)/i.test(error.message)) throw new MemberNotReady(error.message);
  throw new Error(error.message);
}

const b64urlToBytes = (s: string) => {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

/** VAPID 공개키: 사이트 함수 /api/push/key (Cloudflare 비밀값 VAPID_PUBLIC_KEY). 로컬 개발은 VITE_VAPID_PUBLIC_KEY */
async function vapidPublicKey(): Promise<string> {
  try {
    const r = await fetch('/api/push/key', { headers: { Accept: 'application/json' } });
    if (r.ok) {
      const j = (await r.json()) as { key?: string };
      if (j.key) return j.key;
    }
  } catch {
    /* 아래 개발용 값 */
  }
  const dev = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (dev) return dev;
  throw new Error('push key unavailable');
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const reg = (await navigator.serviceWorker.getRegistration('/')) ?? (await navigator.serviceWorker.register('/sw.js', { scope: '/' }));
  await navigator.serviceWorker.ready;
  return reg;
}

/** 이 기기의 지금 구독 (서비스 워커를 새로 등록하지는 않는다) */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!hasPush()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return (await reg?.pushManager.getSubscription()) ?? null;
}

const sameKey = (a: ArrayBuffer | null, b: Uint8Array) => {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
};

async function save(sub: PushSubscription, lang: Lang): Promise<void> {
  if (mockDb) {
    if (!mockDb.some((d) => d.endpoint === sub.endpoint))
      mockDb.unshift({ id: `mock-${Date.now()}`, endpoint: sub.endpoint, user_agent: navigator.userAgent, lang, created_at: new Date().toISOString() });
    return;
  }
  const j = sub.toJSON();
  const { error } = await sb().rpc('push_subscribe', {
    p_endpoint: sub.endpoint,
    p_p256dh: j.keys?.p256dh ?? '',
    p_auth: j.keys?.auth ?? '',
    p_user_agent: navigator.userAgent.slice(0, 400),
    p_lang: lang,
  });
  check(error);
}

export class PushDenied extends Error {
  constructor() {
    super('notification permission denied');
    this.name = 'PushDenied';
  }
}

/**
 * 이 기기에서 켜기. 버튼 누름 안에서 불러야 한다 — 권한 요청을 맨 먼저 해서(사파리는 누름 직후가 아니면 거절) 그 뒤에 등록·구독.
 */
export async function enablePush(lang: Lang): Promise<PushSubscription> {
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') throw new PushDenied();
  const [reg, key] = await Promise.all([registration(), vapidPublicKey()]);
  const appKey = b64urlToBytes(key);
  let sub = await reg.pushManager.getSubscription();
  // 서버 키가 바뀌었으면 옛 구독을 풀고 새로
  if (sub && !sameKey(sub.options.applicationServerKey, appKey)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appKey });
  await save(sub, lang);
  return sub;
}

/** 이 기기에서 끄기: 구독을 풀고 DB 에서도 지운다 */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => {});
  if (mockDb) return void mockDb.splice(0, mockDb.length, ...mockDb.filter((d) => d.endpoint !== endpoint));
  const { error } = await sb().from('push_subscriptions').delete().eq('endpoint', endpoint);
  check(error);
}

/** 이 기기가 켜져 있으면 DB 에도 있게 (다른 계정으로 로그인했거나 DB 에서 지워진 경우). 켜져 있으면 true */
export async function syncPush(lang: Lang, savedEndpoints: string[]): Promise<boolean> {
  if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return false;
  const sub = await currentSubscription();
  if (!sub) return false;
  if (!savedEndpoints.includes(sub.endpoint)) await save(sub, lang);
  return true;
}

export interface PushDevice {
  id: string;
  endpoint: string;
  user_agent: string | null;
  lang: Lang;
  created_at: string;
}

/** 내 기기 목록 (최근 등록 순) */
export async function listPushDevices(): Promise<PushDevice[]> {
  if (mockDb) return [...mockDb];
  const { data, error } = await sb()
    .from('push_subscriptions')
    .select('id, endpoint, user_agent, lang, created_at')
    .order('created_at', { ascending: false });
  check(error);
  return (data ?? []) as PushDevice[];
}

/** 기기 하나 해제. 이 기기면 브라우저 구독도 푼다 */
export async function removePushDevice(d: PushDevice): Promise<void> {
  const sub = await currentSubscription().catch(() => null);
  if (sub?.endpoint === d.endpoint) await sub.unsubscribe().catch(() => {});
  if (mockDb) return void mockDb.splice(0, mockDb.length, ...mockDb.filter((x) => x.id !== d.id));
  const { error } = await sb().from('push_subscriptions').delete().eq('id', d.id);
  check(error);
}

/** 'iPhone · Safari' 같은 짧은 기기 이름 (모르면 null) */
export function deviceName(ua: string | null): string | null {
  if (!ua) return null;
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X/.test(ua)
          ? 'Mac'
          : /Windows/.test(ua)
            ? 'Windows'
            : /Linux|CrOS/.test(ua)
              ? 'Linux'
              : null;
  const br = /SamsungBrowser/.test(ua)
    ? 'Samsung Internet'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Firefox|FxiOS/.test(ua)
        ? 'Firefox'
        : /CriOS|Chrome/.test(ua)
          ? 'Chrome'
          : /Safari/.test(ua)
            ? 'Safari'
            : null;
  return [os, br].filter(Boolean).join(' · ') || null;
}
