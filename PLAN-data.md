# PLAN — 한국 대회 대폭 추가 (2026 회차 포함, 다음 회차 '예상')

이전 계획은 `PLAN-old.md` (바로 전 PLAN(주·도 지도)을 맨 앞에 붙여 보관). 작성 2026-11-08.

- **데이터 작업만.** 코드·UI·스키마(`supabase/`)·`package.json` 변경 금지, 대회 삭제 금지, `git push`·`git add -A`·`git commit -a` 금지.
- **파트 A = 2026년 1~6월에 열린 대회**, **파트 B = 2026년 7~12월에 열린(열릴) 대회**. 기준은 '2026 회차가 열린 달'(3-2).
- 검수(FIX)는 'FIX 파트 X' 로 지정된 파트의 파일만 고친다. 다른 파트 문제는 그 파트 `report.md` 가 아니라 **자기 report.md 의 `## 다른 파트 메모`** 에만 적는다.

---

## 1. 목표

1. 한국 대회를 **지금 360개 → 600개에 최대한 가깝게**(새로 약 240개, 파트당 목표 120개). 단, **직전 회차가 실제로 열린 근거(URL)가 있는 대회만**. 숫자를 채우려고 근거 없는 대회를 넣지 않는다.
2. 올해(2026) 이미 열린 대회도 넣는다 (사용자 결정 2026-11-08):
   - **매년 열리는 대회** → 다음 회차를 **예상**으로 (3-3 '예상').
   - **매년 열리는지 확실하지 않은 대회**(1회성·신생·중단 의심) → 실제 열린 날짜 그대로 '이미 끝난 대회'로 (3-3 '지난').
   - 다음 회차 날짜가 **이미 발표된** 대회 → 지금까지처럼 그 날짜로 (3-3 '발표').
3. 굿러너(goodrunner.co.kr) 자체 대회(릴레이·동해·운탄고도·춘천·다둔 스카이레이스·긍정하프·Light Up 키즈)를 **이번에 반드시 반영**(3-7).
4. 반영 후 `public/data.json` 을 다시 떠서 커밋, 합본 보고서 `.duo-data/kr-predict-report.md`.

## 2. 지금 사실 (PLAN 쓰면서 직접 확인)

- `public/data.json` (generated_at 2026-11-08T00:38Z): races **1,360**, 한국(`country_code='KR'`) **360**. 한국 race_date 는 **전부 2026-11 이후**(2026-11 92 · 12 28 · 2027-01 9 · 02 16 · 03 27 · 04 47 · 05 27 · 06 17 · 07 5 · 08 6 · 09 25 · 10 57 · 11 4) → 2026-01~10 회차는 DB 에 하나도 없다. 이미 있는 2027 행 상당수가 2026 회차를 옮긴 것이므로 **중복 대조가 핵심**(3-4).
- race 행 키 **28개**: `id, name_ko, name_en, city_ko, country_ko, country_code, region, race_date, date_confidence, is_major, entry_type, entry_opens, entry_closes, entry_confidence, entry_fee, entry_fee_currency, distances, field_size, course, flight_hours, official_url, source_url, last_verified, notes_ko, discipline, elevation_gain, sold_out_on, subregion` (한국 360행 `subregion` 전부 null).
- 스키마(`supabase/migrations/0001_init.sql`): `race_date date not null`, `entry_type not null` ∈ `lottery·fcfs·qualifying·tour_only·open`, `date_confidence`·`entry_confidence` ∈ `confirmed·expected·tbc`, `official_url not null`, `distances text[] not null`.
- 브리프 예시 '고구려마라톤'(`goguryeo-seoul`)은 지금 DB 에서 notes 가 "접수 대행(러너블) 페이지에서 2026 고구려마라톤 확인…" 이고 **'개최 기준 예상 일정' 머리말은 아직 아무 행에도 없다**(0행) → 머리말 형식은 3-3 을 기준으로 한다.
- 굿러너 API 전수(`.duo-data/goodrunner2/common/events.tsv`, 2026-11-08): 릴레이마라톤 2026-03-22 · 동해 스카이레이스 2026-05-09~10 · 운탄고도 스카이레이스 2026-06-13~14 · 춘천 스카이레이스 2026-09-12~13(2025: 09-20~21) · 다둔 스카이레이스 2025-11-15~16(2026 회차 없음) · 긍정하프 2026-11-28(DB `seoul-positive-half` 에 있음, official 이 네이버 검색 링크). Light Up 키즈는 API 에 없고 공지의 2025 회차 사진 글만 있음.
- 지난 작업 참고 파일(읽기만): `.duo-data/kr-bulk2/common/roadrun-2026-all.html`(마라톤온라인 2026 일정, 2026-11-07 받음 — **참고용, 다시 받아서 쓴다**), `.duo-data/kr-bulk2.md`·`.duo-data/bulk/kr.md`(이미 본·뺀 대회 목록과 이유), `.duo-data/goodrunner2/common/check.py`(검사기 — 3-5 를 만들 때 복사해서 고쳐 쓴다), `.duo-data/goodrunner2/tools/scan-api.py`.
- 전마협 공개 API: 일정 `https://user-api.mara1080.com/api/v1/public/main-page/block-list?year=<YYYY>&month=<1-12>&type=ALL&filter=ALL`, 상세 `https://user-api.mara1080.com/api/v1/public/event/<id>`.
- 예상 날짜 규칙 시험(python, 3-3 함수): 2026-10-18→2027-10-17(브리프 예와 같음) · 03-22→2027-03-28 · 05-09→2027-05-08 · 06-13→2027-06-12 · 09-12→2027-09-11 · 11-01→2027-11-07 · 05-31(다섯째 일)→2027-05-30(마지막 일) · 08-30→2027-08-29.
- `.duo-data/` 는 `.gitignore` 대상(계획·보고서·배치는 커밋 안 됨, `git add -f` 쓰지 않는다). 커밋되는 것은 `public/data.json` 하나뿐.

