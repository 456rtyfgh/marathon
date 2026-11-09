/**
 * /api/admin/ga 통합 확인 (빌드한 dist 로 wrangler pages dev): node scripts/ga-pages-check.mjs
 * 먼저 npm run build. 구글은 안 부른다 — GA_SERVICE_ACCOUNT 를 안 넣어 '설정 안 됨' 응답까지 본다.
 * 관리자 확인(Supabase rpc/is_admin)은 127.0.0.1 에 띄운 가짜 Supabase 로 흉내:
 *   Bearer admin-test → true, 그 밖 → false.
 * 끝나면(실패해도) 가짜 서버·wrangler 를 모두 끈다.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const root = new URL('../', import.meta.url).pathname;
const PORT = Number(process.env.GA_CHECK_PORT || 8788);
const BASE = `http://127.0.0.1:${PORT}`;
if (!existsSync(new URL('dist/_worker.js', `file://${root}`))) {
  console.error('dist/_worker.js 가 없습니다. 먼저 npm run build');
  process.exit(1);
}

let pass = 0;
let failN = 0;
function ok(cond, name, extra = '') {
  if (cond) pass++;
  else failN++;
  console.log(`${cond ? '✔' : '✘'} ${name}${!cond && extra ? `  (${extra})` : ''}`);
}

// 가짜 Supabase
const seen = [];
const sb = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    seen.push({ method: req.method, url: req.url, apikey: req.headers.apikey, auth: req.headers.authorization, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST' && req.url === '/rest/v1/rpc/is_admin') res.end(req.headers.authorization === 'Bearer admin-test' ? 'true' : 'false');
    else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
});
await new Promise((r) => sb.listen(0, '127.0.0.1', r));
const sbPort = sb.address().port;

const wr = spawn(
  'npx',
  ['wrangler', 'pages', 'dev', 'dist', '--port', String(PORT), '--ip', '127.0.0.1',
    '--binding', `SUPABASE_URL=http://127.0.0.1:${sbPort}`, '--binding', 'SUPABASE_ANON_KEY=test-anon'],
  { cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GA_SERVICE_ACCOUNT: '' } },
);
let wrLog = '';
wr.stdout.on('data', (d) => (wrLog += d));
wr.stderr.on('data', (d) => (wrLog += d));

function stop() {
  try {
    process.kill(-wr.pid, 'SIGTERM'); // 묶음째 (workerd 자식까지)
  } catch {
    /* 이미 꺼짐 */
  }
  sb.close();
}
process.on('SIGINT', () => {
  stop();
  process.exit(130);
});

try {
  // 뜰 때까지 기다리기 (최대 60초)
  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    up = await fetch(`${BASE}/`).then((r) => r.ok, () => false);
  }
  if (!up) throw new Error(`wrangler pages dev 가 안 떴습니다:\n${wrLog.slice(-2000)}`);

  const api = async (q, auth) => {
    const r = await fetch(`${BASE}/api/admin/ga${q}`, auth ? { headers: { Authorization: auth } } : {});
    const text = await r.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* JSON 아님 */
    }
    return { status: r.status, cc: r.headers.get('Cache-Control'), ct: r.headers.get('Content-Type') ?? '', json, text };
  };

  let r = await api('?range=7d');
  ok(r.status === 403 && r.json?.error === 'forbidden' && r.json?.message === '관리자만 볼 수 있습니다.', '토큰 없음 → 403 (한국어 메시지)', `${r.status} ${r.text}`);
  ok(r.cc === 'private, no-store' && r.ct.startsWith('application/json'), '403: Cache-Control private, no-store · JSON', `${r.cc} ${r.ct}`);
  const before = seen.length;
  ok(before === 0, '토큰 없으면 Supabase 도 안 부름', String(before));

  r = await api('?range=7d', 'Bearer user-test');
  ok(r.status === 403, '관리자 아님(is_admin false) → 403', `${r.status} ${r.text}`);

  r = await api('?range=7d', 'Bearer admin-test');
  ok(r.status === 200 && r.text === '{"configured":false}', '관리자 + 키 없음 → 200 {configured:false}', `${r.status} ${r.text}`);
  ok(r.cc === 'private, no-store', '200: Cache-Control private, no-store', String(r.cc));
  const last = seen.at(-1);
  ok(last?.method === 'POST' && last.url === '/rest/v1/rpc/is_admin' && last.apikey === 'test-anon' && last.auth === 'Bearer admin-test' && last.body === '{}',
    'is_admin: POST, apikey + 사용자 토큰, 본문 {}', JSON.stringify(last));

  for (const q of ['?range=28d', '?range=90d', '?realtime=1']) {
    r = await api(q, 'Bearer admin-test');
    ok(r.status === 200 && r.json?.configured === false, `관리자 ${q} → {configured:false}`, `${r.status} ${r.text}`);
  }
  r = await api('?range=1y', 'Bearer admin-test');
  ok(r.status === 400 && r.json?.error === 'bad_range', '범위 틀림 → 400', `${r.status} ${r.text}`);

  const other = await fetch(`${BASE}/api/nothing`);
  ok(other.status === 404 && (other.headers.get('Content-Type') ?? '').startsWith('application/json'), '그 밖 /api/* → 404 JSON', String(other.status));
  const post = await fetch(`${BASE}/api/admin/ga?range=7d`, { method: 'POST', headers: { Authorization: 'Bearer admin-test' } });
  ok(post.status === 405, 'POST → 405', String(post.status));

  // 기존 경로는 그대로
  const race = JSON.parse(readFileSync(new URL('public/data.json', `file://${root}`), 'utf8')).races[0];
  const page = await fetch(`${BASE}/r/${race.id}`);
  ok(page.status === 200 && (await page.text()).includes('<html'), `기존 /r/${race.id} → 200 HTML`, String(page.status));
  const csp = page.headers.get('Content-Security-Policy') ?? '';
  ok(csp.includes("connect-src 'self' https://zhwmfvkwtmakieatlqtz.supabase.co"), 'CSP 그대로', csp.slice(0, 120));
  const dj = await fetch(`${BASE}/data.json`);
  ok(dj.status === 404, '기존 /data.json → 404', String(dj.status));
  const home = await fetch(`${BASE}/`);
  ok(home.status === 200, '첫 화면 → 200', String(home.status));
} catch (e) {
  failN++;
  console.log(`✘ ${e instanceof Error ? e.message : e}`);
} finally {
  stop();
}

console.log(`\n${pass} 통과, ${failN} 실패`);
process.exit(failN ? 1 : 0);
