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
 * 파트 A(g-geo): 월×시·도(/m/<ym>/<id>/)·5km 도 같은 검사를 받는다 + 3개 이상 조합만 있는지(데이터에서 다시 셈)·월/시·도 페이지의 링크·
 * 나라 페이지 요약 숫자(/c/*)·트레일 요약·description 160자(전체 목록 페이지)·푸터 about/faq 링크(소개 페이지가 아직 없으면 경고만).
 * 날짜는 seo-lib 의 today 를 따른다(SEO_TODAY 로 시뮬레이션하려면 seo-pages.mjs·sitemap.mjs·이 검사에 같은 값을 줄 것).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import {
  ORIGIN, PROVINCES, STATUS_EN, STATUS_LABEL, distancePages, enPath, entryStatusOf, fmt, fmtEn, isCancelled, listPages, listPagesEn, regionPages, snap, upcoming, weekend,
  INFO_PATHS, MIN_MONTH_REGION, countries, monthRegionPages, months as allMonths, provinceOf,
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
const infoWarn = new Set();
const INFO_ALL = Object.values(INFO_PATHS).flatMap((p) => [p, enPath(p)]);
const targetExists = (href) => {
  const p = decodeURIComponent(href.split(/[?#]/)[0]);
  // 소개·FAQ 페이지는 파트 B 가 만든다 — 아직 없으면 경고만 (최종은 geo-check.mjs 가 엄격하게 본다)
  if (INFO_ALL.includes(p) && !pageUrlOk(p)) {
    infoWarn.add(p);
    return true;
  }
  const m = p.match(/^(?:\/en)?\/r\/(.+)$/);
  return m ? raceById.has(m[1]) : pageUrlOk(p);
};

if (!existsSync(DIST)) {
  console.error('dist 가 없습니다. npm run build 뒤에 돌리세요.');
  process.exit(1);
}

// 1. 새 페이지 (한·영): 시·도·거리·이번 주말 + 접수 중
const newPaths = [...regionPages.map((p) => p.path), ...distancePages.map((d) => d.path), ...monthRegionPages.map((p) => p.path), weekend.path];
const newAll = [...newPaths, ...newPaths.map(enPath)];
const checkPaths = [...newPaths, '/entry-open/'];
const checkedAll = [...checkPaths, ...checkPaths.map(enPath)];
const titles = new Map();
const descs = new Map();
const pageIds = new Map();
const entryOpenCount = upcoming.filter((r) => entryStatusOf(r) === 'open').length;
const snapToday = (await import('./seo-lib.mjs')).today;
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
        : (regionPages.find((p) => p.path === koPath) ?? distancePages.find((d) => d.path === koPath) ?? monthRegionPages.find((p) => p.path === koPath))?.races.length;
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
for (const b of ['full', 'half', '10k', '5k']) if (!buckets.has(b) && (read(`/distance/${b}/`) || read(`/en/distance/${b}/`))) fail(`/distance/${b}/: 대회 0개인데 페이지가 있음`);

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

// 9. 파트 A (g-geo): 월×시·도·나라·트레일·5km·푸터 링크
{
  // 9-1. 월×시·도: 데이터에서 다시 세서 3개 이상인 조합만 있어야 한다 (한·영 같은 조합)
  const by = new Map();
  for (const r of upcoming) {
    if (r.country_code !== 'KR' || isCancelled(r)) continue;
    const id = provinceOf(r);
    if (!id) continue;
    const k = `${r.race_date.slice(0, 7)}|${id}`;
    by.set(k, [...(by.get(k) ?? []), r.id]);
  }
  const want = new Map([...by].filter(([, ids]) => ids.length >= MIN_MONTH_REGION));
  const have = new Set(monthRegionPages.map((p) => `${p.ym}|${p.id}`));
  for (const k of want.keys()) if (!have.has(k)) fail(`월×시·도 ${k}: 3개 이상인데 monthRegionPages 에 없음`);
  for (const k of have) if (!want.has(k)) fail(`월×시·도 ${k}: 3개 미만인데 monthRegionPages 에 있음`);
  // 파일: dist/m/<ym>/<id>/ 와 dist/en/m/<ym>/<id>/ 가 정확히 이 조합들
  const onDisk = (base) => {
    const root = new URL(`${base}m/`, DIST);
    if (!existsSync(root)) return [];
    return readdirSync(root)
      .filter((ym) => /^\d{4}-\d{2}$/.test(ym))
      .flatMap((ym) => readdirSync(new URL(`${ym}/`, root)).filter((x) => statSync(new URL(`${ym}/${x}`, root)).isDirectory()).map((id) => `${ym}|${id}`));
  };
  for (const [lang, base] of [['ko', ''], ['en', 'en/']]) {
    const files = new Set(onDisk(base));
    for (const k of have) if (!files.has(k)) fail(`월×시·도 ${lang} ${k}: 파일 없음`);
    for (const k of files) if (!have.has(k)) fail(`월×시·도 ${lang} ${k}: 파일이 있는데 조합이 3개 미만`);
  }
  for (const p of monthRegionPages) {
    const ids = want.get(`${p.ym}|${p.id}`) ?? [];
    if (p.races.length !== ids.length || p.races.some((r) => isCancelled(r))) fail(`${p.path}: races 가 셈과 다름`);
    for (const [path, en] of [[p.path, false], [enPath(p.path), true]]) {
      const h = read(path) ?? '';
      const hrefs = hrefsOf(h);
      const must = en ? [enPath(`/m/${p.ym}/`), enPath(`/kr/${p.id}/`)] : [`/m/${p.ym}/`, `/kr/${p.id}/`];
      for (const m of must) if (!hrefs.includes(m)) fail(`${path}: ${m} 링크 없음`);
      if (!h.includes(en ? p.nameEn : p.name)) fail(`${path}: 시·도 이름이 없음`);
      if (!titleOf(h)?.includes(en ? p.nameEn : p.name) || !(h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '').includes(en ? p.nameEn : p.name)) fail(`${path}: title·description 에 시·도 이름이 없음`);
      const ymLabel = en ? new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${p.ym}-01T00:00:00Z`)) : `${Number(p.ym.slice(0, 4))}년 ${Number(p.ym.slice(5, 7))}월`;
      if (!titleOf(h)?.includes(ymLabel)) fail(`${path}: title 에 월 이름(${ymLabel})이 없음`);
      // 취소 대회 줄 없음
      if (h.includes('class="x"')) fail(`${path}: 취소 대회 줄이 있음`);
    }
    // 들어오는 링크: 월 페이지·시·도 페이지
    for (const [from, target] of [[`/m/${p.ym}/`, p.path], [`/kr/${p.id}/`, p.path], [enPath(`/m/${p.ym}/`), enPath(p.path)], [enPath(`/kr/${p.id}/`), enPath(p.path)]]) {
      if (!hrefsOf(read(from) ?? '').includes(target)) fail(`${from}: ${target} 링크 없음`);
    }
  }
  // 월 페이지의 '시·도별' 줄 = 그 달의 조합 전부 (조합이 없는 달에는 링크가 없다)
  const linked = (h) => hrefsOf(h).filter((x) => /^(\/en)?\/m\/\d{4}-\d{2}\/[a-z-]+\/$/.test(x));
  for (const ym of allMonths) {
    const expect = monthRegionPages.filter((p) => p.ym === ym).map((p) => p.path);
    const got = linked(read(`/m/${ym}/`) ?? '').filter((x, i, a) => a.indexOf(x) === i);
    // /m/<ym>/ 의 월 이동 링크는 /m/<다른 월>/ 한 단계라 여기 안 걸린다 — 시·도 줄만 비교
    if (expect.join('|') !== got.filter((x) => x.startsWith(`/m/${ym}/`)).join('|')) fail(`/m/${ym}/: 시·도 링크 ${got.length}개가 조합 ${expect.length}개와 다름`);
  }

  // 9-2. 나라 페이지: 요약 숫자 = 데이터, /c/kr/ title 이 /kr/ 과 다름
  for (const c of countries) {
    const up = c.races.filter((r) => r.race_date >= snapToday).length;
    const h = read(`/c/${c.code}/`) ?? '';
    const he = read(`/en/c/${c.code}/`) ?? '';
    const lead = unesc(h.match(/<p class="lead">([^<]*)<\/p>/)?.[1] ?? '');
    const leadEn = unesc(he.match(/<p class="lead">([^<]*)<\/p>/)?.[1] ?? '');
    if (!lead || !leadEn) fail(`/c/${c.code}/: lead 없음`);
    if (c.races.length > 1) {
      if (!lead.includes(`${c.races.length}개`)) fail(`/c/${c.code}/: lead 에 전체 대회 수 ${c.races.length} 없음`);
      if (up && !lead.includes(`${up}개`)) fail(`/c/${c.code}/: lead 에 다가오는 대회 수 ${up} 없음`);
      if (!leadEn.includes(c.races.length.toLocaleString('en-US'))) fail(`/en/c/${c.code}/: lead 에 전체 대회 수 없음`);
    }
    if (/undefined|null|NaN|\s{2,}/.test(lead + leadEn)) fail(`/c/${c.code}/: lead 에 값 오류 글자`);
    if (/\(\s*\)|, ,|\.\./.test(lead + leadEn)) fail(`/c/${c.code}/: lead 문장부호 이상`);
  }
  if (titleOf(read('/c/kr/') ?? '') === titleOf(read('/kr/') ?? '')) fail('/c/kr/ title 이 /kr/ 와 같음');
  if (titleOf(read('/en/c/kr/') ?? '') === titleOf(read('/en/kr/') ?? '')) fail('/en/c/kr/ title 이 /en/kr/ 와 같음');

  // 9-3. 트레일: 요약 숫자
  const trailUp = upcoming.filter((r) => r.discipline === 'trail');
  const tkr = trailUp.filter((r) => r.country_code === 'KR').length;
  if (trailUp.length) {
    const tl = unesc(read('/trail/')?.match(/<p class="lead">([^<]*)<\/p>/)?.[1] ?? '');
    if (!tl.includes(`국내 ${tkr}개`) || !tl.includes(`해외 ${trailUp.length - tkr}개`)) fail(`/trail/: lead 의 국내·해외 수가 데이터(${tkr}/${trailUp.length - tkr})와 다름: ${tl}`);
    const tle = unesc(read('/en/trail/')?.match(/<p class="lead">([^<]*)<\/p>/)?.[1] ?? '');
    if (!tle.includes(`${tkr} upcoming trail races in Korea and ${trailUp.length - tkr} abroad`)) fail(`/en/trail/: lead 의 수가 데이터와 다름: ${tle}`);
  }

  // 9-4. 전체 목록 페이지 description 160자 이하, 푸터 about/faq 링크 (새 페이지 + 보강 페이지)
  for (const p of [...listPages, ...listPagesEn]) {
    const h = read(p.path) ?? '';
    const d = unesc(h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? '');
    if (d.length > 160) fail(`${p.path}: description 160자 넘음 (${d.length})`);
    if (!d) fail(`${p.path}: description 없음`);
    const en = p.path.startsWith('/en/');
    for (const info of Object.values(INFO_PATHS)) {
      const want = en ? enPath(info) : info;
      if (!hrefsOf(h).includes(want)) fail(`${p.path}: 푸터에 ${want} 링크 없음`);
    }
  }
  // 5km: 앱 거리 필터와 같은 묶음 (id 목록)
  const d5 = distancePages.find((d) => d.bucket === '5k');
  if (!d5) fail('distancePages 에 5k 가 없음');
  else if (!unesc(read('/distance/5k/')?.match(/<p class="lead">([^<]*)<\/p>/)?.[1] ?? '').includes(`${d5.races.length}개`)) fail('/distance/5k/: lead 의 대회 수가 데이터와 다름');
}
if (infoWarn.size) console.warn(`경고: 소개·FAQ 페이지가 아직 없음(파트 B) — ${[...infoWarn].join(' ')}`);

// 결과
const countLis = (path) => lisOf(read(path) ?? '').length;
const noindexN = checkedAll.filter((p) => read(p) && noindexOf(read(p))).length;
console.log(
  `seo-pages-check: 새 페이지 ${newAll.length}개 (한국어 ${newPaths.length} + 영어 ${newPaths.length}) + 접수 중 2개(/entry-open/ 한·영) 검사, /open/ 넘김 2개, noindex ${noindexN}개`,
);
console.log(`  월×시·도 ${monthRegionPages.length}개 (한국어·영어 각각, 대회 ${MIN_MONTH_REGION}개 이상 조합만 — 아래 목록에서는 줄여서 첫 3개만)`);
for (const path of checkPaths.filter((p) => !monthRegionPages.slice(3).some((m) => m.path === p))) {
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
