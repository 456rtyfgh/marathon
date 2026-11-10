// 휴대폰 아래 고정 줄(정렬·필터) 동작 확인 (mobile-a-peek.mjs --jsfile 로 실행, 390px 첫 화면에서).
// 1) 위쪽에서는 안 보임  2) 목록을 내리면 보임  3) 정렬을 바꾸면 목록 위로  4) 필터를 접어 둔 채 '필터' 를 누르면 펼쳐지고 도구 막대로 올라감
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const bar = () => document.querySelector('[role=group].fixed');
  const toggle = () => document.querySelector('#tools button[aria-expanded]');
  const out = {};
  scrollTo({ top: 0, behavior: 'instant' });
  await wait(300);
  out.topHidden = !bar();
  scrollTo({ top: 3000, behavior: 'instant' });
  await wait(400);
  out.midShown = !!bar();
  out.barHeight = bar() ? Math.round(bar().getBoundingClientRect().height) : null;
  // 정렬 바꾸기 (React 가 듣는 change 이벤트로)
  const sel = bar().querySelector('select');
  const before = document.querySelector('#list h2')?.innerText;
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, 'entry');
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  await wait(1200);
  out.sortChanged = `${before} -> ${document.querySelector('#list h2')?.innerText}`.replace(/\n/g, ' ');
  out.listTopAfterSort = Math.round(document.getElementById('list').getBoundingClientRect().top);
  out.barStillShown = !!bar();
  // 필터를 접고(도구 막대의 버튼) 다시 내려가 아래 줄의 '필터'
  toggle().click();
  await wait(200);
  out.closed = toggle().getAttribute('aria-expanded');
  scrollTo({ top: 2500, behavior: 'instant' });
  await wait(400);
  bar().querySelector('button').click();
  await wait(1200);
  out.reopened = toggle().getAttribute('aria-expanded');
  out.toolsTop = Math.round(document.getElementById('tools').getBoundingClientRect().top);
  out.barHiddenAtTools = !bar();
  return JSON.stringify(out);
})();
