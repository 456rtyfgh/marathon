// 지도 채움색: 대회 수 → 5단계 (토큰 --map-1..5, src/index.css).
// 예전엔 강조색을 35~100% 섞었는데 볼트(#cdf53a)와 빈 칸(#e8eaed)의 명도가 거의 같아서 진해지는 게 안 보였다.
// 이제는 명도가 확실히 다른 단계색을 고르고, 구간은 sqrt 척도로 나눈다 (한두 곳만 큰 쏠림에서도 작은 곳끼리 구분되게).

export const MAP_STEPS = 5;
export const MAP_SELECTED = 'var(--map-selected)';

type Step = 0 | 1 | 2 | 3 | 4 | 5;

// 구간 수가 5보다 적을 때 쓰는 단계: 가장 연한 단계만 쓰여 "안 진해 보이는" 일이 없게 고르게 펼친다
const SPREAD: Record<number, Step[]> = { 1: [5], 2: [2, 5], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 4, 5] };

/** 구간 [from, to] 와 그 단계. 1..max 를 빈틈·겹침 없이 덮는다 */
function bands(max: number): { step: number; from: number; to: number }[] {
  const m = Math.max(1, Math.floor(max));
  const k = Math.min(MAP_STEPS, m);
  const out: { step: number; from: number; to: number }[] = [];
  let prev = 0;
  for (let i = 1; i <= k; i++) {
    // sqrt 척도: n/max = (i/k)^2 가 i 번째 구간 끝. 빈 구간이 없게 앞 구간보다 1 이상, 뒤에 남을 구간만큼은 비워 둔다
    const end = i === k ? m : Math.min(m - (k - i), Math.max(prev + 1, Math.ceil(m * (i / k) ** 2)));
    out.push({ step: SPREAD[k][i - 1], from: prev + 1, to: end });
    prev = end;
  }
  return out;
}

const cache = new Map<number, ReturnType<typeof bands>>();
const bandsOf = (max: number) => {
  const m = Math.max(1, Math.floor(max));
  let b = cache.get(m);
  if (!b) cache.set(m, (b = bands(m)));
  return b;
};

/** 0 = 대회 없음, 1..5 = 적음→많음. max 는 지금 화면(국내/세계) 최댓값. max 보다 큰 n 은 5단계 */
export function mapStep(n: number, max: number): Step {
  if (!(n > 0)) return 0;
  const b = bandsOf(max);
  for (const x of b) if (n <= x.to) return x.step as Step;
  return 5;
}

/** step → 'var(--map-N)' (0 이면 'var(--sunken)') */
export function mapFill(step: number): string {
  return step >= 1 && step <= MAP_STEPS ? `var(--map-${Math.round(step)})` : 'var(--sunken)';
}

/** 범례용 구간: [{ step: 1, from: 1, to: 2 }, ...]. max 가 5 미만이면 구간도 그만큼만 */
export function mapLegend(max: number): { step: number; from: number; to: number }[] {
  return bandsOf(max);
}
