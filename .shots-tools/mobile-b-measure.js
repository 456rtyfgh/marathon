// 휴대폰 화면 측정: 넘침 · 44px 미달 터치 대상 · 13px 미만 글자. 열린 dialog 가 있으면 맨 위 dialog 안만 본다.
// (PLAN 6.4 의 코드 그대로 — 파트 A·B 가 같은 뜻으로 수치를 읽으려고 고정했다. agent-browser --init-script 로 넣는다)
window.__mShiftSum = 0;
try {
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) window.__mShiftSum += e.value;
  }).observe({ type: 'layout-shift', buffered: true });
} catch {}
window.__mShift = () => Math.round(window.__mShiftSum * 1000) / 1000; // 지금까지의 레이아웃 흔들림 합(CLS 어림)
window.__mMeasure = () => {
  const open = [...document.querySelectorAll('dialog[open]')];
  const root = open.at(-1) ?? document.body;
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[aria-hidden="true"]');
  };
  const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 30);
  // 넘침: 문서, 그리고 root 안에서 세로로 스크롤하는 상자(패널 본문)
  const boxes = [...root.querySelectorAll('*')].filter((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight);
  const overflow = [
    { box: 'document', scrollWidth: document.documentElement.scrollWidth, width: innerWidth },
    ...[root, ...boxes].filter((el) => el !== document.body).map((el) => ({ box: el.tagName + '.' + String(el.className).slice(0, 30), scrollWidth: el.scrollWidth, width: el.clientWidth })),
  ].filter((o) => o.box === 'document' || o.scrollWidth > o.width);
  // 터치: 체크박스·라디오는 감싼 label 을 눌리는 영역으로 본다
  const small = [];
  for (const el of root.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=tab], [role=radio], [role=checkbox], [role=switch]')) {
    if (!shown(el) || el.disabled) continue;
    const r = (el.closest('label') ?? el).getBoundingClientRect();
    if (r.width < 44 || r.height < 44) small.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  // 글자: 13px 미만 글자가 직접 든 요소
  const tiny = [];
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!n.nodeValue.trim() || !el || !shown(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 13) tiny.push(`${px}px ${n.nodeValue.trim().replace(/\d+/g, '0').slice(0, 20)}`); // 숫자만 다른 글자는 한 줄로
  }
  return { url: location.pathname + location.search, width: innerWidth, overflow, small, tiny: [...new Set(tiny)], shift: window.__mShift() };
};
// 장면 스크립트용 도우미 (측정 코드 밖): 글자로 버튼·탭·링크 누르기, 맨 위 패널 스크롤
window.__mClick = (text, sel = 'button, a, [role=tab], [role=radio]') => {
  const open = [...document.querySelectorAll('dialog[open]')];
  const root = open.at(-1) ?? document.body;
  const vis = (el) => el.getBoundingClientRect().width > 1;
  const all = [...root.querySelectorAll(sel)].filter(vis);
  const el = all.find((e) => (e.innerText || '').trim() === text) ?? all.find((e) => (e.getAttribute('aria-label') || '') === text) ?? all.find((e) => (e.innerText || '').trim().startsWith(text));
  if (!el) return 'not found: ' + text;
  el.scrollIntoView({ block: 'center' });
  el.click();
  return 'clicked: ' + (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30);
};
window.__mScroll = (y) => {
  const open = [...document.querySelectorAll('dialog[open]')];
  const d = open.at(-1);
  const box = d ? ([...d.querySelectorAll('*')].find((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) ?? d) : document.scrollingElement;
  box.scrollTop = y === 'end' ? box.scrollHeight : y;
  return box.scrollTop;
};
window.__mState = () => ({ url: location.pathname + location.search, len: history.length, depth: history.state?.panelDepth ?? null, dialogs: document.querySelectorAll('dialog[open]').length });
