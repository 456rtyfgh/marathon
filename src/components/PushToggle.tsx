import { useEffect, useState } from 'react';
import { Export, PlusSquare, DeviceMobile } from '@phosphor-icons/react';
import { useAuth } from '../lib/auth';
import { useLang } from '../i18n';
import { fmtDate } from '../lib/util';
import { isMemberNotReady } from '../lib/member';
import {
  PushDenied,
  currentSubscription,
  deviceName,
  disablePush,
  enablePush,
  listPushDevices,
  pushSupport,
  removePushDevice,
  syncPush,
  type PushDevice,
  type PushSupport,
} from '../lib/push';
import { Note } from './ui';

// 이 탭에서 이미 DB 와 맞춘 구독 (같은 화면을 열 때마다 저장하지 않게)
const synced = new Set<string>();

/**
 * '휴대폰 알림도 받기' 스위치 — 회원만 (부르는 쪽이 로그인 확인). 이 기기 하나만 켜고 끈다.
 * 아이폰 브라우저는 스위치 대신 '홈 화면에 추가' 안내, 막힌 기기·지원 안 하는 브라우저는 한 줄 안내.
 */
export default function PushToggle({ onChange, sync = true }: { onChange?: () => void; sync?: boolean }) {
  const { session } = useAuth();
  const { lang, t } = useLang();
  const [support, setSupport] = useState<PushSupport | null>(null);
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const uid = session?.user.id;

  useEffect(() => {
    let alive = true;
    const s = pushSupport();
    setSupport(s);
    if (s !== 'ok') return;
    currentSubscription()
      .then(async (sub) => {
        const has = !!sub && Notification.permission === 'granted';
        if (alive) setOn(has);
        // 이 기기가 켜져 있으면 DB 에도 지금 계정으로 있게 (다른 계정으로 로그인했던 기기 등)
        const mark = `${uid}:${sub?.endpoint}`;
        if (sync && has && uid && !synced.has(mark)) {
          synced.add(mark);
          await syncPush(lang, []).catch(() => synced.delete(mark));
        }
      })
      .catch(() => alive && setOn(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  if (!uid || support == null) return null;

  if (support === 'ios-install') return <IosGuide />;
  if (support === 'unsupported') return <p className="text-[15px] sm:text-[13px] leading-relaxed text-ink-3">{t('push.unsupported')}</p>;

  async function flip() {
    if (on == null || busy) return;
    setBusy(true);
    setErr('');
    try {
      if (on) {
        await disablePush();
        setOn(false);
      } else {
        const sub = await enablePush(lang);
        synced.add(`${uid}:${sub.endpoint}`);
        setOn(true);
      }
      onChange?.();
    } catch (e) {
      if (e instanceof PushDenied) {
        // 거절(차단)했으면 안내로, 창을 그냥 닫았으면 아무 말 없이 꺼진 채로
        if (Notification.permission === 'denied') setSupport('denied');
      } else setErr(isMemberNotReady(e) ? t('push.soon') : t('push.fail'));
    } finally {
      setBusy(false);
    }
  }

  const denied = support === 'denied';
  const checked = !!on && !denied;
  return (
    <div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={on == null || busy || denied}
        onClick={flip}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-box border border-line px-4 py-2 text-left transition hover:bg-sunken disabled:opacity-60"
      >
        <span className="flex min-w-0 items-center gap-3">
          <DeviceMobile size={20} className="shrink-0 text-ink-2" aria-hidden />
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-ink">{t('push.label')}</span>
            <span className="block text-[13px] text-ink-3">{busy ? t('push.working') : checked ? t('push.on') : t('push.offHint')}</span>
          </span>
        </span>
        <span aria-hidden className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}>
          <span
            className={`absolute top-0.5 size-5 rounded-full border border-line bg-bg shadow-sm transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
          />
        </span>
      </button>
      {denied && <p className="mt-2 text-[15px] sm:text-[13px] leading-relaxed text-ink-3">{t('push.denied')}</p>}
      {err && (
        <div className="mt-2">
          <Note tone="error">{err}</Note>
        </div>
      )}
    </div>
  );
}

/** 아이폰·아이패드 브라우저: 홈 화면에 추가하는 방법 세 줄 */
function IosGuide() {
  const { t } = useLang();
  const steps = [
    { icon: <Export size={16} weight="bold" aria-hidden />, text: t('push.iosStep1') },
    { icon: <PlusSquare size={16} weight="bold" aria-hidden />, text: t('push.iosStep2') },
    { icon: <DeviceMobile size={16} weight="bold" aria-hidden />, text: t('push.iosStep3') },
  ];
  return (
    <div className="rounded-box border border-line px-4 py-3">
      <p className="text-[15px] font-semibold text-ink">{t('push.iosTitle')}</p>
      <ol className="mt-2 space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[15px] sm:text-[13px] leading-relaxed text-ink-2">
            <span className="num mt-px inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-line text-[12px] font-semibold text-ink-2 sm:text-[11px]">
              {i + 1}
            </span>
            <span className="flex min-w-0 items-start gap-1.5">
              <span className="mt-0.5 shrink-0 text-ink-3">{s.icon}</span>
              <span>{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[15px] sm:text-[13px] text-ink-3">{t('push.iosNote')}</p>
    </div>
  );
}

/** '내 정보' 휴대폰 알림 구역: 이 기기 스위치 + 알림 받는 기기 목록(기기별 해제) */
export function PushSection({ className = '' }: { className?: string }) {
  const { lang, t } = useLang();
  const [notReady, setNotReady] = useState(false);
  const [devices, setDevices] = useState<PushDevice[] | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [rev, setRev] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    Promise.all([listPushDevices(), currentSubscription().catch(() => null)])
      .then(async ([list, sub]) => {
        if (!alive) return;
        // 이 기기가 켜져 있는데 목록에 없으면 먼저 저장하고 다시 읽는다
        if (sub && (await syncPush(lang, list.map((d) => d.endpoint)).catch(() => false)) && !list.some((d) => d.endpoint === sub.endpoint)) {
          list = await listPushDevices();
        }
        if (!alive) return;
        setDevices(list);
        setMine(sub?.endpoint ?? null);
      })
      .catch((e) => {
        // 0018 실행 전이면 이 구역만 '곧 열립니다' (다른 회원 기능은 그대로)
        if (alive && isMemberNotReady(e)) setNotReady(true);
        else if (alive) setDevices([]);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rev]);

  async function remove(d: PushDevice) {
    setBusyId(d.id);
    setErr('');
    try {
      await removePushDevice(d);
      setRev((n) => n + 1);
    } catch {
      setErr(t('push.fail'));
    } finally {
      setBusyId(null);
    }
  }

  if (notReady)
    return (
      <section className={className}>
        <h3 className="text-[15px] font-semibold text-ink">{t('push.title')}</h3>
        <p className="mt-1 text-[15px] sm:text-[13px] leading-relaxed text-ink-3">{t('push.soon')}</p>
      </section>
    );

  return (
    <section className={className}>
      <h3 className="text-[15px] font-semibold text-ink">{t('push.title')}</h3>
      <p className="mt-1 text-[15px] sm:text-[13px] leading-relaxed text-ink-2">{t('push.meText')}</p>
      <div className="mt-3">
        <PushToggle key={rev} sync={false} onChange={() => setRev((n) => n + 1)} />
      </div>
      {!!devices?.length && (
        <div className="mt-4">
          <h4 className="text-[13px] font-semibold text-ink-2">{t('push.devices')}</h4>
          <ul className="mt-2 divide-y divide-line rounded-box border border-line">
            {devices.map((d) => {
              const name = deviceName(d.user_agent) ?? t('push.unknownDevice');
              const here = d.endpoint === mine;
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[15px] text-ink">
                      <span className="truncate">{name}</span>
                      {here && (
                        <span className="shrink-0 rounded-full border border-line px-2 py-px text-[12px] font-semibold text-ink-2 sm:text-[11px]">{t('push.thisDevice')}</span>
                      )}
                    </span>
                    <span className="block text-[13px] text-ink-3">{t('push.since', { d: fmtDate(d.created_at.slice(0, 10), lang) })}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(d)}
                    disabled={busyId === d.id}
                    aria-label={t('push.removeLabel', { name })}
                    className="inline-flex h-11 shrink-0 items-center rounded-ctl bg-sunken px-3 text-[15px] font-semibold text-ink transition hover:bg-line active:translate-y-px disabled:opacity-50 sm:h-9 sm:text-[13px]"
                  >
                    {busyId === d.id ? t('common.processing') : t('push.remove')}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {err && (
        <div className="mt-3">
          <Note tone="error">{err}</Note>
        </div>
      )}
    </section>
  );
}
