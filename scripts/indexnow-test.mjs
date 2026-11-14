/**
 * indexnow.mjs · sitemap-diff.mjs 동작 확인 (네트워크 호출 없음): node scripts/indexnow-test.mjs
 * 임시 폴더의 prev/next sitemap 으로 diff·상한·이전 sitemap 없음·키 불일치·--dry-run 을 본다.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INDEXNOW_KEY, KEY_LOCATION, MAX_URLS } from './indexnow-config.mjs';
import { diffSitemaps, parseSitemap } from './sitemap-diff.mjs';
import { keyFileProblem, selectUrls } from './indexnow.mjs';

const O = 'https://marathon82.com';
const sm = (rows) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows
    .map(([loc, mod]) => `<url><loc>${loc.replace(/&/g, '&amp;')}</loc>${mod ? `<lastmod>${mod}</lastmod>` : ''}</url>`)
    .join('\n')}\n</urlset>\n`;
let n = 0;
const ok = (name, fn) => {
  fn();
  n++;
  console.log(`ok - ${name}`);
};

const dir = mkdtempSync(join(tmpdir(), 'indexnow-test-'));
try {
  ok('parseSitemap: loc·lastmod·이스케이프', () => {
    const m = parseSitemap(sm([[`${O}/a`, '2026-01-01'], [`${O}/b?x=1&y=2`, '2026-01-02'], [`${O}/c`, '']]));
    assert.equal(m.size, 3);
    assert.equal(m.get(`${O}/a`), '2026-01-01');
    assert.equal(m.get(`${O}/b?x=1&y=2`), '2026-01-02');
    assert.equal(m.get(`${O}/c`), '');
  });

  ok('diffSitemaps: 새 주소·lastmod 변경·사라진 주소', () => {
    const prev = parseSitemap(sm([[`${O}/`, '2026-11-01'], [`${O}/a`, '2026-11-01'], [`${O}/gone`, '2026-11-01']]));
    const next = parseSitemap(sm([[`${O}/`, '2026-11-01'], [`${O}/a`, '2026-11-14'], [`${O}/new`, '2026-11-14']]));
    const d = diffSitemaps(prev, next);
    assert.deepEqual(d.added, [`${O}/new`]);
    assert.deepEqual(d.changed, [`${O}/a`]);
    assert.deepEqual(d.removed, [`${O}/gone`]);
  });

  ok('selectUrls: 새 주소가 먼저, 변경은 lastmod 최신순, 변하지 않은 주소 제외', () => {
    const prev = parseSitemap(sm([[`${O}/same`, '2026-11-01'], [`${O}/x`, '2026-11-01'], [`${O}/y`, '2026-11-01']]));
    const next = parseSitemap(sm([[`${O}/same`, '2026-11-01'], [`${O}/x`, '2026-11-05'], [`${O}/y`, '2026-11-09'], [`${O}/n1`, '2026-11-14'], [`${O}/n2`, '2026-11-14']]));
    const s = selectUrls(prev, next);
    assert.deepEqual(s.urls, [`${O}/n1`, `${O}/n2`, `${O}/y`, `${O}/x`]);
    assert.equal(s.cut, 0);
  });

  ok('selectUrls: 상한(--max)과 10000 하드 상한, 새 주소 우선으로 자름', () => {
    const prev = parseSitemap(sm([['https://marathon82.com/old', '2026-11-01']]));
    const rows = [[`${O}/old`, '2026-11-02'], ...Array.from({ length: 12 }, (_, i) => [`${O}/p${i}`, '2026-11-14'])];
    const next = parseSitemap(sm(rows));
    const s = selectUrls(prev, next, 5);
    assert.equal(s.urls.length, 5);
    assert.ok(s.urls.every((u) => u.includes('/p')), '새 주소가 변경 주소보다 먼저');
    assert.equal(s.cut, 8);
    const bigPrev = parseSitemap(sm([[`${O}/`, '2026-01-01']]));
    const bigNext = parseSitemap(sm(Array.from({ length: MAX_URLS + 50 }, (_, i) => [`${O}/r/${i}`, '2026-11-14'])));
    assert.equal(selectUrls(bigPrev, bigNext, 999999).urls.length, MAX_URLS);
  });

  ok('selectUrls: marathon82.com 밖의 주소는 보내지 않음', () => {
    const prev = parseSitemap(sm([[`${O}/`, '2026-01-01']]));
    const next = parseSitemap(sm([[`${O}/`, '2026-01-01'], ['https://example.com/x', '2026-11-14'], ['https://marathon82.com.evil.test/x', '2026-11-14'], [`${O}/ok`, '2026-11-14']]));
    assert.deepEqual(selectUrls(prev, next).urls, [`${O}/ok`]);
  });

  ok('키 파일: 실제 public/<키>.txt 존재·내용=키·32자 hex', () => {
    assert.match(INDEXNOW_KEY, /^[0-9a-f]{32}$/);
    assert.equal(KEY_LOCATION, `${O}/${INDEXNOW_KEY}.txt`);
    assert.equal(keyFileProblem(), null);
    assert.equal(readFileSync(new URL(`../public/${INDEXNOW_KEY}.txt`, import.meta.url), 'utf8'), INDEXNOW_KEY);
  });

  ok('키 파일: 없거나 내용이 다르면 문제로 본다', () => {
    const root = join(dir, 'root');
    mkdirSync(join(root, 'public'), { recursive: true });
    const rootUrl = new URL(`file://${root}/`);
    assert.match(keyFileProblem(rootUrl), /없음/);
    writeFileSync(join(root, 'public', `${INDEXNOW_KEY}.txt`), 'wrongkey');
    assert.match(keyFileProblem(rootUrl), /다름/);
    writeFileSync(join(root, 'public', `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);
    assert.equal(keyFileProblem(rootUrl), null);
  });

  // ── CLI (--dry-run 과 이전 sitemap 없음만. 실제 전송 경로는 부르지 않는다) ──
  const script = fileURLToPath(new URL('./indexnow.mjs', import.meta.url));
  const run = (args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 30000 });
  const prevFile = join(dir, 'prev.xml');
  const nextFile = join(dir, 'next.xml');
  writeFileSync(prevFile, sm([[`${O}/`, '2026-11-01'], [`${O}/a`, '2026-11-01'], [`${O}/b`, '2026-11-01']]));
  writeFileSync(nextFile, sm([[`${O}/`, '2026-11-01'], [`${O}/a`, '2026-11-14'], [`${O}/b`, '2026-11-01'], [`${O}/new`, '2026-11-14']]));

  ok('CLI --dry-run: 새·변경 주소만 출력하고 exit 0', () => {
    const r = run(['--dry-run', '--prev', prevFile, '--sitemap', nextFile]);
    assert.equal(r.status, 0);
    const lines = r.stdout.split('\n').filter((l) => l.startsWith('https://'));
    assert.deepEqual(lines, [`${O}/new`, `${O}/a`]);
    assert.match(r.stdout, /--dry-run — 전송하지 않음/);
  });

  ok('CLI --max: 상한 적용', () => {
    const r = run(['--dry-run', '--prev', prevFile, '--sitemap', nextFile, '--max', '1']);
    assert.equal(r.status, 0);
    assert.deepEqual(r.stdout.split('\n').filter((l) => l.startsWith('https://')), [`${O}/new`]);
  });

  ok('CLI: 이전 sitemap 파일이 없으면 경고만, 목록 없음, exit 0 (dry-run 아니어도 전송 안 함)', () => {
    for (const extra of [['--dry-run'], []]) {
      const r = run([...extra, '--prev', join(dir, 'nope.xml'), '--sitemap', nextFile]);
      assert.equal(r.status, 0);
      assert.match(r.stderr, /경고/);
      assert.equal(r.stdout.split('\n').filter((l) => l.startsWith('https://')).length, 0);
    }
  });

  ok('CLI: 이전 sitemap 이 비어 있으면 경고만 (전체 재전송 방지), exit 0', () => {
    const empty = join(dir, 'empty.xml');
    writeFileSync(empty, '');
    const r = run(['--prev', empty, '--sitemap', nextFile]);
    assert.equal(r.status, 0);
    assert.match(r.stderr, /전체 재전송 방지/);
  });

  ok('CLI: 변경 없음이면 보낼 것 없음, exit 0 (전송 안 함)', () => {
    const r = run(['--prev', nextFile, '--sitemap', nextFile]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /바뀐 주소가 없어 보내지 않음/);
  });

  ok('indexnow.mjs 는 seo-lib·data.json·.ts 를 import 하지 않는다', () => {
    for (const f of ['indexnow.mjs', 'sitemap-diff.mjs']) {
      const src = readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
      assert.ok(!/from\s+'\.\/seo-lib|data\.json|\.ts'/.test(src.replace(/^\s*\*.*$/gm, '')), `${f}`);
    }
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
assert.ok(existsSync(new URL(`../public/${INDEXNOW_KEY}.txt`, import.meta.url)));
console.log(`indexnow-test: ${n}개 통과`);
