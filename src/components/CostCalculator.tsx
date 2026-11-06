import { useMemo, useState } from 'react';
import { ArrowUpRight, Minus, Plus } from '@phosphor-icons/react';
import type { Race, CostBaseline } from '../lib/types';
import { costFor, feeToKrw, feeLabel, krwExact, isDomestic } from '../lib/util';
import { isUlleung, stayDates, stayLinks, stayQuery, transportLinks, type BookingLink } from '../lib/booking';
import { track } from '../lib/analytics';

type Tier = 'low' | 'mid' | 'high';
const TIER_LABEL: Record<Tier, string> = { low: '절약', mid: '보통', high: '여유' };

export default function CostCalculator({ race, costs }: { race: Race; costs: CostBaseline[] }) {
  return isDomestic(race) ? <DomesticBooking race={race} /> : <Estimate race={race} costs={costs} />;
}

/** 국내 대회: 금액 추정 대신 숙소·교통 예약 사이트로 바로 연결 */
function DomesticBooking({ race }: { race: Race }) {
  const dates = stayDates(race);
  const stays = stayLinks(race);
  const rides = transportLinks(race);
  const jeju = rides.length === 1 && rides[0].id === 'naver-flight';
  const ferry = isUlleung(race);
  const out = dates?.nextDay ? '다음 날 체크아웃' : '당일 체크아웃';
  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">숙소 찾기</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {!dates
              ? `대회 날짜가 정해지지 않아 ‘${stayQuery(race)}’ 지역만 넣어 검색합니다. 날짜는 직접 고르세요.`
              : race.date_confidence === 'expected'
                ? `예상 대회일 기준으로 전날 체크인, ${out} ‘${stayQuery(race)}’ 숙소를 검색합니다. 날짜가 바뀔 수 있습니다.`
                : `대회 전날 체크인, ${out}으로 ‘${stayQuery(race)}’ 숙소를 검색합니다.`}
            {dates?.nextDay && ' 100km 이상 종목은 다음 날 끝나는 경우가 많아 하루 더 잡았습니다.'}
          </p>
        </div>
        <BookingList race={race} links={stays} />
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">교통편 예매</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {ferry
              ? '울릉도는 포항·강릉·묵호에서 여객선으로 갑니다. 항구·선사마다 예매처가 달라 링크는 따로 걸지 않았습니다. 배는 날씨로 결항이 잦습니다.'
              : jeju
                ? '제주는 항공편으로 갑니다. 서울 출발로 검색하니 다른 공항 출발은 예매 화면에서 바꾸세요.'
                : '출발역·도착역과 날짜는 예매 화면에서 고르세요.'}
          </p>
        </div>
        {rides.length > 0 && <BookingList race={race} links={rides} />}
      </section>

      <dl className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
        <dt className="text-[14px] text-ink-2">대회 참가비</dt>
        <dd className="num text-[17px] font-semibold text-ink">{feeLabel(race)}</dd>
      </dl>
    </div>
  );
}

