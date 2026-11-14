/**
 * sitemap.xml 두 개를 비교한다 (indexnow.mjs · crawl-priority.mjs 공용). 외부 패키지 없이 정규식으로 읽는다.
 * 이 사이트의 sitemap 은 <url><loc>…</loc><lastmod>…</lastmod></url> 한 줄씩이다 (scripts/sitemap.mjs).
 */

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** sitemap xml → Map(loc → lastmod). lastmod 가 없으면 빈 문자열 */
export function parseSitemap(xml) {
  const map = new Map();
  for (const m of String(xml).matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = m[1].match(/<loc>\s*([^<]*?)\s*<\/loc>/);
    if (!loc) continue;
    const mod = m[1].match(/<lastmod>\s*([^<]*?)\s*<\/lastmod>/);
    map.set(unesc(loc[1]), mod ? mod[1] : '');
  }
  return map;
}

/**
 * 이전 → 이번 비교.
 * added: 이번에 처음 생긴 주소, changed: lastmod 가 달라진 주소, removed: 사라진 주소.
 * 값은 모두 [loc, lastmod] 가 아니라 loc 문자열 배열 (lastmod 는 next 맵에서 다시 찾는다). 입력 순서를 유지한다.
 */
export function diffSitemaps(prev, next) {
  const added = [];
  const changed = [];
  const removed = [];
  for (const [loc, mod] of next) {
    if (!prev.has(loc)) added.push(loc);
    else if (prev.get(loc) !== mod) changed.push(loc);
  }
  for (const loc of prev.keys()) if (!next.has(loc)) removed.push(loc);
  return { added, changed, removed };
}
