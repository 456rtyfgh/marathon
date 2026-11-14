/**
 * 알림 제안 판정·흐름 확인 (PLAN 파트 B).
 *   node scripts/alert-nudge-test.mjs
 * public/data.json 의 실제 대회로 접수 상태별 판정을, 가짜 getPrefs 로 경쟁 상태를, 가짜 localStorage 로 저장 실패를 본다.
 * today 는 2026-11-14 로 고정한다.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALERTED_KEY, NUDGE_DISMISSED_KEY, dismissNudge, markAlerted, shouldOfferNudge } from '../src/lib/alertNudge.ts';
import { createNudgeFlow } from '../src/lib/alertNudgeFlow.ts';
import { entryStatus, isEntryConfirmed } from '../src/lib/util.ts';

const TODAY_ISO = '2026-11-14';
const today = new Date(`${TODAY_ISO}T00:00:00Z`);
const { races } = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
const st = (r) => entryStatus(r, today);

let passed = 0;
let fails = 0;
const queue = [];
const check = (name, fn) => queue.push({ name, fn });

// ---- localStorage 가짜 ----
const mem = new Map();
const useMem = () => {
  mem.clear();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
};

// ---- 데이터에서 사례 고르기 ----
const pick = (label, pred) => {
  const r = races.find(pred);
  console.log(r ? `[${label}] ${r.id} (status=${st(r)}, conf=${r.entry_confidence}, ${r.entry_opens ?? '-'}~${r.entry_closes ?? '-'}, ${r.race_date})` : `[${label}] 데이터에 없음 — 건너뜀`);
  return r;
};
const future = (r) => r.race_date >= TODAY_ISO;
const open1 = pick('접수 중(확정)', (r) => future(r) && st(r) === 'open' && isEntryConfirmed(r) && r.entry_opens && r.entry_closes);
const open2 = races.filter((r) => future(r) && st(r) === 'open' && r.id !== open1?.id)[0];
const upcoming = pick('접수 예정(확정)', (r) => future(r) && st(r) === 'upcoming' && isEntryConfirmed(r));
const unknownExpected = pick('일정 미공개(예상 날짜)', (r) => future(r) && st(r) === 'unknown' && !isEntryConfirmed(r) && (r.entry_opens || r.entry_closes));
const unknownNone = pick('일정 미공개(날짜 없음)', (r) => future(r) && st(r) === 'unknown' && !r.entry_opens && !r.entry_closes);
const closeOnly = pick('마감일만 있음(확정)', (r) => future(r) && isEntryConfirmed(r) && !r.entry_opens && r.entry_closes && st(r) !== 'cancelled');
const openOnly = pick('시작일만 있음(확정)', (r) => future(r) && isEntryConfirmed(r) && r.entry_opens && !r.entry_closes && st(r) !== 'cancelled');
const openNoDates = pick('접수 중인데 날짜 없음', (r) => future(r) && st(r) === 'open' && !r.entry_opens && !r.entry_closes);
const closed = pick('접수 마감', (r) => future(r) && st(r) === 'closed');
const soldout = pick('조기 마감', (r) => future(r) && st(r) === 'soldout');
const cancelled = pick('대회 취소', (r) => st(r) === 'cancelled');
const past = pick('지난 대회', (r) => !future(r) && st(r) === 'closed');
assert.ok(open1 && open2, '접수 중 대회 2개가 필요하다');
console.log('');

// ---- 접수 상태 판정 ----
check('판정: 접수 중 → 참', () => {
  useMem();
  assert.equal(shouldOfferNudge(open1, today), true);
});
check('판정: 접수 예정 → 참', () => {
  if (!upcoming) return;
  useMem();
  assert.equal(shouldOfferNudge(upcoming, today), true);
});
check('판정: 일정 미공개 → 참', () => {
  useMem();
  for (const r of [unknownExpected, unknownNone]) if (r) assert.equal(shouldOfferNudge(r, today), true, r.id);
});
check('판정: 마감일만·시작일만·접수 중 날짜 없음은 상태가 접수 전·중·미공개일 때만 참', () => {
  useMem();
  for (const r of [closeOnly, openOnly, openNoDates]) {
    if (!r) continue;
    const s = st(r);
    assert.equal(shouldOfferNudge(r, today), ['upcoming', 'open', 'unknown'].includes(s), `${r.id} ${s}`);
  }
});
check('판정: 접수 마감·조기 마감·취소·지난 대회 → 거짓', () => {
  useMem();
  for (const r of [closed, soldout, cancelled, past]) if (r) assert.equal(shouldOfferNudge(r, today), false, r.id);
});
check('판정: 전체 대회가 nudgeEligible 규칙과 일치', () => {
  useMem();
  for (const r of races) {
    const s = st(r);
    const want = s !== 'cancelled' && future(r) && ['upcoming', 'open', 'unknown'].includes(s);
    assert.equal(shouldOfferNudge(r, today), want, r.id);
  }
});
check('판정: 닫은 대회·신청한 대회 → 거짓, 다른 대회는 그대로', () => {
  useMem();
  dismissNudge(open1.id);
  assert.equal(shouldOfferNudge(open1, today), false);
  assert.equal(shouldOfferNudge(open2, today), true);
  markAlerted(open2.id);
  assert.equal(shouldOfferNudge(open2, today), false);
});

// ---- 흐름 도우미 ----
const flowWith = (getPrefs, extra = {}) => createNudgeFlow({ getPrefs, today: () => today, ...extra });
/** 손으로 resolve/reject 하는 getPrefs */
const manual = () => {
  const calls = [];
  const getPrefs = () =>
    new Promise((resolve, reject) => {
      calls.push({ resolve, reject });
    });
  return { getPrefs, calls };
};
const tick = () => new Promise((r) => setTimeout(r, 0));

