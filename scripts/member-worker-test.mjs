/**
 * 회원 캘린더 워커 단위 확인 (Supabase 는 안 부른다): node scripts/member-worker-test.mjs
 * worker/memberCal.ts·src/lib/ics.ts 를 esbuild 로 임시 묶어 import 하고, fetch 는 가짜를 넣는다.
 * raceIcs 는 이번 변경 전 본문(git 6989f4d)과 결과가 같은지도 본다.
 */
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), 'member-test-'));
const bundle = async (contents, resolveDir, name) => {
  const out = join(tmp, name);
  await build({ stdin: { contents, resolveDir, loader: 'ts' }, outfile: out, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', logLevel: 'error' });
  return import(pathToFileURL(out).href);
};
const mod = await bundle("export * from './worker/memberCal.ts'; export * from './src/lib/ics.ts';", root, 'member.mjs');
const oldSrc = execFileSync('git', ['show', '6989f4d:src/lib/ics.ts'], { cwd: root, encoding: 'utf8' });
const old = await bundle(oldSrc, join(root, 'src/lib'), 'ics-old.mjs');
rmSync(tmp, { recursive: true, force: true });

let pass = 0;
let failN = 0;
function ok(cond, name, extra = '') {
  if (cond) pass++;
  else failN++;
  console.log(`${cond ? '✔' : '✘'} ${name}${!cond && extra ? ` — ${extra}` : ''}`);
}

const SB = 'https://zhwmfvkwtmakieatlqtz.supabase.co';
const env = {};
const RACE = {
  id: 'tokyo-2027', name_ko: '도쿄 마라톤', name_en: 'Tokyo Marathon', city_ko: '도쿄', country_ko: '일본', country_code: 'JP',
  official_url: 'https://www.marathon.tokyo', race_date: '2027-03-07', entry_opens: '2026-08-15', entry_closes: '2026-08-31',
  sold_out_on: null, entry_confidence: 'confirmed',
};
const OSAKA = { ...RACE, id: 'osaka-2027', name_ko: '오사카 마라톤', name_en: 'Osaka Marathon', race_date: '2027-02-28', entry_opens: null, entry_closes: null };
const page = (id, lang) => `https://marathon82.com${lang === 'en' ? '/en' : ''}/r/${id}`;
const find = async (id) => ({ [RACE.id]: RACE, [OSAKA.id]: OSAKA })[id];
const req = (path, headers = {}) => new Request(`https://marathon82.com${path}`, { headers });
const noStamp = (s) => s.replace(/DTSTAMP:\d{8}T\d{6}Z/g, 'DTSTAMP:X');

/** 가짜 Supabase: 부른 기록을 남기고 handler 결과를 돌려준다 */
function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init = {}) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  fn.calls = calls;
  return fn;
}
const json = (v, status = 200) => new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

/* ── raceIcs 결과가 예전과 같다 ── */
for (const lang of ['ko', 'en'])
  for (const kinds of [['race', 'open', 'close'], ['open']])
    ok(noStamp(mod.raceIcs(RACE, page(RACE.id, lang), kinds, lang)) === noStamp(old.raceIcs(RACE, page(RACE.id, lang), kinds, lang)),
      `raceIcs 결과 그대로 (${lang}, ${kinds.join(',')})`);

