import { supabase, hasSupabase } from './supabase';
import { RACES, AGENCIES, PACKAGES, COSTS, FX } from './seed';
import type { Race, Agency, Package, CostBaseline } from './types';

export interface Dataset {
  races: Race[];
  agencies: Agency[];
  packages: Package[];
  costs: CostBaseline[];
  source: 'supabase' | 'seed';
}

const seedDataset = (): Dataset => ({
  races: RACES,
  agencies: AGENCIES,
  packages: PACKAGES,
  costs: COSTS,
  source: 'seed',
});

export async function loadDataset(): Promise<Dataset> {
  if (!hasSupabase || !supabase) return seedDataset();
  try {
    const [r, a, p, c] = await Promise.all([
      supabase.from('races').select('*').order('race_date'),
      supabase.from('agencies').select('*'),
      supabase.from('packages').select('*'),
      supabase.from('cost_baselines').select('*'),
    ]);
    if (r.error || !r.data?.length) return seedDataset();
    return {
      races: r.data as Race[],
      agencies: (a.data ?? AGENCIES) as Agency[],
      packages: (p.data ?? PACKAGES) as Package[],
      costs: (c.data ?? COSTS) as CostBaseline[],
      source: 'supabase',
    };
  } catch {
    return seedDataset();
  }
}

export async function subscribeAlert(email: string, raceId: string, daysBefore: number[]) {
  if (!hasSupabase || !supabase) {
    throw new Error('Supabase가 아직 연결되지 않았습니다. 환경변수를 설정해 주세요.');
  }
  // 구독자 이메일이 anon key 로 조회되지 않도록, 직접 INSERT 대신
  // SECURITY DEFINER 함수를 호출한다 (alert_subscriptions 에는 정책이 없다).
  const { error } = await supabase.rpc('subscribe_alert', {
    p_email: email,
    p_race_id: raceId,
    p_days: daysBefore,
  });
  if (error) throw new Error(error.message);
}

export { FX };
