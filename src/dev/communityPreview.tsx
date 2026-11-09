/**
 * 개발 서버 전용 러닝톡 미리보기 (community-preview.html). 로그인 없이 스크린샷을 찍으려고 실제 화면과 같은 Panel 안에 띄운다.
 * ?view=admin  관리 '커뮤니티' 탭 (AdminCommunity, ?cmock=admin)
 * ?view=post   글 상세 (&id=… 없으면 첫 가짜 글)  ?view=list 러닝톡 목록  ?view=form 글쓰기
 * 보는 사람은 ?cmock=guest|unverified|member|admin (community/api.ts 모킹), 언어는 ?lang=en — gaPreview 와 같은 꼴.
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { LangProvider } from '../i18n';
import { CloseButton, Panel } from '../components/ui';
import AdminCommunity from '../community/AdminCommunity';
import CommunityPage from '../community/CommunityPage';
import PostDetail from '../community/PostDetail';
import PostForm from '../community/PostForm';
import type { Race } from '../lib/types';

const FIRST = '00000000-0000-4000-8000-000000000001';
const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'list';
const RACES = [
  { id: 'changwon-tongil-marathon', name_ko: '창원 통일 마라톤', name_en: 'Changwon Tongil Marathon', race_date: '2026-11-22' },
  { id: 'geumsan-jeokbyeokgang-marathon', name_ko: '금산 적벽강 마라톤', name_en: 'Geumsan Jeokbyeokgang Marathon', race_date: '2026-11-15' },
  { id: 'queenstown-marathon', name_ko: '퀸스타운 마라톤', name_en: 'Queenstown Marathon', race_date: '2026-11-21' },
] as Race[];

export default function Preview() {
  const [open, setOpen] = useState(true);
  const [msg, setMsg] = useState('');
  const close = () => setOpen(false);
  const login = () => setMsg('onLogin — 실제 화면에서는 로그인·가입 창이 열립니다');
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} className="m-6 rounded-ctl bg-sunken px-4 py-2 text-[15px] font-semibold">
          다시 열기
        </button>
      )}
      <Panel open={open} onClose={close} label="러닝톡 미리보기">
        {msg && <p className="sticky top-0 z-20 bg-ink px-5 py-2 text-[13px] text-bg">{msg}</p>}
        {view === 'admin' ? (
          <div className="flex h-full flex-col">
            <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-4 sm:px-7">
              <h2 className="pt-1.5 text-[26px] leading-tight font-extrabold tracking-tight">관리 · 커뮤니티</h2>
              <CloseButton onClick={close} />
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
              <AdminCommunity />
            </div>
          </div>
        ) : view === 'list' ? (
          <CommunityPage races={RACES} onClose={close} onLogin={login} />
        ) : (
          <div className="h-full overflow-y-auto px-5 py-6 sm:px-7">
            {view === 'form' ? (
              <PostForm races={RACES} onDone={() => setMsg('저장됨')} onCancel={close} />
            ) : (
              <PostDetail id={q.get('id') ?? FIRST} races={RACES} onBack={close} onLogin={login} />
            )}
          </div>
        )}
      </Panel>
    </>
  );
}

if (import.meta.env.DEV) {
  const lang = q.get('lang') === 'en' ? 'en' : 'ko';
  document.documentElement.lang = lang;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <LangProvider initial={lang}>
        <Preview />
      </LangProvider>
    </StrictMode>,
  );
}
