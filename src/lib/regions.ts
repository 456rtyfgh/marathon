import type { Race } from './types';
import { normalize, type SearchDoc } from './search.ts';
import { cityName, countryName, provinceName, type Lang } from '../i18n/names.ts';

/*
 * 지역 검색 (국내 시·도 → 시·군·구, 해외 나라·도시). 검색어 전체가 지역 이름일 때만 묶음을 돌려준다 —
 * 지역 뒤에 다른 말이 붙으면('대구마라톤') 빈 목록이라 화면은 예전과 같다.
 * node(search-test·seo-pages)에서도 바로 불러오므로 window·import.meta·CSS 를 쓰지 않는다.
 */

/** 시·도: id(지도·names.ts 와 같은 값), 짧은 이름, 다른 이름들 */
const SIDOS: { id: string; ko: string; alias: string[] }[] = [
  { id: 'seoul', ko: '서울', alias: [] },
  { id: 'gyeonggi', ko: '경기', alias: [] },
  { id: 'incheon', ko: '인천', alias: [] },
  { id: 'gangwon', ko: '강원', alias: [] },
  { id: 'north-chungcheong', ko: '충북', alias: ['충청북'] },
  { id: 'south-chungcheong', ko: '충남', alias: ['충청남'] },
  { id: 'daejeon', ko: '대전', alias: [] },
  { id: 'sejong', ko: '세종', alias: [] },
  { id: 'north-jeolla', ko: '전북', alias: ['전라북'] },
  { id: 'south-jeolla', ko: '전남', alias: ['전라남'] },
  { id: 'gwangju', ko: '광주', alias: [] },
  { id: 'north-gyeongsang', ko: '경북', alias: ['경상북'] },
  { id: 'south-gyeongsang', ko: '경남', alias: ['경상남'] },
  { id: 'daegu', ko: '대구', alias: [] },
  { id: 'ulsan', ko: '울산', alias: [] },
  { id: 'busan', ko: '부산', alias: [] },
  { id: 'jeju', ko: '제주', alias: [] },
];
const SIDO_BY_NAME = new Map<string, (typeof SIDOS)[number]>();
for (const s of SIDOS) for (const n of [s.ko, ...s.alias]) SIDO_BY_NAME.set(n, s);

/** 시·군·구 접미사 정규화: '연수구'→'연수', '경주시'→'경주', 'Yeonsu-gu'→'Yeonsu'. 떼고 남는 게 짧으면('중구', 'Jung') 그대로 */
export function stripAdmin(name: string): string {
  const s = name.trim();
  const ko = /^(.*[가-힣])[시군구]$/u.exec(s);
  if (ko && [...ko[1]].length >= 2) return ko[1];
  const en = /^(.*[a-z])[\s-]?(?:gu|si|gun)$/i.exec(s);
  if (en && en[1].replace(/[^a-z]/gi, '').length >= 3) return en[1];
  return s;
}
const keyOf = (s: string) => normalize(stripAdmin(s));

/** 시·도 이름의 정식 표기('인천광역시'·'경기도'·'서울시')를 짧은 이름 후보로 */
function sidoCandidates(tok: string): string[] {
  const out = [tok];
  const a = tok.replace(/(특별자치시|특별자치도|특별시|광역시)$/u, '');
  if (a !== tok) out.push(a);
  if (tok.length >= 3 && /[도시]$/u.test(tok)) out.push(tok.slice(0, -1));
  return out;
}
const sidoOfToken = (tok: string) => {
  for (const c of sidoCandidates(tok)) {
    const s = SIDO_BY_NAME.get(c);
    if (s) return s;
  }
  return undefined;
};

/** 시·도 이름 → 짧은 이름 ('충청북' → '충북'). 모르는 이름은 그대로 */
const canonSido = (name: string) => SIDO_BY_NAME.get(name)?.ko ?? name;

