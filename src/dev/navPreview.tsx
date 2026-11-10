/**
 * 개발 서버 전용 휴대폰 메뉴 미리보기 (nav-preview.html). 로그인 없이 MobileMenu 만 띄워 열고 닫기·포커스·히스토리를 본다.
 * 보는 사람은 ?who=guest|member|admin (&nick=닉네임), 언어는 ?lang=en — communityPreview 와 같은 꼴.
 * 항목을 고르면 실제 동작 대신 화면에 'onSelect: <id>' 를 적는다 (실제 머리말은 App.tsx 가 잇는다).
 */
import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { LangProvider, langPath, useLang } from '../i18n';
import { Logo } from '../components/Logo';
import { MobileMenu, type MenuItem } from '../components/MobileMenu';
import { COMMUNITY_NAV, COMMUNITY_PATH } from '../community/route';

const q = new URLSearchParams(location.search);
const who = q.get('who') === 'admin' ? 'admin' : q.get('who') === 'member' ? 'member' : 'guest';
const nick = q.get('nick') ?? '한강러너';

export default function Preview() {
  const { lang, t } = useLang();
  const [log, setLog] = useState<string[]>([]);
  const say = (id: string) => () => setLog((l) => [...l, `onSelect: ${id}`]);
  const next = lang === 'ko' ? 'en' : 'ko';

  const main: MenuItem[] = [
    { id: 'talk', label: COMMUNITY_NAV[lang], href: langPath(COMMUNITY_PATH, lang), onSelect: say('talk') },
    { id: 'request', label: t('header.request'), onSelect: say('request') },
  ];
  if (who === 'admin') main.push({ id: 'admin', label: t('header.admin'), onSelect: say('admin') });
  const account: MenuItem[] =
    who === 'guest'
      ? [{ id: 'login', label: t('auth.login'), tone: 'primary', onSelect: say('login') }]
      : [
          { id: 'me', label: t('auth.me'), hint: nick, onSelect: say('me') },
          { id: 'logout', label: t('auth.logout'), onSelect: say('logout') },
        ];
  const groups = [main, [{ id: 'lang', label: t('lang.switch'), lang: next, onSelect: say('lang') } satisfies MenuItem], account];

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-bg">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <span className="flex h-11 items-center">
            <Logo />
          </span>
          <nav className="flex items-center gap-1">
            <MobileMenu className="md:hidden" groups={groups} />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-3 px-4 py-6 text-[15px] text-ink-2 sm:px-6">
        <p>
          휴대폰 메뉴 미리보기 — who={who}, lang={lang}. 메뉴 버튼은 768px 미만에서만 보인다.
        </p>
        <ol data-log className="space-y-1 font-semibold text-ink">
          {log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ol>
        {/* 뒤 화면 스크롤 잠금을 보려고 길게 */}
        <div className="h-[150dvh] rounded-box border border-line" />
      </main>
    </div>
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
