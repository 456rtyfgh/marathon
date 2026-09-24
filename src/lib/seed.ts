import type { Race, Agency, Package, CostBaseline } from './types';
import snapshot from './snapshot.json';

/**
 * 서버(Supabase)에 연결하지 못할 때 쓰는 내장 데이터.
 * 원본은 DB 이고, 이 파일은 `npm run snapshot` 으로 DB 를 떠온 사본이다.
 * 배포(GitHub Actions) 때마다 새로 떠서 넣는다.
 */
export const RACES = snapshot.races as unknown as Race[];
export const AGENCIES = snapshot.agencies as unknown as Agency[];
export const PACKAGES = snapshot.packages as unknown as Package[];
export const COSTS = snapshot.costs as unknown as CostBaseline[];

/** 참가비 환산용 대략 환율 (KRW, 2026-09 기준 참고용) */
export const FX: Record<string, number> = {
  KRW: 1,
  USD: 1380,
  JPY: 9.2,
  EUR: 1500,
  GBP: 1760,
  AUD: 900,
  NZD: 820,
  SGD: 1030,
  HKD: 177,
  MOP: 172,
  TWD: 43,
  CNY: 192,
  ZAR: 76,
  INR: 16,
  MYR: 310,
  IDR: 0.085,
  VND: 0.055,
  THB: 42,
  PHP: 24,
  NOK: 130,
  SEK: 130,
  DKK: 200,
  CZK: 60,
  CAD: 1000,
  TRY: 34,
};
