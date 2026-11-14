/**
 * 대회 상세(/r/<id>, /en/r/<id>) 맨 위 한 문장 요약. worker/site.ts 가 <h1> 바로 아래에 넣는다.
 * 순수 함수만 둔다(Cloudflare 전역 없음, import 는 `.ts` 확장자를 붙인 ../src 만) → node 테스트(scripts/race-summary-test.mjs)에서 바로 읽힌다.
 *
 * 쓰는 값은 /r/<id> 본문 표(raceHtml 의 rows)에 이미 있는 것뿐이다 — 대회 날짜·장소·종목·접수 방식·접수 기간.
 * 참가비·정원·메모·공식 주소는 넣지 않는다(상세 값 무단 수집 방지 원칙: 기존 페이지 수준 유지).
 *
 * 접수 상태는 홈 목록과 같게: 목록 데이터(/d/<hash>.json)의 notes_ko 는 취소 태그만 남으므로(scripts/data-split.mjs)
 * 여기서도 notes_ko 를 취소 태그만 남긴 값으로 entryStatus 를 부른다 (scripts/seo-lib.mjs 의 listView 와 같은 규칙).
 */
import type { Race } from '../src/lib/types.ts';
import { DIST_TEXT, ENTRY_TEXT, STATUS_TEXT, fmtDate } from '../src/i18n/format.ts';
import { whereText } from '../src/i18n/names.ts';
import { entryStatus, isCancelled, isEntryConfirmed } from '../src/lib/util.ts';

export interface SummaryRace {
  name_ko: string;
  name_en?: string | null;
  city_ko: string;
  country_ko: string;
  country_code?: string | null;
  race_date: string;
  /** confirmed | expected | tbc */
  date_confidence?: string | null;
  entry_type: string;
  entry_opens: string | null;
  entry_closes: string | null;
  entry_confidence?: string | null;
  sold_out_on?: string | null;
  notes_ko?: string | null;
  distances?: string[] | null;
  discipline?: string | null;
}

const CANCEL_TAG = /^\s*\[(취소|중단)\]/;
/** 목록 화면이 보는 값: notes_ko 는 취소 태그만 남긴다 */
const listView = (r: SummaryRace): SummaryRace => {
  const tag = r.notes_ko?.match(CANCEL_TAG);
  return { ...r, notes_ko: tag ? `[${tag[1]}]` : null };
};
const statusOf = (r: SummaryRace, today: string) => entryStatus(listView(r) as unknown as Race, new Date(today + 'T00:00:00Z'));
const confirmedEntry = (r: SummaryRace) => isEntryConfirmed({ entry_confidence: r.entry_confidence as Race['entry_confidence'] });

/** 받침 있으면 '은', 없으면 '는' (한글이 아니면 '은') */
const eun = (w: string) => {
  const c = w.trim().slice(-1).charCodeAt(0) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 === 0 ? '는' : '은';
};

/** '홍콩 홍콩'·'싱가포르 싱가포르' (도시 = 나라)처럼 앞 두 낱말이 같으면 하나로 (요약 문장 안에서만) */
const dedupeWhere = (w: string) => {
  const p = w.split(/\s+/);
  return p.length >= 2 && p[0] === p[1] ? [p[0], ...p.slice(2)].join(' ') : w;
};

const ENTRY_KO = ENTRY_TEXT.ko as Record<string, string>;
const ENTRY_EN = ENTRY_TEXT.en as Record<string, string>;
const dateExpectedKo = (r: SummaryRace) => (r.date_confidence === 'confirmed' ? '' : r.date_confidence === 'tbc' ? '(미정)' : '(예상)');
const dateExpectedEn = (r: SummaryRace) => (r.date_confidence === 'confirmed' ? '' : r.date_confidence === 'tbc' ? ' (TBC)' : ' (expected)');

/** 접수 기간 글자 (날짜가 하나도 없으면 null) */
function windowKo(r: SummaryRace): string | null {
  const o = r.entry_opens && fmtDate(r.entry_opens, 'ko');
  const c = r.entry_closes && fmtDate(r.entry_closes, 'ko');
  if (o && c) return o === c ? `${o} 하루` : `${o}부터 ${c}까지`;
  if (o) return `${o}부터`;
  if (c) return `${c}까지`;
  return null;
}
function windowEn(r: SummaryRace): string | null {
  const o = r.entry_opens && fmtDate(r.entry_opens, 'en');
  const c = r.entry_closes && fmtDate(r.entry_closes, 'en');
  if (o && c) return o === c ? `on ${o} only` : `from ${o} to ${c}`;
  if (o) return `from ${o}`;
  if (c) return `until ${c}`;
  return null;
}

