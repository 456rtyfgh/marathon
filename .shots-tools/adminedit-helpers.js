// adminedit-shots.sh 가 브라우저 시작 스크립트로 넣는다 (--init-script).
// 라벨 글자로 입력칸을 찾아 React 가 알아채게 값을 넣고, 글자로 버튼·탭·목록 항목을 누르고, 쓰기 요청을 센다.
window.__fill = (label, value) => {
  const lab = [...document.querySelectorAll('dialog[open] label')].find((l) => l.textContent.trim().startsWith(label));
  const el = lab && (lab.htmlFor ? document.getElementById(lab.htmlFor) : lab.querySelector('input,textarea,select'));
  if (!el) return 'no field: ' + label;
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : el.tagName === 'SELECT' ? HTMLSelectElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  return 'ok';
};
window.__click = (text) => {
  const b = [...document.querySelectorAll('dialog[open] button, dialog[open] [role=tab], dialog[open] [role=option], header button')].find(
    (x) => x.textContent.trim().startsWith(text),
  );
  if (!b) return 'no button: ' + text;
  b.click();
  return 'ok';
};
/** 화면 어디서든 글자가 똑같은 버튼·메뉴 항목 (머리말 '관리', 메뉴 시트 '관리', 목록의 대회 줄) */
window.__clickExact = (text) => {
  const b = [...document.querySelectorAll('button, [role=menuitem], a')].find((x) => x.offsetParent && x.textContent.trim() === text);
  if (!b) return 'no element: ' + text;
  b.click();
  return 'ok';
};
/** 목록(main)에서 이름이 들어간 대회 줄을 연다 */
window.__openRow = (name) => {
  const b = [...document.querySelectorAll('main button')].find((x) => x.offsetParent && x.textContent.includes(name));
  if (!b) return 'no row: ' + name;
  b.click();
  return 'ok';
};
/** 열린 패널의 가로 넘침·검정 꽉 찬 선택 표시 여부 */
window.__measure = () => {
  const d = document.querySelector('dialog[open]');
  const blackFilled = [...document.querySelectorAll('[aria-selected=true], [role=option][aria-selected=true]')].some((el) => {
    const bg = getComputedStyle(el).backgroundColor;
    return bg === 'rgb(18, 20, 24)';
  });
  return JSON.stringify({ page: document.documentElement.scrollWidth, view: innerWidth, panel: d ? d.scrollWidth - d.clientWidth : null, blackFilled });
};
// Supabase·외부로 나가는 쓰기 요청(POST/PATCH/PUT/DELETE) 수 — 흉내 저장이 네트워크를 안 쓰는지 본다
window.__writes = [];
const of = window.fetch;
window.fetch = (input, init) => {
  const m = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const u = typeof input === 'string' ? input : input.url;
  if (m !== 'GET' && m !== 'HEAD' && !/google|gtag|analytics/.test(u)) window.__writes.push(`${m} ${u}`);
  return of(input, init);
};
