// DB 의 현재 row 를 받아 sold_out_on·source_url·last_verified 만 바꾼 upsert 파일을 만든다 (파트 A 조사 결과)
import { writeFileSync, mkdirSync } from 'fs';
const U = 'https://zhwmfvkwtmakieatlqtz.supabase.co';
const K = 'sb_publishable_uOBwP5-BbK7keBuq3gsMAg_Oil1yg6O';
const upd = {
  'yeongcheon-dam': ['2026-11-07', 'http://runyc.kr/'],
  florence: ['2026-08-27', 'https://www.firenzemarathon.it/e-sold-out-la-42-estra-firenze-marathon/'],
  macau: ['2026-11-07', 'https://www.macaomarathon.com/zh/'],
  'komatsushima-gyakufu-half': [
    '2026-08-03',
    'https://komatsushima-marathon.jp/info/%e3%83%8f%e3%83%bc%e3%83%95%e7%a8%ae%e7%9b%ae%e3%82%a8%e3%83%b3%e3%83%88%e3%83%aa%e3%83%bc%e7%b5%82%e4%ba%86%e3%81%ae%e3%81%8a%e7%9f%a5%e3%82%89%e3%81%9b/',
  ],
  'tokai-half': ['2026-07-30', 'https://www.tokai-halfmarathon.com/'],
  'tokyo-newyear-half': ['2026-11-07', 'https://hitech-half-marathon.net'],
  katsuta: ['2026-10-13', 'https://www.katsutamarathon.jp/'],
  'hamamatsu-city-marathon': ['2026-11-04', 'https://www.hamamatsu-city-marathon.com/'],
  seville: ['2026-04-24', 'https://www.zurichmaratonsevilla.es/en/zms-news-item/leer/260424-sold-out-bibs'],
};
const dir = new URL('./a-upsert/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const ids = Object.keys(upd).join(',');
const r = await fetch(`${U}/rest/v1/races?id=in.(${ids})&select=*`, { headers: { apikey: K, Authorization: `Bearer ${K}` } });
const rows = await r.json();
console.log(rows.length, 'sold_out_on' in rows[0]);
for (const row of rows) {
  const { created_at, updated_at, ...rest } = row;
  const [d, src] = upd[row.id];
  writeFileSync(`${dir}${row.id}.json`, JSON.stringify({ ...rest, sold_out_on: d, source_url: src, last_verified: '2026-11-07' }, null, 2));
  console.log(row.id, row.sold_out_on, row.source_url, '->', d);
}
