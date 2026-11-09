import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { POLICY_VERSION, PRIVACY_PATH, RECONSENT_FROM } from '../lib/policy';
import { fmtDate } from '../i18n/format';
import { Button, Note } from './ui';
import { langPath, useLang } from '../i18n';

/**
 * 기존 가입자가 로그인했을 때 한 번 보여 주는 처리방침 시행·개정 안내.
 * RECONSENT_FROM 이 정해진 개정(법상 재동의가 필요한 경우)이고 그보다 앞 버전에 동의했던 회원이면 재동의를 받는다.
 */
export function PolicyNotice({ onClose, onWithdraw }: { onClose: () => void; onWithdraw: () => void }) {
  const { session, ackPolicy } = useAuth();
  const { lang, t } = useLang();
  const seen = (session?.user.user_metadata?.policy_version as string | undefined) ?? '';
  const reconsent = !!RECONSENT_FROM && seen < RECONSENT_FROM;
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function ack() {
    setBusy(true);
    setErr('');
    try {
      await ackPolicy();
      onClose();
    } catch (e) {
      // 안내만일 때는 기록에 실패해도 닫는다(다음 로그인 때 다시 보일 뿐). 재동의는 기록돼야 닫는다
      if (!reconsent) onClose();
      else setErr(e instanceof Error ? e.message : t('auth.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-6">
      <h2 className="text-[20px] font-bold tracking-tight">{t('policyNotice.title')}</h2>
      <p className="text-[15px] leading-relaxed text-ink-2">{t('policyNotice.body', { date: fmtDate(POLICY_VERSION, lang) })}</p>
      <a
        href={langPath(PRIVACY_PATH, lang)}
        target="_blank"
        rel="noopener"
        className="inline-block py-2 text-[15px] font-semibold text-ink underline underline-offset-4 hover:no-underline"
      >
        {t('policyNotice.read')}
      </a>
      {reconsent && (
        <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2 text-[15px] text-ink-2">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-semibold text-ink">[{t('consent.required')}]</span> {t('policyNotice.reconsent')}
          </span>
        </label>
      )}
      {err && <Note tone="error">{err}</Note>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={ack} disabled={busy || (reconsent && !agree)} className="grow">
          {busy ? t('common.processing') : reconsent ? t('policyNotice.agree') : t('policyNotice.ok')}
        </Button>
        {reconsent && (
          <Button tone="quiet" onClick={onWithdraw}>
            {t('policyNotice.withdraw')}
          </Button>
        )}
      </div>
    </div>
  );
}
