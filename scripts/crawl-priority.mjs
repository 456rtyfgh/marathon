/**
 * 네이버 서치어드바이저 '수집 요청'(수동, 하루 한도가 작다)에 넣을 우선순위 URL 목록을 표준출력으로만 낸다.
 * 파일을 만들지 않는다 — dist·저장소에 쓰면 공개로 배포되므로 실행한 사람이 화면/파이프로만 받는다.
 *
 *   node scripts/crawl-priority.mjs --prev prev-sitemap.xml        # 이전 sitemap 과 비교
 *   node scripts/crawl-priority.mjs                                 # 비교 없이: ① last_verified 최신 ② 이번 작업의 새 종류 페이지 ③ 접수 임박
 *   node scripts/crawl-priority.mjs --limit 20 --verbose            # 분류·사유는 표준오류로
 *
 * 옵션: --prev <파일|URL>  --sitemap <파일> (기본 dist/sitemap.xml, 후보 목록)  --limit <n> (기본 20)  --verbose
 * 순서(출력 순서): ① 최근 추가·변경된 대회(/r/<id>) → ② 새 검색어 페이지(비-/r/) → ③ 접수 임박 대회(접수 중, 마감 가까운 순).
 * 한 종류가 한도를 다 채워 뒤 종류가 영영 안 나가지 않게 종류별 몫(① 절반, ② 4분의 1, ③ 나머지)을 두고, 몫이 남으면 다른 종류로 채운다.
 * 한국어 주소만(네이버용), 취소·이미 끝난 대회 제외, 중복 제거.
 */
import { existsSync, readFileSync } from 'node:fs';
import { diffSitemaps, parseSitemap } from './sitemap-diff.mjs';
import { ORIGIN, entryStatusOf, isCancelled, races, today } from './seo-lib.mjs';

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const verbose = process.argv.includes('--verbose');
const limit = Math.max(1, Math.floor(Number(arg('--limit', 20))) || 20);
const info = (m) => verbose && console.error(m);

async function readSource(src) {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`응답 ${res.status}`);
    return res.text();
  }
  if (!existsSync(src)) throw new Error('파일이 없음');
  return readFileSync(src, 'utf8');
}

const sitemapFile = arg('--sitemap', 'dist/sitemap.xml');
if (!existsSync(sitemapFile)) {
  console.error(`crawl-priority: ${sitemapFile} 이 없습니다. 먼저 npm run build 를 하거나 --sitemap 으로 파일을 지정하세요.`);
  process.exit(1);
}
const next = parseSitemap(readFileSync(sitemapFile, 'utf8'));

let prev = null;
const prevSrc = arg('--prev', null);
if (prevSrc) {
  try {
    prev = parseSitemap(await readSource(prevSrc));
    if (!prev.size) {
      console.error(`crawl-priority: 경고 — 이전 sitemap(${prevSrc})이 비어 있어 비교 없이 만듭니다`);
      prev = null;
    }
  } catch (e) {
    console.error(`crawl-priority: 경고 — 이전 sitemap(${prevSrc})을 못 읽어 비교 없이 만듭니다 (${e.message})`);
  }
}

const isKo = (loc) => loc.startsWith(`${ORIGIN}/`) && !loc.startsWith(`${ORIGIN}/en/`);
const raceByUrl = new Map(races.map((r) => [`${ORIGIN}/r/${encodeURIComponent(r.id)}`, r]));
/** 수집 요청 대상 대회: 사이트맵에 있고 아직 안 끝났고 취소가 아님 */
const eligibleRace = (loc) => {
  const r = raceByUrl.get(loc);
  return !!r && next.has(loc) && r.race_date >= today && !isCancelled(r);
};

// ① 최근 추가·변경된 대회
let recent;
if (prev) {
  const d = diffSitemaps(prev, next);
  const pick = (locs) => locs.filter((l) => isKo(l) && eligibleRace(l)).sort((a, b) => (next.get(b) ?? '').localeCompare(next.get(a) ?? ''));
  recent = [...pick(d.added), ...pick(d.changed)];
  info(`① 이전 sitemap 대비 새로 생기거나 lastmod 가 바뀐 대회 ${recent.length}개`);
} else {
  recent = [...raceByUrl.keys()].filter(eligibleRace).sort((a, b) => (raceByUrl.get(b).last_verified ?? '').localeCompare(raceByUrl.get(a).last_verified ?? ''));
  info(`① 이전 sitemap 없음 — last_verified 최신순 대회 ${recent.length}개`);
}

