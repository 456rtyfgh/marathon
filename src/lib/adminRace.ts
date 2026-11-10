/**
 * 관리자 대회 수정: DB 에서 전체 칸 읽기 · 바뀐 칸만 저장 · 오류 문구.
 * 화면(RaceEditor 등)은 Supabase 를 직접 부르지 않고 이 파일만 쓴다.
 *
 * - 읽기는 늘 DB(select '*') — 목록 파일(/d/)·상세 파일(/r/)은 배포 때 뜬 스냅샷이라 관리자가 고칠 기준값으로 쓰면 안 된다.
 * - 저장은 바뀐 칸만 update … eq(id) 하고 다시 읽은 행을 돌려준다. RLS 로 막힌 update 는 오류 없이 0행이라
 *   .single() 의 PGRST116 으로 알아채고, 서버 is_admin() 을 물어 '관리자로 인정되지 않음' 을 구분해 알린다.
 * - 개발 서버 흉내(?amock=admin): Supabase 를 전혀 부르지 않는다. 읽기는 vite 가 내주는 /r/<id>.json, 쓰기는 메모리.
 */
import type { Race } from './types';
import { supabase } from './supabase';

/** 개발 서버에서 ?amock=admin (src/lib/auth.tsx devAuthMock 과 같은 조건). 빌드에선 늘 false */
export const IS_ADMIN_MOCK: boolean =
  import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('amock') === 'admin';

/** Supabase 오류 코드를 들고 다니는 오류 (adminErrorText 가 읽는다) */
class AdminError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, code?: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const NOT_FOUND_OR_DENIED = '대회를 찾지 못했거나 고칠 권한이 없습니다.';
const NOT_ADMIN_ON_SERVER =
  '서버가 이 계정을 관리자로 인정하지 않아 저장하지 못했습니다. 관리자 메일 인증(가입 확인 메일)을 마쳤는지, 관리자 주소로 로그인했는지 확인한 뒤 다시 로그인해 주세요.';
const NO_SERVER = 'Supabase가 연결되지 않았습니다.';

type SbError = { message: string; code?: string; details?: string; hint?: string };
const wrap = (e: SbError, status?: number) => new AdminError(e.message, e.code, status);

/* ── 개발 서버 흉내 저장소 ─────────────────────────────── */

const mockStore = new Map<string, Race>();

async function mockLoad(id: string): Promise<Race> {
  const saved = mockStore.get(id);
  if (saved) return { ...saved };
  const res = await fetch(`/r/${encodeURIComponent(id)}.json`);
  if (!res.ok) throw new AdminError(NOT_FOUND_OR_DENIED, 'PGRST116', res.status);
  const j = (await res.json()) as { race?: Race };
  if (!j.race || j.race.id !== id) throw new AdminError(NOT_FOUND_OR_DENIED, 'PGRST116');
  mockStore.set(id, j.race);
  return { ...j.race };
}

async function mockUpdate(id: string, patch: Partial<Race>): Promise<Race> {
  const base = await mockLoad(id);
  const next = { ...base, ...patch, id } as Race;
  mockStore.set(id, next);
  // 실제 저장처럼 아주 잠깐 기다린다 (저장 중 표시 확인용)
  await new Promise((r) => setTimeout(r, 150));
  return { ...next };
}

/* ── 공개 함수 ─────────────────────────────────────────── */

/** DB 의 그 대회 전체 칸. 흉내면 /r/<id>.json 의 race (+ 이번 화면에서 저장한 값) */
export async function adminLoadRace(id: string): Promise<Race> {
  if (IS_ADMIN_MOCK) return mockLoad(id);
  if (!supabase) throw new AdminError(NO_SERVER);
  const { data, error, status } = await supabase.from('races').select('*').eq('id', id).single();
  if (error) throw wrap(error, status);
  return data as Race;
}

/**
 * 바뀐 칸만 저장하고 DB 에서 다시 읽은 행을 돌려준다.
 * patch 가 비면 throw. RLS 에 막히면(0행) 서버 is_admin() 을 물어 원인을 나눠 알린다.
 */
export async function adminUpdateRace(id: string, patch: Partial<Race>): Promise<Race> {
  const body: Record<string, unknown> = { ...patch };
  delete body.id; // id 는 바꾸지 않는다
  if (!Object.keys(body).length) throw new AdminError('바뀐 칸이 없습니다.');
  if (IS_ADMIN_MOCK) return mockUpdate(id, body as Partial<Race>);
  if (!supabase) throw new AdminError(NO_SERVER);

  const { data, error, status } = await supabase.from('races').update(body).eq('id', id).select('*').single();
  if (!error) return data as Race;
  if (error.code === 'PGRST116') {
    // 0행: 대회가 없거나 RLS(races_admin_write_upd: is_admin()) 에 막힘 — 둘을 나눠 알린다
    const admin = await supabase.rpc('is_admin');
    if (!admin.error && admin.data === false) throw new AdminError(NOT_ADMIN_ON_SERVER, '42501', status);
    throw new AdminError(NOT_FOUND_OR_DENIED, 'PGRST116', status);
  }
  throw wrap(error, status);
}

/** 화면에 보일 한국어 오류 문구 */
export function adminErrorText(e: unknown): string {
  const err = (e ?? {}) as { message?: string; code?: string; status?: number };
  const msg = typeof err.message === 'string' ? err.message : String(e);
  const code = err.code ?? '';
  if (msg === NOT_ADMIN_ON_SERVER || msg === NO_SERVER || msg === '바뀐 칸이 없습니다.') return msg;
  if (code === 'PGRST116') return NOT_FOUND_OR_DENIED;
  if (code === 'PGRST301' || code === 'PGRST302' || err.status === 401 || /jwt (expired|malformed)|invalid jwt/i.test(msg)) {
    return '로그인이 만료됐습니다. 다시 로그인한 뒤 저장해 주세요. (고친 내용은 화면에 남아 있습니다)';
  }
  if (code === '42501') {
    return /row-level security/i.test(msg)
      ? NOT_ADMIN_ON_SERVER
      : '이 계정에는 대회를 고칠 권한이 없습니다. 로그인이 풀렸을 수 있으니 다시 로그인해 주세요.';
  }
  if (code === '23514') {
    if (/official_url|source_url|_url_http/.test(msg)) return '주소는 http:// 또는 https:// 로 시작해야 합니다. (DB 검사에 걸림)';
    if (/region/.test(msg)) return '지역 값이 DB 가 받는 목록에 없습니다.';
    return `칸 형식이 DB 검사에 걸렸습니다: ${msg}`;
  }
  if (code === '23502') return `꼭 있어야 하는 칸이 비었습니다: ${msg}`;
  if (code === '22007' || code === '22008') return '날짜 형식이 올바르지 않습니다 (YYYY-MM-DD).';
  if (code === '22P02') return `숫자·값 형식이 올바르지 않습니다: ${msg}`;
  if (code === 'PGRST204') return `DB 에 없는 칸을 보냈습니다: ${msg}`;
  if (code === 'P0001') return msg;
  if (/failed to fetch|networkerror|load failed|timeout/i.test(msg)) return '서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 저장해 주세요.';
  return msg || '저장에 실패했습니다.';
}
