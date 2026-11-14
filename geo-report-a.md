# SEO·GEO 파트 A 보고 — 검색어 페이지 확장 · 대회 상세 요약 · llms.txt (g-geo, 2026-11-14 빌드 기준)

## 1. 새로 생긴 것 · 개수

| 구분 | 한국어 | 영어 | 합계 |
|---|---:|---:|---:|
| 월별+시·도 `/m/<ym>/<id>/` (대회 3개 이상 조합만, 13개 달 × 17개 시·도 중 91쌍) | 91 | 91 | **182** |
| 5km `/distance/5k/` (국내 다가오는 5km 대회 437개) | 1 | 1 | **2** |
| `dist/llms.txt` (링크 81개, 대회 데이터·`/r/` 링크 없음) | 1 | | 1 |

보강한 기존 페이지: 나라별 `/c/<cc>/` 133쌍(title·description·요약 문장), `/trail/` 1쌍(요약·시·도 링크), 월별 `/m/<ym>/` 에 '시·도별' 줄, 시·도 `/kr/<id>/` 에 '월별' 줄, 모든 정적 목록 페이지 푸터에 소개·FAQ 링크.
sitemap 은 5,904개 주소(목록 페이지 288개 + 한·영 소개·FAQ 4개 + 대회). 새 페이지는 `seo-lib.mjs` 의 `listPages` 에 들어 있어 sitemap 이 그대로 읽는다.

대회 상세 `/r/<id>`·`/en/r/<id>` 는 맨 위에 한 문장 요약이 들어갔다(2,661개 대회 모두 한·영).

## 2. 바뀐 파일 (파트 A)
`scripts/seo-lib.mjs` · `scripts/seo-pages.mjs` · `scripts/seo-pages-check.mjs` · `scripts/seo-data-check.mjs` · `src/lib/seoLinks.ts`(5km 한 칸) · `worker/site.ts` · `worker/raceSummary.ts`(새) · `scripts/race-summary-test.mjs`(새) · `scripts/llms.mjs`(새) · `evidence/geo/a-*.png`

## 3. 결정과 이유
- `/beginner/` 를 따로 만들지 않고 `/distance/5k/` 로 통일했다(5km 페이지와 내용이 겹치는 얇은 중복 방지). 문구는 "처음 대회에 나가는 사람이 고를 수 있는 짧은 거리" 사실만, 추천·순위 표현 없음.
- 월×시·도는 지난 달 없음, 현재 달은 오늘 이후 대회만, 취소 대회 제외. 3개 미만 조합은 파일이 아예 없다. 같은 제목이 되지 않게 title·description·요약 문장에 월·시·도·수·날짜 범위를 넣었다.
- 나라 페이지 요약은 데이터로 센 값만(전체·다가오는 수, 가장 가까운 대회, 대회가 가장 많은 달, 대회가 많은 도시). 2개 미만이면 '많은 달·도시' 문장을 뺀다. 대회가 1개뿐인 나라는 한 문장.
- `/c/kr/` 는 `/kr/` 과 제목이 겹치지 않게 '국내 마라톤 대회 전체 목록 — 지난 대회 포함 881개' 로 바꿨다(h1 도 같이).
- 대회 요약 문장은 합니다체. 상태 글자는 홈 목록과 같은 `entryStatus`(상세 notes 를 뺀 값)로 계산하고, 쓰는 값은 `/r/<id>` 본문 표에 이미 있는 것(날짜·장소·종목·접수 방식·접수 기간)뿐이다. 참가비·정원·메모·공식 주소는 넣지 않았다.
- 앱(React) 화면은 건드리지 않았다. 푸터 링크 줄에 5km 한 칸만 추가(기존 풀코스·하프·10km 와 같은 꼴).

## 4. 요약 문장 예시 (실제 출력, 오늘 2026-11-14 기준)
1. 확정 일정·접수 중: `K-거상 트레일 러닝은 2026년 11월 21일에 경남 의령에서 열리는 20K·15K·5K 종목이 있는 트레일러닝 대회로, 접수는 선착순 2026년 9월 28일부터 2026년 11월 15일까지(접수 중)입니다.`
2. 예상 일정(접수 일정 미확정): `전마협 보성녹차 가을마라톤은 2026년 11월 21일(예상)에 전남 보성에서 열리는 풀코스·하프·10km·5km 종목이 있는 마라톤 대회로, 접수는 선착순 예상 2026년 9월 11일부터 2026년 10월 16일까지(일정 미공개)입니다.`
3. 영어 예상: `Boseong Green Tea Autumn Marathon is a race (Marathon, Half, 10km, 5km) held on Nov 21, 2026 (expected) in Boseong, Jeonnam; registration (first come, first served) is expected to run from Sep 11, 2026 to Oct 16, 2026 (Dates TBA).`
4. 접수 기간 없음: `파나마 마라톤은 2026년 11월 15일에 파나마 파나마시티에서 열리는 풀코스·하프·10km 종목이 있는 마라톤 대회로, 접수 방식은 상시 접수, 접수 기간은 아직 공개되지 않았습니다(조기 마감).`
6. 지난 대회(검수 a-fix 뒤, wrangler 응답에서 확인): `오렌지 런은 2025년 3월 8일(예상)에 서울 영등포에서 열린 10km·5km 종목이 있는 마라톤 대회로, 접수는 선착순 예상 2025년 2월 8일부터 2025년 3월 5일까지(접수 마감)입니다.` / `Orange Run was a race (10km, 5km) held on Mar 8, 2025 (expected) … registration (first come, first served) was expected to run from Feb 8, 2025 to Mar 5, 2025 (Closed).` 도시와 나라 이름이 같은 곳(홍콩·싱가포르 등 16개 대회)은 장소를 한 번만 쓴다(`…에 홍콩에서 열리는…`). `evidence/geo/a-race-*.png` 는 이 문구 수정 전에 찍은 것이라 지난 대회 문장의 '열리는'·'is' 가 옛 표기다.
5. 취소: `착한서구 공부방 기부앤런은 2026년 11월 28일(예상)에 열릴 예정이었으나 주최 측이 취소(중단)했다고 알린 대회입니다.` / `… was scheduled for Nov 28, 2026 (expected) but has been cancelled (or called off) by the organizer.`

