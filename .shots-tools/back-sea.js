(() => {
  const svg = document.querySelector('svg[role=group]');
  const r = svg.getBoundingClientRect();
  // 위아래 버튼·범례를 피해 가운데 줄부터 훑어 svg 바탕(바다) 점을 찾는다
  for (const fy of [0.5, 0.35, 0.65, 0.8, 0.2])
    for (let fx = 0.05; fx < 0.95; fx += 0.03) {
      const x = Math.round(r.left + r.width * fx);
      const y = Math.round(r.top + r.height * fy);
      if (document.elementFromPoint(x, y) === svg) return x + ' ' + y;
    }
  return 'none';
})()
