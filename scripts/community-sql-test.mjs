/**
 * 커뮤니티 SQL(0014) 로컬 시험 — 실제 DB 는 건드리지 않는다. PGlite(브라우저·노드용 Postgres) 메모리 DB 에서
 * supabase/tests/community_stub.sql(auth·역할·기존 함수 흉내) → supabase/migrations/0014_community.sql 을 적용하고
 * RLS·칸 권한·트리거·한도·관리자 RPC·탈퇴 cascade 를 확인한다.
 *
 *   npm i --no-save --prefix /tmp/community-pglite @electric-sql/pglite   # 한 번 (package.json 은 안 바꾼다)
 *   PGLITE_DIR=/tmp/community-pglite node scripts/community-sql-test.mjs
 *
 * 역할 전환: set role anon|authenticated + request.jwt.claim.sub(= auth.uid()).
 * 한도 시험용 '예전 행'은 superuser 로 session_replication_role = replica(트리거 끔) 상태에서 created_at 을 과거로 넣는다.
 */
import { readFileSync } from 'node:fs';

// 시험 밖에서 오류가 나면 SQL 원문 대신 메시지만
for (const ev of ['uncaughtException', 'unhandledRejection'])
  process.on(ev, (e) => {
    console.error(`중단: ${e?.message ?? e}${e?.where ? `\n  ${e.where}` : ''}`);
    process.exit(1);
  });

const dir = process.env.PGLITE_DIR || '/tmp/community-pglite';
let PGlite;
try {
  ({ PGlite } = await import(`${dir}/node_modules/@electric-sql/pglite/dist/index.js`));
} catch {
  console.error(`PGlite 를 찾지 못했습니다(${dir}). 먼저: npm i --no-save --prefix ${dir} @electric-sql/pglite`);
  process.exit(1);
}
const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');

const db = new PGlite();
for (const [label, file] of [
  ['stub', 'supabase/tests/community_stub.sql'],
  ['0014', 'supabase/migrations/0014_community.sql'],
  ['0014 다시(재실행 안전)', 'supabase/migrations/0014_community.sql'],
]) {
  try {
    await db.exec(read(file));
  } catch (e) {
    console.error(`${label} 적용 실패: ${e.message}${e.where ? `\n  ${e.where}` : ''}`);
    process.exit(1);
  }
}

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra ? ` — ${extra}` : ''}`);
};
const q = async (sql, params) => (await db.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];
/** 오류가 나야 통과. re 가 있으면 메시지도 맞아야 */
async function throws(name, fn, re) {
  try {
    await fn();
    ok(name, false, '오류가 안 났음');
  } catch (e) {
    ok(name, !re || re.test(e.message), e.message);
  }
}

// ── 역할 전환 ───────────────────────────────────────────────────────────────────────
const ANON = { role: 'anon', id: '' };
async function as(who, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${who.id}', false);`);
  if (who.role) await db.exec(`set role ${who.role}`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
}

// ── 바탕 데이터 ─────────────────────────────────────────────────────────────────────
await db.exec(`insert into public.races (id, name_ko) values ('seoul-2027', '서울마라톤'), ('jeju-2027', '제주마라톤');`);
let seq = 0;
async function user(nick, { verified = true, ageMin = 60 * 48, admin = false } = {}) {
  seq++;
  const r = await one(
    `insert into auth.users (email, email_confirmed_at, created_at, raw_user_meta_data)
     values ($1, $2, now() - make_interval(mins => $3), $4) returning id`,
    [`u${seq}@example.com`, verified ? new Date(Date.now() - 86400e3).toISOString() : null, ageMin, JSON.stringify({ nickname: nick, admin })],
  );
  return { role: 'authenticated', id: r.id, nick };
}
const A = await user('달리는A');
const B = await user('러너B');
const C = await user('러너C');
const D = await user('러너D');
const E = await user('러너E');
const G = await user('러너G');
const K = await user('러너K');
const L = await user('러너L');
const U = await user('미인증U', { verified: false });
const N = await user('새내기N', { ageMin: 2 });
const ADM = await user('운영', { admin: true });

