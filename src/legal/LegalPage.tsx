/**
 * /privacy · /terms (영어는 /en/…) 의 얇은 틀 (PLAN 3-5, 3-8). main.tsx 가 App 대신 이 화면을 그린다.
 * 본문 조항은 섹션 컴포넌트(<section id>)로 따로 두고, 글자 모양은 여기서 한꺼번에 입힌다 —
 * 다른 세션의 조항 컴포넌트를 끼워도 같은 모양이 되게. 목차·제목 링크도 그려진 섹션을 읽어 만든다
 * (규칙: <section id> 의 첫 자식이 <h2>. h2 가 없는 섹션은 목차에 넣지 않는다).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, LinkSimple } from '@phosphor-icons/react';
import { Logo } from '../components/Logo';
import { langPath, useLang } from '../i18n';
import { CONTACT_EMAIL, POLICY_VERSION, PRIVACY_PATH, REVISIONS, TERMS_PATH } from '../lib/policy';
import { LEGAL, pick } from './strings';
import PrivacyPolicy from './PrivacyPolicy';
import TermsPage from './TermsPage';

export type LegalKind = 'privacy' | 'terms';

/** 머리·본문·푸터가 같은 왼쪽 선에 서게. 넓은 화면: 목차 13rem + 간격 3.5rem + 본문 42rem(한 줄 한글 약 42자) */
const WRAP = 'mx-auto w-full max-w-[61.5rem] px-4 sm:px-6';

const BODY =
  'mt-8 text-[15px] leading-[1.75] text-ink-2 sm:text-[16px] ' +
  // 조항: 두 번째부터 가는 선으로 나눈다. 앵커로 내려가면 선 위에 조금 여유
  '[&_section]:relative [&_section]:mt-10 [&_section]:scroll-mt-6 [&>section:first-child]:mt-0 ' +
  '[&_section+section]:border-t [&_section+section]:border-line [&_section+section]:pt-10 ' +
  '[&_h2]:text-[20px] [&_h2]:leading-snug [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-ink ' +
  '[&_h3]:mt-8 [&_h3]:text-[16px] [&_h3]:leading-snug [&_h3]:font-semibold [&_h3]:text-ink sm:[&_h3]:text-[17px] ' +
  '[&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_li]:mt-1.5 [&_li]:pl-1 [&_li]:marker:text-ink-3 ' +
  // 본문 링크: 긴 이메일·주소는 칸 안에서 끊는다
  '[&_:is(p,li,td)_a]:text-ink [&_:is(p,li,td)_a]:underline [&_:is(p,li,td)_a]:decoration-ink-3 [&_:is(p,li,td)_a]:underline-offset-[3px] ' +
  '[&_:is(p,li,td)_a]:[overflow-wrap:anywhere] hover:[&_:is(p,li,td)_a]:decoration-ink ' +
  '[&_table]:mt-4 [&_table]:w-full [&_table]:border-collapse [&_table]:text-[14px] [&_table]:leading-relaxed ' +
  '[&_th]:border [&_th]:border-line [&_th]:bg-sunken [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:align-top [&_th]:font-semibold [&_th]:text-ink ' +
  '[&_th[scope=row]]:w-[30%] sm:[&_th[scope=row]]:w-40 ' +
  '[&_td]:border [&_td]:border-line [&_td]:bg-surface [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_td]:break-words ' +
  // 제목 옆 링크 아이콘: 제목에 마우스를 올리거나 Tab 으로 닿을 때만 보인다
  '[&_section:has(>h2:hover)_[data-anchor]_a]:opacity-100 [&_section+section>[data-anchor]]:top-10';

/** <table data-stack> (처리 위탁 표처럼 칸이 셋 이상): 640px 아래에서는 줄마다 상자로 쌓고 칸 이름을 위에 붙인다 */
const STACK =
  'max-sm:[&_table[data-stack]]:block max-sm:[&_table[data-stack]_tbody]:block max-sm:[&_table[data-stack]_thead]:hidden ' +
  'max-sm:[&_table[data-stack]_tr]:block max-sm:[&_table[data-stack]_tr]:rounded-box max-sm:[&_table[data-stack]_tr]:border ' +
  'max-sm:[&_table[data-stack]_tr]:border-line max-sm:[&_table[data-stack]_tr]:bg-surface max-sm:[&_table[data-stack]_tr]:px-4 ' +
  'max-sm:[&_table[data-stack]_tr]:py-3 max-sm:[&_table[data-stack]_tr+tr]:mt-2 ' +
  'max-sm:[&_table[data-stack]_td]:block max-sm:[&_table[data-stack]_td]:border-0 max-sm:[&_table[data-stack]_td]:bg-transparent ' +
  'max-sm:[&_table[data-stack]_td]:p-0 max-sm:[&_table[data-stack]_td+td]:mt-2 ' +
  'max-sm:[&_table[data-stack]_td]:before:block max-sm:[&_table[data-stack]_td]:before:text-[13px] ' +
  'max-sm:[&_table[data-stack]_td]:before:font-semibold max-sm:[&_table[data-stack]_td]:before:text-ink-3 ' +
  'max-sm:[&_table[data-stack]_td]:before:content-[attr(data-label)]';

