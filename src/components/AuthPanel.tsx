import { useState } from 'react';
import { EnvelopeSimple, SignOut, UserCircle } from '@phosphor-icons/react';
import { useAuth } from '../lib/auth';
import { Button, CloseButton, Field, Input, Note, Panel } from './ui';
import { spamReason } from '../lib/spam';
import { track } from '../lib/analytics';
import { langPath, useLang } from '../i18n';
import { CONTACT_EMAIL, POLICY_VERSION, PRIVACY_PATH, emptyConsent, requiredOk } from '../lib/policy';
import { SignupConsent } from './SignupConsent';
import { WithdrawForm } from './WithdrawForm';
import { PolicyNotice } from './PolicyNotice';

export function AuthBar({ onOpen }: { onOpen: () => void }) {
  const { session, profile, signOut, policyNoticeDue, recovering } = useAuth();
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState<'me' | 'withdraw'>('me');
  const [withdrawn, setWithdrawn] = useState(false);
  const [noticeClosed, setNoticeClosed] = useState(false);
  const openMe = (v: 'me' | 'withdraw') => {
    setView(v);
    setEditing(true);
  };
  const close = () => {
    setEditing(false);
    setView('me');
  };

  if (!session) {
    return (
      <>
        <Button size="sm" onClick={onOpen}>
          {t('auth.login')}
        </Button>
        {/* 탈퇴하면 세션이 바로 없어지므로 완료 안내는 로그아웃 상태에서 보여 준다 */}
        <Panel open={withdrawn} onClose={() => setWithdrawn(false)} label={t('withdraw.title')} variant="sheet">
          <div className="space-y-4 p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[20px] font-bold tracking-tight">{t('withdraw.title')}</h2>
              <CloseButton onClick={() => setWithdrawn(false)} />
            </div>
            <Note tone="ok">{t('withdraw.done')}</Note>
          </div>
        </Panel>
      </>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => openMe('me')}
        title={t('auth.changeNick')}
        className="inline-flex h-11 items-center gap-2 rounded-ctl px-3 text-[15px] font-semibold whitespace-nowrap text-ink-2 transition hover:bg-sunken hover:text-ink sm:h-9"
      >
        <UserCircle size={18} />
        <span className="hidden max-w-[10rem] truncate sm:inline">{profile?.nickname ?? session.user.email}</span>
        <span className="sr-only sm:hidden">{t('auth.me')}</span>
      </button>
      <button
        onClick={() => signOut()}
        aria-label={t('auth.logout')}
        title={t('auth.logout')}
        className="grid size-11 place-items-center rounded-ctl text-ink-3 transition hover:bg-sunken hover:text-ink sm:size-9"
      >
        <SignOut size={17} />
      </button>
      <Panel open={editing} onClose={close} label={view === 'withdraw' ? t('withdraw.title') : t('auth.me')} variant="sheet">
        {editing &&
          (view === 'withdraw' ? (
            <WithdrawForm
              onBack={() => setView('me')}
              onClose={close}
              onDone={() => {
                close();
                setWithdrawn(true);
              }}
            />
          ) : (
            <ProfileForm onClose={close} onWithdraw={() => setView('withdraw')} />
          ))}
      </Panel>
      {/* 비밀번호 재설정 링크로 들어온 동안은 재설정 창과 겹치지 않게 미룬다(재설정 창을 닫으면 뜬다) */}
      <Panel
        open={policyNoticeDue && !noticeClosed && !editing && !recovering}
        onClose={() => setNoticeClosed(true)}
        label={t('policyNotice.title')}
        variant="sheet"
      >
        <PolicyNotice
          onClose={() => setNoticeClosed(true)}
          onWithdraw={() => {
            setNoticeClosed(true);
            openMe('withdraw');
          }}
        />
      </Panel>
    </div>
  );
}

