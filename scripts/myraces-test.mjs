/**
 * 내 정보 '저장한 대회' 계산 확인: node scripts/myraces-test.mjs
 * src/lib/myRaces.ts 와 미리보기용 가짜 데이터(src/dev/myRacesFixture.ts)를 esbuild 로 임시 묶어 import 하고 단언한다.
 * 날짜는 고정(2026-11-10, 2026-11-30 한국 시간)으로 넣어 언제 돌려도 같은 결과.
 */
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'myraces-test-'));
const out = join(tmp, 'myraces.mjs');
await build({
  stdin: {
    contents: "export * from './src/lib/myRaces.ts'; export * from './src/dev/myRacesFixture.ts';",
    resolveDir: root,
    loader: 'ts',
  },
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  logLevel: 'error',
});
const m = await import(pathToFileURL(out).href);
rmSync(tmp, { recursive: true, force: true });
const { buildMyRaces, groupOf, MY_GROUPS, fixture, emptyFixture, FX } = m;

let n = 0;
const test = (name, fn) => {
  try {
    fn();
    n++;
  } catch (e) {
    console.error(`✗ ${name}`);
    throw e;
  }
};
const day = (iso) => new Date(iso + 'T00:00:00Z');
const ids = (list) => list.map((x) => x.race.id);
const item = (r, id) => r.items.find((x) => x.race.id === id);

const T1 = day('2026-11-10');
const f1 = fixture(T1);
const r1 = buildMyRaces(f1, T1);

test('묶음 순서와 각 묶음 정렬', () => {
  assert.deepEqual([...MY_GROUPS], ['open', 'soon', 'registered', 'waiting', 'past']);
  assert.deepEqual(ids(r1.byGroup.open), [FX.closesToday, FX.closes7, FX.closes8, FX.monthStart, FX.noClose]);
  assert.deepEqual(ids(r1.byGroup.soon), [FX.opens3]);
  assert.deepEqual(ids(r1.byGroup.registered), [FX.registered, FX.registeredSaved]);
  assert.deepEqual(ids(r1.byGroup.waiting), [FX.closed, FX.soldout, FX.cancelled, FX.expected]);
  assert.deepEqual(ids(r1.byGroup.past), [FX.pastRecent, FX.finished, FX.pastSaved]);
  assert.deepEqual(
    ids(r1.items),
    MY_GROUPS.flatMap((g) => ids(r1.byGroup[g])),
  );
});

test('중복 없이 합집합, 목록에 없는 id 는 missing', () => {
  assert.equal(r1.items.length, 15);
  assert.equal(new Set(ids(r1.items)).size, 15);
  assert.deepEqual(r1.missing, [FX.missing]);
});

test('D-day 와 임박', () => {
  assert.deepEqual(item(r1, FX.closesToday).dday, { kind: 'closes', days: 0 });
  assert.equal(item(r1, FX.closesToday).urgent, true);
  assert.deepEqual(item(r1, FX.closes7).dday, { kind: 'closes', days: 7 });
  assert.equal(item(r1, FX.closes7).urgent, true);
  assert.deepEqual(item(r1, FX.closes8).dday, { kind: 'closes', days: 8 });
  assert.equal(item(r1, FX.closes8).urgent, false);
  assert.equal(item(r1, FX.noClose).dday, null);
  assert.equal(item(r1, FX.noClose).urgent, false);
  assert.deepEqual(item(r1, FX.opens3).dday, { kind: 'opens', days: 3 });
  assert.deepEqual(item(r1, FX.registered).dday, { kind: 'race', days: 30 });
  assert.deepEqual(item(r1, FX.closed).dday, { kind: 'race', days: 20 });
  assert.equal(item(r1, FX.cancelled).dday, null);
  for (const x of r1.byGroup.past) assert.equal(x.dday, null);
  for (const x of r1.items) if (x.group !== 'open') assert.equal(x.urgent, false);
});

test('배지용 접수 상태는 util.entryStatus 그대로', () => {
  assert.equal(item(r1, FX.closesToday).status, 'open');
  assert.equal(item(r1, FX.opens3).status, 'upcoming');
  assert.equal(item(r1, FX.expected).status, 'unknown');
  assert.equal(item(r1, FX.soldout).status, 'soldout');
  assert.equal(item(r1, FX.closed).status, 'closed');
  assert.equal(item(r1, FX.cancelled).status, 'cancelled');
  // 접수 완료 묶음이어도 배지는 대회 접수 상태
  assert.equal(item(r1, FX.registeredSaved).status, 'open');
});

