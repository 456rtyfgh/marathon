import type { Race } from './types';
import { ALIASES, MAJOR_TERMS, ONE_WAY, REGION_TERMS, TAILS } from './aliases.ts';
import { convertKeyboard } from './keyboard.ts';
import { SUBREGION_NAME, subOf } from './subregions.ts';
import { cityName, countryName, subregionName } from '../i18n/names.ts';
import type { Lang } from '../i18n/lang.ts';

/*
 * 대회 검색. 1단계(정확): 빈칸·가운뎃점·특수문자·대소문자 무시, 다른 표기 사전, 꼬리말(마라톤·대회·하프…) 떼기,
 * 쓰는 중인 끝 글자(자모). 1단계 결과가 0개일 때만 2단계(오타): 자모 단위 근사 부분 일치.
 * Node 로 바로 돌리는 검사(scripts/search-check.mjs)가 이 파일을 그대로 읽으므로 import 는 확장자 .ts 를 붙인다.
 */

/** NFC·소문자, 악센트 제거, 빈칸·가운뎃점·특수문자 제거. 숫자 뒤 km 는 k ('10km' = '10K') */
export function normalize(s: string): string {
  // NFKD 가 아니라 NFD — NFKD 는 입력 중 자모(ㅌ ㅁ …)를 조합용 자모로 바꿔 '쓰는 중인 끝 글자' 비교가 깨진다
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .replace(/(\d)km/g, '$1k');
}

// 초성·중성·종성 (겹모음·겹받침은 낱자로 풀어 둔다 — 자판으로 치는 순서와 같게)
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅗㅏ', 'ㅗㅐ', 'ㅗㅣ', 'ㅛ', 'ㅜ', 'ㅜㅓ', 'ㅜㅔ', 'ㅜㅣ', 'ㅠ', 'ㅡ', 'ㅡㅣ', 'ㅣ'];
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄱㅅ', 'ㄴ', 'ㄴㅈ', 'ㄴㅎ', 'ㄷ', 'ㄹ', 'ㄹㄱ', 'ㄹㅁ', 'ㄹㅂ', 'ㄹㅅ', 'ㄹㅌ', 'ㄹㅍ', 'ㄹㅎ', 'ㅁ', 'ㅂ', 'ㅂㅅ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
// 따로 친 겹자모 (ㄳ ㅘ …) 도 낱자로
const COMPAT: Record<string, string> = {
  ㄳ: 'ㄱㅅ', ㄵ: 'ㄴㅈ', ㄶ: 'ㄴㅎ', ㄺ: 'ㄹㄱ', ㄻ: 'ㄹㅁ', ㄼ: 'ㄹㅂ', ㄽ: 'ㄹㅅ', ㄾ: 'ㄹㅌ', ㄿ: 'ㄹㅍ', ㅀ: 'ㄹㅎ', ㅄ: 'ㅂㅅ',
  ㅘ: 'ㅗㅏ', ㅙ: 'ㅗㅐ', ㅚ: 'ㅗㅣ', ㅝ: 'ㅜㅓ', ㅞ: 'ㅜㅔ', ㅟ: 'ㅜㅣ', ㅢ: 'ㅡㅣ',
};

/** 한글 음절 → 초·중·종성 낱자. 그 밖 글자는 그대로 */
export function toJamo(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c >= 0 && c < 11172) out += CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28];
    else out += COMPAT[ch] ?? ch;
  }
  return out;
}

export type SearchDoc = {
  race: Race;
  /** 정확 비교용: 검색 대상 칸 전부를 normalize 해서 | 로 이음 (칸을 넘는 일치가 없게) */
  exact: string;
  /** 오타 비교용: 이름·영문 이름·도시·나라·주/도 이름 각각 normalize+toJamo */
  fields: string[];
  /** exact 의 자모 (쓰는 중인 끝 글자 비교용) */
  exactJamo: string;
  /** 국내 대회의 시·도 약칭들 (city_ko 앞 토큰, '광주·전남' 은 둘). 해외는 빈 목록. 지역어(경상도 …) 비교용 */
  regions: string[];
  /** 해외 세계 6대 마라톤 (is_major 이고 국내가 아님) — '세계6대' 비교용 */
  major: boolean;
};

