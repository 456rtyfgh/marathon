/**
 * supabase/data.json 의 대회·비용 데이터를 Supabase 로 upsert 한다.
 * 의존성 없음 (Node 18+ 의 fetch 만 사용). DB 비밀번호도 필요 없다.
 *
 *   SUPABASE_URL=... SUPABASE_KEY=... AUTOMATION_KEY=... node scripts/push-races.mjs
 */
import { readFileSync } from 'node:fs';

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
const AUTO = process.env.AUTOMATION_KEY;
if (!URL_ || !KEY || !AUTO) {
  console.error('SUPABASE_URL, SUPABASE_KEY, AUTOMATION_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

const { RACES, COSTS } = JSON.parse(readFileSync(new URL('../supabase/data.json', import.meta.url), 'utf8'));

const rpc = async (fn, body) => {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${fn} ${r.status}: ${(await r.text()).slice(0, 200)}`);
};

const fails = [];
let ok = 0;
for (const race of RACES) {
  try { await rpc('automation_upsert_race', { p_key: AUTO, p_race: race }); ok++; }
  catch (e) { fails.push(`${race.id}: ${e.message}`); }
}
console.log(`races: ${ok}/${RACES.length}`);

let cok = 0;
for (const c of COSTS) {
  try { await rpc('automation_upsert_cost', { p_key: AUTO, p_cost: c }); cok++; }
  catch (e) { fails.push(`cost ${c.race_id}: ${e.message}`); }
}
console.log(`cost_baselines: ${cok}/${COSTS.length}`);
if (fails.length) console.log('실패:\n  ' + fails.slice(0, 15).join('\n  '));
