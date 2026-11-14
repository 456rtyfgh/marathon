# 검색 유입 정적 페이지 — 보고서 (g-seo, 2026-11-14 빌드 기준)

기준 커밋 `c7d41e9`(1차 구현) 위에서 마무리. 이 문서는 파트 B(정적 페이지 HTML 품질·dist 검사) 결과다.
파트 A(데이터 기준·sitemap·prerender·앱 푸터)의 보고는 7절에 합쳤다(원본 `seo-report-a.md`).

## 1. 새 페이지 개수

| 구분 | 한국어 | 영어 | 합계 |
|---|---:|---:|---:|
| 시·도별 `/kr/<id>/` | 17 | 17 | 34 |
| 거리별 `/distance/<bucket>/` (full·half·10k) | 3 | 3 | 6 |
| 이번 주말 `/weekend/` | 1 | 1 | 2 |
| **새 목록 페이지 소계** | **21** | **21** | **42** |
| 접수 중 `/entry-open/` (기존 페이지 보강) | 1 | 1 | 2 |
| `/open/` 넘김 (canonical → `/entry-open/`, sitemap 제외) | 1 | 1 | 2 |

- 이번 빌드(2026-11-14)에서 noindex 0개(대회가 0개인 페이지가 없음). 0개가 되면 `/weekend/`·`/entry-open/` 은 파일을 만들고 `noindex,follow`, 시·도·거리는 파일 자체를 만들지 않는다. 다가오는 대회가 하나도 없는 날(데이터가 다 지난 경우)에는 기존 `/kr/`·`/abroad/`·`/trail/`(한·영)도 noindex 가 되도록 `seo-pages.mjs` 를 보강했다.
- 전체 sitemap 5716 url (목록 페이지 196개).

### 경로 · 대회 수 · title

| 경로 | 대회 수 | 색인 | title |
|---|---:|---|---|
| `/kr/seoul/` | 204 | index | 2026·2027 서울 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/seoul/` | 204 | index | Marathons in Seoul, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/gyeonggi/` | 103 | index | 2026·2027 경기 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/gyeonggi/` | 103 | index | Marathons in Gyeonggi, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/incheon/` | 29 | index | 2026·2027 인천 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/incheon/` | 29 | index | Marathons in Incheon, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/gangwon/` | 53 | index | 2026·2027 강원 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/gangwon/` | 53 | index | Marathons in Gangwon, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/north-chungcheong/` | 25 | index | 2026·2027 충북 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/north-chungcheong/` | 25 | index | Marathons in North Chungcheong, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/south-chungcheong/` | 36 | index | 2026·2027 충남 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/south-chungcheong/` | 36 | index | Marathons in South Chungcheong, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/daejeon/` | 24 | index | 2026·2027 대전 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/daejeon/` | 24 | index | Marathons in Daejeon, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/sejong/` | 10 | index | 2026·2027 세종 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/sejong/` | 10 | index | Marathons in Sejong, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/north-jeolla/` | 33 | index | 2026·2027 전북 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/north-jeolla/` | 33 | index | Marathons in North Jeolla, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/south-jeolla/` | 40 | index | 2026·2027 전남 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/south-jeolla/` | 40 | index | Marathons in South Jeolla, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/gwangju/` | 19 | index | 2026·2027 광주 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/gwangju/` | 19 | index | Marathons in Gwangju, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/north-gyeongsang/` | 49 | index | 2026·2027 경북 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/north-gyeongsang/` | 49 | index | Marathons in North Gyeongsang, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/south-gyeongsang/` | 40 | index | 2026·2027 경남 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/south-gyeongsang/` | 40 | index | Marathons in South Gyeongsang, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/daegu/` | 15 | index | 2026·2027 대구 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/daegu/` | 15 | index | Marathons in Daegu, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/ulsan/` | 17 | index | 2026·2027 울산 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/ulsan/` | 17 | index | Marathons in Ulsan, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/busan/` | 33 | index | 2026·2027 부산 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/busan/` | 33 | index | Marathons in Busan, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/kr/jeju/` | 18 | index | 2026·2027 제주 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/kr/jeju/` | 18 | index | Marathons in Jeju, South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/distance/full/` | 52 | index | 2026·2027 국내 풀코스 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/distance/full/` | 52 | index | Full Marathons in South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/distance/half/` | 270 | index | 2026·2027 국내 하프 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/distance/half/` | 270 | index | Half Marathons in South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/distance/10k/` | 544 | index | 2026·2027 국내 10km 마라톤 대회 일정 — 마라톤 캘린더 |
| `/en/distance/10k/` | 544 | index | 10K Races in South Korea 2026–2027 — Race Dates & Registration \| Marathon Calendar |
| `/weekend/` | 86 | index | 이번 주말 마라톤 대회 11월 14일(토)~15일(일) — 마라톤 캘린더 |
| `/en/weekend/` | 86 | index | Marathons This Weekend, Nov 14–15, 2026 \| Marathon Calendar |
| `/entry-open/` | 704 | index | 지금 접수 중인 마라톤 대회 704개 — 2026년 11월 14일 기준 \| 마라톤 캘린더 |
| `/en/entry-open/` | 704 | index | 704 Races Open for Registration — as of Nov 14, 2026 \| Marathon Calendar |

