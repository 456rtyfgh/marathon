/**
 * 개발 서버 전용 GA 섹션 미리보기 (ga-preview.html). 로그인 없이 스크린샷을 찍으려고 실제 화면과 같은 Panel 안에 AdminPanel 을 띄운다.
 * 언어는 주소(?lang=en)로만 정한다 — applyLang·localStorage 를 쓰지 않아 다음 스크린샷 언어가 섞이지 않는다.
 * GA 숫자는 ?gamock=ok|off|error|slow (gaClient.ts 모킹 모드). 기존 자체 통계는 로그인이 없어 오류/빈 상태로 보여도 된다.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { LangProvider } from '../i18n';
import { Panel } from '../components/ui';
import AdminPanel from '../components/AdminPanel';

export default function Preview() {
  // 닫으면 AdminPanel 이 언마운트된다 → 30초 실시간 새로고침이 멈추는지 콘솔('__GA_MOCK__ realtime #n')로 확인
  const [open, setOpen] = useState(true);
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="m-6 rounded-ctl bg-sunken px-4 py-2 text-[15px] font-semibold">
          관리 패널 다시 열기
        </button>
      )}
      <Panel open={open} onClose={() => setOpen(false)} label="관리">
        <AdminPanel races={[]} onClose={() => setOpen(false)} onSaved={() => {}} />
      </Panel>
    </>
  );
}

if (import.meta.env.DEV) {
  const lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'ko';
  document.documentElement.lang = lang;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LangProvider initial={lang}>
        <Preview />
      </LangProvider>
    </StrictMode>,
  );
}
