// 모바일 점검(파트 A) 서버 띄우기 — PLAN.md 6.2.
//   node .shots-tools/mobile-a-serve.mjs base        기준 커밋(a670d4a)을 .duo-shots/mobile/base-a 에 푼다 (이미 있으면 그대로)
//   node .shots-tools/mobile-a-serve.mjs dev         지금 코드 개발 서버 5301 (통계 흉내용 가짜 Supabase 주소)
//   node .shots-tools/mobile-a-serve.mjs basedev     기준 코드 개발 서버 5311
//   node .shots-tools/mobile-a-serve.mjs dist        지금 dist 를 wrangler pages dev 8791 로 (빌드는 따로, 잠금 잡고)
//   node .shots-tools/mobile-a-serve.mjs basebuild   기준 폴더 빌드
//   node .shots-tools/mobile-a-serve.mjs basedist    기준 폴더 dist 를 wrangler pages dev 8781 로
// dev·basedev·dist·basedist 는 앞에서 돈다 — 백그라운드로 띄우고, 끝나면 lsof -ti:<포트> | xargs kill
// 주의
//  - 실제 DB 에 붙이지 않는다. VITE_SUPABASE_URL 은 개발 서버 자기 주소의 가짜 경로(/__sb)이고,
//    통계 응답은 브라우저 쪽(mobile-a-init.js)에서 가짜로 돌려준다. 그 밖의 요청은 404 로 끝난다.
//  - node_modules 가 링크(git worktree)라 글꼴이 'serving allow list 밖' 으로 막힌다 → fs.allow 에 실제 경로를 더한 임시 설정.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NM = realpathSync(join(ROOT, 'node_modules'));
const OUT = join(ROOT, '.duo-shots/mobile');
const BASE = join(OUT, 'base-a');
const BASE_COMMIT = 'a670d4a';
mkdirSync(OUT, { recursive: true });

// watch.ignored: .duo-data(다른 작업이 쓰는 폴더 링크)·.duo-shots(기준 폴더·스크린샷)가 바뀔 때마다 화면이 새로고침되지 않게
const viteConfig = (file, from, allow) =>
  writeFileSync(
    file,
    `import base from '${from}';\nexport default { ...base, server: { fs: { allow: ['${allow}', '${NM}'] }, watch: { ignored: ['**/.duo-data/**', '**/.duo-shots/**', '**/.shots/**', '**/dist/**'] } } };\n`,
  );

function unpack() {
  if (existsSync(join(BASE, 'package.json'))) return viteConfig(join(BASE, 'vite-shot.config.ts'), './vite.config.ts', BASE);
  mkdirSync(BASE, { recursive: true });
  // 스크린샷·영상 폴더는 빌드에 필요 없고 크다
  const ar = spawnSync('git', ['archive', BASE_COMMIT, '--', '.', ':!.shots', ':!.watch', ':!.research', ':!checkpoints'], {
    cwd: ROOT,
    maxBuffer: 1 << 30,
  });
  if (ar.status !== 0) throw new Error(`git archive 실패: ${ar.stderr}`);
  const tar = spawnSync('tar', ['-x', '-C', BASE], { input: ar.stdout });
  if (tar.status !== 0) throw new Error(`tar 실패: ${tar.stderr}`);
  symlinkSync(NM, join(BASE, 'node_modules'));
  symlinkSync(realpathSync(join(ROOT, '.duo-data')), join(BASE, '.duo-data'));
  viteConfig(join(BASE, 'vite-shot.config.ts'), './vite.config.ts', BASE);
}

/** 앞에서 돌리고, 끝나면 같은 코드로 끝낸다 */
function run(cmd, args, opts) {
  const p = spawn(cmd, args, { stdio: 'inherit', ...opts });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => p.kill(sig));
  p.on('exit', (code) => process.exit(code ?? 0));
}
const devEnv = (port) => ({
  ...process.env,
  NODE_ENV: 'development',
  VITE_SUPABASE_URL: `http://127.0.0.1:${port}/__sb`,
  VITE_SUPABASE_ANON_KEY: 'dev',
});

const mode = process.argv[2];
if (mode === 'base') {
  unpack();
  console.log('기준 폴더:', BASE);
} else if (mode === 'dev') {
  const cfg = join(OUT, 'vite-a.config.ts');
  viteConfig(cfg, '../../vite.config.ts', ROOT);
  run('npx', ['vite', '--config', cfg, '--port', '5301', '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, env: devEnv(5301) });
} else if (mode === 'basedev') {
  unpack();
  run('npx', ['vite', '--config', 'vite-shot.config.ts', '--port', '5311', '--strictPort', '--host', '127.0.0.1'], { cwd: BASE, env: devEnv(5311) });
} else if (mode === 'dist') {
  run('npx', ['wrangler', 'pages', 'dev', 'dist', '--port', '8791', '--ip', '127.0.0.1', '--inspector-port', '9331'], { cwd: ROOT });
} else if (mode === 'basebuild') {
  unpack();
  run('npm', ['run', 'build'], { cwd: BASE });
} else if (mode === 'basedist') {
  unpack();
  run('npx', ['wrangler', 'pages', 'dev', 'dist', '--port', '8781', '--ip', '127.0.0.1', '--inspector-port', '9341'], { cwd: BASE });
} else {
  console.error('쓰는 법: node .shots-tools/mobile-a-serve.mjs base|dev|basedev|dist|basebuild|basedist');
  process.exit(2);
}
