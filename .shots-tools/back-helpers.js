// 지도 확인용 도우미. 페이지마다 한 번 넣는다
window.__pt = (prefix) => {
  const p = document.querySelector(`svg[role=group] path[aria-label^="${prefix}"]`);
  if (!p) return 'nopath';
  const r = p.getBoundingClientRect();
  for (let i = 1; i < 12; i++)
    for (let j = 1; j < 12; j++) {
      const x = Math.round(r.left + (r.width * i) / 12);
      const y = Math.round(r.top + (r.height * j) / 12);
      if (document.elementFromPoint(x, y) === p) return x + ' ' + y;
    }
  return 'none';
};
'ok';
