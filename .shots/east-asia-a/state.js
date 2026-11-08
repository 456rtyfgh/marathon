(() => {
  const svg = [...document.querySelectorAll('svg')].find((s) => s.querySelector('path[role=button]'));
  const btn = [...document.querySelectorAll('button')];
  const pressed = btn.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent.trim()).slice(0, 6);
  const units = [...document.querySelectorAll('span')].map((s) => s.textContent.trim()).filter((t) => ['나라', '도도부현', '성·시', '주', '레지옹', '지역'].includes(t));
  const kr = document.querySelector('path[aria-label^="한국 대회"]');
  const r = kr && kr.getBoundingClientRect();
  const sel = svg ? [...svg.querySelectorAll('path[aria-pressed=true]')].map((p) => p.getAttribute('aria-label')) : [];
  return JSON.stringify({ vb: svg && svg.getAttribute('viewBox'), back: btn.some((b) => b.textContent.includes('전체 지도')), pressed, units, sel, paths: svg && svg.querySelectorAll('path').length, kr: r && [Math.round(r.width), Math.round(r.height)] });
})()
