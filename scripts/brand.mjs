/**
 * 로고 파일을 public/brand/symbol.svg 한 장에서 전부 만든다. 다시 돌려도 결과가 같다.
 *   node scripts/brand.mjs            → 아래 파일 전부
 *   node scripts/brand.mjs --compare  → 워드마크 서체 후보 3종 비교 그림(.shots/b1/brand-fonts.png)
 *
 * 만드는 파일
 *   public/brand/symbol.svg          원본 심볼(남색 타일 + 흰 체크 두 줄 + 주황 82). 파일이 SVG 가 아니면 설명대로 다시 그린다.
 *   public/brand/symbol-inverse.svg  반전판: 남색 ↔ 흰색만 바꿈(주황 82 그대로)
 *   public/brand/wordmark.svg        'marathoncalendar' 글자 path, 남색
 *   public/brand/wordmark-inverse.svg 같은 글자, 흰색
 *   public/brand/logo-512.png        심볼 512×512 (검색엔진 Organization.logo, manifest)
 *   public/apple-touch-icon.png      180×180, 모서리까지 남색으로 채움(iOS 가 직접 둥글게 자른다)
 *   public/favicon.svg               심볼과 같음
 *
 * 워드마크: Outfit 900('marathon') + Outfit 300('calendar'), 붙여 씀. 서체는 글자 모양으로 바꿔 넣어서 화면에서 폰트를 받지 않는다.
 * 워드마크 비율(가로 ÷ 세로)은 실행할 때 콘솔에 WORDMARK_RATIO 로 찍힌다. → 지금 값: 11.57 (viewBox 2314×200,
 * 위는 l·h·d 꼭대기, 아래는 글자 바닥선 — 내려가는 글자가 없다). <img> width/height 는 이 비율로 계산한다 (예: 높이 14 → 너비 162).
 *
 * og.png 는 한글 문장이 있어 브라우저로 찍는다: scripts/og.html 주석 참고.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import opentype from 'opentype.js';
import { Resvg } from '@resvg/resvg-js';

const NAVY = '#0E2A47';
const ORANGE = '#FF5A36';
const WHITE = '#FFFFFF';
const root = new URL('../', import.meta.url);
const at = (p) => new URL(p, root);
const font = (pkg, w) => {
  const b = readFileSync(at(`node_modules/@fontsource/${pkg}/files/${pkg}-latin-${w}-normal.woff`));
  return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};
const n = (v) => Math.round(v * 10) / 10;

/** 글자를 path 로. 왼쪽 위가 (0,0)이 되게 옮긴 path 문자열과 크기를 돌려준다. */
function textPath(runs, size) {
  // 글자 하나씩 놓는다 (opentype.js 의 문장 처리는 일부 서체의 대체 규칙을 못 읽어 쓰지 않는다). 커닝은 같은 굵기 안에서만.
  let x = 0;
  const paths = runs.flatMap(({ f, s }) => {
    const k = size / f.unitsPerEm;
    const glyphs = [...s].map((ch) => f.charToGlyph(ch));
    return glyphs.map((g, i) => {
      const p = g.getPath(x, 0, size);
      x += g.advanceWidth * k + (glyphs[i + 1] ? f.getKerningValue(g, glyphs[i + 1]) * k : 0);
      return p;
    });
  });
  const boxes = paths.map((p) => p.getBoundingBox());
  const x1 = Math.min(...boxes.map((b) => b.x1));
  const y1 = Math.min(...boxes.map((b) => b.y1));
  const x2 = Math.max(...boxes.map((b) => b.x2));
  const y2 = Math.max(...boxes.map((b) => b.y2));
  const d = paths
    .map((p) => {
      p.commands.forEach((c) => {
        for (const k of ['x', 'y', 'x1', 'y1', 'x2', 'y2']) if (k in c) c[k] = n(c[k] - (k.startsWith('x') ? x1 : y1));
      });
      return p.toPathData(1);
    })
    .join('');
  return { d, w: x2 - x1, h: y2 - y1 };
}

