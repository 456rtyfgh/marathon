import { memo } from 'react';
import { CaretRight, Star, BookmarkSimple, Eye, CalendarCheck, Check } from '@phosphor-icons/react';
import type { Race, RaceRating } from '../lib/types';
import { ENTRY_LABEL } from '../lib/types';
import { dateParts, feeLabel, isDomestic, isTrail, statusLine, raceDayLine, TODAY, shortCount, mayFillEarly, isCancelled } from '../lib/util';

const dday = (n: number) => (n === 0 ? 'D-DAY' : `D-${n}`);

function RaceRow({
  race,
  rating,
  favorite,
  registered,
  onOpen,
}: {
  race: Race;
  rating?: RaceRating;
  favorite?: boolean;
  /** 접수했어요 체크 → 큰 상태를 대회일 기준으로 */
  registered?: boolean;
  onOpen: (race: Race) => void;
}) {
  const today = TODAY();
  const p = dateParts(race.race_date);
  const thisYear = dateParts(today.toISOString().slice(0, 10)).y;
  const st = statusLine(race, today, registered);
  const domestic = isDomestic(race);
  const trail = isTrail(race);
  const raceDay = raceDayLine(race, today);
  // 선착순 접수 중인데 아직 마감 확인이 안 된 대회. 접수한 사람에게는 필요 없는 말이라 뺀다
  const mayFill = !registered && mayFillEarly(race, today);
  // 취소된 대회: 지우지 않고 남겨 두되 흐리게, D-day 대신 '대회 취소'
  const cancelled = isCancelled(race);

  return (
    <li style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 104px' }}>
      <button
        onClick={() => onOpen(race)}
        className="group grid w-full grid-cols-[4rem_1fr_auto] items-center gap-x-4 gap-y-2 px-3 py-4 text-left transition hover:bg-surface sm:grid-cols-[5rem_1fr_auto_7.5rem_1.25rem] sm:gap-x-6 sm:px-5"
      >
        {/* 대회 날짜 */}
        <div className={`flex flex-col items-start leading-none ${cancelled ? 'opacity-50' : ''}`}>
          <span className="num text-[13px] font-semibold text-ink-3">
            {p.y !== thisYear ? `${p.y}. ${p.m}월` : `${p.m}월`}
          </span>
          <span className="num mt-0.5 text-[34px] font-bold text-ink sm:text-[40px]">{p.d}</span>
          <span className="text-[12px] text-ink-3">{p.w}요일</span>
        </div>

        {/* 대회명 */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`truncate break-keep text-[17px] font-bold tracking-tight ${cancelled ? 'text-ink-2' : 'text-ink'}`}>
              {race.name_ko}
            </h3>
            {favorite && <BookmarkSimple size={15} weight="fill" className="shrink-0 text-ink" aria-label="관심 대회" />}
            {trail && (
              <span className="shrink-0 rounded-tag border border-ink-3 px-1 py-px text-[10px] font-bold text-ink-2">
                트레일
              </span>
            )}
            {race.is_major && (
              <span className="shrink-0 rounded-tag bg-ink px-1.5 py-0.5 text-[10px] font-bold text-bg">
                메이저
              </span>
            )}
          </div>
          <p className="mt-1 truncate break-keep text-[14px] text-ink-2">
            {domestic ? race.city_ko : `${race.country_ko} ${race.city_ko}`}
            <span className="text-ink-3">
              {'  '}
              {mayFill ? (
                <>
                  {/* 휴대폰은 한 줄에 들어가게 짧게 */}
                  <span className="sm:hidden">선착순 · 조기 마감 가능</span>
                  <span className="hidden sm:inline">선착순 · 조기 마감될 수 있음</span>
                </>
              ) : (
                ENTRY_LABEL[race.entry_type]
              )}
              {race.date_confidence !== 'confirmed' && ', 날짜 예상'}
              {trail && race.elevation_gain != null && `, 상승 ${race.elevation_gain.toLocaleString('ko-KR')}m`}
            </span>
          </p>
          {rating && (rating.review_count > 0 || (rating.views ?? 0) > 0) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-ink-2">
              {rating.review_count > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Star size={13} weight="fill" />
                  <span className="num text-[15px] font-semibold">{Number(rating.avg_rating).toFixed(1)}</span>
                  <span className="text-ink-3">후기 {rating.review_count}</span>
                </span>
              )}
              {(rating.views ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 text-ink-3" title="이 대회를 연 횟수">
                  <Eye size={13} />
                  조회 <span className="num text-[14px]">{shortCount(rating.views!)}</span>
                </span>
              )}
              {(rating.saves ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 text-ink-3" title="캘린더 저장·관심 추가 횟수">
                  <CalendarCheck size={13} />
                  저장 <span className="num text-[14px]">{shortCount(rating.saves!)}</span>
                </span>
              )}
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
            <dd className="num text-right text-[15px] font-semibold text-ink">
              {raceDay.days != null ? dday(raceDay.days) : cancelled ? '-' : '종료'}
            </dd>
          </div>
        </dl>

        {/* 접수 상태 */}
        <div className="col-start-3 row-start-1 flex flex-col items-end text-right sm:col-start-auto sm:row-start-auto">
          {registered && (
            <span className="mb-0.5 inline-flex items-center gap-0.5 rounded-tag bg-ink px-1.5 py-px text-[11px] font-bold text-bg">
              <Check size={11} weight="bold" />
              접수 완료
            </span>
          )}
          {cancelled ? (
            <span className="mt-0.5 rounded-tag border border-ink-3 px-1.5 py-0.5 text-[13px] font-bold text-ink-2">대회 취소</span>
          ) : (
            <span className="text-[12px] text-ink-3">{st.label}</span>
          )}
          {cancelled ? null : st.days != null ? (
            <span
              className={`num mt-0.5 inline-block rounded-tag px-1.5 text-[26px] font-bold leading-tight ${
                st.hot ? 'bg-accent text-on-accent' : 'text-ink'
              }`}
            >
              {dday(st.days)}
            </span>
          ) : (
            <span className="mt-1 text-[14px] font-semibold text-ink-3">
              {st.label === '정원 마감 시까지' ? '접수 중' : st.label === '조기 마감' ? '정원 마감' : ''}
            </span>
          )}
          {/* 휴대폰: 참가비 칸이 숨으므로 대회일 D-day 를 여기 작게 */}
          {!registered && raceDay.days != null && (
            <span className="num mt-0.5 text-[12px] text-ink-3 sm:hidden">대회 {dday(raceDay.days)}</span>
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

export default memo(RaceRow);
