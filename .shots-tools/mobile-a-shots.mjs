// 모바일 점검(파트 A) 스크린샷·측정 — PLAN.md 6.4.
//   node .shots-tools/mobile-a-shots.mjs before          기준 개발 서버(5311) → .duo-shots/mobile/before, metrics-a-before.txt
//   node .shots-tools/mobile-a-shots.mjs after           지금 개발 서버(5301) → .duo-shots/mobile/after,  metrics-a-after.txt
//   node .shots-tools/mobile-a-shots.mjs after hot,menu  이름이 그 글자로 시작하는 장면만 (측정 파일에는 그 줄만 새로 붙는다)
// 서버는 먼저 띄워 둔다: node .shots-tools/mobile-a-serve.mjs dev | basedev
// 통계(조회·저장·인기)는 실제 DB 대신 mobile-a-stats.json 을 브라우저 쪽에서 돌려준다 (fetch 감싸기). 'nostats' 장면만 통계 없이.
// 끝나면 브라우저 세션(mobile-a)을 닫는다.
import { execFileSync } from 'node:child_process';
import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const mode = process.argv[2] === 'before' ? 'before' : 'after';
const only = (process.argv[3] ?? '').split(',').filter(Boolean);
const PORT = mode === 'before' ? 5311 : 5301;
const OUT = join(ROOT, '.duo-shots/mobile', mode);
const LOG = join(ROOT, '.duo-shots/mobile', `metrics-a-${mode}.txt`);
mkdirSync(OUT, { recursive: true });
if (!only.length) writeFileSync(LOG, '');

// 시작 스크립트: 측정 함수 + 통계 응답 흉내 (주소에 nostats 가 있으면 흉내를 끈다 → 가짜 주소가 404 로 끝나 통계 없는 화면)
const initFile = join(ROOT, '.duo-shots/mobile', 'mobile-a-init.js');
writeFileSync(
  initFile,
  readFileSync(join(HERE, 'mobile-a-measure.js'), 'utf8') +
    `
(() => {
  const stats = ${JSON.stringify(JSON.parse(readFileSync(join(HERE, 'mobile-a-stats.json'), 'utf8')))};
  const real = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : input?.url ?? String(input);
    if (/\\/rpc\\/race_public_stats/.test(url) && !/nostats/.test(location.search)) {
      return Promise.resolve(new Response(JSON.stringify(stats), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    return real.apply(this, arguments);
  };
})();
`,
);

