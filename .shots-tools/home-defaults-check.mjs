// home-defaults-shots.sh 가 남긴 장면별 측정값(<폴더>/m-<장면>-<너비>.json, agent-browser eval 결과)을 모아
// <폴더>/metrics.txt 에 '장면 측정값' 줄과 PLAN B-4 기준 맞음/틀림(CHECK) 줄로 쓴다. 화면에도 CHECK 줄을 찍는다.
//   node .shots-tools/home-defaults-check.mjs <폴더>
import fs from 'node:fs';
import path from 'node:path';
const dir = process.argv[2];
const all = {};
for (const f of fs.readdirSync(dir).filter((f) => /^m-.+\.json$/.test(f)).sort()) {
  let v = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  if (typeof v === 'string') v = JSON.parse(v); // eval 결과는 JSON 글을 다시 JSON 으로 감싼 것
  all[f.slice(2, -5)] = v;
}
const m = all;
const b = all; // ko-before-<w> 도 같은 폴더에
const num = (s) => Number(String(s ?? '').replace(/,/g, ''));
const tab = (x, i) => x.tabs[i];
const onTab = (x) => x.tabs.findIndex((t) => t.on); // 0 전체 1 국내 2 해외
const out = [];
const check = (name, ok, why = '') => out.push(`CHECK ${ok ? '맞음' : '틀림'} ${name}${why ? ' — ' + why : ''}`);
const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7); // 이번 달
for (const w of [390, 1280]) {
  for (const sc of ['ko-default', 'en-default']) {
    const x = m[`${sc}-${w}`];
    if (!x) { check(`${sc}-${w}`, false, '측정 없음'); continue; }
    const kr = num(tab(x, 1).n);
    check(`${sc}-${w} 국내 탭 선택`, onTab(x) === 1);
    check(`${sc}-${w} 정렬 race_date`, x.sort === 'race_date');
    check(`${sc}-${w} 켜진 칩 = 접수 중 하나`, x.chips && x.chips.length === 1, JSON.stringify(x.chips));
    check(`${sc}-${w} 현황판 '지금 접수 중'만 강조`, x.stats[0].on && !x.stats[1].on && !x.stats[2].on);
    check(`${sc}-${w} 국내 탭 숫자 = 목록 총수 = 현황판 접수 중`, kr === x.shown && kr === num(x.stats[0].n), `${kr} / ${x.shown} / ${x.stats[0].n}`);
    check(`${sc}-${w} 날짜 오름차순`, x.ascending);
    check(`${sc}-${w} 모두 국내`, x.allDomestic);
    check(`${sc}-${w} 필터 버튼 숫자 1`, x.filterNum === '1');
    check(`${sc}-${w} 첫 묶음 = 이번 달 이후 첫 달`, x.first3[0] && x.first3[0].slice(0, 7) >= kst, `${x.groups[0]?.title} / ${x.first3[0]}`);
  }
  const ko = m[`ko-default-${w}`], en = m[`en-default-${w}`];
  if (ko && en) check(`en=ko 숫자 같음 (${w})`, JSON.stringify(ko.tabs.map((t) => num(t.n))) === JSON.stringify(en.tabs.map((t) => num(t.n))) && ko.shown === en.shown && JSON.stringify(ko.first3ids) === JSON.stringify(en.first3ids), `${ko.shown} / ${en.shown}`);
  const o = m[`ko-query-old-${w}`], bf = b[`ko-before-${w}`];
  if (!bf) check(`ko-query-old-${w} = ko-before`, false, 'before 측정 없음');
  else if (o) {
    const same = (k) => JSON.stringify(o[k]) === JSON.stringify(bf[k]);
    for (const k of ['tabs', 'sort', 'chips', 'stats', 'groups', 'first3ids', 'filterNum'])
      check(`ko-query-old-${w} = ko-before: ${k}`, same(k), same(k) ? '' : `${JSON.stringify(o[k])} ≠ ${JSON.stringify(bf[k])}`);
  }
  const a = m[`ko-query-abroad-${w}`];
  // 주소에 status 가 없으니 상태는 고르지 않은 값 → 기본값 '접수 중' (규칙 1·2).
  // 해외 탭 숫자와 목록 총수는 원래부터 다를 수 있다: 목록은 비행 24시간 넘는 해외 대회를 빼지만(maxFlight 기본 24) 탭 숫자는 안 뺀다 (바꾸기 전 '전체' 탭도 같음)
  if (a) check(`ko-query-abroad-${w} 해외·조회·상태는 기본(접수 중)`, onTab(a) === 2 && a.sort === 'views' && JSON.stringify(a.chips) === '["접수 중"]' && a.anyAbroad && !a.allDomestic, `${a.sort} ${JSON.stringify(a.chips)} 해외 탭 ${a.tabs[2].n} / 목록 ${a.shown}`);
  const q = m[`ko-q-${w}`];
  if (q) check(`ko-q-${w} 전체·칩 없음·해외 대회 있음`, onTab(q) === 0 && q.chips?.length === 0 && q.anyAbroad && q.sort === 'race_date', `${q.shown}개 ${JSON.stringify(q.first3)}`);
  const u = m[`en-query-upcoming-${w}`];
  if (u) check(`en-query-upcoming-${w} Korea·Race date·Opening soon 만`, onTab(u) === 1 && u.sort === 'race_date' && JSON.stringify(u.chips) === '["Opening soon"]' && u.allDomestic, JSON.stringify(u.chips));
}
const bad = out.filter((l) => l.startsWith('CHECK 틀림')).length;
out.push(`CHECK 합계: ${out.length - bad}/${out.length} 맞음`);
const lines = Object.entries(all).map(([k, v]) => `${k} ${JSON.stringify(v)}`);
fs.writeFileSync(path.join(dir, 'metrics.txt'), [...lines, '', ...out, ''].join('\n'));
console.log(out.join('\n'));
process.exitCode = bad ? 1 : 0;