test('저장 여부와 기록', () => {
  assert.equal(item(r1, FX.registered).saved, false);
  assert.equal(item(r1, FX.registeredSaved).saved, true);
  assert.equal(item(r1, FX.finished).record.status, 'finished');
  assert.equal(item(r1, FX.finished).record.finish_sec, 12521);
  assert.equal(item(r1, FX.pastSaved).record, null);
});

test('요약', () => {
  assert.deepEqual(r1.summary, { saved: 14, open: 5, closingSoon: 2, opensThisMonth: 3, registered: 2, upcoming: 12 });
});

test('이번 달 접수 시작: 11/10 은 예상 일정(11/15)을 빼고 3개, 11/30 은 그달 것만', () => {
  // 11/10: monthStart(11/1) · closes8(11/5) · opens3(11/13). expected(11/15)는 예상이라 빠진다
  assert.equal(r1.summary.opensThisMonth, 3);
  const T2 = day('2026-11-30');
  const r2 = buildMyRaces(fixture(T2), T2);
  // 11/30: closesToday(11/10) · closes7(11/16) · closes8(11/25) · monthStart(11/1) · registeredSaved(11/20). opens3 는 12/3 이라 빠진다
  assert.equal(r2.summary.opensThisMonth, 5);
  assert.equal(item(r2, FX.opens3).race.entry_opens, '2026-12-03');
  assert.deepEqual(item(r2, FX.closesToday).dday, { kind: 'closes', days: 0 });
});

test('동기화 전(브라우저 저장분): records 없이 registeredIds 만으로 접수 완료', () => {
  const f = fixture(T1, { synced: false });
  assert.equal(f.records.size, 0);
  const r = buildMyRaces(f, T1);
  assert.deepEqual(ids(r.byGroup.registered), [FX.registered, FX.registeredSaved]);
  assert.equal(item(r, FX.registered).record.status, 'registered');
  assert.equal(item(r, FX.registered).record.finish_sec, null);
  // 기록이 없어도 지난 대회는 날짜로 지난 대회
  assert.ok(ids(r.byGroup.past).includes(FX.finished));
  assert.equal(item(r, FX.finished).record, null);
  // FX.registered 는 저장하지 않았지만 접수했어요라서 보인다 → 15개 그대로
  assert.equal(r.items.length, 15);
});

test('groupOf 규칙 순서', () => {
  const race = f1.races.find((x) => x.id === FX.registeredSaved);
  assert.equal(groupOf(race, null, T1), 'open');
  assert.equal(groupOf(race, { race_id: race.id, status: 'registered' }, T1), 'registered');
  // 참가했어요가 먼저 (대회일이 아직이어도)
  assert.equal(groupOf(race, { race_id: race.id, status: 'finished' }, T1), 'past');
  // 취소가 접수했어요보다 먼저
  const cancelled = f1.races.find((x) => x.id === FX.cancelled);
  assert.equal(groupOf(cancelled, { race_id: cancelled.id, status: 'registered' }, T1), 'waiting');
  // 대회 당일은 아직 지난 대회가 아니다
  const today = { ...race, race_date: '2026-11-10' };
  assert.notEqual(groupOf(today, null, T1), 'past');
});

test('빈 목록', () => {
  const r = buildMyRaces(emptyFixture(T1), T1);
  assert.equal(r.items.length, 0);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.summary, { saved: 0, open: 0, closingSoon: 0, opensThisMonth: 0, registered: 0, upcoming: 0 });
  for (const g of MY_GROUPS) assert.deepEqual(r.byGroup[g], []);
});

test('입력 배열을 바꾸지 않는다', () => {
  const f = fixture(T1);
  const before = JSON.stringify([f.favIds, f.registeredIds, f.races.map((x) => x.id)]);
  buildMyRaces(f, T1);
  assert.equal(JSON.stringify([f.favIds, f.registeredIds, f.races.map((x) => x.id)]), before);
});

console.log(`myraces-test: ${n}개 통과`);
