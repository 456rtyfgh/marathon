/**
 * dist 전체 공통 검사 (빌드 뒤 따로 실행, 실패 시 exit 1): node scripts/geo-check.mjs
 *  - dist/**\/*.html: title 비어 있지 않음·고유, canonical 자기 주소, hreflang ko/en/x-default 상호 참조,
 *    모든 JSON-LD JSON.parse, 내부 링크(href="/…") 대상 존재, 이모지 0, h1 1개 (noindex·/open/ 넘김은 title·h1·hreflang 제외)
 *  - 새 페이지: /about/·/faq/(+en), llms.txt, IndexNow 키 파일(내용=키), sitemap 내용·형식
 *  - 구조화 데이터: 홈 Organization·WebSite 가 info-lib 값과 같음, 한 페이지에 Organization 전체 정의가 둘 이상 없음
 *  - 빙 meta 는 값이 빈 때 출력되지 않음, robots.txt 변경 없음, llms.txt 에 /r/ 링크 없음
 * /r/<id> 는 워커가 만들어 dist 에 없으므로 링크 대상 id 만 data.json 으로 확인한다.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDEXNOW_KEY } from './indexnow-config.mjs';
import { INFO_PAGES, aboutContent, bingVerification, faqContent, orgLd, websiteLd, ORG_ID } from './info-lib.mjs';
import { ORIGIN, races, today } from './seo-lib.mjs';
import * as seoLib from './seo-lib.mjs';
import { parseSitemap } from './sitemap-diff.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const DIST = join(ROOT, 'dist');
const errors = [];
const warns = [];
const err = (m) => errors.push(m);
if (!existsSync(DIST)) {
  console.error('geo-check: dist 가 없습니다. 먼저 npm run build');
  process.exit(1);
}

// ── dist 의 html 모으기 ──
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
const rel = (f) => relative(DIST, f).split('\\').join('/');
// 동시 빌드 흔적(이름 끝에 ' 2' — 두 빌드가 같은 dist 를 쓰면 생긴다): 검사 대상에서 빼고 따로 경고한다
const STRAY = / 2(\.[^/.]+)?$/;
const allFiles = walk(DIST);
const stray = allFiles.filter((f) => STRAY.test(rel(f)));
// 검색엔진 소유 확인 파일(navere….html)은 페이지가 아니다
const htmlFiles = allFiles.filter((f) => f.endsWith('.html') && !STRAY.test(rel(f)) && !relative(DIST, f).startsWith('assets/') && !/^navere[0-9a-f]+\.html$/.test(rel(f)));
/** dist 파일 → 사이트 주소 경로 */
const urlPath = (f) => {
  const r = rel(f);
  if (r === 'index.html') return '/';
  if (r.endsWith('/index.html')) return `/${r.slice(0, -'index.html'.length)}`;
  return `/${r.slice(0, -'.html'.length)}`;
};
if (stray.length) warns.push(`dist 에 동시 빌드 흔적 파일 ${stray.length}개(${rel(stray[0])} 등) — 배포 전 npm run build 를 혼자 다시 돌릴 것`);

const raceIds = new Set(races.map((r) => r.id));
const distExists = (p) => {
  const clean = decodeURIComponent(p);
  const t = join(DIST, clean);
  if (!t.startsWith(DIST)) return false;
  if (clean.endsWith('/')) return existsSync(join(t, 'index.html'));
  return existsSync(t) && statSync(t).isFile() ? true : existsSync(`${t}.html`) || existsSync(join(t, 'index.html'));
};
/** 내부 링크 경로가 실제로 있나 (/r/<id>·/en/r/<id> 는 data.json 의 id) */
// 정적 파일이 아니라 앱(React)·워커가 여는 주소
const APP_PATH = /^\/(en\/)?(privacy|community(\/.*)?)$/;
const linkOk = (p) => {
  if (APP_PATH.test(p.replace(/\/$/, ''))) return true;
  const m = p.match(/^\/(?:en\/)?r\/(.+)$/);
  if (m) return raceIds.has(decodeURIComponent(m[1]));
  if (p === '/') return true;
  return distExists(p);
};

