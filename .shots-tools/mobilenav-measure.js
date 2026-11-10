// 휴대폰 메뉴(mobilenav) 측정 함수 — agent-browser --init-script 로 넣는다 (mobilenav-shots.sh 참고).
// window.__navHeader(): 머리말(로고 + nav 안 보이는 누름 요소)의 위치·크기, 겹침, 44px 미만, 가로 넘침
// window.__navMenu():   메뉴 시트 줄마다 높이·한 줄 여부, 시트가 화면 안인지, aria-expanded
// window.__navTrap(n):  (열린 시트에서) 포커스가 시트 안인지 — Tab 을 누를 때마다 부른다
(() => {
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  window.__navHeader = () => {
    const header = document.querySelector('header');
    const logo = header.querySelector('a');
    const nav = header.querySelector('nav');
    const ctl = [...nav.querySelectorAll('a,button')].filter((e) => !e.closest('dialog') && vis(e));
    const name = (e) => (e.hasAttribute('data-nav-menu-button') ? 'MENU' : e.textContent.trim() || e.getAttribute('aria-label') || '?');
    const items = [logo, ...ctl].map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e === logo ? 'logo' : name(e), x: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const overlap = [];
    for (let i = 1; i < items.length; i++) if (items[i].x < items[i - 1].r) overlap.push(items[i - 1].id + '>' + items[i].id);
    const btn = document.querySelector('[data-nav-menu-button]');
    return JSON.stringify({
      sw: document.documentElement.scrollWidth,
      iw: innerWidth,
      overflow: document.documentElement.scrollWidth > innerWidth,
      lang: document.documentElement.lang,
      menuBtn: !!btn && btn.offsetParent !== null,
      gapAfterLogo: items[1] ? items[1].x - items[0].r : null,
      rightSpace: innerWidth - items[items.length - 1].r,
      overlap,
      small: items.filter((i) => i.id !== 'logo' && innerWidth < 768 && i.h < 44).map((i) => i.id),
      tall: items.filter((i) => i.h > 48).map((i) => i.id),
      items: items.map((i) => `${i.id}@${i.x}+${i.w}x${i.h}`).join(' '),
    });
  };
  window.__navMenu = () => {
    const d = document.querySelector('#nav-menu');
    const btn = document.querySelector('[data-nav-menu-button]');
    if (!d) return JSON.stringify({ error: 'no #nav-menu' });
    const r = d.getBoundingClientRect();
    const rows = [...d.querySelectorAll('[data-menu-item], button')].map((e) => {
      const b = e.getBoundingClientRect();
      const one = e.scrollWidth <= e.clientWidth + 1 && b.height <= 64;
      return `${e.dataset.menuItem ?? 'btn'}:${Math.round(b.height)}:${one ? 'one' : 'WRAP'}`;
    });
    return JSON.stringify({
      open: d.open,
      expanded: btn && btn.getAttribute('aria-expanded'),
      inside: r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
      sheet: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`,
      small: rows.filter((x) => +x.split(':')[1] < 44),
      wrap: rows.filter((x) => x.endsWith('WRAP')),
      sw: document.documentElement.scrollWidth,
      rows: rows.join(' '),
    });
  };
  window.__navTrap = () => {
    const d = document.querySelector('#nav-menu');
    const a = document.activeElement;
    return `${!!d && d.contains(a)}:${a ? a.dataset?.menuItem ?? a.tagName : 'none'}`;
  };
})();
