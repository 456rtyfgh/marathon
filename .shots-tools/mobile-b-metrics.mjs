// mobile-b-shots.mjs 가 남긴 측정값(metrics-b-<before|after>.txt)을 읽기 쉽게 요약한다.
//   node .shots-tools/mobile-b-metrics.mjs <before|after> [폭] [--full]
// 장면마다: 넘침 여부(문서 scrollWidth/폭, 넘친 상자), 44px 미달 터치 대상 수, 13px 미만 글자 수. --full 이면 목록도.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode = 'before', width, flag] = process.argv.slice(2);
const full = process.argv.includes('--full');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lines = readFileSync(join(root, '.duo-shots/mobile', `metrics-b-${mode}.txt`), 'utf8').split('\n').filter(Boolean);
const last = new Map(); // 같은 장면을 다시 찍었으면 마지막 것
for (const line of lines) {
  const [name, w, json] = line.split('\t');
  if (width && width !== '--full' && w !== width) continue;
  last.set(name, json);
}
let bad = 0;
let smallSum = 0;
for (const [name, json] of last) {
  let m;
  try {
    m = JSON.parse(JSON.parse(json));
  } catch {
    console.log(`${name}\t측정 실패 ${String(json).slice(0, 80)}`);
    bad++;
    continue;
  }
  const doc = m.overflow.find((o) => o.box === 'document');
  const over = m.overflow.filter((o) => o.box !== 'document');
  const ok = doc.scrollWidth === doc.width && over.length === 0;
  if (!ok) bad++;
  smallSum += m.small.length;
  console.log(`${name}\t${doc.scrollWidth}/${doc.width}${over.length ? ' 넘침 ' + JSON.stringify(over) : ''}\t44px미달 ${m.small.length}\t13px미만 ${m.tiny.length}\tshift ${m.shift}`);
  if (full) {
    if (m.small.length) console.log('    small: ' + m.small.join(' | '));
    if (m.tiny.length) console.log('    tiny: ' + m.tiny.join(' | '));
  }
}
console.log(`장면 ${last.size}개, 넘침·실패 ${bad}개, 44px 미달 합 ${smallSum}개`);
void flag;
