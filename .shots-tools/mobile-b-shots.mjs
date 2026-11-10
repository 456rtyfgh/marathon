// 파트 B(대회 상세·러닝톡·내 정보·로그인·추가 요청·처리방침) 스크린샷 + 측정.
//   node .shots-tools/mobile-b-shots.mjs <before|after> <포트> [폭들="360,390,414,1280"] [장면 필터(정규식)] [light|dark]
// 저장: .duo-shots/mobile/<before|after>/b-<장면>-<ko|en>-<폭>.png (dark 는 이름 끝에 -dark),
//       측정값은 .duo-shots/mobile/metrics-b-<before|after>.txt 에 한 줄씩 덧붙인다(장면 이름 · 폭 · __mMeasure() 결과).
// 개발 서버에서 돈다(로그인·러닝톡 흉내 ?amock ?cmock 은 개발 서버에서만 된다). 약관·Lighthouse 는 빌드 결과에서 따로.
// 끝나면 브라우저 세션(mobile-b)을 닫는다. 서버는 직접 끈다.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [mode, port, widthArg = '360,390,414,1280', only = '.', scheme = 'light', session = 'mobile-b'] = process.argv.slice(2);
if (!/^(before|after)$/.test(mode ?? '') || !port) {
  console.error('사용: node .shots-tools/mobile-b-shots.mjs <before|after> <포트> [폭들] [장면 필터] [light|dark] [세션 이름]');
  process.exit(1);
}
// 세션 이름: 기준(before)과 현재(after)를 동시에 찍을 때 여섯째 인자로 나눈다
const SESSION = session;
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = join(root, '.duo-shots/mobile', mode);
const met = join(root, '.duo-shots/mobile', `metrics-b-${mode}.txt`);
mkdirSync(out, { recursive: true });
const onlyRe = new RegExp(only);
const base = `http://localhost:${port}`;
const suffix = scheme === 'dark' ? '-dark' : '';
let W = 390;

const ab = (...args) => {
  try {
    return execFileSync('agent-browser', ['--session', SESSION, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 40000 }).trim();
  } catch (e) {
    return `ERR ${String(e.stderr || e.message).slice(0, 200)}`;
  }
};
const ev = (js) => ab('eval', js);
const pause = (ms = 500) => ab('wait', String(ms));
const go = (path, ms = 1800) => {
  ab('open', base + path);
  // 패널로 바로 들어가는 주소(/r/<id>, /community)는 내용(제목)이 그려질 때까지 기다린다 — 서버가 바쁘면 빈 패널이 찍힌다
  if (/\/(r|community)(\/|\?|$)/.test(path)) ab('wait', 'dialog[open] h2');
  pause(ms);
};
const click = (text, ms = 600) => {
  const r = ev(`__mClick(${JSON.stringify(text)})`);
  if (/not found/.test(r)) console.log(`  (못 찾음: ${text} @${W})`);
  pause(ms);
};
const scroll = (y, ms = 300) => {
  ev(`__mScroll(${JSON.stringify(y)})`);
  pause(ms);
};
const shot = (name, lang) => {
  const file = `b-${name}-${lang}-${W}${suffix}`;
  ab('screenshot', join(out, `${file}.png`));
  appendFileSync(met, `${file}\t${W}\t${ev('JSON.stringify(__mMeasure())')}\n`);
};
const want = (group) => onlyRe.test(group);
/** 머리말 동작: 휴대폰(768px 미만)은 메뉴 → 항목, PC 는 머리말 버튼(글자·title·aria-label) */
const nav = (id, label) => {
  if (W < 768) {
    ev(`document.querySelector('[data-nav-menu-button]').click()`);
    pause(400);
    ev(`document.querySelector('[data-menu-item=${id}]').click()`);
  } else {
    ev(`(() => { const b = [...document.querySelectorAll('header button')].find((x) => (x.innerText || '').trim() === ${JSON.stringify(label)} || x.title === ${JSON.stringify(label)}); b && b.click(); })()`);
  }
  pause(900);
};
const firstPost = () => {
  ev(`(() => { const d = document.querySelector('dialog[open]'); const a = d && d.querySelector('li a[href*="/community/"]'); a && a.click(); })()`);
  pause(1500);
};

ab('close');
ab('--init-script', join(here, 'mobile-b-measure.js'), 'set', 'viewport', '390', '844');
ab('set', 'media', scheme);