const SEP = '|';

/** lang 'en' 이면 영어 도시·나라·주 이름과 영어 메모도 찾는다 (한국어 화면 결과는 그대로) */
export function buildIndex(races: Race[], lang: Lang = 'ko'): SearchDoc[] {
  return races.map((r) => {
    const sub = subOf(r);
    const subName = sub ? SUBREGION_NAME.get(sub) ?? '' : '';
    const enNames =
      lang === 'en' ? [cityName(r, 'en'), countryName(r.country_code, r.country_ko, 'en'), sub ? subregionName(sub, 'en') : ''] : [];
    const main = [r.name_ko, r.name_en, r.city_ko, r.country_ko, subName, ...enNames].map((x) => normalize(x ?? '')).filter(Boolean);
    const notes = lang === 'en' ? [normalize(r.notes_ko ?? ''), normalize(r.notes_en ?? '')] : [normalize(r.notes_ko ?? '')];
    // 기념품 글: 공식 안내에 있다고 확인된(listed) 대회만. 영어 화면은 영어 글도
    const souvenir =
      r.souvenir_status === 'listed'
        ? (lang === 'en' ? [r.souvenir_ko, r.souvenir_en] : [r.souvenir_ko]).map((x) => normalize(x ?? '')).filter(Boolean)
        : [];
    const exact = [...main, ...notes, ...souvenir, ...r.distances.map(normalize)].join(SEP);
    const regions = r.country_code === 'KR' ? (r.city_ko ?? '').trim().split(/\s+/)[0].split('·').filter(Boolean) : [];
    return { race: r, exact, fields: main.map(toJamo), exactJamo: toJamo(exact), regions, major: !!r.is_major && r.country_code !== 'KR' };
  });
}

/** 다른 표기로 바꾼 것들 (원래 말 포함) */
function aliasVariants(term: string): string[] {
  const out = [term];
  for (const group of ALIASES)
    for (const a of group) {
      if (!term.includes(a)) continue;
      for (const b of group) if (b !== a && !ONE_WAY.has(b)) out.push(term.replace(a, b));
    }
  return out;
}

/** 꼬리말을 뗀 핵심 (남는 게 2글자 미만이면 그대로) */
function stripTail(term: string): string {
  for (const t of TAILS) if (term.endsWith(t) && term.length - t.length >= 2) return term.slice(0, -t.length);
  return term;
}

const isJamo = (ch: string) => ch >= 'ㄱ' && ch <= 'ㅣ';
/** 끝 글자가 자모이거나 받침이 있으면 아직 쓰는 중일 수 있다 (마랕 → 마라톤) */
const maybeTyping = (term: string) => {
  const last = term.slice(-1);
  const c = last.charCodeAt(0) - 0xac00;
  return isJamo(last) || (c >= 0 && c < 11172 && c % 28 !== 0);
};

type Term = { plain: string[]; jamo: string[]; region: ReadonlySet<string> | null; major: boolean };

/** 낱말 하나를 맞춰 볼 변형들: 원래·다른 표기, strip 이면 꼬리말 뗀 핵심·그 다른 표기. 지역어·세계6대는 데이터의 시·도/is_major 로도 맞춘다 */
function termOf(word: string, strip: boolean): Term {
  const core = strip ? stripTail(word) : word;
  const plain = aliasVariants(core);
  // 지역어·세계6대는 꼬리말을 뗀 모양으로 본다 ('세계 6대 마라톤' 은 낱말이 여럿이라 꼬리말 떼기 단계가 없다)
  const key = stripTail(core);
  const region = Object.hasOwn(REGION_TERMS, key) ? new Set(REGION_TERMS[key]) : null;
  return { plain, jamo: plain.filter(maybeTyping).map(toJamo), region, major: MAJOR_TERMS.has(key) };
}

