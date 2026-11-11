/**
 * 접수 상태 색(src/lib/statusTone.ts · src/index.css 의 --st-* 토큰) 확인.
 *   node scripts/status-tone-test.mjs
 * - toneOf 표
 * - 라이트·다크 각각 글자(ink) 대 배지 배경·surface·bg 대비 ≥ 4.5 (WCAG AA)
 * - 주황 계열(색상 15°–45°, 채도 높음)·크림/베이지(색상 25°–60°, 밝고 채도 낮지 않음) 없음
 * - 다섯 상태 배지 배경이 서로 다른 색
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toneOf, TONE_BADGE, TONE_TEXT } from '../src/lib/statusTone.ts';

// toneOf
const table = {
  open: 'open',
  upcoming: 'upcoming',
  soldout: 'closed',
  closed: 'closed',
  unknown: 'tbd',
  cancelled: 'cancelled',
};
for (const [st, tone] of Object.entries(table)) assert.equal(toneOf(st), tone, `toneOf(${st})`);
const TONES = ['open', 'upcoming', 'closed', 'tbd', 'cancelled'];
for (const t of TONES) {
  assert.equal(TONE_BADGE[t], `bg-st-${t} text-st-${t}-ink`);
  assert.equal(TONE_TEXT[t], `text-st-${t}-ink`);
}
console.log('toneOf 표 OK');

// 토큰 읽기
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');
const tok = { light: {}, dark: {} };
for (const m of css.matchAll(/--([a-z0-9-]+?)-(light|dark):\s*(#[0-9a-fA-F]{6})\s*;/g)) tok[m[2]][m[1]] = m[3].toLowerCase();
// 토큰이 세 곳(:root 기본·prefers-color-scheme·light-dark)과 @theme 에 다 연결됐는지
for (const t of TONES)
  for (const part of ['', '-ink']) {
    const name = `st-${t}${part}`;
    const src = `st-${t}-${part ? 'ink' : 'bg'}`;
    assert.ok(css.includes(`--${name}: var(--${src}-light);`), `${name} 라이트 기본`);
    assert.ok(css.includes(`--${name}: var(--${src}-dark);`), `${name} 다크 미디어`);
    assert.ok(css.includes(`--${name}: light-dark(var(--${src}-light), var(--${src}-dark));`), `${name} light-dark`);
    assert.ok(css.includes(`--color-${name}: var(--${name});`), `${name} @theme`);
  }

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c) =>
  c
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const hsl = (hex) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
};

let fail = 0;
for (const mode of ['light', 'dark']) {
  const T = tok[mode];
  console.log(`\n[${mode}] 글자 대비 (배지 배경 / surface / bg)  색상·채도`);
  const bgs = new Set();
  for (const t of TONES) {
    const ink = T[`st-${t}-ink`];
    const bg = T[`st-${t}-bg`];
    assert.ok(ink && bg, `${mode} ${t} 토큰 없음`);
    bgs.add(bg);
    const rs = [ratio(ink, bg), ratio(ink, T.surface), ratio(ink, T.bg)];
    const bad = rs.some((r) => r < 4.5);
    // 크림·베이지·주황 검사 (회색 계열 s<0.12 는 상관없음)
    const warm = [ink, bg].filter((c) => {
      const { h, s, l } = hsl(c);
      const orange = h >= 15 && h <= 45 && s >= 0.45 && l > 0.2 && l < 0.85;
      const cream = h >= 25 && h <= 60 && s >= 0.12 && l >= 0.8;
      return orange || cream;
    });
    if (bad || warm.length) fail++;
    const hs = hsl(ink);
    console.log(
      `  ${t.padEnd(10)} ${ink} on ${bg}  ${rs.map((r) => r.toFixed(2)).join(' / ')}  h${Math.round(hs.h)} s${hs.s.toFixed(2)}` +
        (bad ? '  <-- 4.5 미달' : '') +
        (warm.length ? `  <-- 주황/크림 ${warm.join(',')}` : ''),
    );
  }
  if (bgs.size !== TONES.length) {
    fail++;
    console.log('  배지 배경색이 겹친다');
  }
}

if (fail) {
  console.error(`\n실패 ${fail}건`);
  process.exit(1);
}
console.log('\n모두 통과');
