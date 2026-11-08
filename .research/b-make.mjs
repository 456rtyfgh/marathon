// 라이브 DB 행(b-rows.json) + 바꾼 칸만으로 upsert 파일을 만든다
import fs from 'fs';
const rows = JSON.parse(fs.readFileSync('.research/b-rows.json', 'utf8'));
const T = '2026-11-07';
const fix = {
  kagoshima: ['2026-10-19', 'https://www.kagoshima-marathon.jp/news/2026/10/post-2046.html'],
  barcelona: ['2026-11-01', 'https://zurichmaratobarcelona.es/en/2026/11/01/zurich-marato-de-barcelona-makes-history-with-37000-entries-sold-becoming-spains-most-popular-marathon/'],
  biwako: ['2026-09-30', 'https://biwako-marathon.com/'],
  'nagoya-city-half': ['2026-10-23', 'https://city-marathon.nagoya/news/2026-10-21-8c22bfb2-0e41-40b7-9938-24bc699113c8/'],
  'asuka-half': ['2026-10-09', 'https://asuka-marathon.jp/app/?p=1031'],
  tokushima: ['2026-11-01', 'https://www.tokushima-marathon.jp/'],
  'itabashi-city-marathon': ['2026-10-26', 'https://i-c-m.jp/info/%e3%83%95%e3%83%ab%e3%83%9e%e3%83%a9%e3%82%bd%e3%83%b3%e4%b8%80%e8%88%ac%e6%9e%a0%e3%82%a8%e3%83%b3%e3%83%88%e3%83%aa%e3%83%bc%e7%b7%a0%e5%88%87%e3%81%ab%e3%81%a4%e3%81%84%e3%81%a6/'],
  'fukui-sakura': ['2026-10-01', 'https://www.fukui-sakura-marathon.jp/news/3432/'],
  nagano: ['2026-10-09', 'https://www.naganomarathon.gr.jp/office/5569.html'],
};
fs.mkdirSync('.research/b-upsert', { recursive: true });
for (const r of rows) {
  const [d, src] = fix[r.id];
  const { created_at, updated_at, ...row } = r;
  const out = { ...row, sold_out_on: d, source_url: src, last_verified: T };
  if (r.id === 'fukui-sakura') out.notes_ko = '후쿠이 시내 벚꽃 속을 달리는 대회. 9/26 일반 접수 시작 6일 만인 10/1 국내 정원 도달로 마감.';
  fs.writeFileSync(`.research/b-upsert/${r.id}.json`, JSON.stringify(out, null, 2));
}
console.log(fs.readdirSync('.research/b-upsert'));
