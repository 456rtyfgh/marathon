/**
 * GA 분석 섹션의 숫자·시간·% 형식 (순수 함수, PLAN 3절).
 * 날짜 'YYYY-MM-DD' 는 UTC 자정으로 읽는다 — 시간대로 하루 밀리지 않게 (i18n/format.ts 와 같은 규칙).
 */
import type { Lang } from '../i18n/lang.ts';
import type { GaMetric } from './gaTypes.ts';

const NUM = { ko: new Intl.NumberFormat('ko-KR'), en: new Intl.NumberFormat('en-US') };
const EN_MD = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** 12,345 (소수는 반올림) */
export const fmtNum = (n: number, lang: Lang) => NUM[lang].format(Math.round(n));

/** 참여율 0~1 → '52.3%' */
export const fmtRate = (r: number) => `${(r * 100).toFixed(1)}%`;

/** 직전 기간 대비 증감 %. prev 가 0 이면 null (화면은 '—') */
export function deltaPct(m: GaMetric): number | null {
  if (!m.prev) return null;
  return ((m.value - m.prev) / m.prev) * 100;
}

/** '+12.4%' · '-3.0%' · '0.0%' */
export function fmtDelta(p: number): string {
  const s = Math.abs(p).toFixed(1);
  if (s === '0.0') return '0.0%';
  return `${p > 0 ? '+' : '-'}${s}%`;
}

/** 초 → ko '2분 13초'·'45초'·'1시간 2분', en '2m 13s'·'45s'·'1h 2m' */
export function fmtDuration(sec: number, lang: Lang): string {
  const total = Math.max(0, Math.round(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const [uh, um, us, sep] = lang === 'en' ? ['h', 'm', 's', ' '] : ['시간', '분', '초', ' '];
  if (h) return m ? `${h}${uh}${sep}${m}${um}` : `${h}${uh}`;
  if (m) return s ? `${m}${um}${sep}${s}${us}` : `${m}${um}`;
  return `${s}${us}`;
}

/** 'YYYY-MM-DD' → ko '11월 3일', en 'Nov 3' */
export function fmtDay(iso: string, lang: Lang): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z');
  if (lang === 'en') return EN_MD.format(d);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

/** ISO 시각 → 보는 사람 시계 기준 '오후 3:05' | '3:05 PM' */
export function fmtClock(iso: string, lang: Lang): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(lang === 'en' ? 'en-US' : 'ko-KR', { hour: 'numeric', minute: '2-digit' });
}
