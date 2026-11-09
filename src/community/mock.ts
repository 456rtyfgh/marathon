/**
 * 개발 서버 전용 러닝톡 가짜 데이터 (?cmock=guest|unverified|member|admin). api.ts 가 import.meta.env.DEV 안에서만 불러온다.
 * 서버 규칙을 흉내 낸다: 비회원·미인증은 본문·댓글 잠김(locked), 목록엔 visible·temp_hidden 만, 숨긴 글은 작성자·관리자만.
 * 화면에서 쓰고 지운 것은 이 탭이 열려 있는 동안만 남는다(새로고침하면 처음으로).
 */
import {
  LIMITS,
  decodeCursor,
  encodeCursor,
  type Category,
  type CommentItem,
  type PostDetail,
  type PostListItem,
  type PostListResponse,
  type PostState,
  type ReportReason,
  type Viewer,
} from '../lib/communityTypes';
import type { AdminAction, AdminReportRow, ListQuery, PostInput } from './api';

const wait = (ms = 250) => new Promise((r) => setTimeout(r, ms));
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
let seq = 1000;
const nextId = () => uuid(++seq);

interface MPost {
  id: string;
  race_id: string | null;
  category: Category;
  title: string;
  body: string;
  nickname: string;
  mine: boolean;
  user_id: string;
  created_at: string;
  updated_at: string;
  edited: boolean;
  state: PostState;
  liked: boolean;
  like_count: number;
}
interface MComment {
  id: string;
  post_id: string;
  parent_id: string | null;
  body: string;
  nickname: string;
  mine: boolean;
  created_at: string;
  edited: boolean;
  state: PostState;
}

const NICKS = ['러닝판다', '새벽러너', '춘마완주', '페이스메이커', 'sub4가자', '한강러너', '트레일냥', '마라톤초보'];
const SAMPLES: [Category, string, string][] = [
  ['question', '춘천마라톤 짐 보관 어디에 하나요?', '처음 나가는데 출발 전에 짐을 어디에 맡기는지 궁금해요. 탈의실도 있나요?'],
  ['companion', '토요일 아침 여의도 LSD 같이 하실 분', '6:30 여의나루역 2번 출구에서 출발합니다. 6분 30초 페이스로 20km 생각하고 있어요.'],
  ['info', '올해 JTBC 마라톤 배번 수령 시간 바뀌었어요', '공식 안내 메일 보니 토요일 오후 6시까지로 줄었습니다. 미리 챙기세요.'],
  ['free', '첫 풀코스 완주했습니다', '4시간 52분… 30km 이후로는 걷다 뛰다 했지만 완주 메달 받으니 눈물 나네요.'],
  ['question', '보스턴 BQ 기록 인정 기간 아시는 분?', '내년 대회 신청하려는데 어느 대회 기록부터 인정되는지 헷갈려서요.'],
  ['companion', '도쿄마라톤 같이 가실 분 숙소 쉐어 구해요', '신주쿠 근처로 2박 생각 중입니다. 여자 러너분이면 좋겠어요.'],
  ['info', '대회 당일 지하철 첫차 시간 정리', '서울 주요 대회 출발지 기준으로 첫차 시간을 정리해 봤어요. 참고하세요.'],
  ['free', '러닝화 400km 넘으면 바꾸시나요?', '쿠션이 확실히 줄어든 느낌인데 다들 언제 바꾸시는지 궁금합니다.'],
  ['question', '하프 2시간 벽 깨려면 주 몇 회 뛰어야 할까요', '지금 주 3회 25km 정도 뛰고 있습니다.'],
  ['companion', '경주 벚꽃마라톤 카풀 구해요 (대전 출발)', '토요일 새벽 4시 출발 예정, 2자리 남았어요.'],
];
const RACES = ['changwon-tongil-marathon', 'geumsan-jeokbyeokgang-marathon', 'queenstown-marathon', null, null];

const posts: MPost[] = [];
const comments: MComment[] = [];
const reported = new Set<string>();
let words = ['카지노사이트', '먹튀검증', '대출문의'];
const bans = new Map<string, string | null>();

