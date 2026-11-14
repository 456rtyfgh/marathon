/**
 * 빌드 뒤 dist/sitemap.xml 을 만든다: 홈, 월별·나라별·검색어 랜딩·시·도별·거리별·이번 주말 목록 페이지(scripts/seo-pages.mjs), 대회마다 /r/id.
 * lastmod 는 그 페이지 내용이 마지막으로 확인된 날(대회 last_verified). 모르면 오늘.
 */
import { writeFileSync } from 'node:fs';
import { ORIGIN, distancePages, esc, lastmodOf, listPages, listPagesEn, races, regionPages, today, weekend } from './seo-lib.mjs';

const url = (loc, lastmod) => `<url><loc>${esc(loc)}</loc><lastmod>${lastmod}</lastmod></url>`;
const urls = [
  url(`${ORIGIN}/`, lastmodOf(races)),
  ...listPages.map((p) => url(`${ORIGIN}${p.path}`, p.lastmod ?? lastmodOf(p.races))),
  ...races.map((r) => url(`${ORIGIN}/r/${encodeURIComponent(r.id)}`, r.last_verified ?? today)),
  // 영어판 (/en/…): 한국어 주소와 같은 목록
  url(`${ORIGIN}/en/`, lastmodOf(races)),
  ...listPagesEn.map((p) => url(`${ORIGIN}${p.path}`, p.lastmod ?? lastmodOf(p.races))),
  ...races.map((r) => url(`${ORIGIN}/en/r/${encodeURIComponent(r.id)}`, r.last_verified ?? today)),
];
// 잘못된 sitemap 이 나가지 않게 빌드에서 바로 멈춘다: 주소 중복·lastmod 형식·noindex 넘김(/open/)·빈 목록 페이지
const locs = urls.map((u) => u.match(/<loc>([^<]*)<\/loc>/)[1]);
const dupLoc = locs.filter((l, i) => locs.indexOf(l) !== i);
if (dupLoc.length) throw new Error(`sitemap: 주소 중복 ${dupLoc.slice(0, 3).join(' ')}`);
const badMod = urls.filter((u) => !/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(u));
if (badMod.length) throw new Error(`sitemap: lastmod 형식 이상 ${badMod.slice(0, 2).join(' ')}`);
if (locs.some((l) => /\/(en\/)?open\/$/.test(l))) throw new Error('sitemap: /open/ 넘김 주소가 들어 있음');
const emptyList = [...listPages, ...listPagesEn].filter((p) => !p.races.length);
if (emptyList.length) throw new Error(`sitemap: 대회 0개 페이지가 들어 있음 ${emptyList.map((p) => p.path).join(' ')}`);
writeFileSync(
  new URL('../dist/sitemap.xml', import.meta.url),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
);
console.log(`sitemap: ${urls.length} urls (목록 페이지 ${listPages.length}개)`);
// 새 검색 유입 페이지 (seo-lib.mjs 의 listPages 에 이미 들어 있다. 주말 0개면 noindex 라 빠진다)
console.log(
  `sitemap: 시·도별 ${regionPages.length}개, 거리별 ${distancePages.length}개, 이번 주말 ${weekend.races.length ? 1 : '0(대회 없음, noindex)'}개 (한국어·영어 각각)`,
);