const newPost = (who, title, body, extra = {}) =>
  as(who, async () =>
    (
      await one(
        `insert into public.posts (race_id, category, title, body, user_id) values ($1, $2, $3, $4, $5) returning id`,
        [extra.race ?? null, extra.cat ?? 'free', title, body, who.id],
      )
    ).id,
  );
const newComment = (who, post, body, parent = null) =>
  as(who, async () =>
    (await one(`insert into public.comments (post_id, parent_id, body, user_id) values ($1, $2, $3, $4) returning id`, [post, parent, body, who.id])).id,
  );
const report = (who, type, id, reason = 'spam', note = null) =>
  as(who, () => db.query(`insert into public.reports (target_type, target_id, reporter, reason, note) values ($1, $2, $3, $4, $5)`, [type, id, who.id, reason, note]));
/** 트리거 끄고 예전 행 넣기 (superuser) */
async function backfill(sql, params) {
  await db.exec(`reset role; set session_replication_role = replica;`);
  try {
    await db.query(sql, params);
  } finally {
    await db.exec(`set session_replication_role = origin;`);
  }
}
const postRow = (id) => one(`select * from public.posts where id = $1`, [id]);
const detail = (who, id) => as(who, async () => (await one(`select public.community_post($1) as d`, [id])).d);
const list = (who, args = {}) =>
  as(who, () =>
    q(`select * from public.community_list(p_race => $1, p_cat => $2, p_before_at => $3, p_before_id => $4)`, [
      args.race ?? null,
      args.cat ?? null,
      args.at ?? null,
      args.id ?? null,
    ]),
  );

// ── 3. 인증 회원 글쓰기 ─────────────────────────────────────────────────────────────
const P1 = await newPost(A, '동마 같이 뛰실 분', '서울마라톤 같이 준비해요. 주말 장거리 함께 해요.', { race: 'seoul-2027', cat: 'companion' });
ok('인증 회원 글쓰기', !!P1);
{
  const r = await postRow(P1);
  ok('nickname 은 프로필 값', r.nickname === '달리는A');
  ok('새 글 상태 visible·카운터 0', r.status === 'visible' && r.comment_count === 0 && !r.edited);
}

// ── 1. anon ───────────────────────────────────────────────────────────────────────
await throws('anon: posts.body 읽기 금지', () => as(ANON, () => q(`select body from public.posts`)), /permission denied/);
await throws('anon: posts.user_id 읽기 금지', () => as(ANON, () => q(`select user_id from public.posts`)), /permission denied/);
await throws('anon: comments 읽기 금지', () => as(ANON, () => q(`select * from public.comments`)), /permission denied/);
await throws('anon: posts 쓰기 금지', () => as(ANON, () => q(`insert into public.posts (category, title, body, user_id) values ('free','제목','본문',$1)`, [A.id])), /permission denied/);
{
  const rows = await as(ANON, () => q(`select id, title, nickname from public.posts`));
  ok('anon: 공개 칸(제목·닉네임)은 읽힘', rows.length === 1 && rows[0].title === '동마 같이 뛰실 분');
  const l = await list(ANON);
  ok('anon: community_list 동작', l.length === 1 && l[0].title === '동마 같이 뛰실 분' && l[0].state === 'visible');
  ok('community_list 에 body·user_id 칸 없음', !('body' in l[0]) && !('user_id' in l[0]));
  const d = await detail(ANON, P1);
  ok('anon: community_post 잠김', d.locked === true && d.post.body === null && d.comments.length === 0 && d.post.title === '동마 같이 뛰실 분');
}

