/**
 * DB 의 대회·여행사·패키지·비용 데이터를 src/lib/snapshot.json 으로 떠온다.
 * 서버가 멈췄을 때 사이트가 보여줄 내장 데이터가 된다. (의존성 없음)
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/snapshot.mjs
 */
import { writeFileSync } from 'node:fs';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.log('snapshot: 환경변수가 없어 건너뜀 (기존 snapshot.json 사용)');
  process.exit(0);
}
const get = async (path) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
};
try {
  const races = (await get('races?select=*&order=race_date')).map(({ created_at, updated_at, ...r }) => r);
  const snap = {
    races,
    agencies: await get('agencies?select=*'),
    packages: await get('packages?select=*'),
    costs: await get('cost_baselines?select=*'),
  };
  if (races.length < 10) throw new Error(`races 가 ${races.length}개뿐이라 덮어쓰지 않음`);
  writeFileSync(new URL('../src/lib/snapshot.json', import.meta.url), JSON.stringify(snap));
  console.log(`snapshot: races ${races.length}, packages ${snap.packages.length}, costs ${snap.costs.length}`);
} catch (e) {
  console.log('snapshot: 실패해서 기존 파일 유지 -', e.message);
}
