/**
 * 공유 미리보기(og:description · twitter:description) 글 (PLAN 파트 B · 인터페이스 2-2).
 * worker/site.ts 의 /r/<id>·/en/r/<id> 와 node 시험(scripts/og-desc-test.mjs)이 같이 쓴다
 * → 저장소 안의 순수 모듈만 import 하고, 경로에 .ts 확장자를 붙인다.
 */
import type { Lang } from '../i18n/lang.ts';
import type { Race } from './types.ts';
import { ogTitle, shareEntryLine, type ShareRace } from './shareText.ts';
import { fmtDate } from '../i18n/format.ts';
import { TODAY, isCancelled, isEntryConfirmed } from './util.ts';

/** 미리보기 설명 최대 길이 (검색 결과 설명과 같은 기준) */
export const OG_DESC_MAX = 160;

/**
 * 미리보기 설명: '<접수 줄> <요약 문장들>' 을 160자 안쪽으로.
 * - summary 는 워커가 만든 meta description 글(ko describe(race), en describeEn(race))을 그대로 받는다.
 * - 취소 대회는 요약만 (요약 첫머리에 ko '[대회 취소]' · en '[Cancelled]' 가 이미 있어 접수 줄을 겹쳐 쓰지 않는다).
 * - 넘치면 요약 문장을 뒤에서부터 통째로 뺀다 (문장 중간에서 자르지 않게). 첫 문장도 안 들어가면 그때만 159자 + '…'.
 * - 문장 끝 = 마침표 뒤 공백. '8.2km' 처럼 숫자 속 점은 나누지 않고, 대회명·장소 속 'St. Jude'·'Mt. Fuji' 같은 점도 나누지 않는다.
 * today 는 시험용 (접수 상태 계산 기준일, 기본은 한국 시간 오늘).
 */
export function ogDescription(race: ShareRace, lang: Lang, summary: string, today: Date = TODAY()): string {
  const sum = summary.trim();
  if (isCancelled({ notes_ko: race.notes_ko ?? null })) return clip(sum);
  const entryLine = shareEntryLine(race, lang, today);
  if (!sum) return clip(entryLine);
  let sentences = splitSentences(sum, [...ogTitle(race, lang).split(' · '), race.name_ko, race.name_en ?? '']);
  // 접수 일정이 확정이 아니면 앞의 '접수 예상 …' 줄만 날짜를 말하게 한다 — 요약의 접수 문장(같은 날짜를 확정처럼 다시 씀)은 뺀다. 첫 문장(대회 소개)은 그대로
  if (!isEntryConfirmed({ entry_confidence: race.entry_confidence as Race['entry_confidence'] })) {
    const dates = [race.entry_opens, race.entry_closes].filter((d): d is string => !!d).map((d) => fmtDate(d, lang));
    if (dates.length) sentences = sentences.filter((x, i) => i === 0 || !dates.some((d) => x.includes(d)));
  }
  for (let n = sentences.length; n > 0; n--) {
    const s = `${entryLine} ${sentences.slice(0, n).join(' ')}`;
    if (s.length <= OG_DESC_MAX) return s;
  }
  return clip(`${entryLine} ${sum}`);
}

/**
 * 마침표 뒤 공백에서 문장을 나눈다. keep(대회명·날짜·장소) 안의 '. ' 는 문장 끝이 아니므로 잠시 다른 글자로 바꿔 두고 나눈 뒤 되돌린다.
 * 바꿔 두는 글자(U+E000, 사용자 영역)는 대회 데이터에 나오지 않는다.
 */
function splitSentences(text: string, keep: string[]): string[] {
  const MARK = '';
  let masked = text;
  for (const k of keep) if (k && k.includes('. ')) masked = masked.split(k).join(k.replaceAll('. ', `.${MARK}`));
  return masked.split(/(?<=\.)\s+/).map((s) => s.replaceAll(`.${MARK}`, '. '));
}

/** 160자를 넘으면 159자 + '…' */
const clip = (s: string) => (s.length <= OG_DESC_MAX ? s : s.slice(0, OG_DESC_MAX - 1) + '…');
