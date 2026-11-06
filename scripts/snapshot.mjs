/**
 * DB 의 대회·여행사·패키지·비용 데이터를 public/data.json 으로 떠온다. (의존성 없음)
 * 사이트는 이 파일을 CDN 에서 받아 목록을 그린다 — 방문자가 많아도 DB 를 거의 안 쓴다.
 * 배포 워크플로가 매일 새로 떠서 올린다.
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/snapshot.mjs
 */
import { writeFileSync } from 'node:fs';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.log('snapshot: 환경변수가 없어 건너뜀 (기존 public/data.json 사용)');
  process.exit(0);
}
const get = async (path) => {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json();
};
/** DB 는 한 번에 최대 1000줄만 준다 — 끝날 때까지 나눠 받는다 */
const getAll = async (path) => {
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await get(`${path}&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
};
try {
  const races = (await getAll('races?select=*&order=race_date,id')).map(({ created_at, updated_at, ...r }) => r);
  const snap = {
    generated_at: new Date().toISOString(),
    races,
    agencies: await get('agencies?select=*'),
    packages: await get('packages?select=*'),
    costs: await get('cost_baselines?select=*'),
  };
  if (races.length < 10) throw new Error(`races 가 ${races.length}개뿐이라 덮어쓰지 않음`);
  writeFileSync(new URL('../public/data.json', import.meta.url), JSON.stringify(snap));
  console.log(`snapshot: races ${races.length}, packages ${snap.packages.length}, costs ${snap.costs.length}`);
} catch (e) {
  console.log('snapshot: 실패해서 기존 파일 유지 -', e.message);
}
