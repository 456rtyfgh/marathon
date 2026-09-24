import { useState } from 'react';
import { EnvelopeSimple, SignOut, UserCircle } from '@phosphor-icons/react';
import { useAuth } from '../lib/auth';
import { Button, CloseButton, Field, Input, Note } from './ui';

export function AuthBar({ onOpen }: { onOpen: () => void }) {
  const { session, profile, signOut } = useAuth();

  if (!session) {
    return (
      <Button size="sm" onClick={onOpen}>
        로그인
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <span className="hidden items-center gap-1.5 text-[14px] font-semibold text-ink-2 sm:inline-flex">
        <UserCircle size={18} />
        {profile?.nickname ?? session.user.email}
      </span>
      <button
        onClick={() => signOut()}
        aria-label="로그아웃"
        title="로그아웃"
        className="grid size-8 place-items-center rounded-ctl text-ink-3 transition hover:bg-sunken hover:text-ink"
      >
        <SignOut size={17} />
      </button>
    </div>
  );
}

type Mode = 'in' | 'up' | 'sent' | 'forgot' | 'forgot_sent' | 'reset';

export function AuthForm({ onClose, initial = 'in' }: { onClose: () => void; initial?: Mode }) {
  const { signIn, signUp, resendConfirm, sendReset, updatePassword } = useAuth();
  const [mode, setMode] = useState<Mode>(initial);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const go = (m: Mode) => {
    setMode(m);
    setErr('');
    setInfo('');
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setErr('');
    setInfo('');
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '처리하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = {
    in: '로그인',
    up: '회원가입',
    sent: '메일함을 확인하세요',
    forgot: '비밀번호 다시 설정',
    forgot_sent: '메일함을 확인하세요',
    reset: '새 비밀번호',
  };

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between gap-3">
        <h2 className="text-[22px] font-extrabold tracking-tight">{titles[mode]}</h2>
        <CloseButton onClick={onClose} />
      </div>

      {(mode === 'sent' || mode === 'forgot_sent') && (
        <div className="space-y-4">
          <div className="grid size-12 place-items-center rounded-box bg-accent text-on-accent">
            <EnvelopeSimple size={24} weight="bold" />
          </div>
          <p className="text-[15px] leading-relaxed text-ink-2">
            <strong className="text-ink">{email}</strong> 로{' '}
            {mode === 'sent' ? '가입 확인 메일을 보냈습니다. 메일의 버튼을 누르면 바로 로그인됩니다.' : '비밀번호를 다시 정하는 링크를 보냈습니다.'}
          </p>
          <p className="text-[13px] text-ink-3">몇 분 안에 오지 않으면 스팸함도 확인해 주세요.</p>
          {info && <Note tone="ok">{info}</Note>}
          {err && <Note tone="error">{err}</Note>}
          <div className="flex flex-wrap gap-2">
            <Button
              tone="quiet"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  if (mode === 'sent') await resendConfirm(email);
                  else await sendReset(email);
                  setInfo('다시 보냈습니다.');
                })
              }
            >
              {busy ? '보내는 중' : '메일 다시 보내기'}
            </Button>
            <Button tone="quiet" onClick={() => go('in')}>
              로그인으로
            </Button>
          </div>
        </div>
      )}

      {mode === 'reset' && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              if (password.length < 8) throw new Error('비밀번호는 8자 이상으로 정해주세요.');
              await updatePassword(password);
              onClose();
            });
          }}
        >
          <Field label="새 비밀번호" hint="8자 이상">
            <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {err && <Note tone="error">{err}</Note>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? '저장 중' : '비밀번호 저장'}
          </Button>
        </form>
      )}

      {mode === 'forgot' && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await sendReset(email.trim());
              setMode('forgot_sent');
            });
          }}
        >
          <p className="text-[15px] leading-relaxed text-ink-2">
            가입한 이메일을 적으면 비밀번호를 다시 정할 수 있는 링크를 보내드립니다. 가입한 적이 없는 주소라면 메일이
            가지 않습니다.
          </p>
          <Field label="이메일">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {err && <Note tone="error">{err}</Note>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? '보내는 중' : '링크 받기'}
          </Button>
          <button type="button" onClick={() => go('in')} className="w-full text-center text-[14px] text-ink-3 hover:text-ink">
            로그인으로 돌아가기
          </button>
        </form>
      )}

      {(mode === 'in' || mode === 'up') && (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              if (mode === 'in') {
                await signIn(email.trim(), password);
                onClose();
                return;
              }
              if (password.length < 8) throw new Error('비밀번호는 8자 이상으로 정해주세요.');
              const r = await signUp(email.trim(), password, nickname);
              if (r === 'signed_in') onClose();
              else if (r === 'check_email') setMode('sent');
              else {
                setMode('in');
                setErr('이미 가입된 이메일입니다. 로그인하거나, 비밀번호가 기억나지 않으면 아래에서 다시 정하세요.');
              }
            });
          }}
        >
          {mode === 'up' && (
            <Field label="닉네임" hint="후기에 표시됩니다">
              <Input required minLength={2} maxLength={16} value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </Field>
          )}
          <Field label="이메일">
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="비밀번호" hint={mode === 'up' ? '8자 이상' : undefined}>
            <Input
              type="password"
              autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>

          {err && <Note tone="error">{err}</Note>}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? '처리 중' : mode === 'in' ? '로그인' : '가입하고 인증 메일 받기'}
          </Button>

          <div className="flex items-center justify-between pt-1 text-[14px]">
            <button type="button" onClick={() => go(mode === 'in' ? 'up' : 'in')} className="font-semibold text-ink underline underline-offset-4">
              {mode === 'in' ? '회원가입' : '이미 계정이 있어요'}
            </button>
            {mode === 'in' && (
              <button type="button" onClick={() => go('forgot')} className="text-ink-3 hover:text-ink">
                비밀번호를 잊었어요
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
