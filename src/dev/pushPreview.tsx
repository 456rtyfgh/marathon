/**
 * 개발 서버 전용 휴대폰 알림 미리보기 (push-preview.html). 로그인·Supabase·실제 푸시 없이 화면만 본다.
 *  ?view=detail  대회 상세 '알림' 탭 (AlertForm — 회원 화면)
 *  ?view=me      '내 정보' 휴대폰 알림 구역 (PushSection, 기기 목록은 lib/push.ts 의 ?pmock 가짜 DB)
 *  ?state=off|on|ios|denied|unsupported  이 기기 상태 (브라우저 API 를 바꿔 끼워 흉내 낸다), ?lang=en
 */
import { StrictMode, useContext } from 'react';
import { createRoot } from 'react-dom/client';
import type { Session } from '@supabase/supabase-js';
import '../index.css';
import { LangProvider, useLang } from '../i18n';
import { AuthContextForPreview } from '../lib/auth';
import AlertForm from '../components/AlertForm';
import { PushSection } from '../components/PushToggle';
import type { Race } from '../lib/types';

const q = new URLSearchParams(location.search);
const view = q.get('view') === 'me' ? 'me' : 'detail';
const state = q.get('state') ?? 'off';
const lang = q.get('lang') === 'en' ? 'en' : 'ko';

const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
};
const def = (o: object, k: string, v: unknown) => Object.defineProperty(o, k, { configurable: true, get: () => v });

// ── 브라우저 API 바꿔 끼우기 ──
def(navigator, 'userAgent', state === 'ios' ? UA.ios : UA.android);
if (state === 'unsupported') delete (window as { PushManager?: unknown }).PushManager;
const perm = state === 'denied' ? 'denied' : state === 'on' ? 'granted' : 'default';
if ('Notification' in window) {
  def(Notification, 'permission', perm);
  Notification.requestPermission = async () => 'granted';
}
let sub: PushSubscription | null =
  state === 'on'
    ? ({
        endpoint: 'https://fcm.googleapis.com/fcm/send/mock-this-pixel',
        options: { applicationServerKey: null, userVisibleOnly: true },
        toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/mock-this-pixel', keys: { p256dh: '', auth: '' } }),
        unsubscribe: async () => ((sub = null), true),
      } as unknown as PushSubscription)
    : null;
const reg = {
  pushManager: {
    getSubscription: async () => sub,
    subscribe: async () =>
      (sub = {
        endpoint: 'https://fcm.googleapis.com/fcm/send/mock-new',
        options: { applicationServerKey: null, userVisibleOnly: true },
        toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/mock-new', keys: { p256dh: '', auth: '' } }),
        unsubscribe: async () => ((sub = null), true),
      } as unknown as PushSubscription),
  },
};
if ('serviceWorker' in navigator) {
  def(navigator, 'serviceWorker', {
    getRegistration: async () => (state === 'on' || sub ? reg : undefined),
    register: async () => reg,
    ready: Promise.resolve(reg),
  });
}
// /api/push/key 대신 아무 공개키 모양 (가짜 구독이라 쓰이지 않는다)
const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
  String(input).endsWith('/api/push/key')
    ? new Response(JSON.stringify({ key: 'B' + 'A'.repeat(86) }), { headers: { 'Content-Type': 'application/json' } })
    : realFetch(input, init)) as typeof fetch;

const race = {
  id: 'preview-race',
  name_ko: '미리보기 마라톤',
  race_date: '2027-03-21',
  entry_opens: '2026-11-24',
  entry_closes: '2026-12-05',
  entry_confidence: 'confirmed',
  sold_out_on: null,
  notes_ko: null,
} as unknown as Race;

function FakeAuth({ children }: { children: React.ReactNode }) {
  const base = useContext(AuthContextForPreview);
  const session = { user: { id: 'preview-user', email: 'runner@example.com' } } as unknown as Session;
  return <AuthContextForPreview.Provider value={{ ...base, session, loading: false }}>{children}</AuthContextForPreview.Provider>;
}

function Preview() {
  const { t } = useLang();
  return (
    <div className="min-h-dvh">
      <main className="mx-auto max-w-xl px-4 py-6">
        <p className="mb-4 text-[13px] text-ink-3">
          미리보기 — view={view}, state={state}
        </p>
        {view === 'detail' ? (
          <div>
            <h2 className="mb-4 text-[20px] font-bold text-ink">{t('alert.submit')}</h2>
            <AlertForm race={race} onLogin={() => {}} />
          </div>
        ) : (
          <PushSection className="border-t border-line pt-5" />
        )}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider initial={lang}>
      <FakeAuth>
        <Preview />
      </FakeAuth>
    </LangProvider>
  </StrictMode>,
);
