import { useEffect, useState } from 'react';
import { useAuth } from '../lib/auth';

export function AuthBar({ onOpen }: { onOpen: () => void }) {
  const { session, profile, signOut } = useAuth();

  if (!session) {
    return (
      <button
        onClick={onOpen}
        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
      >
        로그인
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-400">
        {profile?.nickname ?? session.user.email}
        {profile?.is_admin && (
          <span className="ml-1.5 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
            관리자
          </span>
        )}
      </span>
      <button
        onClick={() => signOut()}
        className="rounded-lg px-2 py-1.5 text-xs text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
      >
        로그아웃
      </button>
    </div>
  );
}

export function AuthModal({ onClose }: { onClose: () => void }) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    setInfo('');
    try {
      if (mode === 'in') {
        await signIn(email.trim(), password);
        onClose();
      } else {
        const msg = await signUp(email.trim(), password, nickname);
        if (msg) setInfo(msg);
        else onClose();
      }
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '문제가 생겼습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-50">{mode === 'in' ? '로그인' : '회원가입'}</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:text-zinc-200" aria-label="닫기">
            ✕
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-zinc-500">
          후기를 남기려면 로그인이 필요합니다. 대회 정보 열람은 로그인 없이도 가능합니다.
        </p>

        <form onSubmit={submit} className="space-y-3">
          {mode === 'up' && (
            <Field
              label="닉네임"
              value={nickname}
              onChange={setNickname}
              placeholder="후기에 표시될 이름 (2~16자)"
              required
            />
          )}
          <Field label="이메일" type="email" value={email} onChange={setEmail} placeholder="you@example.com" required />
          <Field
            label="비밀번호"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="6자 이상"
            required
          />

          {err && <p className="text-sm text-rose-400">{err}</p>}
          {info && <p className="text-sm text-emerald-400">{info}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-500 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-40"
          >
            {busy ? '처리 중…' : mode === 'in' ? '로그인' : '가입하기'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in');
            setErr('');
            setInfo('');
          }}
          className="mt-4 w-full text-center text-xs text-zinc-500 transition hover:text-zinc-300"
        >
          {mode === 'in' ? '계정이 없으신가요? 회원가입' : '이미 계정이 있으신가요? 로그인'}
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        required={required}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
      />
    </label>
  );
}
