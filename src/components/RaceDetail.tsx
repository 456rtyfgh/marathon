import { useState } from 'react';
import { ArrowUpRight, CalendarPlus, LinkSimple, Check, BookmarkSimple, CheckSquare, Square } from '@phosphor-icons/react';
import { calDates, calLabel, googleCalUrl, openIcs, openOutside, type CalKind } from '../lib/ics';
import { track } from '../lib/analytics';
import type { Race, Agency, Package, CostBaseline, RaceRating } from '../lib/types';
import { useLang, langPath, type Key } from '../i18n';
import { CONFIDENCE_TEXT, COURSE_TEXT, DIST_TEXT, ENTRY_TEXT, fmtNumber } from '../i18n/format';
import { raceName, whereText } from '../i18n/names';
import {
  TODAY,
  fmtDate,
  feeLabel,
  feeToKrw,
  krw,
  isDomestic,
  statusLine,
  raceDayLine,
  entryStatus,
  isSoldOut,
  mayFillEarly,
  isTrail,
  dateParts,
  isSearchLink,
  safeUrl,
  isCancelled,
  noteText,
  isEntryConfirmed,
  expectedEntryText,
  monthDay,
} from '../lib/util';
import CostCalculator from './CostCalculator';
import PackageTable from './PackageTable';
import AlertForm from './AlertForm';
import ReviewsTab from './ReviewsTab';
import SimilarRaces from './SimilarRaces';
import { Button, CloseButton, Input, Note, Tabs } from './ui';
import { useAuth } from '../lib/auth';
import { submitSoldOutReport } from '../lib/data';
import { spamReason, friendlyError } from '../lib/spam';

const dday = (n: number) => (n === 0 ? 'D-DAY' : `D-${n}`);

type Tab = 'overview' | 'reviews' | 'packages' | 'cost' | 'alert';

