import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, hasSupabase } from './supabase';
import type { Profile } from './types';
import { CONTACT_EMAIL, POLICY_VERSION, type ConsentRecord } from './policy';
import { useLang, translate as tr, type Lang } from '../i18n';

export type SignUpResult = 'signed_in' | 'check_email' | 'already_exists';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** 비밀번호 재설정 메일의 링크를 눌러 들어온 상태 */
  recovering: boolean;
  /** 가입 확인 메일 링크를 눌러 방금 로그인된 상태 */
  justConfirmed: boolean;
  clearFlags: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  /** consent 는 가입 화면의 동의 기록 — user_metadata 에 닉네임과 같이 남는다 */
  signUp: (email: string, password: string, nickname: string, consent: ConsentRecord) => Promise<SignUpResult>;
  resendConfirm: (email: string) => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  /** 메일로 받은 숫자 코드로 인증 (링크가 안 열리거나 다른 기기에서 메일을 볼 때) */
  verifyCode: (email: string, code: string, kind: 'signup' | 'recovery') => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  /** 닉네임 바꾸기 (2~16자, 광고·운영진 사칭 금지는 서버가 확인) */
  updateNickname: (nickname: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** 로그인했고 user_metadata.policy_version 이 지금 처리방침 버전과 다르면 true (개정 안내를 띄운다) */
  policyNoticeDue: boolean;
  /** 개정 안내 확인(재동의 포함) 기록 */
  ackPolicy: () => Promise<void>;
  /** 회원 탈퇴: delete_my_account RPC 가 성공하면 이 기기에서 로그아웃. 실패하면 throw 하고 로그인 상태를 그대로 둔다 */
  deleteAccount: () => Promise<void>;
}

const noop = async () => {};
const Ctx = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  recovering: false,
  justConfirmed: false,
  clearFlags: () => {},
  signIn: noop,
  signUp: async () => 'check_email',
  resendConfirm: noop,
  sendReset: noop,
  verifyCode: noop,
  updatePassword: noop,
  updateNickname: noop,
  signOut: noop,
  policyNoticeDue: false,
  ackPolicy: noop,
  deleteAccount: noop,
});

export const useAuth = () => useContext(Ctx);

const redirectTo = () => `${window.location.origin}/`;

/**
 * 개발 서버 전용 로그인 흉내: /?amock=member|admin (&nick=닉네임) 이면 처음부터 로그인한 것처럼 보인다 (서버 호출 없음).
 * 머리말·메뉴를 회원·관리자 상태로 확인하려고 둔다. 빌드에서는 import.meta.env.DEV 가 false 라 통째로 빠진다.
 */
