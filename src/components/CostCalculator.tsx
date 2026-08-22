import { useMemo, useState } from 'react';
import type { Race, CostBaseline } from '../lib/types';
import { costFor, feeToKrw, krwExact, krw } from '../lib/util';

type Tier = 'low' | 'mid' | 'high';
const TIER_LABEL: Record<Tier, string> = { low: '알뜰', mid: '보통', high: '넉넉' };

export default function CostCalculator({
  race,
  costs,
}: {
  race: Race;
  costs: CostBaseline[];
}) {
  const base = costFor(race, costs);
  const [nights, setNights] = useState(race.flight_hours && race.flight_hours > 8 ? 5 : 3);
  const [people, setPeople] = useState(1);
  const [tier, setTier] = useState<Tier>('mid');
  const [shareRoom, setShareRoom] = useState(true);

  const result = useMemo(() => {
    if (!base) return null;
    const flight =
      tier === 'low' ? base.flight_low_krw : tier === 'high' ? base.flight_high_krw : base.flight_mid_krw;
    const hotelMul = tier === 'low' ? 0.7 : tier === 'high' ? 1.6 : 1;
    const rooms = shareRoom ? Math.ceil(people / 2) : people;
    const hotelTotal = base.hotel_night_krw * hotelMul * nights * rooms;
    const daily = base.daily_krw * (tier === 'low' ? 0.7 : tier === 'high' ? 1.5 : 1) * (nights + 1) * people;
    const fee = (feeToKrw(race) ?? 0) * people;
    const flightTotal = flight * people;
    const misc = 60000 * people; // 보험/교통/기타
    const total = flightTotal + hotelTotal + daily + fee + misc;
    return {
      flightTotal,
      hotelTotal,
      daily,
      fee,
      misc,
      total,
      perPerson: total / people,
    };
  }, [base, nights, people, tier, shareRoom, race]);

  if (!base || !result) {
    return <p className="text-sm text-zinc-500">이 지역의 비용 기준 데이터가 아직 없습니다.</p>;
  }

  const rows: [string, number, string?][] = [
    ['왕복 항공 (인천 출발)', result.flightTotal, `${people}인`],
    ['숙박', result.hotelTotal, `${nights}박 · ${shareRoom ? Math.ceil(people / 2) : people}실`],
    ['현지 체류비 (식비·교통)', result.daily, `${nights + 1}일 · ${people}인`],
    ['대회 참가비', result.fee, race.entry_fee ? undefined : '미공개'],
    ['보험·기타', result.misc],
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">숙박 일수</span>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={14}
              value={nights}
              onChange={(e) => setNights(Number(e.target.value))}
              className="w-full accent-emerald-400"
            />
            <span className="w-12 shrink-0 text-right text-sm tabular-nums text-zinc-200">{nights}박</span>
          </div>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-zinc-400">인원</span>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={20}
              value={people}
              onChange={(e) => setPeople(Number(e.target.value))}
              className="w-full accent-emerald-400"
            />
            <span className="w-12 shrink-0 text-right text-sm tabular-nums text-zinc-200">{people}명</span>
          </div>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-zinc-400">등급</span>
        {(['low', 'mid', 'high'] as Tier[]).map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              tier === t ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {TIER_LABEL[t]}
          </button>
        ))}
        {people > 1 && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={shareRoom}
              onChange={(e) => setShareRoom(e.target.checked)}
              className="size-3.5 accent-emerald-400"
            />
            2인 1실
          </label>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-800">
            {rows.map(([label, value, hint]) => (
              <tr key={label} className="bg-zinc-900/40">
                <td className="px-4 py-2.5 text-zinc-300">
                  {label}
                  {hint && <span className="ml-2 text-xs text-zinc-600">{hint}</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-200">{krwExact(value)}</td>
              </tr>
            ))}
            <tr className="bg-zinc-800/60 font-semibold">
              <td className="px-4 py-3 text-zinc-100">총 예상 비용</td>
              <td className="px-4 py-3 text-right tabular-nums text-emerald-400">{krwExact(result.total)}</td>
            </tr>
            {people > 1 && (
              <tr className="bg-zinc-900/40">
                <td className="px-4 py-2.5 text-zinc-400">1인당</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-zinc-200">
                  {krwExact(result.perPerson)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-zinc-500">
        인천 출발 왕복 이코노미 기준의 <strong className="text-zinc-400">참고용 추정치</strong>입니다. 실제
        항공권은 출발 시기·유류할증료·좌석 등급에 따라 크게 달라지며, 대회 주간에는 현지 숙박비가
        평소보다 오르는 경우가 많습니다. 아래 여행사 패키지 가격과 비교해 보세요 (약 {krw(result.perPerson)}
        /인).
      </p>
    </div>
  );
}
