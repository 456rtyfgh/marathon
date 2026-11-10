import { Fragment, memo, type ReactNode } from 'react';
import { CaretRight, Star, BookmarkSimple, Eye, CalendarCheck, Check } from '@phosphor-icons/react';
import type { Race, RaceRating } from '../lib/types';
import { isRunEvent, RUN_EVENT_TEXT } from '../lib/runEvent';
import { dateParts, feeLabel, isDomestic, isTrail, statusLine, raceDayLine, TODAY, shortCount, mayFillEarly, isCancelled, expectedEntryText, majorKind } from '../lib/util';
import { useLang } from '../i18n';
import { ENTRY_TEXT } from '../i18n/format';
import { raceName, whereText } from '../i18n/names';

const dday = (n: number) => (n === 0 ? 'D-DAY' : `D-${n}`);

/** ' · '·', ' 에서만 줄이 바뀌게 덩어리마다 한 덩이로 ('조기\n마감 가능' 처럼 꺾이지 않게). 글자는 그대로.
 *  inline-block + max-w-full: 칸보다 긴 덩어리(`Northern Mariana Islands`)만 그 안에서 줄바꿈 — nowrap 이면 칸 밖으로 넘친다.
 *  ','·' ·' 는 앞 덩어리 안에 둔다 — 따로 두면 줄 첫머리로 떨어진다 */
function Chunks({ text }: { text: string }) {
  const parts = text.split(/(\s·\s|,\s)/);
  const out: ReactNode[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const sep = parts[i + 1] ?? '';
    const mark = sep.trimEnd();
    const body = parts[i] + mark;
    if (body)
      out.push(
        <span key={i} className="inline-block max-w-full">
          {body}
        </span>,
      );
    if (sep) out.push(<Fragment key={`s${i}`}>{sep.slice(mark.length)}</Fragment>);
  }
  return <>{out}</>;
}

