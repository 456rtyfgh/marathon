// 패널을 뒤로 가기로 닫기 (PLAN 4.2) 장면 확인. 390px, 개발 서버.
//   node .shots-tools/mobile-b-back.mjs <포트> [장면 번호 필터(정규식)]
// 단계마다 주소 · history.length · history.state.panelDepth · 열린 dialog 수를 .duo-shots/mobile/back-b.txt 에 남기고 기대와 맞는지 PASS/FAIL.
// 브라우저의 뒤로 가기는 agent-browser 의 `back`(실제 히스토리 이동)으로 누른다. 끝나면 세션(mobile-b-back)을 닫는다.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [port, only = '.*'] = process.argv.slice(2);
if (!port) {
  console.error('사용: node .shots-tools/mobile-b-back.mjs <포트> [장면 필터]');
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const log = join(root, '.duo-shots/mobile/back-b.txt');
mkdirSync(dirname(log), { recursive: true });
const base = `http://localhost:${port}`;
const onlyRe = new RegExp(`^(${only})$`);
if (only === '.*') writeFileSync(log, `# 패널 뒤로 가기 장면 (${new Date().toISOString()}, ${base})\n`);

const ab = (...args) => {
  try {
    return execFileSync('agent-browser', ['--session', 'mobile-b-back', ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 40000 }).trim();
  } catch (e) {
    return `ERR ${String(e.stderr || e.message).slice(0, 200)}`;
  }
};
const ev = (js) => ab('eval', js);
const pause = (ms = 600) => ab('wait', String(ms));
const go = (path, ms = 1800) => {
  ab('open', path.startsWith('http') ? path : base + path);
  pause(ms);
};
const click = (text, ms = 700) => {
  const r = ev(`__mClick(${JSON.stringify(text)})`);
  pause(ms);
  return r;
};
const js = (code, ms = 700) => {
  ev(code);
  pause(ms);
};
const back = (ms = 900) => {
  ab('back');
  pause(ms);
};
const state = () => {
  try {
    return JSON.parse(JSON.parse(ev('JSON.stringify(__mState())')));
  } catch {
    return { url: '?', len: -1, depth: null, dialogs: -1 };
  }
};
const menu = (id) => {
  js(`document.querySelector('[data-nav-menu-button]').click()`, 400);
  js(`document.querySelector('[data-menu-item=${id}]').click()`, 1000);
};
const closeX = () => js(`(() => { const d = [...document.querySelectorAll('dialog[open]')].at(-1); const b = d && [...d.querySelectorAll('button')].find((x) => /^(닫기|Close)$/.test(x.getAttribute('aria-label') || '')); b && b.click(); })()`, 1000);
const firstRace = () => js(`document.querySelector('#list li button').click()`, 1200);
const firstPost = () => js(`(() => { const d = document.querySelector('dialog[open]'); const a = d && d.querySelector('li a[href*="/community/"]'); a && a.click(); })()`, 1400);

let failed = 0;
let current = '';
/** 기대: { url?: 정규식|문자열, dialogs?: 수 } */
const check = (step, expect = {}) => {
  const s = state();
  const okUrl = expect.url == null || (expect.url instanceof RegExp ? expect.url.test(s.url) : s.url === expect.url);
  const okDlg = expect.dialogs == null || s.dialogs === expect.dialogs;
  const ok = okUrl && okDlg;
  if (!ok) failed++;
  const line = `${current}\t${step}\t${s.url}\tlen ${s.len}\tdepth ${s.depth}\tdialogs ${s.dialogs}\t${ok ? 'PASS' : `FAIL (기대 ${JSON.stringify({ ...expect, url: expect.url ? String(expect.url) : undefined })})`}`;
  appendFileSync(log, line + '\n');
  console.log(line);
  return s;
};
const scene = (n, title, fn) => {
  if (!onlyRe.test(String(n))) return;
  current = `#${n}`;
  appendFileSync(log, `\n## ${n}. ${title}\n`);
  console.log(`\n## ${n}. ${title}`);
  fn();
};

ab('close');
ab('--init-script', join(here, 'mobile-b-measure.js'), 'set', 'viewport', '390', '844');
ab('set', 'media', 'light');

scene(1, '목록에서 대회 열기 → 뒤로 가기', () => {
  go('/?q=%EB%8F%84%EC%BF%84');
  firstRace();
  check('대회 열림', { url: /^\/r\//, dialogs: 1 });
  back();
  check('뒤로 가기', { url: '/?q=%EB%8F%84%EC%BF%84', dialogs: 0 });
});

scene(2, '대회 열기 → X → 뒤로 가기 (헛걸음 없이 앞 페이지로)', () => {
  go('/privacy');
  go('/');
  firstRace();
  check('대회 열림', { url: /^\/r\//, dialogs: 1 });
  closeX();
  check('X', { url: '/', dialogs: 0 });
  back(1500);
  check('뒤로 가기 → 열기 전 페이지', { url: '/privacy', dialogs: 0 });
});

scene(3, '/r/<id> 로 바로 들어옴 → X → 새로고침', () => {
  go('/r/tokyo');
  check('바로 들어옴', { url: '/r/tokyo', dialogs: 1 });
  closeX();
  check('X', { url: '/', dialogs: 0 });
  ab('reload');
  pause(1800);
  check('새로고침', { url: '/', dialogs: 0 });
});

scene(4, '/r/<id> 로 바로 들어옴 → 뒤로 가기 → 뒤로 가기', () => {
  go('/privacy');
  go('/r/tokyo');
  check('바로 들어옴', { url: '/r/tokyo', dialogs: 1 });
  back();
  check('뒤로 가기', { url: '/', dialogs: 0 });
  back(1500);
  check('한 번 더 → 들어오기 전 페이지', { url: '/privacy' });
});

scene(5, '상세 → 로그인 시트 → 뒤로 가기 → 뒤로 가기', () => {
  go('/');
  firstRace();
  click('알림', 900);
  click('로그인', 900);
  check('상세 + 로그인 시트', { url: /^\/r\//, dialogs: 2 });
  back();
  check('뒤로 가기 (시트만 닫힘)', { url: /^\/r\//, dialogs: 1 });
  back();
  check('뒤로 가기 (상세 닫힘)', { url: '/', dialogs: 0 });
});

scene(6, '내 정보 → 지난 대회 등록 시트 → 뒤로 가기', () => {
  go('/?amock=member');
  menu('me');
  check('내 정보', { dialogs: 1 });
  click('지난 대회 등록', 900);
  check('안쪽 시트', { dialogs: 2 });
  back();
  check('뒤로 가기 (안쪽만 닫힘)', { dialogs: 1 });
  back();
  check('뒤로 가기 (내 정보 닫힘)', { url: '/?amock=member', dialogs: 0 });
});

scene(7, '러닝톡 열기(머리말) → 글 열기 → 뒤로 가기 → 뒤로 가기 → 뒤로 가기', () => {
  go('/privacy');
  go('/');
  js(`document.querySelector('header nav a[href$="/community"]').click()`, 1200);
  check('러닝톡 열림', { url: '/community', dialogs: 1 });
  // 머리말로 열면 주소에 ?cmock 이 없어 글이 안 보인다 → 주소에만 붙이고 카테고리를 눌러 목록을 다시 받는다 (확인용)
  js(`history.replaceState(history.state, '', '/community?cmock=member')`, 200);
  click('질문', 1200);
  click('전체', 1200);
  firstPost();
  check('글 열림', { url: /^\/community\/[0-9a-f-]+\?cmock=member$/, dialogs: 1 });
  back();
  check('뒤로 가기 (목록으로)', { url: '/community?cmock=member', dialogs: 1 });
  back();
  check('뒤로 가기 (러닝톡 닫힘)', { url: '/', dialogs: 0 });
  back(1500);
  check('한 번 더 → 앞 페이지 (헛걸음 없음)', { url: '/privacy' });
});

scene(8, '추가 요청 열기 → 뒤로 가기', () => {
  go('/');
  menu('request');
  check('추가 요청', { dialogs: 1 });
  back();
  check('뒤로 가기', { url: '/', dialogs: 0 });
});

scene(9, '휴대폰 메뉴 → 로그인 → 뒤로 가기', () => {
  go('/privacy');
  go('/');
  menu('login');
  check('로그인 시트 (메뉴는 닫힘)', { url: '/', dialogs: 1 });
  back();
  check('뒤로 가기', { url: '/', dialogs: 0 });
  back(1500);
  check('한 번 더 → 앞 페이지', { url: '/privacy' });
});

scene(10, '영어: 목록에서 열고 뒤로 / 바로 들어와 X', () => {
  go('/en/');
  firstRace();
  check('대회 열림', { url: /^\/en\/r\//, dialogs: 1 });
  back();
  check('뒤로 가기', { url: '/en/', dialogs: 0 });
  go('/en/r/tokyo');
  closeX();
  check('바로 들어와 X', { url: '/en/', dialogs: 0 });
});

scene(11, '/community 로 바로 들어옴 (StrictMode) → 뒤로 가기', () => {
  go('/privacy');
  go('/community?cmock=member', 2200);
  const s = check('바로 들어옴', { url: '/community?cmock=member', dialogs: 1 });
  appendFileSync(log, `    (칸 수: 처음 2 + 패널 1 = 3 이어야 한다 → len ${s.len})\n`);
  back();
  check('뒤로 가기 (러닝톡 닫힘)', { url: '/?cmock=member', dialogs: 0 });
  back(1500);
  check('한 번 더 → 앞 페이지', { url: '/privacy' });
});

scene(12, '러닝톡(비회원) 글쓰기 → 로그인 시트 → X', () => {
  go('/community?cmock=guest', 2200);
  click('글쓰기', 700);
  js(`document.querySelector('dialog[open] [role=status] button').click()`, 900); // 회원 전용 안내의 로그인·가입 버튼
  check('러닝톡 + 로그인 시트', { url: '/community?cmock=guest', dialogs: 2 });
  closeX();
  check('X (시트만 닫힘)', { url: '/community?cmock=guest', dialogs: 1 });
  back();
  check('뒤로 가기 (러닝톡 닫힘)', { url: '/?cmock=guest', dialogs: 0 });
});

scene(13, '러닝톡에서 글을 연 채 X', () => {
  go('/privacy');
  go('/community?cmock=member', 2200);
  firstPost();
  check('글 열림', { url: /^\/community\/[0-9a-f-]+\?cmock=member$/, dialogs: 1 });
  closeX();
  check('X', { url: '/?cmock=member', dialogs: 0 });
  back(1500);
  check('뒤로 가기 → 앞 페이지', { url: '/privacy' });
});

scene(14, '내 정보 → 저장한 대회에서 대회 누르기 → 뒤로 가기 → 뒤로 가기', () => {
  go('/?amock=member');
  js(`localStorage.setItem('marathon-cal:favorites', JSON.stringify(['tokyo']))`, 200);
  go('/?amock=member');
  menu('me');
  check('내 정보', { dialogs: 1 });
  js(`(() => { const d = document.querySelector('dialog[open]'); const b = d && [...d.querySelectorAll('button')].find((x) => /도쿄 마라톤/.test(x.innerText || '')); b && b.click(); })()`, 1200);
  check('상세가 위에 열림', { url: '/r/tokyo?amock=member', dialogs: 2 });
  back();
  check('뒤로 가기 (상세만 닫힘)', { dialogs: 1 });
  back();
  check('뒤로 가기 (내 정보 닫힘)', { url: '/?amock=member', dialogs: 0 });
  js(`localStorage.removeItem('marathon-cal:favorites')`, 100);
});

scene(15, '고치지 않는 화면: 내 정보 미리보기 · 관리 패널', () => {
  go('/mypage-preview.html', 2200);
  const s0 = check('미리보기 열림', {});
  if (s0.dialogs > 0) {
    back();
    check('뒤로 가기', { dialogs: s0.dialogs - 1 });
  }
  go('/?amock=admin');
  menu('admin');
  check('관리 패널', { dialogs: 1 });
  closeX();
  check('X', { url: '/?amock=admin', dialogs: 0 });
  menu('admin');
  check('다시 열기', { url: '/?amock=admin', dialogs: 1 });
  back();
  check('뒤로 가기', { url: '/?amock=admin', dialogs: 0 });
});

const errors = ab('errors');
appendFileSync(log, `\n페이지 오류: ${errors || '없음'}\n실패 ${failed}개\n`);
ab('close');
console.log(`\n실패 ${failed}개 — 기록: ${log}`);
process.exitCode = failed ? 1 : 0;
