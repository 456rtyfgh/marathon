/**
 * /privacy · /terms (영어는 /en/…) 의 얇은 틀 (PLAN 3-5, 3-8). main.tsx 가 App 대신 이 화면을 그린다.
 * 본문 조항은 섹션 컴포넌트(<section id>)로 따로 두고, 글자 모양은 여기서 한꺼번에 입힌다 —
 * 다른 세션의 조항 컴포넌트를 끼워도 같은 모양이 되게.
 */
import { useEffect } from 'react';
import { Logo } from '../components/Logo';
import { langPath, useLang } from '../i18n';
import { CONTACT_EMAIL, POLICY_VERSION, PRIVACY_PATH, REVISIONS, TERMS_PATH } from '../lib/policy';
import { LEGAL, pick } from './strings';
import PrivacyPolicy from './PrivacyPolicy';
import TermsPage from './TermsPage';

export type LegalKind = 'privacy' | 'terms';

const BODY =
  'mt-8 text-[15px] leading-relaxed text-ink-2 ' +
  '[&_section]:mt-10 [&_h2]:text-[19px] [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-ink ' +
  '[&_h3]:mt-5 [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:text-ink [&_p]:mt-2 ' +
  '[&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mt-1 ' +
  '[&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:no-underline ' +
  '[&_table]:mt-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[14px] ' +
  '[&_th]:border [&_th]:border-line [&_th]:bg-sunken [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold [&_th]:text-ink ' +
  '[&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_td]:align-top';

export default function LegalPage({ kind }: { kind: LegalKind }) {
  const { lang, setLang } = useLang();
  const title = pick(LEGAL[kind], lang);

  useEffect(() => {
    document.title = `${title} — ${lang === 'ko' ? '마라톤 캘린더' : 'Marathon Calendar'}`;
  }, [title, lang]);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
          <a href={langPath('/', lang)} aria-label={pick(LEGAL.home, lang)} className="flex h-11 items-center">
            <Logo />
          </a>
          <button
            onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
            lang={lang === 'ko' ? 'en' : 'ko'}
            className="inline-flex h-11 items-center rounded-ctl px-3 text-[15px] font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-sunken hover:text-ink sm:h-9"
          >
            {pick(LEGAL.switchLang, lang)}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
        <p className="mt-2 text-[14px] text-ink-3">
          {pick(LEGAL.effective, lang)} {POLICY_VERSION}
        </p>

        <div className={BODY}>
          {kind === 'privacy' ? <PrivacyPolicy /> : <TermsPage />}

          <section id="revisions">
            <h2>{pick(LEGAL.revisions, lang)}</h2>
            <table>
              <thead>
                <tr>
                  <th scope="col">{pick(LEGAL.version, lang)}</th>
                  <th scope="col">{pick(LEGAL.change, lang)}</th>
                </tr>
              </thead>
              <tbody>
                {REVISIONS.map((r) => (
                  <tr key={r.version}>
                    <td className="whitespace-nowrap">{r.version}</td>
                    <td>{r[lang]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </div>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap gap-x-4 gap-y-1 px-4 py-8 text-[13px] leading-relaxed text-ink-3 sm:px-6">
          <span>
            {pick(LEGAL.contact, lang)}{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="underline underline-offset-2 hover:no-underline">
              {CONTACT_EMAIL}
            </a>
          </span>
          <a href={langPath(kind === 'privacy' ? TERMS_PATH : PRIVACY_PATH, lang)} className="underline underline-offset-2 hover:no-underline">
            {pick(LEGAL[kind === 'privacy' ? 'terms' : 'privacy'], lang)}
          </a>
          <a href={langPath('/', lang)} className="underline underline-offset-2 hover:no-underline">
            {pick(LEGAL.home, lang)}
          </a>
        </div>
      </footer>
    </div>
  );
}
