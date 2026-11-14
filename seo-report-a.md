# 파트 A 보고 — 데이터 기준·빈 페이지·밖에서 들어오는 링크

기준일: 2026-11-14 (한국 시간). 다가오는 대회 2438개(국내 748, 해외 1690).

## 바꾼 파일
- `scripts/seo-lib.mjs`
  - `today`: 환경변수 `SEO_TODAY=YYYY-MM-DD` 가 있으면 그 날(테스트 전용, 형식·달력이 틀리면 무시). 빌드는 환경변수 없이 실제 한국 시간 오늘.
  - `entryStatusOf(r)`: 홈 목록이 보는 값(notes_ko 는 취소 태그만)으로 `entryStatus` 를 계산한다(아래 '접수 중 판정').
  - `isEntryOpen(r)` = `entryStatusOf(r) === 'open'`. 규칙을 따로 쓰지 않고 `src/lib/util.ts` 한 곳에 위임.
  - `isEntryConfirmed` re-export.
  - `LANDINGS`·`LANDINGS_EN`: `/entry-open/` 은 접수 중 대회가 있을 때만 넣는다(이번 주말과 같은 방식. 0개 날에 noindex 페이지로 가는 링크를 깔지 않음). 오늘 데이터에서는 달라지는 것이 없다.
- `scripts/sitemap.mjs`: 빌드 중 sitemap 을 스스로 검사해 문제가 있으면 멈춘다(주소 중복, lastmod `YYYY-MM-DD` 형식, `/open/` 포함, 대회 0개 목록 페이지 포함).
- `scripts/prerender.mjs`: 시·도·거리 대회가 0개면 첫 화면의 "시·도별·거리별" 링크 묶음을 통째로 뺀다(빈 제목만 남지 않게). 오늘 데이터의 출력은 이전과 같다.
- `scripts/seo-data-check.mjs` (새 파일): 아래 검사 전부.
- `evidence/seo/app-footer-{ko,en}-{375,1280}.png` (새 파일)
- `src/lib/seoLinks.ts`, `src/App.tsx`, `src/i18n/*`: 점검만 했고 바꾸지 않았다(문구 한·영 있음, 375px 에서 줄바꿈·44px 확인).

## 접수 중 판정 (계획의 전제를 바로잡음)
계획은 "`isEntryOpen` 이 사이트 `entryStatus` 와 160건 어긋난다"고 했다. 실제 원인은 다르다.
- 홈 목록 데이터(`/d/<hash>.json`, `scripts/data-split.mjs`)에는 `notes_ko` 가 취소 태그만 남는다. '공식: 접수 중(마감일 미공지…)' 메모는 대회를 열 때 받는 상세 데이터에만 있다.
- 그래서 홈 화면은 그 160개를 '일정 미공개'로 보고, 현황판·필터의 접수 중 수는 **704**다(홈 스크린샷에서 확인).
- 1차 구현의 `isEntryOpen`(704)은 홈과 맞았지만, 같은 파일의 `entryStatusOf`(상태 글자·"접수 중 N개")는 전체 데이터(notes 포함)로 계산해서 시·도·거리·주말 페이지에서만 160개가 '접수 중'으로 나왔다. 즉 한 페이지 안에서 숫자와 `/entry-open/` 이 서로 달랐다.
- 상세 전용 메모로 상태를 만들면 목록 페이지가 상세 값에서 파생된 정보를 내주게 된다(데이터 무단 수집 방지 원칙).
- 그래서 `entryStatusOf` 를 홈 목록과 같은 값으로 계산하게 맞췄다. 결과: 접수 중 **704개**, `/entry-open/`·"접수 중 N개"·상태 글자가 모두 홈과 같다. 바뀐 것은 시·도·거리·주말 페이지의 그 160개 대회 상태 글자(접수 중 → 일정 미공개)와 "접수 중 N개" 숫자다.
- 남은 불일치(사이트 쪽, 범위 밖): 상세 페이지는 이 160개를 '접수 중'으로 보여 주고 홈 목록은 '일정 미공개'다. `data-split.mjs`·`src/lib` 를 고치는 일이라 건드리지 않았다.