## 3. 공통 인터페이스 (두 파트가 이 약속만 믿고 따로 일한다)

### 3-1. 새 대회 레코드 (배치 JSON 배열의 한 항목) — 키 **28개 정확히**

| 필드 | 값 |
|---|---|
| `id` | `[a-z0-9-]{2,40}`, 영문 지명+뜻(`chuncheon-skyrace-trail`). trail 은 **`-trail` 로 끝남**. DB·다른 배치에 있는 id 금지(upsert 는 같은 id 를 덮어쓴다). 같은 대회 봄·가을 두 번이면 `-spring`/`-autumn` |
| `name_ko` / `name_en` | 공식 표기에서 연도·'제N회'·'사전/추가모집' 뺀 것. `name_en` 은 공식 영문, 없으면 로마자+뜻. 빈 문자열 금지 |
| `city_ko` | `'경남 김해'` 처럼 시·도 약칭(서울·부산·대구·인천·광주·대전·울산·세종·경기·강원·충북·충남·전북·전남·경북·경남·제주) + 시·군·구(출발지 기준). 서울·세종 등은 `'서울'`/`'서울 광진'` 둘 다 가능 |
| `country_ko`·`country_code`·`region` | `'대한민국'`·`'KR'`·`'한국'` |
| `race_date` | `YYYY-MM-DD`. 여러 날이면 첫날(+ notes '2일간'). 종류별 규칙은 3-3 |
| `date_confidence` | 3-3 |
| `is_major` / `sold_out_on` / `subregion` | `false` / `null` / `null` |
| `entry_type` | 직전(또는 이번) 회차에서 **본** 방식 `fcfs`·`lottery`·`open`. DB 가 null 을 받지 않으므로 못 봤으면 `fcfs` 로 넣고 report `## 접수 방식 못 봄` 에 id 를 적는다 |
| `entry_opens`/`entry_closes`/`entry_confidence` | 3-3 |
| `entry_fee` / `entry_fee_currency` | **본 금액만**(정수 원, 가장 긴 거리 일반 참가비 + 나머지는 notes), 못 보면 null. 통화 언제나 `'KRW'` |
| `distances` | 본 거리 전부, 긴 순. road `'풀'·'하프'·'<n>km'` / trail `'<n>K'·'<n>M'`. 못 보면 `[]` |
| `field_size` | 적혀 있을 때만(거리별이면 합계 + notes), 아니면 null |
| `course` | `평지`·`완만`·`언덕` — 공식에 분명할 때만, 아니면 null |
| `flight_hours` | DB 같은 `city_ko` 한국 대회 값이 하나면 그 값 → 없으면 같은 시·도 값이 전부 같을 때 그 값 → 아니면 null. **check.py 가 규칙값을 알려 준다** |
| `official_url` | 주최 운영 페이지(대회 사이트·주최 기관/지자체/체육회/육상연맹 공지·mara1080.com 대회 페이지·주최 카페·주최가 쓰는 접수 페이지, **굿러너 자체 대회는 굿러너 대회 페이지** `https://goodrunner.co.kr/race/race.html?id=<N>`). **검색 결과에서 본 주소만**, WebFetch 로 **대회명이 보이는 것** 확인. 출처 사이트(marathon.pe.kr·roadrun.co.kr·runningwikii.com·굿러너의 남의 대회 글) 금지, 도박·성인·도메인 판매 금지. 못 찾으면 `https://search.naver.com/search.naver?query=<대회명 URL 인코딩>`(이때 두 confidence 모두 `confirmed` 불가) |
| `source_url` | 그 대회를 찾은 출처 페이지(마라톤온라인 글·러닝위키 글·전마협 지난 대회 등) |
| `last_verified` | 실제 확인한 날(그 단계 날짜, `YYYY-MM-DD`) |
| `notes_ko` | 본 사실만 짧게 우리 말로. 머리말 규칙은 3-3. 실존 미확인이면 맨 앞에 `[확인필요] ` |
| `discipline` | `'road'` / `'trail'`(스카이레이스·산악·트레일) |
| `elevation_gain` | trail 이고 '누적 상승'·'D+' 를 봤을 때만(정수 m, 가장 긴 거리), 아니면 null |

