# PLAN — 접수 일정 '예상' 채우기 + 지난 대회 다음 회차 예상 (데이터 작업)

작성 2026-11-08. **데이터 작업만.** 이 계획의 파일 이름은 `PLAN-entry.md`.
- `PLAN.md` 는 지금 다른 세션(지도 '돌아가기' 코드 작업)이 쓰고 있어 건드리지 않는다. `PLAN-data.md` 도 앞선 한국 대회 추가 작업(kr-predict) 파일이라 건드리지 않는다.
- **금지:** 코드·UI·스키마(`src/`·`worker/`·`scripts/`·`supabase/`·`package.json`) 변경, 대회 행 삭제, `git push`, `git add -A`·`git commit -a`, `git add -f`.
- **파트 A = 한국(`KR`) + 일본(`JP`) 대회 전부**, **파트 B = 그 밖의 나라 대회 전부**(브리프에서 정한 나누기). 나라는 행의 `country_code` 로만 정한다.
- 검수(FIX)는 지정된 파트의 파일만 고친다. 다른 파트 문제는 **자기** `report.md` 의 `## 다른 파트 메모` 에만 적는다.

---

## 1. 목표

사용자 지적(2026-11-08): "고구려마라톤은 대회일·접수 시작까지 예상이 있는데 운탄고도·스카이레이스 등은 대회일만 예상이고 접수는 비어 있다. 다른 대회도 다 마찬가지로 해라."

1. **접수 시작일(`entry_opens`)이 빈 대회**마다 직전 회차의 실제 접수 시작·마감일을 찾아, 같은 간격만큼 옮긴 날을 **예상**으로 넣는다(4-2). 다음 회차 접수일이 공식에 이미 나와 있으면 그 값을 `confirmed` 로 넣는다.
2. **대회일이 이미 지난 대회**는 매년 열리면 다음 회차 날짜를 예상(같은 달·같은 주차·같은 요일)하고 접수 일정도 1번처럼 예상한다(4-3). 다음 회차가 이미 발표됐으면 그 값(`confirmed`). 1회성·중단이 확실하면 그대로 둔다.
3. **이미 공식으로 확인된 값(confirmed)은 절대 예상값으로 덮지 않는다.** 예상은 빈 칸에만.
4. 대상 행 하나하나가 '채움' 또는 '못 찾음(확인한 곳)' 또는 '건너뜀(이유)' 중 하나로 보고서에 남는다. 합본 `.duo-data/entry-predict-report.md`.
5. 반영 후 `public/data.json` 을 다시 떠서 커밋.

## 2. 지금 사실 (PLAN 쓰면서 직접 확인 — `public/data.json` generated_at 2026-11-08T05:24Z)

- races **1,621**. 행 키 **28개**: `id, name_ko, name_en, city_ko, country_ko, country_code, region, race_date, date_confidence, is_major, entry_type, entry_opens, entry_closes, entry_confidence, entry_fee, entry_fee_currency, distances, field_size, course, flight_hours, official_url, source_url, last_verified, notes_ko, discipline, elevation_gain, sold_out_on, subregion`.
- `entry_opens` 가 빈 행 **817** (브리프 816 — 그 사이 1행 차이):

  | 파트 | 나라 | 전체 | opens 빈 행 | 그중 race_date ≥ 오늘 | 그중 closes 는 있음 | 그중 entry_confidence = confirmed | race_date < 2026-11-08 |
  |---|---|---|---|---|---|---|---|
  | A | KR | 621 | 225 | 223 | 22 | 18 | **155** (11-08 당일 19 더) |
  | A | JP | 211 | 25 | 25 | 8 | 7 | 0 (11-08 당일 7 더) |
  | B | 그 밖 | 789 | 567 | 562 | 76 | 75 | 5 (11-08 당일 17 더) |

  → 손볼 행(빈 opens ∪ 지난 대회): **A 약 405~430행**(그중 다음 회차로 옮길 지난 대회 155, BUILD 가 11-09 이후면 181), **B 약 572~590행**(거의 전부 접수만). A 는 한국어 출처·대회일 옮기기까지 있어 행당 일이 많고, B 는 행 수가 많아 두 파트 분량이 비슷하다.
- 지난 대회 **A 155행 중 153행은 entry_opens 가 이미 있다** = 그 회차(대개 2026)의 접수일. entry_confidence 가 `confirmed` 인 것은 **8행뿐** — 그 값이 곧 '직전 회차 실제 접수일'(근거는 그 행 official/source 를 다시 열어 확인). `expected` 인 **145행**은 실제 값이 아니므로 직전 회차 실제 접수일을 다시 찾는다(A 일의 큰 덩어리).
- opens 가 빈 행 중 `entry_confidence='confirmed'` 100행: closes 는 있는 것 92(A 24 · B 68), **opens·closes 둘 다 빈 것 8**(`deauville, seattle-marathon, pune, abudhabi, funchal, castellon, helsingborg, ulleung-iisun-marathon` — 지킬 확정 값이 없음, 4-2-6). opens 빈 행 중 `entry_type='open'` 217(A 11 · B 206).
- 지난 대회 중 notes 가 `[취소]`/`[중단]` 으로 시작하는 행은 지금 0개(전체 DB 에는 4개). 화면은 `src/lib/util.ts` `CANCEL_TAG_RE = /^\s*\[(취소|중단)\]\s*/` 로 취소를 판단한다.
- 브리프 예 '고구려마라톤'(`goguryeo-seoul`): race_date 2027-02-28 expected, entry 2026-11-10~11-15 expected — 이 행은 이미 opens 가 있어 대상 아님.
- 운탄고도(`untangodo-skyrace-trail` 2027-06-12)·동해(`donghae-skyrace-trail` 2027-05-08)·춘천(`chuncheon-skyrace-trail` 2027-09-11): race_date expected, notes `2026년 M월 D일 개최 기준 예상 일정. …`, entry 비어 있음(tbc) → 파트 A(한국)의 대상.
- '`YYYY년 M월 D일 개최 기준 예상 일정. `' 머리말이 있는 행 115개. 접수 예상 꼬리말(`접수 일정은 … 기준 예상.`)이 있는 행은 0개. 다만 notes 에 `접수 일정은` 이 들어간 행이 16개 있다:
  - 이미 비슷한 예상 문장(opens 있음, 대상 아님): `seoul-half`(`접수 일정은 2026 대회(12/16~1/6) 기준 추정.`)·`yokohama`(`접수 일정은 직전 회차 기준 추정.`).
  - **'아직 없음' 문장**(대상, 4-2-4 에서 그 문장을 꼬리말로 바꿈): `접수 일정은 아직 발표 전.`(UTMB 트레일 7개)·`공식 접수 일정은 미확인.`·`접수 일정은 공식에 아직 없음.`·`접수 일정은 아직 미공지.`·`접수 일정은 아직 공지되지 않았다.`·`접수 일정은 미공지` 가 든 문장·`참가비와 접수 일정은 확인하지 못했다.`·`접수 일정은 홈페이지에서 확인하세요.` 등.