/**
 * city_ko '인천 연수' → { sidos:['인천'], gu:'연수' }. '서울' → gu null. '광주·전남' → sidos 둘, gu null.
 * gu 는 시·도 뒤 첫 낱말('부산 사하구 다대포' → '사하구', '제주 제주시 조천' → '제주시'), gus 는 그 낱말이 '·' 로 여럿이면 전부('경북 안동·예천').
 */
export function splitCity(cityKo: string): { sidos: string[]; gu: string | null; gus: string[] } {
  const [head = '', second = ''] = (cityKo ?? '').trim().split(/\s+/);
  if (head === '서귀포') return { sidos: ['제주'], gu: '서귀포', gus: ['서귀포'] };
  const sidos = head.split('·').filter(Boolean).map(canonSido);
  const gus = second.split('·').filter(Boolean);
  return { sidos, gu: gus[0] ?? null, gus };
}

export type RegionHit = {
  kind: 'sido' | 'gu' | 'city' | 'country';
  /** 안정 식별자 ('sido:인천' · 'gu:인천|연수' · 'city:시드니' · 'country:JP') */
  key: string;
  label: string;
  /** 시·도 이름 (kind 가 sido·gu 일 때) — 구 칩·거르기에 쓴다 */
  sido?: string;
  /** 구 키 (kind 가 gu 일 때, 접미사를 뗀 이름) */
  gu?: string;
  races: Race[];
};

type GuInfo = { sido: string; key: string; ko: string; en: string; races: Race[] };
type Group = { label: { ko: string; en: string }; names: { ko: string[]; en: string[] }; races: Race[]; code?: string };
type Dict = {
  sido: Map<string, Race[]>;
  gu: Map<string, GuInfo>; // `${sido}|${key}`
  guBySido: Map<string, GuInfo[]>;
  city: Map<string, Group>; // normalize 한 낱말 → 묶음 (한·영 같이)
  country: Map<string, Group>; // normalize 한 나라 이름 → 묶음
};

const memo = new WeakMap<SearchDoc[], Dict>();

const push = <K,>(m: Map<K, Race[]>, k: K, r: Race) => {
  const l = m.get(k);
  if (l) l.push(r);
  else m.set(k, [r]);
};

function buildDict(index: SearchDoc[]): Dict {
  const d: Dict = { sido: new Map(), gu: new Map(), guBySido: new Map(), city: new Map(), country: new Map() };
  for (const { race: r } of index) {
    if (r.country_code === 'KR') {
      const { sidos, gus } = splitCity(r.city_ko);
      for (const s of sidos) push(d.sido, s, r);
      if (sidos.length !== 1) continue; // 시·도가 둘('광주·전남')이면 구를 알 수 없다
      const en = (cityName(r, 'en') ?? '').split(',')[0].trim();
      for (const g of gus) {
        const key = keyOf(g);
        if (!key) continue;
        // 시·도 이름과 같은 구('제주' 안의 '제주시')는 시·도 전체와 같은 말이라 따로 세지 않는다
        if (key === normalize(sidos[0])) continue;
        const id = `${sidos[0]}|${key}`;
        let info = d.gu.get(id);
        if (!info) {
          info = { sido: sidos[0], key, ko: g, en: gus.length === 1 ? en : '', races: [] };
          d.gu.set(id, info);
          const l = d.guBySido.get(sidos[0]);
          if (l) l.push(info);
          else d.guBySido.set(sidos[0], [info]);
        }
        info.races.push(r);
      }
      continue;
    }
    // 해외: 나라, 그리고 도시 낱말들 ('뉴사우스웨일스 시드니' → 뉴사우스웨일스·시드니·통째)
    const cEn = countryName(r.country_code, r.country_ko, 'en');
    const ckey = normalize(r.country_ko);
    if (ckey) {
      let g = d.country.get(ckey);
      if (!g) {
        g = { label: { ko: r.country_ko, en: cEn }, names: { ko: [ckey], en: [normalize(cEn)] }, races: [], code: r.country_code };
        d.country.set(ckey, g);
        d.country.set(normalize(cEn), g);
      }
      g.races.push(r);
    }
    const enCity = cityName(r, 'en') ?? '';
    const words = [r.city_ko, ...r.city_ko.split(/\s+/), enCity, ...enCity.split(/\s*,\s*/)].map((w) => w.trim()).filter((w) => w.length >= 2);
    for (const w of new Set(words)) {
      const k = normalize(w);
      if (!k || k === ckey || k === normalize(cEn)) continue;
      let g = d.city.get(k);
      if (!g) {
        g = { label: { ko: w, en: /^[\x20-\x7e]+$/.test(w) ? w : '' }, names: { ko: [k], en: [k] }, races: [] };
        d.city.set(k, g);
      }
      if (!g.races.includes(r)) g.races.push(r);
    }
  }
  return d;
}
const dictOf = (index: SearchDoc[]) => {
  let d = memo.get(index);
  if (!d) memo.set(index, (d = buildDict(index)));
  return d;
};

