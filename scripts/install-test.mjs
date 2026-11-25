/**
 * 앱 설치 단위 확인: node scripts/install-test.mjs
 * src/lib/installApp.ts(+ analytics.ts) 를 esbuild 로 임시 묶어 가짜 window·navigator·fetch 위에서 돌린다.
 *  - 판정(pickKind·isIosUa), beforeinstallprompt 를 모듈이 보관해 팝업·메뉴가 같이 쓰는지
 *  - 설치 창 수락·거절, appinstalled(한 번만) 기록
 *  - analytics toStat 의 'install' → 자체 집계(stat_hit) { e:'install', k:<action> }
 *  - 키가 서버 키 검사(40자, 태그·따옴표·주소 금지)를 통과하는 짧은 영문인지
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let failed = 0;
const ok = (cond, msg) => {
  if (cond) console.log(`  ok  ${msg}`);
  else {
    failed++;
    console.error(`  FAIL ${msg}`);
  }
};

// ── 가짜 브라우저 (모듈을 불러오기 전에) ──
const win = new EventTarget();
win.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.window = win;
globalThis.addEventListener = win.addEventListener.bind(win);
globalThis.location = { hostname: 'marathon82.com', search: '', href: 'https://marathon82.com/' };
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Mobile Chrome', platform: 'Linux armv8l', maxTouchPoints: 5 },
  configurable: true,
});
const sent = [];
globalThis.fetch = (url, init) => {
  if (String(url).includes('/rpc/stat_hit')) sent.push(...JSON.parse(init.body).p_items);
  return Promise.resolve(new Response('null'));
};

const root = new URL('../', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'install-test-'));
const out = join(tmp, 'install.mjs');
await build({
  stdin: { contents: "export * from './src/lib/installApp.ts';", resolveDir: root, loader: 'ts' },
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  mainFields: ['module', 'main'],
  define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': JSON.stringify({ VITE_SUPABASE_URL: 'https://sb.test', VITE_SUPABASE_ANON_KEY: 'k', VITE_GA_ID: '' }) },
  logLevel: 'error',
});
const m = await import(pathToFileURL(out).href);
rmSync(tmp, { recursive: true, force: true });

console.log('판정');
ok(m.pickKind({ standalone: true, installed: false, hasPrompt: true, ios: false }) === 'none', '이미 앱(standalone) → none (메뉴 항목 숨김)');
ok(m.pickKind({ standalone: false, installed: true, hasPrompt: false, ios: true }) === 'none', '설치를 마침 → none');
ok(m.pickKind({ standalone: false, installed: false, hasPrompt: true, ios: false }) === 'prompt', '설치 창 이벤트 있음 → prompt');
ok(m.pickKind({ standalone: false, installed: false, hasPrompt: false, ios: true }) === 'ios', '아이폰 → ios 안내');
ok(m.pickKind({ standalone: false, installed: false, hasPrompt: false, ios: false }) === 'manual', '설치 창 없음(안드로이드 이벤트 전 등) → 브라우저 메뉴 안내');
ok(m.isIosUa('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'), '아이폰 UA');
ok(m.isIosUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5), '아이패드(맥으로 보이는 사파리)');
ok(!m.isIosUa('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0), '맥 데스크톱은 아이폰 아님');
ok(!m.isIosUa('Mozilla/5.0 (Linux; Android 14) Mobile'), '안드로이드는 아이폰 아님');

console.log('설치 창 이벤트 공유');
ok(m.installKind() === 'manual', '이벤트 오기 전 안드로이드 → manual');
const fakeBip = (outcome) => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = async () => {
    e.prompted = (e.prompted ?? 0) + 1;
  };
  e.userChoice = Promise.resolve({ outcome });
  return e;
};
const e1 = fakeBip('dismissed');
win.dispatchEvent(e1);
ok(e1.defaultPrevented, '모듈이 preventDefault 로 보관 (브라우저 기본 배너 대신)');
ok(m.installKind() === 'prompt', '보관 뒤 → prompt (팝업·메뉴 어디서든)');
ok((await m.runInstall()) === 'dismissed' && e1.prompted === 1, '설치 창 거절 → dismissed');
ok(m.installKind() === 'manual', 'prompt() 는 한 번뿐 → 다시 manual');
ok((await m.runInstall()) === 'unavailable', '이벤트 없이 runInstall → unavailable');
// 설치 창이 떠 있는 동안(답 전)에는 'prompt' 그대로 — 팝업·메뉴가 안내 글로 바뀌지 않게
let answer;
const ep = fakeBip('dismissed');
ep.userChoice = new Promise((r) => (answer = r));
win.dispatchEvent(ep);
const pending = m.runInstall();
await new Promise((r) => setTimeout(r, 0));
ok(m.installKind() === 'prompt', '설치 창이 떠 있는 동안 → prompt 유지');
ok((await m.runInstall()) === 'unavailable', '떠 있는 동안 또 누름 → unavailable (prompt 두 번 안 부름)');
answer({ outcome: 'dismissed' });
ok((await pending) === 'dismissed' && m.installKind() === 'manual', '답이 온 뒤 → manual');
const e2 = fakeBip('accepted');
win.dispatchEvent(e2);
ok((await m.runInstall()) === 'accepted', '설치 창 수락 → accepted');
win.dispatchEvent(new Event('appinstalled'));
win.dispatchEvent(new Event('appinstalled'));
ok(m.installKind() === 'none', 'appinstalled 뒤 → none (메뉴 항목·팝업 숨김)');

console.log('기록 (stat_hit install)');
m.record('shown');
m.record('ios_guide');
// 25개가 모이면 바로 보낸다
for (let i = 0; i < 25; i++) m.record('shown');
await new Promise((r) => setTimeout(r, 0));
const keys = (k) => sent.filter((h) => h.e === 'install' && h.k === k).reduce((a, h) => a + h.n, 0);
ok(keys('dismissed') === 2, `dismissed 2번 (설치 창 거절 둘) — ${keys('dismissed')}`);
ok(keys('accepted') === 1, `accepted 1번 — ${keys('accepted')}`);
ok(keys('installed') === 1, `installed 1번 (appinstalled 가 두 번 와도) — ${keys('installed')}`);
ok(keys('ios_guide') === 1 && keys('shown') >= 1, 'shown·ios_guide 기록');
ok(sent.every((h) => h.e === 'install'), "이벤트 이름은 'install' 그대로");
ok(
  m.INSTALL_ACTIONS.every((k) => /^[a-z_]{1,40}$/.test(k) && !/[<>"'`{}\\]/.test(k)),
  `키 ${m.INSTALL_ACTIONS.join('·')} 는 짧은 영문 (서버 키 검사 통과)`,
);
const other = sent.filter((h) => !m.INSTALL_ACTIONS.includes(h.k));
ok(!other.length, `정해진 5종 밖의 키 없음 ${other.map((h) => h.k).join(',')}`);

if (failed) {
  console.error(`install-test: 실패 ${failed}개`);
  process.exit(1);
}
console.log('install-test: 통과');
