// 파트 B 확인용: /rss.xml 항목 수·링크 200, /r/<id> 몇 개의 내부 링크 200
const base = process.argv[2] || 'http://localhost:8791';
const xml = await (await fetch(`${base}/rss.xml`)).text();
if (!xml.startsWith('<?xml') || !xml.includes('</rss>')) throw new Error('rss 모양 아님');
// 태그 짝 (간단 파서: 열고 닫는 수가 맞는지)
for (const t of ['item', 'title', 'link', 'guid', 'pubDate', 'description', 'category', 'channel']) {
  const o = (xml.match(new RegExp(`<${t}[ >]`, 'g')) || []).length;
  const c = (xml.match(new RegExp(`</${t}>`, 'g')) || []).length;
  if (o !== c) throw new Error(`${t} 짝 안 맞음 ${o}/${c}`);
}
if (/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml)) throw new Error('이스케이프 안 된 &');
const links = [...xml.matchAll(/<item>[\s\S]*?<link>([^<]+)<\/link>/g)].map((m) => m[1]);
console.log('items', links.length, 'unique', new Set(links).size);
const pub = [...xml.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => m[1]);
console.log('pubDate 예', pub[0], '…', pub.at(-1), 'bad', pub.filter((p) => isNaN(Date.parse(p))).length);
const toLocal = (u) => u.replace('https://marathon82.com', base);
const status = async (u) => (await fetch(toLocal(u), { redirect: 'manual' })).status;
let bad = 0;
for (let i = 0; i < links.length; i += 10) {
  const st = await Promise.all(links.slice(i, i + 10).map(status));
  st.forEach((s, j) => s !== 200 && (bad++, console.log('rss link', s, links[i + j])));
}
console.log('rss link 실패', bad);

// /r/ 페이지 안 내부 링크
const ids = process.argv.slice(3);
const seen = new Map();
for (const id of ids) {
  const h = await (await fetch(`${base}/r/${id}`)).text();
  for (const m of h.matchAll(/href="(\/[^"]*)"/g)) seen.set(m[1], id);
}
let bad2 = 0;
const hrefs = [...seen.keys()];
for (let i = 0; i < hrefs.length; i += 8) {
  const st = await Promise.all(hrefs.slice(i, i + 8).map((p) => fetch(base + p, { redirect: 'manual' }).then((r) => r.status)));
  st.forEach((s, j) => s !== 200 && (bad2++, console.log('link', s, hrefs[i + j], 'in', seen.get(hrefs[i + j]))));
}
console.log(`/r/ 내부 링크 ${hrefs.length}개, 실패 ${bad2}`);