/** typing 이 true 면 쓰는 중인 끝 글자(자모) 일치도 본다 */
const hit = (d: SearchDoc, t: Term, typing: boolean) =>
  t.plain.some((v) => d.exact.includes(v)) ||
  (typing && t.jamo.some((v) => d.exactJamo.includes(v))) ||
  (t.region !== null && d.regions.some((x) => t.region!.has(x))) ||
  (t.major && d.major);

/** 자모 단위 근사 부분 일치 (Sellers): 검색어 p 와 가장 가까운 hay 의 부분 문자열까지의 편집 거리 */
function approxDistance(p: string, hay: string, col: Int32Array): number {
  const m = p.length;
  for (let i = 0; i <= m; i++) col[i] = i;
  let best = m;
  for (let j = 0; j < hay.length; j++) {
    const h = hay.charCodeAt(j);
    let diag = 0; // col[i-1] 의 이전 값 (부분 문자열이라 시작은 언제나 0)
    col[0] = 0;
    for (let i = 1; i <= m; i++) {
      const up = col[i];
      const v = Math.min(up + 1, col[i - 1] + 1, diag + (p.charCodeAt(i - 1) === h ? 0 : 1));
      diag = up;
      col[i] = v;
    }
    if (col[m] < best) best = col[m];
    if (best === 0) break;
  }
  return best;
}

// 오타 거리는 2단계 검색과 가까운 대회 제안이 같은 값을 쓰므로 마지막 한 번 것을 기억해 둔다
let memo: { index: SearchDoc[]; p: string; dist: Int32Array } | null = null;

function distances(index: SearchDoc[], p: string): Int32Array {
  if (memo && memo.index === index && memo.p === p) return memo.dist;
  const dist = new Int32Array(index.length);
  const col = new Int32Array(p.length + 1);
  index.forEach((d, k) => {
    let best = p.length;
    for (const f of d.fields) {
      best = Math.min(best, approxDistance(p, f, col));
      if (best === 0) break;
    }
    dist[k] = best;
  });
  memo = { index, p, dist };
  return dist;
}

/** 오타 비교에 쓰는 검색어 자모 (빈칸 뺀 전체에서 꼬리말을 뗀 핵심) */
const fuzzyKey = (q: string) => toJamo(stripTail(normalize(q)));
/** 자모 길이에 따른 오타 허용 거리: 6개 미만은 오타 안 봄 · 12개 미만 1 · 그 이상 2 */
const typoLimit = (n: number) => (n < 6 ? 0 : n < 12 ? 1 : 2);

/** 반복을 줄이고 남은 말이 검색어로 쓸 만한 길이인가: 한글 두 글자 이상, 또는 영문·숫자 3글자 이상 (낱자모는 세지 않는다) */
const longEnough = (n: string) => (n.match(/[가-힣]/g) ?? []).length >= 2 || n.replace(/[ㄱ-ㅣ가-힣]/g, '').length >= 3;

/**
 * 반복 정리: 같은 글자 3번 이상 연속(서울울울 → 서울, ㅋㅋㅋㅋ → ㅋㅋ, 숫자 제외), 낱말 전체가 같은 덩어리의 반복(경주경주 → 경주),
 * 같은 낱말 반복(서울 서울 → 서울). 바뀐 게 없으면 null.
 * 줄이고 남은 말이 짧은 조각이면 그 낱말은 줄이지 않는다 — 조각은 아무 이름에나 부분 일치로 걸린다
 * (하하하 → '하' 1527개, 1010 → '10' 1521개, nana → 'na' 395개, ㅇㅇㅇ → 'ㅇㅇ' 157개).
 */
function cleanQuery(q: string): string | null {
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of q.split(/\s+/)) {
    let w = raw.replace(/([^\d\s])\1{2,}/gu, (_m, c: string) => (c >= '가' && c <= '힣' ? c : c + c));
    const n = normalize(w);
    for (let len = 2; len <= n.length / 2; len++)
      if (n.length % len === 0 && n === n.slice(0, len).repeat(n.length / len)) {
        w = n.slice(0, len);
        break;
      }
    if (w !== raw && !longEnough(normalize(w))) w = raw;
    const key = normalize(w);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    words.push(w);
  }
  const out = words.join(' ');
  return normalize(out) === normalize(q) && out.split(' ').length === q.trim().split(/\s+/).length ? null : out;
}