/** 원본이 깨져 있을 때 쓰는 재현판: 둥근 남색 타일, 위쪽 체크무늬 두 줄(결승선), 아래 주황 82 */
function drawSymbol() {
  const cols = 8;
  const cell = 40;
  const left = (512 - cols * cell) / 2;
  const top = 108;
  const squares = [];
  for (let row = 0; row < 2; row++)
    for (let c = 0; c < cols; c++)
      if ((c + row) % 2 === 0) squares.push(`<rect x="${left + c * cell}" y="${top + row * cell}" width="${cell}" height="${cell}"/>`);
  const num = textPath([{ f: font('outfit', 900), s: '82' }], 300);
  const scale = Math.min(300 / num.w, 196 / num.h);
  const nx = n((512 - num.w * scale) / 2);
  const ny = n(top + 2 * cell + 28);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${NAVY}"/><g fill="${WHITE}">${squares.join('')}</g><path transform="translate(${nx} ${ny}) scale(${n(scale * 1000) / 1000})" fill="${ORANGE}" d="${num.d}"/></svg>\n`;
}

/** 남색 ↔ 흰색 맞바꾸기 (원본이 들어와도 그대로 통한다) */
const invert = (svg) =>
  svg.replace(/#0e2a47|#ffffff|#fff\b|\bwhite\b/gi, (c) => (c.toLowerCase() === NAVY.toLowerCase() ? WHITE : NAVY));

function wordmark(heavy, light, color) {
  const t = textPath([{ f: heavy, s: 'marathon' }, { f: light, s: 'calendar' }], 200);
  const scale = 200 / t.h;
  const W = Math.round(t.w * scale);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 200"><path transform="scale(${n(scale * 1000) / 1000})" fill="${color}" d="${t.d}"/></svg>\n`;
  return { svg, W };
}

const png = (svg, size) => new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();

if (process.argv.includes('--compare')) {
  const cand = [
    ['outfit', 900, 300],
    ['plus-jakarta-sans', 800, 300],
    ['manrope', 800, 300],
  ];
  const rows = cand.map(([pkg, hw, lw], i) => {
    const { svg, W } = wordmark(font(pkg, hw), font(pkg, lw), WHITE);
    const inner = svg.replace(/^<svg[^>]*>|<\/svg>\n$/g, '');
    const s = 900 / W;
    return `<g transform="translate(50 ${40 + i * 140}) scale(${s})">${inner}</g>`;
  });
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="440"><rect width="1000" height="440" fill="${NAVY}"/>${rows.join('')}</svg>`;
  mkdirSync(at('.shots/b1'), { recursive: true });
  writeFileSync(at('.shots/b1/brand-fonts.png'), png(sheet, 1000));
  console.log('brand: .shots/b1/brand-fonts.png (위부터 outfit / plus jakarta sans / manrope)');
  process.exit(0);
}

let symbol = readFileSync(at('public/brand/symbol.svg'), 'utf8');
if (!/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/.test(symbol)) {
  symbol = drawSymbol();
  writeFileSync(at('public/brand/symbol.svg'), symbol);
  console.log('brand: symbol.svg 가 SVG 가 아니라 설명대로 다시 그림');
}
const inverse = invert(symbol);
const heavy = font('outfit', 900);
const light = font('outfit', 300);
const wm = wordmark(heavy, light, NAVY);
const wmInv = wordmark(heavy, light, WHITE);

// iOS 아이콘: 투명 모서리가 검게 보이지 않게 남색 바탕 위에 심볼을 얹는다
const apple = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512"><rect width="512" height="512" fill="${NAVY}"/><image width="512" height="512" href="data:image/svg+xml;base64,${Buffer.from(symbol).toString('base64')}"/></svg>`;

writeFileSync(at('public/brand/symbol-inverse.svg'), inverse);
writeFileSync(at('public/brand/wordmark.svg'), wm.svg);
writeFileSync(at('public/brand/wordmark-inverse.svg'), wmInv.svg);
writeFileSync(at('public/favicon.svg'), symbol);
writeFileSync(at('public/brand/logo-512.png'), png(symbol, 512));
writeFileSync(at('public/apple-touch-icon.png'), png(apple, 180));
console.log(`brand: 파일 7개 생성. WORDMARK_RATIO = ${(wm.W / 200).toFixed(2)} (viewBox ${wm.W}×200)`);
