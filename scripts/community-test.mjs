/**
 * 러닝톡 워커 단위 확인 (Supabase 는 안 부른다): node scripts/community-test.mjs
 * worker/community.ts 를 esbuild 로 임시 묶어 import 하고, fetch·Cache API 는 가짜를 넣는다.
 * HTMLRewriter 를 쓰는 페이지 재작성은 Node 에 없어서 scripts/community-pages-check.mjs(wrangler)가 본다 —
 * 여기서는 그 재료(postParts·listParts·ldHtml)를 본다.
 */
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'community-test-'));
const out = join(tmp, 'community.mjs');
await build({
  stdin: {
    contents: "export * from './worker/community.ts'; export * from './src/lib/communityTypes.ts'; export { PUBLIC_SB } from './worker/gaRoute.ts';",
    resolveDir: root,
    loader: 'ts',
  },
  outfile: out,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  target: 'es2022',
  logLevel: 'error',
});
const m = await import(pathToFileURL(out).href);
rmSync(tmp, { recursive: true, force: true });

let pass = 0;
let failN = 0;
function ok(cond, name) {
  if (cond) pass++;
  else failN++;
  console.log(`${cond ? '✔' : '✘'} ${name}`);
}

const SITE = 'https://marathon82.com';
const SAME = { 'Sec-Fetch-Site': 'same-origin', Referer: `${SITE}/` };
const env = { ASSETS: { fetch: async () => new Response('<html></html>') } };
const uuid = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
const row = (i, extra = {}) => ({
  id: uuid(i),
  race_id: i % 2 ? 'seoul-2027' : null,
  category: 'free',
  title: `제목 ${i}`,
  nickname: '러너',
  created_at: `2026-11-09T0${i % 10}:00:00.123456+00:00`,
  comment_count: i,
  like_count: 0,
  edited: false,
  state: 'visible',
  ...extra,
});

/** 가짜 Supabase: 부른 기록을 남기고 rows 를 돌려준다 */
function fakeFetch(rows, status = 200) {
  const calls = [];
  const f = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (rows instanceof Error) throw rows;
    return new Response(JSON.stringify(rows), { status, headers: { 'Content-Type': 'application/json' } });
  };
  f.calls = calls;
  return f;
}
function fakeCache() {
  const map = new Map();
  return {
    map,
    async match(k) {
      const v = map.get(k);
      return v ? new Response(v) : undefined;
    },
    async put(k, res) {
      map.set(k, await res.text());
    },
  };
}
const api = (path, headers = SAME, deps = {}, init = {}) =>
  m.communityApi(new Request(`${SITE}${path}`, { headers, ...init }), env, { cache: null, ...deps });

/* ── 1. 사이트 밖 요청 차단 ─────────────────────────────────── */
{
  const f = fakeFetch([row(1)]);
  for (const [name, h] of [
    ['헤더 없음', {}],
    ['다른 사이트 Referer', { Referer: 'https://evil.example/' }],
    ['Sec-Fetch-Site cross-site', { 'Sec-Fetch-Site': 'cross-site', Referer: `${SITE}/` }],
    ['Sec-Fetch-Site none(주소창 직접)', { 'Sec-Fetch-Site': 'none' }],
  ]) {
    const r = await api('/api/community', h, { fetch: f });
    ok(r.status === 403, `외부 요청 403: ${name}`);
  }
  ok(f.calls.length === 0, '차단한 요청은 Supabase 를 안 부름');
  const old = await api('/api/community', { Referer: `${SITE}/r/x` }, { fetch: fakeFetch([]) });
  ok(old.status === 200, 'Sec-Fetch-Site 없는 옛 브라우저 + 우리 Referer → 200');
}

