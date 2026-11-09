/**
 * 로그인 뒤 이어 하기 (PLAN 2-4). 비회원이 '캘린더에 추가'·'알림 받기'·'참가했어요' 를 누르면 어떤 대회에서 무엇을 하려던 건지 남겨 두고,
 * 로그인(또는 가입 확인 메일 링크로 연 새 탭)에서 세션이 생기면 App 이 읽어 그 대회·그 동작을 다시 연다.
 * sessionStorage 가 아니라 localStorage 인 까닭: 가입 확인 링크는 같은 브라우저의 새 탭으로 열려 sessionStorage 가 비어 있다.
 */
const KEY = 'marathon-cal:after-login';
const MAX_AGE = 30 * 60 * 1000;

export type GateAction = 'cal' | 'alert' | 'record';
export interface GateIntent {
  raceId: string;
  action: GateAction;
}
export interface AfterLogin extends GateIntent {
  at: number;
}

const isAction = (v: unknown): v is GateAction => v === 'cal' || v === 'alert' || v === 'record';

export function saveIntent(i: GateIntent) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ raceId: i.raceId, action: i.action, at: Date.now() } satisfies AfterLogin));
  } catch {
    /* 저장 못 하면 로그인 뒤 이어 하기만 빠진다 */
  }
}

/** 남겨 둔 의도를 읽기만 한다(렌더 중에 불러도 된다). 30분 지났거나 모양이 틀리면 null */
export function peekIntent(): AfterLogin | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw == null) return null;
    const v = JSON.parse(raw) as Partial<AfterLogin> | null;
    if (!v || typeof v.raceId !== 'string' || !isAction(v.action) || typeof v.at !== 'number') return null;
    if (Date.now() - v.at > MAX_AGE || v.at > Date.now() + 60_000) return null;
    return { raceId: v.raceId, action: v.action, at: v.at };
  } catch {
    return null;
  }
}

/** 읽은 의도를 지운다 (한 번 쓰면 끝) */
export function clearIntent() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 지우지 못해도 30분 뒤에는 버려진다 */
  }
}
