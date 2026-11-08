import type { Race } from './types';

export type CalKind = 'race' | 'open' | 'close';

export const CAL_LABEL: Record<CalKind, string> = { race: '대회 날', open: '접수 시작', close: '접수 마감' };

/** 한국 시간 오늘 'YYYY-MM-DD'. 워커에서도 쓰므로 util.ts 를 끌어오지 않고 여기서 계산한다 */
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/** 접수 일정이 공식 확정인가 (util.ts 의 isEntryConfirmed 와 같은 규칙. 워커에서도 쓰므로 여기 따로 둔다) */
const entryConfirmed = (race: { entry_confidence?: string | null }) =>
  race.entry_confidence !== 'expected' && race.entry_confidence !== 'tbc';

/**
 * 이 대회에서 캘린더에 넣을 수 있는 날짜들 (접수일이 미공개면 빠진다).
 * 조기 마감된 대회, 접수일이 예상값(확정 아님)인 대회는 대회 날만 남긴다.
 */
export function calDates(
  race: Pick<Race, 'race_date' | 'entry_opens' | 'entry_closes' | 'sold_out_on'> & { entry_confidence?: string | null },
  today = kstToday(),
): { kind: CalKind; date: string }[] {
  if (race.sold_out_on && race.sold_out_on <= today) return [{ kind: 'race', date: race.race_date }];
  if (!entryConfirmed(race)) return [{ kind: 'race', date: race.race_date }];
  const out: { kind: CalKind; date: string }[] = [];
  if (race.entry_opens) out.push({ kind: 'open', date: race.entry_opens });
  if (race.entry_closes && race.entry_closes !== race.entry_opens) out.push({ kind: 'close', date: race.entry_closes });
  out.push({ kind: 'race', date: race.race_date });
  return out;
}

const title = (race: Pick<Race, 'name_ko'>, kind: CalKind) =>
  kind === 'race' ? race.name_ko : `${race.name_ko} ${CAL_LABEL[kind]}`;

const ymd = (iso: string) => iso.replace(/-/g, '');
const nextDay = (iso: string) => {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};

/** 하루 종일 일정 .ics. 접수 시작·마감에는 하루 전 알림을 단다. (워커에서도 그대로 쓴다) */
export function raceIcs(
  race: Pick<Race, 'id' | 'name_ko' | 'city_ko' | 'country_ko' | 'official_url' | 'race_date' | 'entry_opens' | 'entry_closes' | 'sold_out_on'> & {
    entry_confidence?: string | null;
  },
  pageUrl: string,
  kinds: CalKind[] = ['race', 'open', 'close'],
): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');
  const events = calDates(race).filter((e) => kinds.includes(e.kind));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//marathon-calendar//ko',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(race.name_ko)}`,
    ...events.flatMap((e) => [
      'BEGIN:VEVENT',
      `UID:${race.id}-${e.kind}-${e.date}@marathon-calendar`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${ymd(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${esc(title(race, e.kind))}`,
      `DESCRIPTION:${esc(`${race.city_ko}, ${race.country_ko}\n공식 홈페이지 ${race.official_url}\n${pageUrl}`)}`,
      `URL:${pageUrl}`,
      ...(e.kind !== 'race'
        ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title(race, e.kind))}`, 'TRIGGER:-P1D', 'END:VALARM']
        : []),
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

/** 구글 캘린더 '일정 추가' 화면 링크 (앱·브라우저 어디서나 열린다) */
export function googleCalUrl(race: Race, kind: CalKind): string {
  const d = calDates(race).find((e) => e.kind === kind);
  if (!d) return '';
  const page = `${location.origin}/r/${encodeURIComponent(race.id)}`;
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: title(race, kind),
    dates: `${ymd(d.date)}/${nextDay(d.date)}`,
    details: `${race.city_ko}, ${race.country_ko}\n공식 홈페이지 ${race.official_url}\n${page}`,
    location: race.country_code === 'KR' ? race.city_ko : `${race.city_ko}, ${race.country_ko}`,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

const isKakao = () => /KAKAOTALK/i.test(navigator.userAgent);

/**
 * 카카오톡 안 브라우저는 파일을 못 열고 로그인도 안 돼 있으니 휴대폰 기본 브라우저로 넘긴다.
 * 그 밖에는 그대로 연다.
 */
export function openOutside(url: string) {
  if (isKakao()) {
    location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    return;
  }
  window.open(url, '_blank', 'noopener');
}

/**
 * 아이폰·맥·기본 캘린더용 .ics. 파일을 내려받게 하지 않고 서버 주소(text/calendar)로 열어서
 * 아이폰 사파리는 바로 '캘린더에 추가' 화면이 뜬다.
 */
export function openIcs(race: Race, kinds: CalKind[]) {
  const url = `${location.origin}/cal/${encodeURIComponent(race.id)}.ics?e=${kinds.join(',')}`;
  if (isKakao()) {
    location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    return;
  }
  location.href = url;
}