- 화면의 접수 상태(`entryStatus`)는 confidence 와 상관없이 날짜만으로 '접수 예정/접수 중/마감' 을 보이고, 상세 화면에서 confirmed 가 아니면 ", 일정 예상" 을 붙인다(`src/components/RaceDetail.tsx:204`). 이미 DB 에 opens 가 오늘보다 앞인 expected 행이 211개 있다(지금도 쓰는 방식).
- `entry_type` 값: `fcfs` 선착순 · `lottery` 추첨 · `open` 상시 접수 · `qualifying` 기록 기준 · `tour_only` 여행사 전용.
- 동시에 도는 다른 작업: 한국 대회 추가 검수(kr-predict FIX, 커밋 `검수: kr-predict …`)가 DB 를 바꾸고 있고, 지도 코드 작업이 `PLAN.md`·`src/` 를 쓰고 있다. → 4-6 의 '스냅샷 바로 뒤 배치' 규칙이 중요.
- `.duo-data/` 는 `.gitignore` 대상(배치·보고서 커밋 안 됨). 커밋되는 것은 `public/data.json` 하나뿐.
- upsert: `python3 ~/Documents/.tools/upsert.py race <파일>` — 같은 id 행을 **배치의 값으로 통째로** 덮는다(그래서 배치는 반드시 최신 data.json 행 전체를 복사해 만든다).

## 3. 파일 · 담당

```
.duo-data/entry-predict/
  common/predict.py      날짜 계산 라이브러리        (파트 A 소유)
  common/check.py        대상 뽑기·배치 검사·DB 대조  (파트 A 소유)
  common/make_batch.py   수정 목록 → 통째 행 배치     (파트 A 소유)
  common/merge.py        합본 보고서 생성기           (파트 B 소유)
  a/  파트 A 전용: targets.tsv · edits-NN.json · a-NN.json · report.md · raw/ · 작업 스크립트
  b/  파트 B 전용: targets.tsv · edits-NN.json · b-NN.json · report.md · raw/ · 작업 스크립트 · (필요할 때만) _tools/
.duo-data/entry-predict-report.md   합본 — merge.py 로만 만든다(손으로 고치지 않음)
public/data.json                    스냅샷 결과 — 공용 생성물, 손으로 고치지 않음
```
- 내려받은 HTML·JSON 은 `<p>/raw/` 에만, 그것을 읽는 python 은 `-I`.
- `<p>-NN.json` 이름은 **실제로 upsert 한 배치에만**(초안은 `<p>-NN.draft.json`).

## 4. 공통 인터페이스 (두 파트가 이 약속만 믿고 따로 일한다)

### 4-1. 대상 뽑기 — `check.py targets <a|b>` → `<p>/targets.tsv`
- 기준 데이터: **막 뜬** `public/data.json`. '오늘' = 실행하는 날 한국 날짜(`datetime.now(ZoneInfo('Asia/Seoul')).date()`, 2026-11-08 로 박지 않음).
- 파트: `country_code in ('KR','JP')` → a, 나머지 → b.
- 대상 = 다음 중 하나라도 맞는 행:
  - **E (접수 비어 있음)**: `entry_opens is null` 이고 `race_date >= 오늘`.
  - **P (지난 대회)**: `race_date < 오늘`(opens 유무와 상관없이).
- 열: `kind(E|P)	id	name_ko	country_code	race_date	date_confidence	entry_type	entry_opens	entry_closes	entry_confidence	official_url	source_url`.
- BUILD 가 늦게 돌면 그 사이 지난 대회가 P 로 더 들어온다(정상). 두 번째 뽑기부터는 이미 처리한 id 는 보고서에 있으니 새로 생긴 것만 더 한다.

