/**
 * 화면 언어 (PLAN 2-1). 영어 주소는 '/en' 접두, ?lang=en|ko 는 들어오는 주소로만 받고 곧바로 '/en' 꼴로 바꾼다.
 * 첫 언어: ?lang → 경로 /en → localStorage → 브라우저 언어(검색 로봇은 한국어). 브라우저 언어로 정한 값은 저장하지 않는다.
 */
import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { tFor, translate, type Key, type T, type Vars } from './t.ts';
import type { Lang } from './lang.ts';

export type { Key, Lang, T, Vars };
export { translate };

export const LANG_KEY = 'marathon-cal:lang';
const BOT = /bot|crawl|spider|slurp|Yeti|Googlebot|bingpreview|facebookexternalhit|Twitterbot|kakaotalk-scrap/i;

const isLang = (v: unknown): v is Lang => v === 'ko' || v === 'en';
const isEnPath = (p: string) => p === '/en' || p.startsWith('/en/');

/** '/en/r/x' → '/r/x', '/en' · '/en/' → '/' */
export function stripLang(path: string): string {
  if (!isEnPath(path)) return path;
  return path.slice(3) || '/';
}

/** 그 언어의 주소: '/r/x' → '/en/r/x' (en), '/' → '/en/' (en), '/en/r/x' → '/r/x' (ko) */
export function langPath(path: string, lang: Lang): string {
  const p = stripLang(path);
  if (lang === 'ko') return p;
  return p === '/' ? '/en/' : `/en${p}`;
}

const store = (l: Lang) => {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* 저장 못 해도 이번 화면은 그 언어로 */
  }
};

export function initialLang(): Lang {
  const q = new URLSearchParams(location.search).get('lang');
  if (isLang(q)) {
    store(q);
    return q;
  }
  if (isEnPath(location.pathname)) return 'en';
  try {
    const s = localStorage.getItem(LANG_KEY);
    if (isLang(s)) return s;
  } catch {
    /* 읽지 못하면 브라우저 언어로 */
  }
  if (BOT.test(navigator.userAgent)) return 'ko';
  const b = (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase();
  return b && !b.startsWith('ko') ? 'en' : 'ko';
}

/** 주소·<html lang> 을 그 언어에 맞춘다 (?lang 은 지우고 경로를 /en 꼴로). 바뀐 게 없으면 손대지 않는다 */
export function applyLang(lang: Lang) {
  document.documentElement.lang = lang;
  const u = new URL(location.href);
  const path = langPath(u.pathname, lang);
  const had = u.searchParams.has('lang');
  u.searchParams.delete('lang');
  if (path !== u.pathname || had) history.replaceState(history.state, '', path + u.search + u.hash);
}

interface LangState {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
}

const Ctx = createContext<LangState>({ lang: 'ko', setLang: () => {}, t: tFor('ko') });

/** initial 을 안 주면 initialLang() (main.tsx 는 첫 렌더 전에 정해서 넘긴다) */
export function LangProvider({ initial, children }: { initial?: Lang; children: ReactNode }) {
  const [lang, set] = useState<Lang>(() => initial ?? initialLang());
  const setLang = useCallback((l: Lang) => {
    store(l);
    applyLang(l);
    set(l);
  }, []);
  const value = useMemo(() => ({ lang, setLang, t: tFor(lang) }), [lang, setLang]);
  return createElement(Ctx.Provider, { value }, children);
}

export const useLang = () => useContext(Ctx);
