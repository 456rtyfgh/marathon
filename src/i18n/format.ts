/**
 * 언어별 날짜·숫자·돈 형식과 고정 용어 (PLAN 2-2·2-3).
 * 워커(worker/site.ts)·Node 스크립트도 import 하므로 브라우저 API·React 를 쓰지 않고, 값 import 는 같은 조건의 src/lib/dateFormat.ts 뿐이다.
 * 날짜는 'YYYY-MM-DD' 를 UTC 자정으로 읽는다 — 시간대로 하루 밀리지 않게.
 */
import type { Lang } from './lang.ts';
import type { Confidence, Course, Discipline, EntryType, Region } from '../lib/types.ts';

export type { Lang };

// 날짜 형식은 src/lib/dateFormat.ts 한 곳에 모았다 (늘 연도를 붙이는 규칙). 예전 import 경로를 위해 다시 내보낸다
export { fmtDate, fmtDateLong, fmtDateShort, fmtDateShortWd, fmtDateRange, fmtMonth, fmtMonthDay, fmtWeekday, monthShortEn } from '../lib/dateFormat.ts';

/** 숫자: ko 는 지금처럼 기본 로캘, en 은 en-US */
export function fmtNumber(n: number, lang: Lang): string {
  return lang === 'en' ? n.toLocaleString('en-US') : n.toLocaleString();
}

/** 화면의 대회 수: ko 는 지금처럼 쉼표 없이 그대로, en 은 '1,056' */
export function fmtCount(n: number, lang: Lang): string {
  return lang === 'en' ? n.toLocaleString('en-US') : String(n);
}

const SYM: Record<string, string> = {
  USD: '$', JPY: '¥', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$',
  SGD: 'S$', HKD: 'HK$', TWD: 'NT$', CNY: '¥', ZAR: 'R',
  MYR: 'RM', THB: '฿', VND: '₫', IDR: 'Rp', NOK: 'kr ', CZK: 'Kč', NZD: 'NZ$', MOP: 'MOP ',
  PHP: '₱', SEK: 'kr ', DKK: 'kr ', TRY: '₺', PLN: 'zł ', ILS: '₪', INR: '₹', BRL: 'R$', MXN: 'MX$',
};

function enCurrency(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${n.toLocaleString('en-US')} ${currency}`;
  }
}

/** 원화 어림값: ko '4만원'·'9,000원' (지금 util.krw), en 1만 원 이상은 천 원 단위로 반올림한 '₩46,000' */
export function fmtKrw(n: number, lang: Lang): string {
  if (lang === 'en') return enCurrency(n >= 10000 ? Math.round(n / 1000) * 1000 : Math.round(n), 'KRW');
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString('ko-KR')}만원`;
  return `${n.toLocaleString('ko-KR')}원`;
}

/** 원화 정확히: ko '1,250,000원', en '₩1,250,000' */
export function fmtKrwExact(n: number, lang: Lang): string {
  return lang === 'en' ? enCurrency(Math.round(n), 'KRW') : `${Math.round(n).toLocaleString('ko-KR')}원`;
}

/** 대회 참가비: ko 는 지금 화면 형식(원화는 만원 어림, 그 밖은 기호+숫자), en 은 Intl 통화 형식 */
export function fmtMoney(n: number, currency: string, lang: Lang): string {
  if (lang === 'en') return enCurrency(n, currency);
  if (currency === 'KRW') return fmtKrw(n, 'ko');
  const s = SYM[currency];
  return s ? `${s}${n.toLocaleString()}` : `${n.toLocaleString()} ${currency}`;
}

export const ENTRY_TEXT: Record<Lang, Record<EntryType, string>> = {
  ko: { lottery: '추첨', fcfs: '선착순', qualifying: '기록 기준', tour_only: '여행사 전용', open: '상시 접수' },
  en: { lottery: 'Lottery', fcfs: 'First come, first served', qualifying: 'Qualifying time', tour_only: 'Tour operators only', open: 'Open entry' },
};

export type StatusKey = 'open' | 'upcoming' | 'soldout' | 'closed' | 'unknown' | 'cancelled';
export const STATUS_TEXT: Record<Lang, Record<StatusKey, string>> = {
  ko: { open: '접수 중', upcoming: '접수 예정', soldout: '조기 마감', closed: '접수 마감', unknown: '일정 미공개', cancelled: '대회 취소' },
  en: { open: 'Open', upcoming: 'Opening soon', soldout: 'Sold out', closed: 'Closed', unknown: 'Dates TBA', cancelled: 'Cancelled' },
};

export const CONFIDENCE_TEXT: Record<Lang, Record<Confidence, string>> = {
  ko: { confirmed: '확정', expected: '예상', tbc: '미정' },
  en: { confirmed: 'Confirmed', expected: 'Expected', tbc: 'TBC' },
};

export const REGION_TEXT: Record<Lang, Record<Region, string>> = {
  ko: { 한국: '한국', 일본: '일본', 아시아: '아시아', 오세아니아: '오세아니아', 유럽: '유럽', 북미: '북미', 기타: '기타' },
  en: { 한국: 'Korea', 일본: 'Japan', 아시아: 'Asia', 오세아니아: 'Oceania', 유럽: 'Europe', 북미: 'North America', 기타: 'Other' },
};

export const COURSE_TEXT: Record<Lang, Record<Course, string>> = {
  ko: { 평지: '평지', 완만: '완만', 언덕: '언덕' },
  en: { 평지: 'Flat', 완만: 'Rolling', 언덕: 'Hilly' },
};

export const DISCIPLINE_TEXT: Record<Lang, Record<Discipline, string>> = {
  ko: { road: '로드', trail: '트레일' },
  en: { road: 'Road', trail: 'Trail' },
};

export type CalKey = 'race' | 'open' | 'close';
export const CAL_TEXT: Record<Lang, Record<CalKey, string>> = {
  ko: { race: '대회 날', open: '접수 시작', close: '접수 마감' },
  en: { race: 'Race day', open: 'Registration opens', close: 'Registration closes' },
};

/** 종목 이름: ko '풀' → '풀코스'(SSR·정적 페이지 형식), en '풀' → 'Marathon', '하프' → 'Half', '10마일' → '10 mi' */
export const DIST_TEXT: Record<Lang, (d: string) => string> = {
  ko: (d) => ({ 풀: '풀코스', 하프: '하프' })[d] ?? d,
  en: (d) => {
    if (d === '풀') return 'Marathon';
    if (d === '하프') return 'Half';
    if (d === '건강달리기') return 'Fun run';
    const mi = /^([\d.]+)\s*마일$/.exec(d);
    return mi ? `${mi[1]} mi` : d;
  },
};
