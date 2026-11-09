/**
 * 러닝톡 화면 ↔ 서버 (PLAN 3.2·3.3·3.4).
 * - 목록: 같은 사이트 /api/community (워커가 캐시·사이트 밖 요청 차단). 개발 서버엔 워커가 없어 RPC community_list 로 바로 읽는다.
 * - 상세(본문·댓글)는 RPC community_post — 서버가 비회원·미인증에게 본문·댓글을 내려 주지 않는다(locked). 화면 판단은 편의일 뿐.
 * - 쓰기는 표에 직접 (거절은 DB 트리거의 한국어 메시지). reports·post_likes 는 select 권한이 없어 .select() 를 붙이지 않는다.
 * 모킹(개발 서버 전용): 주소에 ?cmock=guest|unverified|member|admin 이 있으면 서버·세션 대신 mock.ts (gaClient 와 같은 꼴).
 */
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import {
  LIMITS,
  decodeCursor,
  encodeCursor,
  type Category,
  type PostDetail,
  type PostListItem,
  type PostListResponse,
  type ReportReason,
  type Viewer,
} from '../lib/communityTypes';

/** 서버 오류. code = Postgres/PostgREST 오류 코드 (23505 중복 등) */
export class CommunityError extends Error {
  code: string;
  constructor(message: string, code = '') {
    super(message);
    this.name = 'CommunityError';
    this.code = code;
  }
}

/** 개발 서버이고 주소에 cmock 이 있으면 그 보는 사람 상태, 아니면 null */
export function mockViewer(): Viewer | null {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(location.search).get('cmock');
  return v === 'guest' || v === 'unverified' || v === 'member' || v === 'admin' ? v : null;
}
// 배포 빌드에서는 조건이 상수 false 라 mock 청크가 빠진다
const loadMock = () => (import.meta.env.DEV ? import('./mock') : Promise.reject(new Error('mock is dev only')));

function need() {
  if (!supabase) throw new CommunityError('서버에 연결할 수 없습니다.');
  return supabase;
}
const fail = (e: { message: string; code?: string } | null) => {
  if (e) throw new CommunityError(e.message, e.code ?? '');
};

/* ── 보는 사람 ─────────────────────────────────────────────── */

export interface ViewerInfo {
  viewer: Viewer;
  uid: string | null;
  nickname: string | null;
  /** 미인증 회원에게 인증 메일 다시 보내기 */
  resend: () => Promise<void>;
}

/** 화면이 버튼·잠김 안내를 고르는 기준 (실제 잠금은 서버 locked 가 기준) */
export function useViewer(): ViewerInfo {
  const { session, profile, resendConfirm } = useAuth();
  const m = mockViewer();
  if (m)
    return {
      viewer: m,
      uid: m === 'guest' ? null : 'mock-me',
      nickname: m === 'guest' ? null : m === 'admin' ? '운영자' : '달리는곰',
      resend: () => new Promise((r) => setTimeout(r, 300)),
    };
  const user = session?.user;
  const viewer: Viewer = !user ? 'guest' : !user.email_confirmed_at ? 'unverified' : profile?.is_admin ? 'admin' : 'member';
  return {
    viewer,
    uid: user?.id ?? null,
    nickname: profile?.nickname ?? null,
    resend: async () => {
      if (user?.email) await resendConfirm(user.email);
    },
  };
}

/** 쓰기(글·댓글·좋아요·신고)를 할 수 있는지 */
export const canWrite = (v: Viewer, ban: string | null) => (v === 'member' || v === 'admin') && !ban;

/** 내 글쓰기 정지 기한 (없으면 null, 영구는 'infinity'). 0014 실행 전이라 칸이 없으면 null */
/** 개발 미리보기: &cban=1 → 3일 정지, &cban=forever → 영구 */
let mockBanAt: string | null = null;
function mockBan(): string | null {
  const b = new URLSearchParams(location.search).get('cban');
  mockBanAt ??= new Date(Date.now() + 3 * 864e5).toISOString();
  return b === 'forever' ? 'infinity' : b ? mockBanAt : null;
}

export function useMyBan(uid: string | null): string | null {
  // 받은 값은 그 uid 것일 때만 쓴다 (로그아웃·계정 전환 때 지난 값을 비우는 대신)
  const [got, setGot] = useState<{ uid: string; until: string | null } | null>(null);
  useEffect(() => {
    if (!uid || mockViewer() || !supabase) return;
    let alive = true;
    supabase
      .from('profiles')
      .select('banned_until')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => {
        const v = (data as { banned_until?: string | null } | null)?.banned_until ?? null;
        if (alive) setGot({ uid, until: v && (v === 'infinity' || Date.parse(v) > Date.now()) ? v : null });
      });
    return () => {
      alive = false;
    };
  }, [uid]);
  if (uid && mockViewer()) return mockBan();
  return got && got.uid === uid ? got.until : null;
}

/* ── 읽기 ──────────────────────────────────────────────────── */

export interface ListQuery {
  race?: string | null;
  cat?: Category | null;
  before?: string | null;
}

