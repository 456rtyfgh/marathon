// 상세 패널 맨 아래 '비슷한 대회'(RaceRow 를 같이 쓴다)로 스크롤한다 (mobile-a-peek.mjs --jsfile 로 실행, /r/<id> 에서).
(() => {
  const d = document.querySelector('dialog[open]');
  if (!d) return 'no dialog';
  const box = [...d.querySelectorAll('*')].find((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight) ?? d;
  box.scrollTop = box.scrollHeight;
  return `rows ${d.querySelectorAll('li button').length}, scrollWidth ${box.scrollWidth}/${box.clientWidth}`;
})();