/* ── /cal/<id>.ics: 토큰 없음 → 401, Supabase 안 부름 ── */
{
  const f = fakeFetch(() => json({ id: 'u1' }));
  const r = await mod.calRoute(req('/cal/tokyo-2027.ics'), env, 'tokyo-2027', find, page, f);
  const body = await r.text();
  ok(r.status === 401, '토큰 없음 → 401');
  ok(/회원만 받을 수 있어요/.test(body), '401 본문 한국어 안내', body);
  ok(r.headers.get('WWW-Authenticate')?.startsWith('Bearer') && r.headers.get('Cache-Control') === 'private, no-store', '401 헤더 (WWW-Authenticate, no-store)');
  ok(f.calls.length === 0, '토큰 없으면 Supabase 를 부르지 않음');
  const en = await mod.calRoute(req('/cal/tokyo-2027.ics?lang=en'), env, 'tokyo-2027', find, page, f);
  ok(/Calendar files are for members/.test(await en.text()), '?lang=en → 영어 안내');
  const basic = await mod.calRoute(req('/cal/tokyo-2027.ics', { Authorization: 'Basic abc' }), env, 'tokyo-2027', find, page, f);
  ok(basic.status === 401 && f.calls.length === 0, 'Bearer 가 아니면 401');
}
/* ── 거절된 토큰 → 401, 확인 요청 꼴 ── */
{
  const f = fakeFetch(() => json({ msg: 'invalid JWT' }, 401));
  const r = await mod.calRoute(req('/cal/tokyo-2027.ics', { Authorization: 'Bearer bad.token.x' }), env, 'tokyo-2027', find, page, f);
  ok(r.status === 401, 'Supabase 가 거절한 토큰 → 401');
  const c = f.calls[0];
  ok(c?.url === `${SB}/auth/v1/user` && c.init.headers.Authorization === 'Bearer bad.token.x' && c.init.headers.apikey?.startsWith('sb_publishable_'),
    '확인 요청: GET /auth/v1/user + apikey + 사용자 토큰', JSON.stringify(c));
}
/* ── Supabase 장애 → 502 ── */
{
  const f5 = fakeFetch(() => new Response('oops', { status: 503 }));
  ok((await mod.calRoute(req('/cal/tokyo-2027.ics', { Authorization: 'Bearer t' }), env, 'tokyo-2027', find, page, f5)).status === 502, 'Supabase 5xx → 502');
  const fn = fakeFetch(() => Promise.reject(new Error('net')));
  ok((await mod.calRoute(req('/cal/tokyo-2027.ics', { Authorization: 'Bearer t' }), env, 'tokyo-2027', find, page, fn)).status === 502, '네트워크 실패 → 502');
  const fx = fakeFetch(() => json({}));
  ok((await mod.calRoute(req('/cal/tokyo-2027.ics', { Authorization: 'Bearer t' }), env, 'tokyo-2027', find, page, fx)).status === 401, '200 인데 사용자 id 없음 → 401');
}
/* ── 회원 → 200 ── */
{
  const f = fakeFetch(() => json({ id: 'u1', email: 'a@x.com' }));
  const r = await mod.calRoute(req('/cal/tokyo-2027.ics?e=open,close', { Authorization: 'Bearer good' }), env, 'tokyo-2027', find, page, f);
  const body = await r.text();
  ok(r.status === 200 && r.headers.get('Content-Type') === 'text/calendar; charset=utf-8', '회원 → 200 text/calendar');
  ok(r.headers.get('Cache-Control') === 'private, no-store' && r.headers.get('Vary') === 'Authorization', '200 은 private, no-store + Vary: Authorization');
  ok(r.headers.get('Content-Disposition') === 'attachment; filename="tokyo-2027.ics"', 'Content-Disposition attachment');
  ok(noStamp(body) === noStamp(old.raceIcs(RACE, page(RACE.id, 'ko'), ['open', 'close'], 'ko')), '본문 = raceIcs(고른 항목만)');
  const nf = await mod.calRoute(req('/cal/nope-1.ics', { Authorization: 'Bearer good' }), env, 'nope-1', find, page, f);
  ok(nf.status === 404 && /대회를 찾지 못했습니다/.test(await nf.text()), '회원인데 없는 대회 → 404');
}

