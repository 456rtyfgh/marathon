import { useRef } from 'react';
import { Bell } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import { Button, CloseButton } from './ui';

/**
 * 저장·캘린더 추가 바로 뒤에 뜨는 작은 '접수 시작·마감 알림 받기' 제안 한 줄.
 * [알림 받기] → 알림 탭(AlertForm·PushToggle, 비회원은 로그인 뒤 이어 하기), [닫기] → 그 대회엔 다시 안 뜬다(부모가 기록).
 * 뜰 때 포커스를 가져가지 않는다. 사라진 뒤 포커스 갈 곳은 부모가 정한다(box = 이 상자, 포커스가 안에 있었는지 보라고 넘긴다).
 */
export default function AlertNudge({
  onAccept,
  onDismiss,
  className = '',
}: {
  onAccept: (box: HTMLElement | null) => void;
  onDismiss: (box: HTMLElement | null) => void;
  className?: string;
}) {
  const { t } = useLang();
  const boxRef = useRef<HTMLDivElement>(null);
  return (
    <div ref={boxRef} role="status" className={`flex items-center gap-2 rounded-box bg-surface py-2 pr-2 pl-4 ${className}`}>
      <Bell size={18} weight="bold" aria-hidden className="shrink-0 text-ink-2" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        <p className="min-w-0 flex-1 basis-48 text-[15px] leading-snug text-ink">{t('nudge.text')}</p>
        <Button size="sm" tone="quiet" type="button" onClick={() => onAccept(boxRef.current)}>
          {t('nudge.cta')}
        </Button>
      </div>
      <CloseButton onClick={() => onDismiss(boxRef.current)} label={t('nudge.close')} />
    </div>
  );
}
