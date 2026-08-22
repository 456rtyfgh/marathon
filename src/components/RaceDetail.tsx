import { useEffect, useState } from 'react';
import type { Race, Agency, Package, CostBaseline } from '../lib/types';
import { ENTRY_LABEL, ENTRY_DESC, CONFIDENCE_LABEL } from '../lib/types';
import { entryStatus, STATUS_META, daysBetween, TODAY, fmtDate, feeLabel, feeToKrw, krwExact } from '../lib/util';
import CostCalculator from './CostCalculator';
import PackageTable from './PackageTable';
import AlertForm from './AlertForm';

type Tab = 'overview' | 'packages' | 'cost' | 'alert';
const TABS: [Tab, string][] = [
  ['overview', '개요'],
  ['packages', '여행사 비교'],
  ['cost', '비용 계산기'],
  ['alert', 'D-day 알림'],
];

export default function RaceDetail({
  race,
  agencies,
  packages,
  costs,
  onClose,
}: {
  race: Race;
  agencies: Agency[];
  packages: Package[];
  costs: CostBaseline[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const today = TODAY();
  const status = entryStatus(race, today);
  const meta = STATUS_META[status];
  const dRace = daysBetween(today, race.race_date);
  const feeKrw = feeToKrw(race);
  const racePackages = packages.filter((p) => p.race_id === race.id);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 sm:rounded-2xl"
        role="dialog"
        aria-modal="true"
      >
        {/* header */}
        <div className="border-b border-zinc-800 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {race.is_major && (
                  <span className="rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-400/30">
                    MAJOR
                  </span>
                )}
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${meta.cls}`}>
                  {meta.label}
                </span>
                <span className="text-xs text-zinc-500">
                  {race.country_ko} · {race.city_ko}
                </span>
              </div>
              <h2 className="mt-1.5 text-xl font-bold text-zinc-50 sm:text-2xl">{race.name_ko}</h2>
              <p className="text-sm text-zinc-500">{race.name_en}</p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              aria-label="닫기"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-bold tabular-nums text-emerald-400">
              {dRace >= 0 ? `D-${dRace}` : '종료'}
            </span>
            <span className="text-zinc-300">{fmtDate(race.race_date)}</span>
            {race.date_confidence !== 'confirmed' && (
              <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[11px] text-amber-400">
                날짜 {CONFIDENCE_LABEL[race.date_confidence]}
              </span>
            )}
          </div>
        </div>

        {/* tabs */}
        <div className="flex gap-1 overflow-x-auto border-b border-zinc-800 px-3">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 border-b-2 px-3 py-3 text-sm font-medium transition ${
                tab === id
                  ? 'border-emerald-500 text-zinc-50'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
              {id === 'packages' && racePackages.length > 0 && (
                <span className="ml-1.5 rounded-full bg-zinc-800 px-1.5 text-[10px] text-zinc-400">
                  {racePackages.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6">
          {tab === 'overview' && (
            <div className="space-y-5">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-100">
                    참가 방식: {ENTRY_LABEL[race.entry_type]}
                  </span>
                  {race.entry_confidence !== 'confirmed' && (
                    <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[11px] text-amber-400">
                      일정 {CONFIDENCE_LABEL[race.entry_confidence]}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-zinc-400">
                  {ENTRY_DESC[race.entry_type]}
                </p>
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                  <Field label="신청 시작" value={race.entry_opens ? fmtDate(race.entry_opens) : '미공개'} />
                  <Field label="신청 마감" value={race.entry_closes ? fmtDate(race.entry_closes) : '정원 소진 시'} />
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <Field
                  label="참가비"
                  value={
                    feeKrw != null
                      ? `${feeLabel(race)} (약 ${krwExact(feeKrw)})`
                      : feeLabel(race)
                  }
                />
                <Field label="참가 규모" value={race.field_size ? `약 ${race.field_size.toLocaleString()}명` : '—'} />
                <Field label="종목" value={race.distances.join(' · ')} />
                <Field label="코스" value={race.course ?? '—'} />
                <Field
                  label="인천 기준 이동"
                  value={race.flight_hours != null ? `약 ${race.flight_hours}시간` : '—'}
                />
                <Field label="정보 확인일" value={race.last_verified} />
              </div>

              {race.notes_ko && (
                <p className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm leading-relaxed text-zinc-300">
                  {race.notes_ko}
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <a
                  href={race.official_url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400"
                >
                  공식 홈페이지 ↗
                </a>
                {race.source_url && (
                  <a
                    href={race.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-300 transition hover:bg-zinc-700"
                  >
                    출처 확인 ↗
                  </a>
                )}
              </div>

              <p className="text-xs leading-relaxed text-zinc-600">
                해외 대회 일정은 매년 바뀌고 신청 기간은 사전 공지 없이 변경되기도 합니다. 실제 신청 전에는
                반드시 공식 홈페이지에서 다시 확인하세요.
              </p>
            </div>
          )}

          {tab === 'packages' && <PackageTable packages={racePackages} agencies={agencies} />}
          {tab === 'cost' && <CostCalculator race={race} costs={costs} />}
          {tab === 'alert' && <AlertForm race={race} />}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-900/60 px-3 py-2">
      <div className="text-[11px] text-zinc-500">{label}</div>
      <div className="mt-0.5 text-sm text-zinc-200">{value}</div>
    </div>
  );
}