/**
 * 1단계(정확). 정확히 맞는 것이 있으면 그것만, 없을 때만 꼬리말을 떼고 다시 ('도쿄마라톤' 은 도쿄 마라톤만, '대구마라톤' 은 대구 대회들).
 * 쓰는 중인 끝 글자(자모) 일치는 글자 그대로 맞는 대회가 하나도 없을 때만 더한다 ('하남' 이 '하나마키' 까지, '런' 이 '러닝' 까지 퍼지지 않게).
 */
function exactSearch(index: SearchDoc[], q: string): Set<Race> {
  const out = new Set<Race>();
  const words = q.split(/\s+/).map(normalize).filter(Boolean);
  const whole = words.join('');
  if (!whole) return out;
  for (const strip of [false, true]) {
    // 붙여서 맞춰 보기 (꼬리말 떼기는 낱말 하나일 때만 — '울산 하프' 의 하프는 거리로 좁히는 말)
    const one = !strip || words.length <= 1 ? termOf(whole, strip) : null;
    // 빈칸으로 나뉜 검색어는 낱말마다 모두 맞으면 맞음
    const each = words.length > 1 ? words.map((w) => termOf(w, strip)) : [];
    for (const typing of [false, true]) {
      for (const d of index) if ((one && hit(d, one, typing)) || (each.length && each.every((t) => hit(d, t, typing)))) out.add(d.race);
      if (out.size) return out;
    }
  }
  return out;
}

/** 한글 두 글자 이하 (받침 두 개면 자모 6개라 오타 1개를 허용하게 되지만, 두 글자 지명은 한 자모 차이가 곧 다른 곳이다: 진천↔인천, 통영↔(마라)톤영(종)) */
const shortHangul = (q: string) => /^[가-힣]{1,2}$/.test(stripTail(normalize(q)));

/** 2단계(오타): 자모 단위 근사 부분 일치 */
function typoSearch(index: SearchDoc[], q: string): Set<Race> {
  const out = new Set<Race>();
  if (shortHangul(q)) return out;
  const p = fuzzyKey(q);
  const limit = typoLimit(p.length);
  if (!limit) return out;
  const dist = distances(index, p);
  index.forEach((d, k) => {
    if (dist[k] <= limit) out.add(d.race);
  });
  return out;
}

type Staged = { hits: Set<Race>; stage: 'all' | 'exact' | 'typo' | 'none' };

function stagedSearch(index: SearchDoc[], q: string): Staged {
  // 특수문자만 친 검색어 ('-' '(' …) 는 빈 검색어와 같다 — 전부
  if (!normalize(q)) return { hits: new Set(index.map((d) => d.race)), stage: 'all' };
  let hits = exactSearch(index, q);
  if (hits.size) return { hits, stage: 'exact' };
  // 반복 글자·중복 낱말은 원래 말로 못 찾았을 때만 정리한다 (이름에 같은 글자가 거듭 들어간 대회가 있을 수 있다)
  const cleaned = cleanQuery(q);
  if (cleaned !== null) {
    hits = exactSearch(index, cleaned);
    if (hits.size) return { hits, stage: 'exact' };
  }
  hits = typoSearch(index, cleaned ?? q);
  return { hits, stage: hits.size ? 'typo' : 'none' };
}

export function searchRaces(index: SearchDoc[], q: string): Set<Race> {
  return stagedSearch(index, q).hits;
}

/** 한/영 자판 실수로 바꾼 검색어 */
export type KeyboardFix = { query: string; kind: 'en2ko' | 'ko2en' };

export type SearchOutcome = {
  /** 화면에 쓸 결과 (원래 검색 또는 변환 검색의 것) */
  hits: Set<Race>;
  /** 변환 검색의 결과를 쓴 경우에만. 쓰지 않았으면 null */
  fixed: KeyboardFix | null;
};