// ── 2. 미인증 회원 ────────────────────────────────────────────────────────────────────
{
  const d = await detail(U, P1);
  ok('미인증: community_post 잠김', d.locked === true && d.post.body === null);
  await throws('미인증: posts.body 읽기 금지', () => as(U, () => q(`select body from public.posts`)), /permission denied/);
  await throws('미인증: 글쓰기 거절', () => newPost(U, '안녕하세요', '처음 왔어요'), /메일 인증/);
  await throws('미인증: 댓글 거절', () => newComment(U, P1, '저도요'), /메일 인증/);
  await throws('미인증: 좋아요 거절', () => as(U, () => q(`insert into public.post_likes (post_id, user_id) values ($1, $2)`, [P1, U.id])), /메일 인증/);
  await throws('미인증: 신고 거절', () => report(U, 'post', P1), /메일 인증/);
}

// ── 3. 인증 회원 읽기·가입 10분·정지 ─────────────────────────────────────────────────
const C1 = await newComment(B, P1, '저도 같이 가요!');
{
  const d = await detail(B, P1);
  ok('인증 회원: 본문·댓글 받음', d.locked === false && d.post.body?.startsWith('서울마라톤') && d.comments.length === 1 && d.comments[0].body === '저도 같이 가요!');
  ok('댓글 mine 표시', d.comments[0].mine === true && d.post.mine === false);
  const cs = await as(B, () => q(`select body from public.comments`));
  ok('인증 회원: comments 직접 읽기', cs.length === 1);
  const cu = await as(U, () => q(`select id from public.comments`));
  ok('미인증: comments 0행', cu.length === 0);
  ok('댓글 카운터 +1 (authenticated 경로)', (await postRow(P1)).comment_count === 1);
}
await throws('가입 10분 안 거절', () => newPost(N, '새로 왔어요', '안녕하세요 반가워요'), /10분/);
await db.query(`update public.profiles set banned_until = now() + interval '1 day' where id = $1`, [D.id]);
await throws('정지 중 거절', () => newPost(D, '정지 시험', '정지 시험 본문'), /제한되어/);
await db.query(`update public.profiles set banned_until = now() - interval '1 minute' where id = $1`, [D.id]);
ok('정지 끝나면 통과', !!(await newPost(D, '정지 끝', '이제 쓸 수 있어요')));

// ── 4. 한도·내용 검사 ─────────────────────────────────────────────────────────────────
await throws('글 1분 2번째 거절', () => newPost(A, '두 번째 글', '바로 또 써 봐요'), /1분에 1개/);
await backfill(
  `insert into public.posts (category, title, body, user_id, nickname, created_at)
   select 'free', '예전 글 ' || g, '예전 본문 ' || g, $1, '러너E', now() - make_interval(mins => 60 + g) from generate_series(1, 10) g`,
  [E.id],
);
await throws('글 하루 11번째 거절', () => newPost(E, '열한 번째', '열한 번째 본문'), /하루에 10개/);
await throws('같은 본문 반복 거절', () => newPost(E, '다른 제목', '예전 본문 3'), /같은 내용/);
await throws('외부 링크 2개 거절', () => newPost(G, '링크 두 개', '여기 https://a.example.com/x 그리고 https://b.example.org/y'), /1개까지/);
await throws('메신저 링크 거절', () => newPost(G, '오픈채팅', '참여는 t.me/runclub 으로'), /메신저/);
await throws('spam_reason(전화번호) 거절', () => newPost(G, '연락 주세요', '010-1234-5678 로 연락'), /전화번호/);
await as(ADM, () => q(`select public.admin_banned_word_add('바보멍청')`));
await throws('금칙어 거절', () => newPost(G, '금칙어 시험', '이런 바보멍청 같은'), /쓸 수 없는 단어/);
const PG = await newPost(G, '코스 지도', '코스는 https://www.example.com/course 참고, 사이트 https://marathon82.com/r/seoul-2027', { race: 'seoul-2027', cat: 'info' });
ok('외부 링크 1개(+우리 사이트 링크) 통과', !!PG);
await newComment(B, P1, '두 번째 댓글');
await newComment(B, P1, '세 번째 댓글');
await throws('댓글 1분 4번째 거절', () => newComment(B, P1, '네 번째 댓글'), /1분에 3개/);
await backfill(
  `insert into public.comments (post_id, body, user_id, nickname, created_at)
   select $1, '예전 댓글 ' || g, $2, '러너C', now() - make_interval(mins => 120 + g) from generate_series(1, 50) g`,
  [P1, C.id],
);
await throws('댓글 하루 51번째 거절', () => newComment(C, P1, '쉰한 번째'), /하루에 50개/);
ok('남과 같은 댓글은 통과(같은 사람 반복만 막음)', !!(await newComment(D, P1, '저도 같이 가요!')));
await throws('같은 댓글 같은 글 반복 거절', () => newComment(D, P1, '저도 같이 가요!'), /같은 내용/);

