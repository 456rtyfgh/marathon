// svg 바탕(바다) 점 하나를 찾아 화면 좌표로 돌려준다 (왼쪽 아래 범례·왼쪽 위 버튼을 피해 가운데 쪽부터)
(() => {
  const svg = document.querySelector('svg[role=group]');
  const r = svg.getBoundingClientRect();
  for (let fy = 0.3; fy <= 0.9; fy += 0.05)
    for (let fx = 0.05; fx <= 0.95; fx += 0.03) {
      const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
      if (document.elementFromPoint(x, y) === svg) return `${x} ${y}`;
    }
  return 'none';
})()
