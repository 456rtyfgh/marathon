/*
 * 한/영 자판 실수 변환 (두벌식). 영문으로 친 한글(rhvm → 고프)과 한글로 친 영문(ㅡㅠㅜ → mbn).
 * 순수 함수, 의존성 없음. Node 로 바로 돌리는 검사가 읽으므로 import 가 없다.
 */

// 영문 키 → 한글 자모 (shift 를 누르면 쌍자음·ㅒㅖ)
const EN_TO_JAMO: Record<string, string> = {
  q: 'ㅂ', w: 'ㅈ', e: 'ㄷ', r: 'ㄱ', t: 'ㅅ', y: 'ㅛ', u: 'ㅕ', i: 'ㅑ', o: 'ㅐ', p: 'ㅔ',
  a: 'ㅁ', s: 'ㄴ', d: 'ㅇ', f: 'ㄹ', g: 'ㅎ', h: 'ㅗ', j: 'ㅓ', k: 'ㅏ', l: 'ㅣ',
  z: 'ㅋ', x: 'ㅌ', c: 'ㅊ', v: 'ㅍ', b: 'ㅠ', n: 'ㅜ', m: 'ㅡ',
  Q: 'ㅃ', W: 'ㅉ', E: 'ㄸ', R: 'ㄲ', T: 'ㅆ', O: 'ㅒ', P: 'ㅖ',
};
// 나머지 대문자는 소문자와 같다 (shift 를 눌러도 같은 자모)
for (const k of Object.keys(EN_TO_JAMO)) if (k >= 'a' && k <= 'z' && !(k.toUpperCase() in EN_TO_JAMO)) EN_TO_JAMO[k.toUpperCase()] = EN_TO_JAMO[k];

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];

const VOWEL_PAIR: Record<string, string> = { ㅗㅏ: 'ㅘ', ㅗㅐ: 'ㅙ', ㅗㅣ: 'ㅚ', ㅜㅓ: 'ㅝ', ㅜㅔ: 'ㅞ', ㅜㅣ: 'ㅟ', ㅡㅣ: 'ㅢ' };
const JONG_PAIR: Record<string, string> = {
  ㄱㅅ: 'ㄳ', ㄴㅈ: 'ㄵ', ㄴㅎ: 'ㄶ', ㄹㄱ: 'ㄺ', ㄹㅁ: 'ㄻ', ㄹㅂ: 'ㄼ', ㄹㅅ: 'ㄽ', ㄹㅌ: 'ㄾ', ㄹㅍ: 'ㄿ', ㄹㅎ: 'ㅀ', ㅂㅅ: 'ㅄ',
};
// 겹받침을 둘로 쪼갤 때 (뒤 자음은 다음 글자의 초성이 된다)
const JONG_SPLIT: Record<string, [string, string]> = Object.fromEntries(Object.entries(JONG_PAIR).map(([k, v]) => [v, [k[0], k[1]]]));

const isVowel = (j: string) => JUNG.includes(j);
const isCons = (j: string) => CHO.includes(j) || j in JONG_SPLIT;
/** 이 자음을 받침으로 쓸 수 있나 (ㄸ ㅃ ㅉ 는 받침이 안 된다) */
const canJong = (j: string) => JONG.includes(j);

type Syl = { cho: string; jung: string; jong: string };

function flush(s: Syl): string {
  if (!s.cho && !s.jung) return '';
  if (!s.jung) return s.cho; // 모음 없이 자음만
  if (!s.cho) return s.jung; // 모음만
  const c = 0xac00 + (CHO.indexOf(s.cho) * 21 + JUNG.indexOf(s.jung)) * 28 + JONG.indexOf(s.jong);
  return String.fromCharCode(c);
}

/** 자모 배열 → 글자 (두벌식 조합: 겹모음·겹받침, 받침이 다음 모음 앞에서 초성으로 넘어감) */
function compose(jamo: string[]): string {
  let out = '';
  let s: Syl = { cho: '', jung: '', jong: '' };
  const next = () => {
    out += flush(s);
    s = { cho: '', jung: '', jong: '' };
  };
  for (const j of jamo) {
    if (isVowel(j)) {
      if (s.jong) {
        // 받침이 다음 글자의 초성으로 넘어간다 (겹받침이면 뒤쪽만)
        const split = JONG_SPLIT[s.jong];
        const moved = split ? split[1] : s.jong;
        s.jong = split ? split[0] : '';
        next();
        s.cho = moved;
        s.jung = j;
      } else if (s.jung) {
        const pair = VOWEL_PAIR[s.jung + j];
        if (pair) s.jung = pair;
        else {
          next();
          s.jung = j;
        }
      } else if (s.cho) s.jung = j;
      else s.jung = j;
    } else if (isCons(j)) {
      if (!s.cho && !s.jung) s.cho = j;
      else if (!s.jung) {
        next(); // 자음 두 개 연속 (ㄷㅈ …): 앞 것은 홀로
        s.cho = j;
      } else if (!s.jong) {
        if (s.cho && canJong(j)) s.jong = j; // 모음만 있던 글자에는 받침이 안 붙는다
        else {
          next();
          s.cho = j;
        }
      } else {
        const pair = JONG_PAIR[s.jong + j];
        if (pair) s.jong = pair;
        else {
          next();
          s.cho = j;
        }
      }
    } else {
      next();
      out += j;
    }
  }
  next();
  return out;
}

