/**
 * 나라·시·도·주·도시 이름 (PLAN 3-2). ko 는 지금 화면 그대로, en 은 places-en.json 표 → Intl.DisplayNames.
 * 워커·Node 스크립트도 import 하므로 값 import 는 places-en.json 하나뿐 (나머지는 타입만).
 */
import PLACES from './places-en.json' with { type: 'json' };
import type { Lang } from './lang.ts';

export type { Lang };

const P = PLACES as {
  countries: Record<string, string>;
  provinces: Record<string, string>;
  subregions: Record<string, string>;
  subregions_ko: Record<string, string>;
  cities: Record<string, string>;
};

/** 지도(@svg-maps/south-korea) 의 시·도 id → 한국어 이름 (src/lib/places.ts 의 PROVINCES 와 같은 값) */
const PROVINCE_KO: Record<string, string> = {
  seoul: '서울', gyeonggi: '경기', incheon: '인천', gangwon: '강원', 'north-chungcheong': '충북', 'south-chungcheong': '충남',
  daejeon: '대전', sejong: '세종', 'north-jeolla': '전북', 'south-jeolla': '전남', gwangju: '광주', 'north-gyeongsang': '경북',
  'south-gyeongsang': '경남', daegu: '대구', ulsan: '울산', busan: '부산', jeju: '제주',
};
/** city_ko 첫 낱말 → 시·도 id (src/lib/places.ts 의 provinceOf 와 같은 규칙) */
const PROVINCE_KEYS: [string, string[]][] = [
  ['seoul', ['서울']], ['gyeonggi', ['경기']], ['incheon', ['인천']], ['gangwon', ['강원']],
  ['north-chungcheong', ['충북', '충청북']], ['south-chungcheong', ['충남', '충청남']], ['daejeon', ['대전']], ['sejong', ['세종']],
  ['north-jeolla', ['전북', '전라북']], ['south-jeolla', ['전남', '전라남']], ['gwangju', ['광주']],
  ['north-gyeongsang', ['경북', '경상북']], ['south-gyeongsang', ['경남', '경상남']], ['daegu', ['대구']], ['ulsan', ['울산']],
  ['busan', ['부산']], ['jeju', ['제주', '서귀포']],
];
const provinceIdOf = (cityKo: string): string | null => {
  const head = (cityKo || '').trim().split(/[\s·]/)[0];
  for (const [id, keys] of PROVINCE_KEYS) if (keys.some((k) => head.startsWith(k))) return id;
  return null;
};

let regionNames: Intl.DisplayNames | null = null;

/** 대회 이름: en 은 name_en (비면 name_ko) */
export function raceName(r: { name_ko: string; name_en?: string | null }, lang: Lang): string {
  return lang === 'en' ? r.name_en?.trim() || r.name_ko : r.name_ko;
}

/** 나라 이름. ko 는 fallbackKo(대회의 country_ko 등) 그대로 */
export function countryName(code: string | null | undefined, fallbackKo: string, lang: Lang): string {
  if (lang === 'ko') return fallbackKo;
  const c = (code || '').toUpperCase();
  if (!c) return fallbackKo;
  if (P.countries[c]) return P.countries[c];
  try {
    regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' });
    return regionNames.of(c) ?? c;
  } catch {
    return c;
  }
}

/** 'gyeonggi' → '경기' | 'Gyeonggi' */
export function provinceName(id: string, lang: Lang): string {
  return (lang === 'en' ? P.provinces[id] : PROVINCE_KO[id]) ?? id;
}

/** 'US-CA' → '캘리포니아' | 'California' (ko 값은 src/lib/subregions.ts 의 SUBREGION_NAME 을 빌드 때 옮긴 것) */
export function subregionName(id: string, lang: Lang): string {
  return (lang === 'en' ? P.subregions[id] : P.subregions_ko[id]) ?? id;
}

/** 도시 이름. ko 는 city_ko, en 은 표(`나라코드|city_ko`)에 있으면 그 값, 없으면 null */
export function cityName(r: { country_code: string; city_ko: string }, lang: Lang): string | null {
  if (lang === 'ko') return r.city_ko;
  return P.cities[`${r.country_code}|${r.city_ko}`] ?? null;
}

/**
 * 장소 한 줄. ko = 지금 whereOf 그대로(국내 city_ko, 해외 '나라 도시').
 * en = 국내는 도시(없으면 시·도), 해외는 '도시, 나라'(도시 없거나 나라와 같으면 나라만). 영어에 한글이 새지 않게.
 */
export function whereText(r: { country_code: string; city_ko: string; country_ko: string }, lang: Lang): string {
  const kr = r.country_code === 'KR';
  if (lang === 'ko') return kr ? r.city_ko : `${r.country_ko} ${r.city_ko}`;
  const city = cityName(r, 'en');
  if (kr) {
    if (city) return city;
    const pv = provinceIdOf(r.city_ko);
    return pv ? provinceName(pv, 'en') : countryName('KR', r.country_ko, 'en');
  }
  const country = countryName(r.country_code, r.country_ko, 'en');
  return city && city !== country ? `${city}, ${country}` : country;
}
