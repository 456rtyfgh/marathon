import type { Race, CostBaseline } from './types';
import { FX } from './seed';
import type { Lang } from '../i18n/lang';
import { translate } from '../i18n/t';
import { fmtKrw, fmtKrwExact, fmtMoney } from '../i18n/format';
import { fmtDateLong, fmtDateRange, fmtDateShort as fmtDateShortLang, fmtWeekday, monthShortEn } from './dateFormat';
export { fmtDateRange, fmtDateShortWd } from './dateFormat';

/** 한국 시간 기준 오늘 (UTC 자정으로 표현) */
export const TODAY = () => new Date(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z');

export function daysBetween(from: Date, isoDate: string): number {
  const to = new Date(isoDate + 'T00:00:00Z');
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/** 오늘 날짜 'YYYY-MM-DD' (한국 시간). new Date().toISOString() 은 UTC 라 0~9시에 하루 밀린다 */
export const todayISO = () => TODAY().toISOString().slice(0, 10);

export type EntryStatus = 'open' | 'upcoming' | 'soldout' | 'closed' | 'unknown' | 'cancelled';

/** notes_ko 가 '[취소]' 또는 '[중단]' 으로 시작 (앞 공백 무시) */
export const CANCEL_TAG_RE = /^\s*\[(취소|중단)\]\s*/;

/** 주최 측이 취소·중단을 알린 대회. 취소 판단은 이 함수 하나로만 한다 */
export function isCancelled(race: Pick<Race, 'notes_ko'>): boolean {
  return !!race.notes_ko && CANCEL_TAG_RE.test(race.notes_ko);
}

/** 화면에 보일 메모: 취소 태그를 뗀 notes_ko (없으면 null). en 은 notes_en — 비어 있으면 보이지 않는다(한국어를 섞지 않게) */
export function noteText(race: Pick<Race, 'notes_ko' | 'notes_en'>, lang: Lang = 'ko'): string | null {
  if (lang === 'en') return race.notes_en?.trim() || null;
  const t = race.notes_ko?.replace(CANCEL_TAG_RE, '').trim();
  return t || null;
}

/** 조기 마감일이 들어 있고 오늘이거나 지났으면 true */
export function isSoldOut(race: Race, today = TODAY()): boolean {
  return !!race.sold_out_on && daysBetween(today, race.sold_out_on) <= 0;
}

/** 접수 일정이 공식 확정인가. 'expected'·'tbc' 만 false (값이 없으면 확정으로 본다) */
export function isEntryConfirmed(race: Pick<Race, 'entry_confidence'>): boolean {
  return race.entry_confidence !== 'expected' && race.entry_confidence !== 'tbc';
}

/** 'YYYY-MM-DD' → 좁은 칸 날짜 '26.11.10' · en 'Nov 10, 2026' (늘 연도 포함, src/lib/dateFormat.ts) */
export function monthDay(iso: string, lang: Lang = 'ko'): string {
  return fmtDateShortLang(iso, lang);
}

/**
 * 확정 안 된 접수 일정의 작은 안내 글: '예상 26.11.10~11.15' / '예상 26.11.10' / null (en 'Expected Nov 10–15, 2026').
 * 확정·취소·조기 마감·이미 끝난 대회, 접수일이 둘 다 없는 대회는 null.
 */
export function expectedEntryText(race: Race, today = TODAY(), lang: Lang = 'ko'): string | null {
  if (isEntryConfirmed(race) || isCancelled(race) || isSoldOut(race, today)) return null;
  if (daysBetween(today, race.race_date) < 0) return null;
  const { entry_opens: o, entry_closes: c } = race;
  if (o && c && o !== c) return translate(lang, 'st.expectedRange', { r: fmtDateRange(o, c, lang) });
  const one = o ?? c;
  return one ? translate(lang, 'st.expectedOne', { a: monthDay(one, lang) }) : null;
}

/**
 * 날짜만 보고 정한 접수 상태 (확정 여부는 보지 않는다. 관리 화면용).
 * 조기 마감은 접수가 열린 뒤(open·closed)에만 인정한다.
 * 접수 시작 전인데 조기 마감일이 있으면 데이터 오류로 보고 'upcoming' 을 둔다.
 */
export function entryStatusByDate(race: Race, today = TODAY()): EntryStatus {
  if (isCancelled(race)) return 'cancelled';
  const { entry_opens, entry_closes } = race;
  if (!entry_opens && !entry_closes) return isSoldOut(race, today) ? 'soldout' : 'unknown';
  const o = entry_opens ? daysBetween(today, entry_opens) : -Infinity;
  const c = entry_closes ? daysBetween(today, entry_closes) : Infinity;
  if (o > 0) return 'upcoming';
  if (isSoldOut(race, today)) return 'soldout';
  if (c < 0) return 'closed';
  return 'open';
}

/**
 * 화면·묶음·요약·정렬에 쓰는 접수 상태.
 * 접수 일정이 확정되지 않은 대회(예상·미정)는 날짜가 있어도 '일정 미공개'(unknown) 묶음으로 둔다
 * — 예상 날짜로 D-day·접수 중·알림이 나가지 않게. 조기 마감은 사실이므로 그대로 둔다.
 */
export function entryStatus(race: Race, today = TODAY()): EntryStatus {
  if (isCancelled(race)) return 'cancelled';
  if (isEntryConfirmed(race)) return entryStatusByDate(race, today);
  if (isSoldOut(race, today)) return 'soldout';
  // 이미 끝난 대회는 날짜상 마감이면 지금처럼 '접수 마감' (끝난 대회 목록이 '접수 미정' 으로 바뀌지 않게)
  if (daysBetween(today, race.race_date) < 0 && entryStatusByDate(race, today) === 'closed') return 'closed';
  return 'unknown';
}

/** 선착순인데 접수 중이고 아직 조기 마감 확인이 안 된 대회 */
export function mayFillEarly(race: Race, today = TODAY()): boolean {
  return race.entry_type === 'fcfs' && entryStatus(race, today) === 'open';
}

export const STATUS_LABEL: Record<EntryStatus, string> = {
  open: '접수 중',
  upcoming: '접수 예정',
  soldout: '조기 마감',
  closed: '접수 마감',
  unknown: '일정 미공개',
  cancelled: '대회 취소',
};

/** 대회일까지 남은 날 */
export function raceDayLine(race: Race, today = TODAY(), lang: Lang = 'ko'): { label: string; days: number | null } {
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  if (isCancelled(race)) return { label: t('st.cancelled'), days: null };
  const d = daysBetween(today, race.race_date);
  if (d < 0) return { label: t('st.raceOver'), days: null };
  return { label: d === 0 ? t('st.raceToday') : t('st.raceIn'), days: d };
}

/** 목록 오른쪽에 크게 보여줄 상태 한 줄. 접수한 대회면 대회일 기준 */
export function statusLine(
  race: Race,
  today = TODAY(),
  registered = false,
  lang: Lang = 'ko',
): { label: string; days: number | null; hot: boolean } {
  const t = (k: Parameters<typeof translate>[1]) => translate(lang, k);
  if (isCancelled(race)) return { label: t('st.cancelled'), days: null, hot: false };
  if (registered) return { ...raceDayLine(race, today, lang), hot: false };
  const st = entryStatus(race, today);
  if (st === 'open') {
    if (!race.entry_closes) return { label: t('st.untilFull'), days: null, hot: false };
    const d = daysBetween(today, race.entry_closes);
    return { label: d === 0 ? t('st.closesToday') : t('st.closesIn'), days: d, hot: d <= 7 };
  }
  if (st === 'upcoming') {
    const d = race.entry_opens ? daysBetween(today, race.entry_opens) : null;
    return { label: t('st.opensIn'), days: d, hot: false };
  }
  if (st === 'soldout') return { label: t('st.soldout'), days: null, hot: false };
  if (st === 'closed') return { label: t('st.closed'), days: null, hot: false };
  if (!isEntryConfirmed(race)) return { label: t('st.entryTbc'), days: null, hot: false };
  return { label: t('st.tba'), days: null, hot: false };
}

export const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

/** 날짜 조각. w 는 요일(ko '일', en 'Sun'), mon 은 영어 짧은 달 이름('Feb') */
export function dateParts(iso: string, lang: Lang = 'ko') {
  const d = new Date(iso + 'T00:00:00Z');
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    w: fmtWeekday(iso, lang),
    mon: monthShortEn(iso),
  };
}

export function krw(n: number, lang: Lang = 'ko'): string {
  return fmtKrw(n, lang);
}

export function krwExact(n: number, lang: Lang = 'ko'): string {
  return fmtKrwExact(n, lang);
}

export function feeToKrw(race: Race): number | null {
  if (race.entry_fee == null) return null;
  const rate = FX[race.entry_fee_currency];
  if (!rate) return null;
  return race.entry_fee * rate;
}

export function feeLabel(race: Race, lang: Lang = 'ko'): string {
  if (race.entry_fee == null) return translate(lang, 'fee.tba');
  return fmtMoney(race.entry_fee, race.entry_fee_currency, lang);
}

export function costFor(race: Race, costs: CostBaseline[]): CostBaseline | undefined {
  return costs.find((c) => c.race_id === race.country_code);
}

/**
 * "접수 임박순" 정렬 키. 낮을수록 먼저.
 * 1) 지금 신청 중 → 마감이 가까운 순
 * 2) 곧 오픈 → 오픈이 가까운 순
 * 3) 일정 미공개 (접수 일정이 예상·미정인 대회 포함)
 * 4) 이미 마감(조기 마감 포함) → 대회일 가까운 순
 * 5) 취소된 대회 → 맨 뒤
 */
export function entrySortKey(race: Race, today = TODAY()): number {
  const st = entryStatus(race, today);
  const clamp = (n: number) => Math.min(Math.max(n, 0), 3650) / 10000;
  if (st === 'cancelled') return 4 + clamp(daysBetween(today, race.race_date));
  if (st === 'open') return 0 + clamp(race.entry_closes ? daysBetween(today, race.entry_closes) : 3650);
  if (st === 'upcoming') return 1 + clamp(race.entry_opens ? daysBetween(today, race.entry_opens) : 3650);
  if (st === 'unknown') return 2 + clamp(daysBetween(today, race.race_date));
  return 3 + clamp(daysBetween(today, race.race_date));
}

export const isDomestic = (race: Race) => race.region === '한국';

export type MajorKind = 'world' | 'korea';
/** 메이저 종류 — is_major 가 아니면 null. 국내/해외는 country_code 로 가른다 */
export const majorKind = (race: Race): MajorKind | null =>
  race.is_major ? (race.country_code === 'KR' ? 'korea' : 'world') : null;

export const isTrail = (race: Race) => race.discipline === 'trail';

/** 1234 → '누적 상승 1,234m' */
export function elevationLabel(race: Race, lang: Lang = 'ko'): string | null {
  return race.elevation_gain != null
    ? translate(lang, 'elev.label', { n: race.elevation_gain.toLocaleString(lang === 'en' ? 'en-US' : 'ko-KR') })
    : null;
}

/** '2027년 2월 28일(일)' · en 'Sun, Feb 28, 2027' (src/lib/dateFormat.ts) */
export function fmtDate(iso: string, lang: Lang = 'ko'): string {
  return fmtDateLong(iso, lang);
}

/** 좁은 칸 날짜 '27.2.28' · en 'Feb 28, 2027' (src/lib/dateFormat.ts) */
export function fmtDateShort(iso: string, lang: Lang = 'ko'): string {
  return fmtDateShortLang(iso, lang);
}

/** 공식 홈페이지를 아직 확인하지 못해 검색 링크를 넣어 둔 경우 */
export function isSearchLink(url: string): boolean {
  return /^https:\/\/(search\.naver\.com|www\.google\.com\/search)/.test(url);
}

/** 조회·저장 수를 짧게: 980 → 980, 1234 → 1,234, 12345 → 1.2만 · en 12345 → 12.3K */
export function shortCount(n: number, lang: Lang = 'ko'): string {
  if (lang === 'en') return n >= 10000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}K` : n.toLocaleString('en-US');
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, '')}만`;
  return n.toLocaleString();
}

/** 링크로 걸어도 되는 주소만 통과시킨다 (javascript:, data: 등 차단). 아니면 undefined. */
export function safeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}