const meta = (html, re) => html.match(re)?.[1];
const pages = htmlFiles.map((f) => {
  const html = readFileSync(f, 'utf8');
  const path = urlPath(f);
  const robots = meta(html, /<meta\s+name="robots"\s+content="([^"]*)"/i) ?? '';
  const noindex = /noindex/i.test(robots);
  const refresh = /http-equiv="refresh"/i.test(html) || path === '/open/' || path === '/en/open/';
  return { f, path, html, noindex, skip: noindex || refresh };
});
const byPath = new Map(pages.map((p) => [p.path, p]));
const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

// ── 페이지별 검사 ──
const titles = new Map();
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
/** Organization 전체 정의(@id 만 있는 참조는 제외) 수 */
const countOrgDefs = (node) => {
  if (Array.isArray(node)) return node.reduce((n, v) => n + countOrgDefs(v), 0);
  if (!node || typeof node !== 'object') return 0;
  let n = node['@type'] === 'Organization' && Object.keys(node).some((k) => !['@id', '@type', '@context'].includes(k)) ? 1 : 0;
  for (const [k, v] of Object.entries(node)) if (k !== '@context') n += countOrgDefs(v);
  return n;
};
const EMOJI = /\p{Emoji_Presentation}|\uFE0F|\u200D/u;
for (const p of pages) {
  const where = p.path;
  const html = p.html;
  // JSON-LD
  for (const [i, b] of ldBlocks(html).entries()) {
    try {
      JSON.parse(b);
    } catch (e) {
      err(`${where}: JSON-LD #${i + 1} 파싱 실패 (${e.message})`);
    }
  }
  // 이모지
  const text = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const em = text.match(EMOJI);
  if (em) err(`${where}: 이모지 ${JSON.stringify(em[0])}`);
  // Organization 중복
  const orgDefs = ldBlocks(html).reduce((n, b) => {
    try {
      return n + countOrgDefs(JSON.parse(b));
    } catch {
      return n;
    }
  }, 0);
  if (orgDefs > 1) err(`${where}: Organization 전체 정의가 ${orgDefs}개 (한 페이지에 하나만)`);
  // 내부 링크
  const bad = new Set();
  for (const m of html.matchAll(/\bhref="(\/[^"]*)"/g)) {
    const href = decode(m[1]);
    if (href.startsWith('//')) continue;
    const path = href.split('#')[0].split('?')[0];
    if (!path) continue;
    if (!linkOk(path)) bad.add(href);
  }
  if (bad.size) err(`${where}: 깨진 내부 링크 ${bad.size}개 예) ${[...bad].slice(0, 3).join(' ')}`);
  if (p.skip) continue;

  // title
  const title = decode(meta(html, /<title>([^<]*)<\/title>/) ?? '').trim();
  if (!title) err(`${where}: title 이 비어 있음`);
  else titles.set(title, [...(titles.get(title) ?? []), where]);
  // 문서 언어
  const lang = meta(html, /<html\s+lang="([^"]*)"/);
  const wantLang = p.path === '/en/' || p.path.startsWith('/en/') ? 'en' : 'ko';
  if (lang !== wantLang) err(`${where}: <html lang="${lang}"> (기대 ${wantLang})`);
  // canonical
  const canon = meta(html, /<link\s+rel="canonical"\s+href="([^"]*)"/);
  if (canon !== `${ORIGIN}${p.path}`) err(`${where}: canonical ${canon} (기대 ${ORIGIN}${p.path})`);
  // h1
  const h1 = (html.replace(/<script[\s\S]*?<\/script>/g, '').match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) err(`${where}: h1 ${h1}개`);
  // hreflang 상호 참조: ko/en/x-default 가 있고, ko·en 짝 페이지에서도 같은 값
  if (/^\/(terms|navere)/.test(p.path) || p.path === '/en/terms') {
    // 약관은 페이지 헤드에 hreflang 가 있어야 하는지 아래 공통 규칙으로 본다
  }
  const hl = Object.fromEntries([...html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]*)"\s+href="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  if (!hl.ko || !hl.en || !hl['x-default']) err(`${where}: hreflang ko/en/x-default 중 빠진 것 ${JSON.stringify(Object.keys(hl))}`);
  else {
    if (hl['x-default'] !== hl.ko) err(`${where}: x-default(${hl['x-default']}) 가 ko(${hl.ko}) 와 다름`);
    if (![hl.ko, hl.en].includes(`${ORIGIN}${p.path}`)) err(`${where}: hreflang 에 자기 주소가 없음`);
    for (const alt of [hl.ko, hl.en]) {
      const ap = alt.startsWith(ORIGIN) ? alt.slice(ORIGIN.length) : null;
      const other = ap && byPath.get(ap);
      if (!other) err(`${where}: hreflang 대상 ${alt} 가 dist 에 없음`);
      else {
        const oh = Object.fromEntries([...other.html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]*)"\s+href="([^"]*)"/g)].map((m) => [m[1], m[2]]));
        if (oh.ko !== hl.ko || oh.en !== hl.en) err(`${where}: hreflang 가 짝 페이지 ${ap} 와 서로 다름`);
      }
    }
  }
}
for (const [t, ps] of titles) if (ps.length > 1) err(`title 중복 "${t}": ${ps.slice(0, 4).join(' ')}${ps.length > 4 ? ` 외 ${ps.length - 4}` : ''}`);

