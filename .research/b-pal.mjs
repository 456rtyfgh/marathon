// 지도 단계색 후보 계산 (임시, 커밋 안 함): node .research/b-pal.mjs '<json>'
const toLin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function oklch(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return '#' + [r, g, bb].map((v) => Math.round(Math.min(1, Math.max(0, toLin(v))) * 255).toString(16).padStart(2, '0')).join('');
}
const lum = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return ((x + 0.05) / (y + 0.05)).toFixed(2); };
const sets = JSON.parse(process.argv[2]);
for (const [m, s] of Object.entries(sets)) {
  const st = s.steps.map((p) => oklch(...p)); const sel = oklch(...s.sel);
  console.log(m, st.join(' '), 'sel', sel);
  st.forEach((c, i) => console.log(`  map-${i + 1} sunken ${ratio(c, s.sunken)} surface ${ratio(c, s.surface)} sel ${ratio(c, sel)} prev ${i ? ratio(c, st[i - 1]) : '-'}`));
  console.log('  sel/surface', ratio(sel, s.surface), 'sel/sunken', ratio(sel, s.sunken));
}