/**
 * 한국어 한 문장 (합니다체).
 *  '<대회명>은 <날짜>에 <장소>에서 열리는 <종목> 종목이 있는 <마라톤 대회>로, 접수는 <방식> <기간>(<상태>)입니다.'
 * 값 없는 조각은 뺀다. 날짜가 확정이 아니면 '(예상)', 접수 일정이 확정이 아니면 접수 기간 앞에 '예상'. 취소 대회는 취소 문장.
 */
export function raceSummaryKo(r: SummaryRace, today: string): string {
  const name = r.name_ko;
  if (isCancelled(r as unknown as Race)) {
    return `${name}${eun(name)} ${fmtDate(r.race_date, 'ko')}${dateExpectedKo(r)}에 열릴 예정이었으나 주최 측이 취소(중단)했다고 알린 대회입니다.`;
  }
  const where = dedupeWhere(whereText({ country_code: r.country_code ?? '', city_ko: r.city_ko, country_ko: r.country_ko }, 'ko').trim());
  const dists = (r.distances ?? []).map(DIST_TEXT.ko).join('·');
  const kind = r.discipline === 'trail' ? '트레일러닝 대회' : r.discipline === 'event' ? '러닝 이벤트' : '마라톤 대회';
  // 대회 날이 지났으면 '열린' (지난 대회 페이지도 /r/<id> 로 열린다)
  const held = r.race_date < today ? '열린' : '열리는';
  const head = `${name}${eun(name)} ${fmtDate(r.race_date, 'ko')}${dateExpectedKo(r)}에 ${where ? `${where}에서 ` : ''}${held} ${dists ? `${dists} 종목이 있는 ` : ''}${kind}`;
  const st = STATUS_TEXT.ko[statusOf(r, today)];
  const how = ENTRY_KO[r.entry_type];
  const win = windowKo(r);
  if (!win) return `${head}로, ${how ? `접수 방식은 ${how}, ` : ''}접수 기간은 아직 공개되지 않았습니다(${st}).`;
  const pre = confirmedEntry(r) ? '' : '예상 ';
  return `${head}로, 접수는 ${how ? `${how} ` : ''}${pre}${win}(${st})입니다.`;
}

/**
 * 영어 한 문장.
 *  '<Name> is a <distances> race held on <date> in <place>; registration is <how>, <window> (<status>).'
 */
export function raceSummaryEn(r: SummaryRace, today: string): string {
  const name = r.name_en?.trim() || r.name_ko;
  const dateEn = fmtDate(r.race_date, 'en');
  if (isCancelled(r as unknown as Race)) {
    return `${name} was scheduled for ${dateEn}${dateExpectedEn(r)} but has been cancelled (or called off) by the organizer.`;
  }
  const where = whereText({ country_code: r.country_code ?? '', city_ko: r.city_ko, country_ko: r.country_ko }, 'en').trim();
  const dists = (r.distances ?? []).map(DIST_TEXT.en).join(', ');
  const kind = r.discipline === 'trail' ? 'trail race' : r.discipline === 'event' ? 'running event' : 'race';
  const head = `${name} ${r.race_date < today ? 'was' : 'is'} a ${kind}${dists ? ` (${dists})` : ''} held on ${dateEn}${dateExpectedEn(r)}${where ? ` in ${where}` : ''}`;
  const st = STATUS_TEXT.en[statusOf(r, today)];
  const how = ENTRY_EN[r.entry_type];
  const win = windowEn(r);
  const via = how ? ` (${how.toLowerCase()})` : '';
  if (!win) return `${head}; the registration${via} window has not been announced (${st}).`;
  const sure = confirmedEntry(r);
  const past = r.race_date < today;
  const verb = sure ? (past ? 'ran' : 'runs') : past ? 'was expected to run' : 'is expected to run';
  return `${head}; registration${via} ${verb} ${win} (${st}).`;
}
