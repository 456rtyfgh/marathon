/** 빌드 뒤 dist/sitemap.xml 을 만든다. 대회마다 공유 링크(/?r=id) 하나씩. */
import { readFileSync, writeFileSync } from 'node:fs';

const ORIGIN = 'https://marathon.junubenchoi.workers.dev';
const snap = JSON.parse(readFileSync(new URL('../src/lib/snapshot.json', import.meta.url), 'utf8'));
const today = new Date().toISOString().slice(0, 10);
const urls = [
  `<url><loc>${ORIGIN}/</loc><lastmod>${today}</lastmod><changefreq>daily</changefreq></url>`,
  ...snap.races.map(
    (r) => `<url><loc>${ORIGIN}/?r=${encodeURIComponent(r.id)}</loc><lastmod>${r.last_verified ?? today}</lastmod></url>`,
  ),
];
writeFileSync(
  new URL('../dist/sitemap.xml', import.meta.url),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`,
);
console.log(`sitemap: ${urls.length} urls`);
