/**
 * Cloudflare Pages 고급 모드: worker/pages.ts 를 dist/_worker.js 로 묶고,
 * 함수가 /r/*, /en/r/*, /cal/*, /d/*, /data.json 에서만 돌게 dist/_routes.json 을 쓴다 (나머지는 정적 파일이라 무료 한도를 안 쓴다).
 * 그 전에 대회 데이터를 목록 파일·전체 파일로 나눠 dist/d/ 에 쓰고 dist/data.json 을 지운다 (scripts/data-split.mjs).
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { writeSplit } from './data-split.mjs';

const dist = new URL('../dist/', import.meta.url).pathname;
const { listPath, fullPath } = writeSplit(dist);

await build({
  entryPoints: [new URL('../worker/pages.ts', import.meta.url).pathname],
  outfile: new URL('../dist/_worker.js', import.meta.url).pathname,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  minify: true,
  define: { __LIST_PATH__: JSON.stringify(listPath), __FULL_PATH__: JSON.stringify(fullPath) },
});
writeFileSync(
  new URL('../dist/_routes.json', import.meta.url),
  JSON.stringify({ version: 1, include: ['/r/*', '/en/r/*', '/cal/*', '/d/*', '/data.json'], exclude: [] }),
);
console.log(`pages: _worker.js, _routes.json, 목록 ${listPath}, 전체 ${fullPath}`);
