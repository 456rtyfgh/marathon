import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Button, CloseButton, Input, Note } from './ui';
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
      className="space-y-5 p-6"
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

      {/* 지워지는 것과 남는 것을 한 상자에서 나란히 */}
      <dl className="divide-y divide-line rounded-box border border-line text-[15px] leading-relaxed">
        <div className="px-4 py-3">
          <dt className="text-[13px] font-semibold text-ink-2">{t('withdraw.gone')}</dt>
          <dd className="mt-1 text-ink">{t('withdraw.goneList')}</dd>
        </div>
        <div className="px-4 py-3">
          <dt className="text-[13px] font-semibold text-ink-2">{t('withdraw.kept')}</dt>
          <dd className="mt-1 text-ink">{t('withdraw.keptList')}</dd>
        </div>
      </dl>

      {/* 되돌릴 수 없다는 말은 확인 입력 바로 위에 둔다 */}
      <div className="space-y-2">
        <p id="withdraw-undo" className="text-[15px] font-semibold text-ink">
          {t('withdraw.undo')}
        </p>
        <label className="flex flex-col gap-2">
          <span className="text-[13px] text-ink-2">{t('withdraw.confirmLabel')}</span>
          <Input
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder={email}
            aria-describedby="withdraw-undo"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
        </label>
      </div>

      {err && <Note tone="error">{err}</Note>}

      {/* 돌아가기가 먼저(왼쪽·위), 탈퇴는 이메일이 맞을 때만 켜진다 */}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" tone="quiet" onClick={onBack}>
          {t('withdraw.back')}
        </Button>
        <Button type="submit" tone="primary" disabled={busy || !match}>
          {busy ? t('common.processing') : t('withdraw.submit')}
        </Button>
      </div>
    </form>
  );
}