function seed() {
  const now = Date.now();
  for (let i = 0; i < 26; i++) {
    const [category, title, body] = SAMPLES[i % SAMPLES.length];
    const at = new Date(now - (i * 3 + 1) * 3600e3 - i * 137e3).toISOString();
    const mine = i === 2 || i === 7;
    posts.push({
      id: uuid(i + 1),
      race_id: RACES[i % RACES.length],
      category,
      title: i < SAMPLES.length ? title : `${title} (${Math.floor(i / SAMPLES.length) + 1})`,
      body,
      nickname: mine ? '달리는곰' : NICKS[i % NICKS.length],
      mine,
      user_id: mine ? 'mock-me' : uuid(500 + (i % NICKS.length)),
      created_at: at,
      updated_at: at,
      edited: i === 3,
      state: i === 5 ? 'temp_hidden' : i === 9 ? 'deleted' : i === 7 ? 'hidden' : 'visible',
      liked: i === 0,
      like_count: (i * 7) % 13 + (i === 0 ? 3 : 0),
    });
  }
  // 첫 글에 댓글·대댓글·지운 댓글
  const p = posts[0].id;
  const c = (parent: string | null, body: string, nick: string, mine = false, state: PostState = 'visible', mins = 60): MComment => {
    const x: MComment = { id: nextId(), post_id: p, parent_id: parent, body, nickname: nick, mine, created_at: new Date(now - mins * 60e3).toISOString(), edited: false, state };
    comments.push(x);
    return x;
  };
  const a = c(null, '출발 지점 옆 운동장에 짐 보관 트럭이 배번 끝자리별로 서 있어요.', '춘마완주', false, 'visible', 50);
  c(a.id, '감사합니다! 탈의실은 따로 없나요?', '달리는곰', true, 'visible', 40);
  c(a.id, '천막 탈의실이 있긴 한데 붐벼서 미리 입고 가시는 걸 추천해요.', '춘마완주', false, 'visible', 35);
  c(null, '', '', false, 'deleted', 30);
  c(null, '작년엔 9시 전에 맡겨야 했어요. 올해도 비슷할 거예요.', '새벽러너', false, 'visible', 10);
}
seed();

/* ── 변환 ─────────────────────────────────────────────────── */

const commentCount = (id: string) => comments.filter((c) => c.post_id === id && c.state === 'visible').length;

function item(p: MPost, v: Viewer): PostListItem {
  const show = p.state === 'visible' || (p.state === 'hidden' && (p.mine || v === 'admin'));
  return {
    id: p.id,
    race_id: p.race_id,
    category: p.category,
    title: show ? p.title : null,
    nickname: show ? p.nickname : null,
    created_at: p.created_at,
    comment_count: commentCount(p.id),
    like_count: p.like_count,
    edited: p.edited,
    state: p.state,
    // 서버처럼 임시조치 기한(작성 30일 뒤로 흉내)
    hidden_until: p.state === 'temp_hidden' ? new Date(Date.parse(p.created_at) + 30 * 864e5).toISOString() : null,
  };
}

/** 대회 탭을 열면 그 대회 글이 없을 때 3개를 만든다 (어느 대회든 이야기 탭이 비어 보이지 않게) */
function ensureRace(race: string) {
  if (posts.some((p) => p.race_id === race)) return;
  const now = Date.now();
  for (let i = 0; i < 3; i++) {
    const [category, title, body] = SAMPLES[(i * 3 + 1) % SAMPLES.length];
    const at = new Date(now - (i + 1) * 5 * 3600e3).toISOString();
    posts.push({ id: nextId(), race_id: race, category, title, body, nickname: NICKS[(i + 3) % NICKS.length], mine: false, user_id: uuid(600 + i), created_at: at, updated_at: at, edited: false, state: 'visible', liked: false, like_count: i });
  }
}

const sorted = (list: MPost[]) => [...list].sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.id < b.id ? 1 : -1));

function paginate(list: MPost[], before: string | null | undefined, v: Viewer): PostListResponse {
  const c = before ? decodeCursor(before) : null;
  const rows = sorted(list).filter((p) => !c || p.created_at < c.at || (p.created_at === c.at && p.id < c.id));
  const items = rows.slice(0, LIMITS.page).map((p) => item(p, v));
  return { items, next: items.length === LIMITS.page && rows.length > LIMITS.page ? encodeCursor(items[items.length - 1]) : null };
}

/* ── 읽기 ─────────────────────────────────────────────────── */

export async function mockList(q: ListQuery): Promise<PostListResponse> {
  await wait();
  if (new URLSearchParams(location.search).get('cfail')) throw new Error('mock fail');
  if (q.race) ensureRace(q.race);
  const list = posts.filter(
    (p) => (p.state === 'visible' || p.state === 'temp_hidden') && (!q.race || p.race_id === q.race) && (!q.cat || p.category === q.cat),
  );
  return paginate(list, q.before, 'guest');
}

