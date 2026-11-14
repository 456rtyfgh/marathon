/**
 * 빌드 뒤 dist 의 검색 유입 정적 페이지 검사 (PLAN 파트 B). 실패가 하나라도 있으면 exit 1.
 *   node scripts/seo-pages-check.mjs
 * 새 페이지(시·도·거리·이번 주말 + /entry-open/, 한·영) 전부에 대해 본다:
 *   title·description 고유(기존 목록 페이지 포함, description 160자 이하) · canonical = 자기 주소 · hreflang ko/en/x-default 상호 참조 ·
 *   h1 1개 · 관련 링크 nav · JSON-LD 전부 JSON.parse · BreadcrumbList(대상 존재)·ItemList(수 = 목록 <li> 수, url = /r/<id>·/en/r/<id>, id 는 data.json) ·
 *   내부 링크(href="/…") 대상 존재 · 줄마다 접수 상태 글자(취소 제외)·미확정 접수일 숨김·id 중복 0 · 이모지 0 ·
 *   빈 페이지(대회 0개)는 noindex(시·도·거리는 파일 자체가 없음) · 한·영 목록 수·순서 같음 · 목록 수 = 데이터.
 * 그 밖: sitemap 에 새 주소가 있고 noindex·/open/ 은 없음, lastmod 형식, /open/ 넘김, dist/d/ 아래 html 없음, 기존 랜딩 canonical·title,
 * seo-lib 에 옮겨 적은 시·도 id = src/lib/places.ts.
 * 날짜는 seo-lib 의 today 를 따른다(SEO_TODAY 로 시뮬레이션하려면 seo-pages.mjs·sitemap.mjs·이 검사에 같은 값을 줄 것).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import {
  ORIGIN, PROVINCES, STATUS_EN, STATUS_LABEL, distancePages, enPath, entryStatusOf, fmt, fmtEn, isCancelled, listPages, listPagesEn, regionPages, snap, upcoming, weekend,
} from './seo-lib.mjs';
import { isEntryConfirmed } from '../src/lib/util.ts';

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
const unesc = (t) => t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u; // ©(푸터 저작권 표기)는 이모지가 아니다
const raceById = new Map(snap.races.map((r) => [r.id, r]));
const hrefsOf = (h) => [...h.matchAll(/\bhref="([^"]*)"/g)].map((m) => m[1]);
const lisOf = (h) =>
  [...h.matchAll(/<ul class="races">([\s\S]*?)<\/ul>/g)].flatMap((m) => [...m[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((x) => x[1]));
const idOfLi = (li) => unesc(li.match(/href="(?:\/en)?\/r\/([^"]+)"/)?.[1] ?? '');
/** 폴더 주소('/kr/')는 dist/<path>/index.html, 그 밖('/favicon.svg')은 dist 파일 */
const pageUrlOk = (p) => (p.endsWith('/') ? !!read(p) : existsSync(new URL(`.${p}`, DIST)) || existsSync(new URL(`.${p}.html`, DIST))); // /terms → terms.html
/** 내부 링크 대상 존재: /r/<id>·/en/r/<id> 는 data.json id (preview 가 상세를 못 내줘서), 나머지는 dist */
const targetExists = (href) => {
  const p = decodeURIComponent(href.split(/[?#]/)[0]);
  const m = p.match(/^(?:\/en)?\/r\/(.+)$/);
  return m ? raceById.has(m[1]) : pageUrlOk(p);
};

if (!existsSync(DIST)) {
  console.error('dist 가 없습니다. npm run build 뒤에 돌리세요.');
  process.exit(1);
}

// 1. 새 페이지 (한·영): 시·도·거리·이번 주말 + 접수 중
const newPaths = [...regionPages.map((p) => p.path), ...distancePages.map((d) => d.path), weekend.path];
const newAll = [...newPaths, ...newPaths.map(enPath)];
const checkPaths = [...newPaths, '/entry-open/'];
const checkedAll = [...checkPaths, ...checkPaths.map(enPath)];
const titles = new Map();
const descs = new Map();
const pageIds = new Map();
const entryOpenCount = upcoming.filter((r) => entryStatusOf(r) === 'open').length;
const isLandingEmptyOk = (koPath) => koPath === weekend.path || koPath === '/entry-open/';

for (const path of checkedAll) {
  const h = read(path);
  if (!h) {
    fail(`${path}: 파일 없음`);
    continue;
  }
  const en = path.startsWith('/en/');
  const koPath = en ? path.slice(3) : path;
  const t = titleOf(h);
  if (!t) fail(`${path}: title 없음`);
  else titles.set(t, [...(titles.get(t) ?? []), path]);
  const desc = pick(h, /<meta name="description" content="([^"]*)">/);
  if (!desc) fail(`${path}: description 없음`);
  else {
    if (unesc(desc).length > 160) fail(`${path}: description 160자 넘음 (${unesc(desc).length})`);
    descs.set(desc, [...(descs.get(desc) ?? []), path]);
  }
  if (canonOf(h) !== `${ORIGIN}${path}`) fail(`${path}: canonical ${canonOf(h)} ≠ 자기 주소`);
  // hreflang: ko·en·x-default 가 한·영 짝을 가리킨다 (짝 페이지도 같은 세 개를 가지므로 서로 참조)
  const hl = Object.fromEntries([...h.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]*)">/g)].map((m) => [m[1], m[2]]));
  if (hl.ko !== `${ORIGIN}${koPath}`) fail(`${path}: hreflang ko ${hl.ko} ≠ ${koPath}`);
  if (hl.en !== `${ORIGIN}${enPath(koPath)}`) fail(`${path}: hreflang en ${hl.en} ≠ ${enPath(koPath)}`);
  if (hl['x-default'] !== `${ORIGIN}${koPath}`) fail(`${path}: hreflang x-default ${hl['x-default']} ≠ ${koPath}`);
  if (!read(koPath) || !read(enPath(koPath))) fail(`${path}: hreflang 짝 페이지 파일 없음`);
  if (!h.includes(`<html lang="${en ? 'en' : 'ko'}">`)) fail(`${path}: html lang 이 ${en ? 'en' : 'ko'} 가 아님`);
  // h1 1개, 관련 링크 nav
  const nh1 = (h.match(/<h1>/g) ?? []).length;
  if (nh1 !== 1 || !/<h1>[^<]+<\/h1>/.test(h)) fail(`${path}: h1 ${nh1}개 (딱 1개여야 함)`);
  if (!h.includes('class="links"')) fail(`${path}: 관련 링크 nav 없음`);
  // JSON-LD
  const parsed = [];
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      parsed.push(JSON.parse(m[1]));
    } catch (e) {
      fail(`${path}: JSON-LD JSON.parse 실패 (${e.message})`);
    }
  }
  const bc = parsed.find((v) => v['@type'] === 'BreadcrumbList');
  const il = parsed.find((v) => v['@type'] === 'ItemList');
  if (!bc) fail(`${path}: BreadcrumbList 없음`);
  else {
    bc.itemListElement.forEach((e, i) => {
      if (e.position !== i + 1 || !e.name || !String(e.item).startsWith(ORIGIN)) fail(`${path}: BreadcrumbList ${i + 1}번째 항목 이상`);
      else if (!pageUrlOk(e.item.slice(ORIGIN.length))) fail(`${path}: BreadcrumbList 대상 없음 ${e.item}`);
    });
    if (bc.itemListElement.at(-1)?.item !== `${ORIGIN}${path}`) fail(`${path}: BreadcrumbList 마지막 항목이 자기 주소가 아님`);
  }
  const lis = lisOf(h);
  const ids = lis.map(idOfLi);
  pageIds.set(path, ids);
  if (!il) fail(`${path}: ItemList 없음`);
  else {
    if (il.itemListElement.length !== lis.length) fail(`${path}: ItemList ${il.itemListElement.length}개 ≠ 목록 <li> ${lis.length}개`);
    const prefix = `${ORIGIN}${en ? '/en' : ''}/r/`;
    il.itemListElement.forEach((e, i) => {
      const id = String(e.url).startsWith(prefix) ? decodeURIComponent(String(e.url).slice(prefix.length)) : null;
      if (id == null) fail(`${path}: ItemList url 꼴 이상 (${e.url})`);
      else if (!raceById.has(id)) fail(`${path}: ItemList url 의 id 가 data.json 에 없음 (${id})`);
      else if (id !== ids[i]) fail(`${path}: ItemList ${i + 1}번째가 화면 목록과 다름`);
      if (!e.name) fail(`${path}: ItemList ${i + 1}번째 name 없음`);
    });
  }
  // 줄마다: id 중복 0, data.json 대회, 접수 상태 글자, 미확정 접수일 숨김
  if (new Set(ids).size !== ids.length) fail(`${path}: 같은 대회가 두 번 나옴`);
  const labels = en ? STATUS_EN : STATUS_LABEL;
  for (const li of lis) {
    const id = idOfLi(li);
    const r = raceById.get(id);
    if (!r) {
      fail(`${path}: 목록 줄 id ${id} 가 data.json 에 없음`);
      continue;
    }
    const meta = unesc(li.match(/<span class="meta">([\s\S]*?)<\/span>/)?.[1] ?? '');
    if (!meta) fail(`${path}: ${id} 줄에 날짜·장소 글 없음`);
    if (!meta.includes(en ? fmtEn(r.race_date) : fmt(r.race_date))) fail(`${path}: ${id} 줄에 대회 날짜 없음`);
    if (!isCancelled(r)) {
      const st = labels[entryStatusOf(r)];
      if (!meta.includes(st)) fail(`${path}: ${id} 줄에 접수 상태 "${st}" 없음 (${meta})`);
    }
    // 접수 기간은 확정일 때만 (미확정이면 날짜 글이 없어야 하고, 확정이면 있는 날짜는 적혀 있어야 한다)
    const hasDates = en ? meta.includes('registration') : /접수 .+부터|까지/.test(meta);
    if (!isEntryConfirmed(r)) {
      if (hasDates) fail(`${path}: 미확정 접수일 ${id} 줄에 접수 날짜가 있음 (${meta})`);
    } else if (r.entry_opens || r.entry_closes) {
      if (!hasDates) fail(`${path}: 확정 ${id} 줄에 접수 기간 없음 (${meta})`);
    }
  }
  // 내부 링크 대상 존재
  for (const href of hrefsOf(h)) {
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    if (!targetExists(href)) fail(`${path}: 깨진 내부 링크 ${href}`);
  }
  if (EMOJI.test(h)) fail(`${path}: 이모지가 있음 (${h.match(EMOJI)[0]})`);
  // 빈 페이지는 noindex, 대회가 있으면 noindex 아님
  if (lis.length === 0 && !noindexOf(h)) fail(`${path}: 대회 0개인데 noindex 없음`);
  if (lis.length === 0 && !isLandingEmptyOk(koPath)) fail(`${path}: 시·도·거리 페이지가 비어 있음 (대회 0개면 만들지 않는다)`);
  if (lis.length > 0 && noindexOf(h)) fail(`${path}: 대회가 있는데 noindex`);
  // 목록 수 = 데이터
  const want =
    koPath === weekend.path
      ? weekend.races.length
      : koPath === '/entry-open/'
        ? entryOpenCount
        : (regionPages.find((p) => p.path === koPath) ?? distancePages.find((d) => d.path === koPath))?.races.length;
  if (want !== lis.length) fail(`${path}: 목록 ${lis.length}개 ≠ 데이터 ${want}개`);
}
// 한·영 목록 수·순서 같음
for (const koPath of checkPaths) {
  const a = pageIds.get(koPath);
  const b = pageIds.get(enPath(koPath));
  if (a && b && a.join('|') !== b.join('|')) fail(`${koPath}: 한·영 목록 대회 수·순서가 다름 (${a.length} / ${b.length})`);
}

