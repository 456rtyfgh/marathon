import fs from 'fs';
const src = fs.readFileSync('src/lib/spam.ts', 'utf8')
  .replace(/export /g, '')
  .replace(/: string \| null \| undefined\)/, ')')
  .replace(/\): string \| null \{/, ') {')
  .replace(/\(e: unknown, fallback: string\)/, '(e, fallback)');
const spamReason = new Function(src + '; return spamReason;')();
const d = JSON.parse(fs.readFileSync('public/data.json', 'utf8'));
let n = 0;
for (const r of d.races) {
  for (const t of [`[조기마감 제보] ${r.id}`, r.name_ko, r.country_ko]) {
    const s = spamReason(t);
    if (s) { n++; console.log(r.id, t, s.slice(0, 30)); }
  }
}
console.log('hits', n, 'of', d.races.length);
