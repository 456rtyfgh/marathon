/**
 * 회원 전용 캘린더 (site.ts 의 /cal/* 가 여기로 넘긴다)
 *  - GET /cal/<대회id>.ics?e=race,open,close[&lang=en]
 *      Authorization: Bearer <Supabase 사용자 access token> 을 Supabase /auth/v1/user 로 확인한 회원만.
 *      토큰 없음·거절 → 401(한국어/영어 안내), Supabase 연결 실패 → 502. 응답은 늘 private, no-store.
 *  - GET /cal/u/<토큰 hex 64자>.ics[?lang=en]  '내 일정 구독' (캘린더 앱이 주기적으로 받는 주소, 인증 헤더 없음)
 *      Supabase RPC calendar_feed(anon) 하나만 부른다 → 저장한 대회 id 들 → 데이터 파일의 대회로 캘린더 하나.
 *      주소 꼴이 틀리면 404. 없는 토큰도 저장 0개와 같게 빈 캘린더(토큰이 있는지 흘리지 않는다).
 * Supabase 주소·키는 gaRoute.ts 와 같은 규칙: 공개 publishable key → 빌드 값 → env.
 */
import { raceIcs, feedIcs, type CalKind, type IcsRace } from '../src/lib/ics';
import type { Lang } from '../src/i18n/lang.ts';

declare const __SUPABASE_URL__: string;
declare const __SUPABASE_ANON_KEY__: string;
// gaRoute.ts 의 PUBLIC_SB 와 같은 값 (브라우저에도 들어 있는 공개 값)
const PUBLIC_SB = { url: 'https://zhwmfvkwtmakieatlqtz.supabase.co', key: 'sb_publishable_uOBwP5-BbK7keBuq3gsMAg_Oil1yg6O' };
const BUILT_SB_URL = PUBLIC_SB.url || (typeof __SUPABASE_URL__ === 'string' ? __SUPABASE_URL__ : '');
const BUILT_SB_KEY = PUBLIC_SB.key || (typeof __SUPABASE_ANON_KEY__ === 'string' ? __SUPABASE_ANON_KEY__ : '');

export interface MemberEnv {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;
const netFetch: FetchFn = (input, init) => fetch(input, init);

export const sbConfig = (env: MemberEnv) => ({
  url: (BUILT_SB_URL || env.SUPABASE_URL || '').replace(/\/+$/, ''),
  key: BUILT_SB_KEY || env.SUPABASE_ANON_KEY || '',
});

const TEXT: Record<'unauthorized' | 'unavailable' | 'notFound' | 'badFeed', Record<Lang, string>> = {
  unauthorized: {
    ko: "캘린더 파일은 회원만 받을 수 있어요. marathon82.com 에서 로그인한 뒤 '캘린더에 추가'를 눌러 주세요.",
    en: "Calendar files are for members. Sign in at marathon82.com and tap 'Add to calendar'.",
  },
  unavailable: {
    ko: '회원 확인에 실패했습니다. 잠시 뒤 다시 시도해 주세요.',
    en: "We couldn't check your sign-in. Please try again in a moment.",
  },
  notFound: { ko: '대회를 찾지 못했습니다.', en: 'Race not found.' },
  badFeed: {
    ko: '구독 주소가 올바르지 않습니다. 마라톤 캘린더의 내 정보에서 주소를 다시 확인해 주세요.',
    en: 'This subscription address is not valid. Check it again under My account on Marathon Calendar.',
  },
};

const text = (body: string, status: number, extra: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    },
  });

const langOf = (url: URL): Lang => (url.searchParams.get('lang') === 'en' ? 'en' : 'ko');

