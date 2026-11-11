/**
 * 첫 화면 '거리' 필터 (5km · 10km · 하프 · 풀 · 울트라). race.distances 의 섞인 표기('풀'·'10K'·'21K'·'100M'·'10마일'…)를
 * km 로 읽어 묶는다. node 테스트(scripts/distance-test.mjs)에서도 import 되게 런타임 import 는 없다.
 * (거리 → km 규칙은 src/lib/member.ts 의 distanceKm 과 같다. 그 파일은 supabase 를 불러와 여기서 못 쓴다)
 */
import type { Race } from './types.ts';

export type DistanceBucket = '5k' | '10k' | 'half' | 'full' | 'ultra';
export const DISTANCE_BUCKETS: readonly DistanceBucket[] = ['5k', '10k', 'half', 'full', 'ultra'];

const MILE_KM = 1.609344;

/** 거리 글자 → km. '풀'·'full'·'marathon' 42.195, '하프'·'half' 21.0975, '10km'·'10K'·'4.2km' 숫자,
 *  '10마일'·'100M'·'mi' 마일 환산. 그 밖('건강달리기' 등) null */
export function parseDistanceKm(label: string): number | null {
  const s = label.trim();
  if (s === '풀' || /^(full|marathon)$/i.test(s)) return 42.195;
  if (s === '하프' || /^half$/i.test(s)) return 21.0975;
  let m = /^(\d+(?:\.\d+)?)\s*(?:km|k)$/i.exec(s);
  if (m) return Number(m[1]);
  m = /^(\d+(?:\.\d+)?)\s*(?:마일|mi|mile|miles|m)$/i.exec(s);
  if (m) return Math.round(Number(m[1]) * MILE_KM * 1000) / 1000;
  return null;
}

/** 거리 글자 → 묶음. 4.5~5.5 '5k', 9.5~10.5 '10k', 21~21.1 'half', 42~42.2 'full', 42.2 초과 'ultra', 그 밖 null */
export function distanceBucket(label: string): DistanceBucket | null {
  const km = parseDistanceKm(label);
  if (km == null) return null;
  if (km >= 4.5 && km <= 5.5) return '5k';
  if (km >= 9.5 && km <= 10.5) return '10k';
  if (km >= 21 && km <= 21.1) return 'half';
  if (km >= 42 && km <= 42.2) return 'full';
  if (km > 42.2) return 'ultra';
  return null;
}

/** 대회 거리 중 하나라도 고른 묶음에 들면 true (합집합). picked=[] 이면 true. 트레일도 같은 규칙 */
export function matchesDistances(r: Race, picked: DistanceBucket[]): boolean {
  if (!picked.length) return true;
  return r.distances.some((d) => {
    const b = distanceBucket(d);
    return b != null && picked.includes(b);
  });
}

/** ?dist=half,full → ['half','full'] (모르는 값 버림, 중복 제거, 없으면 []) */
export function distancesFromSearch(search: string): DistanceBucket[] {
  const v = new URLSearchParams(search).get('dist');
  if (!v) return [];
  const parts = v.split(',').map((s) => s.trim());
  return DISTANCE_BUCKETS.filter((b) => parts.includes(b));
}