## 4-1. 실제 렌더 확인
`npx wrangler pages dev dist --port 8788`(로컬, 배포 아님)에서 `/r/seoul-orange-run`·`/en/r/seoul-orange-run` 응답이 200 이고 요약 `<p>` 가 `<h1>` 바로 다음에 있음을 응답 HTML 로 확인했다. 스크린샷은 크롤러가 받는 HTML 을 보려고 응답에서 `<script>` 와 첫 로딩 덮개(`#boot`)를 뺀 사본으로 찍었다(앱이 뜨면 React 가 갈아 끼운다). wrangler 는 끝나고 종료, 8788 포트 비었음.

## 5. 확인 결과 (직접 돌림)
| 확인 | 결과 |
|---|---|
| `npm run build` (tsc -b 포함) | EXIT 0 (B 가 연결한 `info-pages`·`llms` 포함 체인) |
| `npx tsc -b` | 오류 0 |
| `tsc` 단독 `worker/raceSummary.ts` | EXIT 0 |
| `tsc` 단독 `worker/site.ts` | 기준선 20줄(HTMLRewriter·`el`)과 같음, 새 오류 0 |
| `node scripts/race-summary-test.mjs` | 통과 (직접 케이스 + 대회 2,661개 한·영: 비어 있지 않음·한 문장·이모지 0·값 오류 글자 0·참가비/정원/메모/주소 미포함·상태 글자 = 홈 목록·예상 표기) |
| `node scripts/seo-pages-check.mjs` | 통과 (새 페이지 226개 = 시·도 34 + 거리 8 + 월×시·도 182 + 주말 2 중 검사 대상 전부, 나라·트레일 요약 숫자 = 데이터, description 160자 이하, 푸터 소개·FAQ 링크) |
| `node scripts/seo-data-check.mjs` | 통과 (5k 묶음 = 앱 거리 필터, 월×시·도 날짜 시뮬레이션 7일 일치, 2030-01-01 에 새 페이지 0개) |
| `SEO_TODAY=2030-01-01` 로 `seo-pages`·`sitemap`·`llms` | 셋 다 멈추지 않음 (월×시·도 0개, 시·도·거리 0개, 주말 noindex) — 확인 뒤 정상 날짜로 다시 빌드 |
| `node scripts/geo-check.mjs` (B) | 통과: html 586개, title 584종 고유 |
| `node scripts/distance-test.mjs`·`status-tone-test.mjs` | 통과 (46개 / 모두 통과) |

## 6. 스크린샷 (agent-browser, 375/1280, 직접 열어 확인 — 겹침·잘림·가로 스크롤 없음, scrollWidth 차이 0)
| 페이지 | 375 | 1280 |
|---|---|---|
| `/m/2026-12/seoul/` | `evidence/geo/a-month-seoul-ko-375.png` (+ `a-month-seoul-ko-footer-375.png` 푸터) | `evidence/geo/a-month-seoul-ko-1280.png` |
| `/en/m/2026-12/seoul/` | `evidence/geo/a-month-seoul-en-375.png` | `evidence/geo/a-month-seoul-en-1280.png` |
| `/distance/5k/` | `evidence/geo/a-distance-5k-375.png` | `evidence/geo/a-distance-5k-1280.png` |
| `/c/jp/` | `evidence/geo/a-country-jp-375.png` | `evidence/geo/a-country-jp-1280.png` |
| `/trail/` | `evidence/geo/a-trail-375.png` | `evidence/geo/a-trail-1280.png` |
| `/r/k-geosang-trail` (확정) 한·영 | `evidence/geo/a-race-confirmed-{ko,en}-375.png` | `evidence/geo/a-race-confirmed-{ko,en}-1280.png` |
| `/r/boseong-autumn` (예상) 한·영 | `evidence/geo/a-race-expected-{ko,en}-375.png` | `evidence/geo/a-race-expected-{ko,en}-1280.png` |

## 7. 남은 일 · 사용자 결정
- 월×시·도 91쌍×2 는 구조가 비슷한 페이지다. 색인 품질은 서치콘솔 '색인 생성' 현황으로 몇 주 지켜볼 것(3개 기준은 `MIN_MONTH_REGION` 한 곳).
- `llms.txt` 는 robots.txt 가 AI 봇을 막고 있어 읽는 쪽이 제한적이다(사용자 요청으로 만들었고 robots.txt 는 그대로).
- 앱 푸터에 소개·FAQ 링크를 넣을지(React 화면 요소 추가라 하지 않음). 지금은 정적 페이지 푸터·sitemap 으로 연결된다.
- 상세 페이지 요약의 상태 글자는 홈 목록 규칙을 따르므로, 상세 메모로만 '접수 중'인 대회는 요약에 '일정 미공개'로 나온다(표의 접수 기간은 기존대로 보임) — 기존 규칙(데이터 무단 수집 방지)과 같은 선.

## 8. 다른 파트 메모
- 파트 B 파일은 건드리지 않았다. `INFO_PATHS`(`/about/`·`/faq/`)와 B 의 sitemap 소개·FAQ 4개는 맞물려 통과한다.
- `npm run build` 가 `evidence/ledger.csv` 를 매번 갱신하는 것은 기존 동작이라 이번 커밋에 넣지 않았다.
