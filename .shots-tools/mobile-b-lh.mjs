// 파트 B Lighthouse(모바일 기본 설정): 접근성 점수와 CLS 를 주소마다 잰다. 빌드 결과 서버에서.
//   node .shots-tools/mobile-b-lh.mjs <before|after> <포트> [반복=1]
// 저장: .duo-shots/mobile/lh/<before|after>-b-<화면>-<번호>.json, 요약은 .duo-shots/mobile/lh-b-<before|after>.txt
// 주소: /r/<국내 id>, /r/<해외 id>, /community, /privacy, /terms (PLAN 6.4). CLS 가 0.05 를 넘으면 그 주소만 3번까지 더 잰다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode, port, runsArg = '1'] = process.argv.slice(2);
if (!/^(before|after)$/.test(mode ?? '') || !port) {
  console.error('사용: node .shots-tools/mobile-b-lh.mjs <before|after> <포트> [반복]');
  process.exit(1);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, '.duo-shots/mobile/lh');
mkdirSync(dir, { recursive: true });
const PAGES = [
  ['detail-kr', '/r/seoul-bbangrun'],
  ['detail-abroad', '/r/tokyo'],
  ['community', '/community'],
  ['privacy', '/privacy'],
  ['terms', '/terms'],
];
const lines = [];
const one = (name, path, n) => {
  const out = join(dir, `${mode}-b-${name}-${n}.json`);
  try {
    execFileSync(
      'npx',
      ['-y', 'lighthouse', `http://127.0.0.1:${port}${path}`, '--only-categories=accessibility,performance', '--output=json', `--output-path=${out}`, '--chrome-flags=--headless=new', '--quiet'],
      { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 },
    );
    const j = JSON.parse(readFileSync(out, 'utf8'));
    const failed = Object.values(j.audits)
      .filter((a) => j.categories.accessibility.auditRefs.some((r) => r.id === a.id) && a.score !== null && a.score < 1)
      .map((a) => a.id);
    return { a11y: Math.round(j.categories.accessibility.score * 100), cls: Number(j.audits['cumulative-layout-shift'].numericValue.toFixed(4)), failed };
  } catch (e) {
    return { error: String(e.stderr || e.message).slice(0, 200) };
  }
};
for (const [name, path] of PAGES) {
  const results = [];
  let runs = Number(runsArg);
  for (let n = 1; n <= runs; n++) {
    const r = one(name, path, n);
    results.push(r);
    if (n === 1 && runs === 1 && r.cls > 0.05) runs = 3; // CLS 가 크면 3번 재서 가운데 값
  }
  const ok = results.filter((r) => !r.error);
  const cls = ok.map((r) => r.cls).sort((a, b) => a - b);
  const line = ok.length
    ? `${name}\t${path}\t접근성 ${ok[0].a11y}\tCLS ${cls[Math.floor(cls.length / 2)]} (${cls.join(', ')})\t실패 항목: ${ok[0].failed.join(', ') || '없음'}`
    : `${name}\t${path}\t실패: ${results[0].error}`;
  lines.push(line);
  console.log(line);
}
writeFileSync(join(root, '.duo-shots/mobile', `lh-b-${mode}.txt`), lines.join('\n') + '\n');
