import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Button, CloseButton, Field, Input, Note } from './ui';
import { useLang } from '../i18n';

/** 회원 탈퇴: 지워지는 것·남는 것 안내 → 가입 이메일을 그대로 입력해야 버튼이 켜진다 */
export function WithdrawForm({ onBack, onClose, onDone }: { onBack: () => void; onClose: () => void; onDone: () => void }) {
  const { session, deleteAccount } = useAuth();
  const { t } = useLang();
  const email = session?.user.email ?? '';
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const match = !!email && typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <form
      className="space-y-4 p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!match) return;
        setErr('');
        setBusy(true);
        try {
          await deleteAccount();
          onDone();
        } catch (e2) {
          setErr(e2 instanceof Error ? e2.message : t('auth.failed'));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[20px] font-bold tracking-tight">{t('withdraw.title')}</h2>
        <CloseButton onClick={onClose} />
      </div>
      <dl className="space-y-3 text-[15px] leading-relaxed">
        <div>
          <dt className="font-semibold text-ink">{t('withdraw.gone')}</dt>
          <dd className="text-ink-2">{t('withdraw.goneList')}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink">{t('withdraw.kept')}</dt>
          <dd className="text-ink-2">{t('withdraw.keptList')}</dd>
        </div>
      </dl>
      <p className="text-[15px] font-semibold text-ink">{t('withdraw.undo')}</p>
      <Field label={t('withdraw.confirmLabel')}>
        <Input
          type="email"
          autoComplete="off"
          placeholder={email}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </Field>
      {err && <Note tone="error">{err}</Note>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" tone="danger" disabled={busy || !match}>
          {busy ? t('common.processing') : t('withdraw.submit')}
        </Button>
        <Button type="button" tone="quiet" onClick={onBack}>
          {t('withdraw.back')}
        </Button>
      </div>
    </form>
  );
}
