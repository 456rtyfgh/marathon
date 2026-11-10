import type { Race } from './types';
import type { Lang } from '../i18n/lang';
import { CANCEL_TAG_RE } from './util';

/**
 * 러닝 이벤트(discipline 'event'): 브랜드가 여는 기록 측정·선발전 같은 행사.
 *
 * 주최 브랜드와 성격은 notes_ko 맨 앞 머리말로 적는다 (취소 태그가 있으면 그 뒤):
 *   '[브랜드 아디다스 | 선발전·기록측정] 본문…'
 * 화면은 머리말을 떼어 '주최 브랜드'·'성격' 칸으로 보이고, 남은 본문만 메모로 보인다.
 */
export const isRunEvent = (race: Pick<Race, 'discipline'>) => race.discipline === 'event';

const HEAD_RE = /^\[브랜드\s+([^|\]]+?)\s*(?:\|\s*([^\]]*?)\s*)?\]\s*/;

/** 영어 화면용 브랜드 이름 (표에 없으면 한국어 그대로 — 영문 브랜드는 대개 그대로 적혀 있다) */
const BRAND_EN: Record<string, string> = {
  아디다스: 'adidas',
  나이키: 'Nike',
  뉴발란스: 'New Balance',
  데상트: 'Descente',
  아식스: 'ASICS',
  푸마: 'PUMA',
  호카: 'HOKA',
  써코니: 'Saucony',
  브룩스: 'Brooks',
  온: 'On',
  미즈노: 'Mizuno',
  언더아머: 'Under Armour',
  살로몬: 'Salomon',
  노스페이스: 'The North Face',
  룰루레몬: 'lululemon',
};

/** 성격 낱말 (머리말 '|' 뒤, '·' 로 나눔) */
const KIND_EN: Record<string, string> = {
  선발전: 'Team selection',
  기록측정: 'Time trial',
  '기록 측정': 'Time trial',
  레이스: 'Race',
  체험: 'Experience',
  클래스: 'Clinic',
  그룹런: 'Group run',
};

export interface RunEventMeta {
  brand: string;
  kinds: string[];
}

/** notes_ko 머리말에서 브랜드·성격을 읽는다. 이벤트가 아니거나 머리말이 없으면 null */
export function runEventMeta(race: Pick<Race, 'discipline' | 'notes_ko'>): RunEventMeta | null {
  if (!isRunEvent(race) || !race.notes_ko) return null;
  const m = race.notes_ko.replace(CANCEL_TAG_RE, '').match(HEAD_RE);
  if (!m) return null;
  const kinds = (m[2] ?? '')
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);
  return { brand: m[1].trim(), kinds };
}

/** 메모에서 이벤트 머리말을 뗀다 (noteText 결과에 쓴다) */
export function stripRunEventHead(note: string | null): string | null {
  if (!note) return note;
  return note.replace(HEAD_RE, '').trim() || null;
}

export function brandText(brand: string, lang: Lang): string {
  return lang === 'en' ? (BRAND_EN[brand] ?? brand) : brand;
}

/** 성격 글: ko '선발전 · 기록 측정' / en 'Team selection · Time trial' (모르는 낱말은 en 에서 뺀다) */
export function kindsText(kinds: string[], lang: Lang): string {
  if (lang === 'en') return kinds.map((k) => KIND_EN[k]).filter(Boolean).join(' · ');
  return kinds.map((k) => (k === '기록측정' ? '기록 측정' : k)).join(' · ');
}

export const RUN_EVENT_TEXT: Record<Lang, { badge: string; brand: string; kind: string }> = {
  ko: { badge: '이벤트', brand: '주최 브랜드', kind: '성격' },
  en: { badge: 'Event', brand: 'Hosted by', kind: 'Format' },
};