/** 제목 옆 작은 표(메이저·트레일·접수 완료·대회 취소) — 한 크기 */
const TAG = 'inline-flex h-5 items-center rounded-tag px-2 text-[12px] font-bold';

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
  const { lang, t } = useLang();
  const today = TODAY();
  const p = dateParts(race.race_date, lang);
  const st = statusLine(race, today, registered, lang);
  const domestic = isDomestic(race);
  const trail = isTrail(race);
  const runEvent = isRunEvent(race);
  const major = majorKind(race);
  const raceDay = raceDayLine(race, today, lang);
  // 선착순 접수 중인데 아직 마감 확인이 안 된 대회. 접수한 사람에게는 필요 없는 말이라 뺀다
  const mayFill = !registered && mayFillEarly(race, today);
  // 취소된 대회: 지우지 않고 남겨 두되 흐리게, D-day 대신 '대회 취소'
  const cancelled = isCancelled(race);
  // 접수 일정이 확정 전(예상·미정)이면 '접수 미정' 아래 작게 예상 날짜만
  const expected = registered ? null : expectedEntryText(race, today, lang);
  // 접수 방식 뒤에 붙는 ', 날짜 예상'·', 상승 n m' — 한 덩어리 글로 이어야 쉼표가 앞 말에 붙는다
  const entryTail =
    (race.date_confidence !== 'confirmed' ? t('row.dateExpected') : '') +
    (trail && race.elevation_gain != null
      ? t('row.gain', { n: race.elevation_gain.toLocaleString(lang === 'en' ? 'en-US' : 'ko-KR') })
      : '');

  return (
    <li style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 104px' }}>
      <button
        onClick={() => onOpen(race)}
        className="group grid w-full grid-cols-[4rem_1fr_auto] items-center gap-x-4 gap-y-2 px-4 py-4 text-left transition-colors hover:bg-surface sm:grid-cols-[5rem_1fr_auto_7.5rem_1.25rem] sm:gap-x-6"
      >
        {/* 대회 날짜 (취소는 흐린 글자색으로 — 투명도는 대비가 모자람) */}
        <div className="flex flex-col items-start leading-none">
          <span className="num text-[12px] font-semibold text-ink-3">
            {t('date.ym', { y: p.y, m: p.m, mon: p.mon })}
          </span>
          <span className={`num mt-0.5 text-[34px] font-bold sm:text-[40px] ${cancelled ? 'text-ink-3' : 'text-ink'}`}>{p.d}</span>
          <span className="text-[12px] text-ink-3">{t('date.weekday', { w: p.w })}</span>
        </div>

        {/* 대회명 (최대 세 줄 — 영어 긴 이름도 거의 다 보이게, 표는 이름 끝에 붙어 같이 줄바꿈) */}
        <div className="min-w-0">
          <div className="line-clamp-3 text-[17px] leading-snug">
            <h3 className={`inline font-bold tracking-tight ${cancelled ? 'text-ink-2' : 'text-ink'}`}>{raceName(race, lang)}</h3>
            {favorite && (
              <BookmarkSimple size={14} weight="fill" className="ml-2 inline-block align-[-1px] text-ink" aria-label={t('row.saved')} />
            )}
            {trail && <span className={`${TAG} ml-2 border border-ink-3 align-[2px] text-ink-2`}>{t('row.trail')}</span>}
            {runEvent && <span className={`${TAG} ml-2 border border-ink-3 align-[2px] text-ink-2`}>{RUN_EVENT_TEXT[lang].badge}</span>}
            {major && (
              <span className={`${TAG} ml-2 bg-ink align-[2px] text-bg`}>{t(major === 'korea' ? 'row.majorKorea' : 'row.majorWorld')}</span>
            )}
          </div>
          <p className="mt-1 text-[15px] leading-snug text-ink-2">
            {lang === 'en' ? <Chunks text={whereText(race, 'en')} /> : domestic ? race.city_ko : `${race.country_ko} ${race.city_ko}`}
            <span className="text-ink-3">
              {'  '}
              {mayFill ? (
                <>
                  {/* 휴대폰은 짧게 */}
                  <span className="sm:hidden">
                    <Chunks text={t('row.fcfsShort') + entryTail} />
                  </span>
                  <span className="hidden sm:inline">
                    <Chunks text={t('row.fcfsLong') + entryTail} />
                  </span>
                </>
              ) : (
                <Chunks text={ENTRY_TEXT[lang][race.entry_type] + entryTail} />
              )}
            </span>
          </p>
          {/* 휴대폰: 예상 접수일은 오른쪽 좁은 칸 대신 여기 한 줄로 — 오른쪽 칸이 넓어져 대회명이 세 줄로 꺾이지 않게 (sm 부터는 오른쪽 칸) */}
          {expected && !cancelled && st.days == null && <p className="num mt-1 text-[13px] text-ink-3 sm:hidden">{expected}</p>}
          {/* 부가 숫자: 작고 흐리게, 숫자도 같은 크기 */}
          {rating && (rating.review_count > 0 || (rating.views ?? 0) > 0) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-3 sm:text-[12px]">
              {rating.review_count > 0 && (
                <span className="inline-flex items-center gap-1">
                  <Star size={12} weight="fill" className="text-ink-2" />
                  <span className="num font-semibold text-ink-2">{Number(rating.avg_rating).toFixed(1)}</span>
                  <span>{t('row.reviews', { count: rating.review_count })}</span>
                </span>
              )}
              {(rating.views ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1" title={t('row.viewsTitle')}>
                  <Eye size={12} />
                  {t('views.pre')}
                  <span className="num">{shortCount(rating.views!, lang)}</span>
                  {t('views.post', { count: rating.views! })}
                </span>
              )}
              {(rating.saves ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1" title={t('row.savesTitle')}>
                  <CalendarCheck size={12} />
                  {t('saves.pre')}
                  <span className="num">{shortCount(rating.saves!, lang)}</span>
                  {t('saves.post', { count: rating.saves! })}
                </span>
              )}
            </p>
          )}
        </div>

        {/* 참가비 · 이동 (데스크톱): 칸 너비를 고정해 행마다 라벨·값 위치가 같게 */}
        <dl className="hidden w-[9rem] grid-cols-[1fr_auto] gap-x-4 text-[13px] leading-5 sm:grid">
          <div className="contents">
            <dt className="whitespace-nowrap text-ink-3">{t('row.fee')}</dt>
            <dd className="num text-right font-semibold whitespace-nowrap text-ink-2">{feeLabel(race, lang)}</dd>
          </div>
          <div className="contents">
            <dt className="whitespace-nowrap text-ink-3">{domestic ? t('row.fromSeoul') : t('row.fromIncheon')}</dt>
            <dd className="num text-right font-semibold whitespace-nowrap text-ink-2">
              {race.flight_hours != null ? t('row.hours', { n: race.flight_hours }) : '-'}
            </dd>
          </div>
          <div className="contents">
            <dt className="whitespace-nowrap text-ink-3">{t('row.raceIn')}</dt>
            <dd className="num text-right font-semibold whitespace-nowrap text-ink-2">
              {raceDay.days != null ? dday(raceDay.days) : cancelled ? '-' : t('row.over')}
            </dd>
          </div>
        </dl>

        {/* 접수 상태 */}
        <div className="col-start-3 row-start-1 flex flex-col items-end text-right sm:col-start-auto sm:row-start-auto">
          {registered && (
            <span className={`${TAG} mb-1 gap-1 bg-ink text-bg`}>
              <Check size={12} weight="bold" />
              {t('row.registered')}
            </span>
          )}
          {cancelled ? (
            <span className={`${TAG} border border-ink-3 text-ink-2`}>{t('st.cancelled')}</span>
          ) : (
            <span className="text-[13px] whitespace-nowrap text-ink-3 sm:text-[12px]">{st.label}</span>
          )}
          {cancelled ? null : st.days != null ? (
            <span
              className={`num mt-0.5 inline-block rounded-tag px-1 text-[26px] font-bold leading-tight ${
                st.hot ? 'bg-accent text-on-accent' : 'text-ink'
              }`}
            >
              {dday(st.days)}
            </span>
          ) : expected ? (
            // 휴대폰에서는 가운데 칸(대회명 아래)에 보인다 — 영어 'Expected Aug 21–Nov 13, 2026' 이 이 칸을 100px 넘게 넓혀 대회명을 꺾었다
            <span className="num mt-0.5 hidden text-[12px] whitespace-nowrap text-ink-3 sm:inline">{expected}</span>
          ) : (
            <span className="mt-1 text-[15px] font-semibold whitespace-nowrap text-ink-3">
              {st.label === t('st.untilFull') ? t('row.open') : st.label === t('st.soldout') ? t('row.full') : ''}
            </span>
          )}
          {/* 휴대폰: 참가비 칸이 숨으므로 대회일 D-day 를 여기 작게 */}
          {!registered && raceDay.days != null && (
            <span className="num mt-1 text-[13px] whitespace-nowrap text-ink-3 sm:hidden">{t('row.raceDday', { d: dday(raceDay.days) })}</span>
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