type Head = { id: string; num: string; label: string; text: string; host: HTMLElement };

function TocList({ heads, active, variant }: { heads: Head[]; active?: string; variant: 'rail' | 'menu' }) {
  const numbered = heads.some((h) => h.num);
  return (
    <ol className={variant === 'rail' ? 'mt-3 border-l border-line' : 'border-t border-line py-1'}>
      {heads.map((h) => {
        const on = active === h.id;
        return (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              aria-current={on ? 'location' : undefined}
              className={
                variant === 'rail'
                  ? `-ml-px flex gap-1.5 border-l-2 py-1.5 pl-3 text-[14px] leading-snug transition-colors ${
                      on ? 'border-ink font-semibold text-ink' : 'border-transparent text-ink-3 hover:text-ink'
                    }`
                  : 'flex min-h-11 items-center gap-1.5 px-4 py-2 text-[15px] leading-snug text-ink-2 transition-colors hover:bg-sunken hover:text-ink'
              }
            >
              {numbered && <span className="w-6 shrink-0 text-ink-3 tabular-nums">{h.num && `${h.num}.`}</span>}
              <span>{h.label}</span>
            </a>
          </li>
        );
      })}
    </ol>
  );
}

export default function LegalPage({ kind }: { kind: LegalKind }) {
  const { lang, setLang } = useLang();
  const title = pick(LEGAL[kind], lang);
  const bodyRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDetailsElement>(null);
  const [heads, setHeads] = useState<Head[]>([]);
  const [active, setActive] = useState<string>();

  useEffect(() => {
    document.title = `${title} — ${lang === 'ko' ? '마라톤 캘린더' : 'Marathon Calendar'}`;
  }, [title, lang]);

  // 목차·제목 링크: 그려진 섹션의 h2 를 DOM 순서로 모은다. 언어 버튼은 새로고침 없이 본문만 바꾸므로 lang 마다 다시 모은다.
  // 링크 아이콘은 h2 앞에 끼운 빈 span(우리가 만든 노드)에 포털로 그린다 — React 가 관리하는 h2 안은 건드리지 않는다
  useEffect(() => {
    const list: Head[] = [];
    for (const s of bodyRef.current?.querySelectorAll<HTMLElement>('section[id]') ?? []) {
      const h = s.querySelector(':scope > h2');
      if (!h) continue;
      const text = (h.textContent ?? '').trim();
      const m = /^(\d+)\.\s*(.+)$/.exec(text);
      const host = document.createElement('span');
      host.dataset.anchor = '';
      host.className = 'absolute top-0 -left-9 hidden h-7 items-center lg:flex';
      s.insertBefore(host, h);
      list.push({ id: s.id, num: m ? m[1] : '', label: m ? m[2] : text, text, host });
    }
    // 첫 그림을 막지 않게 다음 프레임에 목차를 채운다(목차 자리는 처음부터 있으니 본문 위치는 그대로)
    const raf = requestAnimationFrame(() => setHeads(list));
    return () => {
      cancelAnimationFrame(raf);
      list.forEach((x) => x.host.remove());
    };
  }, [lang, kind]);

  // 넓은 화면 목차에서 지금 읽는 조항 표시: 화면 위쪽 40% 에 걸친 조항 가운데 마지막 것
  useEffect(() => {
    if (!heads.length) return;
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) seen.add(e.target.id);
          else seen.delete(e.target.id);
        }
        let cur: string | undefined;
        for (const h of heads) if (seen.has(h.id)) cur = h.id;
        setActive(cur);
      },
      { rootMargin: '0px 0px -60% 0px' },
    );
    for (const h of heads) {
      const s = document.getElementById(h.id);
      if (s) io.observe(s);
    }
    return () => io.disconnect();
  }, [heads]);

  // 본문을 동적 import 로 늦게 그려서 브라우저가 #cookies 같은 앵커로 못 내려간다 → 처음 그린 뒤 직접 내려 준다.
  // 목차는 넓은 화면에선 옆 칸, 좁은 화면에선 처음부터 접힌 채 자리를 차지하므로 내려간 위치가 밀리지 않는다
  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);

  const toc = pick(LEGAL.toc, lang);

  return (
    <div className="min-h-dvh bg-bg text-ink">
      <header className="border-b border-line">
        <div className={`${WRAP} flex h-14 items-center justify-between gap-4`}>
          <a href={langPath('/', lang)} aria-label={pick(LEGAL.home, lang)} className="flex h-11 items-center">
            <Logo />
          </a>
          <button
            onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')}
            lang={lang === 'ko' ? 'en' : 'ko'}
            className="-mr-3 inline-flex h-11 items-center rounded-ctl px-3 text-[15px] font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-sunken hover:text-ink sm:h-9"
          >
            {pick(LEGAL.switchLang, lang)}
          </button>
        </div>
      </header>

      <div className={`${WRAP} py-10 sm:py-14 lg:grid lg:grid-cols-[13rem_minmax(0,42rem)] lg:gap-x-14`}>
        <nav aria-label={toc} className="hidden lg:block">
          <div className="sticky top-8 max-h-[calc(100dvh-4rem)] overflow-y-auto pb-4">
            <p className="text-[13px] font-semibold text-ink-3">{toc}</p>
            <TocList heads={heads} active={active} variant="rail" />
          </div>
        </nav>

        <main className="max-w-[42rem] min-w-0">
          <h1 className="text-[28px] leading-tight font-bold tracking-tight sm:text-[32px]">{title}</h1>
          <p className="mt-2 text-[14px] text-ink-3 tabular-nums">
            {pick(LEGAL.effective, lang)} {POLICY_VERSION}
          </p>

          <details ref={menuRef} className="group mt-6 rounded-box border border-line bg-surface lg:hidden">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between rounded-box px-4 text-[15px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
              {toc}
              <CaretDown size={16} aria-hidden className="text-ink-3 transition-transform duration-150 group-open:rotate-180" />
            </summary>
            {/* 고르면 먼저 접고 내려간다(내려간 뒤 접으면 본문이 목차 높이만큼 밀린다). 접히는 링크에선 브라우저 기본 이동이
                스크롤을 하지 않아 직접 내리고 주소의 #만 바꾼다 */}
            <nav
              aria-label={toc}
              onClick={(e) => {
                const a = (e.target as Element).closest('a');
                const target = a && document.getElementById(a.hash.slice(1));
                if (!a || !target) return;
                e.preventDefault();
                menuRef.current?.removeAttribute('open');
                target.scrollIntoView();
                history.pushState(null, '', a.hash);
              }}
            >
              <TocList heads={heads} variant="menu" />
            </nav>
          </details>

          <div ref={bodyRef} className={`${BODY} ${STACK}`}>
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
                      <td className="whitespace-nowrap tabular-nums">{r.version}</td>
                      <td>{r[lang]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          {heads.map((h) =>
            createPortal(
              <a
                href={`#${h.id}`}
                aria-label={`${pick(LEGAL.anchor, lang)} ${h.text}`}
                className="grid size-7 place-items-center rounded-ctl text-ink-3 opacity-0 transition-opacity duration-150 hover:bg-sunken hover:text-ink hover:opacity-100 focus-visible:opacity-100"
              >
                <LinkSimple size={16} aria-hidden />
              </a>,
              h.host,
              h.id,
            ),
          )}
        </main>
      </div>

      <footer className="border-t border-line">
        <div className={`${WRAP} flex flex-col py-6 text-[14px] text-ink-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:py-8`}>
          <span className="flex flex-wrap items-center gap-x-1.5">
            {pick(LEGAL.contact, lang)}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="inline-flex min-h-11 items-center underline decoration-ink-3 underline-offset-[3px] [overflow-wrap:anywhere] hover:text-ink sm:min-h-0"
            >
              {CONTACT_EMAIL}
            </a>
          </span>
          <a
            href={langPath(kind === 'privacy' ? TERMS_PATH : PRIVACY_PATH, lang)}
            className="inline-flex min-h-11 items-center self-start underline decoration-ink-3 underline-offset-[3px] hover:text-ink sm:min-h-0"
          >
            {pick(LEGAL[kind === 'privacy' ? 'terms' : 'privacy'], lang)}
          </a>
          <a
            href={langPath('/', lang)}
            className="inline-flex min-h-11 items-center self-start underline decoration-ink-3 underline-offset-[3px] hover:text-ink sm:min-h-0"
          >
            {pick(LEGAL.home, lang)}
          </a>
        </div>
      </footer>
    </div>
  );
}