### 4-2. 접수 일정 예상 (E, 그리고 P 를 옮긴 뒤의 접수)
1. **다음 회차 접수일이 공식에 이미 나와 있으면** → 그 값, `entry_confidence='confirmed'`(공식 페이지·주최가 쓰는 접수 대행 페이지에서 본 것만. 출처 집계 사이트에서만 봤으면 `expected`, 꼬리말 없음).
2. 아니면 **직전 회차**(= 대상 회차 바로 앞에 실제로 열린 회차)의 **실제 접수 시작일 `prev_opens`·마감일 `prev_closes`·대회일 `prev_race`** 를 찾는다. 찾는 곳(빨리 포기 금지, 아래 순서로 끝까지):
   - 공통: 공식 사이트의 지난 공지·요강 PDF·FAQ, 공식 SNS(인스타·페이스북·X) 게시글, **web.archive.org 의 공식 페이지 지난 사본**, 기사.
   - 한국: 러너블·스포츠위크·러닝위키(runningwikii.com)·마라톤온라인(marathon.pe.kr/roadrun.co.kr)·전마협 API(`user-api.mara1080.com/api/v1/public/event/<id>`)·굿러너(goodrunner.co.kr) API·주최 네이버 카페 공지·지자체/체육회 공지.
   - 일본: RUNNET(runnet.jp)·スポーツエントリー·moshicom·大会公式の過去の募集要項.
   - 그 밖: RunSignup·Active.com·UltraSignup·Ahotu·Race Roster·ITRA/UTMB·각국 등록 대행·공식 'Key dates'.
3. 예상 계산 (`predict.py`, 방법 `method` 셋 중 하나):
   - **`offset`**(기본): `new_opens = new_race + (prev_opens − prev_race)`, `new_closes = new_race + (prev_closes − prev_race)`. 대회일이 같은 요일로 옮겨지므로 접수 요일도 그대로 유지된다.
   - **`weekday`**: 직전 회차 공지가 '○월 첫째 월요일 접수'처럼 요일로 정한 방식이거나, 대회는 날짜 고정인데 접수는 요일 고정일 때 → `prev_opens`·`prev_closes` 각각 `predict_weekday(d, years)` (같은 달·같은 주차·같은 요일, years 해 뒤. 다섯째 주가 없으면 그 달 마지막 같은 요일).
   - **`same_md`**: 공식이 '매년 M월 D일 접수 시작' 이거나 직전 두 회차가 같은 월·일 → 연도만 더함(2/29 → 2/28).
   - `years` = 새 대회일 연도 − 직전 대회일 연도(대개 1).
   - `prev_closes` 를 못 찾았으면(선착순 마감일 없음 등) `new_closes = null`. `prev_opens` 를 못 찾으면 예상하지 않는다(4-2-5).
4. 넣는 값: `entry_opens`·`entry_closes` = 계산값, `entry_confidence='expected'`, `entry_type` = 직전 회차 방식(`fcfs`·`lottery`·`open`·`qualifying` — 직전 회차에서 본 것. 지금 값과 다르면 바꾸고 report 에 '방식 바뀜'), `last_verified` = 확인한 날.
   `notes_ko` 끝에 꼬리말(앞 문장과 공백 한 칸):
   - `접수 일정은 YYYY 회차(접수 M/D~M/D) 기준 예상.` — YYYY = 직전 회차 **대회일의 연도**, M/D = `prev_opens`·`prev_closes`(앞 0 없음).
   - 직전 접수 시작이 대회 전해면 그 날짜만 연도를 붙인다: `(접수 2025/12/3~4/3)`.
   - 마감일 없음: `(접수 M/D~)`.
   - notes 에 이미 `접수 일정은` 과 (`기준 예상` 또는 `기준 추정`) 이 둘 다 있으면 덧붙이지 않는다(중복 금지). notes 가 null 이면 꼬리말만.
   - notes 에 **접수 일정이 아직 없다는 문장**(2장 목록: `접수 일정은 아직 발표 전.` 등)이 있으면, 그 문장 **하나만** 빼고 꼬리말을 끝에 붙인다(그대로 두면 '발표 전' 과 예상이 나란히 남음). 그 문장에 다른 정보도 들어 있으면(`참가비와 접수 일정은 확인하지 못했다.` 처럼) 빼지 말고 그냥 꼬리말만 붙인다. 뺀 문장은 report 채움 표 '비고'에.
   - notes 의 다른 글자는 바꾸지 않는다(머리말·꼬리말·위 문장 하나 빼기·`[취소]` 떼기 말고는 그대로).
   - `entry_type='open'`(상시 접수)도 대상이다(상시 접수라도 접수 시작일은 있다). 직전 회차에도 시작일이 없던 상시 접수면 '못 찾음'이 아니라 `## 건너뜀`(이유 '직전 회차도 시작일 없음' + URL). 두 파트 공통.
5. **못 찾음**: opens·closes·confidence 그대로(`tbc` 유지), 배치에 넣지 않는다. report `## 못 찾음` 에 id·대회명·**확인한 곳 URL 전부**(최소 3곳: 공식·접수 대행·검색/아카이브).
6. **건너뜀**(배치에 넣지 않음, report `## 건너뜀` 에 이유):
   - `entry_type='tour_only'`(개인 접수 창구 없음).
   - `entry_confidence='confirmed'` 인데 opens 만 빈 행(**closes 는 있음**, 마감일만 확인됨 등 — 92행): 공식에서 **다음 회차 opens 를 confirmed 로 찾았을 때만** opens 한 칸을 채우고 confidence 는 그대로 `confirmed`(basis.method `official`). 못 찾으면 그대로 두고 건너뜀(예상으로 confirmed 를 끌어내리지 않음).
   - 단 `confirmed` 인데 **opens·closes 둘 다 빈 행**(8행, 2장)은 지킬 확정 값이 없으므로 보통 E 처럼 예상해 넣고 `expected` 로 바꾼다(report 비고 '빈 confirmed'). check.py 도 이 경우는 confirmed 보호에서 뺀다(4-6).
   - opens 는 비었는데 closes 가 `expected`/`tbc` 로 있는 행: 위 규칙대로 opens·closes 를 함께 계산해 넣는다(closes 는 confirmed 가 아닐 때만 덮음).