### 3-2. 파트 나누기 (어느 파트가 넣나)
- **기준 날짜** = 그 대회가 **가장 최근에 실제로 열린(또는 열릴) 2026 회차의 첫날**.
  - 파트 A: 기준 날짜 2026-01-01 ~ 2026-06-30. 파트 B: 2026-07-01 ~ 2026-12-31.
  - 2026 회차가 없고 2025 회차가 마지막인 대회(3-3 '지난' 의 2025 예외)는 2025 회차의 **달**로 나눈다(1~6월 A, 7~12월 B).
- 2026 에 봄·가을 두 번 열린 대회는 회차마다 따로(각자 달의 파트).
- 다른 파트 범위 대회를 찾으면 넣지 말고 `## 다른 파트 메모` 에 이름·날짜·근거 URL 을 적는다(다른 파트는 BUILD 때 그 메모를 읽고 반영).

### 3-3. 세 종류와 규칙 (check.py 가 이 규칙으로 검사)

| 종류 | 언제 | race_date | date_confidence | entry_opens / closes / entry_confidence | notes_ko |
|---|---|---|---|---|---|
| **예상** | 매년 열림(아래 '매년' 기준 충족) + 다음 회차 날짜 미발표 | `predict(기준 날짜)` | `expected` | `null` / `null` / `tbc` | **맨 앞 `2026년 M월 D일 개최 기준 예상 일정. `**(M·D 앞 0 없음, 기준 날짜와 같아야 함). 직전 회차 참가비를 넣었으면 notes 에 `(2026 기준)` (예 `참가비 풀 5만원(2026 기준).`) |
| **지난** | 매년 열리는지 확실하지 않음(1회성·'제1회'·신생·2025 근거 없음·중단 의심) | 실제 열린 2026 날짜 그대로(오늘 2026-11-08 보다 앞) | 공식(주최 공지·결과·기록)에서 봄 → `confirmed`, 출처에서만 → `expected` | 본 2026 접수 기간(없으면 null) / 공식에서 봄 `confirmed`·출처만 `expected`·둘 다 null `tbc` | '예상·추정·예년' 쓰지 않음 |
| **발표** | 다음 회차(2026-11-08 이후 2026 회차, 또는 2027 회차) 날짜가 이미 나옴 | 발표된 날짜 | 공식에서 봄 `confirmed`, 출처만 `expected` | 본 값, 같은 규칙 | '예상·추정·예년' 쓰지 않음 |

- **'매년' 기준**: ① 2026 회차가 실제로 열린 근거 URL + ② 2025 회차가 열린 근거 URL(마라톤온라인 2025 일정·전마협 2025·공식 지난 대회·기록·사진 글·기사). ②가 없어도 2026 공지가 '제N회'(N≥3)이고 직전 회차가 2025 년임이 보이면 충족. 2026 회차가 **취소**됐으면 예상으로 넣지 않는다(보고서 '건너뜀: 2026 취소').
- **`predict(d)`** (check.py 에 그대로 넣고 두 파트가 같이 쓴다):
  ```python
  def predict(d):  # 같은 달·같은 주차·같은 요일, 다음 해. 다섯째 주가 없으면 그 달 마지막 같은 요일
      n = (d.day - 1) // 7 + 1
      days = [date(d.year + 1, d.month, x) for x in range(1, monthrange(d.year + 1, d.month)[1] + 1)
              if date(d.year + 1, d.month, x).weekday() == d.weekday()]
      return days[n - 1] if n <= len(days) else days[-1]
  ```
  - 예외 하나: 이름에 날짜가 박힌 대회(3·1절·광복절·한글날·성탄·새해 첫날 등)이고 **2025·2026 회차가 같은 날짜**로 열린 근거가 있으면 2027 의 같은 월·일. 이때 notes 머리말 뒤에 `(매년 M월 D일 고정)` 을 적는다(check.py 가 이 표시가 있으면 같은 월·일로 검사).
  - 예상 race_date 는 오늘보다 뒤여야 한다(2026-11-01~07 에 열린 대회 → 2027-11 로 감, 정상).
