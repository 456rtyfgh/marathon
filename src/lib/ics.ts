import type { Race } from './types';

/** 대회일과 접수 시작·마감일을 하루 종일 일정으로 담은 .ics 파일을 만든다. */
export function raceIcs(race: Race, pageUrl: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const day = (iso: string) => iso.replace(/-/g, '');
  const next = (iso: string) => {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10).replace(/-/g, '');
  };
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/[,;]/g, (m) => '\\' + m).replace(/\n/g, '\\n');

  const events: { uid: string; date: string; title: string; alarm?: boolean }[] = [];
  if (race.entry_opens) events.push({ uid: 'open', date: race.entry_opens, title: `${race.name_ko} 접수 시작`, alarm: true });
  if (race.entry_closes) events.push({ uid: 'close', date: race.entry_closes, title: `${race.name_ko} 접수 마감`, alarm: true });
  events.push({ uid: 'race', date: race.race_date, title: race.name_ko });

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//marathon-calendar//ko',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap((e) => [
      'BEGIN:VEVENT',
      `UID:${race.id}-${e.uid}-${e.date}@marathon-calendar`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(e.date)}`,
      `DTEND;VALUE=DATE:${next(e.date)}`,
      `SUMMARY:${esc(e.title)}`,
      `DESCRIPTION:${esc(`${race.city_ko}, ${race.country_ko}\n공식 홈페이지 ${race.official_url}\n${pageUrl}`)}`,
      `URL:${race.official_url}`,
      ...(e.alarm
        ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, 'TRIGGER:-P1D', 'END:VALARM']
        : []),
      'END:VEVENT',
    ]),
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

export function downloadIcs(race: Race) {
  const url = `${location.origin}/?r=${encodeURIComponent(race.id)}`;
  const blob = new Blob([raceIcs(race, url)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${race.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
