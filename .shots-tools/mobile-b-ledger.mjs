// 빌드가 추적 파일 evidence/ledger.csv 끝에 붙인 줄을 되돌린다 (PLAN 6.1 — 이 작업의 커밋에 넣지 않는다).
//   node .shots-tools/mobile-b-ledger.mjs
// git 에 있는 내용(HEAD)과 비교해, HEAD 내용 뒤에 줄만 더 붙은 경우에만 HEAD 내용으로 되쓴다. 다른 변경이 섞여 있으면 건드리지 않는다.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const file = join(root, 'evidence/ledger.csv');
const head = execFileSync('git', ['show', 'HEAD:evidence/ledger.csv'], { cwd: root, encoding: 'utf8' });
const now = readFileSync(file, 'utf8');
if (now === head) console.log('ledger: 그대로');
else if (now.startsWith(head)) {
  writeFileSync(file, head);
  console.log(`ledger: 빌드가 붙인 ${now.slice(head.length).split('\n').filter(Boolean).length}줄을 되돌림`);
} else {
  console.log('ledger: 붙인 줄 말고 다른 변경이 있어 건드리지 않음');
  process.exitCode = 1;
}
