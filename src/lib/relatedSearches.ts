import type { Race } from './types.ts';
import { aliasSiblings } from './aliases.ts';
import { normalize, searchRaces, type SearchDoc } from './search.ts';
import { cityName, countryName } from '../i18n/names.ts';
import type { Lang } from '../i18n/lang.ts';

/*
 * 관련 검색어 칩 (검색창 아래). Node 로도 돌려 보므로 import 는 확장자 .ts.
 * 출처 (가) 같은 묶음의 다른 표기  (나) 같은 시·도/나라의 다른 도시·지역어  (다) 인기 검색어 중 글자·지역이 겹치는 것
 *      (라) 결과 대회들에서 자주 나오는 키워드(주최·시리즈 이름).
 * 결과가 0개인 말은 칩으로 내지 않는다 (색인으로 실제 결과 수를 확인).
 * 검색어가 비면 '많이 찾는 검색어' (인기 상위, 결과 있는 것만).
 */

export type ChipSource = 'alias' | 'place' | 'popular' | 'keyword';
export type Chip = { term: string; source: ChipSource };
export type Popular = { term: string; n: number };

export const MAX_CHIPS = 6;

/** 대회 한 곳의 위치 키: 국내는 'KR:시·도 약칭', 해외는 나라 코드 */
const sidoOf = (r: Race) => (r.city_ko || '').trim().split(/[\s·]/)[0] ?? '';
export const placeKey = (r: Race): string => (r.country_code === 'KR' ? `KR:${sidoOf(r)}` : r.country_code);

// 색인(배열)마다 한 번만 쌓는 값들. 데이터가 바뀌면 색인 배열이 새로 만들어져 자연히 버려진다
const sizeMemo = new WeakMap<SearchDoc[], Map<string, number>>();
/** 말 하나의 실제 결과 수 (색인별로 기억) */
export function resultCount(index: SearchDoc[], term: string): number {
  let m = sizeMemo.get(index);
  if (!m) sizeMemo.set(index, (m = new Map()));
  const k = normalize(term);
  let n = m.get(k);
  if (n === undefined) m.set(k, (n = k ? searchRaces(index, term).size : 0));
  return n;
}

type PopInfo = { term: string; n: number; size: number; places: Map<string, number> };
const popMemo = new WeakMap<SearchDoc[], WeakMap<Popular[], PopInfo[]>>();
/** 인기 검색어마다 결과 수와 결과가 걸치는 곳들 — 처음 한 번만 계산(색인·목록이 같으면 그대로) */
export function popularInfo(index: SearchDoc[], popular: Popular[]): PopInfo[] {
  let byList = popMemo.get(index);
  if (!byList) popMemo.set(index, (byList = new WeakMap()));
  let v = byList.get(popular);
  if (!v) {
    v = popular.slice(0, 80).map((p) => {
      const hits = searchRaces(index, p.term);
      const places = new Map<string, number>();
      for (const r of hits) places.set(placeKey(r), (places.get(placeKey(r)) ?? 0) + 1);
      return { term: p.term, n: p.n, size: hits.size, places };
    });
    byList.set(popular, v);
  }
  return v;
}

type PlaceStat = { cities: Map<string, { term: string; n: number }>; label: string; count: number };
const placeMemo = new WeakMap<Race[], Partial<Record<Lang, Map<string, PlaceStat>>>>();
function placeStats(races: Race[], lang: Lang): Map<string, PlaceStat> {
  const byLang = placeMemo.get(races) ?? {};
  const cached = byLang[lang];
  if (cached) return cached;
  const m = new Map<string, PlaceStat>();
  for (const r of races) {
    const key = placeKey(r);
    let s = m.get(key);
    if (!s) {
      const kr = r.country_code === 'KR';
      // 국내는 시·도 약칭 ('경북'), 해외는 나라 이름 — 영어 화면은 영어 이름 (영어 색인이 영어 나라 이름도 찾는다)
      const label = kr ? (lang === 'en' ? '' : sidoOf(r)) : countryName(r.country_code, r.country_ko, lang);
      m.set(key, (s = { cities: new Map(), label, count: 0 }));
    }
    s.count++;
    const kr = r.country_code === 'KR';
    // 국내 도시 = '경북 경주' 의 '경주', 해외 도시 = city_ko. 영어는 표에 있는 영어 이름만
    const raw = kr ? (r.city_ko || '').trim().split(/[\s·]+/).slice(1).join(' ') : (r.city_ko || '').trim();
    const name = lang === 'en' ? cityName(r, 'en') ?? '' : raw;
    if (!name) continue;
    const c = s.cities.get(name);
    if (c) c.n++;
    else s.cities.set(name, { term: name, n: 1 });
  }
  placeMemo.set(races, { ...byLang, [lang]: m });
  return m;
}

