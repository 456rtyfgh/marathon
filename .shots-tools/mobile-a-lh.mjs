// 모바일 점검(파트 A) Lighthouse — PLAN.md 6.4. 빌드 결과 서버에서 주소마다 3번, 접근성 점수와 CLS(가운데 값).
//   node .shots-tools/mobile-a-lh.mjs before    기준 빌드 결과 서버(8781)  → .duo-shots/mobile/lh/before-a-<화면>-<번호>.json
//   node .shots-tools/mobile-a-lh.mjs after     지금 빌드 결과 서버(8791)  → .duo-shots/mobile/lh/after-a-<화면>-<번호>.json
// 서버는 먼저 띄워 둔다: node .shots-tools/mobile-a-serve.mjs basedist | dist  (지금 dist 는 build.lock 을 잡고)
// 한 번 끝날 때마다 build.lock 이 있으면 시각을 새로 찍는다(잠금을 오래 잡는 쪽의 약속).
// Chrome 을 못 찾으면 CHROME_PATH 를 준다.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] === 'before' ? 'before' : 'after';
const PORT = mode === 'before' ? 8781 : 8791;
const DIR = join(ROOT, '.duo-shots/mobile/lh');
const LOCK = join(ROOT, '.duo-shots/mobile/build.lock');
mkdirSync(DIR, { recursive: true });
const pages = [
  ['home', '/'],
  ['home-en', '/en/'],
];
const RUNS = 3;
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const lines = [];
for (const [name, path] of pages) {
  const a11y = [];
  const cls = [];
  const failed = new Set();
  for (let i = 1; i <= RUNS; i++) {
    const out = join(DIR, `${mode}-a-${name}-${i}.json`);
    try {
      execFileSync(
        'npx',
        ['-y', 'lighthouse', `http://127.0.0.1:${PORT}${path}`, '--only-categories=accessibility,performance', '--output=json', `--output-path=${out}`, '--chrome-flags=--headless=new', '--quiet'],
        { stdio: ['ignore', 'ignore', 'inherit'], timeout: 240000 },
      );
      const j = JSON.parse(readFileSync(out, 'utf8'));
      a11y.push(Math.round(j.categories.accessibility.score * 100));
      cls.push(Math.round(j.audits['cumulative-layout-shift'].numericValue * 1000) / 1000);
      for (const ref of j.categories.accessibility.auditRefs) {
        const au = j.audits[ref.id];
        if (au.score !== null && au.score < 1) failed.add(ref.id);
      }
    } catch (e) {
      console.error(`${name} ${i}번째 실패: ${String(e.message).slice(0, 200)}`);
    }
    if (existsSync(LOCK)) utimesSync(LOCK, new Date(), new Date());
  }
  lines.push(`${mode} ${name} ${path} · 접근성 ${a11y.join('/')} · CLS ${cls.join('/')} (가운데 ${cls.length ? median(cls) : '-'}) · 접근성 미달 항목: ${[...failed].join(', ') || '없음'}`);
  console.log(lines.at(-1));
}
writeFileSync(join(ROOT, '.duo-shots/mobile', `lh-a-${mode}.txt`), lines.join('\n') + '\n');
