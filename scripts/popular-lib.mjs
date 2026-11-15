// 인기 검색어 거르기 (순수 함수). scripts/snapshot.mjs 가 쓰고 scripts/popular-test.mjs 가 검사한다.
// 사용자가 직접 친 글이라 개인정보·욕설·URL·숫자만인 것은 빼고, 같은 말(normalize 기준)은 합치고,
// 현재 데이터로 결과가 1개 이상인 것만 남긴다.
import { normalize } from '../src/lib/search.ts';

export const MAX_TERMS = 100;
export const MAX_LEN = 20;

// 욕설·비속어·성인 (빈칸을 지운 소문자 글자에 포함되면 뺀다)
const BAD = [
  '씨발', '시발', '씨바', '씹', '병신', '븅신', '좆', '존나', '졸라', '개새', '새끼', '지랄', '염병', '꺼져', '엿먹', '미친', '닥쳐', '또라이',
  '섹스', '야동', '포르노', '창녀', '걸레',
  'fuck', 'shit', 'bitch', 'porn', 'pussy', 'asshole', 'nigg',
];

const EMAIL = /@/;
const URL_LIKE = /https?:|www\.|:\/\/|\.(com|net|org|co|kr|io|me|app|xyz|info|biz)(\/|$|\b)/i;
// 전화번호·주민번호 꼴: 숫자가 8개 이상이거나 하이픈 묶음
const DIGITS = (s) => (s.match(/\d/g) ?? []).length;
const PHONE = /(\d{2,4}[-. ]\d{3,4}[-. ]\d{4})|(\d{6}[-. ]?[1-4]\d{6})/;

/** 이 검색어를 인기 목록에 올려도 되나 (개인정보·욕설·URL·숫자만·길이) */
export function isSafeTerm(raw) {
  if (typeof raw !== 'string') return false;
  const term = raw.trim();
  if (!term || term.length > MAX_LEN) return false;
  if (EMAIL.test(term) || URL_LIKE.test(term) || PHONE.test(term) || DIGITS(term) >= 8) return false;
  if (!/\p{L}/u.test(term)) return false; // 숫자·기호만
  const flat = term.toLowerCase().replace(/\s+/g, '');
  if (BAD.some((b) => flat.includes(b))) return false;
  return true;
}

/**
 * rows: [{ term, n }] (RPC 결과). hasResults(term) 은 현재 데이터로 결과가 1개 이상인지.
 * 같은 말(normalize 후 같은 것)은 n 을 합치고 가장 많이 친 표기를 쓴다. n 내림차순 최대 MAX_TERMS 개.
 */
export function filterPopular(rows, hasResults) {
  const groups = new Map(); // normalize → { term, best, n }
  for (const row of Array.isArray(rows) ? rows : []) {
    const n = Number(row?.n);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (!isSafeTerm(row?.term)) continue;
    const term = row.term.trim();
    const key = normalize(term);
    if (!key) continue;
    const g = groups.get(key);
    if (!g) groups.set(key, { term, best: n, n });
    else {
      g.n += n;
      if (n > g.best) {
        g.best = n;
        g.term = term;
      }
    }
  }
  return [...groups.values()]
    .sort((a, b) => b.n - a.n || a.term.localeCompare(b.term))
    .filter((g) => hasResults(g.term))
    .slice(0, MAX_TERMS)
    .map((g) => ({ term: g.term, n: g.n }));
}

/** public/popular-searches.json 에 쓸 모양 */
export function popularFile(terms, source, now = new Date()) {
  return { generated_at: now.toISOString(), days: 60, source, terms };
}
