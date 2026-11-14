/**
 * 빌드 뒤 dist 의 검색 유입 정적 페이지 검사 (PLAN 파트 B). 실패가 하나라도 있으면 exit 1.
 *   node scripts/seo-pages-check.mjs
 * 본다: 새 페이지(시·도·거리·주말, 한·영)의 title(서로 다름)·description·canonical·h1·JSON-LD(BreadcrumbList·ItemList, JSON.parse)·
 * ItemList 수 = 목록 <li> 수, 0개 페이지는 없거나 noindex, sitemap 에 새 주소가 있고 noindex·/open/ 은 없음, /open/ 넘김,
 * dist/d/ 아래 html 없음, 기존 랜딩 canonical·title, seo-lib 에 옮겨 적은 시·도 id = src/lib/places.ts.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { ORIGIN, PROVINCES, distancePages, enPath, listPages, listPagesEn, regionPages, weekend } from './seo-lib.mjs';

const DIST = new URL('../dist/', import.meta.url);
const fails = [];
const fail = (msg) => fails.push(msg);
const read = (path) => {
  const f = new URL(`.${path}index.html`, DIST);
  return existsSync(f) ? readFileSync(f, 'utf8') : null;
};
const pick = (html, re) => html.match(re)?.[1] ?? null;
const titleOf = (h) => pick(h, /<title>([^<]*)<\/title>/);
const canonOf = (h) => pick(h, /<link rel="canonical" href="([^"]*)">/);
const noindexOf = (h) => /<meta name="robots" content="noindex/.test(h);

if (!existsSync(DIST)) {
  console.error('dist 가 없습니다. npm run build 뒤에 돌리세요.');
  process.exit(1);
}

// 1. 새 페이지 목록 (한·영)
const newPaths = [...regionPages.map((p) => p.path), ...distancePages.map((d) => d.path), weekend.path];
const newAll = [...newPaths, ...newPaths.map(enPath)];
const titles = new Map();

for (const path of newAll) {
  const h = read(path);
  if (!h) {
    fail(`${path}: 파일 없음`);
    continue;
  }
  const t = titleOf(h);
  if (!t) fail(`${path}: title 없음`);
  const desc = pick(h, /<meta name="description" content="([^"]*)">/);
  if (!desc) fail(`${path}: description 없음`);
  else if (desc.replace(/&(amp|lt|gt|quot);/g, '_').length > 160) fail(`${path}: description 160자 넘음`);
  if (canonOf(h) !== `${ORIGIN}${path}`) fail(`${path}: canonical ${canonOf(h)} ≠ 자기 주소`);
  if (!/<h1>[^<]+<\/h1>/.test(h)) fail(`${path}: h1 없음`);
  // JSON-LD
  const lds = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const parsed = [];
  for (const j of lds) {
    try {
      parsed.push(JSON.parse(j));
    } catch (e) {
      fail(`${path}: JSON-LD JSON.parse 실패 (${e.message})`);
    }
  }
  const bc = parsed.find((v) => v['@type'] === 'BreadcrumbList');
  const il = parsed.find((v) => v['@type'] === 'ItemList');
  if (!bc) fail(`${path}: BreadcrumbList 없음`);
  if (!il) fail(`${path}: ItemList 없음`);
  const lis = [...h.matchAll(/<ul class="races">([\s\S]*?)<\/ul>/g)].reduce((n, m) => n + (m[1].match(/<li>/g) ?? []).length, 0);
  if (il && il.itemListElement.length !== lis) fail(`${path}: ItemList ${il.itemListElement.length}개 ≠ 목록 <li> ${lis}개`);
  // 목록 한 줄: /r/<id> 링크 + 접수 상태
  const en = path.startsWith('/en/');
  if (lis && !h.includes(en ? 'href="/en/r/' : 'href="/r/')) fail(`${path}: 대회 상세 링크 없음`);
  if (lis && !(en ? /Open|Opens soon|Sold out|Closed|Dates TBA/ : /접수 중|접수 예정|조기 마감|접수 마감|일정 미공개/).test(h)) fail(`${path}: 접수 상태 글자 없음`);
  if (!h.includes('class="links"')) fail(`${path}: 관련 링크 nav 없음`);
  if (lis === 0 && !noindexOf(h)) fail(`${path}: 대회 0개인데 noindex 없음`);
  if (lis > 0 && noindexOf(h)) fail(`${path}: 대회가 있는데 noindex`);
  if (t) titles.set(t, [...(titles.get(t) ?? []), path]);
}

// 2. title 은 기존 목록 페이지 포함 전부 서로 달라야 한다
for (const p of [...listPages, ...listPagesEn]) {
  const h = read(p.path);
  if (!h) {
    fail(`${p.path}: sitemap 목록에 있는데 파일 없음`);
    continue;
  }
  if (newAll.includes(p.path)) continue;
  const t = titleOf(h);
  if (t) titles.set(t, [...(titles.get(t) ?? []), p.path]);
}
for (const [t, ps] of titles) if (ps.length > 1) fail(`title 겹침 "${t}": ${ps.join(', ')}`);

// 3. 0개 시·도·거리는 파일이 없어야 한다
const regionIds = new Set(regionPages.map((p) => p.id));
for (const p of PROVINCES) if (!regionIds.has(p.id) && (read(`/kr/${p.id}/`) || read(`/en/kr/${p.id}/`))) fail(`/kr/${p.id}/: 대회 0개인데 페이지가 있음`);
const buckets = new Set(distancePages.map((d) => d.bucket));
for (const b of ['full', 'half', '10k']) if (!buckets.has(b) && (read(`/distance/${b}/`) || read(`/en/distance/${b}/`))) fail(`/distance/${b}/: 대회 0개인데 페이지가 있음`);

// 4. sitemap
const sm = readFileSync(new URL('sitemap.xml', DIST), 'utf8');
const locs = new Set([...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]));
for (const path of newAll) {
  const h = read(path);
  const want = h && !noindexOf(h);
  if (want && !locs.has(`${ORIGIN}${path}`)) fail(`sitemap: ${path} 없음`);
  if (!want && locs.has(`${ORIGIN}${path}`)) fail(`sitemap: noindex 인 ${path} 가 들어 있음`);
}
for (const path of ['/open/', '/en/open/']) if (locs.has(`${ORIGIN}${path}`)) fail(`sitemap: ${path} 가 들어 있음`);
for (const path of ['/entry-open/', '/en/entry-open/']) {
  const h = read(path);
  if (h && noindexOf(h) && locs.has(`${ORIGIN}${path}`)) fail(`sitemap: noindex 인 ${path} 가 들어 있음`);
}

// 5. /open/ 넘김
for (const [path, target] of [['/open/', '/entry-open/'], ['/en/open/', '/en/entry-open/']]) {
  const h = read(path);
  if (!h) {
    fail(`${path}: 파일 없음`);
    continue;
  }
  if (canonOf(h) !== `${ORIGIN}${target}`) fail(`${path}: canonical ${canonOf(h)} ≠ ${target}`);
  if (!h.includes(`<meta http-equiv="refresh" content="0;url=${target}">`)) fail(`${path}: refresh 없음`);
  if (noindexOf(h)) fail(`${path}: noindex 가 있음 (canonical 과 엇갈림)`);
}

// 6. dist/d/ 아래 html 없음 (/d/* 는 워커 전용)
const walk = (u) =>
  existsSync(u)
    ? readdirSync(u).flatMap((n) => {
        const c = new URL(n, u);
        return statSync(c).isDirectory() ? walk(new URL(`${n}/`, u)) : [c.pathname];
      })
    : [];
const dHtml = walk(new URL('d/', DIST)).filter((f) => f.endsWith('.html'));
if (dHtml.length) fail(`dist/d/ 아래 html: ${dHtml.join(', ')}`);

// 7. 기존 랜딩 canonical·title 그대로
const firstMonth = listPages.find((p) => p.path.startsWith('/m/'))?.path;
const keep = [
  ['/kr/', /^국내 마라톤 일정 .* — 대회 접수 기간 \| 마라톤 캘린더$/],
  ['/entry-open/', /^지금 접수 중인 마라톤 대회 \d+개 — .* 기준 \| 마라톤 캘린더$/],
  ['/abroad/', /^해외 마라톤 일정 .* — 나라별 대회 접수 \| 마라톤 캘린더$/],
  ['/en/kr/', /^Marathons in South Korea .* — Race Registration \| Marathon Calendar$/],
  [firstMonth, /^\d{4}년 \d{1,2}월 마라톤 일정 — 국내 \d+개·해외 \d+개 대회 접수 \| 마라톤 캘린더$/],
];
for (const [path, re] of keep) {
  const h = read(path);
  if (!h) {
    fail(`${path}: 기존 페이지 없음`);
    continue;
  }
  if (canonOf(h) !== `${ORIGIN}${path}`) fail(`${path}: 기존 canonical 바뀜 (${canonOf(h)})`);
  if (!re.test(titleOf(h) ?? '')) fail(`${path}: 기존 title 꼴 바뀜 ("${titleOf(h)}")`);
}
// /kr/ 보강: 시·도 링크
const krHtml = read('/kr/') ?? '';
for (const p of regionPages) if (!krHtml.includes(`href="${p.path}"`)) fail(`/kr/: ${p.path} 링크 없음`);

// 8. 시·도 id = src/lib/places.ts
const placesSrc = readFileSync(new URL('../src/lib/places.ts', import.meta.url), 'utf8');
const block = placesSrc.slice(placesSrc.indexOf('export const PROVINCES'), placesSrc.indexOf('];', placesSrc.indexOf('export const PROVINCES')));
const srcIds = [...block.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
const libIds = PROVINCES.map((p) => p.id);
if (srcIds.join(',') !== libIds.join(',')) fail(`시·도 id 가 places.ts 와 다름: places.ts [${srcIds}] / seo-lib [${libIds}]`);

// 결과
console.log(`seo-pages-check: 새 페이지 ${newAll.length}개 (한국어 ${newPaths.length} + 영어 ${newPaths.length}), /open/ 넘김 2개`);
for (const path of newPaths) {
  const h = read(path) ?? '';
  const n = [...h.matchAll(/<ul class="races">([\s\S]*?)<\/ul>/g)].reduce((a, m) => a + (m[1].match(/<li>/g) ?? []).length, 0);
  console.log(`  ${path.padEnd(28)} 대회 ${String(n).padStart(4)}개${noindexOf(h) ? ' (noindex)' : ''}  ${titleOf(h)}`);
}
console.log(`  sitemap url ${locs.size}개`);
if (fails.length) {
  console.error(`\n실패 ${fails.length}개:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('seo-pages-check: 통과');
