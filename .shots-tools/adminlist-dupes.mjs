// 관리 목록 점검용 — 같은 대회가 다른 id 로 두 번 있는지 찾는다 (읽기만)
// 사용: node .shots-tools/adminlist-dupes.mjs  (먼저 adminlist-fetch.mjs)
import fs from 'node:fs';
const races = JSON.parse(fs.readFileSync('.duo-shots/adminlist/races.json', 'utf8'));
const norm = (s) =>
  (s ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/20\d\d|제\s*\d+\s*회|\d+(st|nd|rd|th)/g, '')
    .replace(/마라톤대회|마라톤|marathon|대회|국제|international/g, '')
    .replace(/[^a-z0-9가-힣]/g, '');
const host = (u) => {
  try {
    const x = new URL(u);
    return x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/$/, '');
  } catch {
    return '';
  }
};
const groups = new Map();
const add = (why, key, r) => {
  if (!key) return;
  const k = why + '|' + key;
  if (!groups.has(k)) groups.set(k, { why, key, rows: [] });
  groups.get(k).rows.push(r);
};
for (const r of races) {
  add('이름+날짜', norm(r.name_ko) + '@' + r.race_date, r);
  add('영문이름+날짜', norm(r.name_en) + '@' + r.race_date, r);
  add('날짜+도시', r.race_date + '@' + (r.city_ko ?? '').trim(), r);
  add('공식주소+날짜', host(r.official_url) && host(r.official_url) + '@' + r.race_date, r);
  // 같은 해 같은 이름 (날짜가 조금 다르게 들어간 경우)
  add('이름+연도', norm(r.name_ko) && norm(r.name_ko) + '@' + r.race_date.slice(0, 4), r);
}
const seen = new Set();
const out = [];
for (const g of groups.values()) {
  if (g.rows.length < 2) continue;
  const sig = g.rows.map((r) => r.id).sort().join(',');
  if (seen.has(sig)) continue;
  seen.add(sig);
  out.push({ why: g.why, rows: g.rows });
}
fs.writeFileSync('.duo-shots/adminlist/dupes.json', JSON.stringify(out, null, 1));
const count = {};
for (const g of out) count[g.why] = (count[g.why] ?? 0) + 1;
console.log(count);
