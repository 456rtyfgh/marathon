import type { Race } from './types';
import { isSubregionId, subOf } from './subregions';

/** 지도(@svg-maps/south-korea) 의 시·도 id 와 이름 */
export const PROVINCES: { id: string; name: string; keys: string[] }[] = [
  { id: 'seoul', name: '서울', keys: ['서울'] },
  { id: 'gyeonggi', name: '경기', keys: ['경기'] },
  { id: 'incheon', name: '인천', keys: ['인천'] },
  { id: 'gangwon', name: '강원', keys: ['강원'] },
  { id: 'north-chungcheong', name: '충북', keys: ['충북', '충청북'] },
  { id: 'south-chungcheong', name: '충남', keys: ['충남', '충청남'] },
  { id: 'daejeon', name: '대전', keys: ['대전'] },
  { id: 'sejong', name: '세종', keys: ['세종'] },
  { id: 'north-jeolla', name: '전북', keys: ['전북', '전라북'] },
  { id: 'south-jeolla', name: '전남', keys: ['전남', '전라남'] },
  { id: 'gwangju', name: '광주', keys: ['광주'] },
  { id: 'north-gyeongsang', name: '경북', keys: ['경북', '경상북'] },
  { id: 'south-gyeongsang', name: '경남', keys: ['경남', '경상남'] },
  { id: 'daegu', name: '대구', keys: ['대구'] },
  { id: 'ulsan', name: '울산', keys: ['울산'] },
  { id: 'busan', name: '부산', keys: ['부산'] },
  { id: 'jeju', name: '제주', keys: ['제주', '서귀포'] },
];

export const PROVINCE_NAME = new Map(PROVINCES.map((p) => [p.id, p.name]));

/** city_ko('경남 김해', '서울' …) 에서 시·도 id 를 찾는다. 광주(경기)와 광주(광역시) 는 앞 글자로 구분된다. */
export function provinceOf(race: Pick<Race, 'city_ko'>): string | null {
  const head = (race.city_ko || '').trim().split(/[\s·]/)[0];
  for (const p of PROVINCES) if (p.keys.some((k) => head.startsWith(k))) return p.id;
  return null;
}

/** 지도 / 칩에서 고른 곳 — 국내는 시·도 id, 해외는 국가 코드(소문자) */
export function placeOf(race: Race, domestic: boolean): string | null {
  return domestic ? provinceOf(race) : race.country_code?.toLowerCase() || null;
}

/** 목록 필터: place 가 'kr' 이면 국내 전체, 주·도 코드('US-CA')면 subregion 일치, 아니면 placeOf 일치 */
export function matchesPlace(race: Race, domestic: boolean, place: string): boolean {
  if (place === 'kr') return domestic;
  if (isSubregionId(place)) return subOf(race) === place;
  return placeOf(race, domestic) === place;
}

/** 고른 곳 여러 개의 합집합. 비어 있으면 거르지 않음 */
export function matchesPlaces(race: Race, domestic: boolean, places: string[]): boolean {
  return places.length === 0 || places.some((p) => matchesPlace(race, domestic, p));
}
