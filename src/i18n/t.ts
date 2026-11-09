/**
 * 사전 찾기 (React 없음). 화면 밖 lib 함수는 translate(lang, key) 로, 컴포넌트는 useLang().t 로 쓴다.
 * 변수는 {name}. 영어는 vars.count(없으면 vars.n) 가 1 이고 '<key>_one' 이 있으면 그것을 쓴다.
 */
import { ko, type Key } from './ko.ts';
import { en } from './en.ts';
import type { Lang } from './lang.ts';

export type { Key, Lang };
export type Vars = Record<string, string | number>;
export type T = (key: Key, vars?: Vars) => string;

const EN = en as Record<string, string | undefined>;

export function translate(lang: Lang, key: Key, vars?: Vars): string {
  let s: string = ko[key];
  if (lang === 'en') s = ((vars?.count ?? vars?.n) === 1 ? EN[`${key}_one`] : undefined) ?? EN[key] ?? s;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** 그 언어로 고정한 t */
export const tFor = (lang: Lang): T => (key, vars) => translate(lang, key, vars);
