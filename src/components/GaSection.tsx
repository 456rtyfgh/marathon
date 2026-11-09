import { useEffect, useId, useState } from 'react';
import { Button, Note } from './ui';
import { useLang, type Key, type T } from '../i18n';
import { ko } from '../i18n/ko';
import { GA_RANGES, type GaDay, type GaMetric, type GaRange, type GaRealtime, type GaReportResponse, type GaRow, type GaTotals } from '../lib/gaTypes';
import { GaFetchError, fetchGaRealtime, fetchGaReport } from '../lib/gaClient';
import { deltaPct, fmtClock, fmtDay, fmtDelta, fmtDuration, fmtNum, fmtRate } from '../lib/gaFormat';

/**
 * 관리 → 통계 탭의 GA4 숫자 (PLAN 3절). 같은 출처 /api/admin/ga 가 서비스 계정으로 구글을 부르고 여기서는 그 JSON 만 그린다.
 * 기존 자체 통계(Stats) 와는 형제로 따로 렌더된다 — 한쪽이 오류여도 다른 쪽은 보인다.
 */

const hasKey = (k: string): k is Key => k in ko;

function errText(e: unknown, t: T): string {
  if (e instanceof GaFetchError && !e.fromServer) return e.status === 0 ? t('ga.err.login') : t('ga.err.http', { status: e.status });
  return e instanceof Error ? e.message : String(e);
}

const CARDS: [keyof GaTotals, Key][] = [
  ['activeUsers', 'ga.card.activeUsers'],
  ['newUsers', 'ga.card.newUsers'],
  ['sessions', 'ga.card.sessions'],
  ['engagementPerUser', 'ga.card.engagementPerUser'],
  ['engagementRate', 'ga.card.engagementRate'],
  ['pageViews', 'ga.card.pageViews'],
];

