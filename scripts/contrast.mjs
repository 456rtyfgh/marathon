// 색 토큰 대비 검사: node scripts/contrast.mjs [css 경로]
// src/index.css(또는 넘긴 파일)의 `--이름-light: #rrggbb;` / `--이름-dark: #rrggbb;` 줄만 읽는다 (값은 6자리 hex).
// WCAG 2.x 상대휘도 기준. 필수 쌍이 하나라도 미달이면 exit 1. 아직 없는 토큰은 skip.
import { readFileSync } from 'node:fs';

const css = readFileSync(process.argv[2] ?? new URL('../src/index.css', import.meta.url), 'utf8');
const tokens = { light: {}, dark: {} };
for (const m of css.matchAll(/--([a-z0-9-]+?)-(light|dark):\s*(#[0-9a-fA-F]{6})\s*;/g)) tokens[m[2]][m[1]] = m[3];

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c) =>
  c
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// 반투명 글자(opacity-70 등)는 바탕과 섞은 색으로 잰다
const blend = (fg, bg, alpha) => fg.map((v, i) => Math.round(v * alpha + bg[i] * (1 - alpha)));

// [글자, 바탕, 기준, 글자 불투명도, 설명]. 기준 0 = 참고로만 출력
const BG3 = ['bg', 'surface', 'sunken'];
const pairs = [
  ...['ink', 'ink2', 'ink3'].flatMap((fg) => BG3.map((bg) => [fg, bg, 4.5])),
  ['on-accent', 'accent', 4.5],
  // 강조 칸 안 보조 글자: RaceDetail 마감 칸·App 현황판 hot 칸 opacity-85
  ['on-accent', 'accent', 4.5, 0.85, 'opacity-85'],
  // bg-ink 위 text-bg 의 가장 흐린 경우: 접수 완료 버튼 opacity-70 (현황판 선택 칸 75, 켜진 칩 숫자 80)
  ['bg', 'ink', 4.5, 0.7, 'opacity-70'],
  // 꺼진 칩 숫자: bg-surface 위 text-ink-2 opacity-80
  ['ink2', 'surface', 4.5, 0.8, 'opacity-80'],
  // 지난 대회 목록 전체 opacity-70 (일부러 흐리게 한 것, 참고)
  ['ink3', 'bg', 0, 0.7, 'opacity-70'],
  ['accent-ink', 'bg', 4.5],
  ['accent-ink', 'surface', 4.5],
  ['on-warn', 'warn', 4.5],
  ['warn', 'bg', 4.5],
  ['warn', 'surface', 4.5],
  ['accent', 'bg', 0],
  ['accent', 'surface', 0],
  ['line', 'bg', 0],
  // 지도 (비텍스트 기준 3). 가장 많은 단계·고른 곳은 지도 바탕(surface)과 빈 나라(sunken) 위에서 보여야 한다
  ['map5', 'surface', 3],
  ['map5', 'sunken', 3],
  ['map-sel', 'surface', 3],
  ['map-sel', 'sunken', 3],
  // 이웃 단계끼리 (참고, 1.25 이상이면 눈으로 구분됨)
  ['map1', 'sunken', 0],
  ['map2', 'map1', 0],
  ['map3', 'map2', 0],
  ['map4', 'map3', 0],
  ['map5', 'map4', 0],
  // 고른 곳 vs 단계색 (참고). 다크에선 1단계(어두움)·5단계(밝음) 둘 다와 3 이상은 불가능 →
  // 단계색과는 색상(파랑 대 연두)과 외곽선으로 구분한다
  ...['map1', 'map3', 'map5'].map((m) => ['map-sel', m, 0]),
];

let fail = 0;
for (const mode of ['light', 'dark']) {
  const t = tokens[mode];
  console.log(`\n[${mode}]`);
  for (const [fg, bg, min, alpha = 1, note = ''] of pairs) {
    const label = `${fg}${note ? ` (${note})` : ''} / ${bg}`.padEnd(34);
    if (!t[fg] || !t[bg]) {
      console.log(`  ${label} skip`);
      continue;
    }
    const f = alpha < 1 ? blend(rgb(t[fg]), rgb(t[bg]), alpha) : rgb(t[fg]);
    const r = ratio(f, rgb(t[bg]));
    const ok = r >= min;
    if (!ok) fail++;
    const mark = min === 0 ? '참고' : ok ? 'ok' : `미달 (< ${min})`;
    console.log(`  ${label} ${r.toFixed(2).padStart(6)}  ${mark}`);
  }
}
console.log(fail ? `\n미달 ${fail}개` : '\n모두 통과');
process.exit(fail ? 1 : 0);
