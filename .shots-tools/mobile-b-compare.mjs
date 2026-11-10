// 전(before)·후(after) 측정값을 장면별로 나란히: 넘침, 44px 미달 수, 13px 미만 수. mobile.md 의 수치 표를 만드는 데 쓴다.
//   node .shots-tools/mobile-b-compare.mjs [폭] [--diff]     (--diff: 달라진 장면·한쪽에만 있는 장면만)
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const width = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null;
const onlyDiff = process.argv.includes('--diff');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const load = (mode) => {
  const m = new Map();
  for (const line of readFileSync(join(root, '.duo-shots/mobile', `metrics-b-${mode}.txt`), 'utf8').split('\n').filter(Boolean)) {
    const [name, w, json] = line.split('\t');
    if (width && w !== width) continue;
    try {
      const v = JSON.parse(JSON.parse(json));
      const doc = v.overflow.find((o) => o.box === 'document');
      const over = v.overflow.filter((o) => o.box !== 'document').length;
      m.set(name, { sw: `${doc.scrollWidth}/${doc.width}${over ? `+상자${over}` : ''}`, small: v.small.length, tiny: v.tiny.length });
    } catch {
      m.set(name, { sw: '실패', small: -1, tiny: -1 });
    }
  }
  return m;
};
const before = load('before');
const after = load('after');
const names = [...new Set([...before.keys(), ...after.keys()])].sort();
let sb = 0;
let sa = 0;
console.log('장면\t넘침 전→후\t44px 미달 전→후\t13px 미만 전→후');
for (const n of names) {
  const b = before.get(n);
  const a = after.get(n);
  if (b) sb += Math.max(0, b.small);
  if (a) sa += Math.max(0, a.small);
  const same = b && a && b.sw === a.sw && b.small === a.small && b.tiny === a.tiny;
  if (onlyDiff && same) continue;
  console.log(`${n}\t${b?.sw ?? '-'} → ${a?.sw ?? '-'}\t${b?.small ?? '-'} → ${a?.small ?? '-'}\t${b?.tiny ?? '-'} → ${a?.tiny ?? '-'}`);
}
console.log(`장면 ${names.length}개, 44px 미달 합 ${sb} → ${sa}`);