/* ── 2. 사이트 안 요청 ─────────────────────────────────────── */
{
  const f = fakeFetch([row(1, { body: '비밀 본문', user_id: 'u-1' }), row(2)]);
  const r = await api('/api/community?race=seoul-2027&cat=free', SAME, { fetch: f });
  const j = await r.json();
  ok(r.status === 200 && j.items.length === 2 && j.next === null, '사이트 안 200, 20개 미만이면 next null');
  ok(r.headers.get('Cache-Control') === 'private, max-age=0', '브라우저 캐시 안 함');
  ok(!JSON.stringify(j).includes('비밀 본문') && !('body' in j.items[0]) && !('user_id' in j.items[0]), 'DB 가 잘못 줘도 body·user_id 는 버림');
  const c = f.calls[0];
  ok(c.url === `${m.PUBLIC_SB.url}/rest/v1/rpc/community_list`, 'rpc/community_list 호출');
  ok(c.init.headers.apikey === m.PUBLIC_SB.key && !c.init.headers.Authorization, '공개 키(anon), Authorization 없음');
  ok(c.body.p_race === 'seoul-2027' && c.body.p_cat === 'free' && c.body.p_before_at === null && c.body.p_limit === 20, 'RPC 인자');
  const until = '2026-12-09T01:02:03.123456+00:00';
  const th = await (await api('/api/community', SAME, { fetch: fakeFetch([row(1, { state: 'temp_hidden', title: null, hidden_until: until })]) })).json();
  ok(th.items[0].hidden_until === until && j.items[0].hidden_until === null, '임시조치 기한(hidden_until) 전달, 없으면 null');
}
{
  const rows = Array.from({ length: 20 }, (_, i) => row(i + 1));
  const f = fakeFetch(rows);
  const j = await (await api('/api/community', SAME, { fetch: f })).json();
  ok(j.next === m.encodeCursor(rows[19]), '20개면 next = 마지막 행 커서');
  const d = m.decodeCursor(j.next);
  ok(d && d.at === rows[19].created_at && d.id === rows[19].id, '커서 왕복');
  const f2 = fakeFetch([]);
  await api(`/api/community?before=${encodeURIComponent(j.next)}`, SAME, { fetch: f2 });
  ok(f2.calls[0].body.p_before_at === rows[19].created_at && f2.calls[0].body.p_before_id === rows[19].id, 'before → p_before_at·p_before_id');
}
{
  const envLocal = { ...env, COMMUNITY_SUPABASE_URL: 'http://127.0.0.1:9999/' };
  const f = fakeFetch([]);
  await m.communityApi(new Request(`${SITE}/api/community`, { headers: SAME }), envLocal, { fetch: f, cache: null });
  ok(f.calls[0].url === 'http://127.0.0.1:9999/rest/v1/rpc/community_list', 'COMMUNITY_SUPABASE_URL 이 있으면 그 주소');
}

/* ── 3. 잘못된 파라미터·방법 ───────────────────────────────── */
{
  const f = fakeFetch([]);
  for (const q of ['?cat=ad', '?race=Seoul_2027', '?race=a', `?race=${'x'.repeat(41)}`, '?before=abc', '?before=2026-11-09_not-uuid', `?before=yesterday_${uuid(1)}`]) {
    const r = await api(`/api/community${q}`, SAME, { fetch: f });
    ok(r.status === 400, `400: ${q.slice(0, 40)}`);
  }
  ok(f.calls.length === 0, '잘못된 요청은 Supabase 를 안 부름');
  const r = await api('/api/community', SAME, { fetch: f }, { method: 'POST', body: '{}' });
  ok(r.status === 405, 'POST → 405');
  const e = await api('/api/community?race=&cat=', SAME, { fetch: fakeFetch([]) });
  ok(e.status === 200, '빈 파라미터는 없는 것으로');
}

/* ── 4. 캐시: 첫 페이지만 ─────────────────────────────────── */
{
  const cache = fakeCache();
  const f = fakeFetch([row(1)]);
  await api('/api/community?cat=info&race=seoul-2027', SAME, { fetch: f, cache });
  await api('/api/community?race=seoul-2027&cat=info&x=1', SAME, { fetch: f, cache });
  ok(f.calls.length === 1 && cache.map.size === 1, '첫 페이지 캐시 put, 같은 조건(순서·다른 파라미터 무관)은 캐시에서');
  ok([...cache.map.keys()][0] === `${SITE}/api/community?race=seoul-2027&cat=info`, '캐시 키 정규화');
  await api('/api/community?cat=info', SAME, { fetch: f, cache });
  ok(f.calls.length === 2 && cache.map.size === 2, '조건이 다르면 따로');
  await api(`/api/community?before=${encodeURIComponent(m.encodeCursor(row(1)))}`, SAME, { fetch: f, cache });
  ok(f.calls.length === 3 && cache.map.size === 2, '다음 페이지(before)는 캐시 안 함');
  const r = await api('/api/community?cat=info', { Referer: 'https://evil.example/' }, { fetch: f, cache });
  ok(r.status === 403, '캐시에 있어도 외부 요청은 403');
  const bad = fakeCache();
  await api('/api/community', SAME, { fetch: fakeFetch([], 500), cache: bad });
  ok(bad.map.size === 0, '실패 응답은 캐시 안 함');
}