- **'지난' 의 2025 예외**: 2025 회차가 마지막이고 2026 회차 근거가 없는 대회(예: 다둔 스카이레이스)는 2025 날짜 그대로 '지난'으로 넣고 notes 에 `2025년 회차. 2026 회차 소식 없음.` 을 적는다. 예상으로 만들지 않는다.
- 2027 회차가 이미 발표된 대회(2026 상반기 대회의 2027 공지 등)는 예상 대신 **발표**로.

### 3-4. 중복 판정
- **반영 직전 스냅샷**(3-8)의 data.json 전체(한국)와 다른 파트 배치에 대해: ① id ② 이름(한/영, 연도·'제N회'·'대회/마라톤/레이스/런'·모집 문구·띄어쓰기 떼고 비교) ③ 같은 시·도 + **같은 달(연도 무관)** ④ 같은 공식 주소 호스트. **같은 대회의 다른 회차·다른 표기도 중복** → 넣지 않는다(보고서 '건너뜀: DB 에 다른 회차 `<id>`').
- check.py 의 `비슷:` 은 직접 열어 판단 → 같은 대회면 빼고, 다른 대회면 report 에 근거 한 줄.
- **이미 DB 에 있는 행은 고치지 않는다**(날짜가 지났어도 — 주간 작업이 옮긴다). 단 하나의 예외는 3-7 의 `seoul-positive-half` official_url.

### 3-5. 검사기 `common/check.py` — **파트 A 가 BUILD 첫 단계에서 만든다**
`python3 -I .duo-data/kr-predict/common/check.py <a|b> <배치 경로>` → 마지막 줄 **`문제 있는 줄 0 / N`**.
- 키 28개(= data.json 첫 행 키), 상수 칸(나라·지역·통화·is_major·sold_out_on·subregion), id 규칙·DB/모든 배치(`.duo-data/kr-predict/[ab]/*.json`) 충돌, 날짜 형식, `opens ≤ closes ≤ race_date`, confidence 값, 시·도 약칭, flight_hours 규칙값 안내, trail 의 `-trail`, 거리 표기.
- 종류 판정(앞의 `[확인필요] ` 는 떼고): notes 가 3-3 머리말로 시작 → **예상**(기준 날짜를 머리말에서 읽어 `race_date == predict(기준)`(또는 `(매년 M월 D일 고정)`), 오늘 < race_date, 기준 < 오늘, date expected, 접수 null·tbc, 참가비 있으면 `(2026 기준)`) / 아니고 race_date < 오늘 → **지난**(연도 2026, 또는 2025 + notes `2025년 회차`; notes 에 '예상·추정·예년' 없음) / 나머지 → **발표**.
- 파트 범위: 예상은 기준 날짜의 달, 지난은 race_date 의 달, 발표는 race_date 의 달(A: 1~6월, B: 7~12월 — 연도 무관)이 그 파트인지.
- 공식 주소: 출처 호스트(marathon.pe.kr·roadrun.co.kr·runningwikii.com) 금지, goodrunner.co.kr 는 `/race/race.html?id=` 만 허용, 네이버 검색 링크면 두 confidence 모두 confirmed 금지, `confirmed` 인데 접수 둘 다 null(발표·지난) 이면 경고.
- 중복 의심(3-4 ②③④) → `비슷: <id> <이름> <날짜>` 로 알려 줌(문제 줄로 세지 않음).
- `--db` 모드: `check.py <a|b> --db` → 그 파트의 올린 배치 전부가 data.json 에 있고 값이 배치와 같은지(차이 칸 목록). FIX 가 쓴다.
- 만든 뒤 시험(시험 파일은 지움): 정상 예상 행 → 통과, 예상 날짜 하루 틀림·머리말 날짜와 다름·접수 칸 있음·`(2026 기준)` 없음·범위 밖·출처 주소를 official·'-trail' 없음 → 전부 잡힘. 결과를 `a/report.md` `## 검사기 시험` 에 한 줄씩.
- **'오늘'** = 검사기를 돌리는 날 `date.today()`(2026-11-08 로 박아 두지 않는다). BUILD 가 늦게 돌아 그 사이 지난 2026-11 대회는 '발표'가 아니라 '예상/지난'으로 다시 분류한다.
- 파트 B 는 check.py 를 **고치지 않는다**(문제는 `## 다른 파트 메모`).
- **어느 파트가 먼저 BUILD 돼도 막히지 않게**: B 가 배치를 올릴 때 `common/check.py` 가 아직 없으면, B 는 3-5 항목 그대로 **`b/check-b.py`**(B 소유, 같은 사용법·같은 마지막 줄)를 만들어 그것으로 검사하고 올린다. 나중에 `common/check.py` 가 생기면 B 의 FIX 가 B 배치 전부를 `common/check.py b <배치>` 로 다시 돌려 `문제 있는 줄 0` 을 확인한다(두 검사기 결과가 다르면 `## 다른 파트 메모`). `common/check.py` 가 있으면 B 는 그것만 쓴다.