// ── 새 페이지 ──
for (const p of ['/about/', '/faq/', '/en/about/', '/en/faq/']) {
  const pg = byPath.get(p);
  if (!pg) err(`${p} 가 dist 에 없음`);
  else if (pg.noindex) err(`${p} 가 noindex`);
}
// 내용: about 의 수치는 data.json 에서 직접 센 값과 같아야 한다 (info-lib 의 계산을 믿지 않고 여기서 다시 센다)
{
  const kr = races.filter((r) => r.country_code === 'KR').length;
  const abroadCodes = new Set(races.filter((r) => r.country_code !== 'KR' && r.country_code).map((r) => r.country_code));
  const trail = races.filter((r) => r.discipline === 'trail').length;
  const upcomingN = races.filter((r) => r.race_date >= today).length;
  const f = (n) => n.toLocaleString('en-US');
  for (const p of ['/about/', '/en/about/']) {
    const h = byPath.get(p)?.html;
    if (!h) continue;
    for (const [label, n] of [['전체', races.length], ['오늘 이후', upcomingN], ['국내', kr], ['해외', races.length - kr], ['나라', abroadCodes.size], ['트레일', trail]])
      if (!h.includes(f(n))) err(`${p}: ${label} 수 ${f(n)} 가 본문에 없음`);
  }
  const faq = byPath.get('/faq/')?.html;
  if (faq) {
    const n = (faq.match(/<section id="q\d+">/g) ?? []).length;
    if (n < 8 || n > 12) err(`/faq/: 질문 ${n}개 (8~12개)`);
    const ld = ldBlocks(faq).map((b) => JSON.parse(b)).find((x) => x['@type'] === 'FAQPage');
    if (!ld || ld.mainEntity.length !== n) err(`/faq/: FAQPage JSON-LD 질문 수(${ld?.mainEntity?.length})가 본문(${n})과 다름`);
  }
  for (const [lang, c] of [['ko', [aboutContent('ko'), faqContent('ko')]], ['en', [aboutContent('en'), faqContent('en')]]])
    for (const x of c) if ([...x.description].length > 160) err(`${lang} ${x.path}: description ${[...x.description].length}자 (160자 이하)`);
}
// llms.txt
const llmsFile = join(DIST, 'llms.txt');
if (!existsSync(llmsFile)) err('llms.txt 가 dist 에 없음');
else {
  const llms = readFileSync(llmsFile, 'utf8');
  if (/\/r\/[^\s)]/.test(llms)) err('llms.txt 에 /r/ 대회 링크가 있음 (대회 데이터 덤프 금지)');
  const bad = [...llms.matchAll(/\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g)]
    .map((m) => m[1])
    .filter((u) => u.startsWith(ORIGIN) || u.startsWith('/'))
    .map((u) => (u.startsWith('/') ? u : u.slice(ORIGIN.length)) || '/')
    .filter((u) => !linkOk(u.split('#')[0].split('?')[0]));
  if (bad.length) err(`llms.txt 링크 대상이 dist 에 없음: ${bad.slice(0, 3).join(' ')}`);
}
// IndexNow 키 파일
{
  const kf = join(DIST, `${INDEXNOW_KEY}.txt`);
  if (!existsSync(kf)) err(`dist/${INDEXNOW_KEY}.txt 가 없음`);
  else if (readFileSync(kf, 'utf8') !== INDEXNOW_KEY) err(`dist/${INDEXNOW_KEY}.txt 내용이 키와 다름`);
  if (!/^[0-9a-f]{32}$/.test(INDEXNOW_KEY)) err('IndexNow 키가 32자 hex 가 아님');
}