## 확인 결과 (`node scripts/seo-data-check.mjs` 통과)
- 접수 중: 홈 목록 데이터 기준 `entryStatus` 와 전체 대회에서 어긋남 0건. `/entry-open/` 대회 수 704 = 홈 접수 중 704. 취소 대회는 접수 중에 들어가지 않는다.
- 시·도: 국내 다가오는 748개 모두 분류됨(미분류 0), 중복 0, 17개 시·도 합계 748 = `/kr/`. `광주`(광역시)와 `경기 광주` 구분. `PROVINCES` = `src/lib/places.ts`(id·이름·키 전부).
- 거리: 풀 52·하프 270·10K 544, 앱 거리 필터(`matchesDistances`)와 대회 목록이 똑같다. 경계값 표본(풀/42.195km/42K, 하프/21K, 10km/10K, 5km, 100km, 건강달리기) 맞음. `distance-test` 46개 통과.
- 이번 주말: 월~금은 다가오는 토~일, 토는 오늘~일, 일은 오늘 하루. 2026-11-09~16, 2026-12-31~2027-01-03, 2026-02-27~03-01 에서 따로 계산한 기대값과 같다. 한국 시간 자정 경계(UTC 14:59:59 → 전날, 15:00:00 → 다음 날, 연말)도 맞다. 이번 빌드(11/14 토): 11/14~11/15, 86개(국내 41, 해외 45).
- 빈 페이지: `SEO_TODAY=2030-01-01`(다가오는 대회 0)에서 시·도·거리 목록이 비고, 주말·접수 중 0, `listPages`·`listPagesEn`·`LANDINGS` 에 시·도·거리·주말·접수 중 주소가 없다. 그날 0개가 되는 `/kr/`·`/abroad/`·`/trail/`(seo-pages 에서 noindex)도 `landingPages` 에서 빠져 sitemap 에 들어가지 않는다 — 검수 때 고침: 전에는 이 셋이 남아 sitemap 자체 검사가 빌드를 멈췄다(`SEO_TODAY=2030-01-01 node scripts/sitemap.mjs` 로 확인, 지금 171개 목록 페이지로 통과).
- 목록 안 중복 id 0(시·도·거리·주말·모든 listPages).
- 밖에서 들어오는 링크: 앱 푸터 7개(`SEO_LINKS`)와 `LANDINGS`가 모두 만들어지는 페이지를 가리킨다. 빌드 뒤 `dist/index.html`·`dist/en/index.html` 첫 화면 링크 각 2687개의 대상이 dist 에 있거나(대회는 data.json id) 모두 존재.
- sitemap: 5716개 주소 = 홈 + `listPages`(196) + 대회 + 영어판. 새 페이지 42개(한·영) 포함, `/open/`·noindex 없음, 주소 중복 0, lastmod 형식 맞음.
- `npm run build` 정상 종료, `npx tsc -b` 오류 0, `distance-test`·`status-tone-test`·`share-test` 통과, `public/robots.txt` 변경 없음.
- `seo-pages-check.mjs`(파트 B)도 이 빌드에서 통과했다.

## 앱 푸터 스크린샷 (`evidence/seo/`)
`app-footer-ko-375.png`, `app-footer-ko-1280.png`, `app-footer-en-375.png`, `app-footer-en-1280.png`
- 375px: 링크 7개 모두 높이 44px, 두 줄로 줄바꿈, 가로 넘침 없음(`scrollWidth==innerWidth`). 1280px: 한 줄, 높이 36px.
- Playwright MCP 는 이 세션에서 권한이 없어 로컬 `agent-browser`(헤드리스 Chromium)로 `vite preview`(포트 4173)를 찍었다. 끝난 뒤 서버를 껐다.

## 남은 점
- 푸터의 `/distance/full|half|10k/` 링크는 코드에 고정되어 있다. 국내 다가오는 대회에 그 거리가 하나도 없는 날이 오면 페이지가 안 만들어져 링크가 깨진다. `seo-data-check` 가 그때 실패로 알려 준다(오늘은 52·270·544개라 해당 없음).
- `/weekend/`·`/entry-open/` 은 빌드한 날 기준이다. 다시 빌드하기 전까지 내용이 그대로다.
- 링크가 실제로 열리는지(`/r/<id>` 등 함수 응답)는 `vite preview` 로 못 본다. 대회 링크는 `data.json` id 로 확인했다.

## 다른 파트 메모
- 계획 2-1 표의 "접수 중 = `entryStatusOf==='open'`"은 그대로 맞다. 다만 `entryStatusOf` 가 홈 목록 값 기준이 됐으므로, B 의 검사·보고서에 '전체 데이터 기준 접수 중 864개'가 아니라 **704개**가 들어가야 한다.