/* ── /cal/u/<token>.ics ── */
const TOK = 'a'.repeat(64);
const items = async (ids) => ids.flatMap((id) => (id === RACE.id ? [{ race: RACE }] : id === OSAKA.id ? [{ race: OSAKA, cancelled: true }] : []));
{
  const f = fakeFetch(() => json([]));
  for (const bad of ['short', 'A'.repeat(64), 'g'.repeat(64), `${TOK}0`]) {
    const r = await mod.feedRoute(req(`/cal/u/${bad}.ics`), env, bad, items, page, f);
    ok(r.status === 404, `주소 꼴 틀림 → 404 (${bad.slice(0, 8)}…)`);
  }
  ok(f.calls.length === 0, '꼴이 틀리면 Supabase 를 부르지 않음');
}
{
  const f = fakeFetch(() => json([{ race_id: 'tokyo-2027' }, { race_id: 'osaka-2027' }, { race_id: 'gone-1' }]));
  const r = await mod.feedRoute(req(`/cal/u/${TOK}.ics`), env, TOK, items, page, f);
  const body = await r.text();
  const c = f.calls[0];
  ok(c?.url === `${SB}/rest/v1/rpc/calendar_feed` && c.init.method === 'POST' && JSON.parse(c.init.body).p_token === TOK
    && c.init.headers.apikey && !c.init.headers.Authorization, 'RPC calendar_feed 하나만 (POST, apikey 만, 사용자 토큰 없음)', JSON.stringify(c));
  ok(f.calls.length === 1, 'Supabase 호출은 한 번');
  ok(r.status === 200 && r.headers.get('Content-Type') === 'text/calendar; charset=utf-8', '피드 → 200 text/calendar');
  ok(r.headers.get('Cache-Control') === 'private, max-age=900', '피드 캐시 private, max-age=900');
  ok(/X-WR-CALNAME:마라톤 캘린더 — 내 일정/.test(body) && /REFRESH-INTERVAL;VALUE=DURATION:PT6H/.test(body) && /X-PUBLISHED-TTL:PT6H/.test(body),
    '캘린더 이름·REFRESH-INTERVAL·X-PUBLISHED-TTL');
  ok((body.match(/BEGIN:VEVENT/g) ?? []).length === 4, '도쿄 3개(시작·마감·대회) + 취소된 오사카 1개 = 4', String((body.match(/BEGIN:VEVENT/g) ?? []).length));
  ok(/SUMMARY:\(취소\) 오사카 마라톤/.test(body), '취소된 대회는 (취소) 대회 날만');
  ok(body.indexOf('osaka-2027-race') < body.indexOf('tokyo-2027-open'), '대회 날짜 순');
  ok(/UID:tokyo-2027-open-2026-08-15@marathon-calendar/.test(body), 'UID 는 raceIcs 와 같은 규칙');
  ok(body.endsWith('END:VCALENDAR\r\n') && !/[^\r]\n/.test(body), 'CRLF 줄바꿈');
  const en = await (await mod.feedRoute(req(`/cal/u/${TOK}.ics?lang=en`), env, TOK, items, page, f)).text();
  ok(/X-WR-CALNAME:Marathon Calendar — My races/.test(en) && /\(Cancelled\) Osaka Marathon/.test(en) && /\/en\/r\/tokyo-2027/.test(en), '?lang=en → 영어 피드');
}
{
  const empty = await mod.feedRoute(req(`/cal/u/${TOK}.ics`), env, TOK, items, page, fakeFetch(() => json([])));
  const body = await empty.text();
  ok(empty.status === 200 && !/BEGIN:VEVENT/.test(body) && /BEGIN:VCALENDAR/.test(body), '없는 토큰(0행) → 200 빈 캘린더 (토큰 여부를 흘리지 않음)');
  const missing = await mod.feedRoute(req(`/cal/u/${TOK}.ics`), env, TOK, items, page, fakeFetch(() => json({ code: 'PGRST202' }, 404)));
  ok(missing.status === 404, 'RPC 없음(0013 실행 전) → 404');
  const down = await mod.feedRoute(req(`/cal/u/${TOK}.ics`), env, TOK, items, page, fakeFetch(() => new Response('', { status: 500 })));
  ok(down.status === 502, 'Supabase 5xx → 502');
  const dataFail = await mod.feedRoute(req(`/cal/u/${TOK}.ics`), env, TOK, async () => { throw new Error('x'); }, page, fakeFetch(() => json([])));
  ok(dataFail.status === 502, '데이터 파일 못 읽음 → 502');
}

console.log(`\n${pass} 통과, ${failN} 실패`);
process.exit(failN ? 1 : 0);
