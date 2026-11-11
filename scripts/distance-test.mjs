/**
 * 첫 화면 '거리' 필터 분류(src/lib/distanceFilter.ts) 확인.
 *   node scripts/distance-test.mjs
 * 경계값 표 + 실제 public/data.json 의 거리 값 전부를 돌려 묶음별 개수와 분류 안 되는 값(null)을 출력한다.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { DISTANCE_BUCKETS, distanceBucket, distancesFromSearch, matchesDistances, parseDistanceKm } from '../src/lib/distanceFilter.ts';

let passed = 0;
const t = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`x ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// ── km 읽기 ──
t('풀·하프·영어', () => {
  assert.equal(parseDistanceKm('풀'), 42.195);
  assert.equal(parseDistanceKm('하프'), 21.0975);
  assert.equal(parseDistanceKm('Full'), 42.195);
  assert.equal(parseDistanceKm('half'), 21.0975);
  assert.equal(parseDistanceKm('marathon'), 42.195);
});
t('km·K·소수', () => {
  assert.equal(parseDistanceKm('10km'), 10);
  assert.equal(parseDistanceKm('10K'), 10);
  assert.equal(parseDistanceKm(' 4.2km '), 4.2);
});
t('마일', () => {
  assert.equal(parseDistanceKm('100M'), 160.934);
  assert.equal(parseDistanceKm('10마일'), 16.093);
  assert.equal(parseDistanceKm('1마일'), 1.609);
});
t('숫자 아님 → null', () => assert.equal(parseDistanceKm('건강달리기'), null));

// ── 묶음 (경계 포함) ──
const table = [
  ['4.5km', '5k'], ['5km', '5k'], ['5K', '5k'], ['5.5km', '5k'], ['4.4km', null], ['5.6km', null],
  ['9.5km', '10k'], ['10km', '10k'], ['10K', '10k'], ['10.5km', '10k'], ['9.4km', null], ['10.6km', null],
  ['하프', 'half'], ['21K', 'half'], ['21.1km', 'half'], ['21.0975km', 'half'], ['20.9km', null], ['21.2km', null], ['22K', null],
  ['풀', 'full'], ['42K', 'full'], ['42.195km', 'full'], ['42.2km', 'full'], ['41.9km', null],
  ['42.3km', 'ultra'], ['43K', 'ultra'], ['50K', 'ultra'], ['100K', 'ultra'], ['100km', 'ultra'], ['100M', 'ultra'],
  ['3km', null], ['10마일', null], ['1마일', null], ['건강달리기', null],
];
for (const [label, want] of table) t(`${label} → ${want}`, () => assert.equal(distanceBucket(label), want));

// ── 대회 맞추기 ──
const race = (distances) => ({ distances });
t('[] 이면 전부', () => assert.equal(matchesDistances(race(['3km']), []), true));
t('하나라도 맞으면 (합집합)', () => {
  assert.equal(matchesDistances(race(['10km', '하프']), ['half']), true);
  assert.equal(matchesDistances(race(['10km', '하프']), ['full', 'ultra']), false);
  assert.equal(matchesDistances(race(['50K', '21K']), ['full', 'ultra']), true);
});
t('분류 안 되는 거리만 있으면 고른 게 있을 때 제외', () => assert.equal(matchesDistances(race(['건강달리기', '3km']), ['5k']), false));

// ── 주소 쿼리 ──
t('?dist=half,full', () => assert.deepEqual(distancesFromSearch('?dist=half,full'), ['half', 'full']));
t('모르는 값·중복 버림', () => assert.deepEqual(distancesFromSearch('?dist=ultra,foo,ultra'), ['ultra']));
t('없음·빈 값 → []', () => {
  assert.deepEqual(distancesFromSearch(''), []);
  assert.deepEqual(distancesFromSearch('?dist='), []);
});

// ── 실제 데이터 전체 ──
const file = new URL('../public/data.json', import.meta.url);
if (existsSync(file)) {
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const races = Array.isArray(d) ? d : d.races;
  const byBucket = new Map(DISTANCE_BUCKETS.map((b) => [b, new Map()]));
  const nulls = new Map();
  for (const r of races)
    for (const label of r.distances ?? []) {
      const b = distanceBucket(label);
      const m = b ? byBucket.get(b) : nulls;
      m.set(label, (m.get(label) ?? 0) + 1);
    }
  const fmt = (m) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}(${n})`)
      .join(' ');
  console.log(`data.json: 대회 ${races.length}개`);
  for (const [b, m] of byBucket) {
    const km = [...m.keys()].map(parseDistanceKm);
    console.log(`  ${b.padEnd(5)} ${m.size}종 · ${Math.min(...km)}~${Math.max(...km)}km · ${fmt(m)}`);
  }
  console.log(`  null  ${nulls.size}종 · ${fmt(nulls)}`);
  // 묶음마다 km 가 규칙 안인지 (예: '10K' 가 울트라로 가는 일이 없게)
  const RANGE = { '5k': [4.5, 5.5], '10k': [9.5, 10.5], half: [21, 21.1], full: [42, 42.2], ultra: [42.2, Infinity] };
  t('data.json: 묶음별 km 범위', () => {
    for (const [b, m] of byBucket)
      for (const label of m.keys()) {
        const km = parseDistanceKm(label);
        assert.ok(km >= RANGE[b][0] && km <= RANGE[b][1], `${label}=${km}km 가 ${b}`);
      }
  });
  t('data.json: 숫자로 못 읽는 값은 숫자 없는 표기(건강달리기 등)뿐', () => {
    for (const label of nulls.keys()) if (parseDistanceKm(label) == null) assert.ok(!/\d/.test(label), `${label} 를 못 읽음`);
  });
  const none = races.filter((r) => !(r.distances ?? []).some((x) => distanceBucket(x)));
  console.log(`  묶음 하나도 없는 대회 ${none.length}개 (예: ${none.slice(0, 5).map((r) => `${r.id}[${r.distances.join(',')}]`).join(' ')})`);
} else console.log('data.json 없음 — 실제 데이터 검사 건너뜀');

console.log(`distance-test: ${passed}개 통과${process.exitCode ? ' (실패 있음)' : ''}`);
