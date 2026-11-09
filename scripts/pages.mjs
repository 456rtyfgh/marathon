/**
 * Cloudflare Pages 고급 모드: worker/pages.ts 를 dist/_worker.js 로 묶고,
 * 함수가 /r/*, /en/r/*, /cal/*, /d/*, /data.json, /api/* 에서만 돌게 dist/_routes.json 을 쓴다 (나머지는 정적 파일이라 무료 한도를 안 쓴다).
 * 그 전에 대회 데이터를 목록 파일·전체 파일로 나눠 dist/d/ 에 쓰고 dist/data.json 을 지운다 (scripts/data-split.mjs).
 * /api/admin/ga 의 관리자 확인에 쓰는 Supabase 주소·anon 키(공개 값)도 넣는다:
 * 환경변수 VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY → .duo-data/snap.env → .env 순 (scripts/evidence.mjs 와 같음).
 */
import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';
import { writeSplit } from './data-split.mjs';

const dist = new URL('../dist/', import.meta.url).pathname;
const { listPath, fullPath } = writeSplit(dist);

/** KEY=VALUE 줄만 읽는다 (따옴표는 벗긴다) */
function readEnvFile(path) {
  try {
    const out = {};
    for (const line of readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    return out;
  } catch {
    return null;
  }
}
let sbUrl = process.env.VITE_SUPABASE_URL ?? '';
let sbKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';
for (const f of ['.duo-data/snap.env', '.env']) {
  if (sbUrl && sbKey) break;
  const env = readEnvFile(f);
  if (env?.VITE_SUPABASE_URL && env?.VITE_SUPABASE_ANON_KEY) {
    sbUrl = env.VITE_SUPABASE_URL;
    sbKey = env.VITE_SUPABASE_ANON_KEY;
  }
}

await build({
  entryPoints: [new URL('../worker/pages.ts', import.meta.url).pathname],
  outfile: new URL('../dist/_worker.js', import.meta.url).pathname,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  minify: true,
  define: {
    __LIST_PATH__: JSON.stringify(listPath),
    __FULL_PATH__: JSON.stringify(fullPath),
    __SUPABASE_URL__: JSON.stringify(sbUrl),
    __SUPABASE_ANON_KEY__: JSON.stringify(sbKey),
  },
});
writeFileSync(
  new URL('../dist/_routes.json', import.meta.url),
  JSON.stringify({ version: 1, include: ['/r/*', '/en/r/*', '/cal/*', '/d/*', '/data.json', '/api/*'], exclude: [] }),
);
console.log(`pages: _worker.js, _routes.json, 목록 ${listPath}, 전체 ${fullPath}, Supabase ${sbUrl ? '있음' : '없음(/api/admin/ga 는 500)'}`);
