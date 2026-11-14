/**
 * 공유 문구(src/lib/shareText.ts)·알림 제안(src/lib/alertNudge.ts) 확인 (PLAN 파트 A).
 *   node scripts/share-test.mjs
 * public/data.json 의 실제 대회에서 상태별로 하나씩 골라 ko·en 공유 문구·og 제목·제안 가능 여부를 출력하고 규칙을 assert 한다.
 * 날짜는 today 를 고정해서 본다. localStorage 는 가짜를 넣어 저장·조회, 그리고 throw 할 때 예외가 안 나는지 본다.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ogTitle, shareEntryLine, shareText } from '../src/lib/shareText.ts';
import { ALERTED_KEY, NUDGE_DISMISSED_KEY, dismissNudge, hasLocalAlert, isNudgeDismissed, markAlerted, nudgeEligible } from '../src/lib/alertNudge.ts';
import { entryStatus, isEntryConfirmed } from '../src/lib/util.ts';

const TODAY_ISO = '2026-11-14';
const today = new Date(`${TODAY_ISO}T00:00:00Z`);
const { races } = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
const up = races.filter((r) => r.race_date >= TODAY_ISO);
const md = (iso) => `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}`;

let fails = 0;
const check = (name, fn) => {
  try {
    fn();
  } catch (e) {
    fails++;
    console.log(`  FAIL ${name}: ${e.message}`);
  }
};

const pick = (label, pred) => {
  const r = races.find(pred);
  if (!r) console.log(`(데이터에 '${label}' 대회가 없음 — 건너뜀)`);
  return r ? { label, r } : null;
};
const st = (r) => entryStatus(r, today);
const cases = [
  pick('접수 중(확정·양쪽 날짜)', (r) => r.race_date >= TODAY_ISO && st(r) === 'open' && isEntryConfirmed(r) && r.entry_opens && r.entry_closes && r.entry_opens !== r.entry_closes),
  pick('접수 예정(확정)', (r) => r.race_date >= TODAY_ISO && st(r) === 'upcoming' && isEntryConfirmed(r) && r.entry_opens && r.entry_closes),
  pick('일정 미공개(예상 날짜)', (r) => r.race_date >= TODAY_ISO && st(r) === 'unknown' && !isEntryConfirmed(r) && (r.entry_opens || r.entry_closes)),
  pick('접수 마감(다가오는 대회)', (r) => r.race_date >= TODAY_ISO && st(r) === 'closed'),
  pick('조기 마감', (r) => r.race_date >= TODAY_ISO && st(r) === 'soldout'),
  pick('대회 취소', (r) => st(r) === 'cancelled'),
  pick('지난 대회', (r) => r.race_date < TODAY_ISO && st(r) === 'closed'),
  pick('한쪽 날짜만(마감만, 확정)', (r) => r.race_date >= TODAY_ISO && isEntryConfirmed(r) && !r.entry_opens && r.entry_closes && st(r) !== 'cancelled'),
  pick('한쪽 날짜만(시작만, 확정)', (r) => r.race_date >= TODAY_ISO && isEntryConfirmed(r) && r.entry_opens && !r.entry_closes && st(r) !== 'cancelled'),
].filter(Boolean);

const STATUS_KO = { open: '접수 중', upcoming: '접수 예정', soldout: '조기 마감', closed: '접수 마감', unknown: '일정 미공개', cancelled: '대회 취소' };
const STATUS_EN = { open: 'Open', upcoming: 'Opening soon', soldout: 'Sold out', closed: 'Closed', unknown: 'Dates TBA', cancelled: 'Cancelled' };

for (const { label, r } of cases) {
  const s = st(r);
  const koUrl = `https://marathon82.com/r/${encodeURIComponent(r.id)}`;
  const enUrl = `https://marathon82.com/en/r/${encodeURIComponent(r.id)}`;
  const ko = shareText(r, 'ko', koUrl, today);
  const en = shareText(r, 'en', enUrl, today);
  const eligible = nudgeEligible(r, today);
  console.log(`\n[${label}] ${r.id} (status=${s}, conf=${r.entry_confidence}, ${r.entry_opens ?? '-'}~${r.entry_closes ?? '-'})`);
  console.log(`  ko full : ${ko.full}`);
  console.log(`  en full : ${en.full}`);
  console.log(`  og ko   : ${ogTitle(r, 'ko')}`);
  console.log(`  og en   : ${ogTitle(r, 'en')}`);
  console.log(`  nudge   : ${eligible}`);

  check(`${r.id} 형식`, () => {
    assert.equal(ko.title, r.name_ko);
    assert.ok(ko.full.startsWith(`${r.name_ko} · `));
    assert.ok(ko.full.endsWith(` · ${koUrl}`));
    assert.equal(ko.full, `${ko.text} · ${koUrl}`);
    assert.ok(en.full.endsWith(` · ${enUrl}`));
    assert.ok(ko.text.endsWith(`(${STATUS_KO[s]})`), ko.text);
    assert.ok(en.text.endsWith(`(${STATUS_EN[s]})`), en.text);
    assert.ok(!/[가-힣]/.test(en.text.replace(r.name_en?.trim() ? '' : r.name_ko, '')), `en 에 한글: ${en.text}`);
  });
  check(`${r.id} 접수 날짜`, () => {
    const line = shareEntryLine(r, 'ko', today);
    if (s === 'cancelled' || !isEntryConfirmed(r) || (!r.entry_opens && !r.entry_closes)) assert.equal(line, `(${STATUS_KO[s]})`);
    else if (r.entry_opens && r.entry_closes && r.entry_opens !== r.entry_closes) assert.equal(line, `접수 ${md(r.entry_opens)}~${md(r.entry_closes)} (${STATUS_KO[s]})`);
    else if (r.entry_opens && !r.entry_closes) assert.equal(line, `접수 ${md(r.entry_opens)}~ (${STATUS_KO[s]})`);
    else if (!r.entry_opens && r.entry_closes) assert.equal(line, `접수 ~${md(r.entry_closes)} (${STATUS_KO[s]})`);
    if (!isEntryConfirmed(r)) assert.ok(!/\d+\/\d+/.test(line), `예상 날짜가 들어감: ${line}`);
    const lineEn = shareEntryLine(r, 'en', today);
    if (r.entry_opens && r.entry_closes && r.entry_opens !== r.entry_closes && isEntryConfirmed(r) && s !== 'cancelled')
      assert.equal(lineEn, `Entry ${md(r.entry_opens)}–${md(r.entry_closes)} (${STATUS_EN[s]})`);
  });
  check(`${r.id} og 제목`, () => {
    const t = ogTitle(r, 'ko');
    assert.ok(t.startsWith(`${r.name_ko} · `));
    assert.ok(t.includes(`${Number(r.race_date.slice(0, 4))}년 ${Number(r.race_date.slice(5, 7))}월 ${Number(r.race_date.slice(8, 10))}일`), t);
    assert.ok(t.endsWith(r.country_code === 'KR' ? r.city_ko : `${r.country_ko} ${r.city_ko}`), t);
  });
  check(`${r.id} 제안 규칙`, () => {
    const want = s !== 'cancelled' && r.race_date >= TODAY_ISO && (s === 'upcoming' || s === 'open' || s === 'unknown');
    assert.equal(eligible, want);
  });
}

// 기대값을 고정한 사례: 접수 중·예정·미공개는 제안, 마감·조기 마감·취소·지난 대회는 제안 안 함
check('상태별 제안', () => {
  for (const { label, r } of cases) {
    const s = st(r);
    if (['open', 'upcoming', 'unknown'].includes(s) && r.race_date >= TODAY_ISO) assert.ok(nudgeEligible(r, today), label);
    if (['closed', 'soldout', 'cancelled'].includes(s) || r.race_date < TODAY_ISO) assert.ok(!nudgeEligible(r, today), label);
  }
});

// 전체 다가오는 대회: 공유 문구가 예외 없이 만들어지고, 영어 문구 접수 부분에 한글이 없다
check('전체 대회', () => {
  for (const r of up) {
    const a = shareEntryLine(r, 'en', today);
    assert.ok(!/[가-힣]/.test(a), `${r.id}: ${a}`);
    shareText(r, 'ko', 'https://marathon82.com/r/x', today);
    ogTitle(r, 'en');
  }
});

// localStorage: 가짜 저장소
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
check('dismiss / markAlerted', () => {
  assert.equal(isNudgeDismissed('a'), false);
  dismissNudge('a');
  dismissNudge('a');
  assert.equal(isNudgeDismissed('a'), true);
  assert.equal(isNudgeDismissed('b'), false);
  assert.deepEqual(JSON.parse(mem.get(NUDGE_DISMISSED_KEY)), ['a']);
  assert.equal(hasLocalAlert('a'), false);
  markAlerted('a');
  assert.equal(hasLocalAlert('a'), true);
  assert.deepEqual(JSON.parse(mem.get(ALERTED_KEY)), ['a']);
  mem.set(NUDGE_DISMISSED_KEY, '{not json');
  assert.equal(isNudgeDismissed('a'), false);
  mem.set(NUDGE_DISMISSED_KEY, '"str"');
  assert.equal(isNudgeDismissed('a'), false);
  for (let i = 0; i < 600; i++) dismissNudge(`id${i}`);
  assert.equal(JSON.parse(mem.get(NUDGE_DISMISSED_KEY)).length, 500);
  assert.equal(isNudgeDismissed('id599'), true);
});
// localStorage 가 throw (사파리 사생활 모드 등)
globalThis.localStorage = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};
check('localStorage throw', () => {
  assert.doesNotThrow(() => dismissNudge('x'));
  assert.doesNotThrow(() => markAlerted('x'));
  assert.equal(isNudgeDismissed('x'), false);
  assert.equal(hasLocalAlert('x'), false);
});
delete globalThis.localStorage;
check('localStorage 없음', () => {
  assert.equal(isNudgeDismissed('x'), false);
  assert.doesNotThrow(() => dismissNudge('x'));
});

console.log(`\n사례 ${cases.length}개, 다가오는 대회 ${up.length}개 확인 — ${fails ? `실패 ${fails}` : '모두 통과'}`);
process.exit(fails ? 1 : 0);
