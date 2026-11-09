import type { Race } from './types';
import { TODAY, daysBetween } from './util';
import { provinceOf } from './places';
import type { Lang } from '../i18n/lang';
import { translate } from '../i18n/t';

/** 국내 대회 숙소·교통 예약 사이트로 바로 가는 링크. 주소 형식은 직접 열어 확인한 것만 쓴다 (PLAN §6, 2026-11-06). */
export interface BookingLink {
  id: string;
  label: string;
  url: string;
  note?: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

const DAY = 86400000;

/** 가장 긴 종목이 100km 이상이면 (100K·100M 트레일 등) 다음 날 끝나는 대회로 본다 */
export function endsNextDay(race: Race): boolean {
  return race.distances.some((d) => {
    const m = /^(\d+(?:\.\d+)?)\s*(k|km|m)$/i.exec(d.trim());
    if (!m) return false;
    const km = m[2].toLowerCase() === 'm' ? Number(m[1]) * 1.609 : Number(m[1]);
    return km >= 100;
  });
}

/**
 * 전날 체크인 / 당일 체크아웃 (100km 이상 대회는 다음 날 체크아웃).
 * 날짜 미정이거나 이미 지났으면(전날이 오늘보다 앞) null
 */
export function stayDates(race: Race, today = TODAY()): { checkIn: string; checkOut: string; nextDay: boolean } | null {
  if (race.date_confidence === 'tbc') return null;
  if (daysBetween(today, race.race_date) < 1) return null;
  const day = new Date(race.race_date + 'T00:00:00Z').getTime();
  const nextDay = endsNextDay(race);
  return { checkIn: iso(new Date(day - DAY)), checkOut: nextDay ? iso(new Date(day + DAY)) : race.race_date, nextDay };
}

/** 대회 장소 이름이라 숙소 검색어로는 결과가 거의 없는 곳 → 가까운 시·군 */
const PLACE_TO_TOWN: Record<string, string> = { 임진각: '파주', 경인아라뱃길: '김포' };

/**
 * 숙소 검색어. city_ko 는 '경남 김해', '서울 강남', '광주 남구', '경북 안동·예천' 처럼 시·도가 앞에 온다.
 * 보통은 두 번째 말('김해')만 쓰고, '남구'·'사하구' 같은 구 이름은 다른 도시와 겹칠 수 있어 시·도를 붙인다.
 */
export function stayQuery(race: Race): string {
  const words = (race.city_ko || '').trim().split(/\s+/).map((w) => w.split('·')[0]).filter(Boolean);
  if (words.length === 0) return race.name_ko;
  if (words.length === 1) return words[0];
  const [head, place] = words;
  if (PLACE_TO_TOWN[place]) return PLACE_TO_TOWN[place];
  return place.endsWith('구') ? `${head} ${place}` : place;
}

/** 울릉도는 배로만 간다 */
export const isUlleung = (race: Race) => /울릉/.test(race.city_ko || '');

export function stayLinks(race: Race, today = TODAY(), lang: Lang = 'ko'): BookingLink[] {
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const q = stayQuery(race);
  const dates = stayDates(race, today);
  const yeogi = new URLSearchParams({ keyword: q, personal: '1' });
  const airbnb = new URLSearchParams({ adults: '1' });
  if (dates) {
    yeogi.set('checkIn', dates.checkIn);
    yeogi.set('checkOut', dates.checkOut);
    airbnb.set('checkin', dates.checkIn);
    airbnb.set('checkout', dates.checkOut);
  }
  return [
    { id: 'yeogi', label: t('book.yeogi'), url: `https://www.yeogi.com/domestic-accommodations?${yeogi}`, note: t('book.yeogiNote') },
    {
      id: 'airbnb',
      label: t('book.airbnb'),
      url: `https://www.airbnb.co.kr/s/${encodeURIComponent(q)}/homes?${airbnb}`,
      note: t('book.airbnbNote'),
    },
  ];
}

const ymd = (s: string) => s.replaceAll('-', '');

export function transportLinks(race: Race, today = TODAY(), lang: Lang = 'ko'): BookingLink[] {
  const t = (k: Parameters<typeof translate>[1], v?: Record<string, string>) => translate(lang, k, v);
  // 울릉도 여객선은 항구·선사마다 예매처가 달라 확인된 한 곳이 없다 → 링크 없이 안내 문구만 (CostCalculator)
  if (isUlleung(race)) return [];
  // 제주는 기차·고속버스가 없으니 항공권만
  if (provinceOf(race) === 'jeju') {
    const dates = stayDates(race, today);
    return [
      {
        id: 'naver-flight',
        label: t('book.flight'),
        url: dates
          ? `https://flight.naver.com/flights/domestic/SEL-CJU-${ymd(dates.checkIn)}/CJU-SEL-${ymd(dates.checkOut)}?adult=1&fareType=YC`
          : 'https://flight.naver.com/',
        note: dates ? t('book.flightNote', { back: dates.nextDay ? t('book.nextDay') : t('book.sameDay') }) : t('book.flightNoteNoDate'),
      },
    ];
  }
  return [
    { id: 'korail', label: t('book.korail'), url: 'https://www.korail.com/ticket/search/general', note: t('book.korailNote') },
    { id: 'srt', label: t('book.srt'), url: 'https://etk.srail.kr/hpg/hra/01/selectScheduleList.do?pageId=TK0101010000', note: t('book.srtNote') },
    { id: 'kobus', label: t('book.kobus'), url: 'https://www.kobus.co.kr/mrs/rotinf.do', note: t('book.kobusNote') },
    { id: 'txbus', label: t('book.txbus'), url: 'https://txbus.t-money.co.kr/main.do', note: t('book.txbusNote') },
  ];
}

/**
 * 당일치기: 대회장 근처 식당·사우나 지도 검색. 검색어는 숙소와 같은 stayQuery.
 * 네이버 지도 /p/search/<검색어> — PC 는 그 검색, 휴대폰은 m.map.naver.com/search?query= 로 넘어가 검색어 유지 (2026-11-08 확인)
 */
export function nearbyLinks(race: Race, lang: Lang = 'ko'): BookingLink[] {
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  const q = stayQuery(race);
  const naver = (term: string) => `https://map.naver.com/p/search/${encodeURIComponent(`${q} ${term}`)}`;
  return [
    { id: 'map-food', label: t('book.food'), url: naver('맛집'), note: t('book.foodNote') },
    { id: 'map-sauna', label: t('book.sauna'), url: naver('사우나'), note: t('book.saunaNote') },
  ];
}
