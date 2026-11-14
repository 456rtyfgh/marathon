/**
 * 공유 링크 미리보기 확인 (PLAN 파트 B). 로컬 Pages 함수가 실제로 주는 /r/<id>·/en/r/<id> HTML 에서
 * og·twitter 메타를 뽑아 assert 한다. dist/r/<id>/index.html 같은 정적 파일은 이 저장소 빌드에 없고
 * (/r/* 는 dist/_worker.js 가 dist/index.html 을 고쳐서 준다), 그 대신 받은 응답의 <head> 를
 * evidence/share/og/<ko|en>-<id>.head.html 로 저장해 눈으로 볼 수 있게 한다.
 *
 *   npm run build
 *   npx wrangler pages dev dist --port 8788 &
 *   node scripts/og-check.mjs http://localhost:8788          # 대표 대회 (확정·예상·접수 미정·취소·특수문자 …)
 *   node scripts/og-check.mjs http://localhost:8788 --all    # + 대회 전부의 길이·값 검사 (저장은 대표 대회만)
 *
 * 실패가 하나라도 있으면 종료 코드 1.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ogTitle } from '../src/lib/shareText.ts';
import { OG_DESC_MAX, ogDescription } from '../src/lib/ogMeta.ts';
import { isCancelled, isEntryConfirmed } from '../src/lib/util.ts';

const BASE = (process.argv[2] ?? 'http://localhost:8788').replace(/\/$/, '');
const ALL = process.argv.includes('--all');
const SITE = 'https://marathon82.com';
const OG_IMAGE = `${SITE}/og.png`;
const OUT = new URL('../evidence/share/og/', import.meta.url);
const { races } = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
const byId = new Map(races.map((r) => [r.id, r]));
const hasDates = (r) => !!(r.entry_opens || r.entry_closes);
const HANGUL = /[가-힣]/;

// ── 대표 대회 (data.json 에서 실제로 고른다) ──
const pick = (f) => races.find((r) => r.race_date >= '2026-12-01' && f(r)) ?? races.find(f);
const SAMPLES = [
  ['확정', pick((r) => r.entry_confidence === 'confirmed' && r.entry_opens && r.entry_closes && !isCancelled(r))],
  ['예상', pick((r) => r.entry_confidence === 'expected' && r.entry_opens && r.entry_closes && !isCancelled(r))],
  ['접수 미정', pick((r) => r.entry_confidence === 'tbc' && !hasDates(r) && !isCancelled(r))],
  ['취소', pick((r) => isCancelled(r))],
  ['조기 마감', races.find((r) => r.sold_out_on && r.entry_confidence === 'confirmed' && !isCancelled(r))],
  ['지난 대회', races.find((r) => r.race_date < '2026-01-01' && r.entry_confidence === 'confirmed' && hasDates(r) && !isCancelled(r))],
  ['긴 이름', [...races].sort((a, b) => b.name_ko.length - a.name_ko.length)[0]],
  ['이름에 점', races.find((r) => r.name_en?.includes('. ') && !isCancelled(r))],
  ['큰따옴표', byId.get('gwangju-youth-marathon')],
  ['작은따옴표', byId.get('jeonju-savethechildren-kids-marathon')],
  ['앰퍼샌드', byId.get('seoul-run-and-learn-donation-run')],
  ['앰퍼샌드2', byId.get('incheon-third-bridge-walk-run')],
].filter(([, r]) => r);

// ── HTML 에서 메타 꺼내기 ──
const unescape = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
function metas(head) {
  const out = {};
  for (const tag of head.match(/<meta\b[^>]*>/g) ?? []) {
    const key = tag.match(/\b(?:property|name)="([^"]+)"/)?.[1];
    const content = tag.match(/\bcontent="([^"]*)"/)?.[1];
    if (key && content != null) out[key] = { raw: content, value: unescape(content) };
  }
  const canon = head.match(/<link\b[^>]*rel="canonical"[^>]*>/)?.[0]?.match(/\bhref="([^"]*)"/)?.[1];
  return { m: out, canonical: canon && unescape(canon) };
}

let fails = 0;
const problems = [];
const notes = [];
const fail = (msg) => {
  fails++;
  problems.push(msg);
};

async function checkRace(r, lang, { save = false, label = '' } = {}) {
  const path = `${lang === 'en' ? '/en' : ''}/r/${encodeURIComponent(r.id)}`;
  const res = await fetch(BASE + path);
  const html = await res.text();
  const tag = `${lang} ${r.id}`;
  if (res.status !== 200) return fail(`${tag}: HTTP ${res.status}`);
  const head = html.slice(0, html.indexOf('</head>') + 7);
  if (save) writeFileSync(new URL(`${lang}-${r.id}.head.html`, OUT), head + '\n');
  const { m, canonical } = metas(head);
  const v = (k) => m[k]?.value;
  const desc = v('description');
  const expTitle = ogTitle(r, lang);
  const expDesc = ogDescription(r, lang, desc ?? '');
  const eq = (k, exp) => v(k) !== exp && fail(`${tag}: ${k} = ${JSON.stringify(v(k))}, 기대 ${JSON.stringify(exp)}`);
  // 제목: 대회명·날짜는 똑같아야 한다. 장소의 나라 이름은 Intl(ICU) 데이터라 node 와 workerd 가 다를 수 있어
  // (예: 'Falkland Islands' / 'Falkland Islands (Islas Malvinas)') 비어 있지만 않으면 통과, 다르면 메모로 남긴다
  for (const k of ['og:title', 'twitter:title']) {
    const [gn, gd, ...gw] = (v(k) ?? '').split(' · ');
    const [en_, ed, ...ew] = expTitle.split(' · ');
    if (gn !== en_ || gd !== ed || !gw.join(' · ')) fail(`${tag}: ${k} = ${JSON.stringify(v(k))}, 기대 ${JSON.stringify(expTitle)}`);
    else if (gw.join(' · ') !== ew.join(' · ') && k === 'og:title') notes.push(`${tag}: 장소 이름 차이(ICU) 응답 '${gw.join(' · ')}' / node '${ew.join(' · ')}'`);
  }
  eq('twitter:title', v('og:title'));
  eq('og:description', expDesc);
  eq('twitter:description', expDesc);
  eq('og:image', OG_IMAGE);
  eq('twitter:image', OG_IMAGE);
  eq('twitter:card', 'summary_large_image');
  eq('og:url', SITE + path);
  eq('og:locale', lang === 'en' ? 'en_US' : 'ko_KR');
  if (canonical !== SITE + path) fail(`${tag}: canonical = ${canonical}`);
  const d = v('og:description') ?? '';
  if (d.length > OG_DESC_MAX) fail(`${tag}: og:description ${d.length}자`);
  // 이중 이스케이프·깨진 속성: 원문에 &amp;amp; 가 없고, 꺼낸 값에 남은 &…; 가 없다
  for (const [k, { raw, value }] of Object.entries(m)) {
    if (/&amp;(amp|quot|lt|gt|#\d+);/.test(raw)) fail(`${tag}: ${k} 이중 이스케이프 ${raw}`);
    if (/&(?!amp;|quot;|lt;|gt;|#\d+;|#x[0-9a-f]+;)/i.test(raw)) fail(`${tag}: ${k} 이스케이프 안 된 & ${raw}`);
    if (/[<>]/.test(raw)) fail(`${tag}: ${k} 이스케이프 안 된 < > ${raw}`);
    if (/&(amp|quot|lt|gt|#\d+|#x[0-9a-f]+);/i.test(value)) fail(`${tag}: ${k} 풀리지 않은 엔티티 ${value}`);
  }
  // 대회명·날짜·장소·접수 기간이 제목 또는 설명에 있다
  const name = lang === 'en' ? r.name_en?.trim() || r.name_ko : r.name_ko;
  const t = v('og:title') ?? '';
  if (!t.includes(name)) fail(`${tag}: 제목에 대회명 없음 ${t}`);
  if (t.split(' · ').length < 3) fail(`${tag}: 제목에 날짜·장소 없음 ${t}`);
  if (isCancelled(r)) {
    if (!d.startsWith(lang === 'en' ? '[Cancelled] ' : '[대회 취소] ')) fail(`${tag}: 취소 표시 없음 ${d}`);
  } else {
    if (hasDates(r) && !/\d+\/\d+/.test(d)) fail(`${tag}: 설명에 접수 날짜 없음 ${d}`);
    if (hasDates(r) && !isEntryConfirmed(r) && !d.startsWith(lang === 'en' ? 'Entry expected ' : '접수 예상 ')) fail(`${tag}: 예상 표시 없음 ${d}`);
  }
  if (lang === 'en' && r.name_en && HANGUL.test(t + d)) fail(`${tag}: 영어 미리보기에 한글 ${t} / ${d}`);
  return { label, tag, path, m, html };
}

mkdirSync(OUT, { recursive: true });
const rows = [];
for (const [label, r] of SAMPLES) {
  for (const lang of ['ko', 'en']) {
    const out = await checkRace(r, lang, { save: true, label });
    if (out) rows.push(out);
  }
}
for (const { label, path, m } of rows) {
  console.log(`\n[${label}] ${path}`);
  for (const k of ['og:title', 'og:description', 'twitter:title', 'twitter:description', 'og:image', 'og:url', 'twitter:card']) {
    console.log(`  ${k.padEnd(20)} ${m[k]?.raw ?? '(없음)'}`);
  }
}

if (ALL) {
  const jobs = races.flatMap((r) => ['ko', 'en'].map((lang) => [r, lang]));
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const [r, lang] = jobs[i++];
      await checkRace(r, lang);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
  console.log(`\n--all: 대회 ${races.length}개 × ko·en = ${jobs.length}개 응답 검사`);
}

// 없는 대회는 404 그대로 (og 를 바꾸지 않는다). 주소 규칙(worker/site.ts: [a-z0-9-]{2,40})에 맞는 없는 id 로
const nf = await fetch(`${BASE}/r/no-such-race-og-check`);
if (nf.status !== 404) fail(`없는 대회: HTTP ${nf.status}`);

for (const n of notes) console.log(`  메모 ${n}`);
for (const p of problems.slice(0, 30)) console.log(`  FAIL ${p}`);
console.log(`\n대표 대회 ${SAMPLES.length}개 × ko·en (head 저장: evidence/share/og/), 실패 ${fails}건`);
process.exit(fails ? 1 : 0);