/** 영문(두벌식 위치) → 한글. 영문자가 아닌 글자는 그대로 두고 거기서 글자 조합을 끊는다 */
export function enToKo(s: string): string {
  let out = '';
  let run: string[] = [];
  const end = () => {
    if (run.length) out += compose(run);
    run = [];
  };
  for (const ch of s) {
    const j = EN_TO_JAMO[ch];
    if (j) run.push(j);
    else {
      end();
      out += ch;
    }
  }
  end();
  return out;
}

// 자모 → 영문 키 (겹자모는 키 둘)
const JAMO_TO_EN: Record<string, string> = {};
// 소문자 키 우선, 소문자로 칠 수 없는 자모(ㅃ ㅉ ㄸ ㄲ ㅆ ㅒ ㅖ)만 대문자
for (const [k, v] of Object.entries(EN_TO_JAMO)) if (k >= 'a' && k <= 'z') JAMO_TO_EN[v] = k;
for (const [k, v] of Object.entries(EN_TO_JAMO)) if (!(v in JAMO_TO_EN)) JAMO_TO_EN[v] = k;
for (const [pair, one] of Object.entries(VOWEL_PAIR)) JAMO_TO_EN[one] = JAMO_TO_EN[pair[0]] + JAMO_TO_EN[pair[1]];
for (const [pair, one] of Object.entries(JONG_PAIR)) JAMO_TO_EN[one] = JAMO_TO_EN[pair[0]] + JAMO_TO_EN[pair[1]];

/** 한글 → 영문(두벌식 위치). 한글이 아닌 글자는 그대로 */
export function koToEn(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c >= 0 && c < 11172) {
      out += JAMO_TO_EN[CHO[Math.floor(c / 588)]] + JAMO_TO_EN[JUNG[Math.floor((c % 588) / 28)]];
      const jong = JONG[c % 28];
      if (jong) out += JAMO_TO_EN[jong];
    } else out += JAMO_TO_EN[ch] ?? ch;
  }
  return out;
}

const HANGUL = /[ㄱ-ㅣ가-힣]/;
const ASCII_LETTER = /[A-Za-z]/;

/** 낱말(빈칸으로 나눈 것) 하나가 영문자와 숫자만이면 영→한, 한글(자모 포함)만이면 한→영 */
const wordKind = (w: string): 'en' | 'ko' | null => {
  if (!w) return null;
  if (/^[A-Za-z0-9]+$/.test(w) && ASCII_LETTER.test(w)) return 'en';
  if (/^[ㄱ-ㅣ가-힣0-9]+$/.test(w) && HANGUL.test(w)) return 'ko';
  return null;
};

/** 두 방향으로 바꾼 검색어 (낱말마다: 영문만인 낱말은 한글로, 한글만인 낱말은 영문으로). 바뀐 게 없으면 빈 목록 */
export function convertKeyboard(q: string): { query: string; kind: 'en2ko' | 'ko2en' }[] {
  const words = q.trim().split(/\s+/).filter(Boolean);
  const out: { query: string; kind: 'en2ko' | 'ko2en' }[] = [];
  const en = words.map((w) => (wordKind(w) === 'en' ? enToKo(w) : w));
  const ko = words.map((w) => (wordKind(w) === 'ko' ? koToEn(w) : w));
  const enQ = en.join(' ');
  const koQ = ko.join(' ');
  const base = words.join(' ');
  // 한글이 하나도 안 나온 변환은 의미 없다 (숫자만 등)
  if (enQ !== base && HANGUL.test(enQ)) out.push({ query: enQ, kind: 'en2ko' });
  if (koQ !== base && ASCII_LETTER.test(koQ)) out.push({ query: koQ, kind: 'ko2en' });
  return out;
}