const toItem = (r: PostListItem): PostListItem => ({
  id: r.id,
  race_id: r.race_id,
  category: r.category,
  title: r.title,
  nickname: r.nickname,
  created_at: r.created_at,
  comment_count: r.comment_count ?? 0,
  like_count: r.like_count ?? 0,
  edited: !!r.edited,
  state: r.state,
  hidden_until: r.hidden_until ?? null,
});
const page = (rows: PostListItem[]): PostListResponse => {
  const items = rows.map(toItem);
  return { items, next: items.length >= LIMITS.page ? encodeCursor(items[items.length - 1]) : null };
};

async function listByRpc(q: ListQuery): Promise<PostListResponse> {
  const c = q.before ? decodeCursor(q.before) : null;
  const { data, error } = await need().rpc('community_list', {
    p_race: q.race ?? null,
    p_cat: q.cat ?? null,
    p_before_at: c?.at ?? null,
    p_before_id: c?.id ?? null,
    p_limit: LIMITS.page,
  });
  fail(error);
  return page((data ?? []) as PostListItem[]);
}

/** 러닝톡·이야기 탭 목록 (20개씩, before = 앞 응답의 next) */
export async function listPosts(q: ListQuery, signal?: AbortSignal): Promise<PostListResponse> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockList(q);
  const qs = new URLSearchParams();
  if (q.race) qs.set('race', q.race);
  if (q.cat) qs.set('cat', q.cat);
  if (q.before) qs.set('before', q.before);
  const res = await fetch(`/api/community${qs.toString() ? `?${qs}` : ''}`, { headers: { Accept: 'application/json' }, signal });
  const json = /json/.test(res.headers.get('content-type') ?? '') ? ((await res.json()) as Partial<PostListResponse>) : null;
  // 개발 서버(vite)는 /api 를 index.html 로 돌려준다 → 같은 RPC 로 바로 읽는다
  if (!json && import.meta.env.DEV) return listByRpc(q);
  if (!res.ok || !json || !Array.isArray(json.items)) throw new CommunityError(`목록을 불러오지 못했습니다. (상태 ${res.status})`);
  return { items: json.items.map(toItem), next: json.next ?? null };
}

/** 글 상세. 없거나 볼 수 없는 글이면 null */
export async function getPost(id: string): Promise<PostDetail | null> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockPost(m, id);
  const { data, error } = await need().rpc('community_post', { p_id: id });
  fail(error);
  return (data as PostDetail | null) ?? null;
}

/** 내가 쓴 글 (상태 그대로) */
export async function myPosts(before?: string | null): Promise<PostListResponse> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockMyPosts(m);
  const c = before ? decodeCursor(before) : null;
  const { data, error } = await need().rpc('community_my_posts', { p_before_at: c?.at ?? null, p_before_id: c?.id ?? null });
  fail(error);
  return page((data ?? []) as PostListItem[]);
}

/** 목록 20개씩 이어 받기 + 방금 쓴 글을 맨 위에 끼우기(워커가 첫 페이지를 잠깐 캐시하므로) */
export function usePostList(q: ListQuery) {
  const race = q.race ?? null;
  const cat = q.cat ?? null;
  const key = `${race ?? ''}|${cat ?? ''}`;
  type St = { key: string; items: PostListItem[] | null; next: string | null; failed: boolean; busy: boolean };
  const [st, setSt] = useState<St>({ key, items: null, next: null, failed: false, busy: true });
  // 거르기가 바뀌면 렌더 중에 비운다 (응답은 key 가 같을 때만 받는다)
  if (st.key !== key) setSt({ key, items: null, next: null, failed: false, busy: true });

  const fetchPage = useCallback(
    (before: string | null) => {
      const k = `${race ?? ''}|${cat ?? ''}`;
      listPosts({ race, cat, before }).then(
        (r) =>
          setSt((x) => {
            if (x.key !== k) return x;
            const items = before && x.items ? [...x.items, ...r.items.filter((n) => !x.items!.some((o) => o.id === n.id))] : r.items;
            return { ...x, items, next: r.next, failed: false, busy: false };
          }),
        () => setSt((x) => (x.key !== k ? x : { ...x, items: x.items ?? [], failed: true, busy: false })),
      );
    },
    [race, cat],
  );
  useEffect(() => fetchPage(null), [fetchPage]);

  const again = (before: string | null) => {
    setSt((x) => ({ ...x, busy: true }));
    fetchPage(before);
  };
  return {
    items: st.key === key ? st.items : null,
    failed: st.failed,
    busy: st.busy,
    hasMore: !!st.next,
    more: () => {
      if (st.next && !st.busy) again(st.next);
    },
    reload: () => again(null),
    /** 방금 쓴 글을 맨 위에 (캐시 때문에 서버 첫 페이지에 아직 없을 수 있다) */
    prepend: (p: PostListItem) => setSt((x) => ({ ...x, items: [p, ...(x.items ?? []).filter((o) => o.id !== p.id)] })),
    /** 상세에서 바뀐 값(댓글 수·삭제 등)을 목록 줄에도 */
    patch: useCallback(
      (id: string, v: Partial<PostListItem>) => setSt((x) => ({ ...x, items: x.items && x.items.map((o) => (o.id === id ? { ...o, ...v } : o)) })),
      [],
    ),
  };
}

