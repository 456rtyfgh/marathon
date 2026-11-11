/**
 * 첫 화면 목록 기본값(src/lib/listPrefs.ts)과 프리렌더 기본 목록 확인.
 *   node scripts/list-prefs-test.mjs
 * dist/index.html · dist/en/index.html 이 있으면(npm run build 뒤) 기본 목록 덩어리도 데이터로 직접 센 것과 맞춰 본다.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  LIST_DEFAULTS,
  NO_PICKS,
  byRaceDate,
  inScope,
  matchesAnyStatus,
  matchesStatus,
  inDateRange,
  picksFromSearch,
  rangeFromSearch,
  resolveListPrefs,
} from '../src/lib/listPrefs.ts';
import { entryStatus } from '../src/lib/util.ts';
import { today, upcoming } from './seo-lib.mjs';

let passed = 0;
const t = (name, fn) => {
  try {
    fn();
    passed++;
  } catch (e) {
    console.error(`✗ ${name}\n  ${e.message}`);
    process.exitCode = 1;
  }
};

// ── 기본값 ──
t('기본값은 국내·대회 날짜·접수 중', () => assert.deepEqual(LIST_DEFAULTS, { scope: 'kr', sort: 'race_date', status: ['open'] }));

// ── 주소 쿼리 ──
t("'' → 안 고름", () => assert.deepEqual(picksFromSearch(''), NO_PICKS));
t('?scope=abroad&sort=views', () => assert.deepEqual(picksFromSearch('?scope=abroad&sort=views'), { scope: 'abroad', sort: 'views', status: null }));
t('?status= → 모두([])', () => assert.deepEqual(picksFromSearch('?status=').status, []));
t('?status=open,foo → [open]', () => assert.deepEqual(picksFromSearch('?status=open,foo').status, ['open']));
t('?status=foo → null', () => assert.equal(picksFromSearch('?status=foo').status, null));
t('?scope=xx → null', () => assert.equal(picksFromSearch('?scope=xx').scope, null));
t('?sort=xx → null', () => assert.equal(picksFromSearch('?sort=xx').sort, null));
t('?status=upcoming,closing7 (여러 개)', () => assert.deepEqual(picksFromSearch('?status=upcoming,closing7').status, ['upcoming', 'closing7']));
t('?q= 만 있으면 안 고름', () => assert.deepEqual(picksFromSearch('?q=도쿄'), NO_PICKS));
t('예전 화면 주소 ?scope=all&sort=entry&status=', () =>
  assert.deepEqual(picksFromSearch('?scope=all&sort=entry&status='), { scope: 'all', sort: 'entry', status: [] }));

// ── 실제 적용 값 ──
t('안 고름 → 기본값', () => assert.deepEqual(resolveListPrefs(NO_PICKS, { searching: false }), { scope: 'kr', sort: 'race_date', status: ['open'] }));
t('안 고름 + 검색 중 → 전체·모두, 정렬은 기본', () =>
  assert.deepEqual(resolveListPrefs(NO_PICKS, { searching: true }), { scope: 'all', sort: 'race_date', status: [] }));
t('고른 값은 검색 중에도 그대로', () =>
  assert.deepEqual(resolveListPrefs({ scope: 'kr', sort: 'views', status: ['upcoming'] }, { searching: true }), {
    scope: 'kr',
    sort: 'views',
    status: ['upcoming'],
  }));
t('고른 [] 는 기본값으로 돌아가지 않음', () => assert.deepEqual(resolveListPrefs({ ...NO_PICKS, status: [] }, { searching: false }).status, []));
// App.tsx 가 status 를 useMemo 의존성에 넣으므로, 안 고른 상태에서는 렌더마다 같은 배열이어야 다시 계산하지 않는다
t('안 고른 status 는 부를 때마다 같은 배열(참조)', () => {
  assert.equal(resolveListPrefs(NO_PICKS, { searching: false }).status, resolveListPrefs(NO_PICKS, { searching: false }).status);
  assert.equal(resolveListPrefs(NO_PICKS, { searching: true }).status, resolveListPrefs(NO_PICKS, { searching: true }).status);
});

// ── 대회 날짜 범위 (?from= ?to=) ──
t('?from=&to= 둘 다', () => assert.deepEqual(rangeFromSearch('?from=2027-03-01&to=2027-03-10'), { from: '2027-03-01', to: '2027-03-10' }));
t('?from= 한쪽만', () => assert.deepEqual(rangeFromSearch('?from=2027-03-01'), { from: '2027-03-01', to: null }));
t('?to= 한쪽만', () => assert.deepEqual(rangeFromSearch('?to=2027-03-10'), { from: null, to: '2027-03-10' }));
t('from>to 면 바꿈', () => assert.deepEqual(rangeFromSearch('?from=2027-03-10&to=2027-03-01'), { from: '2027-03-01', to: '2027-03-10' }));
t('없는 날짜·잘못된 형식은 버림', () => {
  assert.deepEqual(rangeFromSearch('?from=2027-02-30&to=2027-3-1'), { from: null, to: null });
  assert.deepEqual(rangeFromSearch('?from=abc'), { from: null, to: null });
  assert.deepEqual(rangeFromSearch(''), { from: null, to: null });
});
t('날짜·거리 쿼리는 picks 에 섞이지 않음', () => assert.deepEqual(picksFromSearch('?from=2027-03-01&to=2027-03-10&dist=half'), NO_PICKS));
t('inDateRange: 양 끝 포함', () => {
  const R = { from: '2027-03-01', to: '2027-03-10' };
  assert.equal(inDateRange({ race_date: '2027-03-01' }, R), true);
  assert.equal(inDateRange({ race_date: '2027-03-10' }, R), true);
  assert.equal(inDateRange({ race_date: '2027-02-28' }, R), false);
  assert.equal(inDateRange({ race_date: '2027-03-11' }, R), false);
});
t('inDateRange: 한쪽만·없음', () => {
  assert.equal(inDateRange({ race_date: '2027-12-31' }, { from: '2027-03-01', to: null }), true);
  assert.equal(inDateRange({ race_date: '2027-02-01' }, { from: '2027-03-01', to: null }), false);
  assert.equal(inDateRange({ race_date: '2026-12-01' }, { from: null, to: '2027-03-10' }), true);
  assert.equal(inDateRange({ race_date: '2027-04-01' }, { from: null, to: '2027-03-10' }), false);
  assert.equal(inDateRange({ race_date: '2027-04-01' }, { from: null, to: null }), true);
});
t('날짜를 고르면 안 고른 상태는 모두([]), 범위는 그대로', () =>
  assert.deepEqual(resolveListPrefs(NO_PICKS, { searching: false, dated: true }), { scope: 'kr', sort: 'race_date', status: [] }));
t('날짜를 골라도 고른 상태는 그대로', () =>
  assert.deepEqual(resolveListPrefs({ ...NO_PICKS, status: ['upcoming'] }, { searching: false, dated: true }).status, ['upcoming']));
t('dated=false 면 기본값(접수 중)', () => assert.deepEqual(resolveListPrefs(NO_PICKS, { searching: false, dated: false }).status, ['open']));
t('dated 로 푼 status 도 같은 배열(참조)', () =>
  assert.equal(resolveListPrefs(NO_PICKS, { searching: false, dated: true }).status, resolveListPrefs(NO_PICKS, { searching: true }).status));

// ── 상태 판단 ──
const T = new Date('2026-11-10T00:00:00Z');
const race = (o = {}) => ({ id: 'x', name_ko: 'x', race_date: '2027-03-01', region: '한국', entry_opens: null, entry_closes: null, ...o });
t("'closed' 칩은 soldout 도 포함", () => {
  assert.equal(matchesStatus(race(), 'soldout', 'closed', T), true);
  assert.equal(matchesStatus(race(), 'closed', 'closed', T), true);
  assert.equal(matchesStatus(race(), 'open', 'closed', T), false);
});
t("'soldout' 은 closed 와 다름", () => assert.equal(matchesStatus(race(), 'closed', 'soldout', T), false));
t('closing7: 마감 7일 남음 포함, 8일은 아님, 접수 중일 때만', () => {
  assert.equal(matchesStatus(race({ entry_closes: '2026-11-17' }), 'open', 'closing7', T), true);
  assert.equal(matchesStatus(race({ entry_closes: '2026-11-18' }), 'open', 'closing7', T), false);
  assert.equal(matchesStatus(race({ entry_closes: '2026-11-17' }), 'upcoming', 'closing7', T), false);
  assert.equal(matchesStatus(race(), 'open', 'closing7', T), false);
});
t('opening30: 시작 30일 남음 포함, 31일은 아님, 접수 전일 때만', () => {
  assert.equal(matchesStatus(race({ entry_opens: '2026-12-10' }), 'upcoming', 'opening30', T), true);
  assert.equal(matchesStatus(race({ entry_opens: '2026-12-11' }), 'upcoming', 'opening30', T), false);
  assert.equal(matchesStatus(race({ entry_opens: '2026-12-10' }), 'open', 'opening30', T), false);
});
t('matchesAnyStatus: [] 는 전부, 여러 개는 합집합', () => {
  assert.equal(matchesAnyStatus(race(), 'cancelled', [], T), true);
  assert.equal(matchesAnyStatus(race(), 'upcoming', ['open', 'upcoming'], T), true);
  assert.equal(matchesAnyStatus(race(), 'unknown', ['open', 'upcoming'], T), false);
});

// ── 범위 ──
t('inScope: region 한국 = 국내', () => {
  assert.equal(inScope(race(), 'kr'), true);
  assert.equal(inScope(race(), 'abroad'), false);
  assert.equal(inScope(race({ region: '아시아' }), 'abroad'), true);
  assert.equal(inScope(race({ region: '아시아' }), 'kr'), false);
  assert.equal(inScope(race({ region: '아시아' }), 'all'), true);
});

// ── 대회 날짜순 ──
t('byRaceDate: 날짜 오름차순 → 같은 날 name_ko → id, 입력은 그대로', () => {
  const a = race({ id: 'b', name_ko: '나', race_date: '2027-01-02' });
  const b = race({ id: 'z', name_ko: '가', race_date: '2027-01-02' });
  const c = race({ id: 'a', name_ko: '가', race_date: '2027-01-02' });
  const d = race({ id: 'd', name_ko: '하', race_date: '2026-12-31' });
  const input = [a, b, c, d];
  const out = byRaceDate(input);
  assert.deepEqual(out.map((r) => r.id), ['d', 'a', 'z', 'b']);
  assert.deepEqual(input.map((r) => r.id), ['b', 'z', 'a', 'd']);
  assert.notEqual(out, input);
});

// ── 실제 데이터의 기본 목록 ──
const todayDate = new Date(today + 'T00:00:00Z');
const expected = byRaceDate(
  upcoming.filter((r) => inScope(r, 'kr') && matchesAnyStatus(r, entryStatus(r, todayDate), ['open'], todayDate)),
);
t('기본 목록: 전부 국내·접수 중, 날짜 오름차순, 1개 이상', () => {
  assert.ok(expected.length > 0, '지금 접수 중인 국내 대회가 없음');
  for (const r of expected) {
    assert.equal(r.region, '한국');
    assert.equal(entryStatus(r, todayDate), 'open');
  }
  for (let i = 1; i < expected.length; i++) assert.ok(expected[i - 1].race_date <= expected[i].race_date);
});

// ── 빌드 결과(있을 때) ──
const block = (html, title) => {
  const m = html.match(new RegExp(`<section aria-label="${title}"><h2>${title}</h2><ul>([\\s\\S]*?)</ul></section>`));
  assert.ok(m, `"${title}" 덩어리가 없음`);
  return [...m[1].matchAll(/<li>.*?<a href="([^"]+)"/g)].map((x) => x[1]);
};
const ldIds = (html) => {
  const m = html.match(/<script id="ld-itemlist" type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(m, 'ld-itemlist 가 없음');
  return JSON.parse(m[1]).itemListElement.map((x) => x.url.split('/r/')[1]);
};
let distChecked = 0;
for (const [file, title, prefix, lead] of [
  ['../dist/index.html', '지금 접수 중인 국내 마라톤', '/r/', '대회 날짜순으로 모았습니다'],
  ['../dist/en/index.html', 'Open for Registration in Korea', '/en/r/', 'in race-date order'],
]) {
  const url = new URL(file, import.meta.url);
  if (!existsSync(url)) continue;
  distChecked++;
  const html = readFileSync(url, 'utf8');
  t(`${file}: 기본 목록 = 데이터로 센 국내·접수 중(날짜순) ${expected.length}개`, () => {
    assert.deepEqual(block(html, title), expected.map((r) => prefix + r.id));
  });
  t(`${file}: 제목 덩어리는 한 번만`, () => assert.equal(html.split(`<h2>${title}</h2>`).length - 1, 1));
  t(`${file}: 소개 문구에 새 정렬 말`, () => {
    assert.ok(html.includes(lead), `"${lead}" 없음`);
    assert.ok(!html.includes('접수가 가까운 순서로 모았습니다') || file.includes('/en/'), '예전 문구가 남음');
    assert.ok(!html.includes('sorted by upcoming registration'), '예전 영어 문구가 남음');
  });
  t(`${file}: ItemList 는 기본 목록 먼저, 100개`, () => {
    const ids = ldIds(html);
    assert.equal(ids.length, Math.min(100, upcoming.length));
    const head = expected.slice(0, 100).map((r) => r.id);
    assert.deepEqual(ids.slice(0, head.length), head);
    assert.equal(new Set(ids).size, ids.length, 'ItemList 에 겹친 대회');
  });
  t(`${file}: 월별 목록에 다가오는 대회 링크가 전부 남음`, () => {
    for (const r of upcoming) assert.ok(html.includes(`href="${prefix}${r.id}"`), `${r.id} 링크 없음`);
  });
}

console.log(
  `list-prefs-test: ${passed}개 통과${process.exitCode ? ' (실패 있음)' : ''} — 기본 목록 ${expected.length}개(오늘 ${today}), dist 검사 ${distChecked ? `${distChecked}개 파일` : '건너뜀(빌드 전)'}`,
);
