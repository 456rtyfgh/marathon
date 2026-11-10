// 지금까지의 레이아웃 흔들림을 원인 요소와 함께 돌려준다 (mobile-a-peek.mjs --jsfile 로 실행). 값·시각(ms)·움직인 요소(위치 전→후, 높이 전→후).
new Promise((done) => {
  const out = [];
  const finish = () => done(JSON.stringify(out));
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries())
        out.push({
          v: Math.round(e.value * 1000) / 1000,
          t: Math.round(e.startTime),
          input: e.hadRecentInput,
          src: e.sources.map(
            (s) =>
              `${s.node ? `${s.node.nodeName}.${String(s.node.className || '').slice(0, 40)}|${(s.node.innerText || '').slice(0, 24).replace(/\n/g, ' ')}` : '?'} top ${Math.round(s.previousRect.top)}->${Math.round(s.currentRect.top)} h ${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}`,
          ),
        });
      finish();
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    finish();
  }
  setTimeout(finish, 1500);
});