// ── 5. 서버 값·수정·삭제 ───────────────────────────────────────────────────────────────
await throws('사용자는 created_at 을 넣을 수 없음', () =>
  as(K, () => q(`insert into public.posts (category, title, body, user_id, created_at) values ('free','과거','과거 글',$1,'2020-01-01')`, [K.id])), /permission denied/);
await throws('사용자는 nickname 을 넣을 수 없음', () =>
  as(K, () => q(`insert into public.posts (category, title, body, user_id, nickname) values ('free','사칭','사칭 글',$1,'운영자')`, [K.id])), /permission denied/);
{
  // 서버 작업(트리거 켠 superuser)으로 넣어도 가드가 시각·닉네임을 정한다
  const r = await one(
    `insert into public.posts (category, title, body, user_id, nickname, created_at) values ('free','서버 경로','서버 경로 본문',$1,'가짜닉','2020-01-01') returning nickname, created_at`,
    [K.id],
  );
  ok('가드: created_at = now(), nickname = 프로필', r.nickname === '러너K' && new Date(r.created_at).getFullYear() > 2020);
}
await as(A, () => q(`update public.posts set body = '서울마라톤 같이 준비해요. 장소는 여의도!' where id = $1`, [P1]));
ok('본문 수정 → edited=true', (await postRow(P1)).edited === true);
await throws('본인도 comment_count 못 바꿈', () => as(A, () => q(`update public.posts set comment_count = 99 where id = $1`, [P1])), /permission denied/);
await throws('본인도 user_id 못 바꿈', () => as(A, () => q(`update public.posts set user_id = $2 where id = $1`, [P1, B.id])), /permission denied/);
{
  const n = await as(B, async () => (await db.query(`update public.posts set title = '남의 글 고치기' where id = $1`, [P1])).affectedRows);
  ok('남의 글 update 0행', n === 0 && (await postRow(P1)).title === '동마 같이 뛰실 분');
}
await as(B, () => q(`insert into public.post_likes (post_id, user_id) values ($1, $2)`, [P1, B.id]));
ok('좋아요 카운터 +1 (authenticated 경로)', (await postRow(P1)).like_count === 1);
ok('liked 표시', (await detail(B, P1)).post.liked === true);
await as(B, () => q(`delete from public.post_likes where post_id = $1 and user_id = $2`, [P1, B.id]));
ok('좋아요 취소 → 0', (await postRow(P1)).like_count === 0);

