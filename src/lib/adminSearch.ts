import type { Race } from './types';
import { normalize } from './search.ts';

/*
 * 관리 화면 대회 찾기 (자동완성). 한글 이름·영문 이름·도시·나라·id 아무거나 부분 일치.
 * 빈칸·가운뎃점·대소문자·악센트는 search.ts 의 normalize 로 무시한다.
 * Node 로 바로 돌리는 검사(scripts/admin-search-test.mjs)가 이 파일을 그대로 읽으므로 import 는 확장자 .ts 를 붙인다.
 */

/** 오늘 (한국 날짜, YYYY-MM-DD) */
function todayKst(): string {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  const x = Date.parse(a);
  const y = Date.parse(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.MAX_SAFE_INTEGER;
  return Math.abs(x - y);
}

/**
 * 순서: id 완전 일치(0) > 이름(한글·영문) 시작 일치(1) > 부분 일치(2). 같으면 대회 날짜가 오늘에 가까운 순, 그다음 id.
 * 빈 검색어(정규화 뒤 빈 문자열) → [].
 */
export function matchRaces(races: Race[], q: string, n = 8): Race[] {
  const nq = normalize(q);
  if (!nq) return [];
  const today = todayKst();
  const hits: { r: Race; rank: number; d: number }[] = [];
  for (const r of races) {
    const id = normalize(r.id ?? '');
    const names = [normalize(r.name_ko ?? ''), normalize(r.name_en ?? '')];
    const others = [normalize(r.city_ko ?? ''), normalize(r.country_ko ?? ''), id];
    let rank = -1;
    if (id === nq) rank = 0;
    else if (names.some((s) => s.startsWith(nq))) rank = 1;
    else if (names.some((s) => s.includes(nq)) || others.some((s) => s.includes(nq))) rank = 2;
    if (rank < 0) continue;
    hits.push({ r, rank, d: dayDiff(r.race_date, today) });
  }
  hits.sort((a, b) => a.rank - b.rank || a.d - b.d || (a.r.id < b.r.id ? -1 : a.r.id > b.r.id ? 1 : 0));
  return hits.slice(0, Math.max(0, n)).map((h) => h.r);
}

/**
 * text 안에서 q 와 맞은 부분 [시작, 끝) (원래 글자 위치). normalize 기준으로 비교하므로 'tok' 이 'Tokyo' 의 'Tok' 에,
 * '서울마라' 가 '서울 마라톤' 의 '서울 마라' 에 맞는다. 못 찾으면 null (굵게 표시용).
 */
export function matchRange(text: string, q: string): [number, number] | null {
  const nq = normalize(q);
  if (!nq || !text) return null;
  // 원래 글자 하나씩 정규화해 이어 붙이고, 정규화 글자 → 원래 위치를 적어 둔다
  let norm = '';
  const pos: number[] = []; // norm 의 각 글자(UTF-16 단위)가 시작한 원래 위치
  const ends: number[] = []; // 그 원래 글자가 끝나는 위치
  let i = 0;
  for (const ch of text) {
    const c = ch.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    for (let k = 0; k < c.length; k++) {
      pos.push(i);
      ends.push(i + ch.length);
    }
    norm += c;
    i += ch.length;
  }
  const at = norm.indexOf(nq);
  if (at < 0) return null;
  return [pos[at], ends[at + nq.length - 1]];
}
