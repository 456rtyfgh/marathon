import { useState } from 'react';
import { EnvelopeSimple, SignOut, UserCircle } from '@phosphor-icons/react';
import { useAuth } from '../lib/auth';
import { Button, CloseButton, Field, Input, Note, Panel } from './ui';
import { spamReason } from '../lib/spam';
import { track } from '../lib/analytics';
import { useLang } from '../i18n';

export function AuthBar({ onOpen }: { onOpen: () => void }) {
  const { session, profile, signOut } = useAuth();
  const { t } = useLang();
  const [editing, setEditing] = useState(false);

  if (!session) {
    return (
      <Button size="sm" onClick={onOpen}>
        {t('auth.login')}
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setEditing(true)}
        title={t('auth.changeNick')}
        className="inline-flex h-8 items-center gap-1.5 rounded-ctl px-2 text-[14px] font-semibold text-ink-2 transition hover:bg-sunken hover:text-ink"
      >
        <UserCircle size={18} />
        <span className="hidden max-w-[10rem] truncate sm:inline">{profile?.nickname ?? session.user.email}</span>
        <span className="sr-only sm:hidden">{t('auth.me')}</span>
      </button>
      <button
        onClick={() => signOut()}
        aria-label={t('auth.logout')}
        title={t('auth.logout')}
        className="grid size-8 place-items-center rounded-ctl text-ink-3 transition hover:bg-sunken hover:text-ink"
      >
        <SignOut size={17} />
      </button>
      <Panel open={editing} onClose={() => setEditing(false)} label={t('auth.me')} variant="sheet">
        {editing && <ProfileForm onClose={() => setEditing(false)} />}
      </Panel>
    </div>
  );
}

/** 내 정보: 닉네임 바꾸기 */
function ProfileForm({ onClose }: { onClose: () => void }) {
  const { session, profile, updateNickname } = useAuth();
  const { lang, t } = useLang();
  const [nick, setNick] = useState(profile?.nickname ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  return (
    <form
      className="space-y-4 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr('');
        setOk(false);
        const spam = spamReason(nick, lang);
        if (spam) return setErr(spam);
        setBusy(true);
        try {
          await updateNickname(nick);
          setOk(true);
        } catch (e2) {
          setErr(e2 instanceof Error ? e2.message : t('auth.nickFail'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[22px] font-extrabold tracking-tight">{t('auth.me')}</h2>
        <CloseButton onClick={onClose} />
      </div>
      <p className="text-[14px] text-ink-3">{session?.user.email}</p>
      <Field label={t('auth.nick')} hint={t('auth.nickHintMe')}>
        <Input required minLength={2} maxLength={16} value={nick} onChange={(e) => setNick(e.target.value)} />
      </Field>
      {err && <Note tone="error">{err}</Note>}
      {ok && <Note tone="ok">{t('auth.nickChanged')}</Note>}
      <Button type="submit" disabled={busy || nick.trim() === profile?.nickname} className="w-full">
        {busy ? t('common.saving') : t('auth.saveNick')}
      </Button>
    </form>
  );
}

type Mode = 'in' | 'up' | 'sent' | 'forgot' | 'forgot_sent' | 'reset';

export function AuthForm({ onClose, initial = 'in' }: { onClose: () => void; initial?: Mode }) {
  const { signIn, signUp, resendConfirm, sendReset, updatePassword, verifyCode } = useAuth();
  const { t } = useLang();
  const [code, setCode] = useState('');
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
      setErr(e instanceof Error ? e.message : t('auth.failed'));
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, string> = {
    in: t('auth.title.in'),
    up: t('auth.title.up'),
    sent: t('auth.title.sent'),
    forgot: t('auth.title.forgot'),
    forgot_sent: t('auth.title.sent'),
    reset: t('auth.title.reset'),
  };

  return (
    <div className="p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-[22px] font-extrabold tracking-tight">{titles[mode]}</h2>
        <CloseButton onClick={onClose} />
      </div>

      {(mode === 'sent' || mode === 'forgot_sent') && (
        <div className="space-y-4">
          <div className="grid size-12 place-items-center rounded-box bg-accent text-on-accent">
            <EnvelopeSimple size={24} weight="bold" />
          </div>
          <p className="text-[15px] leading-relaxed text-ink-2">
            <strong className="text-ink">{email}</strong>
            {t('auth.sentTo')}{' '}
            {mode === 'sent' ? t('auth.sentSignup') : t('auth.sentReset')}
          </p>
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await verifyCode(email, code, mode === 'sent' ? 'signup' : 'recovery');
                track(mode === 'sent' ? 'sign_up_confirmed' : 'password_reset_code');
                if (mode === 'sent') onClose();
                else go('reset');
              });
            }}
          >
            <Field label={t('auth.code')} hint={t('auth.codeHint')}>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={10}
                  placeholder="00000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="num text-[20px] tracking-[0.2em]"
                />
                <Button type="submit" disabled={busy || code.replace(/\D/g, '').length < 6}>
                  {t('auth.confirm')}
                </Button>
              </div>
            </Field>
          </form>
          <p className="text-[13px] leading-relaxed text-ink-3">{t('auth.spam')}</p>
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
                  setInfo(t('auth.resent'));
                })
              }
            >
              {busy ? t('common.sending') : t('auth.resend')}
            </Button>
            <Button tone="quiet" onClick={() => go('in')}>
              {t('auth.toLogin')}
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
              if (password.length < 8) throw new Error(t('auth.pw8'));
              await updatePassword(password);
              onClose();
            });
          }}
        >
          <Field label={t('auth.newPw')} hint={t('auth.pwHint')}>
            <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {err && <Note tone="error">{err}</Note>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t('common.saving') : t('auth.savePw')}
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
          <p className="text-[15px] leading-relaxed text-ink-2">{t('auth.forgotText')}</p>
          <Field label={t('auth.email')}>
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {err && <Note tone="error">{err}</Note>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t('common.sending') : t('auth.getLink')}
          </Button>
          <button type="button" onClick={() => go('in')} className="w-full text-center text-[14px] text-ink-3 hover:text-ink">
            {t('auth.backToLogin')}
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
              if (password.length < 8) throw new Error(t('auth.pw8'));
              const r = await signUp(email.trim(), password, nickname);
              track('sign_up', { result: r });
              if (r === 'signed_in') onClose();
              else if (r === 'check_email') setMode('sent');
              else {
                setMode('in');
                setErr(t('auth.exists'));
              }
            });
          }}
        >
          {mode === 'up' && (
            <Field label={t('auth.nick')} hint={t('auth.nickHint')}>
              <Input required minLength={2} maxLength={16} value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </Field>
          )}
          <Field label={t('auth.email')}>
            <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t('auth.password')} hint={mode === 'up' ? t('auth.pwHint') : undefined}>
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
            {busy ? t('common.processing') : mode === 'in' ? t('auth.login') : t('auth.signupSubmit')}
          </Button>

          <div className="flex items-center justify-between pt-1 text-[14px]">
            <button type="button" onClick={() => go(mode === 'in' ? 'up' : 'in')} className="font-semibold text-ink underline underline-offset-4">
              {mode === 'in' ? t('auth.signup') : t('auth.haveAccount')}
            </button>
            {mode === 'in' && (
              <button type="button" onClick={() => go('forgot')} className="text-ink-3 hover:text-ink">
                {t('auth.forgot')}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