// ── 6. 대댓글·신고 ───────────────────────────────────────────────────────────────────
const R1 = await newComment(D, P1, '답글입니다', C1);
ok('대댓글 1단계', !!R1);
await throws('대댓글의 대댓글 거절', () => newComment(L, P1, '답글의 답글', R1), /다시 답글/);
const P2 = await newPost(B, '제주 대회 후기 질문', '제주 코스 어떤가요?', { race: 'jeju-2027', cat: 'question' });
await throws('다른 글 댓글을 부모로 거절', () => newComment(L, P2, '엉뚱한 부모', C1), /찾지 못했/);
{
  const before = (await postRow(P1)).comment_count;
  await as(D, () => q(`update public.comments set status = 'deleted' where id = $1`, [R1]));
  const r = await one(`select body, status from public.comments where id = $1`, [R1]);
  ok('댓글 지우기 → 본문 비움·카운터 -1', r.status === 'deleted' && r.body === '' && (await postRow(P1)).comment_count === before - 1);
  const d = await detail(B, P1);
  const dc = d.comments.find((c) => c.id === R1);
  ok('지운 댓글은 자리만(닉네임·본문 null)', dc.state === 'deleted' && dc.body === null && dc.nickname === null);
}
await throws('자기 글 신고 거절', () => report(B, 'post', P2), /내가 쓴 글/);
await report(A, 'post', P2, 'abuse', '욕설이 있어요');
await throws('중복 신고 거절', () => report(A, 'post', P2), /duplicate|unique/);
await report(C, 'post', P2, 'spam');
ok('신고 2건까지는 visible', (await postRow(P2)).status === 'visible');
await report(D, 'post', P2, 'spam');
{
  const r = await postRow(P2);
  ok('신고 3건 → 자동 숨김', r.status === 'hidden' && r.hidden_reason === 'reports' && r.report_count === 3);
  ok('숨김 글은 목록에서 빠짐', !(await list(ANON)).some((x) => x.id === P2));
  ok('숨김 글: 남에게 community_post null', (await detail(A, P2)) === null && (await detail(ANON, P2)) === null);
  const own = await detail(B, P2);
  ok('숨김 글: 작성자에게 state hidden + 제목·본문', own.post.state === 'hidden' && own.post.title === '제주 대회 후기 질문' && own.post.body === '제주 코스 어떤가요?');
  await throws('작성자가 hidden → visible 못 바꿈', () => as(B, () => q(`update public.posts set status = 'visible' where id = $1`, [P2])), /상태는 바꿀 수 없/);
}

