// 확인용 도우미를 window 에 붙인다: __st() 상태, __pt(sel) sel 이 실제로 맨 위에 있는 화면 점, __sea() 바다 점
window.__st = () => {
  const svg = document.querySelector('svg[role=group]');
  const box = svg.parentElement;
  const btns = [...box.querySelectorAll('button')].filter((b) => !b.getAttribute('aria-label')).map((b) => b.textContent.trim());
  const chips = [...document.querySelectorAll('section[aria-label="지역별로 보기"] button[aria-pressed=true]')].map((b) => b.textContent.trim());
  const tab = [...document.querySelectorAll('[role=radio][aria-checked=true]')].map((b) => b.textContent.trim());
  const sel = svg.querySelector('path[aria-pressed=true]')?.getAttribute('aria-label') ?? null;
  return JSON.stringify({ map: svg.getAttribute('aria-label'), sel, btns, chips, tab });
};
window.__pt = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return 'none';
  const r = el.getBoundingClientRect();
  for (let fy = 0.1; fy <= 0.9; fy += 0.05)
    for (let fx = 0.1; fx <= 0.9; fx += 0.05) {
      const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
      if (document.elementFromPoint(x, y) === el) return `${x} ${y}`;
    }
  return 'none';
};
window.__sea = () => {
  const svg = document.querySelector('svg[role=group]');
  const r = svg.getBoundingClientRect();
  for (let fy = 0.3; fy <= 0.9; fy += 0.05)
    for (let fx = 0.05; fx <= 0.95; fx += 0.03) {
      const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
      if (document.elementFromPoint(x, y) === svg) return `${x} ${y}`;
    }
  return 'none';
};
'ok';
