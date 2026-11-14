/**
 * 검색 유입 정적 페이지의 '데이터·날짜 기준' 검사 (PLAN 파트 A). 실패가 하나라도 있으면 exit 1.
 *   node scripts/seo-data-check.mjs
 * seo-lib.mjs 만 읽는다(dist 에 쓰지 않는다). dist 가 있으면 sitemap.xml 과 첫 화면 링크도 본다.
 * 날짜 시뮬레이션은 자식 프로세스(SEO_TODAY·PROBE_NOW)로 돌린다 — seo-lib 은 날짜를 모듈을 읽을 때 한 번만 계산해서다.
 * 본다: 접수 중 판정 = 홈 목록의 entryStatus · 시·도 분류 누락·중복 · 거리 묶음 = 앱 거리 필터 · 주말 범위(요일·월말·연말·한국 자정 경계) ·
 *       대회 0개일 때 페이지 목록 · 취소 대회 · 목록 안 중복 id · 푸터·첫 화면 링크 대상 · sitemap = listPages.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ── 자식 모드: 날짜를 고정해 seo-lib 의 결과를 JSON 한 줄로 내보낸다 ──
if (process.argv[2] === '--probe') {
  if (process.env.PROBE_NOW) Date.now = () => Number(process.env.PROBE_NOW);
  const m = await import('./seo-lib.mjs');
  const cancelledOpen = m.upcoming.filter((r) => m.isCancelled(r) && m.isEntryOpen(r)).length;
  console.log(
    JSON.stringify({
      today: m.today,
      weekend: { from: m.weekend.from, to: m.weekend.to, n: m.weekend.races.length },
      regions: m.regionPages.map((p) => p.id),
      distances: m.distancePages.map((d) => d.bucket),
      upcoming: m.upcoming.length,
      open: m.upcoming.filter((r) => m.isEntryOpen(r)).length,
      cancelledOpen,
      listPaths: m.listPages.map((p) => p.path),
      listPathsEn: m.listPagesEn.map((p) => p.path),
      emptyList: [...m.listPages, ...m.listPagesEn].filter((p) => !p.races.length).map((p) => p.path),
      landings: m.LANDINGS.map((l) => l.path),
      landingsEn: m.LANDINGS_EN.map((l) => l.path),
    }),
  );
  process.exit(0);
}

const lib = await import('./seo-lib.mjs');
const { ORIGIN, PROVINCES, today, upcoming, races, regionPages, distancePages, weekend, listPages, listPagesEn, isEntryOpen, entryStatusOf, isCancelled, provinceOf, enPath } = lib;
const { distanceBucket, matchesDistances } = await import('../src/lib/distanceFilter.ts');
const { entryStatus } = await import('../src/lib/util.ts');
const { SEO_LINKS } = await import('../src/lib/seoLinks.ts');

const fails = [];
const notes = [];
const fail = (msg) => fails.push(msg);
const ok = (name, cond, detail = '') => {
  if (!cond) fail(`${name}${detail ? ` — ${detail}` : ''}`);
};
const isKr = (r) => r.country_code === 'KR';
const krUp = upcoming.filter(isKr);
const SELF = fileURLToPath(import.meta.url);
const probe = (env) => {
  const res = spawnSync(process.execPath, [SELF, '--probe'], { env: { ...process.env, SEO_TODAY: '', PROBE_NOW: '', ...env }, encoding: 'utf8' });
  if (res.status !== 0) throw new Error(`probe 실패 ${JSON.stringify(env)}: ${res.stderr}`);
  return JSON.parse(res.stdout.trim().split('\n').at(-1));
};
const dup = (ids) => ids.filter((id, i) => ids.indexOf(id) !== i);

// 1. 접수 중 = 홈 목록(/d/<hash>.json — notes_ko 는 취소 태그만)에서 entryStatus === 'open'
{
  const { readSplit } = await import('./data-split.mjs');
  const listRaces = new Map(readSplit().list.races.map((r) => [r.id, r]));
  const real = !process.env.SEO_TODAY;
  // 홈이 쓰는 기본값(오늘 = 한국 시간 오늘)과도 맞춰 본다. SEO_TODAY 로 돌린 경우에는 seo-lib 의 today 와만 비교
  const home = (r) => (real ? entryStatus(listRaces.get(r.id)) : entryStatus(listRaces.get(r.id), new Date(today + 'T00:00:00Z')));
  ok('홈 목록 데이터에 없는 대회', races.every((r) => listRaces.has(r.id)));
  const diff = races.filter((r) => entryStatusOf(r) !== home(r));
  ok('접수 상태가 홈 목록과 다름(entryStatusOf)', diff.length === 0, `${diff.length}건 ${diff.slice(0, 5).map((r) => `${r.id}:${entryStatusOf(r)}≠${home(r)}`)}`);
  const diffOpen = races.filter((r) => isEntryOpen(r) !== (entryStatusOf(r) === 'open'));
  ok('isEntryOpen ≠ entryStatusOf==="open"', diffOpen.length === 0, `${diffOpen.length}건`);
  const openN = upcoming.filter((r) => home(r) === 'open').length;
  const entryOpenPage = lib.landingPages.find((p) => p.path === '/entry-open/');
  ok('/entry-open/ 대회 수 ≠ 홈 접수 중 수', (entryOpenPage?.races.length ?? 0) === openN, `${entryOpenPage?.races.length ?? 0} ≠ ${openN}`);
  ok('취소 대회가 접수 중에 들어 있음', !upcoming.some((r) => isCancelled(r) && isEntryOpen(r)));
  // 정적 페이지가 상세 전용 값(notes_ko 메모)으로 상태를 바꾸지 않는다 — 공식 '접수 중(마감일 미공지)' 메모 대회는 홈 목록과 같이 접수 일정이 확정되어야 접수 중
  const full = upcoming.filter((r) => entryStatus(r, new Date(today + 'T00:00:00Z')) === 'open' && !isEntryOpen(r) && !isCancelled(r));
  ok('정적 페이지 접수 중에서 빠진 대회가 상세 메모 때문만이 아님', full.every((r) => /공식: 접수 중\(마감일 미공지/.test(r.notes_ko || '')), full.filter((r) => !/공식: 접수 중\(마감일 미공지/.test(r.notes_ko || '')).map((r) => r.id).join());
  notes.push(`접수 중 ${openN}개 (다가오는 ${upcoming.length}개 중; 홈 목록 entryStatus==='open' 과 어긋남 ${diff.length}건)`);
  notes.push(`상세 메모('공식: 접수 중(마감일 미공지)')로만 접수 중인 ${full.length}개는 홈 목록과 같이 접수 중에 넣지 않음`);
}

// 2. 시·도
{
  const none = krUp.filter((r) => !provinceOf(r));
  ok('시·도를 못 찾은 국내 대회', none.length === 0, `${none.length}건 ${none.slice(0, 5).map((r) => `${r.id}:${r.city_ko}`)}`);
  const ids = regionPages.flatMap((p) => p.races.map((r) => r.id));
  ok('시·도 페이지 사이 중복 대회', dup(ids).length === 0, dup(ids).slice(0, 5).join(','));
  ok('시·도 합계 ≠ /kr/ 대회 수', ids.length === krUp.length, `${ids.length} ≠ ${krUp.length}`);
  const regionIds = new Set(regionPages.map((p) => p.id));
  const hasKr = new Set(krUp.map(provinceOf));
  for (const p of PROVINCES) ok(`${p.id}: 대회가 있는데 페이지 없음/없는데 있음`, hasKr.has(p.id) === regionIds.has(p.id));
  // 광주 구분: 광역시와 경기 광주
  const gj = races.filter((r) => isKr(r) && /^광주/.test(r.city_ko || ''));
  const gg = races.filter((r) => isKr(r) && /^경기 광주/.test(r.city_ko || ''));
  ok('경기 광주가 광주 광역시로 분류됨', gg.every((r) => provinceOf(r) === 'gyeonggi'));
  ok('광주 광역시가 광주로 분류 안 됨', gj.every((r) => provinceOf(r) === 'gwangju'));
  const bad = races.filter((r) => isKr(r)).filter((r) => {
    const p = provinceOf(r);
    const pv = PROVINCES.find((x) => x.id === p);
    return !p || !pv.keys.some((k) => (r.city_ko || '').trim().startsWith(k));
  });
  ok('city_ko 첫 단어와 시·도 키가 안 맞음(지난 대회 포함)', bad.length === 0, `${bad.length}건 ${bad.slice(0, 5).map((r) => `${r.id}:${r.city_ko}`)}`);
  // places.ts 와 같은 규칙인지 (id·이름·keys 전부)
  const src = readFileSync(new URL('../src/lib/places.ts', import.meta.url), 'utf8');
  const block = src.slice(src.indexOf('export const PROVINCES'), src.indexOf('];', src.indexOf('export const PROVINCES')));
  const srcRows = [...block.matchAll(/id: '([^']+)', name: '([^']+)', keys: \[([^\]]*)\]/g)].map((m) => `${m[1]}|${m[2]}|${m[3].replace(/['\s]/g, '')}`);
  const libRows = PROVINCES.map((p) => `${p.id}|${p.name}|${p.keys.join(',')}`);
  ok('PROVINCES 가 src/lib/places.ts 와 다름', srcRows.join('\n') === libRows.join('\n'), `places.ts ${srcRows.length}개 / seo-lib ${libRows.length}개`);
  notes.push(`시·도 ${regionPages.length}개, 합계 ${ids.length} = 국내 다가오는 ${krUp.length}`);
}

// 3. 거리 묶음 = 앱 거리 필터
{
  for (const d of distancePages) {
    const want = krUp.filter((r) => matchesDistances(r, [d.bucket])).map((r) => r.id);
    ok(`/distance/${d.bucket}/ ≠ 앱 거리 필터(matchesDistances)`, want.join() === d.races.map((r) => r.id).join(), `${d.races.length} ≠ ${want.length}`);
    ok(`/distance/${d.bucket}/ 중복 대회`, dup(d.races.map((r) => r.id)).length === 0);
    ok(`/distance/${d.bucket}/ 에 해외·지난 대회`, d.races.every((r) => isKr(r) && r.race_date >= today));
  }
  for (const b of ['full', 'half', '10k'])
    ok(`/distance/${b}/ 가 없음 (국내 다가오는 대회에 ${b} 가 있는데)`, distancePages.some((d) => d.bucket === b) === krUp.some((r) => (r.distances ?? []).some((x) => distanceBucket(x) === b)));
  const sample = { full: ['풀', 'full', '42.195km', '42K'], half: ['하프', 'half', '21K', '21.0975km'], '10k': ['10km', '10K'] };
  for (const [b, labels] of Object.entries(sample)) for (const l of labels) ok(`거리 '${l}' → ${b}`, distanceBucket(l) === b, `${distanceBucket(l)}`);
  for (const [l, b] of [['5km', '5k'], ['100km', 'ultra'], ['건강달리기', null]]) ok(`거리 '${l}' 가 풀·하프·10K 묶음에 들어감`, distanceBucket(l) === b);
  notes.push(`거리 ${distancePages.map((d) => `${d.bucket} ${d.races.length}`).join(' · ')}`);
}

// 4. 이번 주말: 요일별·월말·연말 경계 (기대값은 seo-lib 과 따로 계산한다)
const weekendExpect = (day) => {
  const t = Date.parse(day + 'T00:00:00Z');
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  let from = t;
  while (![0, 6].includes(new Date(from).getUTCDay())) from += 864e5;
  const to = new Date(from).getUTCDay() === 6 ? from + 864e5 : from;
  return { from: iso(from), to: iso(to) };
};
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const table = [];
{
  const days = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03', '2026-02-27', '2026-02-28', '2026-03-01'];
  for (const day of days) {
    const p = probe({ SEO_TODAY: day });
    const e = weekendExpect(day);
    const wd = WD[new Date(day + 'T00:00:00Z').getUTCDay()];
    ok(`주말 ${day}(${wd}): today`, p.today === day, p.today);
    ok(`주말 ${day}(${wd}): ${e.from}~${e.to} 이어야 함`, p.weekend.from === e.from && p.weekend.to === e.to, `${p.weekend.from}~${p.weekend.to}`);
    table.push(`${day}(${wd}) → ${p.weekend.from}~${p.weekend.to}`);
  }
  // 한국 시간 자정 경계: UTC 14:59:59 = KST 23:59:59(전날), UTC 15:00:00 = KST 00:00:00(다음 날)
  for (const [utc, kst] of [['2026-11-13T14:59:59Z', '2026-11-13'], ['2026-11-13T15:00:00Z', '2026-11-14'], ['2026-12-31T15:00:00Z', '2027-01-01'], ['2026-11-14T14:59:59Z', '2026-11-14']]) {
    const p = probe({ PROBE_NOW: String(Date.parse(utc)) });
    ok(`한국 시간 경계 ${utc} → ${kst}`, p.today === kst, p.today);
    const e = weekendExpect(kst);
    ok(`한국 시간 경계 ${utc} 주말`, p.weekend.from === e.from && p.weekend.to === e.to, `${p.weekend.from}~${p.weekend.to}`);
  }
  // SEO_TODAY 형식이 틀리면 무시(실제 오늘)
  for (const bad of ['2026-13-40', '20261114', 'abc', '2026-02-30']) ok(`SEO_TODAY=${bad} 는 무시`, probe({ SEO_TODAY: bad }).today !== bad);
  // 이번 빌드의 주말 목록
  ok('weekend 목록이 from~to 밖', weekend.races.every((r) => r.race_date >= weekend.from && r.race_date <= weekend.to));
  ok('weekend 목록 중복 대회', dup(weekend.races.map((r) => r.id)).length === 0);
  const wantN = races.filter((r) => r.race_date >= weekend.from && r.race_date <= weekend.to).length;
  ok('weekend 대회 수 ≠ 기간 안 전체 대회', weekend.races.length === wantN, `${weekend.races.length} ≠ ${wantN}`);
  const kFirst = weekend.races.findIndex((r) => !isKr(r));
  ok('weekend 목록은 국내가 먼저', kFirst < 0 || weekend.races.slice(kFirst).every((r) => !isKr(r)));
  notes.push(`이번 주말 ${weekend.from}~${weekend.to}, 대회 ${weekend.races.length}개 (빌드 날짜 ${today})`);
}

// 5. 대회 0개일 때 (다가오는 대회가 하나도 없는 날)
{
  const p = probe({ SEO_TODAY: '2030-01-01' });
  ok('2030-01-01: regionPages 가 비어 있지 않음', p.regions.length === 0, p.regions.join());
  ok('2030-01-01: distancePages 가 비어 있지 않음', p.distances.length === 0, p.distances.join());
  ok('2030-01-01: 주말 대회가 있음', p.weekend.n === 0, `${p.weekend.n}`);
  ok('2030-01-01: 접수 중 대회가 있음', p.open === 0, `${p.open}`);
  const newish = (path) => /^\/(en\/)?(kr\/[a-z-]+\/|distance\/|weekend\/|entry-open\/)/.test(path);
  ok('2030-01-01: listPages 에 시·도·거리·주말·접수 중 주소가 있음', !p.listPaths.some(newish), p.listPaths.filter(newish).join());
  ok('2030-01-01: listPagesEn 에 시·도·거리·주말·접수 중 주소가 있음', !p.listPathsEn.some(newish), p.listPathsEn.filter(newish).join());
  // sitemap.mjs 는 0개 페이지가 있으면 빌드를 멈춘다 → 대회가 다 지난 날에도 빌드가 돌아야 한다(/kr/·/abroad/·/trail/ 는 noindex)
  ok('2030-01-01: listPages 에 대회 0개 페이지가 있음 (sitemap 빌드가 멈춤)', p.emptyList.length === 0, p.emptyList.join(' '));
  ok('2030-01-01: LANDINGS 에 주말·접수 중이 남음', !p.landings.some((x) => x === '/weekend/' || x === '/entry-open/') && !p.landingsEn.some((x) => x === '/en/weekend/' || x === '/en/entry-open/'));
  notes.push('2030-01-01 시뮬레이션: 시·도·거리·주말·접수 중 주소는 listPages·LANDINGS 에서 빠짐');
}

// 6. 목록 안 중복 대회·sitemap 대상 규칙 (이번 빌드 날짜)
{
  for (const p of listPages) ok(`${p.path} 목록 중복 대회`, dup(p.races.map((r) => r.id)).length === 0);
  const paths = listPages.map((p) => p.path);
  ok('listPages 주소 중복', dup(paths).length === 0, dup(paths).join());
  ok('listPagesEn = /en + listPages', listPagesEn.map((p) => p.path).join() === paths.map(enPath).join());
  for (const p of listPages) ok(`${p.path} 가 listPages 에 있는데 대회 0개`, p.races.length > 0);
  for (const r of regionPages) ok(`/kr/${r.id}/ listPages 에 없음`, paths.includes(r.path));
  for (const d of distancePages) ok(`${d.path} listPages 에 없음`, paths.includes(d.path));
  ok('/weekend/ listPages 포함 여부가 대회 수와 안 맞음', paths.includes('/weekend/') === (weekend.races.length > 0));
  ok('/entry-open/ listPages 포함 여부가 접수 중 수와 안 맞음', paths.includes('/entry-open/') === (upcoming.some((r) => isEntryOpen(r))));
  ok('/open/ 이 listPages 에 있음', !paths.includes('/open/'));
}

// 7. 밖에서 들어오는 링크: 앱 푸터(SEO_LINKS)·첫 화면 미리 넣는 링크의 대상이 오늘 날짜로 만들어지는 페이지인가
{
  // seo-pages.mjs 가 대회 수와 상관없이 늘 파일을 만드는 페이지 + 대회가 있어야 만드는 페이지
  const always = new Set(['/kr/', '/abroad/', '/trail/', '/entry-open/', '/weekend/', '/open/', ...lib.years.map(lib.yearPath), ...lib.months.map(lib.monthPath), ...lib.countries.map((c) => lib.countryPath(c.code))]);
  const made = new Set([...always, ...regionPages.map((p) => p.path), ...distancePages.map((d) => d.path)]);
  for (const l of SEO_LINKS) {
    ok(`앱 푸터 링크 ${l.path} 가 만들어지지 않음`, made.has(l.path), '데이터에 따라 대회 0개 → 페이지 없음이면 푸터에서 빼야 함');
    ok(`앱 푸터 링크 ${l.path} 문구(ko/en)`, !!l.ko?.trim() && !!l.en?.trim());
  }
  for (const l of lib.LANDINGS) ok(`LANDINGS ${l.path} 가 만들어지지 않음`, made.has(l.path));
  for (const l of lib.LANDINGS_EN) ok(`LANDINGS_EN ${l.path} 가 만들어지지 않음`, made.has(l.path.replace(/^\/en/, '') || '/'));
  const dist = new URL('../dist/', import.meta.url);
  const exists = (path) => {
    if (path === '/' || path === '/en/') return existsSync(new URL(path === '/' ? 'index.html' : 'en/index.html', dist));
    const m = path.match(/^(?:\/en)?\/r\/([^/?#]+)$/);
    if (m) return races.some((r) => r.id === decodeURIComponent(m[1]));
    // 목록 페이지는 <path>/index.html, 약관(/terms)처럼 scripts/terms.mjs 가 만드는 것은 <path>.html
    return existsSync(new URL(`.${path.replace(/\/?$/, '/')}index.html`, dist)) || existsSync(new URL(`.${path.replace(/\/$/, '')}.html`, dist));
  };
  for (const file of ['index.html', 'en/index.html']) {
    const f = new URL(file, dist);
    if (!existsSync(f)) {
      notes.push(`${file} 없음 — 첫 화면 링크 검사는 건너뜀 (npm run build 뒤에 다시)`);
      continue;
    }
    const html = readFileSync(f, 'utf8');
    const pre = html.match(/<main class="seo-pre"[\s\S]*?<\/main>/)?.[0];
    if (!pre) {
      fail(`${file}: 미리 넣은 seo-pre 본문 없음`);
      continue;
    }
    const hrefs = [...pre.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h.startsWith('/'));
    const broken = [...new Set(hrefs.filter((h) => !exists(h.split('#')[0])))];
    ok(`${file}: 첫 화면 링크 대상이 dist 에 없음`, broken.length === 0, broken.slice(0, 8).join(' '));
    // 대회 0개 시·도·거리 제목만 남은 빈 nav 가 없어야 한다
    ok(`${file}: 링크 없는 빈 nav`, !/<nav[^>]*><h2>[^<]*<\/h2><p><\/p>(<p><\/p>)?<\/nav>/.test(pre));
    notes.push(`${file}: 첫 화면 링크 ${hrefs.length}개 확인`);
  }
}

// 8. sitemap = 홈 + listPages + 대회 (한·영). dist 가 있을 때만
{
  const f = new URL('../dist/sitemap.xml', import.meta.url);
  if (!existsSync(f)) notes.push('dist/sitemap.xml 없음 — sitemap 검사는 건너뜀 (npm run build 뒤에 다시)');
  else {
    const xml = readFileSync(f, 'utf8');
    const entries = [...xml.matchAll(/<url><loc>([^<]*)<\/loc><lastmod>([^<]*)<\/lastmod><\/url>/g)].map((m) => ({ loc: m[1], lastmod: m[2] }));
    const locs = entries.map((e) => e.loc);
    ok('sitemap 주소 중복', dup(locs).length === 0, dup(locs).slice(0, 3).join(' '));
    const bad = entries.filter((e) => !/^\d{4}-\d{2}-\d{2}$/.test(e.lastmod) || Number.isNaN(Date.parse(e.lastmod)));
    ok('sitemap lastmod 형식', bad.length === 0, bad.slice(0, 3).map((e) => `${e.loc} ${e.lastmod}`).join(' '));
    const want = new Set([
      `${ORIGIN}/`, `${ORIGIN}/en/`,
      ...[...listPages, ...listPagesEn].map((p) => `${ORIGIN}${p.path}`),
      ...races.flatMap((r) => [`${ORIGIN}/r/${encodeURIComponent(r.id)}`, `${ORIGIN}/en/r/${encodeURIComponent(r.id)}`]),
    ]);
    const have = new Set(locs);
    const missing = [...want].filter((u) => !have.has(u));
    const extra = [...have].filter((u) => !want.has(u));
    ok('sitemap 에 없는 주소(listPages·대회)', missing.length === 0, `${missing.length}개 ${missing.slice(0, 3).join(' ')}`);
    ok('sitemap 에 있으면 안 되는 주소', extra.length === 0, `${extra.length}개 ${extra.slice(0, 3).join(' ')}`);
    for (const u of ['/open/', '/en/open/']) ok(`sitemap 에 ${u}`, !have.has(`${ORIGIN}${u}`));
    const fresh = [...regionPages.map((p) => p.path), ...distancePages.map((d) => d.path), ...(weekend.races.length ? [weekend.path] : [])];
    for (const p of fresh) {
      ok(`sitemap 에 ${p}`, have.has(`${ORIGIN}${p}`));
      ok(`sitemap 에 ${enPath(p)}`, have.has(`${ORIGIN}${enPath(p)}`));
    }
    notes.push(`sitemap ${locs.length}개 주소 = 홈·목록 페이지·대회 (새 페이지 ${fresh.length * 2}개 포함)`);
  }
}

console.log('seo-data-check:');
for (const n of notes) console.log(`  ${n}`);
console.log('  주말 계산표:');
for (const t of table) console.log(`    ${t}`);
if (fails.length) {
  console.error(`\n실패 ${fails.length}개:`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('seo-data-check: 통과');
