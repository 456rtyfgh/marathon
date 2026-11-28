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

/**
 * 인기 검색어: DB RPC popular_searches(최근 60일) → 개인정보·욕설·URL·숫자만 거르고, 현재 데이터(다가오는 대회)로
 * 결과가 1개 이상인 것만 남겨 public/popular-searches.json 에 쓴다. 대회 받기가 성공했든 실패했든 돈다
 * (그때 디스크에 있는 data.json 으로 색인). 어디서 실패해도 빈 목록으로 쓰고 빌드는 계속한다 (종료 코드 0).
 */
const popularPath = new URL('../public/popular-searches.json', import.meta.url);
const writePopular = (terms, source) => {
  const file = { generated_at: new Date().toISOString(), days: 60, source, terms };
  writeFileSync(popularPath, JSON.stringify(file));
  return file;
};
try {
  const r = await fetch(`${url}/rest/v1/rpc/popular_searches`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_days: 60, p_limit: 300 }),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`popular_searches ${r.status}`);
  const rows = await r.json();
  if (!Array.isArray(rows)) throw new Error('popular_searches 응답 형식이 배열이 아님');
  const { readFileSync } = await import('node:fs');
  const { splitData } = await import('./data-split.mjs');
  const { buildIndex, searchRaces } = await import('../src/lib/search.ts');
  const { filterPopular } = await import('./popular-lib.mjs');
  const data = splitData(JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'))).list;
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10); // 앱과 같은 '오늘' (한국 날짜)
  const index = buildIndex(data.races.filter((x) => x.race_date >= today));
  const terms = filterPopular(rows, (t) => searchRaces(index, t).size > 0);
  const file = writePopular(terms, 'rpc');
  console.log(`snapshot: 인기 검색어 ${rows.length}개 중 ${file.terms.length}개 남김`);
} catch (e) {
  try {
    writePopular([], 'empty');
  } catch {
    /* 쓰기도 실패하면 기존 파일 유지 */
  }
  console.log('snapshot: 인기 검색어 못 받아 빈 목록으로 씀 -', e.message);
}