export default function RaceDetail({
  race,
  agencies,
  packages,
  costs,
  rating,
  favorite,
  onToggleFavorite,
  registered,
  onToggleRegistered,
  onClose,
  onLogin,
  races,
  ratingMap,
  isFavorite,
  isRegistered,
  onOpenRace,
}: {
  race: Race;
  agencies: Agency[];
  packages: Package[];
  costs: CostBaseline[];
  rating?: RaceRating;
  favorite: boolean;
  onToggleFavorite: () => void;
  registered: boolean;
  onToggleRegistered: () => void;
  onClose: () => void;
  onLogin: () => void;
  /** 아래 다섯 개는 '비슷한 대회' 용. races 가 없으면 그 구역을 그리지 않는다 */
  races?: Race[];
  ratingMap?: Map<string, RaceRating>;
  isFavorite?: (id: string) => boolean;
  isRegistered?: (id: string) => boolean;
  onOpenRace?: (race: Race) => void;
}) {
  const { lang, t } = useLang();
  const [tab, setTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);
  const [calOpen, setCalOpen] = useState(false);

  async function share() {
    track('share', { race_id: race.id });
    const url = `${location.origin}${langPath(`/r/${encodeURIComponent(race.id)}`, lang)}`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await nav.share({ title: raceName(race, lang), url });
        return;
      } catch {
        /* 사용자가 취소 */
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      prompt(t('detail.copyPrompt'), url);
    }
  }
  const today = TODAY();
  const raceDay = raceDayLine(race, today, lang);
  const st = statusLine(race, today, registered, lang);
  const soldOut = isSoldOut(race, today) ? dateParts(race.sold_out_on!, lang) : null;
  // 예상 접수일은 '미정' 으로 보이고 작은 글씨로만 '예상 M/D~M/D'. 이미 끝난·취소된 대회는 예전처럼 날짜 그대로
  const entryConfirmed = isEntryConfirmed(race) || raceDay.days == null;
  const expectedText = expectedEntryText(race, today, lang);
  // 정원이 차서 끝나는 건 선착순·상시 접수뿐. 추첨·기록 기준 대회는 제보 대상이 아니다
  const canReport =
    raceDay.days != null && (race.entry_type === 'fcfs' || race.entry_type === 'open') && entryStatus(race, today) === 'open';
  const trail = isTrail(race);
  const p = dateParts(race.race_date, lang);
  const feeKrw = feeToKrw(race);
  const racePackages = packages.filter((x) => x.race_id === race.id);
  const domestic = isDomestic(race);
  const reviewCount = rating?.review_count ?? 0;
  // 취소된 대회: D-day·접수 상태 대신 취소 안내, 캘린더 저장·알림 신청은 닫는다
  const cancelled = isCancelled(race);
  const note = noteText(race, lang);
  const entryLabel = ENTRY_TEXT[lang][race.entry_type];
  const view: Tab = cancelled && tab === 'alert' ? 'overview' : tab;

  return (
    <div className="flex h-full flex-col">
      {/* 머리 */}
      <header className="px-5 pt-4 pb-5 sm:px-7">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-ink-2">
            {lang === 'en'
              ? domestic
                ? t('detail.domestic', { city: whereText(race, 'en') })
                : whereText(race, 'en')
              : domestic
                ? `국내, ${race.city_ko}`
                : `${race.country_ko} ${race.city_ko}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (!favorite) track('favorite', { race_id: race.id });
                onToggleFavorite();
              }}
              aria-pressed={favorite}
              className={`inline-flex h-11 items-center gap-1.5 rounded-ctl px-3 text-[14px] sm:h-9 font-semibold transition active:translate-y-px ${
                favorite ? 'bg-ink text-bg' : 'text-ink-2 hover:bg-sunken hover:text-ink'
              }`}
            >
              <BookmarkSimple size={16} weight={favorite ? 'fill' : 'bold'} />
              {favorite ? t('detail.saved') : t('detail.save')}
            </button>
            <CloseButton onClick={onClose} />
          </div>
        </div>

        <h2 className="mt-2 text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">
          {raceName(race, lang)}
          {trail && (
            <span className="ml-2 inline-block translate-y-[-4px] rounded-tag border border-ink-3 px-1.5 py-px align-middle text-[11px] font-bold text-ink-2">
              {t('row.trail')}
            </span>
          )}
          {race.is_major && (
            <span className="ml-2 inline-block translate-y-[-4px] rounded-tag bg-ink px-1.5 py-0.5 align-middle text-[11px] font-bold text-bg">
              {t('row.major')}
            </span>
          )}
        </h2>
        {/* 한국어 화면은 영문 이름을 덧붙인다. 영어 화면은 제목이 이미 영문 이름이라 비운다(한글을 섞지 않게) */}
        <p className="mt-0.5 text-[14px] text-ink-3">{lang === 'en' ? null : race.name_en}</p>

        {cancelled ? (
          <div className="mt-5 rounded-box border border-line bg-surface px-4 py-3.5">
            <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
              <span className="text-[22px] leading-tight font-bold">{t('detail.cancelled')}</span>
              <span className="num text-[14px] text-ink-3">
                {t('detail.wasScheduled', { m: p.m, d: p.d, w: p.w, mon: p.mon })}
              </span>
            </div>
            <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-ink-2">
              {t('detail.cancelledPre')}{' '}
              <a
                href={safeUrl(race.official_url)}
                onClick={() => track('official_click', { race_id: race.id, search: isSearchLink(race.official_url), cancelled: true })}
                target="_blank"
                rel="noreferrer"
                className="font-semibold whitespace-nowrap text-ink underline decoration-ink-3 underline-offset-4 hover:decoration-ink"
              >
                {t('detail.cancelledLink')}
              </a>
              {t('detail.cancelledPost')}
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-box bg-line">
            <div className="bg-surface px-4 py-3">
              <div className="text-[13px] text-ink-3">
                {t('detail.raceDay')} <span className="num">{t('detail.raceDate', { m: p.m, d: p.d, mon: p.mon })}</span> {p.w}
              </div>
              <div className="num mt-0.5 text-[26px] leading-none font-bold">
                {raceDay.days != null ? dday(raceDay.days) : t('detail.over')}
              </div>
              <div className="mt-1 text-[13px] text-ink-3">
                {raceDay.label}
                {race.date_confidence !== 'confirmed' && t('detail.dateConf', { c: CONFIDENCE_TEXT[lang][race.date_confidence].toLowerCase() })}
              </div>
            </div>
            {registered ? (
              <div className="bg-surface px-4 py-3">
                <div className="text-[13px] text-ink-3">{t('detail.entry')}</div>
                <div className="mt-0.5 inline-flex items-center gap-1 text-[24px] leading-none font-bold">
                  <Check size={20} weight="bold" />
                  {t('detail.done')}
                </div>
                <div className="mt-1 text-[13px] text-ink-3">{entryLabel}</div>
              </div>
            ) : (
              <div className={`px-4 py-3 ${st.hot ? 'bg-accent text-on-accent' : 'bg-surface'}`}>
                <div className={`text-[13px] ${st.hot ? 'opacity-85' : 'text-ink-3'}`}>{st.label}</div>
                <div className={`mt-0.5 text-[26px] leading-none font-bold ${soldOut ? '' : 'num'}`}>
                  {st.days != null ? dday(st.days) : soldOut ? t('detail.closedShort') : '-'}
                </div>
                <div className={`mt-1 text-[13px] ${st.hot ? 'opacity-85' : 'text-ink-3'}`}>
                  {soldOut ? (
                    t('detail.soldOutOn', { m: soldOut.m, d: soldOut.d, mon: soldOut.mon })
                  ) : (
                    <>
                      {entryLabel}
                      {expectedText
                        ? `, ${expectedText}`
                        : race.entry_confidence !== 'confirmed' &&
                          t('detail.entryConf', { c: CONFIDENCE_TEXT[lang][race.entry_confidence].toLowerCase() })}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 취소된 대회는 새로 체크하지 않게 숨기되, 이미 체크했으면 풀 수 있게 남긴다 */}
        {(raceDay.days != null || (cancelled && registered)) && (
          <button
            onClick={() => {
              if (!registered) track('registered', { race_id: race.id });
              onToggleRegistered();
            }}
            aria-pressed={registered}
            className={`mt-3 inline-flex h-11 items-center gap-2 rounded-ctl px-3.5 text-[14px] font-semibold transition active:translate-y-px sm:h-9 ${
              registered ? 'bg-ink text-bg' : 'bg-surface text-ink hover:bg-sunken'
            }`}
          >
            {registered ? <CheckSquare size={18} weight="fill" /> : <Square size={18} weight="bold" />}
            {registered ? t('detail.registered') : t('detail.register')}
            <span className={`text-[13px] font-normal ${registered ? 'opacity-70' : 'text-ink-3'}`}>
              {cancelled ? t('detail.unregister') : registered ? t('detail.byRaceDay') : t('detail.registerHint')}
            </span>
          </button>
        )}
      </header>

      <Tabs<Tab>
        value={view}
        onChange={(t) => {
          setTab(t);
          track('race_tab', { race_id: race.id, tab: t });
        }}
        items={[
          ['overview', t('tab.overview')],
          ['reviews', reviewCount ? t('tab.reviewsN', { n: reviewCount }) : t('tab.reviews')],
          ['packages', racePackages.length ? t('tab.packagesN', { n: racePackages.length }) : t('tab.packages')],
          ['cost', t('tab.cost')],
          ...(cancelled ? [] : ([['alert', t('tab.alert')]] as [Tab, string][])),
        ]}
      />

      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
        {view === 'overview' && (
          <div className="space-y-7">
            <section>
              <h3 className="text-[15px] font-bold">{t('detail.entryHead', { type: entryLabel })}</h3>
              <p className="mt-1 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{t(`entryDesc.${race.entry_type}` as Key)}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {entryConfirmed ? (
                  <Fact label={t('detail.opens')} value={race.entry_opens ? fmtDate(race.entry_opens, lang) : t('fee.tba')} />
                ) : (
                  <Fact
                    label={t('detail.opens')}
                    value={t('detail.tbc')}
                    sub={race.entry_opens ? t('detail.expectedOn', { d: monthDay(race.entry_opens, lang) }) : undefined}
                  />
                )}
                {soldOut ? (
                  <Fact
                    label={t('detail.closes')}
                    value={t('detail.soldOutOn', { m: soldOut.m, d: soldOut.d, mon: soldOut.mon })}
                    sub={
                      race.entry_closes && race.sold_out_on! < race.entry_closes
                        ? t('detail.originalClose', { d: fmtDate(race.entry_closes, lang) })
                        : undefined
                    }
                  />
                ) : entryConfirmed ? (
                  <Fact label={t('detail.closes')} value={race.entry_closes ? fmtDate(race.entry_closes, lang) : t('detail.closesWhenFull')} />
                ) : (
                  <Fact
                    label={t('detail.closes')}
                    value={t('detail.tbc')}
                    sub={race.entry_closes ? t('detail.expectedOn', { d: monthDay(race.entry_closes, lang) }) : undefined}
                  />
                )}
              </dl>
              {!registered && mayFillEarly(race, today) && (
                <div className="mt-3 max-w-[60ch] rounded-box border border-line px-4 py-3">
                  <p className="text-[14px] font-semibold">{t('detail.mayFillTitle')}</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-ink-2">{t('detail.mayFillText')}</p>
                </div>
              )}
              {canReport && <SoldOutReport key={race.id} race={race} onLogin={onLogin} />}
            </section>

            <dl className="grid grid-cols-2 gap-3">
              <Fact
                label={t('detail.fee')}
                value={feeLabel(race, lang)}
                sub={feeKrw && race.entry_fee_currency !== 'KRW' ? t('detail.feeKrw', { v: krw(feeKrw, lang) }) : undefined}
                num
              />
              <Fact label={t('detail.distances')} value={lang === 'en' ? race.distances.map(DIST_TEXT.en).join(', ') : race.distances.join(', ')} />
              {trail ? (
                <Fact
                  label={t('detail.gain')}
                  value={race.elevation_gain != null ? `${race.elevation_gain.toLocaleString(lang === 'en' ? 'en-US' : 'ko-KR')}m` : '-'}
                  num
                />
              ) : (
                <Fact label={t('detail.course')} value={race.course ? COURSE_TEXT[lang][race.course] : '-'} />
              )}
              <Fact label={t('detail.field')} value={race.field_size ? t('detail.fieldN', { n: fmtNumber(race.field_size, lang) }) : '-'} num />
              <Fact
                label={domestic ? t('row.fromSeoul') : t('row.fromIncheon')}
                value={race.flight_hours != null ? t('detail.flight', { n: race.flight_hours }) : '-'}
                num
              />
              <Fact label={t('detail.verified')} value={race.last_verified} num />
            </dl>

            {note && (
              <p className="max-w-[60ch] border-l-2 border-ink pl-4 text-[15px] leading-relaxed text-ink-2">
                {note}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <a
                href={safeUrl(race.official_url)}
                onClick={() => track('official_click', { race_id: race.id, search: isSearchLink(race.official_url) })}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-ctl bg-ink px-4 text-sm font-semibold text-bg transition hover:opacity-85"
              >
                {isSearchLink(race.official_url) ? t('detail.officialSearch') : t('detail.official')} <ArrowUpRight size={15} weight="bold" />
              </a>
              {!cancelled && (
                <button
                  onClick={() => setCalOpen((v) => !v)}
                  aria-expanded={calOpen}
                  className={`inline-flex h-10 items-center gap-1.5 rounded-ctl px-3.5 text-sm font-semibold transition active:translate-y-px ${
                    calOpen ? 'bg-ink text-bg' : 'bg-surface text-ink hover:bg-sunken'
                  }`}
                >
                  <CalendarPlus size={16} weight="bold" /> {calDates(race).length === 1 ? t('detail.calRaceOnly') : t('detail.cal')}
                </button>
              )}
              <button
                onClick={share}
                className="inline-flex h-10 items-center gap-1.5 rounded-ctl bg-surface px-3.5 text-sm font-semibold text-ink transition hover:bg-sunken active:translate-y-px"
              >
                {copied ? <Check size={16} weight="bold" /> : <LinkSimple size={16} weight="bold" />}
                {copied ? t('detail.copied') : t('detail.share')}
              </button>
              {race.source_url && (
                <a
                  href={safeUrl(race.source_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 inline-flex h-10 items-center text-sm font-semibold text-ink-2 underline decoration-line underline-offset-4 hover:text-ink"
                >
                  {t('detail.source')}
                </a>
              )}
            </div>
            {calOpen && !cancelled && <CalendarPicker race={race} />}

            <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-3">{t('detail.disclaimer')}</p>

            {races && onOpenRace && (
              <SimilarRaces
                race={race}
                races={races}
                ratingMap={ratingMap}
                isFavorite={isFavorite}
                isRegistered={isRegistered}
                onOpen={onOpenRace}
              />
            )}
          </div>
        )}

        {view === 'reviews' && <ReviewsTab race={race} onLogin={onLogin} />}
        {view === 'packages' && <PackageTable packages={racePackages} agencies={agencies} />}
        {view === 'cost' && <CostCalculator race={race} costs={costs} />}
        {view === 'alert' && <AlertForm race={race} />}
      </div>
    </div>
  );
}

function Fact({ label, value, sub, num }: { label: string; value: string; sub?: string; num?: boolean }) {
  return (
    <div className="rounded-box bg-surface px-4 py-3">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className={`mt-0.5 font-semibold text-ink ${num ? 'num text-[20px]' : 'text-[15px]'}`}>{value}</dd>
      {sub && <dd className="text-[13px] text-ink-3">{sub}</dd>}
    </div>
  );
}

/** 대회 날·접수 시작·접수 마감을 각각 골라 구글 캘린더 또는 휴대폰 기본 캘린더에 넣는다 */
function CalendarPicker({ race }: { race: Race }) {
  const { lang, t } = useLang();
  const dates = calDates(race);
  const save = (kind: CalKind | 'all', target: 'google' | 'ics') => {
    track('calendar_add', { race_id: race.id, kind, target });
    if (target === 'google') openOutside(googleCalUrl(race, kind as CalKind, lang));
    else openIcs(race, kind === 'all' ? dates.map((d) => d.kind) : [kind], lang);
  };
  const btn =
    'inline-flex h-9 items-center rounded-ctl bg-bg px-3 text-[13px] font-semibold text-ink transition hover:bg-sunken active:translate-y-px';
  return (
    <div className="-mt-3 rounded-box bg-surface p-4">
      <ul className="divide-y divide-line">
        {dates.map((d) => (
          <li key={d.kind} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0">
            <span className="text-[15px]">
              <strong className="font-semibold">{calLabel(d.kind, lang)}</strong>
              <span className="ml-2 text-ink-2">{fmtDate(d.date, lang)}</span>
            </span>
            <span className="flex gap-1.5">
              <button className={btn} onClick={() => save(d.kind, 'google')}>
                {t('cal.google')}
              </button>
              <button className={btn} onClick={() => save(d.kind, 'ics')}>
                {t('cal.ics')}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {dates.length > 1 && (
        <button
          onClick={() => save('all', 'ics')}
          className="mt-2 inline-flex h-9 items-center rounded-ctl bg-ink px-3 text-[13px] font-semibold text-bg transition hover:opacity-85"
        >
          {t('cal.all', { list: dates.map((d) => calLabel(d.kind, lang).toLowerCase()).join(t('cal.allSep')) })}
        </button>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
        {dates.length > 1 ? t('cal.reminder') : race.sold_out_on ? t('cal.soldOnly') : t('cal.raceOnly')}
        {t('cal.kakao')}
      </p>
    </div>
  );
}

const REPORTED_KEY = 'marathon-cal:soldout-reported';
const reportedIds = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(REPORTED_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** '마감됐어요 제보' — 대회 추가 요청과 같은 표(race_requests)·같은 로그인·하루 제한 규칙 */
function SoldOutReport({ race, onLogin }: { race: Race; onLogin: () => void }) {
  const { session, profile } = useAuth();
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(() => reportedIds().includes(race.id));
  const [justSent, setJustSent] = useState(false);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!session) return onLogin();
    const spam = spamReason(memo, lang);
    if (spam) return setErr(spam);
    setBusy(true);
    try {
      await submitSoldOutReport(race, session.user.id, profile?.nickname ?? t('common.runner'), memo);
      track('soldout_report', { race_id: race.id });
      try {
        localStorage.setItem(REPORTED_KEY, JSON.stringify([...reportedIds(), race.id].slice(-200)));
      } catch {
        /* 저장 못 해도 제보는 들어감 */
      }
      setDone(true);
      setJustSent(true);
      setOpen(false);
    } catch (e2) {
      const m = friendlyError(e2, t('report.fail'), lang);
      // DB 의 하루 제한은 '대회 추가 요청' 과 같이 센다 (스키마는 그대로)
      setErr(m.includes(t('spam.daily')) ? t('report.limit', { m }) : m);
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return justSent ? (
      <div className="mt-3">
        <Note tone="ok">{t('report.thanks')}</Note>
      </div>
    ) : (
      <p className="mt-3 text-[13px] text-ink-3">{t('report.sent')}</p>
    );

  if (!open)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button tone="quiet" size="sm" type="button" onClick={() => (session ? setOpen(true) : onLogin())}>
          {t('report.button')}
        </Button>
        <span className="text-[13px] text-ink-3">{t('report.hint')}</span>
      </div>
    );

  return (
    <form onSubmit={send} className="mt-3 max-w-[60ch] space-y-2 rounded-box bg-surface p-4">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">
          {t('report.where')} <span className="font-normal text-ink-3">{t('common.optional')}</span>
        </span>
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} placeholder={t('report.placeholder')} />
      </label>
      {err && <Note tone="error">{err}</Note>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={busy}>
          {busy ? t('common.sending') : t('report.submit')}
        </Button>
        <Button size="sm" tone="quiet" type="button" onClick={() => setOpen(false)}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
