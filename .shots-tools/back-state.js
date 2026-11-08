(() => {
  const svg = document.querySelector('svg[role=group]');
  const box = svg.parentElement;
  const backs = [...box.querySelectorAll(':scope > div.pointer-events-none button')].map((b) => b.textContent.trim());
  const sel = [...svg.querySelectorAll('path[aria-pressed=true]')].map((p) => p.getAttribute('aria-label'));
  const scope = [...document.querySelectorAll('[role=radio][aria-checked=true]')].map((b) => b.textContent.trim());
  const chips = [...document.querySelectorAll('section[aria-label="지역별로 보기"] button[aria-pressed=true]')].map((b) => b.textContent.trim());
  return JSON.stringify({ map: svg.getAttribute('aria-label'), backs, sel, scope, chips });
})()