for (const w of widthArg.split(',').map(Number)) {
  W = w;
  ab('set', 'viewport', String(W), W === 1280 ? '900' : '844');

  if (want('detail')) {
    go('/r/tokyo');
    shot('detail-top', 'ko');
    scroll(520);
    shot('detail-mid', 'ko');
    scroll('end', 500);
    shot('detail-end', 'ko');
    scroll(0);
    click('캘린더에 저장');
    shot('detail-cal', 'ko');
    for (const t of ['후기', '이야기', '여행사', '비용', '알림']) {
      scroll(0);
      click(t, 900);
      shot(`detail-tab-${t}`, 'ko');
    }
    go('/r/seoul-bbangrun');
    shot('detail-kr', 'ko');
    go('/r/bagan');
    shot('detail-cancelled', 'ko');
    go('/r/guri-dullegil-trail');
    shot('detail-past', 'ko');
    go('/r/tokyo?amock=admin');
    click('수정', 1200);
    shot('detail-tab-수정', 'ko');
    go('/r/guri-dullegil-trail?amock=member');
    shot('detail-past-member', 'ko');
    go('/r/tokyo?amock=member');
    click('알림', 900);
    shot('detail-alert-member', 'ko');
    go('/en/r/hzmb-half-marathon');
    shot('detail-top', 'en');
    scroll(520);
    shot('detail-mid', 'en');
    go('/en/r/tokyo');
    click('Tours', 900);
    shot('detail-tab-tours', 'en');
    click('Costs', 900);
    shot('detail-tab-costs', 'en');
  }

  if (want('talk')) {
    go('/community?cmock=member', 2200);
    shot('talk-list', 'ko');
    firstPost();
    shot('talk-post', 'ko');
    scroll('end', 400);
    shot('talk-post-end', 'ko');
    go('/community?cmock=member', 2200);
    click('글쓰기', 900);
    shot('talk-write', 'ko');
    go('/community?cmock=guest', 2200);
    click('글쓰기', 700);
    shot('talk-guest', 'ko');
    firstPost();
    shot('talk-post-guest', 'ko');
    go('/en/community?cmock=member', 2200);
    shot('talk-list', 'en');
    firstPost();
    shot('talk-post', 'en');
  }

  if (want('auth')) {
    go('/');
    nav('login', '로그인');
    shot('login', 'ko');
    click('회원가입', 700);
    shot('signup', 'ko');
    scroll('end');
    shot('signup-end', 'ko');
    go('/');
    nav('request', '대회 추가 요청');
    shot('request', 'ko');
    scroll('end');
    shot('request-end', 'ko');
    go('/?amock=member');
    nav('request', '대회 추가 요청');
    shot('request-member', 'ko');
    go('/en/');
    nav('login', 'Log in');
    shot('login', 'en');
    click('Sign up', 700);
    shot('signup', 'en');
    go('/en/');
    nav('request', 'Suggest a race');
    shot('request', 'en');
  }

  if (want('me')) {
    go('/?amock=member');
    nav('me', '닉네임 바꾸기');
    pause(800);
    shot('me-top', 'ko');
    scroll(500);
    shot('me-mid', 'ko');
    scroll(1100);
    shot('me-mid2', 'ko');
    scroll('end');
    shot('me-end', 'ko');
    scroll(0);
    click('지난 대회 등록', 900);
    shot('me-pastrace', 'ko');
    go('/en/?amock=member');
    nav('me', 'Change nickname');
    pause(800);
    shot('me-top', 'en');
    go('/push-preview.html?pmock=1');
    pause(800);
    shot('push', 'ko');
  }

  if (want('legal')) {
    go('/privacy', 2200);
    shot('privacy-top', 'ko');
    ev('window.scrollTo(0, 2600)');
    pause(300);
    shot('privacy-mid', 'ko');
    go('/en/privacy', 2200);
    shot('privacy-top', 'en');
  }

  // 공용 틀(ui.tsx·index.css)을 바꾸면 첫 화면도 같이 본다 (PLAN 4.1)
  if (want('home')) {
    go('/');
    shot('home', 'ko');
  }

  // 약관(정적 페이지)은 빌드 결과 서버에서만 나온다 — 장면 필터에 'terms' 를 직접 줄 때만 찍는다 (예: … after 8792 360,390,414,1280 terms)
  if (only !== '.' && want('terms')) {
    go('/terms', 1200);
    shot('terms-top', 'ko');
    ev('window.scrollTo(0, document.documentElement.scrollHeight)');
    pause(300);
    shot('terms-end', 'ko');
    go('/en/terms', 1200);
    shot('terms-top', 'en');
  }
  console.log(`폭 ${W} 끝`);
}
ab('close');
console.log(`저장: ${out}, 측정값: ${met}`);
