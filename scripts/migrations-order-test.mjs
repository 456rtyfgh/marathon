/**
 * 합친 마이그레이션 순서 확인 (로컬 PGlite, 실제 DB 안 건드림): node scripts/migrations-order-test.mjs
 *  0001~0013 (alerts-db.mjs 와 같은 흉내) 위에 0014 → 0015[1] → 0016 → 0017 → 0018 → 0019 를 번호 순으로,
 *  그다음 한 번 더(두 번 돌려도 같은지). 0015 의 [0]·[2] 는 주석이라 그대로 돈다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { makeDb } from './alerts-db.mjs';

const root = new URL('../', import.meta.url).pathname;
const mig = (f) => readFileSync(resolve(root, 'supabase/migrations', f), 'utf8');
const files = ['0014_community.sql', '0015_admin_edit.sql', '0016_event.sql', '0017_alert_send.sql', '0018_push.sql', '0019_participation.sql'];

const db = await makeDb();
// 0016 은 races.discipline 이 대시보드에서 생긴 칸이라 저장소 0001 에 없을 수 있다 → 운영처럼 text 칸으로 먼저 둔다
await db.exec(`alter table public.races add column if not exists discipline text`);
let fail = 0;
for (const round of [1, 2]) {
  for (const f of files) {
    try {
      await db.exec(mig(f));
      console.log(`ok   ${round}회차 ${f}`);
    } catch (e) {
      fail++;
      console.log(`FAIL ${round}회차 ${f}: ${e.message}`);
    }
  }
}
const q = async (sql) => (await db.query(sql)).rows;
const checks = [
  ['race_admin_edits 표', `select to_regclass('public.race_admin_edits') is not null as ok`],
  ['discipline event 허용', `select not exists (select 1 from pg_constraint where conrelid = 'public.races'::regclass and contype = 'c' and pg_get_constraintdef(oid) ilike '%discipline%' and pg_get_constraintdef(oid) not ilike '%event%') as ok`],
  ['alert_send_log 표', `select to_regclass('public.alert_send_log') is not null as ok`],
  ['push_subscriptions 표', `select to_regclass('public.push_subscriptions') is not null as ok`],
  ['user_races.years 칸', `select exists (select 1 from information_schema.columns where table_name = 'user_races' and column_name = 'years') as ok`],
];
for (const [name, sql] of checks) {
  try {
    const [r] = await q(sql);
    if (r.ok) console.log(`ok   ${name}`);
    else {
      fail++;
      console.log(`FAIL ${name}`);
    }
  } catch (e) {
    fail++;
    console.log(`FAIL ${name}: ${e.message}`);
  }
}
console.log(fail ? `\n${fail} fail` : '\n전부 ok');
process.exit(fail ? 1 : 0);
