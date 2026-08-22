import type { Race, CostBaseline } from './types';
import { FX } from './seed';

export const TODAY = () => new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z');

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

export const STATUS_META: Record<EntryStatus, { label: string; cls: string }> = {
  open: { label: '신청 중', cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30' },
  upcoming: { label: '오픈 예정', cls: 'bg-sky-500/15 text-sky-300 ring-sky-500/30' },
  closed: { label: '신청 마감', cls: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/30' },
  unknown: { label: '일정 미공개', cls: 'bg-amber-500/15 text-amber-300 ring-amber-500/30' },
};

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
    MYR: 'RM', THB: '฿', VND: '₫', IDR: 'Rp', NOK: 'kr', CZK: 'Kč',
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
  const w = ['일', '월', '화', '수', '목', '금', '토'][d.getUTCDay()];
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()}. (${w})`;
}

export function fmtDateShort(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`;
}
