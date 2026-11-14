/**
 * 공유 미리보기 설명(src/lib/ogMeta.ts 의 ogDescription) 확인 (PLAN 파트 B).
 *   node scripts/og-desc-test.mjs
 * public/data.json 의 대회 전부를 ko·en 으로 넣어 본다. 요약 글은 워커가 실제로 쓰는 describe/describeEn
 * (worker/site.ts) 을 esbuild 로 묶어 그대로 부른다 — 시험용 복사본을 만들지 않는다.
 * 날짜는 today 를 고정한다. 실패가 하나라도 있으면 종료 코드 1.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { OG_DESC_MAX, ogDescription } from '../src/lib/ogMeta.ts';
import { fmtDate } from '../src/i18n/format.ts';
import { shareEntryLine } from '../src/lib/shareText.ts';
import { isCancelled, isEntryConfirmed } from '../src/lib/util.ts';

const TODAY_ISO = '2026-11-14';
const today = new Date(`${TODAY_ISO}T00:00:00Z`);
const { races } = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));

// worker/site.ts 를 한 파일로 묶어 describe/describeEn 을 꺼낸다 (워커 전역은 함수 안에서만 쓰여 import 만으로는 안 건드린다)
const bundled = await build({
  entryPoints: [new URL('../worker/site.ts', import.meta.url).pathname],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  logLevel: 'silent',
});
const site = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const summaryOf = (r, lang) => (lang === 'en' ? site.describeEn(r) : site.describe(r));

let fails = 0;
let checks = 0;
const failed = new Map();
const check = (name, fn) => {
  checks++;
  try {
    fn();
  } catch (e) {
    fails++;
    const n = (failed.get(name) ?? 0) + 1;
    failed.set(name, n);
    if (n <= 3) console.log(`  FAIL ${name}: ${e.message}`);
  }
};
const HANGUL = /[가-힣]/;
const hasDates = (r) => !!(r.entry_opens || r.entry_closes);

// ── 1. 대회 전부 × ko·en ──
const enHangul = [];
for (const r of races) {
  for (const lang of ['ko', 'en']) {
    const sum = summaryOf(r, lang);
    const og = ogDescription(r, lang, sum, today);
    const line = shareEntryLine(r, lang, today);
    const tag = `${lang} ${r.id}`;
    check('160자 이내', () => assert.ok(og.length <= OG_DESC_MAX, `${tag} ${og.length}자: ${og}`));
    check('끝이 문장 끝 또는 …', () => assert.ok(/[.…)]$/.test(og), `${tag}: ${og}`));
    check('빈 조각 없음', () => assert.ok(!/ {2}|· ·|^ | $/.test(og), `${tag}: ${og}`));
    if (isCancelled(r)) {
      check('취소 대회는 요약 그대로', () => assert.equal(og, sum, tag));
      check('취소 표시', () => assert.ok(og.startsWith(lang === 'en' ? '[Cancelled] ' : '[대회 취소] '), `${tag}: ${og}`));
      check('취소 대회에 접수 날짜 줄 없음', () => assert.ok(!og.includes(line), `${tag}: ${og}`));
      continue;
    }
    check('접수 줄로 시작', () => assert.ok(og.startsWith(`${line} `), `${tag}: ${og}`));
    const rest = og.slice(line.length + 1);
    // 접수가 확정이 아니면 요약의 접수 문장(같은 날짜를 확정처럼 다시 씀)은 뺀다 — 첫 문장 빼고, 접수 날짜 글자가 든 문장
    const entryDates = [r.entry_opens, r.entry_closes].filter(Boolean).map((d) => fmtDate(d, lang));
    const unconfirmed = !isEntryConfirmed(r) && entryDates.length > 0;
    const exp = unconfirmed ? sum.split(/(?<=\.)\s+/).filter((x, i) => i === 0 || !entryDates.some((d) => x.includes(d))).join(' ') : sum;
    // (첫 문장은 대회 소개라 대회일이 접수 마감일과 같으면 그 날짜가 들어 있을 수 있다 — 그 뒤 글만 본다)
    if (unconfirmed) check('예상 대회: 요약에 접수 날짜 다시 안 씀', () => assert.ok(!entryDates.some((d) => rest.slice(exp.split(/(?<=\.)\s+/)[0].length).includes(d)), `${tag}: ${og}`));
    if (!rest.endsWith('…')) {
      // 요약을 문장 단위로만 뺐다: 남은 글은 요약(예상 대회는 접수 문장을 뺀 요약)의 앞부분이고, 그 바로 뒤가 문장 사이 공백(또는 끝)
      check('문장 중간에서 안 자름', () => {
        assert.ok(exp.startsWith(rest), `${tag}: ${rest}`);
        assert.ok(rest.length === exp.length || exp[rest.length] === ' ', `${tag}: '${rest}' / '${exp}'`);
        assert.ok(rest.endsWith('.'), `${tag}: ${rest}`);
      });
    }
    if (!isEntryConfirmed(r) && hasDates(r)) {
      check('예상·미정 대회의 날짜에 예상 표시', () => assert.ok(line.startsWith(lang === 'en' ? 'Entry expected ' : '접수 예상 '), `${tag}: ${line}`));
    }
    if (isEntryConfirmed(r) && hasDates(r)) {
      check('확정 대회 접수 줄', () => assert.match(line, lang === 'en' ? /^Entry [\d/–]+ \(.+\)$/ : /^접수 [\d/~]+ \(.+\)$/, tag));
    }
    if (!hasDates(r)) check('날짜 없으면 상태만', () => assert.match(line, /^\([^()]+\)$/, `${tag}: ${line}`));
    if (lang === 'en') {
      check('영어 접수 줄에 한글 없음', () => assert.ok(!HANGUL.test(line), `${tag}: ${line}`));
      if (r.name_en && HANGUL.test(og)) enHangul.push(`${r.id}: ${og}`);
    }
  }
}

// ── 2. 대회명 속 '. ' (St. Jude, Mt. Fuji) 에서 나누지 않는다 ──
for (const r of races.filter((x) => x.name_en?.includes('. ') && !isCancelled(x))) {
  const og = ogDescription(r, 'en', site.describeEn(r), today);
  check('대회명 속 점에서 안 자름', () => assert.ok(og.includes(r.name_en) || og.endsWith('…'), `${r.id}: ${og}`));
}

// ── 3. 만든 사례 (데이터에 없는 경우의 수) ──
const base = races.find((r) => r.entry_confidence === 'confirmed' && r.entry_opens && r.entry_closes && !isCancelled(r));
check('요약이 비면 접수 줄만', () => assert.equal(ogDescription(base, 'ko', '', today), shareEntryLine(base, 'ko', today)));
check('숫자 속 점(8.2km)은 문장 끝이 아님', () => {
  const sum = `가 대회는 8.2km 코스입니다. ${'나'.repeat(150)}.`;
  const og = ogDescription(base, 'ko', sum, today);
  assert.ok(og.includes('8.2km 코스입니다.'), og);
  assert.ok(!og.includes('나나'), og);
});
check('첫 문장도 넘치면 159자 + …', () => {
  const og = ogDescription(base, 'ko', `${'가'.repeat(300)}.`, today);
  assert.equal(og.length, OG_DESC_MAX);
  assert.ok(og.endsWith('…'));
});
check('취소 대회 요약이 넘치면 잘림', () => {
  const og = ogDescription({ ...base, notes_ko: '[취소] 시험' }, 'ko', `[대회 취소] ${'가'.repeat(300)}.`, today);
  assert.equal(og.length, OG_DESC_MAX);
});

// ── 4. 대표 대회 출력 (보고서에 붙일 값) ──
const pick = (f) => races.find((r) => r.race_date >= '2026-12-01' && f(r)) ?? races.find(f);
const samples = {
  확정: pick((r) => r.entry_confidence === 'confirmed' && r.entry_opens && r.entry_closes && !isCancelled(r)),
  예상: pick((r) => r.entry_confidence === 'expected' && r.entry_opens && r.entry_closes && !isCancelled(r)),
  '접수 미정': pick((r) => r.entry_confidence === 'tbc' && !hasDates(r) && !isCancelled(r)),
  취소: pick((r) => isCancelled(r)),
};
for (const [k, r] of Object.entries(samples)) {
  for (const lang of ['ko', 'en']) console.log(`[${k}] ${lang} ${r.id}\n    ${ogDescription(r, lang, summaryOf(r, lang), today)}`);
}

console.log(`\n영어 설명에 한글이 남은 대회(name_en 있음): ${enHangul.length}개${enHangul.length ? ` — 예: ${enHangul.slice(0, 3).join(' / ')}` : ''}`);
for (const [n, c] of failed) console.log(`  실패 묶음 '${n}': ${c}건`);
console.log(`\n대회 ${races.length}개 × ko·en, 검사 ${checks}건, 실패 ${fails}건`);
process.exit(fails ? 1 : 0);