export default function GaSection() {
  const { lang, t } = useLang();
  const [range, setRange] = useState<GaRange>('28d');
  const [nonce, setNonce] = useState(0);
  const key = `${range}:${nonce}`;
  // key 가 지금 것과 다르면 불러오는 중 (이전 기간 숫자는 흐리게 남겨 둔다)
  const [st, setSt] = useState<{ key: string; data?: GaReportResponse; err?: unknown }>({ key: '' });
  useEffect(() => {
    const ctrl = new AbortController();
    fetchGaReport(range, ctrl.signal).then(
      (data) => setSt({ key, data }),
      (err) => {
        if (!ctrl.signal.aborted) setSt({ key, err });
      },
    );
    return () => ctrl.abort();
  }, [key, range]);

  const loading = st.key !== key;
  const data = st.data;
  const report = data?.configured ? data : null;

  return (
    <section aria-labelledby="ga-title" className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h3 id="ga-title" className="mr-auto text-[19px] font-bold">
            {t('ga.title')}
          </h3>
          <div role="group" aria-label={t('ga.rangeLabel')} className="flex gap-1.5">
            {GA_RANGES.map((r) => (
              <Button
                key={r}
                size="sm"
                tone="quiet"
                aria-pressed={r === range}
                className={r === range ? 'ring-2 ring-inset ring-ink' : ''}
                onClick={() => setRange(r)}
              >
                {t(`ga.range.${r}`)}
              </Button>
            ))}
          </div>
        </div>
        {report && (
          <p className="text-[13px] leading-relaxed text-ink-3">
            {t('ga.period', {
              start: fmtDay(report.period.start, lang),
              end: fmtDay(report.period.end, lang),
              prevStart: fmtDay(report.period.prevStart, lang),
              prevEnd: fmtDay(report.period.prevEnd, lang),
            })}{' '}
            · {loading ? t('ga.loading') : t('ga.updated', { time: fmtClock(report.fetchedAt, lang) })}
          </p>
        )}
      </div>

      {loading && !data ? (
        <p className="text-[15px] text-ink-3">{t('ga.loading')}</p>
      ) : !loading && st.err ? (
        <div className="space-y-3">
          <Note tone="error">{errText(st.err, t)}</Note>
          <Button tone="quiet" onClick={() => setNonce((n) => n + 1)}>
            {t('ga.retry')}
          </Button>
        </div>
      ) : data && !data.configured ? (
        <Note>{t('ga.unconfigured')}</Note>
      ) : report ? (
        <div aria-busy={loading} className={`space-y-7 transition-opacity ${loading ? 'opacity-50' : ''}`}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {CARDS.map(([k, label]) => (
              <div key={k} className="min-w-0 rounded-box bg-surface px-4 py-3">
                <dt className="text-[13px] leading-snug text-ink-3">{t(label)}</dt>
                <dd className="mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="num text-[26px] leading-none font-bold">{cardValue(k, report.totals[k].value, lang)}</span>
                  <Delta m={report.totals[k]} />
                </dd>
              </div>
            ))}
          </dl>

          <Realtime />

          <Trend days={report.daily} />

          <div className="grid gap-6 lg:grid-cols-2">
            <RankList title={t('ga.t.channels')} col={t('ga.col.sessions')} rows={report.channels} />
            <RankList title={t('ga.t.sourceMedium')} col={t('ga.col.sessions')} rows={report.sourceMedium} />
            <RankList title={t('ga.t.countries')} col={t('ga.col.users')} rows={report.countries} />
            <RankList
              title={t('ga.t.devices')}
              col={t('ga.col.users')}
              rows={report.devices.map((r) => {
                const k = `ga.device.${r.label.toLowerCase()}`;
                return hasKey(k) ? { ...r, label: t(k) } : r;
              })}
            />
            <RankList title={t('ga.t.pages')} col={t('ga.col.views')} rows={report.pages} wrap />
            <RankList
              title={t('ga.t.events')}
              col={t('ga.col.count')}
              rows={report.events.map((r) => {
                const k = `ga.event.${r.label}`;
                return hasKey(k) ? { label: t(k), extra: r.label, value: r.value } : r;
              })}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function cardValue(k: keyof GaTotals, v: number, lang: 'ko' | 'en'): string {
  if (k === 'engagementPerUser') return fmtDuration(v, lang);
  if (k === 'engagementRate') return fmtRate(v);
  return fmtNum(v, lang);
}

/** 직전 기간 대비 ▲/▼ % — 색만으로 구분하지 않게 화살표 글자를 붙인다 */
function Delta({ m }: { m: GaMetric }) {
  const { t } = useLang();
  const p = deltaPct(m);
  if (p === null)
    return (
      <span className="text-[13px] font-semibold text-ink-3" title={t('ga.delta.none')}>
        <span aria-hidden>—</span>
        <span className="sr-only">{t('ga.delta.none')}</span>
      </span>
    );
  const s = fmtDelta(p);
  const pct = s.replace(/^[+-]/, '');
  const kind = s === '0.0%' ? 'flat' : p > 0 ? 'up' : 'down';
  const cls = kind === 'up' ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2';
  return (
    <span className={`num rounded-tag px-1.5 py-0.5 text-[13px] leading-none font-bold whitespace-nowrap ${cls}`}>
      <span aria-hidden>
        {kind === 'up' ? '▲ ' : kind === 'down' ? '▼ ' : ''}
        {s}
      </span>
      <span className="sr-only">{kind === 'flat' ? t('ga.delta.flat') : t(kind === 'up' ? 'ga.delta.up' : 'ga.delta.down', { pct })}</span>
    </span>
  );
}

/** 일별 활성 사용자(실선)·세션(점선). 외부 라이브러리 없이 SVG, 폭은 부모를 따라 늘어난다 */
function Trend({ days }: { days: GaDay[] }) {
  const { lang, t } = useLang();
  const titleId = useId();
  if (!days.length) return null;
  const W = 300;
  const H = 100;
  const max = Math.max(1, ...days.map((d) => Math.max(d.activeUsers, d.sessions)));
  const pts = days.length === 1 ? [days[0], days[0]] : days;
  const line = (k: 'activeUsers' | 'sessions') =>
    pts.map((d, i) => `${((i / (pts.length - 1)) * W).toFixed(2)},${(H - (d[k] / max) * H).toFixed(2)}`).join(' ');
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const swatch = (dash: boolean, color: string) => (
    <svg width="18" height="6" aria-hidden className="shrink-0">
      <line x1="0" y1="3" x2="18" y2="3" style={{ stroke: color }} strokeWidth="2" strokeDasharray={dash ? '4 3' : undefined} />
    </svg>
  );

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="text-[15px] font-bold">{t('ga.daily')}</h4>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            {swatch(false, 'var(--ink)')}
            {t('ga.daily.users')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            {swatch(true, 'var(--ink-3)')}
            {t('ga.daily.sessions')}
          </span>
        </p>
      </div>
      <div className="flex gap-2">
        <div className="num flex h-32 shrink-0 flex-col justify-between text-right text-[12px] leading-none text-ink-3" aria-hidden>
          <span>{fmtNum(max, lang)}</span>
          <span>0</span>
        </div>
        <div className="min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            role="img"
            aria-labelledby={titleId}
            className="block h-32 w-full overflow-visible"
          >
            <title id={titleId}>{t('ga.daily.aria', { start: fmtDay(first, lang), end: fmtDay(last, lang), max: fmtNum(max, lang) })}</title>
            {[0, H / 2, H].map((y) => (
              <line key={y} x1="0" y1={y} x2={W} y2={y} style={{ stroke: 'var(--line)' }} strokeWidth="1" vectorEffect="non-scaling-stroke" />
            ))}
            <polyline
              points={line('sessions')}
              fill="none"
              style={{ stroke: 'var(--ink-3)' }}
              strokeWidth="1.5"
              strokeDasharray="4 3"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <polyline
              points={line('activeUsers')}
              fill="none"
              style={{ stroke: 'var(--ink)' }}
              strokeWidth="2"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <p className="mt-1.5 flex justify-between text-[12px] text-ink-3">
            <span>{fmtDay(first, lang)}</span>
            <span>{fmtDay(last, lang)}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

/** 표 한 덩어리: 값 막대가 깔린 순위 목록 (기존 Stats 목록과 같은 모양). wrap = 긴 경로를 줄바꿈해 다 보인다 */
function RankList({ title, col, rows, wrap }: { title: string; col: string; rows: GaRow[]; wrap?: boolean }) {
  const { lang, t } = useLang();
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h4 className="text-[15px] font-bold">{title}</h4>
        <span className="text-[12px] text-ink-3">{col}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[14px] text-ink-3">{t('ga.empty')}</p>
      ) : (
        <ol className="space-y-1">
          {rows.map((r, i) => (
            <li key={`${r.label}-${i}`} className="relative overflow-hidden rounded-ctl bg-surface px-3 py-1.5 text-[14px]">
              <span className="absolute inset-y-0 left-0 bg-sunken" style={{ width: `${(r.value / max) * 100}%` }} />
              <span className="relative flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className={`block ${wrap ? 'break-all' : 'truncate'}`} title={r.label}>
                    {r.label}
                  </span>
                  {r.extra && (
                    <span className="block truncate text-[12px] text-ink-3" title={r.extra}>
                      {r.extra}
                    </span>
                  )}
                </span>
                <span className="num shrink-0 text-[15px] font-semibold">{fmtNum(r.value, lang)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * 최근 30분 접속. 이 컴포넌트가 화면에 있고 탭이 보일 때만 30초마다 부른다 —
 * 언마운트(관리 패널 닫힘·다른 탭)·브라우저 탭 숨김이면 타이머를 멈추고 진행 중 요청을 끊는다.
 */
function Realtime() {
  const { lang, t } = useLang();
  const [data, setData] = useState<GaRealtime | null>(null);
  const [err, setErr] = useState<unknown>(null);

  useEffect(() => {
    let ctrl: AbortController | null = null;
    let timer: number | undefined;
    const load = () => {
      ctrl?.abort();
      const c = new AbortController();
      ctrl = c;
      fetchGaRealtime(c.signal).then(
        (r) => {
          if (c.signal.aborted || !r.configured) return;
          setData(r);
          setErr(null);
        },
        (e) => {
          if (!c.signal.aborted) setErr(e);
        },
      );
    };
    const start = () => {
      if (document.visibilityState !== 'visible' || timer !== undefined) return;
      load();
      timer = window.setInterval(load, 30_000);
    };
    const stop = () => {
      if (timer !== undefined) window.clearInterval(timer);
      timer = undefined;
      ctrl?.abort();
      ctrl = null;
    };
    const onVis = () => (document.visibilityState === 'visible' ? start() : stop());
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      stop();
    };
  }, []);

  return (
    <section aria-labelledby="ga-rt-title" className="space-y-4 rounded-box border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 id="ga-rt-title" className="text-[15px] font-bold">
          {t('ga.rt.title')}
        </h4>
        <p className="text-[12px] text-ink-3">
          {t('ga.rt.refresh')}
          {data && ` · ${t('ga.updated', { time: fmtClock(data.fetchedAt, lang) })}`}
        </p>
      </div>
      {err && !data ? (
        <Note tone="error">{errText(err, t)}</Note>
      ) : !data ? (
        <p className="text-[15px] text-ink-3">{t('ga.loading')}</p>
      ) : (
        <>
          <p aria-live="polite" className="flex items-baseline gap-1.5">
            <span className="num text-[34px] leading-none font-bold">{fmtNum(data.activeUsers, lang)}</span>
            <span className="text-[14px] text-ink-2">{t('ga.rt.users', { count: data.activeUsers })}</span>
          </p>
          {err ? <Note tone="error">{errText(err, t)}</Note> : null}
          <div className="grid gap-5 sm:grid-cols-2">
            <RankList title={t('ga.rt.countries')} col={t('ga.col.users')} rows={data.countries} />
            <RankList title={t('ga.rt.pages')} col={t('ga.col.users')} rows={data.pages} />
          </div>
        </>
      )}
    </section>
  );
}