### 3-6. 파일 · 배치
```
.duo-data/kr-predict/
  common/check.py   검사기 (파트 A 소유)
  common/merge.py   합본 생성기 (파트 B 소유)
  a/  파트 A 전용: a-01.json … · report.md · raw/(받은 페이지·API 응답) · 작업 스크립트
  b/  파트 B 전용: b-01.json … · b-fill01.json · report.md · raw/ · 작업 스크립트
.duo-data/kr-predict-report.md   합본 — merge.py 로만 생성(손으로 고치지 않음)
public/data.json                 스냅샷 결과 — 두 파트 공용 생성물, 손으로 고치지 않음(3-8)
```
- 배치 = JSON 배열 **50개 이하**. `<p>-NN.json` 이름은 **실제로 upsert 한 배치에만**(초안은 `<p>-NN.draft.json`).
- 반영: `python3 ~/Documents/.tools/upsert.py race .duo-data/kr-predict/<p>/<p>-NN.json` → **실패 0**. 실패가 있으면 고쳐서 그 파일 다시.
- 내려받은 HTML·JSON 은 `<p>/raw/` 에만, 그것을 읽는 python 은 `-I`.

### 3-7. 굿러너 자체 대회 (반드시 반영 — 공식 = 굿러너 대회 페이지 허용)
| 대회 | 근거(API) | 파트 | 할 일 |
|---|---|---|---|
| 굿러너 릴레이마라톤 (하남 미사경정공원) | id 95, 2026-03-22 | A | 2025 회차 근거 있으면 예상(→2027-03-28), 없으면 지난 |
| 동해 스카이레이스 | id 94·100, 2026-05-09~10 | A | 2025 회차 근거 → 예상(→2027-05-08), 없으면 지난 |
| 운탄고도 스카이레이스 | id 97, 2026-06-13~14 (2025 배너 있음) | A | 예상(→2027-06-12) |
| 춘천 스카이레이스 | id 103·107, 2026-09-12~13 / id 83, 2025-09-20 | B | 예상(→2027-09-11) |
| 다둔 스카이레이스 (원주 오크밸리) | id 87, 2025-11-15~16, 2026 없음 | B | 2026 회차 다시 찾고, 없으면 '지난' 2025 예외(3-3) |
| 긍정하프마라톤 | id 111·114, DB `seoul-positive-half` | B | 새로 넣지 않음. official_url 이 네이버 검색 링크면(2026-11-08 확인: 네이버 링크임) **이 한 칸만** 굿러너 대회 페이지(id 111, WebFetch 로 대회명 확인)로 → `b/b-fill01.json`(최신 data.json 행 통째 복사 후 `official_url`·`last_verified` 만 바꿈). 기존 행이라 check.py 는 id 충돌로 잡으므로 **check.py 대신** 'data.json 행과 비교해 두 칸 외 차이 0' 을 python 으로 확인해 report 에 |
| Light Up 키즈 | 공지 사진 글(2025) | 2026(없으면 2025) 회차 날짜의 달로 | **두 파트 모두** 날짜를 확인한다 → 그 달이 자기 범위인 파트만 넣고(3-2), 아닌 파트는 report `## 건너뜀` 에 '다른 파트 범위(<날짜>, 근거 URL)'. 날짜를 끝내 못 찾으면 넣지 않고 두 파트 모두 `## 판단 필요` 에 찾아본 곳 |
- 굿러너 페이지만 근거일 때 date_confidence: 굿러너가 주최이므로 굿러너 대회 페이지·API 에서 본 날짜는 공식으로 보아 '지난'·'발표' 는 `confirmed` 가능.