/** 자판 변환 후보 (두벌식, 최대 2개: 영→한·한→영). 변환할 게 없으면 [] */
export function keyboardFixes(q: string): KeyboardFix[] {
  return convertKeyboard(q);
}

const LONE_JAMO = /[ㄱ-ㅣ]/;
/**
 * 바꾼 말이 검색어로 쓸 만한가. 짧은 조각은 아무 이름에나 부분 일치로 걸린다 (ㅜㅜ → 'nn' 128개, qm → '브' 127개, hz → 'ㅗㅋ' 154개).
 * 영→한: 친 영문이 3글자 이상이고 바뀐 한글이 온전한 글자만 (낱자모가 남으면 한글로 친 게 아니다).
 * 한→영: 바뀐 영문이 4글자 이상, 또는 3글자이면서 친 말에 낱자모가 있을 때 (영문을 한글 자판으로 치면 거의 늘 낱자모가 생긴다 — ㅡㅠㅜ → mbn).
 * 한 글자만 거듭 친 것(ㅠㅠㅠ → 'bbb', ㅋㅋㅋㅋ → 'zzzz')은 영문을 친 게 아니다.
 */
function usableFix(q: string, fix: KeyboardFix): boolean {
  const to = normalize(fix.query);
  if (fix.kind === 'en2ko') return normalize(q).length >= 3 && !LONE_JAMO.test(fix.query);
  if (/^(.)\1*$/u.test(to)) return false;
  return to.length >= 4 || (to.length === 3 && LONE_JAMO.test(q));
}

/**
 * 원래 검색 + 자판 변환 검색. 변환 결과는 원래보다 나을 때만 쓴다:
 * 원래 결과가 정확 단계로 나왔으면 변환 검색은 하지 않는다. 원래가 0개이거나 오타 단계 결과일 때,
 * 변환 문자열이 정확 단계로 1개 이상 맞으면 그 결과를 쓴다 (오타 단계로만 맞는 변환은 인정하지 않는다 — 'newbq' 같은 말이 엉뚱한 대회에 걸리지 않게).
 * 대문자는 쌍자음으로 바꾸지만(R → ㄲ), 휴대폰의 첫 글자 자동 대문자나 Caps Lock 으로 생긴 대문자일 수 있다
 * (Rhvm → '꼬프' 0개) — 친 그대로 못 찾으면 소문자로 바꾼 것도 본다.
 */
export function searchWithFixes(index: SearchDoc[], q: string): SearchOutcome {
  const base = stagedSearch(index, q);
  if (base.stage === 'exact' || base.stage === 'all') return { hits: base.hits, fixed: null };
  const fixes = keyboardFixes(q);
  const lower = q.toLowerCase();
  if (lower !== q) for (const f of keyboardFixes(lower)) if (f.kind === 'en2ko' && !fixes.some((x) => x.query === f.query)) fixes.push(f);
  for (const fix of fixes) {
    if (!usableFix(q, fix)) continue;
    const hits = exactSearch(index, fix.query);
    if (hits.size) return { hits, fixed: fix };
  }
  return { hits: base.hits, fixed: null };
}

/**
 * 결과 0개일 때 '혹시 이 대회인가요?': 오타 거리가 자모 길이의 1/4 이하인 것 중 가까운 순 n개 (동점은 대회일 빠른 순).
 * 1/3 이면 'qwerty' 같은 아무 영문 6글자도 영문 이름 어딘가에 거리 2 로 걸린다.
 */
export function suggestRaces(index: SearchDoc[], q: string, n = 3): Race[] {
  const p = fuzzyKey(cleanQuery(q) ?? q);
  const limit = Math.floor(p.length / 4);
  if (!limit) return [];
  const dist = distances(index, p);
  return index
    .map((d, k) => ({ race: d.race, d: dist[k] }))
    .filter((x) => x.d <= limit)
    .sort((a, b) => a.d - b.d || a.race.race_date.localeCompare(b.race.race_date))
    .slice(0, n)
    .map((x) => x.race);
}