/** Supabase /auth/v1/user 로 회원 확인. true 회원, false 거절(토큰 틀림·만료), null 확인 불가(네트워크·5xx·설정 없음) */
export async function verifyMember(token: string, env: MemberEnv, fetchFn: FetchFn = netFetch): Promise<boolean | null> {
  const { url, key } = sbConfig(env);
  if (!url || !key) return null;
  let res: Response;
  try {
    res = await fetchFn(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  } catch {
    return null;
  }
  if (res.status >= 500) return null;
  if (!res.ok) return false;
  const user = (await res.json().catch(() => null)) as { id?: unknown } | null;
  return typeof user?.id === 'string' && user.id.length > 0;
}

/** GET /cal/<id>.ics — 회원만 */
export async function calRoute(
  req: Request,
  env: MemberEnv,
  id: string,
  findRace: (id: string) => Promise<IcsRace | undefined>,
  pageUrl: (id: string, lang: Lang) => string,
  fetchFn: FetchFn = netFetch,
): Promise<Response> {
  const url = new URL(req.url);
  const lang = langOf(url);
  const token = (req.headers.get('Authorization') ?? '').match(/^Bearer\s+(\S{1,4096})$/i)?.[1];
  if (!token) return text(TEXT.unauthorized[lang], 401, { 'WWW-Authenticate': 'Bearer' });
  const member = await verifyMember(token, env, fetchFn);
  if (member === null) return text(TEXT.unavailable[lang], 502);
  if (!member) return text(TEXT.unauthorized[lang], 401, { 'WWW-Authenticate': 'Bearer error="invalid_token"' });

  const race = await findRace(id).catch(() => undefined);
  if (!race) return text(TEXT.notFound[lang], 404);
  const allowed: CalKind[] = ['race', 'open', 'close'];
  const kinds = (url.searchParams.get('e') ?? 'race,open,close')
    .split(',')
    .filter((k): k is CalKind => allowed.includes(k as CalKind));
  const ics = raceIcs(race, pageUrl(race.id, lang), kinds.length ? kinds : allowed, lang);
  return new Response(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${race.id}.ics"`,
      'Cache-Control': 'private, no-store',
      Vary: 'Authorization',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** GET /cal/u/<token>.ics — 개인 구독 피드. findRaces 는 id 들을 데이터 파일의 대회로 (없는 id 는 빼고) */
export async function feedRoute(
  req: Request,
  env: MemberEnv,
  token: string,
  findRaces: (ids: string[]) => Promise<{ race: IcsRace; cancelled?: boolean }[]>,
  pageUrl: (id: string, lang: Lang) => string,
  fetchFn: FetchFn = netFetch,
): Promise<Response> {
  const lang = langOf(new URL(req.url));
  if (!/^[0-9a-f]{64}$/.test(token)) return text(TEXT.badFeed[lang], 404);
  const { url, key } = sbConfig(env);
  if (!url || !key) return text(TEXT.unavailable[lang], 502);

  let res: Response;
  try {
    // anon 역할로 부른다 (apikey 만 — 사용자 토큰 없음)
    res = await fetchFn(`${url}/rest/v1/rpc/calendar_feed`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_token: token }),
    });
  } catch {
    return text(TEXT.unavailable[lang], 502);
  }
  if (res.status >= 500) return text(TEXT.unavailable[lang], 502);
  // 함수가 아직 없을 때(0013 실행 전) 등
  if (!res.ok) return text(TEXT.badFeed[lang], 404);
  const rows = (await res.json().catch(() => null)) as { race_id?: unknown }[] | null;
  if (!Array.isArray(rows)) return text(TEXT.unavailable[lang], 502);
  const ids = rows.map((r) => r?.race_id).filter((x): x is string => typeof x === 'string');

  let items: { race: IcsRace; cancelled?: boolean }[];
  try {
    items = await findRaces(ids);
  } catch {
    return text(TEXT.unavailable[lang], 502);
  }
  items.sort((a, b) => a.race.race_date.localeCompare(b.race.race_date) || a.race.id.localeCompare(b.race.id));
  return new Response(feedIcs(items, (id) => pageUrl(id, lang), lang), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="marathon-calendar.ics"',
      'Cache-Control': 'private, max-age=900',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