const sidoLabel = (ko: string, lang: Lang) => (lang === 'en' ? provinceName(SIDO_BY_NAME.get(ko)?.id ?? '', 'en') : ko);
const guLabel = (g: GuInfo, lang: Lang) => (lang === 'en' ? g.en || g.ko : g.ko);

/** 시·도 이름을 한 낱말로 읽기: 한국어·(영어 화면이면) 영어 */
function readSido(tok: string, lang: Lang) {
  const s = sidoOfToken(tok);
  if (s) return s;
  if (lang === 'en') {
    const k = normalize(tok);
    return SIDOS.find((x) => normalize(provinceName(x.id, 'en')) === k);
  }
  return undefined;
}

/** 시·도 안에서 구 낱말 하나 읽기 */
function readGu(d: Dict, sido: string, tok: string, lang: Lang): GuInfo | undefined {
  const k = keyOf(tok);
  if (!k) return undefined;
  return d.guBySido.get(sido)?.find((g) => g.key === k || (lang === 'en' && !!g.en && keyOf(g.en) === k));
}

/** 검색어가 지역 이름이면 묶음 후보들 (아니면 []). 접미사 있든 없든 ('연수구'·'연수')·'인천 연수구'·'인천연수구' 도 */
export function regionHits(index: SearchDoc[], q: string, lang: Lang): RegionHit[] {
  const toks = q.trim().split(/\s+/).filter((t) => normalize(t));
  if (!toks.length || toks.length > 3) return [];
  const joined = normalize(toks.join(''));
  if ([...joined].length < 2) return [];
  const d = dictOf(index);
  const out: RegionHit[] = [];
  const seen = new Set<string>();
  const add = (h: RegionHit) => {
    if (!h.races.length || seen.has(h.key)) return;
    seen.add(h.key);
    out.push(h);
  };
  const sidoHit = (s: string): RegionHit => ({ kind: 'sido', key: `sido:${s}`, label: sidoLabel(s, lang), sido: s, races: d.sido.get(s) ?? [] });
  const guHit = (g: GuInfo): RegionHit => ({
    kind: 'gu',
    key: `gu:${g.sido}|${g.key}`,
    label: `${sidoLabel(g.sido, lang)} ${guLabel(g, lang)}`,
    sido: g.sido,
    gu: g.key,
    races: g.races,
  });

  // ── 국내 ──
  if (toks.length <= 2) {
    if (toks.length === 1) {
      const s = readSido(toks[0], lang);
      if (s) add(sidoHit(s.ko));
      // 구 이름 ('연수구' → 어느 시·도든 연수), '광주' 처럼 시·도 이름과 겹쳐도 다른 시·도의 구면 따로
      for (const g of d.gu.values()) if (readGu(d, g.sido, toks[0], lang) === g) add(guHit(g));
      // 붙여 쓴 '인천연수구'
      for (const sd of SIDOS)
        for (const n of [sd.ko, ...sd.alias, ...(lang === 'en' ? [provinceName(sd.id, 'en')] : [])]) {
          const nk = normalize(n);
          if (joined.length > nk.length && joined.startsWith(nk)) {
            const g = readGu(d, sd.ko, joined.slice(nk.length), lang);
            if (g) add(guHit(g));
          }
        }
    } else {
      for (const [a, b] of [[toks[0], toks[1]], [toks[1], toks[0]]]) {
        const s = readSido(a, lang);
        const g = s && readGu(d, s.ko, b, lang);
        if (g) add(guHit(g));
      }
    }
  }
  if (out.length) return out.sort((a, b) => Number(b.kind === 'sido') - Number(a.kind === 'sido') || b.races.length - a.races.length);

  // ── 해외: 나라 / 도시 / '나라 도시' ──
  const okName = (k: string) => lang === 'en' || /\P{ASCII}/u.test(k);
  const names = (g: Group) => (lang === 'en' ? g.label.en || g.label.ko : g.label.ko);
  const country = d.country.get(joined);
  if (country && okName(joined)) add({ kind: 'country', key: `country:${country.code}`, label: names(country), races: country.races });
  const city = d.city.get(joined);
  if (city && okName(joined)) add({ kind: 'city', key: `city:${joined}`, label: names(city), races: city.races });
  if (toks.length === 2) {
    for (const [a, b] of [[toks[0], toks[1]], [toks[1], toks[0]]]) {
      const c = d.country.get(normalize(a));
      const g = d.city.get(normalize(b));
      if (!c || !g || !okName(normalize(a)) || !okName(normalize(b))) continue;
      add({ kind: 'city', key: `city:${normalize(b)}@${c.code}`, label: `${names(c)} ${names(g)}`, races: g.races.filter((r) => r.country_code === c.code) });
    }
  }
  return out;
}

