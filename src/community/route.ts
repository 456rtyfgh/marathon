/**
 * 러닝톡 주소 (PLAN 3.4): /community (?cat=…&race=…), /community/<uuid>, 영어는 앞에 /en.
 * App.tsx 가 첫 화면 번들에서 쓰는 작은 도우미만 둔다 (화면 본체는 CommunityPage 를 열 때 받는다).
 */
import { CATEGORIES, isUuid, type Category } from '../lib/communityTypes';
import type { Lang } from '../i18n/lang';

export const COMMUNITY_PATH = '/community';
const RE = /^(?:\/en)?\/community(?:\/([^/]+))?\/?$/;

/** 지금 주소가 러닝톡이면 true */
export const isCommunityPath = (path: string) => RE.test(path);

/** 주소 → 열 글 id·거르기 */
export function parseCommunity(loc: { pathname: string; search: string }): { post: string | null; cat: Category | null; race: string | null } {
  const m = loc.pathname.match(RE);
  const q = new URLSearchParams(loc.search);
  const cat = q.get('cat');
  const race = q.get('race');
  const id = m?.[1] ?? null;
  return {
    post: id && isUuid(id) ? id.toLowerCase() : null,
    cat: (CATEGORIES as readonly string[]).includes(cat ?? '') ? (cat as Category) : null,
    race: race && /^[a-z0-9-]{2,40}$/.test(race) ? race : null,
  };
}

/** 러닝톡을 닫을 때 거르기 쿼리(cat·race)를 지운다 — 경로는 App 의 주소 동기화가 '/' 로 되돌린다 */
export function stripCommunityQuery() {
  const q = new URLSearchParams(location.search);
  if (!q.has('cat') && !q.has('race')) return;
  q.delete('cat');
  q.delete('race');
  const qs = q.toString();
  history.replaceState(history.state, '', location.pathname + (qs ? `?${qs}` : '') + location.hash);
}

/** 상단 메뉴 글자 (공용 사전을 건드리지 않게 여기에) */
export const COMMUNITY_NAV: Record<Lang, string> = { ko: '러닝톡', en: 'Run Talk' };