/* ── 쓰기 ──────────────────────────────────────────────────── */

export interface PostInput {
  race_id: string | null;
  category: Category;
  title: string;
  body: string;
}

/** 새 글 → id */
export async function createPost(uid: string, input: PostInput): Promise<string> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockCreatePost(m, input);
  const { data, error } = await need()
    .from('posts')
    .insert({ ...input, user_id: uid })
    .select('id')
    .single();
  fail(error);
  return (data as { id: string }).id;
}

async function updateOne(table: 'posts' | 'comments', id: string, patch: Record<string, unknown>) {
  const { data, error } = await need().from(table).update(patch).eq('id', id).select('id');
  fail(error);
  if (!data?.length) throw new CommunityError('바꿀 수 없는 글입니다.');
}

export async function updatePost(id: string, input: PostInput): Promise<void> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockUpdatePost(id, input);
  return updateOne('posts', id, { ...input });
}

/** 내 글 지우기 (소프트 삭제 — 서버가 제목·본문을 비운다) */
export async function deletePost(id: string): Promise<void> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockDeletePost(id);
  return updateOne('posts', id, { status: 'deleted' });
}

export async function addComment(uid: string, postId: string, parentId: string | null, body: string): Promise<void> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockAddComment(m, postId, parentId, body);
  const { error } = await need().from('comments').insert({ post_id: postId, parent_id: parentId, body, user_id: uid }).select('id');
  fail(error);
}

export async function editComment(id: string, body: string): Promise<void> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockEditComment(id, body);
  return updateOne('comments', id, { body });
}

export async function deleteComment(id: string): Promise<void> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockDeleteComment(id);
  return updateOne('comments', id, { status: 'deleted' });
}

export async function setLike(uid: string, postId: string, on: boolean): Promise<void> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockLike(postId, on);
  const sb = need();
  const { error } = on
    ? await sb.from('post_likes').insert({ post_id: postId, user_id: uid })
    : await sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', uid);
  // 이미 누른 상태에서 또 누름(다른 탭 등)은 성공으로 본다
  if (error && error.code !== '23505') fail(error);
}

export async function sendReport(
  uid: string,
  target: { type: 'post' | 'comment'; id: string },
  reason: ReportReason,
  note: string,
): Promise<void> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockReport(target, reason);
  const { error } = await need()
    .from('reports')
    .insert({ target_type: target.type, target_id: target.id, reason, note: note || null, reporter: uid });
  fail(error);
}

/* ── 관리자 ────────────────────────────────────────────────── */

export interface AdminReportRow {
  target_type: 'post' | 'comment';
  target_id: string;
  post_id: string;
  count: number;
  reasons: Partial<Record<ReportReason, number>>;
  notes: string[];
  last_at: string;
  status: 'visible' | 'hidden' | 'deleted';
  hidden_until: string | null;
  hidden_reason: 'reports' | 'admin' | 'rights' | null;
  title: string | null;
  body: string | null;
  nickname: string | null;
  user_id: string;
  banned_until: string | null;
}
export type AdminAction = 'hide' | 'restore' | 'delete' | 'temp_hide' | 'dismiss';

export async function adminReports(): Promise<AdminReportRow[]> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockAdminReports(m);
  const { data, error } = await need().rpc('admin_community_reports');
  fail(error);
  return (data ?? []) as AdminReportRow[];
}

export async function adminAction(type: 'post' | 'comment', id: string, action: AdminAction): Promise<void> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockAdminAction(type, id, action);
  const { error } = await need().rpc('admin_community_action', { p_type: type, p_id: id, p_action: action });
  fail(error);
}

/** days: 1 | 7 | null(영구) | 0(해제) */
export async function adminBan(userId: string, days: 1 | 7 | 0 | null): Promise<void> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockAdminBan(userId, days);
  const { error } = await need().rpc('admin_ban', { p_user: userId, p_days: days });
  fail(error);
}

export async function adminWords(): Promise<string[]> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockWords();
  const { data, error } = await need().rpc('admin_banned_words');
  fail(error);
  // setof text 는 문자열 배열 또는 {admin_banned_words: …} 꼴로 올 수 있다
  return ((data ?? []) as unknown[]).map((x) => (typeof x === 'string' ? x : String(Object.values(x as object)[0] ?? ''))).filter(Boolean);
}

export async function adminWordAdd(word: string): Promise<void> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockWordAdd(word);
  const { error } = await need().rpc('admin_banned_word_add', { p_word: word });
  fail(error);
}

export async function adminWordRemove(word: string): Promise<void> {
  const m = mockViewer();
  if (m) return (await loadMock()).mockWordRemove(word);
  const { error } = await need().rpc('admin_banned_word_remove', { p_word: word });
  fail(error);
}