// ── sitemap ──
{
  const sf = join(DIST, 'sitemap.xml');
  if (!existsSync(sf)) err('sitemap.xml 이 없음');
  else {
    const xml = readFileSync(sf, 'utf8');
    const map = parseSitemap(xml);
    const locs = [...map.keys()];
    const has = (p) => map.has(`${ORIGIN}${p}`);
    for (const x of INFO_PAGES) if (!has(x.path)) err(`sitemap 에 ${x.path} 가 없음`);
    for (const [loc, mod] of map) if (!/^\d{4}-\d{2}-\d{2}$/.test(mod)) err(`sitemap lastmod 형식 이상 ${loc} ${mod}`);
    for (const x of INFO_PAGES) if (map.get(`${ORIGIN}${x.path}`) !== x.lastmod) err(`sitemap ${x.path} lastmod ${map.get(`${ORIGIN}${x.path}`)} (기대 ${x.lastmod})`);
    if (locs.some((l) => /\/(en\/)?open\/$/.test(l))) err('sitemap 에 /open/ 이 들어 있음');
    // noindex 페이지는 sitemap 에 없어야 하고, sitemap 의 비-/r/ 주소는 dist 에 있어야 한다
    for (const p of pages) if (p.noindex && map.has(`${ORIGIN}${p.path}`)) err(`sitemap 에 noindex 페이지 ${p.path}`);
    for (const l of locs) {
      if (!l.startsWith(`${ORIGIN}/`)) {
        err(`sitemap 에 다른 호스트 주소 ${l}`);
        continue;
      }
      const path = l.slice(ORIGIN.length);
      if (!linkOk(decodeURI(path))) err(`sitemap 주소가 dist·data.json 에 없음 ${path}`);
    }
    // 파트 A 가 만든 새 종류(월×시·도·5km): seo-lib 가 알고 있으면 그 목록과 같게, 없으면 주소 모양으로
    const mrp = seoLib.monthRegionPages;
    const mrLocs = locs.filter((l) => /\/m\/\d{4}-\d{2}\/[a-z-]+\/$/.test(l) && !l.includes('/en/'));
    if (mrp) {
      if (mrLocs.length !== mrp.length) err(`sitemap 월×시·도 ${mrLocs.length}개 (seo-lib ${mrp.length}개)`);
      for (const x of mrp) if (!has(x.path)) err(`sitemap 에 ${x.path} 가 없음`);
    } else warns.push('seo-lib 에 monthRegionPages 가 아직 없음 (파트 A) — 월×시·도 검사 생략');
    if (!has('/distance/5k/')) warns.push('sitemap 에 /distance/5k/ 가 없음 (파트 A 몫)');
  }
}