시·도 합계는 `/kr/` 국내 다가오는 대회 수와 같아야 한다(파트 A 의 `seo-data-check.mjs` 가 확인). 거리 페이지는 한 대회가 풀·하프·10K 에 중복해 들어갈 수 있어 합계가 `/kr/` 와 다르다(대회가 여러 종목을 가질 때).

## 2. 이번에 고친 것 (파트 B)

- **미확정 접수일 숨김**: 목록 줄에 접수 상태 글자를 넣는 페이지(새 목록 페이지·`/entry-open/`)는 접수 일정이 확정(`isEntryConfirmed`)일 때만 접수 기간을 적는다. 미확정(`expected`/`tbc`)이면 접수 방식만 남아 "일정 미공개" 와 어긋나지 않는다. 기존 월별·나라별·연도별 출력은 그대로. 영어 줄도 같은 규칙.
- 줄 안 문구: `상시 접수 접수 …부터` 처럼 겹치던 '접수' 를 정리(상태 글자 있는 줄만).
- ItemList 순서: `/entry-open/`·`/en/entry-open/` 의 ItemList 가 화면(국내 → 해외 묶음)과 다른 순서였던 것을 화면 순서와 같게.
- 빈 페이지 문구: `/weekend/`·`/entry-open/`(한·영)이 0개일 때 "0개 … 모았습니다" 대신 "대회가 없습니다" 문장.
- 다가오는 대회가 0개인 날 `/kr/`·`/abroad/`·`/trail/`(한·영)에 noindex.
- `scripts/seo-pages-check.mjs` 확장(아래 3).

## 3. 검사 — `node scripts/seo-pages-check.mjs` (dist, 실패 시 exit 1)

새 페이지 전부(시·도·거리·주말, 한·영)와 `/entry-open/`(한·영)에 대해:

1. title 고유(기존 목록 페이지·`/open/` 넘김 포함 전체), description 고유·160자 이하
2. canonical = 자기 주소, hreflang ko/en/x-default 가 한·영 짝을 가리킴(양쪽 같은 세 개 = 상호 참조), `<html lang>` 맞음
3. 모든 JSON-LD `JSON.parse` 가능, BreadcrumbList(마지막 = 자기 주소, 각 항목 대상 존재)·ItemList 있음, ItemList 수 = `<li>` 수, url 이 `/r/<id>`(영어 `/en/r/<id>`)이고 id 가 `data.json` 에 있고 화면 목록과 같은 순서
4. 내부 링크 `href="/…"` 대상 존재(폴더 주소는 `dist/<path>/index.html`, `/terms` 는 `terms.html`, `/r/<id>`·`/en/r/<id>` 는 `data.json` id, 그 밖은 dist 파일) — 깨진 링크 0
5. h1 정확히 1개, 관련 페이지 nav, 0개 페이지는 noindex, 시·도·거리는 0개면 파일 없음, sitemap 에 noindex 없음·새 주소 있음·lastmod `YYYY-MM-DD`
6. 줄마다 `data.json` 과 대조: 날짜, 접수 상태 글자(취소 제외; `entryStatusOf` 와 같은 글자), 미확정 접수일 줄에 접수 날짜 없음(확정이면 있음)
7. 한 페이지 안 대회 id 중복 0, 이모지 0(`Extended_Pictographic`, 푸터 ©·®·™ 제외)
8. 목록 수 = `seo-lib` 데이터 수, 한·영 목록 수·순서 같음
9. `/open/`·`/en/open/` 넘김(canonical → `/entry-open/`, refresh, noindex 없음, sitemap 제외), `dist/d/` 아래 html 없음, 기존 랜딩 title·canonical 불변, `/kr/`·`/en/kr/` 의 시·도 링크, 시·도 id = `src/lib/places.ts`