// 2. title·description 은 기존 목록 페이지 포함 전부 서로 달라야 한다
for (const p of [...listPages, ...listPagesEn]) {
  const h = read(p.path);
  if (!h) {
    fail(`${p.path}: sitemap 목록에 있는데 파일 없음`);
    continue;
  }
  if (checkedAll.includes(p.path)) continue;
  const t = titleOf(h);
  if (t) titles.set(t, [...(titles.get(t) ?? []), p.path]);
  const d = pick(h, /<meta name="description" content="([^"]*)">/);
  if (d) descs.set(d, [...(descs.get(d) ?? []), p.path]);
}
for (const [t, ps] of titles) if (ps.length > 1) fail(`title 겹침 "${t}": ${ps.join(', ')}`);
for (const [d, ps] of descs) if (ps.length > 1) fail(`description 겹침 "${d.slice(0, 40)}…": ${ps.join(', ')}`);

// 3. 0개 시·도·거리는 파일이 없어야 한다
const regionIds = new Set(regionPages.map((p) => p.id));
for (const p of PROVINCES) if (!regionIds.has(p.id) && (read(`/kr/${p.id}/`) || read(`/en/kr/${p.id}/`))) fail(`/kr/${p.id}/: 대회 0개인데 페이지가 있음`);
const buckets = new Set(distancePages.map((d) => d.bucket));
for (const b of ['full', 'half', '10k']) if (!buckets.has(b) && (read(`/distance/${b}/`) || read(`/en/distance/${b}/`))) fail(`/distance/${b}/: 대회 0개인데 페이지가 있음`);