/** 내 정보: 닉네임 바꾸기 + 열람·정정·삭제·처리정지 안내 */
function ProfileForm({ onClose, onWithdraw }: { onClose: () => void; onWithdraw: () => void }) {
  const { session, profile, updateNickname } = useAuth();
  const { lang, t } = useLang();
  const [nick, setNick] = useState(profile?.nickname ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  return (
    <div className="space-y-6 p-6">
      <form
        className="space-y-4"
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
          <h2 className="text-[20px] font-bold tracking-tight">{t('auth.me')}</h2>
          <CloseButton onClick={onClose} />
        </div>
        <p className="text-[15px] text-ink-3">
          {t('rights.email')} · {session?.user.email}
        </p>
        <Field label={t('auth.nick')} hint={t('auth.nickHintMe')}>
          <Input required minLength={2} maxLength={16} value={nick} onChange={(e) => setNick(e.target.value)} />
        </Field>
        {err && <Note tone="error">{err}</Note>}
        {ok && <Note tone="ok">{t('auth.nickChanged')}</Note>}
        <Button type="submit" disabled={busy || nick.trim() === profile?.nickname} className="w-full">
          {busy ? t('common.saving') : t('auth.saveNick')}
        </Button>
      </form>
      <section className="border-t border-line pt-5 text-[13px] leading-relaxed">
        <h3 className="text-[15px] font-semibold text-ink">{t('rights.title')}</h3>
        <ul className="mt-3 space-y-2">
          {[t('rights.view'), t('rights.fix'), t('rights.delete'), t('rights.stop', { email: CONTACT_EMAIL })].map((s) => (
            <RightsItem key={s} text={s} />
          ))}
        </ul>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4">
          <a
            href={langPath(PRIVACY_PATH, lang)}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center text-ink-2 underline underline-offset-2 hover:text-ink"
          >
            {t('rights.policy')}
          </a>
          {/* 탈퇴는 찾을 수 있되 눈에 덜 띄는 보조 동작 */}
          <button
            type="button"
            onClick={onWithdraw}
            className="inline-flex min-h-11 items-center text-ink-3 underline underline-offset-2 transition-colors hover:text-ink"
          >
            {t('withdraw.open')}
          </button>
        </div>
      </section>
    </div>
  );
}

/** '열람: …' 처럼 앞의 권리 이름을 굵게 (문구는 그대로, 첫 ': ' 에서 나눠 보여 줄 뿐) */
function RightsItem({ text }: { text: string }) {
  const i = text.indexOf(': ');
  if (i < 0) return <li className="text-ink-2">{text}</li>;
  return (
    <li className="text-ink-2">
      <span className="font-semibold text-ink">{text.slice(0, i + 1)}</span> {text.slice(i + 2)}
    </li>
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
  const [consent, setConsent] = useState(emptyConsent);
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
      <div className="mb-6 flex items-center justify-between gap-3">
        <h2 className="text-[20px] font-bold tracking-tight">{titles[mode]}</h2>
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
                  className="num text-[20px]! tracking-[0.2em]"
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
          <button type="button" onClick={() => go('in')} className="min-h-11 w-full text-center text-[15px] text-ink-3 hover:text-ink">
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
              if (!requiredOk(consent)) throw new Error(t('consent.need'));
              const r = await signUp(email.trim(), password, nickname, {
                policy_version: POLICY_VERSION,
                agreed_at: new Date().toISOString(),
                age14: true,
              });
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

          {mode === 'up' && <SignupConsent value={consent} onChange={setConsent} />}

          {err && <Note tone="error">{err}</Note>}
          {mode === 'up' && !requiredOk(consent) && <p className="text-[13px] text-ink-3">{t('consent.need')}</p>}

          <Button type="submit" disabled={busy || (mode === 'up' && !requiredOk(consent))} className="w-full">
            {busy ? t('common.processing') : mode === 'in' ? t('auth.login') : t('auth.signupSubmit')}
          </Button>

          <div className="flex items-center justify-between gap-4 text-[15px]">
            <button
              type="button"
              onClick={() => go(mode === 'in' ? 'up' : 'in')}
              className="min-h-11 font-semibold whitespace-nowrap text-ink underline underline-offset-4"
            >
              {mode === 'in' ? t('auth.signup') : t('auth.haveAccount')}
            </button>
            {mode === 'in' && (
              <button type="button" onClick={() => go('forgot')} className="min-h-11 whitespace-nowrap text-ink-3 hover:text-ink">
                {t('auth.forgot')}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