check('흐름: 비로그인은 getPrefs 를 안 부르고 참', async () => {
  useMem();
  let n = 0;
  const f = flowWith(async () => (n++, null));
  assert.equal(await f.offer(open1, false), true);
  assert.equal(n, 0);
});
check('흐름: 회원 + saved_races 꺼짐/없음 → 참, 켜짐 → 거짓', async () => {
  useMem();
  assert.equal(await flowWith(async () => ({ saved_races: false })).offer(open1, true), true);
  assert.equal(await flowWith(async () => null).offer(open1, true), true);
  assert.equal(await flowWith(async () => ({ saved_races: true })).offer(open1, true), false);
});
check('흐름: 판정이 거짓인 대회는 getPrefs 를 안 읽는다', async () => {
  useMem();
  let n = 0;
  const f = flowWith(async () => (n++, { saved_races: false }));
  assert.equal(await f.offer(closed ?? cancelled, true), false);
  dismissNudge(open1.id);
  assert.equal(await f.offer(open1, true), false);
  assert.equal(n, 0);
});
check('경쟁 ①: 읽는 중 cancel()(저장 해제) → 거짓', async () => {
  useMem();
  const m = manual();
  const f = flowWith(m.getPrefs);
  const p = f.offer(open1, true);
  f.cancel();
  m.calls[0].resolve({ saved_races: false });
  assert.equal(await p, false);
});
check('경쟁 ②: 읽는 중 다른 대회로 offer → 앞 것은 거짓, 뒤 것만 참', async () => {
  useMem();
  const m = manual();
  const f = flowWith(m.getPrefs);
  const a = f.offer(open1, true);
  const b = f.offer(open2, true);
  m.calls[0].resolve({ saved_races: false });
  await tick();
  // 두 번째 offer 는 첫 읽기가 끝나기 전이라 캐시가 없어 한 번 더 읽는다
  m.calls[1]?.resolve({ saved_races: false });
  assert.equal(await a, false);
  assert.equal(await b, true);
});
check('경쟁 ③: 읽는 중 resetMember() → 거짓, 늦게 온 값은 캐시하지 않는다', async () => {
  useMem();
  const m = manual();
  const f = flowWith(m.getPrefs);
  const p = f.offer(open1, true);
  f.resetMember();
  m.calls[0].resolve({ saved_races: true });
  assert.equal(await p, false);
  const q = f.offer(open1, true);
  assert.equal(m.calls.length, 2, '로그인 상태가 바뀐 뒤엔 다시 읽는다');
  m.calls[1].resolve({ saved_races: false });
  assert.equal(await q, true);
});
check('경쟁 ④: offer→cancel→offer 를 빠르게 반복하면 마지막만 참', async () => {
  useMem();
  const m = manual();
  const f = flowWith(m.getPrefs);
  const p1 = f.offer(open1, true);
  f.cancel();
  const p2 = f.offer(open1, true);
  f.cancel();
  const p3 = f.offer(open1, true);
  for (const c of m.calls) c.resolve({ saved_races: false });
  assert.deepEqual(await Promise.all([p1, p2, p3]), [false, false, true]);
});
check('경쟁 ⑤: 읽는 사이 닫기를 누르면 거짓', async () => {
  useMem();
  const m = manual();
  const f = flowWith(m.getPrefs);
  const p = f.offer(open1, true);
  dismissNudge(open1.id);
  m.calls[0].resolve({ saved_races: false });
  assert.equal(await p, false);
});
check('reject → 알림 없음으로 보고 참', async () => {
  useMem();
  const f = flowWith(async () => {
    throw new Error('network');
  });
  assert.equal(await f.offer(open1, true), true);
  // getPrefs 가 동기로 throw 해도 같다
  const g = flowWith(() => {
    throw new Error('sync');
  });
  assert.equal(await g.offer(open1, true), true);
});
check('시간 초과 → 거짓, 캐시 안 함(다음엔 다시 읽는다)', async () => {
  useMem();
  const m = manual();
  const f = flowWith(m.getPrefs, { timeoutMs: 20 });
  assert.equal(await f.offer(open1, true), false);
  assert.equal(m.calls.length, 1);
  const q = f.offer(open1, true);
  assert.equal(m.calls.length, 2, '캐시되지 않았다');
  m.calls[1].resolve({ saved_races: false });
  assert.equal(await q, true);
  // 시간 초과 뒤에 늦게 온 응답은 아무것도 바꾸지 않는다
  m.calls[0].resolve({ saved_races: true });
  await tick();
  assert.equal(await f.offer(open1, true), true);
});
check('캐시: 두 번째 offer 는 getPrefs 를 안 부르고, resetMember 뒤엔 다시 부른다', async () => {
  useMem();
  let n = 0;
  const f = flowWith(async () => (n++, { saved_races: false }));
  assert.equal(await f.offer(open1, true), true);
  assert.equal(await f.offer(open2, true), true);
  assert.equal(n, 1);
  f.resetMember();
  assert.equal(await f.offer(open1, true), true);
  assert.equal(n, 2);
});
check('캐시: saved_races true → false 로 바뀌면 resetMember 뒤 참', async () => {
  useMem();
  let on = true;
  const f = flowWith(async () => ({ saved_races: on }));
  assert.equal(await f.offer(open1, true), false);
  assert.equal(await f.offer(open1, true), false, '캐시된 값');
  on = false;
  f.resetMember();
  assert.equal(await f.offer(open1, true), true);
});
check('로그아웃 뒤 비로그인 offer 는 읽지 않고 참', async () => {
  useMem();
  let n = 0;
  const f = flowWith(async () => (n++, { saved_races: true }));
  assert.equal(await f.offer(open1, true), false);
  f.resetMember();
  assert.equal(await f.offer(open1, false), true);
  assert.equal(n, 1);
});

