import { brandText, isRunEvent, kindsText, runEventMeta, RUN_EVENT_TEXT, stripRunEventHead } from '../lib/runEvent';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Bell, CalendarPlus, LinkSimple, Check, BookmarkSimple, CheckSquare, Square } from '@phosphor-icons/react';
import { calDates, calLabel, googleCalUrl, openOutside, type CalKind } from '../lib/ics';
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
  fmtDateShort,
  fmtDateShortWd,
  isSearchLink,
  safeUrl,
  isCancelled,
  noteText,
  isEntryConfirmed,
  expectedEntryText,
  monthDay,
  majorKind,
} from '../lib/util';
import { TONE_BADGE, TONE_TEXT, toneOf } from '../lib/statusTone';
import CostCalculator from './CostCalculator';
import PackageTable from './PackageTable';
import AlertForm from './AlertForm';
import ReviewsTab from './ReviewsTab';
import RaceTalkTab from '../community/RaceTalkTab';
import { COMMUNITY_TEXT } from '../community/strings';
import SimilarRaces from './SimilarRaces';
import RaceEditor, { EDIT_TAB_LABEL } from './RaceEditor';
import { Button, CloseButton, Field, Input, Note, Tabs, TimeInput, inputCls } from './ui';
import MemberGate, { type OnLogin } from './MemberGate';
import { useAuth } from '../lib/auth';
import { fetchRaceDetail, submitSoldOutReport, type RaceDetailData } from '../lib/data';
import { spamReason, friendlyError } from '../lib/spam';
import { distanceKm, downloadIcs, fmtFinish, parseFinish, type RaceRecord } from '../lib/member';
import type { GateAction } from '../lib/memberGate';
import type { RecordInput } from '../lib/registered';

const dday = (n: number) => (n === 0 ? 'D-DAY' : `D-${n}`);

type Tab = 'overview' | 'reviews' | 'talk' | 'packages' | 'cost' | 'alert' | 'edit';

interface RaceDetailProps {
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
  /** 로그인 시트 열기. intent 를 주면 로그인 뒤 그 대회·그 동작으로 이어진다 */
  onLogin: OnLogin;
  /** 로그인 뒤 이어 하기: 'cal' 캘린더 고르기 펼침, 'alert' 알림 탭, 'record' 기록 입력 펼침 */
  initialAction?: GateAction;
  /** 내 기록(회원). recordsReady = 계정과 맞춘 상태(아니면 저장 불가) */
  record?: RaceRecord;
  recordsReady?: boolean;
  onSaveRecord?: (r: RecordInput) => Promise<unknown>;
  onClearRecord?: (id: string) => Promise<unknown>;
  /** 아래 다섯 개는 '비슷한 대회' 용. races 가 없으면 그 구역을 그리지 않는다 */
  races?: Race[];
  ratingMap?: Map<string, RaceRating>;
  isFavorite?: (id: string) => boolean;
  isRegistered?: (id: string) => boolean;
  onOpenRace?: (race: Race) => void;
  /** 관리자 '수정' 탭에서 저장한 뒤 (DB 에서 다시 읽은 값) */
  onRaceSaved?: (r: Race) => void;
}

/**
 * 목록 파일의 대회에는 상세 필드(공식 링크·메모·출처·코스·확인일)와 패키지·경비가 없다 → 열 때 fetchRaceDetail 로 받아
 * 목록 값 위에 덮어 그린다. DB 에서 바로 읽은 대회(관리자 등)는 전체 필드가 있어 바로 그린다
 * (official_url 이 빈 문자열인 대회도 있어 값이 아니라 키가 있는지로 본다).
 */
export default function RaceDetail(props: RaceDetailProps) {
  const { race } = props;
  const { t } = useLang();
  const hasDetail = 'official_url' in (race as object);
  const [detail, setDetail] = useState<RaceDetailData | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (hasDetail) return;
    let alive = true;
    fetchRaceDetail(race.id).then(
      (d) => alive && setDetail(d),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [race.id, hasDetail]);

  // 관리자 '수정' 저장 뒤엔 race 가 DB 에서 다시 읽은 전체 값이 된다 → 그 값을 쓰되 패키지·경비는 처음 받은 상세 그대로
  if (hasDetail && !detail) return <RaceDetailView {...props} />;
  if (!detail)
    return (
      <div className="relative h-full overflow-y-auto">
        <div className="sticky top-0 z-10 flex h-16 items-center justify-end bg-bg px-5 sm:h-14 sm:px-7">
          <CloseButton onClick={props.onClose} />
        </div>
        <p className="px-5 pt-1 text-[15px] text-ink-3 sm:px-7" role={failed ? 'alert' : 'status'}>
          {failed ? t('detail.loadError') : t('detail.loading')}
        </p>
      </div>
    );
  return (
    <RaceDetailView
      {...props}
      race={hasDetail ? race : { ...race, ...detail.race }}
      packages={detail.packages}
      agencies={detail.agencies}
      costs={detail.costs}
    />
  );
}