// ── 7. 관리자 RPC ─────────────────────────────────────────────────────────────────────
await throws('비관리자: 신고함 거절', () => as(B, () => q(`select public.admin_community_reports()`)), /관리자만/);
await throws('anon: 관리자 RPC 실행 권한 없음', () => as(ANON, () => q(`select public.admin_community_reports()`)), /permission denied/);
await throws('비관리자: 처리 거절', () => as(B, () => q(`select public.admin_community_action('post', $1, 'restore')`, [P2])), /관리자만/);
{
  const rep = (await as(ADM, () => one(`select public.admin_community_reports() as r`))).r;
  const it = rep.find((x) => x.target_id === P2);
  ok('신고함에 대상·사유·메모', !!it && it.count === 3 && it.reasons.spam === 2 && it.reasons.abuse === 1 && it.notes[0] === '욕설이 있어요' && it.user_id === B.id);
  ok('관리자: 숨김 글 본문 보임', (await detail(ADM, P2)).post.body === '제주 코스 어떤가요?');
  await as(ADM, () => q(`select public.admin_community_action('post', $1, 'restore')`, [P2]));
  const r = await postRow(P2);
  const open = await one(`select count(*)::int n from public.reports where target_id = $1 and resolved_at is null`, [P2]);
  ok('restore → visible·신고 처리됨', r.status === 'visible' && r.hidden_reason === null && open.n === 0);
  ok('처리된 신고 대상은 신고함에서 빠짐', !(await as(ADM, () => one(`select public.admin_community_reports() as r`))).r.some((x) => x.target_id === P2));
  await as(ADM, () => q(`select public.admin_community_action('post', $1, 'hide')`, [P2]));
  ok('hide → hidden(admin)', (await postRow(P2)).hidden_reason === 'admin');
  await as(ADM, () => q(`select public.admin_community_action('post', $1, 'temp_hide')`, [P2]));
  const t = await postRow(P2);
  const days = (new Date(t.hidden_until) - Date.now()) / 86400e3;
  ok('temp_hide → 30일', t.status === 'hidden' && t.hidden_reason === 'rights' && days > 29.9 && days < 30.1);
  const li = (await list(ANON)).find((x) => x.id === P2);
  ok('임시조치 글은 목록에 temp_hidden(제목·닉네임 null)', li?.state === 'temp_hidden' && li.title === null && li.nickname === null);
  const da = await detail(ANON, P2);
  ok('임시조치 글 상세: 자리만', da.post.state === 'temp_hidden' && da.post.title === null);
  ok('임시조치는 신고함에 남음', (await as(ADM, () => one(`select public.admin_community_reports() as r`))).r.some((x) => x.target_id === P2 && x.hidden_reason === 'rights'));
  await as(ADM, () => q(`select public.admin_community_action('post', $1, 'dismiss')`, [P2]));
  ok('dismiss → 상태 그대로', (await postRow(P2)).hidden_reason === 'rights');
  await as(ADM, () => q(`select public.admin_community_action('post', $1, 'delete')`, [P2]));
  const del = await postRow(P2);
  ok('delete → deleted, 제목·본문 비움', del.status === 'deleted' && del.title === '' && del.body === '');
  ok('지운 글 상세: deleted 자리', (await detail(ANON, P2)).post.state === 'deleted');
  await throws('지운 글은 restore 불가', () => as(ADM, () => q(`select public.admin_community_action('post', $1, 'restore')`, [P2])), /삭제된 글/);

  const ban = async (d) => {
    await as(ADM, () => q(`select public.admin_ban($1, $2)`, [L.id, d]));
    return (await one(`select banned_until from public.profiles where id = $1`, [L.id])).banned_until;
  };
  const b1 = await ban(1);
  ok('정지 1일', Math.abs(new Date(b1) - Date.now() - 86400e3) < 60e3);
  const b7 = await ban(7);
  ok('정지 7일', Math.abs(new Date(b7) - Date.now() - 7 * 86400e3) < 60e3);
  const bi = await ban(null);
  ok('정지 영구(infinity)', bi === Infinity || String(bi) === 'infinity' || !(new Date(bi).getTime() < 1e15));
  await throws('영구 정지 중 글쓰기 거절', () => newPost(L, '정지 회원', '정지 회원 글'), /제한된 계정/);
  await as(L, () => q(`update public.profiles set banned_until = null where id = $1`, [L.id]));
  const still = (await one(`select banned_until from public.profiles where id = $1`, [L.id])).banned_until;
  ok('본인이 banned_until 을 못 지움', still !== null);
  ok('정지 해제(0)', (await ban(0)) === null);
  const ws = await as(ADM, () => q(`select * from public.admin_banned_words() w`));
  ok('금칙어 목록', ws.length === 1 && Object.values(ws[0])[0] === '바보멍청');
  await as(ADM, () => q(`select public.admin_banned_word_remove('바보멍청')`));
  ok('금칙어 삭제', (await one(`select count(*)::int n from public.banned_words`)).n === 0);
  await throws('banned_words 직접 읽기 금지', () => as(B, () => q(`select * from public.banned_words`)), /permission denied/);
  await throws('reports 직접 읽기 금지', () => as(B, () => q(`select * from public.reports`)), /permission denied/);
}

// 본인 소프트 삭제
{
  const M = await user('러너M');
  const P3 = await newPost(M, '지울 글', '곧 지울 글입니다');
  await as(M, () => q(`update public.posts set status = 'deleted' where id = $1`, [P3]));
  const r = await postRow(P3);
  ok('본인 지우기 → 제목·본문 비움', r.status === 'deleted' && r.title === '' && r.body === '');
  await throws('지운 글 다시 고치기 거절', () => as(M, () => q(`update public.posts set title = '되살리기' where id = $1`, [P3])), /삭제된 글/);
  const mine = await as(M, () => q(`select * from public.community_my_posts()`));
  ok('내 글: 지운 글 state deleted·제목 null', mine.some((x) => x.id === P3 && x.state === 'deleted' && x.title === null));
}