/** 시·도 아래 시·군·구 칩: 많은 순(동수는 가나다). 시·도 하나뿐인 대회는 어느 칩에도 안 들어간다. gu 는 inGu 에 넘기는 키 */
export function guChips(races: Race[], sido: string, lang: Lang): { gu: string; label: string; count: number }[] {
  const s = canonSido(sido);
  const m = new Map<string, { gu: string; ko: Map<string, number>; en: string; count: number }>();
  for (const r of races) {
    if (r.country_code !== 'KR') continue;
    const sp = splitCity(r.city_ko);
    if (sp.sidos.length !== 1 || sp.sidos[0] !== s) continue;
    const en = sp.gus.length === 1 ? (cityName(r, 'en') ?? '').split(',')[0].trim() : '';
    for (const g of sp.gus) {
      const gu = keyOf(g);
      if (!gu || normalize(g) === normalize(s)) continue; // '제주 제주' 처럼 시·도와 같은 이름은 시·도 전체와 같다 ('제주시' 는 칩)
      let c = m.get(gu);
      if (!c) m.set(gu, (c = { gu, ko: new Map(), en: '', count: 0 }));
      c.count++;
      c.ko.set(g, (c.ko.get(g) ?? 0) + 1);
      if (en && !c.en) c.en = en;
    }
  }
  const label = (c: { ko: Map<string, number>; en: string }) =>
    lang === 'en' && c.en ? c.en : [...c.ko].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ko'))[0][0];
  return [...m.values()]
    .map((c) => ({ gu: c.gu, label: label(c), count: c.count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, lang === 'en' ? 'en' : 'ko'));
}

/** 시·도·구가 같은 국내 대회인가 (gu 는 guChips 의 gu 키) */
export function inGu(race: Race, sido: string, gu: string): boolean {
  if (race.country_code !== 'KR') return false;
  const sp = splitCity(race.city_ko);
  return sp.sidos.length === 1 && sp.sidos[0] === canonSido(sido) && sp.gus.some((g) => keyOf(g) === gu);
}