function RaceDetailView({
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
  initialAction,
  record,
  recordsReady = false,
  onSaveRecord,
  onClearRecord,
  races,
  ratingMap,
  isFavorite,
  isRegistered,
  onOpenRace,
  onRaceSaved,
}: RaceDetailProps) {
  const { lang, t } = useLang();
  const { session, profile } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  // 로그인 뒤 이어 하기 — 파일 받기 자체는 자동으로 하지 않고 고르는 화면까지만 연다 (prop 이 바뀔 때 렌더 중 상태 맞추기)
  const [seenAction, setSeenAction] = useState<GateAction | undefined>(undefined);
  if (initialAction !== seenAction) {
    setSeenAction(initialAction);
    if (initialAction === 'cal') {
      setTab('overview');
      setCalOpen(true);
    } else if (initialAction === 'alert') setTab('alert');
    else if (initialAction === 'record') setTab('overview');
  }
  // 패널 전체가 하나의 스크롤 상자: 위쪽 요약은 같이 올라가고 맨 윗줄(지역·관심·닫기)과 탭 줄만 붙어 있다
  const scrollRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLElement>(null);

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
  const soldOut = isSoldOut(race, today) ? race.sold_out_on! : null;
  // 예상 접수일은 '미정' 으로 보이고 작은 글씨로만 '예상 M/D~M/D'. 이미 끝난·취소된 대회는 예전처럼 날짜 그대로
  const entryConfirmed = isEntryConfirmed(race) || raceDay.days == null;
  const expectedText = expectedEntryText(race, today, lang);
  // 정원이 차서 끝나는 건 선착순·상시 접수뿐. 추첨·기록 기준 대회는 제보 대상이 아니다
  const canReport =
    raceDay.days != null && (race.entry_type === 'fcfs' || race.entry_type === 'open') && entryStatus(race, today) === 'open';
  const trail = isTrail(race);
  const major = majorKind(race);
  const feeKrw = feeToKrw(race);
  const racePackages = packages.filter((x) => x.race_id === race.id);
  const domestic = isDomestic(race);
  const reviewCount = rating?.review_count ?? 0;
  // 취소된 대회: D-day·접수 상태 대신 취소 안내, 캘린더 저장·알림 신청은 닫는다
  const cancelled = isCancelled(race);
  // 러닝 이벤트: undefined = 이벤트 아님, null = 이벤트지만 브랜드 머리말 없음
  const evMeta = isRunEvent(race) ? runEventMeta(race) : undefined;
  const evKinds = evMeta ? kindsText(evMeta.kinds, lang) : '';
  const note = evMeta !== undefined && lang === 'ko' ? stripRunEventHead(noteText(race, lang)) : noteText(race, lang);
  const entryLabel = ENTRY_TEXT[lang][race.entry_type];
  const isAdmin = !!profile?.is_admin;
  const view: Tab = (cancelled && tab === 'alert') || (!isAdmin && tab === 'edit') ? 'overview' : tab;

  // 위쪽 '관심' 버튼(PC)과 휴대폰 아래 고정 줄이 같이 쓴다
  const toggleFavorite = () => {
    if (!favorite) track('favorite', { race_id: race.id });
    onToggleFavorite();
  };
  /** 탭 바꾸기. toTabs = 탭 줄이 맨 위에 오게 내린다(휴대폰 아래 줄의 '알림' — 위쪽 요약에 가려 내용이 안 보이지 않게) */
  const goTab = (next: Tab, toTabs = false) => {
    setTab(next);
    if (next !== 'edit') track('race_tab', { race_id: race.id, tab: next }); // 관리자 '수정' 은 방문 통계에 넣지 않는다
    // 탭 줄이 이미 위에 붙어 있으면, 새 탭 내용이 첫머리부터 보이게 탭 줄 바로 아래로 맞춘다
    const box = scrollRef.current;
    const head = headRef.current;
    if (box && head && (toTabs || box.scrollTop > head.offsetHeight)) box.scrollTop = head.offsetHeight;
  };
  const officialLabel = isSearchLink(race.official_url) ? t('detail.officialSearch') : t('detail.official');

  return (
    // 휴대폰은 세로 flex: 내용이 짧은 탭에서도 아래 고정 줄(mt-auto)이 화면 맨 아래에 붙는다
    <div ref={scrollRef} className="relative h-full overflow-y-auto max-sm:flex max-sm:flex-col">
      {/* 맨 윗줄: 스크롤해도 붙어 있어 휴대폰에서도 닫기를 늘 누를 수 있다 (높이 64/56 = 아래 탭 줄의 top) */}
      <div className="sticky top-0 z-10 flex h-16 shrink-0 items-center justify-between gap-2 bg-bg px-5 sm:h-14 sm:px-7">
        <span className="line-clamp-2 min-w-0 text-[15px] leading-snug text-ink-2">
          {lang === 'en'
            ? domestic
              ? t('detail.domestic', { city: whereText(race, 'en') })
              : whereText(race, 'en')
            : domestic
              ? `국내, ${race.city_ko}`
              : `${race.country_ko} ${race.city_ko}`}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {/* 휴대폰에서는 아래 고정 줄에 있다(엄지 닿는 곳) — 여기는 640px 부터 */}
          <button
            onClick={toggleFavorite}
            aria-pressed={favorite}
            className={`hidden h-9 items-center gap-2 rounded-ctl px-3 text-[15px] font-semibold whitespace-nowrap transition active:translate-y-px sm:inline-flex ${
              favorite ? 'bg-surface text-ink shadow-[inset_0_0_0_2px_var(--ink)]' : 'text-ink-2 hover:bg-sunken hover:text-ink'
            }`}
          >
            <BookmarkSimple size={16} weight={favorite ? 'fill' : 'bold'} />
            {favorite ? t('detail.saved') : t('detail.save')}
          </button>
          <CloseButton onClick={onClose} />
        </div>
      </div>

      {/* 머리 */}
      <header ref={headRef} className="px-5 pt-1 pb-6 sm:px-7">
        <h2 className="text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">
          {raceName(race, lang)}
          {trail && (
            <span className="ml-2 inline-flex h-5 items-center rounded-tag border border-ink-3 px-2 align-middle text-[12px] font-bold tracking-normal whitespace-nowrap text-ink-2">
              {t('row.trail')}
            </span>
          )}
          {evMeta !== undefined && (
            <span className="ml-2 inline-flex h-5 items-center rounded-tag border border-ink-3 px-2 align-middle text-[12px] font-bold tracking-normal whitespace-nowrap text-ink-2">
              {RUN_EVENT_TEXT[lang].badge}
            </span>
          )}
          {major && (
            <span className="ml-2 inline-flex h-5 items-center rounded-tag bg-ink px-2 align-middle text-[12px] font-bold tracking-normal whitespace-nowrap text-bg">
              {t(major === 'korea' ? 'row.majorKorea' : 'row.majorWorld')}
            </span>
          )}
        </h2>
        {/* 한국어 화면은 영문 이름을 덧붙인다. 영어 화면은 제목이 이미 영문 이름이라 비운다(한글을 섞지 않게) */}
        <p className="mt-1 text-[15px] text-ink-3">{lang === 'en' ? null : race.name_en}</p>
        {major && <p className="mt-1 text-[15px] text-ink-2">{t(major === 'korea' ? 'detail.majorKorea' : 'detail.majorWorld')}</p>}

        {cancelled ? (
          <div className="mt-5 rounded-box border border-line bg-surface px-4 py-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className={`text-[20px] leading-tight font-bold ${TONE_TEXT.cancelled}`}>{t('detail.cancelled')}</span>
              <span className="text-[13px] text-ink-3">
                {t('detail.wasScheduled', { date: fmtDate(race.race_date, lang) })}
              </span>
            </div>
            <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">
              {t('detail.cancelledPre')}{' '}
              <a
                href={safeUrl(race.official_url)}
                onClick={() => track('official_click', { race_id: race.id, search: isSearchLink(race.official_url), cancelled: true })}
                target="_blank"
                rel="noreferrer"
                className="py-3.5 font-semibold whitespace-nowrap text-ink underline decoration-ink-3 underline-offset-4 hover:decoration-ink"
              >
                {t('detail.cancelledLink')}
              </a>
              {t('detail.cancelledPost')}
            </p>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-box bg-line">
            <div className={`${sumCell} bg-surface`}>
              <div className="text-[13px] text-ink-3">
                {t('detail.raceDay')} {t('detail.raceDate', { date: fmtDateShortWd(race.race_date, lang) })}
              </div>
              <div className="num text-[26px] leading-none font-bold">
                {raceDay.days != null ? dday(raceDay.days) : t('detail.over')}
              </div>
              <div className="text-[13px] text-ink-3">
                {raceDay.label}
                {race.date_confidence !== 'confirmed' && t('detail.dateConf', { c: CONFIDENCE_TEXT[lang][race.date_confidence].toLowerCase() })}
              </div>
            </div>
            {registered ? (
              <div className={`${sumCell} bg-surface`}>
                <div className="text-[13px] text-ink-3">{t('detail.entry')}</div>
                <div className="inline-flex items-center gap-1 text-[26px] leading-none font-bold">
                  <Check size={20} weight="bold" />
                  {t('detail.done')}
                </div>
                <div className="text-[13px] text-ink-3">{entryLabel}</div>
              </div>
            ) : (
              <div className={`${sumCell} ${st.hot ? 'bg-accent text-on-accent' : 'bg-surface'}`}>
                {/* 마감 임박(연두 칸)은 지금 모양, 그 밖엔 접수 상태별 색 배지 (색은 보조, 글자 그대로) */}
                {st.hot ? (
                  <div className="text-[13px] opacity-85">{st.label}</div>
                ) : (
                  <div>
                    <span
                      className={`inline-flex h-5 items-center rounded-tag px-2 text-[12px] font-bold whitespace-nowrap ${TONE_BADGE[toneOf(entryStatus(race, today))]}`}
                    >
                      {st.label}
                    </span>
                  </div>
                )}
                <div className={`text-[26px] leading-none font-bold ${soldOut ? '' : 'num'}`}>
                  {st.days != null ? dday(st.days) : soldOut ? t('detail.closedShort') : '-'}
                </div>
                <div className={`text-[13px] ${st.hot ? 'opacity-85' : 'text-ink-3'}`}>
                  {soldOut ? (
                    t('detail.soldOutOn', { date: fmtDateShort(soldOut, lang) })
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
            className={`mt-4 inline-flex min-h-11 flex-wrap items-center gap-x-2 rounded-ctl px-4 py-2 text-left text-[15px] font-semibold transition active:translate-y-px sm:min-h-10 ${
              registered ? 'bg-surface text-ink shadow-[inset_0_0_0_2px_var(--ink)]' : 'bg-surface text-ink hover:bg-sunken'
            }`}
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              {registered ? <CheckSquare size={18} weight="fill" /> : <Square size={18} weight="bold" />}
              {registered ? t('detail.registered') : t('detail.register')}
            </span>
            <span className={`text-[13px] font-normal ${registered ? 'text-ink-2' : 'text-ink-3'}`}>
              {cancelled ? t('detail.unregister') : registered ? t('detail.byRaceDay') : t('detail.registerHint')}
            </span>
          </button>
        )}

        {/* 지난 대회: '참가했어요' + 종목·기록 (회원만) */}
        {raceDay.days == null && !cancelled && (
          <FinishedRecord
            key={race.id}
            race={race}
            record={record}
            ready={recordsReady}
            autoOpen={initialAction === 'record'}
            onSave={onSaveRecord}
            onClear={onClearRecord}
            onLogin={onLogin}
          />
        )}
      </header>

      <div className="sticky top-16 z-10 bg-bg sm:top-14">
        <Tabs<Tab>
          value={view}
          onChange={(t) => goTab(t)}
          items={[
            ['overview', t('tab.overview')],
            ['reviews', reviewCount ? t('tab.reviewsN', { n: reviewCount }) : t('tab.reviews')],
            ['talk', COMMUNITY_TEXT[lang].tab],
            ['packages', racePackages.length ? t('tab.packagesN', { n: racePackages.length }) : t('tab.packages')],
            ['cost', t('tab.cost')],
            ...(cancelled ? [] : ([['alert', t('tab.alert')]] as [Tab, string][])),
            ...(isAdmin ? ([['edit', EDIT_TAB_LABEL[lang]]] as [Tab, string][]) : []),
          ]}
        />
      </div>

      <div className="px-5 pt-6 pb-10 sm:px-7">
        {view === 'overview' && (
          <div className="space-y-8">
            <section>
              <h3 className="text-[17px] font-bold">{t('detail.entryHead', { type: entryLabel })}</h3>
              <p className="mt-1 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{t(`entryDesc.${race.entry_type}` as Key)}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                {entryConfirmed ? (
                  <Fact label={t('detail.opens')} value={race.entry_opens ? fmtDate(race.entry_opens, lang) : t('fee.tba')} num={!!race.entry_opens} />
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
                    value={t('detail.soldOutOn', { date: fmtDate(soldOut, lang) })}
                    sub={
                      race.entry_closes && race.sold_out_on! < race.entry_closes
                        ? t('detail.originalClose', { d: fmtDate(race.entry_closes, lang) })
                        : undefined
                    }
                  />
                ) : entryConfirmed ? (
                  <Fact
                    label={t('detail.closes')}
                    value={race.entry_closes ? fmtDate(race.entry_closes, lang) : t('detail.closesWhenFull')}
                    num={!!race.entry_closes}
                  />
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
                  <p className="text-[15px] font-semibold">{t('detail.mayFillTitle')}</p>
                  <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{t('detail.mayFillText')}</p>
                </div>
              )}
              {canReport && <SoldOutReport key={race.id} race={race} onLogin={onLogin} />}
            </section>

            <dl className="grid grid-cols-2 gap-3">
              {evMeta && (
                <>
                  <Fact label={RUN_EVENT_TEXT[lang].brand} value={brandText(evMeta.brand, lang)} />
                  <Fact label={RUN_EVENT_TEXT[lang].kind} value={evKinds || '-'} />
                </>
              )}
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
              {/* 휴대폰에서는 아래 고정 줄에 있다 — 여기는 640px 부터 */}
              <a
                href={safeUrl(race.official_url)}
                onClick={() => track('official_click', { race_id: race.id, search: isSearchLink(race.official_url) })}
                target="_blank"
                rel="noreferrer"
                className={`${actBtn} bg-ink text-bg hover:opacity-85 max-sm:hidden`}
              >
                {officialLabel} <ArrowUpRight size={14} weight="bold" />
              </a>
              {!cancelled && (
                <button
                  onClick={() => setCalOpen((v) => !v)}
                  aria-expanded={calOpen}
                  className={`${actBtn} active:translate-y-px ${
                    calOpen ? 'bg-surface text-ink shadow-[inset_0_0_0_2px_var(--ink)]' : 'bg-surface text-ink hover:bg-sunken'
                  }`}
                >
                  <CalendarPlus size={14} weight="bold" /> {calDates(race).length === 1 ? t('detail.calRaceOnly') : t('detail.cal')}
                </button>
              )}
              <button onClick={share} className={`${actBtn} bg-surface text-ink hover:bg-sunken active:translate-y-px`}>
                {copied ? <Check size={14} weight="bold" /> : <LinkSimple size={14} weight="bold" />}
                {copied ? t('detail.copied') : t('detail.share')}
              </button>
              {race.source_url && (
                <a
                  href={safeUrl(race.source_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-11 items-center px-2 text-[15px] font-semibold whitespace-nowrap text-ink-2 underline decoration-line underline-offset-4 hover:text-ink sm:h-10"
                >
                  {t('detail.source')}
                </a>
              )}
            </div>
            {calOpen &&
              !cancelled &&
              (session ? (
                <CalendarPicker race={race} onLogin={onLogin} />
              ) : (
                <MemberGate raceId={race.id} action="cal" onLogin={onLogin} className="-mt-5" />
              ))}
            {/* 비회원에게 회원 혜택 한 줄 (안내 상자가 열려 있으면 거기 이미 있다) */}
            {!session && !(calOpen && !cancelled) && (
              <p className="-mt-5 max-w-[60ch] text-[15px] sm:text-[13px] leading-relaxed text-ink-3">
                {t('member.perks')}{' '}
                <button
                  type="button"
                  onClick={() => onLogin('up')}
                  className="-my-3 py-3 font-semibold whitespace-nowrap text-ink-2 underline underline-offset-2 hover:text-ink"
                >
                  {t('member.signup')}
                </button>
              </p>
            )}

            <p className="max-w-[60ch] text-[15px] sm:text-[13px] leading-relaxed text-ink-3">{t('detail.disclaimer')}</p>

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

        {/* ReviewsTab 은 onClick={onLogin} 으로 바로 걸어 이벤트가 인자로 들어가므로 감싸서 넘긴다 */}
        {view === 'reviews' && <ReviewsTab race={race} onLogin={() => onLogin('in')} />}
        {view === 'talk' && <RaceTalkTab race={race} onLogin={() => onLogin('in')} />}
        {view === 'packages' && <PackageTable packages={racePackages} agencies={agencies} />}
        {view === 'cost' && <CostCalculator race={race} costs={costs} />}
        {view === 'alert' && <AlertForm race={race} onLogin={onLogin} />}
        {view === 'edit' && isAdmin && <RaceEditor raceId={race.id} onSaved={onRaceSaved} />}
      </div>

      <p className="max-w-[60ch] px-5 pb-8 text-[15px] sm:text-[13px] leading-relaxed text-ink-3 sm:px-7">
        {t('footer.notice')}{' '}
        <a href={langPath('/terms', lang)} className="py-3.5 underline underline-offset-2 hover:no-underline">
          {t('footer.terms')}
        </a>
      </p>

      {/* 휴대폰: 자주 쓰는 동작(공식 홈페이지·관심·알림)을 스크롤해도 엄지가 닿는 아래 줄에 고정. 위·본문의 같은 버튼은 640px 부터 보인다 */}
      <div className="sticky bottom-0 z-10 mt-auto flex shrink-0 items-stretch gap-2 border-t border-line bg-bg px-5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:hidden">
        <a
          href={safeUrl(race.official_url)}
          onClick={() => track('official_click', { race_id: race.id, search: isSearchLink(race.official_url) })}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-ctl bg-ink px-3 text-[15px] font-semibold text-bg transition hover:opacity-85"
        >
          <span className="truncate">{officialLabel}</span>
          <ArrowUpRight size={14} weight="bold" className="shrink-0" />
        </a>
        <button
          onClick={toggleFavorite}
          aria-pressed={favorite}
          className={`${barBtn} ${favorite ? 'bg-surface text-ink shadow-[inset_0_0_0_2px_var(--ink)]' : 'bg-surface text-ink-2'}`}
        >
          <BookmarkSimple size={18} weight={favorite ? 'fill' : 'bold'} />
          <span>{favorite ? t('detail.saved') : t('detail.save')}</span>
        </button>
        {!cancelled && (
          <button onClick={() => goTab('alert', true)} className={`${barBtn} bg-surface ${view === 'alert' ? 'text-ink' : 'text-ink-2'}`}>
            <Bell size={18} weight={view === 'alert' ? 'fill' : 'bold'} />
            <span>{t('tab.alert')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** 휴대폰 아래 고정 줄의 작은 버튼(아이콘 위 · 글자 아래) */
const barBtn =
  'inline-flex h-12 min-w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-ctl px-2 text-[13px] leading-none font-semibold whitespace-nowrap transition active:translate-y-px';

/** 위쪽 요약 두 칸: 부모 줄을 같이 써서(subgrid) 한쪽 라벨이 두 줄이어도 큰 값의 기준선이 같다 */
const sumCell = 'row-span-3 grid grid-rows-subgrid gap-y-1 px-4 py-3';

/** 동작 버튼 줄(공식 홈페이지·캘린더·공유)은 모두 같은 높이 */
const actBtn =
  'inline-flex h-11 items-center gap-2 rounded-ctl px-4 text-[15px] font-semibold whitespace-nowrap transition sm:h-10';

/** '2026년 8월 28일 (금)' 같은 날짜는 덩어리 안에서 꺾이지 않게, '(요일)' 앞에서만 꺾는다 */
function FactValue({ value }: { value: string }) {
  const i = value.lastIndexOf(' (');
  if (i < 0 || !/\d/.test(value)) return <>{value}</>;
  return (
    <>
      <span className="whitespace-nowrap">{value.slice(0, i)}</span> <span className="whitespace-nowrap">{value.slice(i + 1)}</span>
    </>
  );
}

/** 정보 칸: 값은 글이든 숫자든 17px·같은 줄 높이라 같은 줄 두 칸의 값 기준선이 같다 */
function Fact({ label, value, sub, num }: { label: string; value: string; sub?: string; num?: boolean }) {
  return (
    <div className="rounded-box bg-surface px-4 py-3">
      <dt className="text-[13px] text-ink-3">{label}</dt>
      <dd className={`mt-1 text-[17px] leading-7 font-semibold text-ink ${num ? 'num' : ''}`}>
        <FactValue value={value} />
      </dd>
      {sub && <dd className="text-[13px] text-ink-3">{sub}</dd>}
    </div>
  );
}

/**
 * 대회 날·접수 시작·접수 마감을 각각 골라 구글 캘린더 또는 휴대폰 기본 캘린더에 넣는다 (회원만).
 * .ics 는 서버가 로그인 토큰을 확인하고 내주므로 fetch 로 받아 파일로 저장한다.
 */
function CalendarPicker({ race, onLogin }: { race: Race; onLogin: OnLogin }) {
  const { lang, t } = useLang();
  const dates = calDates(race);
  const [busy, setBusy] = useState<CalKind | 'all' | null>(null);
  const [fail, setFail] = useState<'unauthorized' | 'kakao' | 'error' | null>(null);
  const save = async (kind: CalKind | 'all', target: 'google' | 'ics') => {
    track('calendar_add', { race_id: race.id, kind, target });
    if (target === 'google') return openOutside(googleCalUrl(race, kind as CalKind, lang));
    if (busy) return;
    setBusy(kind);
    setFail(null);
    const r = await downloadIcs(race, kind === 'all' ? dates.map((d) => d.kind) : [kind], lang);
    setBusy(null);
    if (r === 'ok') return;
    setFail(r);
    // 카카오톡 안 브라우저: 파일도 로그인도 안 되니 휴대폰 기본 브라우저로 이 대회 페이지를 연다
    if (r === 'kakao') openOutside(`${location.origin}${langPath(`/r/${encodeURIComponent(race.id)}`, lang)}`);
  };
  const btn =
    'inline-flex h-11 items-center rounded-ctl bg-bg px-3 text-[15px] font-semibold whitespace-nowrap text-ink transition hover:bg-sunken active:translate-y-px sm:h-10';
  return (
    <div className="-mt-5 rounded-box bg-surface p-4">
      <ul className="divide-y divide-line">
        {dates.map((d) => (
          <li key={d.kind} className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0">
            <span className="text-[15px]">
              <strong className="font-semibold">{calLabel(d.kind, lang)}</strong>
              <span className="ml-2 text-ink-2">{fmtDate(d.date, lang)}</span>
            </span>
            <span className="flex gap-2">
              <button className={btn} onClick={() => save(d.kind, 'google')}>
                {t('cal.google')}
              </button>
              <button className={btn} disabled={busy != null} onClick={() => save(d.kind, 'ics')}>
                {busy === d.kind ? t('cal.downloading') : t('cal.ics')}
              </button>
            </span>
          </li>
        ))}
      </ul>
      {dates.length > 1 && (
        <button
          onClick={() => save('all', 'ics')}
          disabled={busy != null}
          className="mt-2 inline-flex min-h-11 items-center rounded-ctl bg-ink px-3 py-2 text-left text-[15px] font-semibold text-bg transition hover:opacity-85 disabled:opacity-60 sm:min-h-10"
        >
          {busy === 'all'
            ? t('cal.downloading')
            : t('cal.all', { list: dates.map((d) => calLabel(d.kind, lang).toLowerCase()).join(t('cal.allSep')) })}
        </button>
      )}
      {fail === 'unauthorized' && <MemberGate raceId={race.id} action="cal" onLogin={onLogin} className="mt-3 bg-bg" />}
      {fail === 'kakao' && (
        <div className="mt-3">
          <Note>{t('cal.kakaoOpen')}</Note>
        </div>
      )}
      {fail === 'error' && (
        <div className="mt-3">
          <Note tone="error">{t('cal.icsFail')}</Note>
        </div>
      )}
      <p className="mt-3 text-[15px] sm:text-[13px] leading-relaxed text-ink-3">
        {dates.length > 1 ? t('cal.reminder') : race.sold_out_on ? t('cal.soldOnly') : t('cal.raceOnly')}
        {t('cal.kakao')}
      </p>
    </div>
  );
}

/**
 * 지난 대회 '참가했어요' + 종목·기록(선택). 회원만 — 비회원은 누르면 회원 안내.
 * 계정과 아직 못 맞췄으면(0013 실행 전) '곧 열립니다'. 선택 상태는 테두리로만 표시(검정 채움 없음).
 */
function FinishedRecord({
  race,
  record,
  ready,
  autoOpen,
  onSave,
  onClear,
  onLogin,
}: {
  race: Race;
  record?: RaceRecord;
  ready: boolean;
  autoOpen: boolean;
  onSave?: (r: RecordInput) => Promise<unknown>;
  onClear?: (id: string) => Promise<unknown>;
  onLogin: OnLogin;
}) {
  const { session } = useAuth();
  const { lang, t } = useLang();
  const finished = record?.status === 'finished';
  const [open, setOpen] = useState(false);
  const [gate, setGate] = useState(false);
  const [soon, setSoon] = useState(false);
  const [dist, setDist] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const startEdit = () => {
    setDist(record?.distance ?? (race.distances.length === 1 ? race.distances[0] : ''));
    setTime(record?.finish_sec != null ? fmtFinish(record.finish_sec) : '');
    setErr('');
    setOpen(true);
  };
  // 로그인 뒤 이어 하기 (렌더 중 상태 맞추기)
  const want = autoOpen && !!session;
  const [seenWant, setSeenWant] = useState(false);
  if (want !== seenWant) {
    setSeenWant(want);
    if (want) startEdit();
  }

  const press = () => {
    if (!session) return setGate((v) => !v);
    if (!ready || !onSave) return setSoon(true);
    startEdit();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const raw = time.trim();
    const sec = raw ? parseFinish(raw) : null;
    if (raw && sec == null) return setErr(t('record.timeBad'));
    if (!ready || !onSave) return setErr(t('member.soon'));
    setBusy(true);
    setErr('');
    try {
      await onSave({ race_id: race.id, status: 'finished', distance: dist || null, distance_km: dist ? distanceKm(dist) : null, finish_sec: sec });
      if (!finished) track('race_finished', { race_id: race.id });
      setOpen(false);
    } catch (e2) {
      setErr(e2 instanceof Error && lang === 'ko' && /[가-힣]/.test(e2.message) ? e2.message : t('record.fail'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!onClear) return;
    setBusy(true);
    setErr('');
    try {
      await onClear(race.id);
      setOpen(false);
    } catch {
      setErr(t('record.fail'));
    } finally {
      setBusy(false);
    }
  }

  const summary = finished
    ? [record?.distance ? DIST_TEXT[lang](record.distance) : null, record?.finish_sec != null ? fmtFinish(record.finish_sec) : t('record.noTime')]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <div className="mt-4">
      {!open &&
        (finished ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex min-h-11 flex-wrap items-center gap-x-2 rounded-ctl border border-ink bg-surface px-4 py-2 text-[15px] font-semibold text-ink sm:min-h-10">
              <span className="inline-flex items-center gap-2 whitespace-nowrap">
                <CheckSquare size={18} weight="fill" />
                {t('record.doneOn')}
              </span>
              <span className="num text-[13px] font-normal text-ink-2">{summary}</span>
            </span>
            <Button size="sm" tone="quiet" type="button" onClick={startEdit}>
              {t('record.edit')}
            </Button>
          </div>
        ) : (
          <button
            type="button"
            onClick={press}
            aria-expanded={gate}
            className="inline-flex min-h-11 flex-wrap items-center gap-x-2 rounded-ctl bg-surface px-4 py-2 text-left text-[15px] font-semibold text-ink transition hover:bg-sunken active:translate-y-px sm:min-h-10"
          >
            <span className="inline-flex items-center gap-2 whitespace-nowrap">
              <Square size={18} weight="bold" />
              {t('record.done')}
            </span>
            <span className="text-[13px] font-normal text-ink-3">{t('record.hint')}</span>
          </button>
        ))}

      {gate && !session && <MemberGate raceId={race.id} action="record" onLogin={onLogin} className="mt-3 max-w-[60ch]" />}
      {soon && session && !ready && <p className="mt-2 text-[15px] sm:text-[13px] text-ink-3">{t('member.soon')}</p>}

      {open && session && (
        <form onSubmit={submit} className="max-w-[60ch] space-y-3 rounded-box border border-line p-4">
          <p className="inline-flex items-center gap-2 text-[15px] font-semibold">
            <CheckSquare size={18} weight="fill" />
            {t('record.done')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('record.distance')} hint={t('common.optional')}>
              <select value={dist} onChange={(e) => setDist(e.target.value)} className={inputCls}>
                <option value="">{t('record.distanceNone')}</option>
                {race.distances.map((d) => (
                  <option key={d} value={d}>
                    {DIST_TEXT[lang](d)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('record.time')} hint={t('common.optional')}>
              <TimeInput value={time} onChange={setTime} />
            </Field>
          </div>
          {err && <Note tone="error">{err}</Note>}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" type="submit" disabled={busy}>
              {busy ? t('common.saving') : t('record.save')}
            </Button>
            <Button size="sm" tone="quiet" type="button" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            {finished && (
              <Button size="sm" tone="danger" type="button" disabled={busy} onClick={remove}>
                {t('record.remove')}
              </Button>
            )}
          </div>
        </form>
      )}
      {!open && err && (
        <div className="mt-3">
          <Note tone="error">{err}</Note>
        </div>
      )}
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
function SoldOutReport({ race, onLogin }: { race: Race; onLogin: OnLogin }) {
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
    if (!session) return onLogin('in');
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
      <p className="mt-3 text-[15px] sm:text-[13px] text-ink-3">{t('report.sent')}</p>
    );

  if (!open)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button tone="quiet" size="sm" type="button" onClick={() => (session ? setOpen(true) : onLogin('in'))}>
          {t('report.button')}
        </Button>
        <span className="text-[13px] text-ink-3">{t('report.hint')}</span>
      </div>
    );

  return (
    <form onSubmit={send} className="mt-3 max-w-[60ch] space-y-3 rounded-box bg-surface p-4">
      <label className="block">
        <span className="mb-2 block text-[13px] font-semibold text-ink-2">
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