export async function mockPost(v: Viewer, id: string): Promise<PostDetail | null> {
  await wait();
  const p = posts.find((x) => x.id === id);
  if (!p) return null;
  if (p.state === 'hidden' && !p.mine && v !== 'admin') return null;
  const locked = v === 'guest' || v === 'unverified';
  const showBody = p.state === 'visible' || (p.state === 'hidden' && (p.mine || v === 'admin'));
  const list: CommentItem[] = locked
    ? []
    : comments
        .filter((c) => c.post_id === id && (c.state !== 'hidden' || c.mine || v === 'admin'))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => ({
          id: c.id,
          parent_id: c.parent_id,
          nickname: c.state === 'visible' ? c.nickname : null,
          body: c.state === 'visible' ? c.body : null,
          created_at: c.created_at,
          edited: c.edited,
          state: c.state,
          mine: c.mine,
        }));
  return {
    post: { ...item(p, v), updated_at: p.updated_at, body: locked || !showBody ? null : p.body, mine: p.mine && !locked, liked: !locked && p.liked },
    locked,
    comments: list,
  };
}

export async function mockMyPosts(v: Viewer): Promise<PostListResponse> {
  await wait();
  if (v === 'guest') return { items: [], next: null };
  return { items: sorted(posts.filter((p) => p.mine)).map((p) => ({ ...item(p, 'admin'), title: p.state === 'deleted' ? null : p.title })), next: null };
}

/* ── 쓰기 (서버 거절 문구 흉내) ───────────────────────────── */

function guard(v: Viewer) {
  if (v === 'guest') throw new Error('로그인이 필요합니다.');
  if (v === 'unverified') throw new Error('메일 인증을 마친 회원만 쓸 수 있습니다.');
  if (new URLSearchParams(location.search).get('cban')) throw new Error('글쓰기가 제한되어 있습니다.');
}
function wordCheck(text: string) {
  const w = words.find((x) => text.toLowerCase().includes(x));
  if (w) throw new Error('쓸 수 없는 단어가 들어 있습니다. 표현을 바꿔 주세요.');
}

export async function mockCreatePost(v: Viewer, input: PostInput): Promise<string> {
  await wait();
  guard(v);
  wordCheck(`${input.title} ${input.body}`);
  const at = new Date().toISOString();
  const p: MPost = { id: nextId(), ...input, nickname: v === 'admin' ? '운영자' : '달리는곰', mine: true, user_id: 'mock-me', created_at: at, updated_at: at, edited: false, state: 'visible', liked: false, like_count: 0 };
  posts.push(p);
  return p.id;
}

export async function mockUpdatePost(id: string, input: PostInput): Promise<void> {
  await wait();
  const p = posts.find((x) => x.id === id && x.mine);
  if (!p) throw new Error('바꿀 수 없는 글입니다.');
  wordCheck(`${input.title} ${input.body}`);
  Object.assign(p, input, { edited: true, updated_at: new Date().toISOString() });
}

export async function mockDeletePost(id: string): Promise<void> {
  await wait();
  const p = posts.find((x) => x.id === id && x.mine);
  if (!p) throw new Error('바꿀 수 없는 글입니다.');
  Object.assign(p, { state: 'deleted', title: '', body: '' });
}

export async function mockAddComment(v: Viewer, postId: string, parentId: string | null, body: string): Promise<void> {
  await wait();
  guard(v);
  wordCheck(body);
  comments.push({ id: nextId(), post_id: postId, parent_id: parentId, body, nickname: v === 'admin' ? '운영자' : '달리는곰', mine: true, created_at: new Date().toISOString(), edited: false, state: 'visible' });
}

export async function mockEditComment(id: string, body: string): Promise<void> {
  await wait();
  const c = comments.find((x) => x.id === id && x.mine);
  if (!c) throw new Error('바꿀 수 없는 댓글입니다.');
  Object.assign(c, { body, edited: true });
}

export async function mockDeleteComment(id: string): Promise<void> {
  await wait();
  const c = comments.find((x) => x.id === id && x.mine);
  if (!c) throw new Error('바꿀 수 없는 댓글입니다.');
  Object.assign(c, { state: 'deleted', body: '' });
}

export async function mockLike(postId: string, on: boolean): Promise<void> {
  await wait(150);
  const p = posts.find((x) => x.id === postId);
  if (!p || p.liked === on) return;
  p.liked = on;
  p.like_count += on ? 1 : -1;
}

export async function mockReport(target: { type: 'post' | 'comment'; id: string }, _reason: ReportReason): Promise<void> {
  await wait();
  const k = `${target.type}:${target.id}`;
  if (reported.has(k)) {
    const e = new Error('duplicate key value violates unique constraint') as Error & { code: string };
    e.code = '23505';
    throw e;
  }
  reported.add(k);
}

