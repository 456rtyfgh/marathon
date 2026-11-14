/**
 * 대회 상세 한 문장 요약(worker/raceSummary.ts) 테스트 (PLAN 파트 A · A5). 실패가 하나라도 있으면 exit 1.
 *   node scripts/race-summary-test.mjs
 * 본다: 확정/예상/접수 전/접수 중/마감/취소/값 없음 케이스(한·영) · 실제 data.json 전체 대회에 대해
 *       비어 있지 않음 · 한 문장 · 이모지 0 · 'undefined'·'null'·'NaN' 없음 · 대회 이름이 들어 있음 ·
 *       상세 값(참가비·정원·메모·공식 주소) 미포함 · 상태 글자 = 홈 목록의 entryStatus.
 */
import { readFileSync } from 'node:fs';
import { raceSummaryEn, raceSummaryKo } from '../worker/raceSummary.ts';
import { STATUS_TEXT } from '../src/i18n/format.ts';
import { entryStatus } from '../src/lib/util.ts';

const snap = JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8'));
const TODAY = '2026-11-14';
const fails = [];
const check = (ok, msg) => {
  if (!ok) fails.push(msg);
};

const base = {
  name_ko: '테스트마라톤',
  name_en: 'Test Marathon',
  city_ko: '서울 송파',
  country_ko: '대한민국',
  country_code: 'KR',
  race_date: '2027-03-14',
  date_confidence: 'confirmed',
  entry_type: 'lottery',
  entry_opens: '2027-01-10',
  entry_closes: '2027-01-24',
  entry_confidence: 'confirmed',
  sold_out_on: null,
  notes_ko: null,
  distances: ['풀', '10km'],
  discipline: 'road',
};
const ko = (o) => raceSummaryKo({ ...base, ...o }, TODAY);
const en = (o) => raceSummaryEn({ ...base, ...o }, TODAY);
const has = (s, ...parts) => parts.every((p) => s.includes(p));
const not = (s, ...parts) => parts.every((p) => !s.includes(p));

// 확정 일정 + 접수 전
let k = ko({});
check(has(k, '테스트마라톤은', '2027년 3월 14일에', '서울 송파에서', '풀코스·10km 종목이 있는 마라톤 대회로', '추첨', '2027년 1월 10일부터 2027년 1월 24일까지', '(접수 예정)입니다.'), `확정·접수 전(ko): ${k}`);
check(not(k, '예상'), `확정 일정에 '예상' 이 없어야 함: ${k}`);
let e = en({});
check(has(e, 'Test Marathon is a race (Marathon, 10km) held on Mar 14, 2027 in', 'registration (lottery) runs from Jan 10, 2027 to Jan 24, 2027 (Opening soon).'), `확정·접수 전(en): ${e}`);

// 접수 중
k = ko({ entry_opens: '2026-11-01', entry_closes: '2026-11-30', race_date: '2027-02-01' });
check(k.endsWith('(접수 중)입니다.'), `접수 중(ko): ${k}`);
check(en({ entry_opens: '2026-11-01', entry_closes: '2026-11-30' }).endsWith('(Open).'), '접수 중(en)');
// 마감
k = ko({ entry_opens: '2026-09-01', entry_closes: '2026-10-01' });
check(k.endsWith('(접수 마감)입니다.'), `마감(ko): ${k}`);
check(en({ entry_opens: '2026-09-01', entry_closes: '2026-10-01' }).endsWith('(Closed).'), '마감(en)');
// 대회 날짜 예상
k = ko({ date_confidence: 'expected' });
check(has(k, '2027년 3월 14일(예상)에'), `날짜 예상(ko): ${k}`);
check(en({ date_confidence: 'expected' }).includes('Mar 14, 2027 (expected)'), '날짜 예상(en)');
check(ko({ date_confidence: 'tbc' }).includes('(미정)에'), '날짜 미정(ko)');
// 접수 일정 예상(공식 확정 전): 날짜는 '예상' 으로 쓰고 상태는 일정 미공개
k = ko({ entry_confidence: 'expected' });
check(has(k, '예상 2027년 1월 10일부터', '(일정 미공개)입니다.'), `접수 예정 예상(ko): ${k}`);
e = en({ entry_confidence: 'expected' });
check(has(e, 'is expected to run from Jan 10, 2027', '(Dates TBA).'), `접수 예상(en): ${e}`);
// 접수 날짜 없음
k = ko({ entry_opens: null, entry_closes: null, entry_confidence: 'tbc' });
check(has(k, '접수 기간은 아직 공개되지 않았습니다(일정 미공개).'), `접수 날짜 없음(ko): ${k}`);
check(en({ entry_opens: null, entry_closes: null, entry_confidence: 'tbc' }).includes('window has not been announced (Dates TBA).'), '접수 날짜 없음(en)');
// 한쪽만
check(ko({ entry_opens: null }).includes('2027년 1월 24일까지'), '마감일만(ko)');
check(en({ entry_closes: null }).includes('from Jan 10, 2027 ('), '시작일만(en)');
// 종목·장소 없음, 트레일, 이름 끝 받침
k = ko({ distances: [], city_ko: '', country_ko: '', country_code: '' });
check(not(k, '종목', '에서'), `종목·장소 없음(ko): ${k}`);
check(has(ko({ discipline: 'trail', distances: ['50K'] }), '50K 종목이 있는 트레일러닝 대회로'), '트레일(ko)');
check(has(en({ discipline: 'trail', distances: ['50K'] }), 'a trail race (50K)'), '트레일(en)');
check(ko({ name_ko: '서울마라톤' }).startsWith('서울마라톤은 '), '받침 있음 → 은');
check(ko({ name_ko: '춘천마라토나' }).startsWith('춘천마라토나는 '), '받침 없음 → 는');
// 취소
k = ko({ notes_ko: '[취소] 주최 측 공지 — 상세 메모' });
check(has(k, '취소', '2027년 3월 14일에 열릴 예정이었으나'), `취소(ko): ${k}`);
check(not(k, '접수는', '상세 메모'), `취소 문장에 접수·메모 없음: ${k}`);
check(en({ notes_ko: '[중단] x' }).includes('cancelled'), '취소(en)');
// 영어 이름 없으면 한국어 이름
check(en({ name_en: '' }).startsWith('테스트마라톤 is'), '영어 이름 없음');
// 상세 메모가 있어도 상태는 목록과 같다: '공식: 접수 중(마감일 미공지…)' 메모는 목록에서 보이지 않으므로 상태에 영향 없음
k = ko({ entry_opens: null, entry_closes: null, entry_confidence: 'expected', notes_ko: '공식: 접수 중(마감일 미공지)' });
check(k.includes('(일정 미공개)'), `상세 메모는 상태에 쓰지 않음: ${k}`);

