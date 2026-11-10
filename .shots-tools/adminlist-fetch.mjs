// 관리 목록 점검용 — 운영 DB 읽기 전용: races 전체를 받아 .duo-shots/adminlist/races.json 에 저장
// 사용: node .shots-tools/adminlist-fetch.mjs .env
import fs from 'node:fs';
const env = Object.fromEntries(
  fs.readFileSync(process.argv[2], 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
);
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
const all = [];
for (let from = 0; ; from += 1000) {
  const res = await fetch(
    `${url}/rest/v1/races?select=id,name_ko,name_en,city_ko,country_ko,race_date,date_confidence,last_verified,official_url,distances&order=race_date,id`,
    { headers: { apikey: key, Range: `${from}-${from + 999}` } },
  );
  const d = await res.json();
  if (!Array.isArray(d)) throw new Error(JSON.stringify(d));
  all.push(...d);
  if (d.length < 1000) break;
}
fs.mkdirSync('.duo-shots/adminlist', { recursive: true });
fs.writeFileSync('.duo-shots/adminlist/races.json', JSON.stringify(all));
console.log('rows', all.length, 'unique ids', new Set(all.map((r) => r.id)).size);
