/**
 * 네이버 서치어드바이저용 RSS (dist/rss.xml).
 * 다가오는 대회 중 최근 추가·확인된 50개 + 대회일이 가까운 순으로 채워 100개. 항목 링크는 대회 상세 /r/<id>.
 * 값은 seo-lib.mjs 에서 가져오기만 한다 (정적 목록 페이지와 같은 기준).
 */
import { writeFileSync } from 'node:fs';
import { ORIGIN, esc, fmt, ENTRY, isCancelled, whereOf, upcoming, today } from './seo-lib.mjs';

const TOTAL = 100;
const RECENT = 50;
const DIST_LABEL = { 풀: '풀코스', 하프: '하프' };

const live = upcoming.filter((r) => !isCancelled(r));
// 최근 추가·확인 (data.json 에 추가 날짜가 없어 last_verified 로 본다)
const recent = [...live]
  .filter((r) => r.last_verified)
  .sort((a, b) => b.last_verified.localeCompare(a.last_verified) || a.race_date.localeCompare(b.race_date))
  .slice(0, RECENT);
const picked = new Map(recent.map((r) => [r.id, r]));
for (const r of live) {
  if (picked.size >= TOTAL) break;
  if (!picked.has(r.id)) picked.set(r.id, r);
}

/** 'YYYY-MM-DD' 00:00 KST → RFC 822 */
const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const rfc822 = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${DAY[d.getUTCDay()]}, ${String(d.getUTCDate()).padStart(2, '0')} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()} 00:00:00 +0900`;
};
const pubOf = (r) => r.last_verified?.slice(0, 10) || today;

/** 정적 목록 페이지(seo-pages.mjs item) 와 같은 문구 */
const describe = (r) => {
  const entry = [ENTRY[r.entry_type], r.entry_opens && `접수 ${fmt(r.entry_opens)}부터`, r.entry_closes && `${fmt(r.entry_closes)}까지`]
    .filter(Boolean)
    .join(' ');
  const dist = (r.distances ?? []).map((d) => DIST_LABEL[d] ?? d).join('·');
  return [fmt(r.race_date), whereOf(r), dist, entry].filter(Boolean).join(' · ');
};

const items = [...picked.values()].sort((a, b) => pubOf(b).localeCompare(pubOf(a)) || a.race_date.localeCompare(b.race_date));

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>마라톤 캘린더</title>
<link>${ORIGIN}/</link>
<description>국내·해외 마라톤 대회 일정과 접수 기간</description>
<language>ko</language>
<lastBuildDate>${new Date().toUTCString().replace('GMT', '+0000')}</lastBuildDate>
<atom:link href="${ORIGIN}/rss.xml" rel="self" type="application/rss+xml"/>
${items
  .map((r) => {
    const url = `${ORIGIN}/r/${encodeURIComponent(r.id)}`;
    const cats = [r.country_code === 'KR' ? '국내' : '해외', ...(r.discipline === 'trail' ? ['트레일러닝'] : [])];
    return `<item>
<title>${esc(`${r.name_ko} ${r.race_date.slice(0, 4)}`)}</title>
<link>${url}</link>
<guid isPermaLink="true">${url}</guid>
<pubDate>${rfc822(pubOf(r))}</pubDate>
<description>${esc(describe(r))}</description>
${cats.map((c) => `<category>${c}</category>`).join('\n')}
</item>`;
  })
  .join('\n')}
</channel>
</rss>
`;

writeFileSync(new URL('../dist/rss.xml', import.meta.url), xml);
console.log(`rss: ${items.length} items`);
