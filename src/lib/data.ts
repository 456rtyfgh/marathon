import { supabase, hasSupabase } from './supabase';
import { FX } from './seed';
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
  /** static: CDN 의 /data.json (매일 갱신) · supabase: DB 직접 · none: 둘 다 실패 */
  source: 'static' | 'supabase' | 'none';
}

export const emptyDataset = (): Dataset => ({ races: [], agencies: [], packages: [], costs: [], ratings: [], source: 'none' });

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

/**
 * 방문자가 많아도 DB 를 거의 안 쓰도록, 대회 목록은 배포 때(매일) 만든 정적 파일 /data.json 을
 * Cloudflare CDN 에서 받는다. 후기 별점만 DB 에서 가볍게 따로 받는다.
 * live=true (관리자 저장 직후 등) 면 DB 에서 바로 읽는다.
 */
export async function loadDataset(opts: { live?: boolean } = {}): Promise<Dataset> {
  if (opts.live && supabase) {
    const d = await withTimeout(loadRemote(), 8000).catch(() => null);
    if (d) return d;
  }
  try {
    const [res, ratings] = await Promise.all([
      withTimeout(fetch('/data.json'), 8000),
      withTimeout(loadRatings(), 3000).catch(() => [] as RaceRating[]),
    ]);
    if (res.ok) {
      const j = (await res.json()) as Omit<Dataset, 'ratings' | 'source'>;
      if (j.races?.length) return { ...j, ratings, source: 'static' };
    }
  } catch {
    /* 아래 DB 로 */
  }
  if (supabase) {
    const d = await withTimeout(loadRemote(), 8000).catch(() => null);
    if (d) return d;
  }
  return emptyDataset();
}

/** 별점 + 조회·저장 수. 새 함수가 아직 없으면 별점만 받는다. */
async function loadRatings(): Promise<RaceRating[]> {
  if (!supabase) return [];
  const r = await supabase.rpc('race_public_stats');
  if (!r.error && r.data) {
    return (r.data as RaceRating[]).map((x) => ({
      ...x,
      views: Number(x.views ?? 0),
      saves: Number(x.saves ?? 0),
      hot: Number(x.hot ?? 0),
    }));
  }
  const { data } = await supabase.from('race_ratings').select('*');
  return (data ?? []) as RaceRating[];
}

/** DB 는 한 번에 최대 1000줄만 준다 — 대회가 그보다 많아 나눠 받는다 */
async function loadAllRaces(): Promise<{ data: Race[] | null; error: unknown }> {
  const all: Race[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!
      .from('races')
      .select('*')
      .order('race_date')
      .order('id')
      .range(from, from + 999);
    if (error) return { data: null, error };
    all.push(...((data ?? []) as Race[]));
    if (!data || data.length < 1000) return { data: all, error: null };
  }
}

async function loadRemote(): Promise<Dataset | null> {
  if (!supabase) return null;
  const [r, a, p, c, rt] = await Promise.all([
    loadAllRaces(),
    supabase.from('agencies').select('*'),
    supabase.from('packages').select('*'),
    supabase.from('cost_baselines').select('*'),
    loadRatings().catch(() => [] as RaceRating[]),
  ]);
  if (r.error || !r.data?.length) return null;
  return {
    races: r.data as Race[],
    agencies: (a.data ?? []) as Agency[],
    packages: (p.data ?? []) as Package[],
    costs: (c.data ?? []) as CostBaseline[],
    ratings: rt,
    source: 'supabase',
  };
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

/* ── 조기 마감 제보 (race_requests 를 그대로 쓰고 note 머리말로 구분) ── */

export const SOLD_OUT_TAG = '[조기마감 제보]';
const SOLD_OUT_RE = /^\[조기마감 제보\] ([a-z0-9-]{2,40})(?:\s|$)/;

/** note 가 '[조기마감 제보] <race id>' 형태면 race id, 아니면 null */
export function soldOutReportRaceId(req: Pick<RaceRequest, 'note'>): string | null {
  return req.note?.match(SOLD_OUT_RE)?.[1] ?? null;
}

/** 대회 추가 요청과 같은 경로·규칙(로그인, 하루 5건, 스팸 검사)으로 들어간다 */
export async function submitSoldOutReport(race: Race, userId: string, nickname: string, memo?: string) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const url = /^https?:\/\//.test(race.official_url) ? race.official_url : null;
  const extra = memo?.trim();
  const { error } = await supabase.from('race_requests').insert({
    race_name: race.name_ko,
    country: race.country_ko || null,
    url,
    note: `${SOLD_OUT_TAG} ${race.id}${extra ? `\n${extra}` : ''}`,
    requested_by: userId,
    nickname,
  });
  if (error) throw new Error(error.message);
}

/**
 * 관리자: 조기 마감일 넣기/지우기. 대회 수정과 같은 races_admin_write 권한.
 * 화면의 race 는 보통 data.json 스냅샷(최대 일주일 묵음)이라 행 전체를 upsert 하면
 * 그 뒤 자동 갱신된 칸을 되돌린다 → 이 칸 하나만 update 한다.
 */
export async function adminSetSoldOut(race: Race, soldOutOn: string | null) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { data, error } = await supabase.from('races').update({ sold_out_on: soldOutOn }).eq('id', race.id).select('id');
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error('대회를 찾지 못했거나 고칠 권한이 없습니다.');
}

/** 제보된 대회들의 지금 DB 값. 화면의 races 는 스냅샷이라 이미 처리한 조기 마감이 안 보일 수 있다 */
export async function loadSoldOutDates(ids: string[]): Promise<Record<string, string | null>> {
  if (!supabase || !ids.length) return {};
  const { data, error } = await supabase.from('races').select('id, sold_out_on').in('id', ids);
  if (error) throw new Error(error.message);
  return Object.fromEntries((data ?? []).map((r: { id: string; sold_out_on: string | null }) => [r.id, r.sold_out_on]));
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

export interface Member {
  id: string;
  email: string;
  nickname: string | null;
  created_at: string;
  confirmed_at: string | null;
  last_sign_in_at: string | null;
  confirmation_sent_at: string | null;
}

export async function adminListMembers(): Promise<Member[]> {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { data, error } = await supabase.rpc('admin_list_members');
  if (error) throw new Error(error.message);
  return (data ?? []) as Member[];
}

export async function adminConfirmMember(id: string) {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { error } = await supabase.rpc('admin_confirm_member', { p_id: id });
  if (error) throw new Error(error.message);
}

export interface StatRow {
  event: string;
  key: string;
  n: number;
}

export async function adminStats(days: number): Promise<StatRow[]> {
  if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
  const { data, error } = await supabase.rpc('admin_stats', { p_days: days });
  if (error) throw new Error(error.message);
  return ((data ?? []) as StatRow[]).map((r) => ({ ...r, n: Number(r.n) }));
}