7. **계산한 예상 opens 가 오늘보다 앞**이면(직전 방식대로라면 다음 회차 접수가 이미 열렸어야 함): 먼저 공식에서 **지금 회차 접수 공지**를 꼭 다시 찾는다 → 찾으면 그 값(confirmed). 끝내 없으면 계산값을 예상으로 넣고(지금 DB 의 211행과 같은 방식) report `## 예상 접수일이 이미 지남` 에 id·계산값·확인한 곳을 적는다.
8. 범위 검사: `entry_opens ≤ entry_closes ≤ race_date`(closes null 이면 앞 둘만). 계산값이 어긋나면(대회일이 크게 바뀐 회차 등) 넣지 말고 `## 판단 필요`.

### 4-3. 지난 대회 다음 회차 (P)
1. 다음 회차 날짜가 공식에 나와 있으면 → `race_date` = 그 날짜, `date_confidence='confirmed'`(출처 집계에서만 봤으면 `expected`, 머리말 없음).
2. 아니고 **매년 열리는 대회**(직전 두 회차가 열린 근거, 또는 '제N회'(N≥3) + 직전 해 회차 근거) →
   `race_date = predict_weekday(old_race, 1)`(같은 달·같은 주차·같은 요일, 다음 해), `date_confidence='expected'`,
   `notes_ko` 맨 앞에 `YYYY년 M월 D일 개최 기준 예상 일정. `(= 옛 race_date, 앞 0 없음).
   - 예외: 이름에 날짜가 박힌 대회(3·1절·광복절·성탄·새해 첫날 등)이고 직전 두 회차가 같은 월·일 → 다음 해 같은 월·일, 머리말 뒤에 `(매년 M월 D일 고정)`.
   - 예상 race_date 는 오늘보다 뒤여야 한다(11월 초 대회 → 다음 해 11월).
3. notes 가 `[취소]`·`[중단]`(앞 공백 무시)으로 시작하면 그 표시를 떼고 옮긴다. 단 '중단'이 확실한(주최가 폐지·무기한 중단을 알림) 대회는 옮기지 않는다(4-3-5).
4. 옮긴 뒤 접수는 4-2 로: 이 행의 옛 entry_opens/closes 가 `confirmed` 이고 근거 페이지에서 다시 확인되면 그것이 `prev_opens/prev_closes`(prev_race = 옛 race_date). 옛 값이 `expected`·`tbc` 면 실제 값을 새로 찾는다. 못 찾으면 entry 는 `null`/`null`/`tbc` 로 비운다(옛 회차 날짜를 남겨 두면 '마감'으로 보이므로).
   옮긴 행의 `sold_out_on` 은 옛 회차 값이라 `null` 로(지금 해당 1행, report 에 옛 값 기록). `entry_fee`·거리 등 다른 칸은 그대로.
5. **그대로 둠**(배치에 넣지 않음, report `## 그대로 둔 지난 대회` 에 이유·근거 URL): 1회성(이벤트·기념 대회)·'제1회'이고 다음 소식 없음·주최가 중단 발표·매년 근거를 끝내 못 찾음.
6. 기존 머리말이 이미 있는 행을 다시 옮길 때(예상 날짜도 지난 경우): 머리말의 날짜를 새 기준(옛 race_date)으로 **바꾼다**(머리말 두 개 금지).

### 4-4. 수정 목록 `<p>/edits-NN.json` (사람이 쓰는 파일, 50개 이하)
```json
[{
  "id": "untangodo-skyrace-trail",
  "kind": "E",                      // E | P
  "set": {                          // 바꿀 칸만. 허용 칸: race_date date_confidence entry_type entry_opens entry_closes entry_confidence notes_ko last_verified sold_out_on(P 만, null 로만)
    "entry_opens": "2027-03-02", "entry_closes": "2027-05-20", "entry_confidence": "expected",
    "entry_type": "fcfs", "last_verified": "2026-11-09",
    "notes_ko": "… 접수 일정은 2026 회차(접수 3/3~5/21) 기준 예상."
  },
  "basis": {                        // 접수 근거. 예상이면 prev_* 필수, official 이면 url·note 만
    "method": "offset",             // offset | weekday | same_md | official(다음 회차 공식 값) | none(P 만: 접수 못 찾아 null/null/tbc 로 비움, url 대신 report 못 찾음에 확인한 곳)
    "prev_race": "2026-06-13", "prev_opens": "2026-03-03", "prev_closes": "2026-05-21",
    "url": "https://…",             // 직전 회차 접수일을 본 주소(none 말고는 필수)
    "note": "직전 회차 요강 PDF 2쪽"
  },
  "date_basis": {                   // P 만 필수: 다음 회차 대회일 근거
    "method": "weekday",            // weekday(같은 달·주차·요일) | fixed_md(매년 M월 D일 고정) | official(다음 회차 공식 발표)
    "old_race": "2026-06-13",       // 옮기기 전 race_date
    "url": "https://…",             // 매년 열린 근거(직전 두 회차) 또는 다음 회차 공식 발표를 본 주소
    "note": "2025·2026 회차 공지"
  }
}]
```
(위 날짜는 형식 예시일 뿐이다 — 실제 값은 근거에서 찾는다. JSON 에는 `//` 주석을 쓰지 않는다 — 여기 주석은 설명용.)

