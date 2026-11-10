import { useEffect, useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
import { useAuth } from '../lib/auth';
import { useLang } from '../i18n';
import { fmtDate, todayISO } from '../lib/util';
import {
  calendarTokenInfo,
  feedUrl,
  fmtFinish,
  getAlertPrefs,
  isMemberNotReady,
  issueCalendarToken,
  recordSummary,
  setSavedAlerts,
  type RecordSummary,
} from '../lib/member';
import { Button, Note } from './ui';
import PastRaceLog, { type RecordStats } from './PastRaceLog';

const feedKey = (uid: string) => `marathon-cal:feed:${uid}`;
const readFeed = (uid: string) => {
  try {
    const v = localStorage.getItem(feedKey(uid));
    return v && /^[0-9a-f]{64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
};
const storeFeed = (uid: string, token: string) => {
  try {
    localStorage.setItem(feedKey(uid), token);
  } catch {
    /* 저장 못 하면 이번 화면에서만 보인다 */
  }
};

const section = 'border-t border-line pt-5';
const h3 = 'text-[15px] font-semibold text-ink';
const linkBtn =
  'inline-flex h-11 items-center gap-2 rounded-ctl bg-sunken px-3 text-[15px] font-semibold whitespace-nowrap text-ink transition hover:bg-line active:translate-y-px sm:h-9';

/**
 * '내 정보' 안 회원 기능 세 구역: 내 기록 요약 · 내 일정 구독 주소 · 저장한 대회 알림.
 * DB 준비 전(0013 실행 전)이면 세 구역 대신 '곧 열립니다' 한 줄.
 */
export default function MemberPanel() {
  const { session } = useAuth();
  const { t } = useLang();
  const [notReady, setNotReady] = useState(false);
  const uid = session?.user.id;
  if (!uid) return null;
  const onError = (e: unknown) => {
    if (isMemberNotReady(e)) setNotReady(true);
    else console.warn('member panel:', e);
  };
  if (notReady)
    return (
      <section className={section}>
        <p className="text-[13px] leading-relaxed text-ink-3">{t('member.soon')}</p>
      </section>
    );
  return (
    <>
      <RecordsSection onError={onError} />
      <FeedSection uid={uid} onError={onError} />
      <AlertsSection email={session.user.email ?? ''} onError={onError} />
    </>
  );
}

function RecordsSection({ onError }: { onError: (e: unknown) => void }) {
  const { lang, t } = useLang();
  const year = Number(todayISO().slice(0, 4));
  const [sum, setSum] = useState<RecordSummary | null>(null);
  const [ver, setVer] = useState(0); // 지난 대회 등록·고치기 뒤 요약 다시 읽기
  // 올해 참가 수·거리는 참가 회차 기준(PastRaceLog) — 대회 목록을 아직 못 받았으면 DB 요약 그대로.
  // 참가한 대회 수·총 참가 횟수·Top3 는 내 대회 목록에서 센다(목록을 받기 전에는 '-')
  const [mine, setMine] = useState<RecordStats | null>(null);
  const loc = lang === 'en' ? 'en-US' : 'ko-KR';
  useEffect(() => {
    let alive = true;
    recordSummary(year).then((s) => alive && setSum(s), onError);
    return () => {
      alive = false;
    };
    // onError 는 렌더마다 새로 만들어지지만 같은 일을 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, ver]);
  const count = mine?.count ?? sum?.year_count ?? 0;
  const km = Math.round(Number(mine?.km ?? sum?.year_km ?? 0) * 10) / 10;
  return (
    <section className={section}>
      <h3 className={h3}>{t('me.records.title')}</h3>
      <dl className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-box bg-line">
        <Stat label={t('me.records.year', { y: year })} value={sum ? t('me.records.count', { n: count }) : '-'} />
        <Stat label={t('me.records.km', { y: year })} value={sum ? `${km.toLocaleString(lang === 'en' ? 'en-US' : 'ko-KR')} km` : '-'} />
        <Stat label={t('me.records.bestFull')} value={sum?.best_full_sec != null ? fmtFinish(sum.best_full_sec) : '-'} />
        <Stat label={t('me.records.bestHalf')} value={sum?.best_half_sec != null ? fmtFinish(sum.best_half_sec) : '-'} />
        <Stat label={t('me.records.races')} value={mine ? t('me.records.racesN', { n: mine.races.toLocaleString(loc) }) : '-'} />
        <Stat label={t('me.records.times')} value={mine ? t('me.records.count', { n: mine.times.toLocaleString(loc) }) : '-'} />
      </dl>
      {mine && mine.top.length > 0 && (
        <div className="mt-4">
          <h4 className="text-[13px] font-semibold text-ink-2">{t('me.records.top')}</h4>
          <ol className="mt-2 divide-y divide-line rounded-box border border-line">
            {mine.top.map((r, i) => (
              <li key={r.id} className="flex min-h-12 items-center gap-3 px-4 py-2">
                <span className="num w-4 shrink-0 text-[13px] font-semibold text-ink-3">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{r.name}</span>
                <span className="num shrink-0 text-[15px] font-semibold text-ink">{t('me.records.topN', { n: r.n })}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <PastRaceLog year={year} onChanged={() => setVer((v) => v + 1)} onStats={setMine} onError={onError} />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-3 py-3">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className="num mt-1 text-[17px] leading-7 font-semibold text-ink">{value}</dd>
    </div>
  );
}

function FeedSection({ uid, onError }: { uid: string; onError: (e: unknown) => void }) {
  const { lang, t } = useLang();
  // undefined = 아직 모름, null = 서버에 토큰 없음
  const [since, setSince] = useState<string | null | undefined>(undefined);
  const [token, setToken] = useState<string | null>(() => readFeed(uid));
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    calendarTokenInfo().then((d) => alive && setSince(d), onError);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function issue() {
    setBusy(true);
    setErr('');
    try {
      const raw = await issueCalendarToken();
      storeFeed(uid, raw);
      setToken(raw);
      setSince(new Date().toISOString());
      setConfirm(false);
    } catch (e) {
      if (isMemberNotReady(e)) onError(e);
      else setErr(e instanceof Error && lang === 'ko' && /[가-힣]/.test(e.message) ? e.message : t('me.feed.fail'));
    } finally {
      setBusy(false);
    }
  }

  // 서버에 토큰이 없어졌으면(다른 기기에서 재발급 등은 알 수 없다 — 없을 때만) 이 기기의 옛 주소도 보이지 않게
  const shown = since === null ? null : token;
  const webcal = shown ? feedUrl(shown, lang, 'webcal') : '';

  async function copy() {
    try {
      await navigator.clipboard.writeText(webcal);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      prompt(t('detail.copyPrompt'), webcal);
    }
  }

  return (
    <section id="me-feed" className={section}>
      <h3 className={h3}>{t('me.feed.title')}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{t('me.feed.text')}</p>
      {since === undefined ? null : shown ? (
        <div className="mt-3 space-y-3">
          <input
            readOnly
            value={webcal}
            aria-label={t('me.feed.title')}
            onFocus={(e) => e.currentTarget.select()}
            className="num min-h-11 w-full truncate rounded-ctl border border-line bg-surface px-3 text-[13px] text-ink-2 outline-none focus:border-ink sm:min-h-10"
          />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={copy} className={linkBtn}>
              {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="bold" />}
              {copied ? t('me.feed.copied') : t('me.feed.copy')}
            </button>
            <a
              href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`}
              target="_blank"
              rel="noreferrer"
              className={linkBtn}
            >
              {t('me.feed.google')}
            </a>
            <a href={webcal} className={linkBtn}>
              {t('me.feed.apple')}
            </a>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-3">
            {since && `${t('me.feed.since', { d: fmtDate(since.slice(0, 10), lang) })} · `}
            {t('me.feed.hint')}
          </p>
        </div>
      ) : since ? (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-3">{t('me.feed.otherDevice')}</p>
      ) : (
        <Button size="sm" type="button" className="mt-3" disabled={busy} onClick={issue}>
          {busy ? t('common.processing') : t('me.feed.create')}
        </Button>
      )}
      {since && !confirm && (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="mt-1 inline-flex min-h-11 items-center text-[13px] text-ink-3 underline underline-offset-2 transition-colors hover:text-ink"
        >
          {t('me.feed.renew')}
        </button>
      )}
      {confirm && (
        <div className="mt-3 rounded-box border border-line px-4 py-3">
          <p className="text-[13px] leading-relaxed text-ink-2">{t('me.feed.renewConfirm')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" type="button" disabled={busy} onClick={issue}>
              {busy ? t('common.processing') : t('me.feed.renewYes')}
            </Button>
            <Button size="sm" tone="quiet" type="button" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </Button>
          </div>
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

function AlertsSection({ email, onError }: { email: string; onError: (e: unknown) => void }) {
  const { t } = useLang();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    getAlertPrefs().then((p) => alive && setOn(p?.saved_races ?? false), onError);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function flip() {
    if (on == null) return;
    const next = !on;
    setBusy(true);
    setErr('');
    setOn(next);
    try {
      const p = await setSavedAlerts(next);
      setOn(p.saved_races);
    } catch (e) {
      setOn(!next);
      if (isMemberNotReady(e)) onError(e);
      else setErr(t('me.alerts.fail'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={section}>
      <h3 className={h3}>{t('me.alerts.title')}</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{t('me.alerts.text')}</p>
      <button
        type="button"
        role="switch"
        aria-checked={!!on}
        disabled={on == null || busy}
        onClick={flip}
        className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-box border border-line px-4 py-2 text-left transition hover:bg-sunken disabled:opacity-60"
      >
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold text-ink">{t('me.alerts.label')}</span>
          <span className="block truncate text-[13px] text-ink-3">{on ? t('me.alerts.on', { email }) : t('me.alerts.off')}</span>
        </span>
        <span
          aria-hidden
          className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-line'}`}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full border border-line bg-bg shadow-sm transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
          />
        </span>
      </button>
      {err && (
        <div className="mt-3">
          <Note tone="error">{err}</Note>
        </div>
      )}
    </section>
  );
}