// 실제 data.json 전체
const EMOJI = /(?![©®™])\p{Extended_Pictographic}/u;
const hay = ['undefined', 'null', 'NaN', '[object'];
let n = 0;
for (const r of snap.races) {
  n++;
  const sk = raceSummaryKo(r, TODAY);
  const se = raceSummaryEn(r, TODAY);
  for (const [lang, s, name] of [['ko', sk, r.name_ko], ['en', se, r.name_en?.trim() || r.name_ko]]) {
    const tag = `${r.id}(${lang})`;
    check(s.length > 20, `${tag}: 너무 짧음 "${s}"`);
    check(s.includes(name), `${tag}: 대회 이름이 없음`);
    check(!EMOJI.test(s), `${tag}: 이모지`);
    check(hay.every((h) => !s.includes(h)), `${tag}: 값 오류 글자 "${s}"`);
    check(!/\s{2,}/.test(s) && !/[,;]\s*[,;.]/.test(s), `${tag}: 공백·문장부호 이상 "${s}"`);
    // 한 문장: 끝맺음이 한 번뿐 ('St.'·'U.S.' 같은 이름 속 점은 세지 않는다)
    check(lang === 'ko' ? (s.match(/(?:[입습]니다|\))\.$/g) ?? []).length === 1 && !/[입습]니다\.\s/.test(s) : (s.match(/\)\.|organizer\./g) ?? []).length === 1, `${tag}: 한 문장이 아님 "${s}"`);
    // 상세 값 미포함: 참가비 숫자·공식 주소·메모 앞머리
    if (r.entry_fee != null && r.entry_fee >= 1000) check(!s.includes(String(r.entry_fee)) && !s.includes(r.entry_fee.toLocaleString()), `${tag}: 참가비가 들어 있음`);
    if (r.official_url) check(!s.includes('http'), `${tag}: 주소가 들어 있음`);
    const note = r.notes_ko?.replace(/^\s*\[(취소|중단)\]\s*/, '').trim();
    // 메모 앞머리는 날짜·지명이라 요약과 우연히 겹칠 수 있다 → 중간 24글자로 본다
    if (note && note.length >= 60) check(!s.includes(note.slice(20, 44)), `${tag}: 메모가 들어 있음`);
    if (r.field_size && !`${r.name_ko} ${r.name_en ?? ''}`.includes(String(r.field_size))) check(!s.includes(String(r.field_size)) || String(r.field_size).length < 3, `${tag}: 정원이 들어 있음`);
  }
  // 상태 글자 = 홈 목록 entryStatus (목록 값: notes_ko 는 취소 태그만)
  const tag = r.notes_ko?.match(/^\s*\[(취소|중단)\]/);
  const list = { ...r, notes_ko: tag ? `[${tag[1]}]` : null };
  const st = entryStatus(list, new Date(TODAY + 'T00:00:00Z'));
  if (st !== 'cancelled') {
    check(sk.includes(`(${STATUS_TEXT.ko[st]}`) || sk.includes(`${STATUS_TEXT.ko[st]})`), `${r.id}: 상태 글자 ${STATUS_TEXT.ko[st]} 가 없음 "${sk}"`);
    check(se.includes(STATUS_TEXT.en[st]), `${r.id}: 영어 상태 글자 ${STATUS_TEXT.en[st]} 가 없음 "${se}"`);
  }
  if (r.date_confidence !== 'confirmed') check(sk.includes('(예상)') || sk.includes('(미정)'), `${r.id}: 날짜가 확정이 아닌데 '예상'·'미정' 표기가 없음`);
  if (r.date_confidence === 'expected') check(se.includes('(expected)'), `${r.id}: 영어 expected 표기 없음`);
}

if (fails.length) {
  console.error(`race-summary-test: 실패 ${fails.length}개`);
  for (const f of fails.slice(0, 40)) console.error('  - ' + f);
  process.exit(1);
}
console.log(`race-summary-test: 통과 (직접 케이스 + 실제 대회 ${n}개 한·영)`);
