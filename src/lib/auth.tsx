import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, hasSupabase } from './supabase';
import type { Profile } from './types';

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
  signUp: (email: string, password: string, nickname: string) => Promise<SignUpResult>;
  resendConfirm: (email: string) => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
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
  updatePassword: noop,
  signOut: noop,
});

export const useAuth = () => useContext(Ctx);

const redirectTo = () => `${window.location.origin}/`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);
  const [justConfirmed, setJustConfirmed] = useState(false);

  useEffect(() => {
    if (!hasSupabase || !supabase) {
      setLoading(false);
      return;
    }
    // 메일 링크로 들어오면 URL 해시에 type=signup / type=recovery 가 붙어 있다.
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const linkType = hash.get('type');
    const linkError = hash.get('error_description');

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session && linkType === 'signup') setJustConfirmed(true);
      if (linkError) console.warn('auth link error:', linkError);
      if (linkType || linkError) history.replaceState(null, '', window.location.pathname + window.location.search);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
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
    if (!supabase) throw new Error('서버에 연결되지 않았습니다.');
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
    async signUp(email, password, nickname) {
      const nick = nickname.trim();
      if (nick.length < 2 || nick.length > 16) throw new Error('닉네임은 2자에서 16자 사이로 정해주세요.');
      const { data, error } = await need().auth.signUp({
        email,
        password,
        options: { data: { nickname: nick }, emailRedirectTo: redirectTo() },
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
    async updatePassword(password) {
      const { error } = await need().auth.updateUser({ password });
      if (error) throw new Error(translate(error.message));
      setRecovering(false);
    },
    async signOut() {
      if (!supabase) return;
      await supabase.auth.signOut();
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login')) return '이메일이나 비밀번호가 맞지 않습니다.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return '이미 가입된 이메일입니다. 로그인하거나 비밀번호를 다시 설정하세요.';
  if (m.includes('password should be at least')) return '비밀번호는 8자 이상으로 정해주세요.';
  if (m.includes('unable to validate email') || m.includes('invalid email')) return '이메일 주소를 다시 확인해 주세요.';
  if (m.includes('email not confirmed')) return '아직 메일 인증을 하지 않았습니다. 받은 메일의 링크를 눌러주세요.';
  if (m.includes('rate limit') || m.includes('security purposes'))
    return '메일을 너무 자주 요청했습니다. 1분쯤 뒤에 다시 시도해 주세요.';
  if (m.includes('same as the old') || m.includes('different from the old'))
    return '이전과 다른 비밀번호로 정해주세요.';
  if (m.includes('weak') || m.includes('pwned')) return '너무 쉬운 비밀번호입니다. 다른 비밀번호를 써주세요.';
  return '처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
}
