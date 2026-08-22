import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, hasSupabase } from './supabase';
import type { Profile } from './types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, nickname: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState>({
  session: null,
  profile: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => null,
  signOut: async () => {},
});

export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!hasSupabase || !supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
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

  const value: AuthState = {
    session,
    profile,
    loading,
    async signIn(email, password) {
      if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(translate(error.message));
    },
    async signUp(email, password, nickname) {
      if (!supabase) throw new Error('Supabase가 연결되지 않았습니다.');
      const nick = nickname.trim();
      if (nick.length < 2 || nick.length > 16) throw new Error('닉네임은 2~16자로 입력해 주세요.');
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nickname: nick } },
      });
      if (error) throw new Error(translate(error.message));
      if (!data.session) return '가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 인증해 주세요.';
      return null;
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
  if (m.includes('invalid login')) return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (m.includes('password should be at least')) return '비밀번호는 6자 이상이어야 합니다.';
  if (m.includes('unable to validate email') || m.includes('invalid email'))
    return '이메일 형식을 확인해 주세요.';
  if (m.includes('email not confirmed')) return '메일 인증이 아직 완료되지 않았습니다.';
  return msg;
}
