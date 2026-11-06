import { useState } from 'react';
import { ArrowUpRight, CalendarPlus, LinkSimple, Check, BookmarkSimple, CheckSquare, Square } from '@phosphor-icons/react';
import { calDates, CAL_LABEL, googleCalUrl, openIcs, openOutside, type CalKind } from '../lib/ics';
import { track } from '../lib/analytics';
import type { Race, Agency, Package, CostBaseline, RaceRating } from '../lib/types';
import { ENTRY_LABEL, ENTRY_DESC, CONFIDENCE_LABEL } from '../lib/types';
import {
  TODAY,
  fmtDate,
  feeLabel,
  feeToKrw,
  krw,
  isDomestic,
  statusLine,
  raceDayLine,
  isTrail,
  dateParts,
  isSearchLink,
  safeUrl,
} from '../lib/util';
import CostCalculator from './CostCalculator';
import PackageTable from './PackageTable';
import AlertForm from './AlertForm';
import ReviewsTab from './ReviewsTab';
import { CloseButton, Tabs } from './ui';

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
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [copied, setCopied] = useState(false);
  const [calOpen, setCalOpen] = useState(false);

  async function share() {
    track('share', { race_id: race.id });
    const url = `${location.origin}/r/${encodeURIComponent(race.id)}`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    if (nav.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await nav.share({ title: race.name_ko, url });
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
      prompt('이 주소를 복사하세요', url);
    }
  }
  const today = TODAY();
  const st = statusLine(race, today);
  const raceDay = raceDayLine(race, today);
  const trail = isTrail(race);
  const p = dateParts(race.race_date);
  const feeKrw = feeToKrw(race);
  const racePackages = packages.filter((x) => x.race_id === race.id);
  const domestic = isDomestic(race);
  const reviewCount = rating?.review_count ?? 0;

  return (
    <div className="flex h-full flex-col">
      {/* 머리 */}
      <header className="px-5 pt-4 pb-5 sm:px-7">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-ink-2">
            {domestic ? `국내, ${race.city_ko}` : `${race.country_ko} ${race.city_ko}`}
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
              {favorite ? '관심 대회' : '관심 추가'}
            </button>
            <CloseButton onClick={onClose} />
          </div>
        </div>

        <h2 className="mt-2 text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">
          {race.name_ko}
          {trail && (
            <span className="ml-2 inline-block translate-y-[-4px] rounded-tag border border-ink-3 px-1.5 py-px align-middle text-[11px] font-bold text-ink-2">
              트레일
            </span>
          )}
          {race.is_major && (
            <span className="ml-2 inline-block translate-y-[-4px] rounded-tag bg-ink px-1.5 py-0.5 align-middle text-[11px] font-bold text-bg">
              메이저
            </span>
          )}
        </h2>
        <p className="mt-0.5 text-[14px] text-ink-3">{race.name_en}</p>

        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-box bg-line">
          <div className="bg-surface px-4 py-3">
            <div className="text-[13px] text-ink-3">
              대회일 <span className="num">{p.m}.{p.d}</span> {p.w}
            </div>
            <div className="num mt-0.5 text-[26px] leading-none font-bold">
              {raceDay.days != null ? dday(raceDay.days) : '종료'}
            </div>
            <div className="mt-1 text-[13px] text-ink-3">
              {raceDay.label}
              {race.date_confidence !== 'confirmed' && `, 날짜 ${CONFIDENCE_LABEL[race.date_confidence]}`}
            </div>
          </div>
          {registered ? (
            <div className="bg-surface px-4 py-3">
              <div className="text-[13px] text-ink-3">접수</div>
              <div className="mt-0.5 inline-flex items-center gap-1 text-[24px] leading-none font-bold">
                <Check size={20} weight="bold" />
                완료
              </div>
              <div className="mt-1 text-[13px] text-ink-3">{ENTRY_LABEL[race.entry_type]}</div>
            </div>
          ) : (
            <div className={`px-4 py-3 ${st.hot ? 'bg-accent text-on-accent' : 'bg-surface'}`}>
              <div className={`text-[13px] ${st.hot ? 'opacity-85' : 'text-ink-3'}`}>{st.label}</div>
              <div className="num mt-0.5 text-[26px] leading-none font-bold">{st.days != null ? dday(st.days) : '-'}</div>
              <div className={`mt-1 text-[13px] ${st.hot ? 'opacity-85' : 'text-ink-3'}`}>
                {ENTRY_LABEL[race.entry_type]}
                {race.entry_confidence !== 'confirmed' && `, 일정 ${CONFIDENCE_LABEL[race.entry_confidence]}`}
              </div>
            </div>
          )}
        </div>

        {raceDay.days != null && (
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
            {registered ? '접수 완료' : '접수했어요'}
            <span className={`text-[13px] font-normal ${registered ? 'opacity-70' : 'text-ink-3'}`}>
              {registered ? '대회일 기준으로 표시 중' : '체크하면 대회일 기준으로 표시'}
            </span>
          </button>
        )}
      </header>

      <Tabs<Tab>
        value={tab}
        onChange={(t) => {
          setTab(t);
          track('race_tab', { race_id: race.id, tab: t });
        }}
        items={[
          ['overview', '정보'],
          ['reviews', reviewCount ? `후기 ${reviewCount}` : '후기'],
          ['packages', racePackages.length ? `여행사 ${racePackages.length}` : '여행사'],
          ['cost', '비용'],
          ['alert', '알림'],
        ]}
      />

      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
        {tab === 'overview' && (
          <div className="space-y-7">
            <section>
              <h3 className="text-[15px] font-bold">접수는 {ENTRY_LABEL[race.entry_type]}</h3>
              <p className="mt-1 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{ENTRY_DESC[race.entry_type]}</p>
              <dl className="mt-4 grid grid-cols-2 gap-3">
                <Fact label="접수 시작" value={race.entry_opens ? fmtDate(race.entry_opens) : '미공개'} />
                <Fact label="접수 마감" value={race.entry_closes ? fmtDate(race.entry_closes) : '정원이 차면 마감'} />
              </dl>
            </section>

            <dl className="grid grid-cols-2 gap-3">
              <Fact label="참가비" value={feeLabel(race)} sub={feeKrw && race.entry_fee_currency !== 'KRW' ? `약 ${krw(feeKrw)}` : undefined} num />
              <Fact label="종목" value={race.distances.join(', ')} />
              {trail ? (
                <Fact
                  label="누적 상승"
                  value={race.elevation_gain != null ? `${race.elevation_gain.toLocaleString('ko-KR')}m` : '-'}
                  num
                />
              ) : (
                <Fact label="코스" value={race.course ?? '-'} />
              )}
              <Fact label="규모" value={race.field_size ? `${race.field_size.toLocaleString()}명` : '-'} num />
              <Fact
                label={domestic ? '서울에서' : '인천에서'}
                value={race.flight_hours != null ? `약 ${race.flight_hours}시간` : '-'}
                num
              />
              <Fact label="정보 확인" value={race.last_verified} num />
            </dl>

            {race.notes_ko && (
              <p className="max-w-[60ch] border-l-2 border-ink pl-4 text-[15px] leading-relaxed text-ink-2">
                {race.notes_ko}
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
                {isSearchLink(race.official_url) ? '공식 홈페이지 검색' : '공식 홈페이지'} <ArrowUpRight size={15} weight="bold" />
              </a>
              <button
                onClick={() => setCalOpen((v) => !v)}
                aria-expanded={calOpen}
                className={`inline-flex h-10 items-center gap-1.5 rounded-ctl px-3.5 text-sm font-semibold transition active:translate-y-px ${
                  calOpen ? 'bg-ink text-bg' : 'bg-surface text-ink hover:bg-sunken'
                }`}
              >
                <CalendarPlus size={16} weight="bold" /> 캘린더에 저장
              </button>
              <button
                onClick={share}
                className="inline-flex h-10 items-center gap-1.5 rounded-ctl bg-surface px-3.5 text-sm font-semibold text-ink transition hover:bg-sunken active:translate-y-px"
              >
                {copied ? <Check size={16} weight="bold" /> : <LinkSimple size={16} weight="bold" />}
                {copied ? '주소 복사됨' : '공유'}
              </button>
              {race.source_url && (
                <a
                  href={safeUrl(race.source_url)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1 inline-flex h-10 items-center text-sm font-semibold text-ink-2 underline decoration-line underline-offset-4 hover:text-ink"
                >
                  정보 출처
                </a>
              )}
            </div>
            {calOpen && <CalendarPicker race={race} />}

            <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-3">
              대회 일정과 접수 기간은 매년 바뀌고 예고 없이 달라지기도 합니다. 신청 전에는 공식 홈페이지에서 한 번 더
              확인하세요.
            </p>
          </div>
        )}

        {tab === 'reviews' && <ReviewsTab race={race} onLogin={onLogin} />}
        {tab === 'packages' && <PackageTable packages={racePackages} agencies={agencies} />}
        {tab === 'cost' && <CostCalculator race={race} costs={costs} />}
        {tab === 'alert' && <AlertForm race={race} />}
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
  const dates = calDates(race);
  const save = (kind: CalKind | 'all', target: 'google' | 'ics') => {
    track('calendar_add', { race_id: race.id, kind, target });
    if (target === 'google') openOutside(googleCalUrl(race, kind as CalKind));
    else openIcs(race, kind === 'all' ? dates.map((d) => d.kind) : [kind]);
  };
  const btn =
    'inline-flex h-9 items-center rounded-ctl bg-bg px-3 text-[13px] font-semibold text-ink transition hover:bg-sunken active:translate-y-px';
  return (
    <div className="-mt-3 rounded-box bg-surface p-4">
      <ul className="divide-y divide-line">
        {dates.map((d) => (
          <li key={d.kind} className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0">
            <span className="text-[15px]">
              <strong className="font-semibold">{CAL_LABEL[d.kind]}</strong>
              <span className="ml-2 text-ink-2">{fmtDate(d.date)}</span>
            </span>
            <span className="flex gap-1.5">
              <button className={btn} onClick={() => save(d.kind, 'google')}>
                구글 캘린더
              </button>
              <button className={btn} onClick={() => save(d.kind, 'ics')}>
                아이폰·기본 캘린더
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
          {dates.map((d) => CAL_LABEL[d.kind]).join('·')} 한 번에 넣기 (아이폰·기본 캘린더)
        </button>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
        접수 시작·마감 일정에는 하루 전 알림이 붙습니다. 접수일이 아직 발표되지 않은 대회는 대회 날만 넣을 수 있습니다.
        카카오톡에서 열었다면 휴대폰 기본 브라우저로 넘어가서 저장됩니다.
      </p>
    </div>
  );
}
