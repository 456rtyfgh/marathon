import { supabase, hasSupabase } from './supabase';
import { RACES, AGENCIES, PACKAGES, COSTS, FX } from './seed';
import type {
  Race,
  Agency,
  Package,
  CostBaseline,
  Review,
  ExternalReview,
  RaceRating,
} from './types';

export interface Dataset {
  races: Race[];
  agencies: Agency[];
  packages: Package[];
  costs: CostBaseline[];
  ratings: RaceRating[];
  source: 'supabase' | 'seed';
}

export const seedDataset = (): Dataset => ({
  races: RACES,
  agencies: AGENCIES,
  packages: PACKAGES,
  costs: COSTS,
  ratings: [],
  source: 'seed',
});

/** 서버가 느리거나 멈춰 있어도 목록은 바로 보이도록 4초 안에 응답이 없으면 내장 데이터로 연다. */
const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

export async function loadDataset(): Promise<Dataset> {
  if (!hasSupabase || !supabase) return seedDataset();
  return withTimeout(loadRemote(), 4000).catch(() => seedDataset());
}

async function loadRemote(): Promise<Dataset> {
  if (!supabase) return seedDataset();
  try {
    const [r, a, p, c, rt] = await Promise.all([
      supabase.from('races').select('*').order('race_date'),
      supabase.from('agencies').select('*'),
      supabase.from('packages').select('*'),
      supabase.from('cost_baselines').select('*'),
      supabase.from('race_ratings').select('*'),
    ]);
    if (r.error || !r.data?.length) return seedDataset();
    return {
      races: r.data as Race[],
      agencies: (a.data ?? AGENCIES) as Agency[],
      packages: (p.data ?? PACKAGES) as Package[],
      costs: (c.data ?? COSTS) as CostBaseline[],
      ratings: (rt.data ?? []) as RaceRating[],
      source: 'supabase',
    };
  } catch {
    return seedDataset();
  }
}

/* ── 후기 ───────────────────────────────────────────────── */

export async function loadReviews(raceId: string): Promise<Review[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('race_id', raceId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Review[];
}

export interface ReviewInput {
  race_id: string;
  rating: number;
  race_year: number | null;
  finish_time: string | null;
  body: string;
  course_rating: number | null;
  support_rating: number | null;
  value_rating: number | null;
}

export async function saveReview(input: ReviewInput, userId: string, nickname: string) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { error } = await supabase
    .from('reviews')
    .upsert({ ...input, user_id: userId, nickname }, { onConflict: 'race_id,user_id' });
  if (error) throw new Error(error.message);
}

export async function deleteReview(id: string) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { error } = await supabase.from('reviews').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── 외부 후기 링크 ─────────────────────────────────────── */

export async function loadExternalReviews(raceId: string): Promise<ExternalReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('external_reviews')
    .select('*')
    .eq('race_id', raceId)
    .order('published_at', { ascending: false, nullsFirst: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ExternalReview[];
}

/* ── 관리자 ─────────────────────────────────────────────── */

export async function adminUpsertRace(race: Race) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { error } = await supabase.from('races').upsert(race, { onConflict: 'id' });
  if (error) throw new Error(error.message);
}

export async function adminDeleteRace(id: string) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { error } = await supabase.from('races').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── 대회 추가 요청 ─────────────────────────────────────── */

export interface RaceRequest {
  id: string;
  race_name: string;
  country: string | null;
  race_month: string | null;
  url: string | null;
  note: string | null;
  nickname: string | null;
  status: 'pending' | 'added' | 'rejected' | 'duplicate';
  admin_note: string | null;
  created_at: string;
}

export async function loadRaceRequests(): Promise<RaceRequest[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('race_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as RaceRequest[];
}

export async function submitRaceRequest(
  input: { race_name: string; country: string; race_month: string; url: string; note: string },
  userId: string,
  nickname: string,
) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { error } = await supabase.from('race_requests').insert({
    race_name: input.race_name.trim(),
    country: input.country.trim() || null,
    race_month: input.race_month || null,
    url: input.url.trim() || null,
    note: input.note.trim() || null,
    requested_by: userId,
    nickname,
  });
  if (error) throw new Error(error.message);
}

export async function adminResolveRequest(id: string, status: RaceRequest['status'], adminNote: string | null) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { error } = await supabase
    .from('race_requests')
    .update({ status, admin_note: adminNote })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function adminAddExternalReview(row: Omit<ExternalReview, 'id'>) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { error } = await supabase.from('external_reviews').insert(row);
  if (error) throw new Error(error.message);
}

export async function adminDeleteExternalReview(id: string) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { error } = await supabase.from('external_reviews').delete().eq('id', id);
  if (error) throw new Error(error.message);
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
