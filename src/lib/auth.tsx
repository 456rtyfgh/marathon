import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, hasSupabase } from './supabase';
import type { Profile } from './types';
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
  signUp: (email: string, password: string, nickname: string) => Promise<SignUpResult>;
  resendConfirm: (email: string) => Promise<void>;
  sendReset: (email: string) => Promise<void>;
  /** 메일로 받은 숫자 코드로 인증 (링크가 안 열리거나 다른 기기에서 메일을 볼 때) */
  verifyCode: (email: string, code: string, kind: 'signup' | 'recovery') => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  /** 닉네임 바꾸기 (2~16자, 광고·운영진 사칭 금지는 서버가 확인) */
  updateNickname: (nickname: string) => Promise<void>;
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
  verifyCode: noop,
  updatePassword: noop,
  updateNickname: noop,
  signOut: noop,
});

export const useAuth = () => useContext(Ctx);

const redirectTo = () => `${window.location.origin}/`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { lang, t } = useLang();
  const translate = (msg: string) => translateError(msg, lang);
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
    async signUp(email, password, nickname) {
      const nick = nickname.trim();
      if (nick.length < 2 || nick.length > 16) throw new Error(t('authErr.nickLen'));
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
      if (!supabase) return;
      await supabase.auth.signOut();
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
