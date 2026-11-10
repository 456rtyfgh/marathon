import { LockSimple } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import type { GateAction, GateIntent } from '../lib/memberGate';
import { Button } from './ui';

export type OnLogin = (mode?: 'in' | 'up', intent?: GateIntent) => void;

/**
 * 비회원이 회원 기능(캘린더 받기·알림 신청·참가 기록)을 눌렀을 때 기능 대신 보이는 안내.
 * [로그인]/[무료 가입] 은 무엇을 하려던 건지(raceId·action) 같이 넘겨 로그인 뒤 그 동작으로 이어진다.
 */
export default function MemberGate({
  raceId,
  action,
  onLogin,
  className = '',
}: {
  raceId: string;
  action: GateAction;
  onLogin: OnLogin;
  className?: string;
}) {
  const { t } = useLang();
  const intent = { raceId, action };
  return (
    <div role="status" className={`rounded-box border border-line px-4 py-4 ${className}`}>
      <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
        <LockSimple size={16} weight="bold" className="shrink-0" />
        {t('member.only')}
      </p>
      <p className="mt-1 text-[15px] sm:text-[13px] leading-relaxed text-ink-3">{t('member.perks')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" type="button" onClick={() => onLogin('in', intent)}>
          {t('member.login')}
        </Button>
        <Button size="sm" tone="quiet" type="button" onClick={() => onLogin('up', intent)}>
          {t('member.signup')}
        </Button>
      </div>
    </div>
  );
}
