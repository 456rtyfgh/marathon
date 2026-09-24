import type { Race, CostBaseline } from './types';
import { FX } from './seed';

/** 한국 시간 기준 오늘 (UTC 자정으로 표현) */
export const TODAY = () => new Date(new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00Z');

export function daysBetween(from: Date, isoDate: string): number {
  const to = new Date(isoDate + 'T00:00:00Z');
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export type EntryStatus = 'open' | 'upcoming' | 'closed' | 'unknown';

export function entryStatus(race: Race, today = TODAY()): EntryStatus {
  const { entry_opens, entry_closes } = race;
  if (!entry_opens && !entry_closes) return 'unknown';
  const o = entry_opens ? daysBetween(today, entry_opens) : -Infinity;
  const c = entry_closes ? daysBetween(today, entry_closes) : Infinity;
  if (o > 0) return 'upcoming';
  if (c < 0) return 'closed';
  return 'open';
}

export const STATUS_LABEL: Record<EntryStatus, string> = {
  open: '접수 중',
  upcoming: '접수 예정',
  closed: '접수 마감',
  unknown: '일정 미공개',
};

/** 목록 오른쪽에 크게 보여줄 상태 한 줄 */
export function statusLine(race: Race, today = TODAY()): { label: string; days: number | null; hot: boolean } {
  const st = entryStatus(race, today);
  if (st === 'open') {
    if (!race.entry_closes) return { label: '정원 마감 시까지', days: null, hot: false };
    const d = daysBetween(today, race.entry_closes);
    return { label: d === 0 ? '오늘 마감' : '마감까지', days: d, hot: d <= 7 };
  }
  if (st === 'upcoming') {
    const d = race.entry_opens ? daysBetween(today, race.entry_opens) : null;
    return { label: '접수 시작까지', days: d, hot: false };
  }
  if (st === 'closed') return { label: '접수 마감', days: null, hot: false };
  return { label: '일정 미공개', days: null, hot: false };
}

export const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

export function dateParts(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: WEEKDAY[d.getUTCDay()] };
}

export function krw(n: number): string {
  if (n >= 10000) {
    const man = Math.round(n / 10000);
    return `${man.toLocaleString('ko-KR')}만원`;
  }
  return `${n.toLocaleString('ko-KR')}원`;
}

export function krwExact(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

export function feeToKrw(race: Race): number | null {
  if (race.entry_fee == null) return null;
  const rate = FX[race.entry_fee_currency];
  if (!rate) return null;
  return race.entry_fee * rate;
}

export function feeLabel(race: Race): string {
  if (race.entry_fee == null) return '미공개';
  if (race.entry_fee_currency === 'KRW') return krw(race.entry_fee);
  const sym: Record<string, string> = {
    USD: '$', JPY: '¥', EUR: '€', GBP: '£', AUD: 'A$', CAD: 'C$',
    SGD: 'S$', HKD: 'HK$', TWD: 'NT$', CNY: '¥', ZAR: 'R',
    MYR: 'RM', THB: '฿', VND: '₫', IDR: 'Rp', NOK: 'kr ', CZK: 'Kč', NZD: 'NZ$', MOP: 'MOP ',
    PHP: '₱', SEK: 'kr ', DKK: 'kr ', TRY: '₺',
  };
  const s = sym[race.entry_fee_currency] ?? '';
  return `${s}${race.entry_fee.toLocaleString()}`;
}

export function costFor(race: Race, costs: CostBaseline[]): CostBaseline | undefined {
  return costs.find((c) => c.race_id === race.country_code);
}

/**
 * "접수 임박순" 정렬 키. 낮을수록 먼저.
 * 1) 지금 신청 중 → 마감이 가까운 순
 * 2) 곧 오픈 → 오픈이 가까운 순
 * 3) 일정 미공개
 * 4) 이미 마감 → 대회일 가까운 순
 */
export function entrySortKey(race: Race, today = TODAY()): number {
  const st = entryStatus(race, today);
  const clamp = (n: number) => Math.min(Math.max(n, 0), 3650) / 10000;
  if (st === 'open') return 0 + clamp(race.entry_closes ? daysBetween(today, race.entry_closes) : 3650);
  if (st === 'upcoming') return 1 + clamp(race.entry_opens ? daysBetween(today, race.entry_opens) : 3650);
  if (st === 'unknown') return 2 + clamp(daysBetween(today, race.race_date));
  return 3 + clamp(daysBetween(today, race.race_date));
}

export const isDomestic = (race: Race) => race.region === '한국';

export function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCFullYear()}년 ${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAY[d.getUTCDay()]})`;
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}