/** 결과가 가장 많이 걸친 곳 (많은 순 최대 n곳) */
function topPlaces(results: Race[], n: number): string[] {
  const c = new Map<string, number>();
  for (const r of results) c.set(placeKey(r), (c.get(placeKey(r)) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
}

// 키워드로 쓰지 않는 흔한 말
const STOP_KO = new Set(['시티', '육상대회', '육상', '축제', '시리즈', '코리아', '시', '군', '구', '동호인', '마스터즈', '마라톤',  '대회', '하프', '하프마라톤', '국제', '국제마라톤', '런', '트레일', '트레일런', '트레일러닝', '풀', '풀코스', '러닝', '페스티벌', '챌린지', '레이스', '기념', '대한민국', '한국', '전국']);
const STOP_EN = new Set(['marathon', 'half', 'run', 'race', 'the', 'of', 'in', 'and', 'international', 'trail', 'running', 'festival', 'for', 'de', 'la', 'city', 'road', 'full', 'ultra', 'with', 'run', 'races', 'km', 'k']);

/** 결과 대회 이름에서 여러 대회에 걸쳐 나오는 낱말 (주최·시리즈 이름) */
function keywordsOf(results: Race[], lang: Lang): string[] {
  if (results.length < 3) return [];
  const count = new Map<string, number>();
  for (const r of results) {
    const name = lang === 'en' ? r.name_en || r.name_ko : r.name_ko;
    const seen = new Set<string>();
    for (const tok of name.split(/[\s()[\]·,/&+-]+/)) {
      const k = normalize(tok);
      if (k.length < (lang === 'en' ? 3 : 2) || k.length > 12) continue;
      if (/^\d/.test(k) || /^제\d/.test(k) || /^\p{N}+$/u.test(k)) continue;
      if (STOP_EN.has(k) || (lang === 'ko' && STOP_KO.has(k))) continue;
      // 한국어 화면에서는 영어 낱말(in·with·RUN …)보다 한글 이름이 키워드 — 영어만인 말은 4글자 이상일 때만
      if (lang === 'ko' && /^[a-z0-9]+$/.test(k) && k.length < 4) continue;
      seen.add(tok.replace(/[^\p{L}\p{N}]/gu, ''));
    }
    for (const w of seen) count.set(w, (count.get(w) ?? 0) + 1);
  }
  // 두 곳 이상에 나오고, 결과 거의 전부에 나오는 말(= 검색어 자체)은 뺀다
  return [...count.entries()]
    .filter(([, n]) => n >= (results.length >= 10 ? 3 : 2) && n < results.length * 0.8)
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
}

const sharesPair = (a: string, b: string) => {
  for (let i = 0; i + 2 <= a.length; i++) if (b.includes(a.slice(i, i + 2))) return true;
  return false;
};

/**
 * 관련 검색어 칩 최대 max 개. 출처를 (가) → (나) → (다) → (라) 순서로 번갈아 하나씩 고른다.
 * 지금 검색어와 같은 말·서로 같은 말(normalize 기준)·결과 0개인 말은 넣지 않는다.
 * q 가 비면 인기 검색어 중 결과 있는 것을 순서대로.
 */
export function relatedChips(args: {
  q: string;
  index: SearchDoc[];
  races: Race[];
  results: Race[];
  popular: Popular[];
  lang: Lang;
  max?: number;
}): Chip[] {
  const { q, index, races, results, popular, lang } = args;
  const max = args.max ?? MAX_CHIPS;
  const qn = normalize(q);
  const out: Chip[] = [];
  const used = new Set<string>([qn]);
  const add = (term: string, source: ChipSource): boolean => {
    const k = normalize(term);
    if (!k || used.has(k) || resultCount(index, term) === 0) return false;
    used.add(k);
    out.push({ term: term.trim(), source });
    return true;
  };

  // 검색어가 비면 많이 찾는 검색어
  if (!qn) {
    for (const p of popularInfo(index, popular)) {
      if (out.length >= max) break;
      if (p.size > 0) add(p.term, 'popular');
    }
    return out;
  }

  const lists: [ChipSource, () => string[]][] = [
    [
      'alias',
      () => {
        const words = [q, ...q.split(/\s+/)].filter(Boolean);
        return [...new Set(words.flatMap((w) => aliasSiblings(w)))];
      },
    ],
    [
      'place',
      () => {
        const stats = placeStats(races, lang);
        const terms: string[] = [];
        for (const key of topPlaces(results, 2)) {
          const s = stats.get(key);
          if (!s) continue;
          if (s.label) terms.push(s.label);
          terms.push(...[...s.cities.values()].sort((a, b) => b.n - a.n).slice(0, 6).map((c) => c.term));
        }
        return terms;
      },
    ],
    [
      'popular',
      () => {
        const places = new Set(topPlaces(results, 2));
        return popularInfo(index, popular)
          .filter((p) => {
            const pn = normalize(p.term);
            if (!pn || p.size === 0) return false;
            if (qn.length >= 2 && (pn.includes(qn) || qn.includes(pn) || sharesPair(pn, qn))) return true;
            // 그 말의 결과 절반 이상이 지금 결과와 같은 시·도/나라에 있을 때만 '지역이 겹친다'
            let inPlace = 0;
            for (const [k, c] of p.places) if (places.has(k)) inPlace += c;
            return inPlace * 2 >= p.size;
          })
          .map((p) => p.term);
      },
    ],
    ['keyword', () => keywordsOf(results, lang)],
  ];
  const queues = lists.map(([source, get]) => ({ source, items: get(), i: 0 }));
  while (out.length < max && queues.some((x) => x.i < x.items.length)) {
    for (const x of queues) {
      while (x.i < x.items.length && out.length < max) {
        const ok = add(x.items[x.i++], x.source);
        if (ok) break; // 출처마다 한 번에 하나씩
      }
    }
  }
  return out;
}
