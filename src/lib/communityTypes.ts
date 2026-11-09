/**
 * 커뮤니티(러닝톡·대회별 '이야기') 공용 타입·상수. 워커(worker/community.ts)와 화면(src/community/*)이 같이 쓴다.
 * DB 쪽 정의는 supabase/migrations/0014_community.sql (RPC community_list·community_post 의 반환 꼴이 아래와 같다).
 */
export const CATEGORIES = ['question', 'companion', 'info', 'free'] as const;
export type Category = (typeof CATEGORIES)[number];
export const REPORT_REASONS = ['spam', 'abuse', 'privacy', 'rights', 'other'] as const; // rights = 권리 침해(임시조치 대상)
export type ReportReason = (typeof REPORT_REASONS)[number];
export const LIMITS = { titleMin: 2, titleMax: 60, bodyMax: 3000, commentMax: 1000, noteMax: 300, page: 20, links: 1 } as const;
/** 프리렌더·화면이 같이 쓰는 '회원 전용 영역' 클래스 (구조화 데이터 hasPart.cssSelector) */
export const MEMBERS_ONLY_CLASS = 'community-members-only';
/** 공개 상태: visible 정상 / deleted '삭제된 글입니다' / temp_hidden '권리 침해 신고로 임시조치된 글입니다' / hidden 숨김(작성자·관리자에게만 보임)
 *  DB → state 변환(RPC 안에서, 한 곳에서만): status='visible' → visible, 'deleted' → deleted,
 *  'hidden' and hidden_reason='rights' → temp_hidden, 그 밖의 'hidden' → hidden */
export type PostState = 'visible' | 'deleted' | 'temp_hidden' | 'hidden';
/** 보는 사람 상태 (화면이 버튼·잠김 안내를 고르는 기준) */
export type Viewer = 'guest' | 'unverified' | 'member' | 'admin';

export interface PostListItem {
  id: string;
  race_id: string | null; // 대회 이름은 화면·워커가 races 데이터에서 찾는다
  category: Category;
  title: string | null; // state 가 visible 이 아니면 null (단 hidden 을 작성자·관리자가 볼 때는 값 있음)
  nickname: string | null; // 〃
  created_at: string;
  comment_count: number;
  like_count: number;
  edited: boolean;
  state: PostState;
}
export interface PostListResponse {
  items: PostListItem[];
  next: string | null;
}

export interface CommentItem {
  id: string;
  parent_id: string | null;
  nickname: string | null; // visible 아니면 null
  body: string | null; // 〃
  created_at: string;
  edited: boolean;
  state: PostState;
  mine: boolean;
}
export interface PostDetail {
  post: PostListItem & { updated_at: string; body: string | null; mine: boolean; liked: boolean };
  locked: boolean; // true = 비회원·미인증 → body null, comments []
  comments: CommentItem[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

/** 커서: `${created_at}_${id}` (워커·RPC·화면 모두 이 함수만 쓴다) */
export function encodeCursor(p: { created_at: string; id: string }): string {
  return `${p.created_at}_${p.id}`;
}
export function decodeCursor(s: string): { at: string; id: string } | null {
  const i = s.lastIndexOf('_');
  if (i <= 0 || s.length > 100) return null;
  const at = s.slice(0, i);
  const id = s.slice(i + 1);
  if (!isUuid(id)) return null;
  // ISO 시각만 (Postgres 가 내보내는 '2026-11-09T12:34:56.123456+00:00' 꼴 포함)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:?\d{2})$/.test(at) || Number.isNaN(Date.parse(at))) return null;
  return { at, id };
}