/* ── 5. Supabase 실패 ──────────────────────────────────────── */
for (const [name, f] of [
  ['5xx', fakeFetch([], 503)],
  ['404(마이그레이션 전)', fakeFetch({ message: 'not found' }, 404)],
  ['네트워크', fakeFetch(new Error('down'))],
  ['배열 아님', fakeFetch({ rows: [] })],
]) {
  const r = await api('/api/community', SAME, { fetch: f });
  const j = await r.json();
  ok(r.status === 502 && j.error === 'unavailable' && r.headers.get('Cache-Control') === 'private, no-store', `Supabase ${name} → 502`);
}

/* ── 6. 프리렌더 재료 ──────────────────────────────────────── */
{
  const detail = {
    post: {
      ...row(7),
      race_id: 'seoul-2027',
      category: 'companion',
      title: '<script>alert(1)</script> 동마 같이',
      nickname: '러너"B',
      updated_at: '2026-11-09T08:00:00+00:00',
      body: '비밀 본문 SECRET',
      mine: false,
      liked: false,
    },
    locked: false,
    comments: [{ id: uuid(9), parent_id: null, nickname: 'x', body: '비밀 댓글', created_at: '2026-11-09T09:00:00+00:00', edited: false, state: 'visible', mine: false }],
  };
  const p = m.postParts(detail, '서울마라톤', 'ko');
  const ld = m.ldHtml(p.lds);
  const all = p.title + p.desc + p.root + ld;
  ok(!all.includes('SECRET') && !all.includes('비밀 댓글'), '프리렌더에 본문·댓글 없음');
  ok(p.root.includes('&lt;script&gt;') && !p.root.includes('<script>alert'), '본문 영역 제목 이스케이프');
  ok(!ld.includes('<script>alert') && ld.includes('\\u003cscript'), '구조화 데이터 안 </script> 탈출 막음');
  const posting = p.lds[0];
  ok(posting['@type'] === 'DiscussionForumPosting' && posting.isAccessibleForFree === false, 'DiscussionForumPosting, isAccessibleForFree=false');
  ok(posting.hasPart?.cssSelector === `.${m.MEMBERS_ONLY_CLASS}` && posting.hasPart.isAccessibleForFree === false, 'hasPart cssSelector = 회원 전용 영역');
  ok(p.root.includes(`class="${m.MEMBERS_ONLY_CLASS}"`), '본문 자리에 회원 전용 클래스');
  ok(posting.author.name === '러너"B' && posting.about?.name === '서울마라톤' && posting.commentCount === 7, '작성자·대회·댓글 수');
  ok(p.canonical === `${SITE}/community/${uuid(7)}` && p.desc.length <= 160, 'canonical·설명 길이');
  ok(p.desc.includes('동행/크루') && p.desc.includes('서울마라톤') && p.desc.includes('2026년 11월 9일'), '설명: 카테고리·대회·작성일');
  const en = m.postParts(detail, 'Seoul Marathon', 'en');
  ok(en.canonical === p.canonical && en.title.includes('Run Talk') && en.root.includes('href="/en/community"'), '영어: canonical 은 한국어 주소, 경로는 /en');
  ok(p.lds[1]['@type'] === 'BreadcrumbList', 'BreadcrumbList');

  const lp = m.listParts(
    [row(1), row(2, { state: 'temp_hidden', title: null, nickname: null }), row(3, { title: '<b>굵게</b>' })],
    new Map([['seoul-2027', '서울마라톤']]),
    'ko',
  );
  ok(lp.root.includes(`/community/${uuid(1)}`) && !lp.root.includes(uuid(2)), '목록 프리렌더: 임시조치 글은 뺌');
  ok(lp.root.includes('&lt;b&gt;굵게') && lp.root.includes('서울마라톤'), '목록 프리렌더: 이스케이프·대회 이름');
  ok(lp.canonical === `${SITE}/community` && m.listParts([], new Map(), 'en').canonical === `${SITE}/en/community`, '목록 canonical');
}

/* ── 7. 커서 함수 ──────────────────────────────────────────── */
ok(m.decodeCursor(m.encodeCursor({ created_at: '2026-11-09T01:02:03Z', id: uuid(1) }))?.id === uuid(1), '커서: Z 시각');
ok(m.decodeCursor('2026-11-09T01:02:03+09:00_' + uuid(1)) !== null, '커서: +09:00');
ok(m.decodeCursor('_' + uuid(1)) === null && m.decodeCursor(uuid(1)) === null && m.decodeCursor('2026-13-45T99:99:99Z_' + uuid(1)) === null, '커서: 잘못된 값 거절');

console.log(`\n${pass} 통과, ${failN} 실패`);
process.exit(failN ? 1 : 0);
