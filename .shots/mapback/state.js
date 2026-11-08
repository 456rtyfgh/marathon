(() => {
  const svg = document.querySelector('svg[role=group]');
  const box = svg.parentElement;
  const btns = [...box.querySelectorAll('button')].filter((b) => !b.getAttribute('aria-label')).map((b) => b.textContent.trim());
  const chips = [...document.querySelectorAll('section[aria-label="지역별로 보기"] button[aria-pressed=true]')].map((b) => b.textContent.trim());
  const tab = [...document.querySelectorAll('[role=radio][aria-checked=true]')].map((b) => b.textContent.trim());
  return JSON.stringify({ map: svg.getAttribute('aria-label'), vb: svg.getAttribute('viewBox').split(' ').map((n) => Math.round(n)).join(' '), btns, chips, tab });
})()
