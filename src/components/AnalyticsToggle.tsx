import { useState } from 'react';
import { getAnalyticsConsent, setAnalyticsConsent } from '../lib/analytics';
import { useLang } from '../i18n';

/**
 * 처리방침 6항의 방문 통계 켜기/끄기 (PLAN 2-1). localStorage 'mc:ga-consent' 에 남기고 다음 방문부터 적용(끄면 이 탭에서도 바로 멈춤).
 * 6항 본문이 버튼 이름 '[Google Analytics 끄기]' 를 가리키므로 버튼 글자는 바꾸지 않는다.
 */
export function AnalyticsToggle() {
  const { lang } = useLang();
  const ko = lang === 'ko';
  const [denied, setDenied] = useState(() => getAnalyticsConsent() === 'denied');
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-box border border-line px-4 py-2.5">
      <span className="text-[14px] text-ink-2" aria-live="polite">
        {ko ? '이 브라우저의 방문 통계: ' : 'Visit statistics in this browser: '}
        <strong className="font-semibold text-ink">{denied ? (ko ? '꺼짐' : 'Off') : ko ? '켜짐' : 'On'}</strong>
      </span>
      <button
        type="button"
        onClick={() => {
          const next = denied ? 'granted' : 'denied';
          setAnalyticsConsent(next);
          setDenied(next === 'denied');
        }}
        className="inline-flex h-11 shrink-0 items-center rounded-ctl border border-line px-3 text-[14px] font-semibold whitespace-nowrap text-ink transition-colors hover:bg-sunken active:translate-y-px sm:h-9"
      >
        {denied ? (ko ? 'Google Analytics 켜기' : 'Turn on Google Analytics') : ko ? 'Google Analytics 끄기' : 'Turn off Google Analytics'}
      </button>
    </div>
  );
}
