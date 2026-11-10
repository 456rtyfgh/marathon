// A-0(히스토리 표시 보존) 뒤에도 주소 흐름이 전과 같은지 (mobile-a-peek.mjs --jsfile 로 실행, 첫 화면에서).
// 대회 열기 → 주소 /r/<id>, 닫기 → /. 러닝톡 열기 → /community, 뒤로 가기 → 닫히고 /. 단계마다 주소·열린 dialog 수·history.state 를 적는다.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const snap = (step) => `${step}: ${location.pathname}${location.search} dialogs=${document.querySelectorAll('dialog[open]').length} state=${JSON.stringify(history.state)} len=${history.length}`;
  const out = [snap('start')];
  document.querySelector('#list li button').click();
  await wait(900);
  out.push(snap('race open'));
  document.querySelector('dialog[open] button[aria-label="닫기"], dialog[open] button[aria-label="Close"]').click();
  await wait(900);
  out.push(snap('race closed'));
  document.querySelector('header nav a').click();
  await wait(900);
  out.push(snap('talk open'));
  history.back();
  await wait(900);
  out.push(snap('talk back'));
  return JSON.stringify(out);
})();
