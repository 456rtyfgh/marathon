/**
 * 러닝톡 통합 확인 (빌드한 dist 로 wrangler pages dev): node scripts/community-pages-check.mjs
 * 먼저 npm run build. 진짜 Supabase 는 안 부른다 — 127.0.0.1 에 띄운 가짜 Supabase(rpc/community_list·community_post)를
 * --binding COMMUNITY_SUPABASE_URL 로 넣는다.
 * 끝나면(실패해도) 가짜 서버·wrangler 를 모두 끈다.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';

const root = new URL('../', import.meta.url).pathname;
const PORT = Number(process.env.COMMUNITY_CHECK_PORT || 8789);
const BASE = `http://127.0.0.1:${PORT}`;
if (!existsSync(new URL('dist/_worker.js', `file://${root}`))) {
  console.error('dist/_worker.js 가 없습니다. 먼저 npm run build');
  process.exit(1);
}
const routes = JSON.parse(readFileSync(new URL('dist/_routes.json', `file://${root}`), 'utf8'));

let pass = 0;
let failN = 0;
function ok(cond, name, extra = '') {
  if (cond) pass++;
  else failN++;
  console.log(`${cond ? '✔' : '✘'} ${name}${!cond && extra ? `  (${extra})` : ''}`);
}

const race = JSON.parse(readFileSync(new URL('public/data.json', `file://${root}`), 'utf8')).races[0];
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const VIS = id(1);
const DEL = id(2);
const NONE = id(3);
const ERR = id(4);
const item = {
  id: VIS,
  race_id: race.id,
  category: 'question',
  title: '코스 고저차 어떤가요?',
  nickname: '달리는러너',
  created_at: '2026-11-09T03:00:00.123456+00:00',
  comment_count: 4,
  like_count: 2,
  edited: false,
  state: 'visible',
};

// 가짜 Supabase
const seen = [];
const sb = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    seen.push({ url: req.url, apikey: req.headers.apikey, auth: req.headers.authorization, body });
    res.setHeader('Content-Type', 'application/json');
    const args = body ? JSON.parse(body) : {};
    if (req.method === 'POST' && req.url === '/rest/v1/rpc/community_list') return res.end(JSON.stringify([item]));
    if (req.method === 'POST' && req.url === '/rest/v1/rpc/community_post') {
      if (args.p_id === VIS)
        return res.end(JSON.stringify({ post: { ...item, updated_at: item.created_at, body: '비밀 본문 SECRET', mine: false, liked: false }, locked: true, comments: [] }));
      if (args.p_id === DEL)
        return res.end(JSON.stringify({ post: { ...item, id: DEL, title: null, nickname: null, state: 'deleted', updated_at: item.created_at, body: null, mine: false, liked: false }, locked: true, comments: [] }));
      if (args.p_id === ERR) {
        res.statusCode = 503;
        return res.end('{}');
      }
      return res.end('null');
    }
    res.statusCode = 404;
    res.end('{}');
  });
});
await new Promise((r) => sb.listen(0, '127.0.0.1', r));
const sbPort = sb.address().port;

const wr = spawn('npx', ['wrangler', 'pages', 'dev', 'dist', '--port', String(PORT), '--ip', '127.0.0.1', '--binding', `COMMUNITY_SUPABASE_URL=http://127.0.0.1:${sbPort}`], {
  cwd: root,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, GA_SERVICE_ACCOUNT: '' },
});
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

const SAME = { 'Sec-Fetch-Site': 'same-origin', Referer: `${BASE}/` };
const get = async (path, headers = {}) => {
  const r = await fetch(`${BASE}${path}`, { headers, redirect: 'manual' });
  return { status: r.status, h: r.headers, text: await r.text() };
};
const ldOf = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((x) => JSON.parse(x[1]));

try {
  ok(['/community', '/community/*', '/en/community', '/en/community/*'].every((p) => routes.include.includes(p)), '_routes.json 에 러닝톡 경로', JSON.stringify(routes.include));

  let up = false;
  for (let i = 0; i < 120 && !up; i++) {
    await new Promise((r) => setTimeout(r, 500));
    up = await fetch(`${BASE}/`).then((r) => r.ok, () => false);
  }
  if (!up) throw new Error(`wrangler pages dev 가 안 떴습니다:\n${wrLog.slice(-2000)}`);

  // ── /api/community ──
  let r = await get('/api/community');
  ok(r.status === 403, '/api/community 외부(헤더 없음) → 403', `${r.status} ${r.text.slice(0, 80)}`);
  r = await get('/api/community', { Referer: 'https://evil.example/' });
  ok(r.status === 403, '/api/community 다른 사이트 Referer → 403', String(r.status));
  ok(!seen.some((s) => s.url.includes('community_list')), '차단한 요청은 Supabase 를 안 부름');
  r = await get('/api/community?race=' + race.id, SAME);
  let j = null;
  try {
    j = JSON.parse(r.text);
  } catch {
    /* JSON 아님 */
  }
  ok(r.status === 200 && j?.items?.[0]?.title === item.title && j.next === null, '/api/community 사이트 안 → 200 목록', `${r.status} ${r.text.slice(0, 120)}`);
  ok(r.h.get('Cache-Control') === 'private, max-age=0' && (r.h.get('Content-Type') ?? '').startsWith('application/json'), '200: JSON, 브라우저 캐시 안 함', String(r.h.get('Cache-Control')));
  const call = seen.find((s) => s.url === '/rest/v1/rpc/community_list');
  ok(call && !call.auth && JSON.parse(call.body).p_race === race.id, 'Supabase 는 anon(Authorization 없음)으로 community_list', JSON.stringify(call));
  r = await get('/api/community?cat=ads', SAME);
  ok(r.status === 400, '/api/community 잘못된 cat → 400', String(r.status));

  // ── 글 페이지 ──
  r = await get(`/community/${VIS}`);
  ok(r.status === 200 && r.text.includes('<html'), `/community/<보이는 글> → 200 HTML`, String(r.status));
  ok(r.text.includes(`<title>${item.title} — 러닝톡 | 마라톤 캘린더</title>`), '제목 태그', r.text.match(/<title>[^<]*<\/title>/)?.[0]);
  ok(!r.text.includes('SECRET') && !r.text.includes('비밀 본문'), '프리렌더에 본문 없음');
  ok(r.text.includes('class="community-members-only"') && !r.text.includes('noindex'), '회원 전용 영역, noindex 아님');
  ok(r.text.includes(`<link rel="canonical" href="https://marathon82.com/community/${VIS}"`), 'canonical = 한국어 글 주소');
  const lds = ldOf(r.text);
  const posting = lds.find((x) => x['@type'] === 'DiscussionForumPosting');
  ok(posting?.isAccessibleForFree === false && posting.hasPart?.cssSelector === '.community-members-only', 'DiscussionForumPosting: isAccessibleForFree=false, hasPart cssSelector', JSON.stringify(posting)?.slice(0, 200));
  ok(posting?.about?.name === race.name_ko, '구조화 데이터에 대회 이름', posting?.about?.name);
  ok(!lds.some((x) => x['@type'] === 'ItemList'), '홈 ItemList 는 뺌');
  ok(r.h.get('Cache-Control') === 'public, max-age=60' && (r.h.get('Content-Security-Policy') ?? '').includes("default-src 'self'"), '캐시 60초 · 보안 헤더', String(r.h.get('Cache-Control')));
  r = await get(`/en/community/${VIS}`);
  ok(r.status === 200 && r.text.includes('Run Talk') && r.text.includes(`href="https://marathon82.com/community/${VIS}"`) && r.text.includes('lang="en"'), '/en/community/<글> → 영어 화면, canonical 은 한국어 주소');

  for (const [name, p] of [
    ['지운 글', `/community/${DEL}`],
    ['없는 글', `/community/${NONE}`],
    ['uuid 아님', '/community/hello'],
  ]) {
    r = await get(p);
    ok(r.status === 404 && r.text.includes('<meta name="robots" content="noindex">'), `${name} → 404 + noindex`, String(r.status));
  }
  r = await get(`/community/${ERR}`);
  ok(r.status === 200 && !r.text.includes('noindex'), 'Supabase 실패 → 기본 페이지 200 (없는 글로 단정 안 함)', String(r.status));

  // ── 목록 페이지 ──
  r = await get('/community');
  ok(r.status === 200 && r.text.includes('<title>러닝톡 — 마라톤 대회 질문·동행·정보 | 마라톤 캘린더</title>'), '/community → 200 러닝톡 제목', String(r.status));
  ok(r.text.includes(`href="/community/${VIS}"`) && r.text.includes(item.title), '/community 에 글 제목 링크');
  r = await get('/en/community');
  ok(r.status === 200 && r.text.includes(`href="/en/community/${VIS}"`), '/en/community → 영어 목록');
  r = await get('/community/');
  ok(r.status === 301 && r.h.get('Location')?.endsWith('/community'), '/community/ → 301 /community', `${r.status} ${r.h.get('Location')}`);

  // ── 기존 경로는 그대로 ──
  r = await get('/api/nothing');
  ok(r.status === 404, '그 밖 /api/* → 여전히 404', String(r.status));
  r = await get('/api/admin/ga?range=7d');
  ok(r.status === 403, '/api/admin/ga 토큰 없음 → 여전히 403', String(r.status));
  r = await get(`/r/${race.id}`);
  ok(r.status === 200 && r.text.includes(race.name_ko), `기존 /r/${race.id} → 200`, String(r.status));
  r = await get('/');
  ok(r.status === 200, '첫 화면 → 200', String(r.status));
} catch (e) {
  failN++;
  console.log(`✘ ${e instanceof Error ? e.message : e}`);
} finally {
  stop();
}

console.log(`\n${pass} 통과, ${failN} 실패`);
process.exit(failN ? 1 : 0);