function BookingList({ race, links }: { race: Race; links: BookingLink[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {links.map((l) => (
        <li key={l.id}>
          <a
            href={l.url}
            onClick={() => track('booking', { race_id: race.id, kind: l.id })}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex min-h-14 items-center justify-between gap-3 rounded-box bg-surface px-4 py-3 transition hover:bg-sunken"
          >
            <span>
              <span className="block text-[15px] font-semibold text-ink">{l.label}</span>
              {l.note && <span className="block text-[13px] text-ink-3">{l.note}</span>}
            </span>
            <ArrowUpRight size={16} className="shrink-0 text-ink-3 group-hover:text-ink" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function Estimate({ race, costs }: { race: Race; costs: CostBaseline[] }) {
  const base = costFor(race, costs);
  const [nights, setNights] = useState(race.flight_hours && race.flight_hours > 8 ? 5 : 3);
  const [people, setPeople] = useState(1);
  const [tier, setTier] = useState<Tier>('mid');
  const [shareRoom, setShareRoom] = useState(true);

  const r = useMemo(() => {
    if (!base) return null;
    const pick = tier === 'low' ? base.flight_low_krw : tier === 'high' ? base.flight_high_krw : base.flight_mid_krw;
    const hotelMul = tier === 'low' ? 0.7 : tier === 'high' ? 1.6 : 1;
    const dailyMul = tier === 'low' ? 0.7 : tier === 'high' ? 1.5 : 1;
    const rooms = shareRoom ? Math.ceil(people / 2) : people;
    const travel = pick * people;
    const hotel = base.hotel_night_krw * hotelMul * nights * rooms;
    const daily = base.daily_krw * dailyMul * (nights + 1) * people;
    const fee = (feeToKrw(race) ?? 0) * people;
    const misc = 60000 * people;
    const total = travel + hotel + daily + fee + misc;
    return { travel, hotel, daily, fee, misc, total, per: total / people, rooms };
  }, [base, nights, people, tier, shareRoom, race]);

  if (!base || !r) {
    return <p className="text-sm text-ink-3">이 지역은 아직 비용 기준값이 없습니다.</p>;
  }

  const rows: [string, number, string][] = [
    ['왕복 항공 (인천 출발)', r.travel, `${people}명`],
    ['숙박', r.hotel, nights ? `${nights}박, 방 ${r.rooms}개` : '당일치기'],
    ['식비·현지 교통', r.daily, `${nights + 1}일`],
    ['대회 참가비', r.fee, race.entry_fee ? `${people}명` : '미공개'],
    ['보험·기타', r.misc, ''],
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stepper label="숙박" unit="박" value={nights} min={0} max={14} onChange={setNights} />
        <Stepper label="인원" unit="명" value={people} min={1} max={30} onChange={setPeople} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="예산 수준" className="inline-flex rounded-ctl bg-sunken p-1">
          {(['low', 'mid', 'high'] as Tier[]).map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={tier === t}
              onClick={() => setTier(t)}
              className={`h-9 rounded-[4px] border px-3.5 text-[14px] font-semibold transition ${
                tier === t ? 'border-line bg-surface text-ink' : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
        {people > 1 && nights > 0 && (
          <label className="flex cursor-pointer items-center gap-2 text-[14px] text-ink-2">
            <input
              type="checkbox"
              checked={shareRoom}
              onChange={(e) => setShareRoom(e.target.checked)}
              className="size-4"
            />
            2명이 방 하나
          </label>
        )}
      </div>

      <div className="rounded-box bg-surface">
        <dl className="divide-y divide-line px-4">
          {rows.map(([label, value, hint]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-3">
              <dt className="text-[14px] text-ink-2">
                {label}
                {hint && <span className="ml-2 text-[13px] text-ink-3">{hint}</span>}
              </dt>
              <dd className="num text-[17px] font-semibold text-ink">{krwExact(value)}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-end justify-between gap-4 border-t-2 border-ink px-4 py-4">
          <div>
            <div className="text-[13px] text-ink-3">예상 총액</div>
            {people > 1 && <div className="num text-[15px] text-ink-2">1인 {krwExact(r.per)}</div>}
          </div>
          <div className="num text-[32px] font-bold leading-none">{krwExact(r.total)}</div>
        </div>
      </div>

      <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-3">
        인천 출발 왕복 이코노미 기준 추정치입니다. 대회 주간에는 숙박비가 평소보다
        오르는 경우가 많으니 여행사 패키지 가격과 비교해 확인하세요.
      </p>
    </div>
  );
}

function Stepper({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const btn =
    'grid size-11 place-items-center sm:size-9 rounded-ctl text-ink-2 transition hover:bg-sunken hover:text-ink active:scale-95 disabled:opacity-30';
  return (
    <div className="flex items-center justify-between rounded-box bg-surface px-3 py-2.5">
      <span className="shrink-0 whitespace-nowrap text-[14px] text-ink-2">{label}</span>
      <div className="flex items-center gap-1">
        <button className={btn} aria-label={`${label} 줄이기`} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={16} weight="bold" />
        </button>
        <span className="num w-12 text-center text-[22px] font-bold">
          {value}
          <span className="ml-0.5 text-[14px] font-semibold text-ink-3">{unit}</span>
        </span>
        <button className={btn} aria-label={`${label} 늘리기`} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