### 4-5. 도구 사용법 (모든 명령의 마지막 줄 형식이 정해져 있다)
| 명령 | 하는 일 | 마지막 줄 |
|---|---|---|
| `python3 -I common/check.py targets <a\|b>` | 4-1 → `<p>/targets.tsv` | `대상 E n · P n` |
| `python3 -I common/make_batch.py <p>/edits-NN.json <p>/<p>-NN.json` | **최신 `public/data.json`** 의 같은 id 행 28칸을 통째로 복사 → `set` 만 덮어씀 → 배치. id 가 data.json 에 없으면 실패 | `행 n개 → <출력 경로>` |
| `python3 -I common/check.py <a\|b> <p>/edits-NN.json <p>/<p>-NN.json` | 배치 검사(4-6) | `문제 있는 줄 0 / N` |
| `python3 -I common/check.py <a\|b> --db` | 그 파트가 올린 배치 전부가 data.json 과 같은지(차이 칸 목록) | `DB 차이 0 / N` |
| `python3 -I common/check.py <a\|b> --left` | 그 파트 대상 중 아직 opens 빈 행·지난 행 수와, report 의 못 찾음·건너뜀·그대로 둠 id 와 맞춰 **어디에도 없는 id** 목록 | `남은 미처리 0` |
| `python3 -I common/merge.py [출력 경로]` | 두 report.md → 합본(4-8) | `합본 → <경로>` |

- `predict.py` 함수(두 파트가 같이 씀, check.py·make_batch.py 가 import):
  `predict_weekday(d: date, years=1) -> date` · `shift_entry(method, prev_race, prev_opens, prev_closes, new_race) -> (opens, closes|None)` · `entry_tail(prev_race, prev_opens, prev_closes) -> str` · `date_head(old_race) -> str` · `strip_cancel(notes) -> str`.
- `predict_weekday` 는 앞 작업(kr-predict)의 `predict(d)` 와 같은 규칙:
  ```python
  def predict_weekday(d, years=1):  # 같은 달·같은 주차·같은 요일. 다섯째 주가 없으면 그 달 마지막 같은 요일
      y = d.year + years; n = (d.day - 1) // 7 + 1
      days = [date(y, d.month, x) for x in range(1, monthrange(y, d.month)[1] + 1) if date(y, d.month, x).weekday() == d.weekday()]
      return days[n - 1] if n <= len(days) else days[-1]
  ```
  시험값(check.py 시험에 넣음): 2026-10-18→2027-10-17 · 2026-03-22→2027-03-28 · 2026-05-09→2027-05-08 · 2026-06-13→2027-06-12 · 2026-09-12→2027-09-11 · 2026-05-31→2027-05-30.

### 4-6. 배치 검사 내용 (`check.py <p> <edits> <batch>`)
- 배치 50행 이하, 키 28개 = data.json 첫 행 키, id 마다 data.json 행이 있고 **`set` 에 없는 칸은 data.json 값과 같음**(배치를 만든 뒤 DB 가 바뀌었으면 여기서 걸림 → 다시 스냅샷·make_batch).
- 파트 범위(country_code), 다른 배치(`.duo-data/entry-predict/[ab]/[ab]-*.json`)와 id 중복 없음(같은 행을 두 번 고치려면 이전 배치를 고친 게 아니라 새 배치로, report 에 이유).
- `set` 의 칸이 허용 칸(4-4)뿐, `sold_out_on` 은 P 에서 null 로만.
- **confirmed 보호**(E 행): data.json 에서 `entry_confidence='confirmed'` 인 행의 **값이 있는** opens·closes 를 바꾸거나 지우면 문제, confidence 를 낮추면 문제. 빈 opens 를 채우는 것은 `basis.method='official'` 이고 confidence 가 `confirmed` 그대로일 때만 통과. 예외: opens·closes 둘 다 빈 confirmed 행(4-2-6)은 예상으로 채워도 됨. `date_confidence='confirmed'` 이고 `race_date ≥ 오늘`인 행의 race_date 를 바꾸면 문제. (P 의 옛 회차 confirmed 값은 지난 회차 값이라 바꿔도 됨.)
- `basis.method ∈ offset·weekday·same_md` 이면: `shift_entry` 로 다시 계산한 값 = 배치 opens/closes, `entry_confidence='expected'`, notes 끝 꼬리말 = `entry_tail(...)`(중복 꼬리말 없음), `basis.url` 이 http(s).
- `method = official` 이면 confidence `confirmed`(또는 집계 출처라 `expected`)이고 꼬리말 없음. `method = none` 은 P 에서만, opens·closes null·`tbc`·꼬리말 없음.
- **notes 검사**: 새 notes 에서 머리말·꼬리말을 떼면 옛 notes(머리말·`[취소]`/`[중단]` 뗀 것)와 같거나, 거기서 4-2-4 의 '접수 일정 아직 없음' 문장 하나만 빠진 것이어야 한다(그 밖의 글자 변경은 문제).
- E 이고 옛 notes 에 머리말(`YYYY년 M월 D일 개최 기준 예상 일정.`)이 있으면 `basis.prev_race` 가 그 날짜와 같아야 한다(다르면 문제 — 다른 회차를 본 것).
- P 이면: `date_basis` 가 있고 `old_race` = data.json 의 race_date, 새 race_date > 오늘, `date_basis.method='weekday'` 면 `race_date = predict_weekday(old_race)`·`fixed_md` 면 다음 해 같은 월·일(머리말 뒤 `(매년 M월 D일 고정)`)이고 둘 다 `date_confidence='expected'`·notes 가 `date_head(old_race)` 로 시작, `official` 이면 `date_confidence='confirmed'`(집계 출처면 `expected`)·머리말 없음. `[취소]`·`[중단]` 이 남아 있지 않음, 머리말 한 번만. P 의 접수 예상(offset·weekday·same_md)은 `basis.prev_race = old_race`(직전 회차가 바로 옮기기 전 회차).
- 날짜 형식 `YYYY-MM-DD`, `opens ≤ closes ≤ race_date`, confidence ∈ `confirmed·expected·tbc`, entry_type ∈ 다섯 값.
- 오늘보다 앞인 예상 opens → 문제는 아니고 `알림: 예상 opens 지남 <id>` 로 알려 줌(report 4-2-7 와 맞는지 보라고).

