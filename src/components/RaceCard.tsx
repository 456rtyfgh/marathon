import type { Race, RaceRating } from '../lib/types';
import { ENTRY_LABEL, CONFIDENCE_LABEL } from '../lib/types';
import { entryStatus, STATUS_META, daysBetween, TODAY, fmtDate, feeLabel, isDomestic } from '../lib/util';

const ENTRY_CLS: Record<string, string> = {
  lottery: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
  fcfs: 'bg-orange-500/15 text-orange-300 ring-orange-500/30',
  qualifying: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  tour_only: 'bg-cyan-500/15 text-cyan-300 ring-cyan-500/30',
  open: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
};

export default function RaceCard({
  race,
  rating,
  onOpen,
}: {
  race: Race;
  rating?: RaceRating;
  onOpen: () => void;
}) {
  const today = TODAY();
  const dRace = daysBetween(today, race.race_date);
  const status = entryStatus(race, today);
  const meta = STATUS_META[status];
  const domestic = isDomestic(race);

  const deadline = race.entry_closes ? daysBetween(today, race.entry_closes) : null;
  const opensIn = race.entry_opens ? daysBetween(today, race.entry_opens) : null;

  let line: { text: string; cls: string } | null = null;
  if (status === 'open' && deadline !== null) {
    line = {
      text: deadline === 0 ? '오늘 마감' : `신청 마감 D-${deadline}`,
      cls: deadline <= 7 ? 'text-rose-400' : 'text-emerald-400',
    };
  } else if (status === 'open') {
    line = { text: '신청 가능 (정원 소진 시 마감)', cls: 'text-emerald-400' };
  } else if (status === 'upcoming' && opensIn !== null) {
    line = { text: `신청 오픈까지 D-${opensIn}`, cls: 'text-sky-400' };
  } else if (status === 'closed') {
    line = { text: '이번 회차 신청 종료', cls: 'text-zinc-500' };
  }

  return (
    <button
      onClick={onOpen}
      className="group flex w-full flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 text-left transition hover:border-zinc-600 hover:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {race.is_major && (
              <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-300 ring-1 ring-amber-400/30">
                MAJOR
              </span>
            )}
            {domestic && (
              <span className="rounded bg-blue-400/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-300 ring-1 ring-blue-400/30">
                국내
              </span>
            )}
            <span className="text-xs text-zinc-500">
              {race.country_ko} · {race.city_ko}
            </span>
          </div>
          <h3 className="mt-1 truncate text-lg font-semibold text-zinc-50">{race.name_ko}</h3>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${meta.cls}`}>
          {meta.label}
        </span>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-zinc-100">
          {dRace >= 0 ? `D-${dRace}` : '종료'}
        </span>
        <span className="text-sm text-zinc-400">{fmtDate(race.race_date)}</span>
        {race.date_confidence !== 'confirmed' && (
          <span className="text-[11px] text-amber-400/80">{CONFIDENCE_LABEL[race.date_confidence]}</span>
        )}
      </div>

      {line && <div className={`text-sm font-medium ${line.cls}`}>{line.text}</div>}

      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${ENTRY_CLS[race.entry_type]}`}>
          {ENTRY_LABEL[race.entry_type]}
        </span>
        {rating && rating.review_count > 0 && (
          <span className="rounded-full bg-amber-400/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
            ★ {Number(rating.avg_rating).toFixed(1)}
            <span className="ml-1 text-amber-300/60">({rating.review_count})</span>
          </span>
        )}
        <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
          참가비 {feeLabel(race)}
        </span>
        {race.flight_hours != null && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">
            {domestic ? '이동' : 'ICN'} {race.flight_hours}h
          </span>
        )}
        {race.course && (
          <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-400">{race.course}</span>
        )}
      </div>
    </button>
  );
}