### 3-8. 스냅샷 · 커밋
- 스냅샷: `VITE_SUPABASE_URL=https://zhwmfvkwtmakieatlqtz.supabase.co VITE_SUPABASE_ANON_KEY=sb_publishable_uOBwP5-BbK7keBuq3gsMAg_Oil1yg6O node scripts/snapshot.mjs` — BUILD 시작 때, 배치 만들기 직전(중복 대조용), upsert 직후.
- 커밋: `git add public/data.json && git commit -m "대회 추가: 한국 2026 회차 기준 <a|b> N개 (예상 n·지난 n·발표 n, kr-predict <p>-NN)" -- public/data.json`. 검수 커밋은 `검수: kr-predict <a|b> …`. **`-- public/data.json` 필수**(다른 작업이 스테이징한 파일이 섞이지 않게). 커밋 뒤 `git show --stat HEAD` 가 `public/data.json` 하나인지 확인. `index.lock` 이면 잠시 뒤 다시.
- 다른 작업이 DB 를 바꿨으면 그 변경도 스냅샷에 같이 들어온다 → 되돌리지 않고 같이 커밋(report 에 '다른 작업 변경 포함 n행').
- `generated_at` 만 바뀌었으면 커밋하지 않고 `git checkout -- public/data.json`.
- 마지막에 끝난 파트가 한 번 더 떠서 DB 내용이 바뀌었을 때만 커밋.

### 3-9. 보고서
- 파트 메모 `<p>/report.md`:
  - **1행** `출처: <끝까지 본 것과 건수>` — 예 `마라톤온라인 2026-01~06 전부(글 n건, 한국 대회 n개), 전마협 2026 1~6월 n건·2025 1~6월 n건, 굿러너 API·공지, 러닝위키 n쪽, 지자체·체육회 검색 n회, 트레일(koreatrail.net) n건`.
  - 표 `| 배치 | 종류(예상/지난/발표) | id | 대회명 | race_date | 기준 날짜 | 도시 | 거리 | 참가비 | date/entry conf | official_url | source_url | 실존 근거 URL(2026 / 2025) |`
  - `## 건너뜀`(대회마다 이유 한 줄: DB 중복 `<id>` / 다른 파트 / 2026 취소 / 실존 근거 없음 / 한국 아님 등 — 이름·날짜·찾아본 곳) · `## 접수 방식 못 봄` · `## [확인필요]` · `## 판단 필요` · `## 검수`(FIX 가 씀) · `## 다른 파트 메모`
- 합본: `python3 -I .duo-data/kr-predict/common/merge.py` → `.duo-data/kr-predict-report.md`. 첫 줄 `# 한국 대회 추가 (2026 회차 기준) — 추가 N개 (예상 n · 지난 n · 발표 n) · 한국 총 T개`(T 는 data.json 에서 셈), 파트별 수·건너뜀 수, 두 report.md 원문. 배치를 올리거나 report.md 를 바꿀 때마다 다시 돌린다(FIX 단계도 실행은 가능, 수정은 B 만).

---

## 4. 공통 절차 (두 파트 같음)
1. 스냅샷(3-8) → 한국 수 기록.
2. **출처 끝까지** (자기 달만, 빨리 포기 금지):
   - 마라톤온라인 `http://marathon.pe.kr/index_calendar.html` — 2026 자기 달 전부(지난 달 포함). 대회마다 글을 열어 날짜·장소·주최·거리·참가비·공식 주소 확인. '매년' 근거용으로 2025 같은 달도.
   - 전마협 mara1080.com 지난 대회(API `year=2026`·`year=2025`, 자기 달).
   - 굿러너 자체 대회(3-7), 러닝위키(runningwikii.com) 지난 대회 글, 한국산악마라톤연맹(koreatrail.net) 등 트레일 일정, 지자체·체육회·육상연맹 공지, 러닝 커뮤니티 일정.
   - 하프·10K·5K·지역 대회·트레일 모두. 걷기만 있는 행사·온라인(버추얼) 레이스·해외 대회는 넣지 않는다(건너뜀에 이유).
3. 후보 표 → 중복 대조(3-4) → 종류 결정(3-3, 근거 URL 2개 확보) → 공식 주소 찾기(검색 → WebFetch 로 대회명 확인).
4. 50개씩 배치 → check.py `문제 있는 줄 0` → upsert 실패 0 → 스냅샷 → 커밋 → report.md·merge.py.
5. 끝에 `npm run build` 한 번(새 데이터로 사전 렌더가 깨지지 않는지 — 코드 수정 없음, 실패하면 고치지 말고 보고).

## 5. 파트 A — 2026년 1~6월 개최 대회