const SESSION = 'mobile-a';
// 출력은 파이프가 아니라 임시 파일로 받는다 — 브라우저 데몬이 파이프를 물고 있으면 첫 명령이 끝나지 않는다
const outFile = join(ROOT, '.duo-shots/mobile', 'mobile-a-ab.out');
const ab = (...args) => {
  const fd = openSync(outFile, 'w');
  try {
    execFileSync('agent-browser', ['--session', SESSION, ...args], { stdio: ['ignore', fd, fd], timeout: 60000 });
  } catch {
    /* 실패 글자는 아래에서 그대로 돌려준다 */
  } finally {
    closeSync(fd);
  }
  return readFileSync(outFile, 'utf8').trim();
};
/** eval 결과: agent-browser 가 JSON 문자열로 찍으므로 한 겹 벗긴다 */
const js = (code) => {
  const out = ab('eval', code);
  try {
    const v = JSON.parse(out);
    return typeof v === 'string' ? v : JSON.stringify(v);
  } catch {
    return out;
  }
};
/** 요소를 화면 위쪽(머리말 아래)에 맞춘다 — 전후 같은 자리 */
const toTop = (sel, gap = 64) =>
  js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return 'none'; scrollTo(0, 0); const y = el.getBoundingClientRect().top + scrollY - ${gap}; scrollTo({ top: y, behavior: 'instant' }); return Math.round(y); })()`);

const HOT = '[aria-label="요즘 인기 대회"], [aria-label="Trending races"]';
/** 장면: [이름, 주소, 조작(순서대로), 폭(없으면 전부), 측정 여부] */
const scenes = [
  { name: 'home-top', path: '/' },
  { name: 'home-nostats-top', path: '/?nostats=1', widths: [390] },
  { name: 'home-toolbar', path: '/', steps: [() => toTop('[role=search]', 72)], measure: false },
  { name: 'home-filters-closed', path: '/', steps: [() => ab('click', 'button[aria-expanded]'), () => toTop('[role=search]', 72)], widths: [390] },
  { name: 'home-map-kr', path: '/', steps: [() => toTop('#list', 520)], measure: false },
  { name: 'home-list', path: '/', steps: [() => toTop('#list', 64)], measure: false },
  { name: 'home-list-mid', path: '/', steps: [() => toTop('#list li:nth-child(6)', 64)], measure: false },
  { name: 'home-hot', path: '/', steps: [() => toTop(HOT, 120)], measure: false },
  { name: 'home-bottom', path: '/', steps: [() => js('scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" })')], measure: false },
  { name: 'menu', path: '/', steps: [() => ab('click', '[data-nav-menu-button]')], widths: [360, 390, 414] },
  { name: 'all-entry-list', path: '/?scope=all&sort=entry&status=', steps: [() => toTop('#list', 64)] },
  { name: 'abroad-map', path: '/?scope=abroad', steps: [() => toTop('#list', 560)] },
  { name: 'search', path: '/?q=%EB%8F%84%EC%BF%84', steps: [() => toTop('#list', 64)], widths: [390, 1280] },
  { name: 'empty', path: '/?q=zzzzqq', steps: [() => toTop('#list', 64)], widths: [360, 390, 1280] },
  { name: 'selected', path: '/?status=open,upcoming', steps: [() => js(`[...document.querySelectorAll('button[aria-pressed]')].filter((b) => /국내|Trail|트레일|Lottery|추첨/.test(b.innerText)).slice(0, 2).forEach((b) => b.click())`), () => toTop('[role=search]', 72)], widths: [390, 1280], dark: true },
];

const WIDTHS = [360, 390, 414, 1280];
const langs = [
  ['ko', ''],
  ['en', '/en'],
];

ab('close');
ab('--init-script', initFile, 'set', 'viewport', '390', '844');
ab('set', 'media', 'light'); // 기기 설정이 다크여도 기본 장면은 라이트로
let shots = 0;
const run = (scene, w, lang, prefix, tag = '') => {
  const name = `a-${scene.name}${tag}-${lang}-${w}`;
  if (only.length && !only.some((o) => scene.name.startsWith(o))) return;
  const [p, q = ''] = scene.path.split('?');
  ab('open', `http://127.0.0.1:${PORT}${prefix}${p}${q ? `?${q}` : ''}`);
  ab('wait', '#list h2, #list p');
  ab('wait', '900');
  const shift = scene.steps ? js('__mShift()') : null; // 조작 전 흔들림 합 (첫 화면 CLS 어림)
  for (const s of scene.steps ?? []) {
    s();
    ab('wait', '350');
  }
  if (scene.measure !== false) appendFileSync(LOG, `${name} · ${w} · ${js('JSON.stringify(__mMeasure())')}${shift ? ` · shift0=${shift}` : ''}\n`);
  ab('screenshot', join(OUT, `${name}.png`));
  shots++;
};
for (const w of WIDTHS) {
  ab('set', 'viewport', String(w), w === 1280 ? '900' : '844');
  for (const [lang, prefix] of langs) {
    for (const scene of scenes) {
      if (scene.widths && !scene.widths.includes(w)) continue;
      run(scene, w, lang, prefix);
    }
  }
}
// 다크: 색이 걸린 장면만 (인기 대회 금·은·동, 선택 모양) — 390·1280
ab('set', 'media', 'dark');
for (const w of [390, 1280]) {
  ab('set', 'viewport', String(w), w === 1280 ? '900' : '844');
  for (const [lang, prefix] of langs) {
    run({ name: 'hot-dark', path: '/', steps: [() => toTop(HOT, 120)], measure: false }, w, lang, prefix);
    if (lang === 'ko') {
      const sel = scenes.find((s) => s.name === 'selected');
      run({ ...sel, name: 'selected-dark', measure: false }, w, lang, prefix);
      if (w === 390) run({ name: 'home-top-dark', path: '/', measure: false }, w, lang, prefix);
    }
  }
}
ab('set', 'media', 'light');
for (const w of [390, 1280]) {
  ab('set', 'viewport', String(w), w === 1280 ? '900' : '844');
  for (const [lang, prefix] of langs) run({ name: 'hot-light', path: '/', steps: [() => toTop(HOT, 120)], measure: false }, w, lang, prefix);
}
ab('close');
console.log(`저장: ${OUT} (${shots}장), 측정값: ${LOG}`);