// ② 새 검색어 페이지 (한국어, 대회 상세 제외)
const searchPage = (loc) => isKo(loc) && !loc.startsWith(`${ORIGIN}/r/`) && loc !== `${ORIGIN}/`;
const pageRank = (loc) => {
  const p = loc.slice(ORIGIN.length);
  if (p === '/about/') return '0';
  if (p === '/faq/') return '1';
  if (p.startsWith('/distance/')) return `2${p}`;
  if (/^\/m\/\d{4}-\d{2}\/[^/]+\/$/.test(p)) return `3${p.split('/')[2]}${p}`; // 월×시·도: 가까운 달부터
  return `4${p}`;
};
let fresh;
if (prev) {
  fresh = diffSitemaps(prev, next).added.filter(searchPage);
  info(`② 이전 sitemap 에 없던 검색어 페이지 ${fresh.length}개`);
} else {
  // 비교할 게 없으면 이번 작업의 새 종류만: /m/<ym>/<id>/ · /distance/5k/ · /about/ · /faq/
  fresh = [...next.keys()].filter((l) => searchPage(l) && /^\/(m\/\d{4}-\d{2}\/[^/]+\/|distance\/5k\/|about\/|faq\/)$/.test(l.slice(ORIGIN.length)));
  info(`② 이전 sitemap 없음 — 이번 작업의 새 종류 페이지 ${fresh.length}개`);
}
// 지난 달의 월×시·도 페이지는 뒤로 (rank 가 같은 종류 안에서 달 순서)
const thisMonth = today.slice(0, 7);
fresh = fresh.sort((a, b) => pageRank(a).localeCompare(pageRank(b))).filter((l) => !/^\/m\/(\d{4}-\d{2})\//.test(l.slice(ORIGIN.length)) || l.slice(ORIGIN.length).split('/')[2] >= thisMonth);

// ③ 접수 임박 (접수 중, 마감 가까운 순. 마감일 없는 접수 중은 뒤)
const closing = races
  .filter((r) => r.race_date >= today && !isCancelled(r) && entryStatusOf(r) === 'open')
  .sort((a, b) => (a.entry_closes ?? '9999').localeCompare(b.entry_closes ?? '9999') || a.race_date.localeCompare(b.race_date))
  .map((r) => `${ORIGIN}/r/${encodeURIComponent(r.id)}`)
  .filter((l) => next.has(l));
info(`③ 접수 중인 다가오는 대회 ${closing.length}개`);

// 몫: ① 절반, ② 4분의 1, ③ 나머지. 남는 몫은 다른 종류로 채운다 (순서는 ①②③ 그대로)
// (--limit 1 이면 ① 1·② 0 — 몫 합이 한도를 넘지 않게)
const quota = [Math.ceil(limit / 2)];
quota.push(Math.min(Math.ceil(limit / 4), limit - quota[0]));
quota.push(Math.max(0, limit - quota[0] - quota[1]));
const groups = [
  { name: '① 최근 추가·변경 대회', list: recent },
  { name: '② 새 검색어 페이지', list: fresh },
  { name: '③ 접수 임박 대회', list: closing },
];
const chosen = new Set();
const out = groups.map(() => []);
const take = (gi, n) => {
  for (const loc of groups[gi].list) {
    if (n <= 0) break;
    if (chosen.has(loc)) continue;
    chosen.add(loc);
    out[gi].push(loc);
    n--;
  }
};
groups.forEach((_, gi) => take(gi, quota[gi]));
// 남은 자리는 ①②③ 순서로 채운다
for (let gi = 0; gi < groups.length && chosen.size < limit; gi++) take(gi, limit - chosen.size);

const lines = out.flat();
for (const loc of lines) console.log(loc);
if (verbose) {
  groups.forEach((g, gi) => console.error(`${g.name}: ${out[gi].length}개 (후보 ${g.list.length}개)`));
  console.error(`합계 ${lines.length}개 (한도 ${limit})`);
}