// ---- localStorage ----
check('localStorage: 읽기 throw → 예외 없이 참(기록을 못 읽으니 제안 가능)', async () => {
  globalThis.localStorage = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  };
  assert.doesNotThrow(() => dismissNudge(open1.id));
  assert.doesNotThrow(() => markAlerted(open1.id));
  assert.equal(shouldOfferNudge(open1, today), true);
  assert.equal(await flowWith(async () => null).offer(open1, true), true);
});
check('localStorage: 쓰기 throw(용량 초과) → 예외 없이 동작', () => {
  useMem();
  globalThis.localStorage.setItem = () => {
    throw new Error('QuotaExceededError');
  };
  assert.doesNotThrow(() => dismissNudge(open1.id));
  assert.equal(shouldOfferNudge(open1, today), true);
});
check('localStorage: JSON 깨짐·배열 아님·섞인 값 → 무시하고 동작', () => {
  useMem();
  for (const bad of ['{not json', '"str"', '{"a":1}', '123', 'null']) {
    mem.set(NUDGE_DISMISSED_KEY, bad);
    mem.set(ALERTED_KEY, bad);
    assert.equal(shouldOfferNudge(open1, today), true, bad);
  }
  mem.set(NUDGE_DISMISSED_KEY, JSON.stringify([1, null, open1.id]));
  assert.equal(shouldOfferNudge(open1, today), false);
  dismissNudge(open2.id);
  assert.deepEqual(JSON.parse(mem.get(NUDGE_DISMISSED_KEY)), [open1.id, open2.id]);
});
check('localStorage: 아예 없음 → 예외 없이 참', async () => {
  delete globalThis.localStorage;
  assert.doesNotThrow(() => dismissNudge(open1.id));
  assert.doesNotThrow(() => markAlerted(open1.id));
  assert.equal(shouldOfferNudge(open1, today), true);
  assert.equal(await flowWith(async () => null).offer(open1, false), true);
});
check('localStorage: 500개 상한 유지(닫은 것·신청한 것 둘 다), 최근 것이 남는다', () => {
  useMem();
  for (let i = 0; i < 620; i++) {
    dismissNudge(`d${i}`);
    markAlerted(`a${i}`);
  }
  assert.equal(JSON.parse(mem.get(NUDGE_DISMISSED_KEY)).length, 500);
  assert.equal(JSON.parse(mem.get(ALERTED_KEY)).length, 500);
  assert.ok(JSON.parse(mem.get(NUDGE_DISMISSED_KEY)).includes('d619'));
  assert.ok(!JSON.parse(mem.get(NUDGE_DISMISSED_KEY)).includes('d0'));
});
check('재제안 규칙: 알림 받기만 누르면(기록 없음) 다음 저장 때 다시 뜬다', async () => {
  useMem();
  const f = flowWith(async () => null);
  assert.equal(await f.offer(open1, false), true);
  // [알림 받기] 는 훅의 accept(상태만 닫음) — 어떤 키도 쓰지 않는다
  assert.equal(mem.size, 0);
  assert.equal(await f.offer(open1, false), true);
});
check('재제안 규칙: 닫기(dismiss) 뒤·신청 성공(markAlerted) 뒤엔 다시 안 뜬다', async () => {
  useMem();
  const f = flowWith(async () => null);
  dismissNudge(open1.id);
  assert.equal(await f.offer(open1, false), false);
  markAlerted(open2.id);
  assert.equal(await f.offer(open2, false), false);
});

for (const { name, fn } of queue) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    fails++;
    console.log(`  FAIL ${name}: ${e.message}`);
  }
}
console.log(`\n${fails ? `실패 ${fails}개, ` : ''}통과 ${passed}/${queue.length}개`);
process.exit(fails ? 1 : 0);