### 4-7. 반영 순서 (배치 하나마다, 사이에 다른 일 끼우지 않음)
1. 스냅샷: `VITE_SUPABASE_URL=https://zhwmfvkwtmakieatlqtz.supabase.co VITE_SUPABASE_ANON_KEY=sb_publishable_uOBwP5-BbK7keBuq3gsMAg_Oil1yg6O node scripts/snapshot.mjs`
2. `make_batch.py` → `check.py <p> edits batch` 가 `문제 있는 줄 0 / N`
3. `python3 ~/Documents/.tools/upsert.py race <p>/<p>-NN.json` → **실패 0**(실패하면 고쳐서 그 파일 다시)
4. 스냅샷 → `check.py <p> --db` 가 `DB 차이 0 / N`
5. 커밋: `git add public/data.json && git commit -m "접수 예상: <a|b> n행 (접수 예상 n·공식 n·다음 회차 n, entry-predict <p>-NN)" -- public/data.json` → `git show --stat HEAD` 가 `public/data.json` 하나인지. 검수 커밋은 `검수: entry-predict <a|b> …`. `index.lock` 이면 잠시 뒤 다시.
   - 다른 작업이 바꾼 DB 행도 스냅샷에 같이 들어온다 → 되돌리지 않고 같이 커밋(report 에 '다른 작업 변경 포함').
   - `generated_at` 만 바뀌었으면 커밋하지 않고 `git checkout -- public/data.json`.
- 1→3 은 몇 분 안에. 배치가 통째 행이라 오래된 스냅샷으로 만들면 다른 작업의 수정을 되돌린다(2 의 검사가 막지만, 막히면 1부터 다시).

### 4-8. 보고서
- `<p>/report.md`:
  - **1행** `출처: <끝까지 본 곳과 건수>` (예: 공식 n · RUNNET n · 러너블 n · 아카이브 n · 기사 n).
  - **2행** `대상 E n · P n → 채움 n(예상 n·공식 n) · 다음 회차 n · 못 찾음 n · 건너뜀 n · 그대로 둔 지난 대회 n`.
  - **3행** `기준 커밋: <hash>` — 첫 배치 전 `git rev-parse --short HEAD`(FIX 의 confirmed 덮기 비교 기준).
  - `## 채움` 표: `| 배치 | 종류(E/P) | id | 대회명 | race_date(전→후) | 직전 대회일 | 직전 접수 | 간격(일, opens/closes) | 방법 | 새 접수 | entry_type | confidence | 근거 URL | 비고 |`
  - `## 못 찾음` · `## 건너뜀` · `## 그대로 둔 지난 대회` 는 **표, 첫 칸이 id**(`| id | 대회명 | 이유 | 확인한 곳 URL |`) — `check.py --left` 가 이 세 절 표의 첫 칸과 올린 배치의 id 를 모아 대상과 맞춘다. P 를 옮겼지만 접수를 못 찾아 비운 행(method `none`)은 배치에도 있고 `## 못 찾음` 에도 적는다.
  - 그 밖: `## 예상 접수일이 이미 지남` · `## 방식 바뀜` · `## 판단 필요` · `## 도구 시험`(A) · `## 검수`(FIX 가 씀) · `## 다른 파트 메모`.
- 합본 `.duo-data/entry-predict-report.md` = `merge.py` 출력: 첫 줄 `# 접수 일정 예상 — 채움 N행 (A n · B n) · 다음 회차 n · 못 찾음 n`, 그 아래 data.json 기준 `entry_opens 빈 행: 시작 817 → 지금 n (KR n · JP n · 그 밖 n)`·`race_date 가 지난 행: n`, 그 뒤 두 report.md 원문. report.md 가 없는 파트는 `(파트 X 아직 없음)`.

---

## 5. 파트 A — 한국 + 일본 (대상 약 405~425행: KR E 223 · JP E 25 · KR P 155)

### 담당 파일 (이 파일만 만들고 고친다)
- `.duo-data/entry-predict/common/predict.py` · `common/check.py` · `common/make_batch.py` (만든다)
- `.duo-data/entry-predict/a/**`
- `public/data.json` — A 배치 반영 후 스냅샷·커밋만(공용 생성물)

