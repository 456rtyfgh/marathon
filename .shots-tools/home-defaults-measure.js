// 첫 화면 목록 기본값 측정 함수 — agent-browser --init-script 로 넣는다 (home-defaults-shots.sh 참고).
// window.__hdMeasure(): 범위 탭·정렬·현황판·필터 숫자·켜진 칩·묶음·첫 3개·날짜 오름차순·국내 여부 (JSON 글)
(() => {
  const fiberKey = (el) => {
    const k = Object.keys(el).find((x) => x.startsWith('__reactFiber$'));
    let f = k && el[k];
    while (f && f.key == null) f = f.return;
    return f ? f.key : null;
  };
  let data = null;
  window.__hdLoad = async () => {
    if (!data) {
      const j = await (await fetch('/data.json')).json();
      data = new Map((j.races ?? j).map((r) => [r.id, r]));
    }
    return 'ok';
  };
  window.__hdMeasure = async () => {
    await window.__hdLoad();
    const txt = (e) => (e ? e.textContent.replace(/\s+/g, ' ').trim() : null);
    const tabs = [...document.querySelectorAll('[role=radiogroup] [role=radio]')].map((b) => ({
      label: txt(b.firstChild),
      n: txt(b.querySelector('.num')),
      on: b.getAttribute('aria-checked') === 'true',
    }));
    const sel = document.querySelector('select');
    const stats = [...document.querySelectorAll('section .grid-cols-3 > button[aria-pressed]')].map((b) => ({
      label: txt(b.firstElementChild),
      n: txt(b.lastElementChild),
      on: b.getAttribute('aria-pressed') === 'true',
    }));
    const filterBtn = [...document.querySelectorAll('button[aria-expanded]')].find((b) => b.querySelector('svg') && b.closest('.border-y'));
    const filterNum = filterBtn ? txt(filterBtn.querySelector('.num')) : null;
    // 칩: 필터 칸을 잠깐 열어 켜진 칩을 읽고 다시 닫는다
    let chips = null;
    if (filterBtn) {
      const wasOpen = filterBtn.getAttribute('aria-expanded') === 'true';
      if (!wasOpen) filterBtn.click();
      await new Promise((r) => setTimeout(r, 300));
      chips = [...document.querySelectorAll('.border-y .border-t button[aria-pressed=true]')].map(txt);
      if (!wasOpen) filterBtn.click();
      await new Promise((r) => setTimeout(r, 200));
    }
    const list = document.getElementById('list');
    const groups = [...list.querySelectorAll(':scope > div.pt-8')].map((g) => ({
      title: txt(g.querySelector('h2 span')),
      total: Number(txt(g.querySelector('h2 .num')).replace(/,/g, '')),
      rows: [...g.querySelectorAll('ul > li')].map(fiberKey),
    }));
    const ids = groups.flatMap((g) => g.rows);
    const rs = ids.map((id) => data.get(id)).filter(Boolean);
    const dates = rs.map((r) => r.race_date);
    return JSON.stringify({
      path: location.pathname + location.search,
      lang: document.documentElement.lang,
      tabs,
      sort: sel ? sel.value : null,
      stats,
      filterNum,
      chips,
      groups: groups.map((g) => ({ title: g.title, total: g.total, shownRows: g.rows.length })),
      shown: groups.reduce((n, g) => n + g.total, 0),
      first3: rs.slice(0, 3).map((r) => `${r.race_date} ${r.name_ko}`),
      first3ids: ids.slice(0, 3),
      rowsSeen: ids.length,
      ascending: dates.every((d, i) => i === 0 || dates[i - 1] <= d),
      allDomestic: rs.every((r) => r.region === '한국'),
      anyAbroad: rs.some((r) => r.region !== '한국'),
      lead: txt(document.querySelector('h1 + p')),
    });
  };
})();
