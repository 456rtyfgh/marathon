// 문장 속 링크(지도 출처·푸터)의 눌리는 높이(px)를 잰다 (mobile-a-peek.mjs --jsfile 로 실행).
JSON.stringify(
  [...document.querySelectorAll('footer p a, section p a[target=_blank]')].map((a) => {
    const r = a.getBoundingClientRect();
    return `${a.innerText.slice(0, 20)} ${Math.round(r.width)}x${Math.round(r.height)}`;
  }),
);
