import type { Race } from './types';
import { ALIASES, TAILS } from './aliases.ts';
import { SUBREGION_NAME, subOf } from './subregions.ts';

/*
 * 대회 검색. 1단계(정확): 빈칸·가운뎃점·특수문자·대소문자 무시, 다른 표기 사전, 꼬리말(마라톤·대회·하프…) 떼기,
 * 쓰는 중인 끝 글자(자모). 1단계 결과가 0개일 때만 2단계(오타): 자모 단위 근사 부분 일치.
 * Node 로 바로 돌리는 검사(scripts/search-check.mjs)가 이 파일을 그대로 읽으므로 import 는 확장자 .ts 를 붙인다.
 */

/** NFC·소문자, 악센트 제거, 빈칸·가운뎃점·특수문자 제거. 숫자 뒤 km 는 k ('10km' = '10K') */
export function normalize(s: string): string {
  return s
    .normalize('NFKD')
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
};

const SEP = '|';

export function buildIndex(races: Race[]): SearchDoc[] {
  return races.map((r) => {
    const sub = subOf(r);
    const subName = sub ? SUBREGION_NAME.get(sub) ?? '' : '';
    const main = [r.name_ko, r.name_en, r.city_ko, r.country_ko, subName].map((x) => normalize(x ?? '')).filter(Boolean);
    const exact = [...main, normalize(r.notes_ko ?? ''), ...r.distances.map(normalize)].join(SEP);
    return { race: r, exact, fields: main.map(toJamo), exactJamo: toJamo(exact) };
  });
}

/** 다른 표기로 바꾼 것들 (원래 말 포함) */
function aliasVariants(term: string): string[] {
  const out = [term];
  for (const group of ALIASES)
    for (const a of group) {
      if (!term.includes(a)) continue;
      for (const b of group) if (b !== a) out.push(term.replace(a, b));
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

type Term = { plain: string[]; jamo: string[] };

/** 낱말 하나를 맞춰 볼 변형들: 원래·다른 표기, strip 이면 꼬리말 뗀 핵심·그 다른 표기 */
function termOf(word: string, strip: boolean): Term {
  const plain = aliasVariants(strip ? stripTail(word) : word);
  return { plain, jamo: plain.filter(maybeTyping).map(toJamo) };
}

const hit = (d: SearchDoc, t: Term) => t.plain.some((v) => d.exact.includes(v)) || t.jamo.some((v) => d.exactJamo.includes(v));

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

export function searchRaces(index: SearchDoc[], q: string): Set<Race> {
  const out = new Set<Race>();
  const whole = normalize(q);
  if (!whole) return out;
  const words = q.split(/\s+/).map(normalize).filter(Boolean);
  // 정확히 맞는 것이 있으면 그것만, 없을 때만 꼬리말을 떼고 다시 ('도쿄마라톤' 은 도쿄 마라톤만, '대구마라톤' 은 대구 대회들)
  for (const strip of [false, true]) {
    // 붙여서 맞춰 보기 (꼬리말 떼기는 낱말 하나일 때만 — '울산 하프' 의 하프는 거리로 좁히는 말)
    const one = !strip || words.length <= 1 ? termOf(whole, strip) : null;
    // 빈칸으로 나뉜 검색어는 낱말마다 모두 맞으면 맞음
    const each = words.length > 1 ? words.map((w) => termOf(w, strip)) : [];
    for (const d of index) if ((one && hit(d, one)) || (each.length && each.every((t) => hit(d, t)))) out.add(d.race);
    if (out.size) return out;
  }

  const p = fuzzyKey(q);
  const limit = typoLimit(p.length);
  if (!limit) return out;
  const dist = distances(index, p);
  index.forEach((d, k) => {
    if (dist[k] <= limit) out.add(d.race);
  });
  return out;
}

/**
 * 결과 0개일 때 '혹시 이 대회인가요?': 오타 거리가 자모 길이의 1/4 이하인 것 중 가까운 순 n개 (동점은 대회일 빠른 순).
 * 1/3 이면 'qwerty' 같은 아무 영문 6글자도 영문 이름 어딘가에 거리 2 로 걸린다.
 */
export function suggestRaces(index: SearchDoc[], q: string, n = 3): Race[] {
  const p = fuzzyKey(q);
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