// 4. sitemap
const sm = readFileSync(new URL('sitemap.xml', DIST), 'utf8');
const locs = new Set([...sm.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]));
for (const m of sm.matchAll(/<lastmod>([^<]*)<\/lastmod>/g)) if (!/^\d{4}-\d{2}-\d{2}$/.test(m[1])) fail(`sitemap: lastmod 형식 이상 (${m[1]})`);
for (const path of checkedAll) {
  const h = read(path);
  const want = h && !noindexOf(h);
  if (want && !locs.has(`${ORIGIN}${path}`)) fail(`sitemap: ${path} 없음`);
  if (!want && locs.has(`${ORIGIN}${path}`)) fail(`sitemap: noindex 인 ${path} 가 들어 있음`);
}
for (const path of ['/open/', '/en/open/']) if (locs.has(`${ORIGIN}${path}`)) fail(`sitemap: ${path} 가 들어 있음`);
for (const loc of locs) {
  const p = loc.slice(ORIGIN.length);
  if (p.endsWith('/') && read(p) && noindexOf(read(p))) fail(`sitemap: noindex 인 ${p} 가 들어 있음`);
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
  if (!titleOf(h)) fail(`${path}: title 없음`);
  if (!read(target)) fail(`${path}: 넘길 ${target} 파일 없음`);
  if (titles.has(titleOf(h) ?? '')) fail(`${path}: title 이 다른 페이지와 겹침`);
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
// /kr/ 보강: 시·도 링크 (영어도)
const krHtml = read('/kr/') ?? '';
const krEn = read('/en/kr/') ?? '';
for (const p of regionPages) {
  if (!krHtml.includes(`href="${p.path}"`)) fail(`/kr/: ${p.path} 링크 없음`);
  if (!krEn.includes(`href="${enPath(p.path)}"`)) fail(`/en/kr/: ${enPath(p.path)} 링크 없음`);
}

// 8. 시·도 id = src/lib/places.ts
const placesSrc = readFileSync(new URL('../src/lib/places.ts', import.meta.url), 'utf8');
const block = placesSrc.slice(placesSrc.indexOf('export const PROVINCES'), placesSrc.indexOf('];', placesSrc.indexOf('export const PROVINCES')));
const srcIds = [...block.matchAll(/id: '([^']+)'/g)].map((m) => m[1]);
const libIds = PROVINCES.map((p) => p.id);
if (srcIds.join(',') !== libIds.join(',')) fail(`시·도 id 가 places.ts 와 다름: places.ts [${srcIds}] / seo-lib [${libIds}]`);

// 결과
const countLis = (path) => lisOf(read(path) ?? '').length;
const noindexN = checkedAll.filter((p) => read(p) && noindexOf(read(p))).length;
console.log(
  `seo-pages-check: 새 페이지 ${newAll.length}개 (한국어 ${newPaths.length} + 영어 ${newPaths.length}) + 접수 중 2개(/entry-open/ 한·영) 검사, /open/ 넘김 2개, noindex ${noindexN}개`,
);
for (const path of checkPaths) {
  const h = read(path) ?? '';
  console.log(`  ${path.padEnd(28)} 대회 ${String(countLis(path)).padStart(4)}개${noindexOf(h) ? ' (noindex)' : ''}  ${titleOf(h)}`);
}
console.log(`  sitemap url ${locs.size}개`);
if (fails.length) {
  console.error(`\n실패 ${fails.length}개:`);
  for (const f of fails.slice(0, 80)) console.error(`  - ${f}`);
  if (fails.length > 80) console.error(`  … 외 ${fails.length - 80}개`);
  process.exit(1);
}
console.log('seo-pages-check: 통과');
