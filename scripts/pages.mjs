/**
 * Cloudflare Pages 고급 모드: worker/pages.ts 를 dist/_worker.js 로 묶고,
 * 함수가 /r/*, /en/r/*, /cal/* 에서만 돌게 dist/_routes.json 을 쓴다 (나머지는 정적 파일이라 무료 한도를 안 쓴다).
 * 대회 목록 주소(/data/<해시>.json, scripts/prerender.mjs 가 만듦)는 워커에 __DATA_PATH__ 로 넣는다.
 */
import { build } from 'esbuild';
import { readdirSync, writeFileSync } from 'node:fs';

const dataFiles = readdirSync(new URL('../dist/data/', import.meta.url)).filter((f) => /^[0-9a-f]{12}\.json$/.test(f));
if (dataFiles.length !== 1) throw new Error(`pages: dist/data/ 에 대회 목록 파일이 ${dataFiles.length}개 (1개여야 함)`);
const DATA_PATH = `/data/${dataFiles[0]}`;

await build({
  entryPoints: [new URL('../worker/pages.ts', import.meta.url).pathname],
  outfile: new URL('../dist/_worker.js', import.meta.url).pathname,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  minify: true,
  define: { __DATA_PATH__: JSON.stringify(DATA_PATH) },
});
writeFileSync(
  new URL('../dist/_routes.json', import.meta.url),
  JSON.stringify({ version: 1, include: ['/r/*', '/en/r/*', '/cal/*', '/data.json'], exclude: [] }),
);
console.log(`pages: _worker.js (${DATA_PATH}), _routes.json`);
