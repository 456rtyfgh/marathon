// 모바일 점검(파트 A) 측정값 전후 표 — metrics-a-before.txt / metrics-a-after.txt 를 읽어 마크다운으로 찍는다.
//   node .shots-tools/mobile-a-summary.mjs            화면 × 폭: scrollWidth/폭, 44px 미달 수, 13px 미만 글자 종류 수, 흔들림 합 (전 → 후)
// 같은 이름이 여러 줄이면(장면만 다시 찍었을 때) 마지막 줄을 쓴다.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), '.duo-shots/mobile');
const read = (mode) => {
  const m = new Map();
  for (const line of readFileSync(join(DIR, `metrics-a-${mode}.txt`), 'utf8').split('\n')) {
    const [name, , json] = line.split(' · ');
    if (!json) continue;
    try {
      m.set(name, JSON.parse(json));
    } catch {
      m.set(name, null);
    }
  }
  return m;
};
const before = read('before');
const after = read('after');
const cell = (x) => (x ? `${x.overflow[0].scrollWidth}/${x.width}${x.overflow.length > 1 ? ` (+상자 ${x.overflow.length - 1})` : ''}` : '-');
console.log('| 화면 | scrollWidth/폭 전 → 후 | 44px 미달 전 → 후 | 13px 미만 글자 종류 전 → 후 | 흔들림 합 전 → 후 |');
console.log('|---|---|---|---|---|');
const leftSmall = new Set();
const leftTiny = new Set();
let bad = 0;
for (const name of new Set([...before.keys(), ...after.keys()])) {
  const b = before.get(name);
  const a = after.get(name);
  if (a && a.overflow[0].scrollWidth !== a.width) bad++;
  if (a && a.width < 640) {
    a.small.forEach((s) => leftSmall.add(s));
    a.tiny.forEach((s) => leftTiny.add(s));
  }
  console.log(`| ${name} | ${cell(b)} → ${cell(a)} | ${b ? b.small.length : '-'} → ${a ? a.small.length : '-'} | ${b ? b.tiny.length : '-'} → ${a ? a.tiny.length : '-'} | ${b ? b.shift : '-'} → ${a ? a.shift : '-'} |`);
}
console.log(`\n넘침(후, scrollWidth ≠ 폭): ${bad}개 화면`);
console.log(`휴대폰 폭(640px 미만)에 남은 44px 미달: ${[...leftSmall].join(' / ') || '없음'}`);
console.log(`휴대폰 폭에 남은 13px 미만 글자: ${[...leftTiny].join(' / ') || '없음'}`);