### 할 일
1. **도구 먼저**: predict.py → make_batch.py → check.py(4-5·4-6). 시험(시험 파일은 지움, 결과는 `a/report.md ## 도구 시험` 에 한 줄씩): 4-5 시험값 6개 / 정상 E 행 통과 / 간격 하루 틀림 · 꼬리말 날짜 틀림 · 꼬리말 두 번 · confirmed opens 덮기 · 허용 밖 칸(예 `entry_fee`) 바꿈 · set 밖 칸이 data.json 과 다름 · P 머리말 날짜 틀림 · P `[취소]` 남음 · P 에 `date_basis` 없음 · notes 다른 글자 바뀜 · E 머리말 날짜 ≠ prev_race · 파트 밖 나라 → 전부 잡힘 / '빈 confirmed' 행 예상 채움 · '아직 발표 전' 문장 하나 빼고 꼬리말 · P method `none` → 통과.
2. `check.py targets a` → 대상 표.
3. **P(한국 지난 대회 155행, 11-09 이후면 KR·JP 당일 대회 26행 더) 먼저**: 다음 회차 발표 확인(공식·마라톤온라인 2027 일정·전마협 API `year=2027`) → 매년 판단(4-3-2) → 옮기기 → 접수(4-2). 지난 회차 접수가 confirmed 인 8행은 근거 페이지 다시 열어 확인만, **expected 인 145행은 2026 회차 실제 접수일을 새로 찾는다**.
4. **E(한국 223행)**: 굿러너 자체 대회(운탄고도·동해·춘천·릴레이 등 — 굿러너 API `.duo-data/goodrunner2/tools/scan-api.py` 참고, 읽기만)부터. 접수 대행(러너블·스포츠위크)·마라톤온라인 2026 글의 '접수기간'.
5. **E(일본 25행)**: RUNNET 대회 페이지의 前回 募集期間, 공식 過去の大会情報.
6. 50행씩 배치(4-7), 끝날 때마다 `a/report.md`·`merge.py`(있으면).
7. 마지막에 `check.py a --left` 가 `남은 미처리 0`.

### 완료 기준 (A)
- 도구 시험 전부 통과(보고서에 결과).
- 올린 배치 전부 `문제 있는 줄 0 / N`, upsert 실패 0, `check.py a --db` → `DB 차이 0 / N`, `check.py a --left` → `남은 미처리 0`.
- 채운 행마다 근거 URL·직전 접수일·간격이 report 표에. 못 찾음은 확인한 곳 3곳 이상.
- A 대상 중 `race_date < 오늘` 인 행은 '다음 회차로 옮김' 또는 '그대로 둔 지난 대회(이유)' 둘 중 하나.
- `public/data.json` 커밋(`git show --stat HEAD` = 그 파일 하나).

## 6. 파트 B — 그 밖의 해외 (대상 약 573행: E 562 · P 5~22)

### 담당 파일 (이 파일만 만들고 고친다)
- `.duo-data/entry-predict/common/merge.py` (만든다)
- `.duo-data/entry-predict/b/**` (필요할 때만 `b/_tools/`)
- `.duo-data/entry-predict-report.md` (merge.py 출력)
- `public/data.json` — B 배치 반영 후 스냅샷·커밋만(공용 생성물)

### 할 일
1. **merge.py**(4-8): a·b report.md 중 없는 것은 `(파트 X 아직 없음)` 으로 두고 돌아가야 한다. 인자로 출력 경로를 주면 그곳에 씀 → 시험 경로로 한 번 돌려 확인 후 지움.
2. `common/check.py`·`make_batch.py`·`predict.py` 가 **아직 없으면**: 4-5·4-6 그대로 `b/_tools/` 에 같은 사용법·같은 마지막 줄로 만들어 쓴다(B 소유). 나중에 common 이 생기면 B 의 FIX 가 B 배치 전부를 `common/check.py b …` 로 다시 돌려 `문제 있는 줄 0` 확인(결과가 다르면 `## 다른 파트 메모`). common 이 있으면 B 는 common 만 쓴다. **B 는 common 의 A 파일을 고치지 않는다.**
3. `check.py targets b` → 대상 표. 나라별로 묶어 처리(US 84 · FR 28 · CN 28 · AU 26 · GB 26 · NZ 25 · DE 23 · IN 20 · IT 19 · ES 17 …).
4. 미국·캐나다는 RunSignup/Active 의 'Registration opens'·가격 단계, 아카이브 사본. 유럽은 공식 'Inscriptions/Anmeldung' 지난 공지·아카이브. 중국은 공식 공众号 기사·마라톤 협회 일정(报名时间). 트레일은 UTMB/ITRA·UltraSignup.
5. `entry_type='open'`(B 206행)이 많다 — 4-2-4 의 상시 접수 규칙대로(직전 회차도 시작일 없음 → `## 건너뜀`).
6. P(5~22행): 4-3 그대로.
7. 50행씩 배치(4-7), 끝날 때마다 `b/report.md` → `merge.py`. 마지막에 `check.py b --left` → `남은 미처리 0`, merge.py 다시.

### 완료 기준 (B)
- merge.py 가 report 하나뿐일 때·둘 다 있을 때 모두 돌아감.
- 올린 배치 전부 `문제 있는 줄 0 / N`, upsert 실패 0, `check.py b --db` → `DB 차이 0 / N`, `check.py b --left` → `남은 미처리 0`.
- 채운 행마다 근거 URL·직전 접수일·간격이 report 표에. 못 찾음은 확인한 곳 3곳 이상.
- `.duo-data/entry-predict-report.md` 가 merge.py 로 만들어졌고 숫자가 두 report 표·data.json 과 맞음.
- `public/data.json` 커밋(그 파일 하나).

---