/* ── 관리자 ───────────────────────────────────────────────── */

const reportRows: AdminReportRow[] = (() => {
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3600e3).toISOString();
  return [
    {
      target_type: 'post', target_id: uuid(11), post_id: uuid(11), count: 3, reasons: { spam: 3 },
      notes: ['같은 글을 여러 번 올림', '오픈채팅 홍보로 보입니다'], last_at: ago(1), status: 'hidden', hidden_until: null, hidden_reason: 'reports',
      title: '러닝 크루 모집합니다 (초보 환영, 회비 없음)', body: '매주 토요일 반포에서 뜁니다. 자세한 건 댓글 주세요. 카톡 아이디 남겨 드려요.', nickname: '크루장', user_id: uuid(701), banned_until: null,
    },
    {
      target_type: 'comment', target_id: uuid(12), post_id: uuid(1), count: 1, reasons: { abuse: 1 },
      notes: ['다른 회원에게 욕설'], last_at: ago(4), status: 'visible', hidden_until: null, hidden_reason: null,
      title: '춘천마라톤 짐 보관 어디에 하나요?', body: '그 기록으로 풀코스 나가는 건 민폐죠. 그냥 집에서 뛰세요.', nickname: '빠른발', user_id: uuid(702), banned_until: null,
    },
    {
      target_type: 'post', target_id: uuid(6), post_id: uuid(6), count: 1, reasons: { rights: 1 },
      notes: ['제가 찍은 사진 설명과 글을 그대로 옮겨 왔습니다. 원문 주소 첨부합니다.'], last_at: ago(30), status: 'hidden',
      hidden_until: new Date(now - 2 * 864e5).toISOString(), hidden_reason: 'rights',
      title: '도쿄마라톤 같이 가실 분 숙소 쉐어 구해요', body: '신주쿠 근처로 2박 생각 중입니다.', nickname: '페이스메이커', user_id: uuid(503), banned_until: null,
    },
    {
      target_type: 'post', target_id: uuid(13), post_id: uuid(13), count: 2, reasons: { privacy: 1, other: 1 },
      notes: [], last_at: ago(52), status: 'visible', hidden_until: null, hidden_reason: null,
      title: '어제 대회 사진 찍어 주신 분 찾습니다', body: '파란 모자 쓰신 분, 010 으로 시작하는 번호 남겨요…', nickname: '한강러너', user_id: uuid(505), banned_until: new Date(now + 5 * 864e5).toISOString(),
    },
  ];
})();

export async function mockAdminReports(v: Viewer): Promise<AdminReportRow[]> {
  await wait();
  if (v !== 'admin') throw new Error('관리자만 볼 수 있습니다.');
  return reportRows.map((r) => ({ ...r }));
}

export async function mockAdminAction(type: 'post' | 'comment', id: string, action: AdminAction): Promise<void> {
  await wait();
  const i = reportRows.findIndex((r) => r.target_type === type && r.target_id === id);
  if (i < 0) return;
  const r = reportRows[i];
  if (action === 'hide') Object.assign(r, { status: 'hidden', hidden_reason: 'admin', hidden_until: null });
  if (action === 'restore') Object.assign(r, { status: 'visible', hidden_reason: null, hidden_until: null });
  if (action === 'delete') Object.assign(r, { status: 'deleted', title: '', body: '' });
  if (action === 'temp_hide') Object.assign(r, { status: 'hidden', hidden_reason: 'rights', hidden_until: new Date(Date.now() + 30 * 864e5).toISOString() });
  // 처리하면 미처리 신고가 없어진다 → 자동 숨김(reports)이 아니면 신고함에서 빠진다
  if (r.hidden_reason !== 'reports') reportRows.splice(i, 1);
}

export async function mockAdminBan(userId: string, days: 1 | 7 | 0 | null): Promise<void> {
  await wait();
  const until = days === 0 ? null : days === null ? 'infinity' : new Date(Date.now() + days * 864e5).toISOString();
  bans.set(userId, until);
  for (const r of reportRows) if (r.user_id === userId) r.banned_until = until;
}

export async function mockWords(): Promise<string[]> {
  await wait();
  return [...words].sort();
}
export async function mockWordAdd(word: string): Promise<void> {
  await wait();
  const w = word.trim().toLowerCase();
  if (w.length < 1 || w.length > 40) throw new Error('금칙어는 1~40자입니다.');
  if (!words.includes(w)) words = [...words, w];
}
export async function mockWordRemove(word: string): Promise<void> {
  await wait();
  words = words.filter((w) => w !== word);
}

