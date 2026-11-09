/**
 * Cloudflare Pages 고급 모드: worker/pages.ts 를 dist/_worker.js 로 묶고,
 * 함수가 /r/*, /en/r/*, /cal/*, /__ping 에서만 돌게 dist/_routes.json 을 쓴다 (나머지는 정적 파일이라 무료 한도를 안 쓴다).
 */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';

await build({
  entryPoints: [new URL('../worker/pages.ts', import.meta.url).pathname],
  outfile: new URL('../dist/_worker.js', import.meta.url).pathname,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  minify: true,
});
writeFileSync(
  new URL('../dist/_routes.json', import.meta.url),
  JSON.stringify({ version: 1, include: ['/r/*', '/en/r/*', '/cal/*', '/__ping'], exclude: [] }),
);
console.log('pages: _worker.js, _routes.json');