## 7. 확인 방법
```bash
cd ~/Documents/runworld
VITE_SUPABASE_URL=https://zhwmfvkwtmakieatlqtz.supabase.co VITE_SUPABASE_ANON_KEY=sb_publishable_uOBwP5-BbK7keBuq3gsMAg_Oil1yg6O node scripts/snapshot.mjs
D=.duo-data/entry-predict
python3 -I $D/common/check.py targets a                                   # '대상 E n · P n'
python3 -I $D/common/check.py a $D/a/edits-01.json $D/a/a-01.json          # '문제 있는 줄 0 / N'
python3 ~/Documents/.tools/upsert.py race $D/a/a-01.json                    # 실패 0
python3 -I $D/common/check.py a --db                                        # 'DB 차이 0 / N'
python3 -I $D/common/check.py a --left                                      # '남은 미처리 0'
python3 -I $D/common/check.py b --db ; python3 -I $D/common/check.py b --left
python3 -I $D/common/merge.py                                               # 합본 다시 만들기
node -e 'const d=require("./public/data.json");const t=new Date(Date.now()+9*36e5).toISOString().slice(0,10);const r=d.races;console.log("opens 빈 행",r.filter(x=>!x.entry_opens).length,"지난",r.filter(x=>x.race_date<t).length)'
npm run build                                                               # 새 데이터로 사전 렌더 통과 (코드 수정 없음, 실패하면 고치지 말고 보고)
git show --stat HEAD                                                        # public/data.json 하나
```
- `npm run build` 는 다른 빌드(지도 코드 작업 등)가 돌고 있으면 끝난 뒤에(`dist/` 충돌). 두 파트가 동시에 돌리지 않는다.

### FIX(검수) 단계에서 할 것 (지정된 파트만)
- **바꾼 행의 30% 이상 무작위**(`random.seed(<오늘 날짜 YYYYMMDD 숫자>)`, 고른 id 를 report 에) + **confidence 를 `confirmed` 로 넣은 행 전부** + **P 로 옮긴 행 전부의 날짜 계산** → `basis.url` 을 다시 열어 직전 대회일·직전 접수 시작/마감일이 맞는지, 간격 계산(달력으로 손 계산 몇 개 report 에)·entry_type 이 맞는지.
- **confirmed 덮기 재확인**: report 3행 `기준 커밋`(`git show <기준 커밋>:public/data.json`)과 지금 data.json 을 비교해, **그 파트 배치에 든 id** 중 예전 `confirmed` 값(값이 있는 opens·closes)이 바뀌었거나 confidence 가 낮아진 칸이 0 인지(P 의 옛 회차 값·4-2-6 의 '빈 confirmed' 제외). 다른 작업이 바꾼 행은 비교에서 뺀다.
- '못 찾음' 무작위 5개 이상 다시 찾아보기(빨리 포기했는지). 찾으면 새 배치 `<p>-fixNN.json`(edits 도 `edits-fixNN.json`) → 4-7 순서로 반영.
- 틀린 값은 근거대로 고친 배치로 다시 반영(삭제 금지). 근거가 끝내 확인 안 되면 그 행을 예상 전 값(opens/closes null, `tbc`, 꼬리말 제거)으로 되돌리는 배치 + report.
- 결과는 그 파트 `report.md ## 검수` → merge.py 다시.

## 8. 두 파트 사이 맞물림
- 만나는 곳: `common/*`(A: predict·check·make_batch, B: merge)·`public/data.json`(공용 생성물)·서로의 배치(id 중복 검사). 4장 규칙을 바꿔야 하면 혼자 바꾸지 말고 `## 다른 파트 메모` + `## 판단 필요`.
- 나라로 나뉘므로 같은 행을 두 파트가 만질 일은 없다. 행의 country_code 가 틀려 보이면 고치지 말고 `## 판단 필요`.
- 두 파트가 동시에 일하면 서로 커밋이 끼어든다 → 4-7 을 배치마다 처음(스냅샷)부터.
- merge.py 는 실행만이면 어느 파트·어느 단계든 돌려도 된다. 마지막에 끝나는 단계가 merge.py 를 돌려 합본을 최신으로. merge.py 가 없을 때 A 가 끝나면 'merge.py 대기' 라고 보고에 적는다.
- 담당 파일이 겹치지 않는다: A = `common/predict.py`·`common/check.py`·`common/make_batch.py`·`a/**`, B = `common/merge.py`·`b/**`·`entry-predict-report.md`. `public/data.json` 은 스냅샷으로만 바뀐다. 이 밖의 파일(특히 `PLAN.md`·`PLAN-data.md`·`src/`)은 어느 파트도 고치지 않는다.

## 9. 판단 필요 (PLAN 때 본 것 — 기본값대로 진행하고 사용자에게 알림)
- **예상 접수일이 이미 지난 경우**(4-2-7): 기본값은 '계산값을 예상으로 넣음'(지금 DB 의 211행과 같은 방식). 화면에는 '접수 중'·'마감'으로 보일 수 있다 — 싫으면 비워 두는 쪽으로 바꿀 수 있게 report 에 따로 모은다.
- **P 로 옮긴 행의 `sold_out_on`**: 옛 회차 값이라 null 로 비운다(지금 1행). 브리프의 '다른 칸 유지'와 부딪히는 유일한 칸이라 report 에 옛 값을 남긴다.
- **`entry_confidence='confirmed'` 인데 opens 만 빈 행**(closes 있음 92행: A 24 · B 68): 예상으로 confidence 를 낮추지 않으려고 공식 opens 를 찾았을 때만 채운다(4-2-6). opens·closes **둘 다 빈** confirmed 8행은 지킬 값이 없으니 예상으로 채운다.
- **'접수 일정은 아직 발표 전.' 같은 문장**: 예상 꼬리말과 나란히 두면 어색해서, 그 문장만 있는 경우 빼고 꼬리말로 바꾼다(4-2-4). 다른 정보가 섞인 문장은 그대로.
- 브리프 숫자(816·224·161)와 지금 숫자(817·225·160)가 1씩 다르다 — 그 사이 다른 작업이 바꾼 것. BUILD 때 다시 뽑은 targets.tsv 가 기준.

## 다른 파트 메모
(FIX 단계에서 다른 파트 담당 파일 문제를 찾으면 그 단계 파트의 report.md `## 다른 파트 메모` 에 적는다 — 파일·줄·증상·고칠 방법)
