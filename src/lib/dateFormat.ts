/**
 * 대회 일정 날짜 형식 — 화면·워커·Node 스크립트가 모두 이 규칙 하나를 쓴다.
 * 브라우저 API·React·값 import 없음 (worker/site.ts·scripts/*.mjs 도 import 한다).
 * 'YYYY-MM-DD' 는 UTC 자정으로 읽는다 — 시간대로 하루 밀리지 않게.
 *
 * 규칙: 날짜에는 늘 연도를 붙인다.
 *   긴 형식 (본문·상세 칸)   ko '2027년 2월 28일(일)'  en 'Sun, Feb 28, 2027'
 *   연도+날짜만            ko '2027년 2월 28일'      en 'Feb 28, 2027'
 *   짧은 형식 (좁은 칸)     ko '27.2.28'             en 'Feb 28, 2027'
 *   기간 (짧은 형식)        ko '27.2.28~3.5'         en 'Feb 28–Mar 5, 2027'
 *     연도가 다르면 양쪽 다: ko '26.12.28~27.1.5'   en 'Dec 28, 2026–Jan 5, 2027'
 */
export type DateLang = 'ko' | 'en';

const utc = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z');
const EN_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const EN_MD = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const EN_MONTH = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const EN_MONTH_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' });
const EN_WD = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' });
export const KO_WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** '일' | 'Sun' */
export function fmtWeekday(iso: string, lang: DateLang): string {
  const d = utc(iso);
  return lang === 'en' ? EN_WD.format(d) : KO_WEEKDAY[d.getUTCDay()];
}

/** 'Feb' (영어 짧은 달 이름) */
export const monthShortEn = (iso: string) => EN_MONTH_SHORT.format(utc(iso));

/** 연도+날짜: '2027년 2월 28일' | 'Feb 28, 2027' */
export function fmtDate(iso: string, lang: DateLang): string {
  const d = utc(iso);
  if (lang === 'en') return EN_DATE.format(d);
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** 긴 형식 (요일 포함): '2027년 2월 28일(일)' | 'Sun, Feb 28, 2027' */
export function fmtDateLong(iso: string, lang: DateLang): string {
  if (lang === 'en') return `${fmtWeekday(iso, 'en')}, ${fmtDate(iso, 'en')}`;
  return `${fmtDate(iso, 'ko')}(${fmtWeekday(iso, 'ko')})`;
}

/** 좁은 칸에서 'Feb 28,' / '2027' 처럼 날짜 하나가 둘로 꺾이지 않게 영어 날짜 안 빈칸은 줄바꿈 없는 빈칸으로 */
const keep = (s: string) => s.replace(/ /g, ' ');

/** 짧은 형식: '27.2.28' | 'Feb 28, 2027' (영어 빈칸은 줄바꿈 없는 빈칸) */
export function fmtDateShort(iso: string, lang: DateLang): string {
  const d = utc(iso);
  if (lang === 'en') return keep(EN_DATE.format(d));
  return `${String(d.getUTCFullYear()).slice(2)}.${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
}

/** 짧은 형식 + 요일: '27.2.28(일)' | 'Sun, Feb 28, 2027' */
export function fmtDateShortWd(iso: string, lang: DateLang): string {
  if (lang === 'en') return keep(fmtDateLong(iso, 'en'));
  return `${fmtDateShort(iso, 'ko')}(${fmtWeekday(iso, 'ko')})`;
}

/** 기간 (짧은 형식). 같은 해면 연도는 한 번: '27.2.28~3.5' | 'Feb 28–Mar 5, 2027' (영어는 같은 달이면 'Feb 3–10, 2027') */
export function fmtDateRange(a: string, b: string, lang: DateLang): string {
  if (a === b) return fmtDateShort(a, lang);
  const da = utc(a);
  const db = utc(b);
  const sameYear = da.getUTCFullYear() === db.getUTCFullYear();
  if (lang === 'en') {
    if (!sameYear) return keep(`${EN_DATE.format(da)}–${EN_DATE.format(db)}`);
    const sameMonth = da.getUTCMonth() === db.getUTCMonth();
    // 같은 해 기간은 대시 뒤에서도 꺾이지 않게(U+2060) — 좁은 칸에서는 'Expected' / 'Aug 10–Nov 7, 2026' 로 나뉜다
    return keep(`${EN_MD.format(da)}–⁠${sameMonth ? db.getUTCDate() : EN_MD.format(db)}, ${db.getUTCFullYear()}`);
  }
  return `${fmtDateShort(a, 'ko')}~${sameYear ? `${db.getUTCMonth() + 1}.${db.getUTCDate()}` : fmtDateShort(b, 'ko')}`;
}

/** 'YYYY-MM' → '2027년 2월' | 'February 2027' */
export function fmtMonth(ym: string, lang: DateLang): string {
  if (lang === 'en') return EN_MONTH.format(utc(ym.slice(0, 7) + '-01'));
  return `${Number(ym.slice(0, 4))}년 ${Number(ym.slice(5, 7))}월`;
}

/** 연도 없는 '2/28' | 'Feb 28' — 연도가 바로 옆에 이미 있는 곳(같은 해 기간의 뒤쪽 등)에서만 쓴다 */
export function fmtMonthDay(iso: string, lang: DateLang): string {
  const d = utc(iso);
  if (lang === 'en') return EN_MD.format(d);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}
