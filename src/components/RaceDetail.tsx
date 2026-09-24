import { useState } from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';
import type { Race, Agency, Package, CostBaseline, RaceRating } from '../lib/types';
import { ENTRY_LABEL, ENTRY_DESC, CONFIDENCE_LABEL } from '../lib/types';
import {
  daysBetween,
  TODAY,
  fmtDate,
  feeLabel,
  feeToKrw,
  krw,
  isDomestic,
  statusLine,
  dateParts,
} from '../lib/util';
import CostCalculator from './CostCalculator';
import PackageTable from './PackageTable';
import AlertForm from './AlertForm';
import ReviewsTab from './ReviewsTab';
import { CloseButton, Tabs } from './ui';

type Tab = 'overview' | 'reviews' | 'packages' | 'cost' | 'alert';

export default function RaceDetail({
  race,
  agencies,
  packages,
  costs,
  rating,
  onClose,
  onLogin,
}: {
  race: Race;
  agencies: Agency[];
  packages: Package[];
  costs: CostBaseline[];
  rating?: RaceRating;
  onClose: () => void;
  onLogin: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const today = TODAY();
  const st = statusLine(race, today);
  const dRace = daysBetween(today, race.race_date);
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
          <CloseButton onClick={onClose} />
        </div>

        <h2 className="mt-2 text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">
          {race.name_ko}
          {race.is_major && (
            <span className="ml-2 inline-block translate-y-[-4px] rounded-tag bg-ink px-1.5 py-0.5 align-middle text-[11px] font-bold text-bg">
              메이저
            </span>
          )}
        </h2>
        <p className="mt-0.5 text-[14px] text-ink-3">{race.name_en}</p>

        <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-box bg-line">
          <div className="bg-surface px-4 py-3">
            <div className="text-[13px] text-ink-3">대회일</div>
            <div className="num mt-0.5 text-[26px] leading-none font-bold">
              {p.m}.{p.d}
              <span className="ml-1 font-sans text-[14px] font-semibold text-ink-2">{p.w}</span>
            </div>
            <div className="mt-1 text-[13px] text-ink-3">
              {dRace >= 0 ? `${dRace}일 남음` : '종료'}
              {race.date_confidence !== 'confirmed' && `, 날짜 ${CONFIDENCE_LABEL[race.date_confidence]}`}
            </div>
          </div>
          <div className={`px-4 py-3 ${st.hot ? 'bg-accent text-on-accent' : 'bg-surface'}`}>
            <div className={`text-[13px] ${st.hot ? 'opacity-70' : 'text-ink-3'}`}>{st.label}</div>
            <div className="num mt-0.5 text-[26px] leading-none font-bold">
              {st.days != null ? (st.days === 0 ? 'D-DAY' : `D-${st.days}`) : '-'}
            </div>
            <div className={`mt-1 text-[13px] ${st.hot ? 'opacity-70' : 'text-ink-3'}`}>
              {ENTRY_LABEL[race.entry_type]}
              {race.entry_confidence !== 'confirmed' && `, 일정 ${CONFIDENCE_LABEL[race.entry_confidence]}`}
            </div>
          </div>
        </div>
      </header>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
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
              <Fact label="코스" value={race.course ?? '-'} />
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

            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <a
                href={race.official_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-ctl bg-ink px-4 text-sm font-semibold text-bg transition hover:opacity-85"
              >
                공식 홈페이지 <ArrowUpRight size={15} weight="bold" />
              </a>
              {race.source_url && (
                <a
                  href={race.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center gap-1 text-sm font-semibold text-ink-2 underline decoration-line underline-offset-4 hover:text-ink"
                >
                  정보 출처
                </a>
              )}
            </div>

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
