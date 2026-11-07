/**
 * 빌드 뒤 dist/sitemap.xml 을 만든다: 홈, 월별·나라별 목록 페이지(scripts/seo-pages.mjs), 대회마다 /r/id.
 * lastmod 는 그 페이지 내용이 마지막으로 확인된 날(대회 last_verified). 모르면 오늘.
 */
import { writeFileSync } from 'node:fs';
import { ORIGIN, esc, lastmodOf, listPages, races, today } from './seo-lib.mjs';

const url = (loc, lastmod) => `<url><loc>${esc(loc)}</loc><lastmod>${lastmod}</lastmod></url>`;
const urls = [
  url(`${ORIGIN}/`, lastmodOf(races)),
  ...listPages.map((p) => url(`${ORIGIN}${p.path}`, lastmodOf(p.races))),
  ...races.map((r) => url(`${ORIGIN}/r/${encodeURIComponent(r.id)}`, r.last_verified ?? today)),
];
writeFileSync(
  new URL('../dist/sitemap.xml', import.meta.url),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
);
console.log(`sitemap: ${urls.length} urls (목록 페이지 ${listPages.length}개)`);
