import type { Race } from './types';
import { TODAY, daysBetween } from './util';
import { provinceOf } from './places';

/** 국내 대회 숙소·교통 예약 사이트로 바로 가는 링크. 주소 형식은 직접 열어 확인한 것만 쓴다 (PLAN §6, 2026-11-06). */
export interface BookingLink {
  id: string;
  label: string;
  url: string;
  note?: string;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** 전날 체크인 / 당일 체크아웃. 날짜 미정이거나 이미 지났으면(전날이 오늘보다 앞) null */
export function stayDates(race: Race, today = TODAY()): { checkIn: string; checkOut: string } | null {
  if (race.date_confidence === 'tbc') return null;
  if (daysBetween(today, race.race_date) < 1) return null;
  const day = new Date(race.race_date + 'T00:00:00Z');
  return { checkIn: iso(new Date(day.getTime() - 86400000)), checkOut: race.race_date };
}

/**
 * 숙소 검색어. city_ko 는 '경남 김해', '서울 강남', '광주 남구', '경북 안동·예천' 처럼 시·도가 앞에 온다.
 * 보통은 두 번째 말('김해')만 쓰고, '남구'·'사하구' 같은 구 이름은 다른 도시와 겹칠 수 있어 시·도를 붙인다.
 */
export function stayQuery(race: Race): string {
  const words = (race.city_ko || '').trim().split(/\s+/).map((w) => w.split('·')[0]).filter(Boolean);
  if (words.length === 0) return race.name_ko;
  if (words.length === 1) return words[0];
  const [head, place] = words;
  return place.endsWith('구') ? `${head} ${place}` : place;
}

export function stayLinks(race: Race, today = TODAY()): BookingLink[] {
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
    { id: 'yeogi', label: '여기어때', url: `https://www.yeogi.com/domestic-accommodations?${yeogi}`, note: '호텔·모텔·펜션' },
    {
      id: 'airbnb',
      label: '에어비앤비',
      url: `https://www.airbnb.co.kr/s/${encodeURIComponent(q)}/homes?${airbnb}`,
      note: '집 전체·방',
    },
  ];
}

const ymd = (s: string) => s.replaceAll('-', '');

export function transportLinks(race: Race, today = TODAY()): BookingLink[] {
  // 제주는 기차·고속버스가 없으니 항공권만
  if (provinceOf(race) === 'jeju') {
    const dates = stayDates(race, today);
    return [
      {
        id: 'naver-flight',
        label: '항공권',
        url: dates
          ? `https://flight.naver.com/flights/domestic/SEL-CJU-${ymd(dates.checkIn)}/CJU-SEL-${ymd(dates.checkOut)}?adult=1&fareType=YC`
          : 'https://flight.naver.com/',
        note: dates ? '서울↔제주 왕복, 대회 전날 출발' : '서울↔제주',
      },
    ];
  }
  return [
    { id: 'korail', label: '코레일', url: 'https://www.korail.com/ticket/search/general', note: 'KTX·ITX·무궁화' },
    { id: 'srt', label: 'SRT', url: 'https://etk.srail.kr/hpg/hra/01/selectScheduleList.do?pageId=TK0101010000', note: '수서·동탄 출발' },
    { id: 'kobus', label: '고속버스', url: 'https://www.kobus.co.kr/mrs/rotinf.do', note: '고속버스 통합예매' },
    { id: 'txbus', label: '시외버스', url: 'https://txbus.t-money.co.kr/main.do', note: '시외버스 통합예매' },
  ];
}
