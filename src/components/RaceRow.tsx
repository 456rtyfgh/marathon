import { CaretRight, Star, BookmarkSimple } from '@phosphor-icons/react';
import type { Race, RaceRating } from '../lib/types';
import { ENTRY_LABEL } from '../lib/types';
import { dateParts, feeLabel, isDomestic, statusLine, TODAY, daysBetween } from '../lib/util';

export default function RaceRow({
  race,
  rating,
  favorite,
  onOpen,
}: {
  race: Race;
  rating?: RaceRating;
  favorite?: boolean;
  onOpen: () => void;
}) {
  const today = TODAY();
  const p = dateParts(race.race_date);
  const thisYear = dateParts(today.toISOString().slice(0, 10)).y;
  const st = statusLine(race, today);
  const domestic = isDomestic(race);
  const daysToRace = daysBetween(today, race.race_date);

  return (
    <li>
      <button
        onClick={onOpen}
        className="group grid w-full grid-cols-[4rem_1fr_auto] items-center gap-x-4 gap-y-2 px-3 py-4 text-left transition hover:bg-surface sm:grid-cols-[5rem_1fr_auto_7.5rem_1.25rem] sm:gap-x-6 sm:px-5"
      >
        {/* 대회 날짜 */}
        <div className="flex flex-col items-start leading-none">
          <span className="num text-[13px] font-semibold text-ink-3">
            {p.y !== thisYear ? `${p.y}. ${p.m}월` : `${p.m}월`}
          </span>
          <span className="num mt-0.5 text-[34px] font-bold text-ink sm:text-[40px]">{p.d}</span>
          <span className="text-[12px] text-ink-3">{p.w}요일</span>
        </div>

        {/* 대회명 */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[17px] font-bold tracking-tight text-ink">{race.name_ko}</h3>
            {favorite && <BookmarkSimple size={15} weight="fill" className="shrink-0 text-ink" aria-label="관심 대회" />}
            {race.is_major && (
              <span className="shrink-0 rounded-tag bg-ink px-1.5 py-0.5 text-[10px] font-bold text-bg">
                메이저
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-[14px] text-ink-2">
            {domestic ? race.city_ko : `${race.country_ko} ${race.city_ko}`}
            <span className="text-ink-3">
              {'  '}
              {ENTRY_LABEL[race.entry_type]}
              {race.date_confidence !== 'confirmed' && ', 날짜 예상'}
            </span>
          </p>
          {rating && rating.review_count > 0 && (
            <p className="mt-1 flex items-center gap-1 text-[13px] text-ink-2">
              <Star size={13} weight="fill" />
              <span className="num text-[15px] font-semibold">{Number(rating.avg_rating).toFixed(1)}</span>
              <span className="text-ink-3">후기 {rating.review_count}</span>
            </p>
          )}
        </div>

        {/* 참가비 · 이동 (데스크톱) */}
        <dl className="hidden grid-cols-[auto_auto] gap-x-4 text-[13px] leading-5 text-ink-2 sm:grid">
          <div className="contents">
            <dt className="text-ink-3">참가비</dt>
            <dd className="num text-right text-[15px] font-semibold text-ink">{feeLabel(race)}</dd>
          </div>
          <div className="contents">
            <dt className="text-ink-3">{domestic ? '서울에서' : '인천에서'}</dt>
            <dd className="num text-right text-[15px] font-semibold text-ink">
              {race.flight_hours != null ? `${race.flight_hours}시간` : '-'}
            </dd>
          </div>
          <div className="contents">
            <dt className="text-ink-3">대회까지</dt>
            <dd className="num text-right text-[15px] font-semibold text-ink">{daysToRace >= 0 ? `${daysToRace}일` : '종료'}</dd>
          </div>
        </dl>

        {/* 접수 상태 */}
        <div className="col-start-3 row-start-1 flex flex-col items-end text-right sm:col-start-auto sm:row-start-auto">
          <span className="text-[12px] text-ink-3">{st.label}</span>
          {st.days != null ? (
            <span
              className={`num mt-0.5 inline-block rounded-tag px-1.5 text-[26px] font-bold leading-tight ${
                st.hot ? 'bg-accent text-on-accent' : 'text-ink'
              }`}
            >
              {st.days === 0 ? 'D-DAY' : `D-${st.days}`}
            </span>
          ) : (
            <span className="mt-1 text-[14px] font-semibold text-ink-3">
              {st.label === '정원 마감 시까지' ? '접수 중' : ''}
            </span>
          )}
        </div>

        <CaretRight
          size={18}
          weight="bold"
          className="hidden text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink sm:block"
        />
      </button>
    </li>
  );
}
