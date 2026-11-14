/**
 * 대회 공유 문구와 공유 미리보기(og) 글 (PLAN 파트 A · 인터페이스 1).
 * 화면(RaceDetail 의 공유 버튼)·워커(worker/site.ts 의 /r/<id> og 태그)·node 테스트(scripts/share-test.mjs)가 같이 쓴다
 * → 런타임 import 는 순수 모듈만, 경로에 .ts 확장자를 붙인다.
 */
import type { Race } from './types.ts';
import type { Lang } from '../i18n/lang.ts';
import { translate } from '../i18n/t.ts';
import { STATUS_TEXT, fmtDate } from '../i18n/format.ts';
import { raceName, whereText } from '../i18n/names.ts';
import { TODAY, entryStatus, isEntryConfirmed } from './util.ts';

/** 공유 문구에 필요한 필드만. 워커의 RaceMeta(선택 필드·느슨한 글자 타입)도 넣을 수 있게 넓게 받는다 */
export interface ShareRace {
  id: string;
  name_ko: string;
  name_en?: string | null;
  race_date: string;
  city_ko: string;
  country_code?: string | null;
  country_ko: string;
  entry_opens: string | null;
  entry_closes: string | null;
  entry_confidence?: string | null;
  sold_out_on?: string | null;
  notes_ko?: string | null;
}

/**
 * util.ts 의 entryStatus 는 Race 타입을 받지만 실제로 읽는 것은 notes_ko·entry_confidence·sold_out_on·
 * entry_opens·entry_closes·race_date 뿐이고, 모두 ShareRace 안에 있다. 그래서 타입만 넓혀서 넘긴다
 */
const statusOf = (race: ShareRace, today: Date) => entryStatus(race as unknown as Race, today);

/** 'YYYY-MM-DD' → 'M/D' */
const md = (iso: string) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

const where = (race: ShareRace, lang: Lang) =>
  whereText({ country_code: race.country_code ?? '', city_ko: race.city_ko, country_ko: race.country_ko }, lang);

/**
 * 접수 부분만: '접수 9/1~9/30 (접수 중)' · 'Entry 9/1–9/30 (Open)'.
 * 접수 날짜는 확정일 때만 넣는다. 한쪽만 있으면 '접수 9/1~' / '접수 ~9/30'. 확정이 아니거나 날짜가 없으면 '(일정 미공개)' 처럼 상태만.
 */
export function shareEntryLine(race: ShareRace, lang: Lang, today: Date = TODAY()): string {
  const st = statusOf(race, today);
  const label = `(${STATUS_TEXT[lang][st]})`;
  if (st === 'cancelled' || !isEntryConfirmed({ entry_confidence: race.entry_confidence as Race['entry_confidence'] })) return label;
  const o = race.entry_opens;
  const c = race.entry_closes;
  if (!o && !c) return label;
  const sep = lang === 'en' ? '–' : '~';
  const range = o && c ? (o === c ? md(o) : `${md(o)}${sep}${md(c)}`) : o ? `${md(o)}${sep}` : `${sep}${md(c!)}`;
  return `${translate(lang, 'share.entry', { r: range })} ${label}`;
}

/** og:title 용: '대회명 · 2027년 3월 15일 · 서울' · 'Seoul Marathon · Mar 15, 2027 · Seoul' */
export function ogTitle(race: ShareRace, lang: Lang): string {
  return [raceName(race, lang), fmtDate(race.race_date, lang), where(race, lang)].filter(Boolean).join(' · ');
}

/**
 * 공유 문구. url 은 완전한 주소('https://marathon82.com/r/<id>', 영어 화면이면 /en/r/<id>).
 * title = 대회명, text = '대회명 · 날짜 · 접수 M/D~M/D (상태)', full = text + ' · ' + url (복사용)
 */
export function shareText(race: ShareRace, lang: Lang, url: string, today: Date = TODAY()): { title: string; text: string; full: string } {
  const title = raceName(race, lang);
  const text = [title, fmtDate(race.race_date, lang), shareEntryLine(race, lang, today)].join(' · ');
  return { title, text, full: `${text} · ${url}` };
}
