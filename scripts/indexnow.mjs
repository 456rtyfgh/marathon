/**
 * IndexNow: 이번 배포에서 새로 생기거나 lastmod 가 바뀐 주소만 빙·네이버 등에 알린다.
 *
 *   node scripts/indexnow.mjs --prev prev-sitemap.xml          # 배포 직후 (deploy.yml)
 *   node scripts/indexnow.mjs --dry-run --prev <파일|URL>       # 보낼 목록만 출력, 전송 없음
 *
 * 옵션: --prev <파일|URL> (기본 https://marathon82.com/sitemap.xml)  --sitemap <파일> (기본 dist/sitemap.xml)  --max <n> (기본·상한 10000)
 * 원칙
 *  - 이전 sitemap 을 못 받거나 비어 있으면 아무것도 보내지 않는다(전체 재전송 방지).
 *  - 키 파일(public/<키>.txt)이 없거나 내용이 키와 다르면 보내지 않는다.
 *  - 어떤 실패도 경고만 하고 exit 0 — 배포를 실패시키지 않는다.
 *  - 주소는 https://marathon82.com/ 아래만 (SITE_ORIGIN 환경변수와 무관하게 config 의 HOST 로 고정).
 *  - --dry-run 이면 fetch 는 --prev 가 URL 일 때 그 GET 한 번뿐.
 * 이 파일은 indexnow-config.mjs · sitemap-diff.mjs 와 node 기본 모듈만 쓴다 (seo-lib·data.json 을 열지 않는다).
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { ENDPOINTS, HOST, INDEXNOW_KEY, KEY_LOCATION, MAX_URLS, SITE_ORIGIN } from './indexnow-config.mjs';
import { diffSitemaps, parseSitemap } from './sitemap-diff.mjs';

const ROOT = new URL('../', import.meta.url);
const TIMEOUT_MS = 15000;

/**
 * 보낼 주소를 고른다: 새로 생긴 주소 먼저(입력 순서), 그다음 lastmod 바뀐 주소(lastmod 최신순). max 를 넘으면 그 순서대로 자른다.
 * @returns {{ urls: string[], added: number, changed: number, removed: number, cut: number }}
 */
export function selectUrls(prev, next, max = MAX_URLS) {
  const limit = Math.min(Math.max(1, Math.floor(Number(max)) || MAX_URLS), MAX_URLS);
  const own = (loc) => loc.startsWith(`${SITE_ORIGIN}/`);
  const d = diffSitemaps(prev, next);
  const added = d.added.filter(own);
  const changed = d.changed.filter(own).sort((a, b) => (next.get(b) ?? '').localeCompare(next.get(a) ?? ''));
  const all = [...added, ...changed];
  return { urls: all.slice(0, limit), added: added.length, changed: changed.length, removed: d.removed.length, cut: Math.max(0, all.length - limit) };
}

/** 키 파일 확인: 문제가 있으면 이유 문자열, 괜찮으면 null */
export function keyFileProblem(root = ROOT) {
  const f = new URL(`public/${INDEXNOW_KEY}.txt`, root);
  if (!existsSync(f)) return `키 파일 public/${INDEXNOW_KEY}.txt 가 없음`;
  if (readFileSync(f, 'utf8').trim() !== INDEXNOW_KEY) return `키 파일 public/${INDEXNOW_KEY}.txt 의 내용이 키와 다름`;
  return null;
}

async function readSource(src, label) {
  if (/^https?:\/\//i.test(src)) {
    const res = await fetch(src, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`${label} ${src} 응답 ${res.status}`);
    return res.text();
  }
  if (!existsSync(src)) throw new Error(`${label} 파일이 없음: ${src}`);
  return readFileSync(src, 'utf8');
}

function parseArgs(argv) {
  const o = { dryRun: false, prev: `${SITE_ORIGIN}/sitemap.xml`, sitemap: 'dist/sitemap.xml', max: MAX_URLS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') o.dryRun = true;
    else if (a === '--prev') o.prev = argv[++i];
    else if (a === '--sitemap') o.sitemap = argv[++i];
    else if (a === '--max') o.max = Number(argv[++i]);
    else console.warn(`indexnow: 알 수 없는 옵션 ${a} (무시)`);
  }
  return o;
}

async function post(endpoint, urls) {
  const body = JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: KEY_LOCATION, urlList: urls });
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.status;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const warn = (m) => console.warn(`indexnow: 경고 — ${m}`);
  let prevXml;
  let nextXml;
  try {
    prevXml = await readSource(o.prev, '이전 sitemap');
  } catch (e) {
    warn(`이전 sitemap 을 못 읽어 아무것도 보내지 않음 (${e.message})`);
    return;
  }
  try {
    nextXml = await readSource(o.sitemap, '이번 sitemap');
  } catch (e) {
    warn(`이번 sitemap 을 못 읽어 아무것도 보내지 않음 (${e.message})`);
    return;
  }
  const prev = parseSitemap(prevXml);
  const next = parseSitemap(nextXml);
  if (!prev.size) return warn('이전 sitemap 에 주소가 없어 아무것도 보내지 않음 (전체 재전송 방지)');
  if (!next.size) return warn('이번 sitemap 에 주소가 없어 아무것도 보내지 않음');

  const sel = selectUrls(prev, next, o.max);
  console.log(`indexnow: 이전 ${prev.size}개 → 이번 ${next.size}개 | 새 주소 ${sel.added}, lastmod 바뀐 주소 ${sel.changed}, 사라진 주소 ${sel.removed}(보내지 않음)`);
  console.log(`indexnow: 보낼 주소 ${sel.urls.length}개${sel.cut ? ` (상한 ${Math.min(o.max || MAX_URLS, MAX_URLS)} 초과 ${sel.cut}개는 이번엔 보내지 않음)` : ''}`);
  if (o.dryRun) {
    for (const u of sel.urls) console.log(u);
    console.log('indexnow: --dry-run — 전송하지 않음');
    return;
  }
  if (!sel.urls.length) return console.log('indexnow: 바뀐 주소가 없어 보내지 않음');
  const problem = keyFileProblem();
  if (problem) return warn(`${problem} — 보내지 않음`);

  for (const ep of ENDPOINTS) {
    try {
      const status = await post(ep, sel.urls);
      // 200 접수, 202 키 확인 대기. 그 밖(403 키 불일치·422·429 등)은 경고만
      if (status === 200 || status === 202) console.log(`indexnow: ${new URL(ep).host} → ${status} (${sel.urls.length}개)`);
      else warn(`${new URL(ep).host} 응답 ${status}`);
    } catch (e) {
      warn(`${new URL(ep).host} 전송 실패 (${e.message})`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => console.warn(`indexnow: 경고 — ${e?.message ?? e}`));
}