// ── 8. 닉네임 동기화·탈퇴 ─────────────────────────────────────────────────────────────
await as(B, () => q(`update public.profiles set nickname = '바뀐B' where id = $1`, [B.id]));
{
  const c = await one(`select nickname from public.comments where id = $1`, [C1]);
  ok('닉네임 변경 → 댓글 사본 갱신', c.nickname === '바뀐B');
}
// A 가 D 의 글에 댓글·좋아요·신고를 남긴 뒤 탈퇴
const PD = (await one(`select id from public.posts where user_id = $1 and status = 'visible' limit 1`, [D.id])).id;
await newComment(A, PD, 'A 의 댓글');
await as(A, () => q(`insert into public.post_likes (post_id, user_id) values ($1, $2)`, [PD, A.id]));
await report(A, 'post', PD, 'other');
{
  const before = await postRow(PD);
  ok('탈퇴 전 D 글 카운터', before.comment_count === 1 && before.like_count === 1);
  await as(A, () => q(`select public.delete_my_account()`));
  const left = await one(
    `select (select count(*) from public.posts where user_id = $1)::int p, (select count(*) from public.comments where user_id = $1)::int c,
            (select count(*) from public.post_likes where user_id = $1)::int l, (select count(*) from public.reports where reporter = $1)::int r`,
    [A.id],
  );
  ok('탈퇴 → 글·댓글·좋아요·신고 삭제', left.p === 0 && left.c === 0 && left.l === 0 && left.r === 0);
  const after = await postRow(PD);
  ok('탈퇴 → 남의 글 카운터 맞음', after.comment_count === 0 && after.like_count === 0);
  ok('탈퇴 → A 글에 달린 댓글도 삭제', (await one(`select count(*)::int n from public.comments where post_id = $1`, [P1])).n === 0);
}

// ── 9. keyset·필터 ───────────────────────────────────────────────────────────────────
await backfill(
  `insert into public.posts (race_id, category, title, body, user_id, nickname, created_at)
   select 'jeju-2027', 'info', '제주 정보 ' || g, '본문 ' || g, $1, '러너K', now() - make_interval(hours => 3, mins => g) from generate_series(1, 25) g`,
  [K.id],
);
{
  const p1 = await list(ANON, { race: 'jeju-2027' });
  ok('keyset 첫 페이지 20', p1.length === 20 && p1[0].title === '제주 정보 1');
  const last = p1[19];
  const p2 = await list(ANON, { race: 'jeju-2027', at: last.created_at, id: last.id });
  ok('keyset 다음 페이지 5', p2.length === 5 && p2[4].title === '제주 정보 25' && !p2.some((x) => p1.some((y) => y.id === x.id)));
  const info = await list(ANON, { cat: 'info' });
  ok('race·cat 필터', (await list(ANON, { race: 'jeju-2027', cat: 'question' })).length === 0 && info.length === 20 && info.every((x) => x.category === 'info'));
  const seoul = await list(ANON, { race: 'seoul-2027' });
  ok('race 필터는 그 대회 글만', seoul.length > 0 && seoul.every((x) => x.race_id === 'seoul-2027'));
  ok('지운 글은 공개 목록에 없음', !(await list(ANON)).some((x) => x.state === 'deleted'));
}

// ── 트리거 붙었는지 ───────────────────────────────────────────────────────────────────
{
  const t = await q(`select c.relname t from pg_trigger g join pg_class c on c.oid = g.tgrelid where g.tgname = 'zz_force_server_time' order by 1`);
  const names = t.map((x) => x.t);
  ok('zz_force_server_time: posts·comments·post_likes·reports', ['comments', 'post_likes', 'posts', 'reports'].every((x) => names.includes(x)));
}

console.log(`\n${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