### 실행 결과 (2026-11-14 빌드)

```
npm run build                    EXIT 0
npx tsc -b                       오류 0
node scripts/seo-pages-check.mjs seo-pages-check: 통과
node scripts/distance-test.mjs   46개 통과
node scripts/status-tone-test.mjs 모두 통과
git diff public/robots.txt       비어 있음
```

### 빈 페이지 시뮬레이션 (`SEO_TODAY=2030-01-01`)

- `seo-pages.mjs`: 시·도별 0개, 거리별 0개, `/weekend/`·`/entry-open/` 한·영 4개 파일 생성(대회 0개, noindex,follow, "대회가 없습니다" 문장), `/kr/`·`/abroad/`·`/trail/` 한·영 noindex.
- `seo-pages-check.mjs`: **통과**(시·도·거리 파일 없음, 주말·접수 중 noindex, noindex 페이지가 sitemap 에 없음) — 단, 이 검사의 sitemap 은 `sitemap.mjs` 대신 "빈 목록 페이지를 뺀" 임시 스크립트로 만들었다. 이유: 파트 A 의 현재 `scripts/sitemap.mjs` 는 대회 0개 목록 페이지가 있으면 `throw` 하는데, 2030-01-01 에는 `seo-lib.mjs` 의 `landingPages` 가 `/kr/`·`/abroad/`·`/trail/` 을 무조건 넣어(대회 0개) 빌드가 멈춘다. → 파트 A 에 메모(아래 6).
- 시뮬레이션 직후 `npm run build` 로 dist 를 실제 날짜로 되돌리고 재검사 통과.

## 4. 스크린샷 (agent-browser, 로컬 `vite preview --port 4174`, 끝난 뒤 종료)

Playwright MCP 는 이 환경에서 권한이 없어 agent-browser CLI 로 찍었다. 직접 열어 확인: 375px 가로 넘침 없음(`scrollWidth == innerWidth`), 대회 이름 링크 높이 44px, 줄 잘림·겹침 없음(어두운 모드 렌더링).

| 화면 | 375px | 1280px |
|---|---|---|
| `/kr/seoul/` | `evidence/seo/kr-seoul-375.png` | `evidence/seo/kr-seoul-1280.png` |
| `/distance/full/` | `evidence/seo/distance-full-375.png` | `evidence/seo/distance-full-1280.png` |
| `/weekend/` | `evidence/seo/weekend-375.png` | `evidence/seo/weekend-1280.png` |
| `/entry-open/` | `evidence/seo/entry-open-375.png` | `evidence/seo/entry-open-1280.png` |
| `/en/kr/seoul/` | `evidence/seo/en-kr-seoul-375.png` | `evidence/seo/en-kr-seoul-1280.png` |
| `/en/weekend/` | `evidence/seo/en-weekend-375.png` | `evidence/seo/en-weekend-1280.png` |

앱 푸터 링크 줄 스크린샷은 파트 A: `evidence/seo/app-footer-{ko,en}-{375,1280}.png`.

## 5. 알아 둘 점