function devAuthMock(): { session: Session; profile: Profile } | null {
  const q = new URLSearchParams(window.location.search);
  const who = q.get('amock');
  if (who !== 'member' && who !== 'admin') return null;
  const nickname = q.get('nick') || '한강러너';
  const user = {
    id: '00000000-0000-0000-0000-00000000a0c0',
    email: 'runner@example.com',
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    app_metadata: {},
    // 개정 안내 창이 뜨지 않게 지금 처리방침 버전으로
    user_metadata: { nickname, policy_version: POLICY_VERSION },
  };
  const session = { access_token: '', refresh_token: '', expires_in: 3600, token_type: 'bearer', user } as unknown as Session;
  return { session, profile: { id: user.id, nickname, is_admin: who === 'admin' } };
}
const MOCK = import.meta.env.DEV ? devAuthMock() : null;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { lang, t } = useLang();
  const translate = (msg: string) => translateError(msg, lang);
  const [session, setSession] = useState<Session | null>(MOCK?.session ?? null);
  const [profile, setProfile] = useState<Profile | null>(MOCK?.profile ?? null);
  const [loading, setLoading] = useState(!MOCK);
  const [recovering, setRecovering] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);
  // 안내를 확인한 버전 — 저장한 메타데이터가 세션에 늦게 들어와도 이번 화면에서는 다시 띄우지 않는다
  const [ackedVersion, setAckedVersion] = useState('');

  useEffect(() => {
    if (MOCK) return; // 개발 서버 로그인 흉내: 서버에 묻지 않는다
    if (!hasSupabase || !supabase) {
      setLoading(false);
      return;
    }
    // 메일 링크(PKCE)로 들어오면 주소에 ?code=… 가 붙는다. 라이브러리가 같은 브라우저에 둔 확인값으로 교환하고,
    // 성공하면 code 를 주소에서 지운다 — 비번 재설정이면 PASSWORD_RECOVERY 이벤트, 그 밖(가입 확인)은 로그인만 된다.
    // (앱에 매직 링크 로그인·이메일 변경이 없어 code 로 돌아오는 메일은 가입 확인·비번 재설정뿐)
    // 예전 메일(implicit)은 해시에 type=signup / type=recovery — PKCE 에선 해시 토큰을 쓰지 않고 주소만 정리한다.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hadCode = new URLSearchParams(window.location.search).has('code');
    const linkType = hash.get('type');
    const linkError = new URLSearchParams(window.location.search).get('error_description') ?? hash.get('error_description');
    let recoveryLink = false;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      const q = new URLSearchParams(window.location.search);
      const exchanged = hadCode && !q.has('code');
      if (data.session && !recoveryLink && (exchanged || linkType === 'signup')) setJustConfirmed(true);
      if (linkError) console.warn('auth link error:', linkError);
      // 인증용 값만 지우고 다른 쿼리(?q=, ?r= …)는 남긴다
      const authKeys = ['code', 'sb_flow_id', 'error', 'error_code', 'error_description'];
      const authQuery = authKeys.some((k) => q.has(k));
      const authHash = Boolean(linkType || linkError || hash.has('access_token') || hash.has('error'));
      if (authQuery || authHash) {
        for (const k of authKeys) q.delete(k);
        const rest = q.toString();
        history.replaceState(history.state, '', window.location.pathname + (rest ? `?${rest}` : '') + (authHash ? '' : window.location.hash));
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') {
        recoveryLink = true;
        setRecovering(true);
        setJustConfirmed(false);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (MOCK) return; // 흉내 프로필은 처음 값 그대로 (로그아웃은 signOut 에서 같이 비운다)
    if (!supabase || !session?.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, nickname, is_admin')
      .eq('id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setProfile((data as Profile) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const need = () => {
    if (!supabase) throw new Error(t('authErr.noServer'));
    return supabase;
  };

  const value: AuthState = {
    session,
    profile,
    loading,
    recovering,
    justConfirmed,
    clearFlags() {
      setRecovering(false);
      setJustConfirmed(false);
    },
    async signIn(email, password) {
      const { error } = await need().auth.signInWithPassword({ email, password });
      if (error) throw new Error(translate(error.message));
    },
    async signUp(email, password, nickname, consent) {
      const nick = nickname.trim();
      if (nick.length < 2 || nick.length > 16) throw new Error(t('authErr.nickLen'));
      const { data, error } = await need().auth.signUp({
        email,
        password,
        options: { data: { nickname: nick, ...consent }, emailRedirectTo: redirectTo() },
      });
      if (error) throw new Error(translate(error.message));
      // 메일 인증을 켜두면 이미 있는 이메일도 오류 없이 빈 identities 로 돌아온다.
      if (data.user && data.user.identities && data.user.identities.length === 0) return 'already_exists';
      return data.session ? 'signed_in' : 'check_email';
    },
    async resendConfirm(email) {
      const { error } = await need().auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo() } });
      if (error) throw new Error(translate(error.message));
    },
    async sendReset(email) {
      const { error } = await need().auth.resetPasswordForEmail(email, { redirectTo: redirectTo() });
      if (error) throw new Error(translate(error.message));
    },
    async verifyCode(email, code, kind) {
      const token = code.replace(/\D/g, '');
      if (token.length < 6) throw new Error(t('authErr.code'));
      const types = kind === 'recovery' ? (['recovery'] as const) : (['signup', 'email'] as const);
      let last: string | null = null;
      for (const type of types) {
        const { error } = await need().auth.verifyOtp({ email, token, type });
        if (!error) {
          if (kind === 'recovery') setRecovering(true);
          else setJustConfirmed(true);
          return;
        }
        last = error.message;
      }
      throw new Error(translate(last ?? ''));
    },
    async updatePassword(password) {
      const { error } = await need().auth.updateUser({ password });
      if (error) throw new Error(translate(error.message));
      setRecovering(false);
    },
    async updateNickname(nickname) {
      const nick = nickname.trim();
      if (nick.length < 2 || nick.length > 16) throw new Error(t('authErr.nickLen2'));
      const uid = session?.user.id;
      if (!uid) throw new Error(t('authErr.needLogin'));
      const { data, error } = await need()
        .from('profiles')
        .update({ nickname: nick })
        .eq('id', uid)
        .select('id, nickname, is_admin')
        .maybeSingle();
      if (error) {
        if (error.code === '23505') throw new Error(t('authErr.nickTaken'));
        throw new Error(lang === 'ko' && /[가-힣]/.test(error.message) ? error.message : t('authErr.nickFail'));
      }
      if (data) setProfile(data as Profile);
    },
    async signOut() {
      if (MOCK) {
        setSession(null);
        setProfile(null);
        return;
      }
      if (!supabase) return;
      await supabase.auth.signOut();
    },
    policyNoticeDue:
      !!session?.user && session.user.user_metadata?.policy_version !== POLICY_VERSION && ackedVersion !== POLICY_VERSION,
    async ackPolicy() {
      const { error } = await need().auth.updateUser({ data: { policy_version: POLICY_VERSION, agreed_at: new Date().toISOString() } });
      if (error) throw new Error(translate(error.message));
      // 저장된 뒤에만 표시한다 — 먼저 표시하면 재동의 저장이 실패해도 안내 창이 사라져 오류를 못 보고 동의도 안 남는다
      // (안내만일 때 실패하면 PolicyNotice 가 직접 닫으므로 이번 화면에서는 다시 뜨지 않는다)
      setAckedVersion(POLICY_VERSION);
    },
    async deleteAccount() {
      const sb = need();
      if (!session?.user) throw new Error(t('authErr.needLogin'));
      const { error } = await sb.rpc('delete_my_account');
      if (error) {
        // 함수가 아직 DB 에 없을 때(0011 실행 전)는 메일로 받는다고 안내한다
        const missing = error.code === 'PGRST202' || /could not find the function/i.test(error.message);
        throw new Error(t(missing ? 'withdraw.unavailable' : 'withdraw.failed', { email: CONTACT_EMAIL }));
      }
      // 계정이 이미 없어 서버 로그아웃은 실패하므로 이 기기의 세션만 지운다
      await sb.auth.signOut({ scope: 'local' });
      setProfile(null);
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function translateError(msg: string, lang: Lang): string {
  const m = msg.toLowerCase();
  const t = (k: Parameters<typeof tr>[1]) => tr(lang, k);
  if (m.includes('invalid login')) return t('authErr.invalidLogin');
  if (m.includes('already registered') || m.includes('already been registered')) return t('authErr.registered');
  if (m.includes('password should be at least')) return t('authErr.pwShort');
  if (m.includes('unable to validate email') || m.includes('invalid email')) return t('authErr.badEmail');
  if (m.includes('token has expired') || m.includes('otp') || m.includes('invalid token')) return t('authErr.badCode');
  if (m.includes('email not confirmed')) return t('authErr.notConfirmed');
  if (m.includes('rate limit') || m.includes('security purposes')) return t('authErr.rate');
  if (m.includes('same as the old') || m.includes('different from the old')) return t('authErr.samePw');
  if (m.includes('weak') || m.includes('pwned')) return t('authErr.weak');
  return t('authErr.generic');
}
