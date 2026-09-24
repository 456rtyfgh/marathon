import { useMemo, useState } from 'react';
import { Minus, Plus } from '@phosphor-icons/react';
import type { Race, CostBaseline } from '../lib/types';
import { costFor, feeToKrw, krwExact, isDomestic } from '../lib/util';

type Tier = 'low' | 'mid' | 'high';
const TIER_LABEL: Record<Tier, string> = { low: '아껴서', mid: '보통', high: '편하게' };

export default function CostCalculator({ race, costs }: { race: Race; costs: CostBaseline[] }) {
  const base = costFor(race, costs);
  const domestic = isDomestic(race);
  const [nights, setNights] = useState(domestic ? 1 : race.flight_hours && race.flight_hours > 8 ? 5 : 3);
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
    const misc = (domestic ? 10000 : 60000) * people;
    const total = travel + hotel + daily + fee + misc;
    return { travel, hotel, daily, fee, misc, total, per: total / people, rooms };
  }, [base, nights, people, tier, shareRoom, race, domestic]);

  if (!base || !r) {
    return <p className="text-sm text-ink-3">이 지역은 아직 비용 기준값이 없습니다.</p>;
  }

  const rows: [string, number, string][] = [
    [domestic ? '왕복 교통 (서울 출발)' : '왕복 항공 (인천 출발)', r.travel, `${people}명`],
    ['숙박', r.hotel, nights ? `${nights}박, 방 ${r.rooms}개` : '당일치기'],
    ['식비·현지 교통', r.daily, `${nights + 1}일`],
    ['대회 참가비', r.fee, race.entry_fee ? `${people}명` : '미공개'],
    [domestic ? '기타' : '보험·기타', r.misc, ''],
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3">
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
              className={`h-8 rounded-[4px] px-3.5 text-[14px] font-semibold transition ${
                tier === t ? 'bg-surface text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-3 hover:text-ink'
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
        <div className="flex items-end justify-between gap-4 rounded-b-box bg-ink px-4 py-4 text-bg">
          <div>
            <div className="text-[13px] opacity-70">예상 총액</div>
            {people > 1 && <div className="num text-[15px] opacity-70">1인 {krwExact(r.per)}</div>}
          </div>
          <div className="num text-[32px] font-bold leading-none">{krwExact(r.total)}</div>
        </div>
      </div>

      <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-3">
        {domestic ? '서울 출발' : '인천 출발 왕복 이코노미'} 기준 추정치입니다. 대회 주간에는 숙박비가 평소보다
        오르는 경우가 많으니 여행사 패키지 가격과 함께 비교해 보세요.
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
    'grid size-9 place-items-center rounded-ctl text-ink-2 transition hover:bg-sunken hover:text-ink active:scale-95 disabled:opacity-30';
  return (
    <div className="flex items-center justify-between rounded-box bg-surface px-3 py-2.5">
      <span className="text-[14px] text-ink-2">{label}</span>
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