- **`/weekend/`·`/entry-open/` 은 빌드한 날 기준**이다. 다시 빌드하기 전까지 내용(대회 목록·"이번 주말" 날짜·"접수 중 N개")이 그대로다. 페이지 안에도 "목록은 매일 새로 만들어집니다(만든 날 기준)" 라고 적었다. 매일 빌드(배포)가 돌아야 정확하다.
- 목록의 `/r/<id>`·`/en/r/<id>` 링크는 `vite preview` 가 상세 페이지를 내주지 못해(dev 전용 미들웨어) 실제로 열어 보지 않고 `data.json` id 로 존재를 확인했다. 실제 열림은 `wrangler pages dev dist` 로 확인해야 한다.
- 접수 중 판정 규칙: `entryStatus(r) === 'open'`(`src/lib/util.ts`) 하나이며, 홈 목록이 보는 값 기준이다. 이번 빌드에서 `/entry-open/` 은 한국어·영어 모두 **704개**, 시·도·거리·주말 페이지의 "접수 중 N개"·상태 글자도 같은 규칙이다. 계획서의 "160건 어긋남" 은 원인이 계획과 달랐다(상세 전용 메모 때문에 상태 글자만 160개가 '접수 중' 으로 나오던 것) — 자세한 내용은 7절. 파트 B 작업 중 중간 빌드에서 864개가 나온 것은 파트 A 가 판정 함수를 고치기 전 상태였다.
- 거리 페이지의 묶음 없음 217개 대회(예: 6km, 3km, 11K 등)는 풀·하프·10K 어느 페이지에도 들어가지 않는다(앱 거리 필터와 같은 `distanceBucket` 기준).

## 6. 다른 파트 메모 (파트 A 에게)

- `scripts/sitemap.mjs` 의 "빈 목록 페이지 throw" 와 `seo-lib.mjs` 의 `landingPages`(`/kr/`·`/abroad/`·`/trail/` 무조건 포함): 다가오는 대회가 하나도 없는 날 빌드가 멈춘다. `landingPages` 에서 `races.length` 가 0 인 것을 빼거나(파트 B 는 이미 해당 페이지를 noindex 로 만든다) throw 대신 건너뛰어야 한다. 실제 데이터(2028-04 까지 있음)로는 당분간 발생하지 않는다.

## 7. 데이터 기준 (파트 A, `seo-report-a.md` 합침)

기준일: 2026-11-14 (한국 시간). 다가오는 대회 2438개(국내 748, 해외 1690).

### 바꾼 파일
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

### 접수 중 판정 (계획의 전제를 바로잡음)
계획은 "`isEntryOpen` 이 사이트 `entryStatus` 와 160건 어긋난다"고 했다. 실제 원인은 다르다.
- 홈 목록 데이터(`/d/<hash>.json`, `scripts/data-split.mjs`)에는 `notes_ko` 가 취소 태그만 남는다. '공식: 접수 중(마감일 미공지…)' 메모는 대회를 열 때 받는 상세 데이터에만 있다.
- 그래서 홈 화면은 그 160개를 '일정 미공개'로 보고, 현황판·필터의 접수 중 수는 **704**다(홈 스크린샷에서 확인).
- 1차 구현의 `isEntryOpen`(704)은 홈과 맞았지만, 같은 파일의 `entryStatusOf`(상태 글자·"접수 중 N개")는 전체 데이터(notes 포함)로 계산해서 시·도·거리·주말 페이지에서만 160개가 '접수 중'으로 나왔다. 즉 한 페이지 안에서 숫자와 `/entry-open/` 이 서로 달랐다.
- 상세 전용 메모로 상태를 만들면 목록 페이지가 상세 값에서 파생된 정보를 내주게 된다(데이터 무단 수집 방지 원칙).
- 그래서 `entryStatusOf` 를 홈 목록과 같은 값으로 계산하게 맞췄다. 결과: 접수 중 **704개**, `/entry-open/`·"접수 중 N개"·상태 글자가 모두 홈과 같다. 바뀐 것은 시·도·거리·주말 페이지의 그 160개 대회 상태 글자(접수 중 → 일정 미공개)와 "접수 중 N개" 숫자다.
- 남은 불일치(사이트 쪽, 범위 밖): 상세 페이지는 이 160개를 '접수 중'으로 보여 주고 홈 목록은 '일정 미공개'다. `data-split.mjs`·`src/lib` 를 고치는 일이라 건드리지 않았다.

