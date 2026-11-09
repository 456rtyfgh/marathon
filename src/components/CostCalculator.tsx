import { useMemo, useState } from 'react';
import { ArrowUpRight, Minus, Plus } from '@phosphor-icons/react';
import type { Race, CostBaseline } from '../lib/types';
import { costFor, feeToKrw, feeLabel, krwExact, isDomestic } from '../lib/util';
import { isUlleung, nearbyLinks, stayDates, stayLinks, stayQuery, transportLinks, type BookingLink } from '../lib/booking';
import { track } from '../lib/analytics';
import { useLang } from '../i18n';
import { cityName } from '../i18n/names';

type Tier = 'low' | 'mid' | 'high';

export default function CostCalculator({ race, costs }: { race: Race; costs: CostBaseline[] }) {
  return isDomestic(race) ? <DomesticBooking race={race} /> : <Estimate race={race} costs={costs} />;
}

/** 국내 대회: 금액 추정 대신 숙소·교통 예약 사이트로 바로 연결 */
function DomesticBooking({ race }: { race: Race }) {
  const { lang, t } = useLang();
  const dates = stayDates(race);
  const stays = stayLinks(race, undefined, lang);
  const rides = transportLinks(race, undefined, lang);
  const jeju = rides.length === 1 && rides[0].id === 'naver-flight';
  const ferry = isUlleung(race);
  const out = dates?.nextDay ? t('cost.nextDayOut') : t('cost.sameDayOut');
  // 검색어는 한국어 그대로(예약 사이트가 한국어), 영어 화면 글에는 영어 지명
  const q = lang === 'en' ? (cityName(race, 'en') ?? race.name_en) : stayQuery(race);
  return (
    <div className="space-y-7">
      <section className="space-y-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{t('cost.stayTitle')}</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {!dates
              ? t('cost.stayNoDate', { q })
              : race.date_confidence === 'expected'
                ? t('cost.stayExpected', { out, q })
                : t('cost.stayConfirmed', { out, q })}
            {dates?.nextDay && t('cost.stayLong')}
          </p>
        </div>
        <BookingList race={race} links={stays} />
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{t('cost.rideTitle')}</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {ferry ? t('cost.rideFerry') : jeju ? t('cost.rideJeju') : t('cost.rideOther')}
          </p>
        </div>
        {rides.length > 0 && <BookingList race={race} links={rides} />}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-[15px] font-semibold text-ink">{t('cost.nearTitle')}</h3>
          <p className="mt-0.5 text-[13px] text-ink-3">{t('cost.nearText', { q })}</p>
        </div>
        <BookingList race={race} links={nearbyLinks(race, lang)} />
      </section>

      <dl className="flex items-baseline justify-between gap-4 border-t border-line pt-4">
        <dt className="text-[14px] text-ink-2">{t('cost.fee')}</dt>
        <dd className="num text-[17px] font-semibold text-ink">{feeLabel(race, lang)}</dd>
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
  const { lang, t } = useLang();
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
    return <p className="text-sm text-ink-3">{t('cost.noBase')}</p>;
  }

  const rows: [string, number, string][] = [
    [t('cost.flight'), r.travel, t('cost.people', { n: people })],
    [t('cost.hotel'), r.hotel, nights ? t('cost.nightsRooms', { n: nights, r: r.rooms }) : t('cost.dayTrip')],
    [t('cost.daily'), r.daily, t('cost.days', { n: nights + 1 })],
    [t('cost.feeRow'), r.fee, race.entry_fee ? t('cost.people', { n: people }) : t('cost.tba')],
    [t('cost.misc'), r.misc, ''],
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stepper label={t('cost.nights')} unit={t('cost.nightUnit')} value={nights} min={0} max={14} onChange={setNights} />
        <Stepper label={t('cost.peopleLabel')} unit={t('cost.peopleUnit')} value={people} min={1} max={30} onChange={setPeople} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label={t('cost.tierAria')} className="inline-flex rounded-ctl bg-sunken p-1">
          {(['low', 'mid', 'high'] as Tier[]).map((tier_) => (
            <button
              key={tier_}
              role="radio"
              aria-checked={tier === tier_}
              onClick={() => setTier(tier_)}
              className={`h-9 rounded-[4px] border px-3.5 text-[14px] font-semibold transition ${
                tier === tier_ ? 'border-line bg-surface text-ink' : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              {t(`cost.tier.${tier_}` as const)}
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
            {t('cost.share')}
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
              <dd className="num text-[17px] font-semibold text-ink">{krwExact(value, lang)}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-end justify-between gap-4 border-t-2 border-ink px-4 py-4">
          <div>
            <div className="text-[13px] text-ink-3">{t('cost.total')}</div>
            {people > 1 && <div className="num text-[15px] text-ink-2">{t('cost.per', { v: krwExact(r.per, lang) })}</div>}
          </div>
          <div className="num text-[32px] font-bold leading-none">{krwExact(r.total, lang)}</div>
        </div>
      </div>

      <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-3">{t('cost.note')}</p>
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
  const { t } = useLang();
  const btn =
    'grid size-11 place-items-center sm:size-9 rounded-ctl text-ink-2 transition hover:bg-sunken hover:text-ink active:scale-95 disabled:opacity-30';
  return (
    <div className="flex items-center justify-between rounded-box bg-surface px-3 py-2.5">
      <span className="shrink-0 whitespace-nowrap text-[14px] text-ink-2">{label}</span>
      <div className="flex items-center gap-1">
        <button className={btn} aria-label={t('cost.less', { label: label.toLowerCase() })} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus size={16} weight="bold" />
        </button>
        <span className="num w-12 text-center text-[22px] font-bold">
          {value}
          <span className="ml-0.5 text-[14px] font-semibold text-ink-3">{unit}</span>
        </span>
        <button className={btn} aria-label={t('cost.more', { label: label.toLowerCase() })} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus size={16} weight="bold" />
        </button>
      </div>
    </div>
  );
}
