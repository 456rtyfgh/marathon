// 모바일 점검(파트 A) 눌러 보기용: 한 화면을 열어 스크롤 자리마다 찍고 측정값을 찍는다 (감사·수정 확인용, 세션 mobile-a2).
//   node .shots-tools/mobile-a-peek.mjs <주소> <폭> <이름> [y1,y2,…|선택자] [--dark] [--click=<선택자>]… [--js=<코드>]… [--jsfile=<파일>]… [--keep]
//   (주소가 '-' 면 열려 있는 화면 그대로. 흔들림 원인 보기: --jsfile=.shots-tools/mobile-a-shift-sources.js)
//   예: node .shots-tools/mobile-a-peek.mjs "http://127.0.0.1:5301/en/" 360 en-360 0,760,1520
//       node .shots-tools/mobile-a-peek.mjs "http://127.0.0.1:5301/" 390 menu 0 --click="[data-nav-menu-button]"
// 저장: .duo-shots/mobile/audit-a/<이름>-y<자리>.png. --keep 이 없으면 끝에 세션을 닫는다.
// 통계는 mobile-a-shots.mjs 가 만든 시작 스크립트(.duo-shots/mobile/mobile-a-init.js)로 흉내 낸다 — 먼저 shots 를 한 번 돌려 둔다.
import { execFileSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, '.duo-shots/mobile');
const OUT = join(DIR, 'audit-a');
mkdirSync(OUT, { recursive: true });
const [url, width = '390', name = 'peek', where = '0', ...flags] = process.argv.slice(2);
const outFile = join(DIR, 'mobile-a-peek.out');
const ab = (...args) => {
  const fd = openSync(outFile, 'w');
  try {
    execFileSync('agent-browser', ['--session', 'mobile-a2', ...args], { stdio: ['ignore', fd, fd], timeout: 60000 });
  } catch {
    /* 실패 글자는 그대로 돌려준다 */
  } finally {
    closeSync(fd);
  }
  return readFileSync(outFile, 'utf8').trim();
};
const w = Number(width);
ab('--init-script', join(DIR, 'mobile-a-init.js'), 'set', 'viewport', String(w), w >= 1000 ? '900' : '844');
ab('set', 'media', flags.includes('--dark') ? 'dark' : 'light');
if (url !== '-') {
  ab('open', url);
  ab('wait', '1800');
}
for (const f of flags) {
  if (f.startsWith('--click=')) console.log('click', ab('click', f.slice(8)));
  else if (f.startsWith('--js=')) console.log('js', ab('eval', f.slice(5)));
  else if (f.startsWith('--jsfile=')) console.log('js', ab('eval', readFileSync(resolve(f.slice(9)), 'utf8')));
  else continue;
  ab('wait', '400');
}
const spots = /^[\d,]+$/.test(where) ? where.split(',').map(Number) : [where];
for (const s of spots) {
  if (typeof s === 'number') ab('eval', `scrollTo({ top: ${s}, behavior: 'instant' })`);
  else ab('eval', `(() => { const el = document.querySelector(${JSON.stringify(s)}); if (el) scrollTo({ top: el.getBoundingClientRect().top + scrollY - 64, behavior: 'instant' }); })()`);
  ab('wait', '350');
  const file = join(OUT, `${name}-y${typeof s === 'number' ? s : 'sel'}.png`);
  ab('screenshot', file);
  console.log(file);
}
console.log(ab('eval', 'JSON.stringify(__mMeasure())'));
if (!flags.includes('--keep')) ab('close');