// ── 구조화 데이터: 홈 ──
for (const [lang, path] of [['ko', '/'], ['en', '/en/']]) {
  const h = byPath.get(path)?.html;
  if (!h) {
    err(`${path} 가 dist 에 없음`);
    continue;
  }
  const lds = ldBlocks(h).map((b) => JSON.parse(b));
  const org = lds.filter((x) => x['@type'] === 'Organization');
  const site = lds.filter((x) => x['@type'] === 'WebSite');
  if (org.length !== 1) err(`${path}: Organization ${org.length}개`);
  else if (JSON.stringify(org[0]) !== JSON.stringify(JSON.parse(JSON.stringify(orgLd(lang))))) err(`${path}: Organization 이 info-lib orgLd('${lang}') 와 다름`);
  if (site.length !== 1) err(`${path}: WebSite ${site.length}개`);
  else if (JSON.stringify(site[0]) !== JSON.stringify(JSON.parse(JSON.stringify(websiteLd(lang))))) err(`${path}: WebSite 가 info-lib websiteLd('${lang}') 와 다름`);
  if (org[0] && org[0]['@id'] !== ORG_ID) err(`${path}: Organization @id`);
  if (org[0] && JSON.stringify(org[0].sameAs) !== JSON.stringify(['https://www.instagram.com/marathon.82/'])) err(`${path}: sameAs 가 인스타 하나가 아님`);
  if (site[0]?.potentialAction && !/\?q=\{search_term_string\}$/.test(site[0].potentialAction.target)) err(`${path}: SearchAction 주소 모양`);
}
// /about/ 의 Organization 은 홈과 같은 @id·같은 내용(언어별)
for (const [lang, path] of [['ko', '/about/'], ['en', '/en/about/']]) {
  const h = byPath.get(path)?.html;
  if (!h) continue;
  const about = ldBlocks(h).map((b) => JSON.parse(b)).find((x) => x['@type'] === 'AboutPage');
  const { '@context': _c, ...want } = JSON.parse(JSON.stringify(orgLd(lang)));
  if (!about || JSON.stringify(about.mainEntity) !== JSON.stringify(want)) err(`${path}: AboutPage.mainEntity 가 orgLd('${lang}') 와 다름`);
  if (!ldBlocks(h).some((b) => JSON.parse(b)['@type'] === 'BreadcrumbList')) err(`${path}: BreadcrumbList 없음`);
}
// ── 빙 meta ──
{
  const bing = bingVerification();
  const home = byPath.get('/')?.html ?? '';
  const homeEn = byPath.get('/en/')?.html ?? '';
  if (!bing) {
    for (const p of pages) if (/msvalidate\.01/.test(p.html)) err(`${p.path}: 빙 값이 비었는데 msvalidate.01 이 출력됨`);
    if (existsSync(join(DIST, 'BingSiteAuth.xml'))) err('BingSiteAuth.xml 이 있음 (만들지 않기로 함)');
  } else {
    for (const [p, h] of [['/', home], ['/en/', homeEn]]) if (!h.includes(`name="msvalidate.01" content="${bing}"`)) err(`${p}: 빙 meta 가 없음`);
  }
}
// ── robots.txt 변경 없음 ──
{
  const r = spawnSync('git', ['diff', '--quiet', 'HEAD', '--', 'public/robots.txt'], { cwd: ROOT });
  if (r.status !== 0) err('public/robots.txt 가 HEAD 와 다름 (AI 봇 차단 목록은 바꾸지 않는다)');
  if (readFileSync(join(DIST, 'robots.txt'), 'utf8') !== readFileSync(join(ROOT, 'public/robots.txt'), 'utf8')) err('dist/robots.txt 가 public/robots.txt 와 다름');
}

for (const w of warns) console.log(`경고: ${w}`);
console.log(`geo-check: html ${pages.length}개 (검사 대상 ${pages.filter((p) => !p.skip).length}개, noindex·넘김 ${pages.filter((p) => p.skip).length}개), title ${titles.size}종`);
if (errors.length) {
  console.error(`geo-check: 실패 ${errors.length}건`);
  for (const e of errors.slice(0, 60)) console.error(`  - ${e}`);
  if (errors.length > 60) console.error(`  … 외 ${errors.length - 60}건`);
  process.exit(1);
}
console.log('geo-check: 통과');
