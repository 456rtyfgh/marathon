// 화면 확인용: dist/data.json 에만 A 조사 결과 sold_out_on 을 얹는다 (public/data.json 은 건드리지 않음)
const fs = require('fs');
const root = __dirname + '/..';
const out = root + '/.research/dist-a/data.json';
const d = JSON.parse(fs.readFileSync(out));
const a = JSON.parse(fs.readFileSync(__dirname + '/a-all.json'));
const m = new Map(a.map((r) => [r.id, r.sold_out_on]));
let n = 0;
for (const r of d.races) if (m.has(r.id)) { r.sold_out_on = m.get(r.id); n++; }
fs.writeFileSync(out, JSON.stringify(d));
console.log('patched', n);