### 담당 파일 (이 파일만 만들고 고친다)
- `.duo-data/kr-predict/common/check.py` (만든다)
- `.duo-data/kr-predict/a/**` (`a-NN.json`·`report.md`·`raw/`·작업 스크립트)
- `public/data.json` — A 배치 반영 후 스냅샷·커밋만(3-8, 공용 생성물)

### 할 일
1. **check.py 먼저**(3-5): goodrunner2 검사기를 복사해 28키·세 종류·`predict`·파트 범위·`--db` 로 고치고 시험 → `a/report.md ## 검사기 시험`.
2. 공통 절차(4)로 2026-01-01~06-30 개최 대회. 한겨울·봄 시즌(3~5월)이 많으므로 마라톤온라인 3~5월은 글 하나하나 끝까지.
3. 굿러너 릴레이·동해·운탄고도(3-7), Light Up 키즈 날짜 확인.
4. 2027 상반기 회차가 이미 발표된 것은 '발표'로(이미 DB 에 2027 행이 있는 대회는 넣지 않음 — 지금 DB 2027-01~06 은 143개).

### 완료 기준 (A)
- check.py 가 3-5 시험을 전부 잡음(보고서에 결과).
- 올린 배치 전부 `check.py a <배치>` 마지막 줄 `문제 있는 줄 0 / N`, upsert 실패 0, `check.py a --db` 차이 0.
- 넣은 대회마다 report 표에 실존 근거 URL(예상은 2026·2025 두 개 또는 '제N회' 근거), 건너뛴 후보마다 이유.
- `public/data.json` 커밋(`git show --stat HEAD` = 그 파일 하나). 목표 약 120개 — 못 미치면 report 1행·`## 건너뜀` 으로 '출처를 끝까지 봤다'는 근거.

## 6. 파트 B — 2026년 7~12월 개최(예정) 대회

### 담당 파일 (이 파일만 만들고 고친다)
- `.duo-data/kr-predict/common/merge.py` (만든다)
- `.duo-data/kr-predict/b/**` (`b-NN.json`·`b-fill01.json`·`report.md`·`raw/`·작업 스크립트·(필요할 때만) `check-b.py`)
- `.duo-data/kr-predict-report.md` (merge.py 출력)
- `public/data.json` — B 배치 반영 후 스냅샷·커밋만(3-8, 공용 생성물)

### 할 일
1. **merge.py**(3-9): 두 report.md 를 읽어 합본. a/report.md 가 아직 없으면 '(파트 A 아직 없음)'으로 두고 돌아가야 한다. 시험 경로로 한 번 돌려 확인(인자로 출력 경로를 주면 그곳에 씀).
2. 공통 절차(4)로 2026-07-01~12-31. 세 갈래:
   - 7~10월·11월 1~7일 이미 열린 대회 → 예상/지난. 가을 시즌(9~10월)은 DB 에 2027 행이 많으므로(2027-09 25·10 57) 중복 대조를 특히 꼼꼼히.
   - 2026-11-08 ~ 12-31 아직 안 열린 대회 중 DB 에 없는 것 → **발표**(지금까지와 같은 규칙).
3. 굿러너 춘천·다둔·긍정하프(3-7, `b-fill01.json` 은 50행 규칙과 별개로 1행).
4. 마지막에 merge.py 실행 → 합본 첫 줄의 한국 총 수 = data.json 한국 수 확인.

### 완료 기준 (B)
- 올린 배치 전부 `check.py b <배치>`(없었으면 `b/check-b.py`, 3-5) 마지막 줄 `문제 있는 줄 0 / N`, upsert 실패 0, `check.py b --db` 차이 0(`common/check.py` 가 있을 때).
- `seoul-positive-half` 는 official_url(·last_verified) 외 칸이 그대로(채움 전후 행 비교를 report 에).
- 넣은 대회마다 실존 근거 URL, 건너뛴 후보마다 이유. 목표 약 120개(같은 단서).
- `.duo-data/kr-predict-report.md` 가 merge.py 로 생성됨, 숫자가 두 report 표·data.json 과 맞음.
- `public/data.json` 커밋(그 파일 하나).

---