### 확인 결과 (`node scripts/seo-data-check.mjs` 통과)
- 접수 중: 홈 목록 데이터 기준 `entryStatus` 와 전체 대회에서 어긋남 0건. `/entry-open/` 대회 수 704 = 홈 접수 중 704. 취소 대회는 접수 중에 들어가지 않는다.
- 시·도: 국내 다가오는 748개 모두 분류됨(미분류 0), 중복 0, 17개 시·도 합계 748 = `/kr/`. `광주`(광역시)와 `경기 광주` 구분. `PROVINCES` = `src/lib/places.ts`(id·이름·키 전부).
- 거리: 풀 52·하프 270·10K 544, 앱 거리 필터(`matchesDistances`)와 대회 목록이 똑같다. 경계값 표본(풀/42.195km/42K, 하프/21K, 10km/10K, 5km, 100km, 건강달리기) 맞음. `distance-test` 46개 통과.
- 이번 주말: 월~금은 다가오는 토~일, 토는 오늘~일, 일은 오늘 하루. 2026-11-09~16, 2026-12-31~2027-01-03, 2026-02-27~03-01 에서 따로 계산한 기대값과 같다. 한국 시간 자정 경계(UTC 14:59:59 → 전날, 15:00:00 → 다음 날, 연말)도 맞다. 이번 빌드(11/14 토): 11/14~11/15, 86개(국내 41, 해외 45).
- 빈 페이지: `SEO_TODAY=2030-01-01`(다가오는 대회 0)에서 시·도·거리 목록이 비고, 주말·접수 중 0, `listPages`·`listPagesEn`·`LANDINGS` 에 시·도·거리·주말·접수 중 주소가 없다.
- 목록 안 중복 id 0(시·도·거리·주말·모든 listPages).
- 밖에서 들어오는 링크: 앱 푸터 7개(`SEO_LINKS`)와 `LANDINGS`가 모두 만들어지는 페이지를 가리킨다. 빌드 뒤 `dist/index.html`·`dist/en/index.html` 첫 화면 링크 각 2687개의 대상이 dist 에 있거나(대회는 data.json id) 모두 존재.
- sitemap: 5716개 주소 = 홈 + `listPages`(196) + 대회 + 영어판. 새 페이지 42개(한·영) 포함, `/open/`·noindex 없음, 주소 중복 0, lastmod 형식 맞음.
- `npm run build` 정상 종료, `npx tsc -b` 오류 0, `distance-test`·`status-tone-test`·`share-test` 통과, `public/robots.txt` 변경 없음.
- `seo-pages-check.mjs`(파트 B)도 이 빌드에서 통과했다.

### 앱 푸터 스크린샷 (`evidence/seo/`)
`app-footer-ko-375.png`, `app-footer-ko-1280.png`, `app-footer-en-375.png`, `app-footer-en-1280.png`
- 375px: 링크 7개 모두 높이 44px, 두 줄로 줄바꿈, 가로 넘침 없음(`scrollWidth==innerWidth`). 1280px: 한 줄, 높이 36px.
- Playwright MCP 는 이 세션에서 권한이 없어 로컬 `agent-browser`(헤드리스 Chromium)로 `vite preview`(포트 4173)를 찍었다. 끝난 뒤 서버를 껐다.

### 남은 점
- 푸터의 `/distance/full|half|10k/` 링크는 코드에 고정되어 있다. 국내 다가오는 대회에 그 거리가 하나도 없는 날이 오면 페이지가 안 만들어져 링크가 깨진다. `seo-data-check` 가 그때 실패로 알려 준다(오늘은 52·270·544개라 해당 없음).
- `/weekend/`·`/entry-open/` 은 빌드한 날 기준이다. 다시 빌드하기 전까지 내용이 그대로다.
- 링크가 실제로 열리는지(`/r/<id>` 등 함수 응답)는 `vite preview` 로 못 본다. 대회 링크는 `data.json` id 로 확인했다.

### 다른 파트 메모
- 계획 2-1 표의 "접수 중 = `entryStatusOf==='open'`"은 그대로 맞다. 다만 `entryStatusOf` 가 홈 목록 값 기준이 됐으므로, B 의 검사·보고서에 '전체 데이터 기준 접수 중 864개'가 아니라 **704개**가 들어가야 한다.
