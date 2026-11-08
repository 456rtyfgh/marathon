// east-asia-check 용 판정 도우미. agent-browser eval --stdin < 이 파일 로 페이지에 넣은 뒤
// __ea.run(['p:한국', 'st', 'b:전체 지도', 'seen']) 처럼 쓴다 (p: 나라 path 클릭, b: 버튼 클릭, st: 상태, seen: 동아시아 나라 보이는 정도)
window.__ea = (() => {
  const sec = () => document.querySelector('section[aria-label="지역별로 보기"]');
  const svg = () => document.querySelector('svg[role=group]');
  const st = () => ({
    tab: [...document.querySelectorAll('[role=radio]')]
      .filter((b) => b.getAttribute('aria-checked') === 'true')
      .map((b) => b.textContent.replace(/[0-9,]/g, '').trim()),
    map: svg()?.getAttribute('aria-label'),
    on: [...sec().querySelectorAll('button[aria-pressed=true]')].map((b) => b.textContent.replace(/[0-9]/g, '').trim()),
    back: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === '전체 지도'),
    rows: [...sec().querySelectorAll('span.shrink-0.font-semibold')].map((s) => s.textContent.trim()),
    vb: svg()?.getAttribute('viewBox'),
    pressed: [...document.querySelectorAll('path[aria-pressed=true]')].map((p) => p.getAttribute('aria-label')),
    hint: sec().querySelector('p.text-\\[12px\\] span')?.textContent.slice(0, 30),
  });
  const seen = () => {
    const s = svg().getBoundingClientRect();
    const o = {};
    for (const n of ['한국', '일본', '중국', '대만', '몽골']) {
      const p = document.querySelector(`path[aria-label^="${n} 대회"]`);
      if (!p) {
        o[n] = 'none';
        continue;
      }
      const r = p.getBoundingClientRect();
      const w = Math.max(0, Math.min(r.right, s.right) - Math.max(r.left, s.left));
      const h = Math.max(0, Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top));
      o[n] = `${Math.round((100 * w * h) / (r.width * r.height || 1))}% ${r.width.toFixed(1)}x${r.height.toFixed(1)}`;
    }
    return o;
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // React onClick 은 path 의 click 이벤트로 돈다. 작은 화면에서 한국이 몇 px 라 좌표 대신 요소 클릭
  const clickPath = (n) => {
    const p = document.querySelector(`path[aria-label^="${n} 대회"]`);
    if (!p) return `no path ${n}`;
    p.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return `p:${n}`;
  };
  const clickBtn = (t) => {
    const b = [...document.querySelectorAll('button')].find((b) => b.textContent.replace(/[0-9]/g, '').trim() === t);
    if (!b) return `no button ${t}`;
    b.click();
    return `b:${t}`;
  };
  const run = async (steps) => {
    const out = [];
    for (const s of steps) {
      if (s === 'st') out.push(st());
      else if (s === 'seen') out.push(seen());
      else {
        out.push(s.startsWith('p:') ? clickPath(s.slice(2)) : clickBtn(s.slice(2)));
        // 지도 lazy 로딩·확대 애니메이션(320ms) 기다림
        await wait(900);
      }
    }
    return JSON.stringify(out);
  };
  return { st, seen, run };
})();
'ok';