## 7. 확인 방법
```bash
cd ~/Documents/runworld
VITE_SUPABASE_URL=https://zhwmfvkwtmakieatlqtz.supabase.co VITE_SUPABASE_ANON_KEY=sb_publishable_uOBwP5-BbK7keBuq3gsMAg_Oil1yg6O node scripts/snapshot.mjs
python3 -I .duo-data/kr-predict/common/check.py a .duo-data/kr-predict/a/a-01.json   # 마지막 줄 '문제 있는 줄 0 / N'
python3 -I .duo-data/kr-predict/common/check.py a --db                              # 올린 값 = DB 값
python3 -I .duo-data/kr-predict/common/check.py b --db
python3 -I .duo-data/kr-predict/common/merge.py                                     # 합본 다시 만들기
node -e 'const d=require("./public/data.json");console.log(d.races.filter(r=>r.country_code==="KR").length)'   # 한국 총 수
npm run build                                                                        # 데이터로 사전 렌더 통과
git show --stat HEAD                                                                 # public/data.json 하나
```

### FIX(검수) 단계에서 할 것 (지정된 파트만)
- 새로 넣은 것 중 **30% 이상 무작위**(`random.seed(<오늘 날짜 숫자>)`, 고른 id 를 report 에) + **date_confidence 또는 entry_confidence 가 `confirmed` 인 행 전부** → 근거 페이지를 다시 열어 날짜·장소·거리·참가비·접수·대회명 대조.
- **예상 행 전부**: 머리말 기준 날짜 = 근거의 실제 2026 날짜인지, `race_date = predict(기준)`(같은 주차·요일)인지 — check.py 와 별도로 달력으로 손 계산한 것을 몇 개 report 에.
- 실존 근거가 끝내 확인 안 되면 **삭제하지 말고** notes 앞에 `[확인필요] ` → 그 행만 담긴 배치(`<p>-fixNN.json`) → check.py → upsert → 스냅샷·커밋(`검수: …`).
- 중복 재대조: 최신 data.json 에서 새 행의 이름 핵심 낱말로 다시 찾아 같은 대회 다른 행이 있는지. 중복이면 삭제하지 말고 `[확인필요] 중복 의심 <id>` + report.
- 결과는 그 파트 `report.md ## 검수` → merge.py 다시.

## 8. 두 파트 사이 순서·맞물림
- 만나는 곳: **check.py(A 가 만듦)·merge.py(B 가 만듦)·data.json(공용 생성물)·서로의 배치(id·중복 대조)**. 3-1~3-3 규칙을 바꿔야 하면 혼자 바꾸지 말고 `## 다른 파트 메모` + `## 판단 필요`.
- check.py 가 없을 때 B 는 `b/check-b.py` 로 진행(3-5). A 는 merge.py 없이도 a/report.md 를 3-9 형식으로 쓴다.
- **merge.py 는 실행만이면 어느 파트·어느 단계든 돌려도 된다**(생성기 실행 = 손 수정 아님). 마지막에 끝나는 단계(BUILD 든 FIX 든, A 든 B 든)가 merge.py 를 돌려 합본을 최신으로 만든다. merge.py 가 아직 없을 때 A 가 끝나면 'merge.py 대기' 라고 보고에 적는다.
- `npm run build` 는 두 파트가 동시에 돌리지 않는다(`dist/` 충돌 폴더가 생김 — 이전 작업에서 겪음). 다른 빌드가 돌고 있으면 끝난 뒤에.
- 두 파트가 동시에 일하면 상대 배치(`.duo-data/kr-predict/[ab]/*.json`)가 중간에 늘어난다 → 배치마다 check.py 를 **upsert 직전에** 다시 돌린다(id 충돌·`비슷:` 최신화).
- 같은 대회를 두 파트가 다 후보로 본 경우: 3-2 기준 날짜의 달이 정한다. 경계(6월 말·7월 초)는 첫날 기준.
- 담당 파일이 겹치지 않는다: A = `common/check.py`·`a/**`, B = `common/merge.py`·`b/**`·`kr-predict-report.md`. `public/data.json` 은 스냅샷으로만 바뀌는 공용 생성물(손 수정 금지, 커밋은 3-8 대로). 이 밖의 파일은 어느 파트도 고치지 않는다.

## 9. 판단 필요 (PLAN 때 본 것)
- 이미 지난 2026 날짜로 넣은 '지난' 행은 '주간 작업'(지난 대회를 다음 회차로 옮기는 작업)이 옮길 수 있다 — 이번 작업에서 그 동작은 바꾸지 않는다(코드 수정 금지). 결과는 보고서에 '지난 n개' 로만.
- 브리프 예시 고구려마라톤(`goguryeo-seoul`)은 지금 머리말 형식이 아니다 — 기존 행이라 고치지 않는다.

## 다른 파트 메모
(FIX 단계에서 다른 파트 담당 파일 문제를 찾으면 그 단계 파트의 report.md `## 다른 파트 메모` 에 적는다 — 파일·줄·증상·고칠 방법)
