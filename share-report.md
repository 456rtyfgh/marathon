# 공유 링크 강화 보고 (g-share)

## 파트 A

### 바꾼 파일
- `src/lib/shareText.ts` — `shareEntryLine`: 접수 일정이 확정이 아니면(예상·미정) 날짜가 있을 때 `접수 예상 M/D~M/D (상태)` · `Entry expected M/D–M/D (상태)`. 날짜가 없거나 취소 대회는 상태만. 확정 대회는 기존 그대로. 시그니처 불변.
- `src/i18n/ko.ts`, `src/i18n/en.ts` — `share.entryExpected` 추가. `detail.copied` 를 `복사됨` / `Copied` 로(브리프의 '복사됨' 표시, 복사하는 것이 주소만이 아니라 문구 전체라서).
- `src/components/RaceDetail.tsx`
  - 공유 버튼을 맨 윗줄(스크롤해도 붙어 있는 줄, 지역 글자 오른쪽·관심·닫기 옆)에 추가. 휴대폰·PC 모두 아이콘+글자 `공유하기`/`Share`, `bg-surface text-ink` (기존 토큰만, 높이 `h-11 sm:h-9`). 본문 동작 줄의 공유 버튼은 그대로 두고 둘이 같은 `share()`·같은 `copied` 상태를 쓴다. 휴대폰 아래 고정 줄은 건드리지 않았다.
  - `share()`: 공유창을 사용자가 닫은 경우(`AbortError`)에는 링크 복사로 넘어가지 않는다(전에는 취소해도 복사됐다). 지원 안 함·다른 오류일 때만 복사 → 그것도 실패하면 `prompt`. 복사됨 타이머는 ref 로 관리해 연속 클릭에도 1.8초가 새로 시작.
  - 복사됨 안내를 `role="status" aria-live="polite"` 로 스크린리더에도 읽히게.
- `scripts/share-test.mjs` — 예상·미정 규칙, 날짜 없음, 취소, 한쪽 날짜, 조기 마감 사례를 새 규칙대로 검사 (`alertNudge` 검사는 그대로).

### 공유 문구 실제 값 (`node scripts/share-test.mjs`, data.json, 오늘=2026-11-14)
- 확정: `뉘아예 숲 하프마라톤 · 2027년 3월 14일 · 접수 12/1~3/10 (접수 예정) · https://marathon82.com/r/nuaille-semi`
- 예상: `시라카와 고향 마라톤 · 2026년 11월 14일 · 접수 예상 6/10~8/16 (일정 미공개) · https://marathon82.com/r/shirakawa-furusato-marathon` / en `… · Entry expected 6/10–8/16 (Dates TBA) · https://marathon82.com/en/r/…`
- 취소: `바간 사원 마라톤 · 2026년 11월 21일 · (대회 취소) · https://marathon82.com/r/bagan`
- 한쪽 날짜: `… · 접수 ~11/14 (접수 중) · …` / `… · 접수 3/1~ (접수 중) · …`
- 전체 다가오는 대회 2438개에서 예외 없이 만들어지고 영어 접수 줄에 한글 없음. 결과: 모두 통과.

### 확인 (직접 한 것)
- `npm run build` EXIT 0, `npx tsc -b` 오류 0, oxlint 경고 0.
- `wrangler pages dev dist` (vite preview 는 대회 상세 `/r/<id>.json` 을 못 내줘 상세가 안 뜬다) + `agent-browser` 로 스크린샷을 직접 봤다. Playwright MCP 는 이 세션에서 권한이 없어 CLI 를 썼다. 서버는 끝내고 종료했다(8790 포트 비어 있음).
  - 375px ko: `evidence/share/a-375-ko-top.png` — 맨 윗줄 오른쪽에 `공유하기`, 가로 넘침 없음(scrollWidth 375), 아래 고정 줄 3버튼 그대로.
  - 375px ko 복사 직후: `evidence/share/a-375-ko-share-copied.png` — 버튼이 `✓ 복사됨`, 1.8초 뒤 `공유하기` 로 복귀, `role=status` 에 `복사됨`.
  - 375px en 취소 대회: `evidence/share/a-375-en-cancelled.png` — `Share`, 잘림 없음.
  - 1280px ko: `evidence/share/a-1280-ko-top.png` — `공유하기` 가 `관심 추가`·닫기 옆에 나란히.
- `navigator.share` (터치 기기 흉내: `matchMedia('(pointer: coarse)')`·`navigator.share` 를 가짜로): 성공 → `{title, text, url}` 한 번 호출하고 복사 안 함 / `AbortError` → 복사 안 함 / 그 밖의 오류 → 복사로 넘어감. 클립보드에 들어간 글: `시라카와 고향 마라톤 · 2026년 11월 14일 · 접수 예상 6/10~8/16 (일정 미공개) · http://127.0.0.1:8790/r/shirakawa-furusato-marathon` (운영에서는 `https://marathon82.com/…`).
- `track('share')` 는 `share()` 맨 앞 한 곳에서만 호출(위·본문 버튼 모두 같은 함수) — 코드로 확인, 이벤트 전송 자체는 시험하지 않았다.

### 브리프와 다르게 판단한 것
- 공유 주소는 `https://` 를 붙인 완전한 주소(`https://marathon82.com/r/<id>`)를 유지했다. 브리프 예시는 `marathon82.com/r/<id>` 이지만 메신저가 링크로 바로 잡도록.
- 휴대폰 아래 고정 줄에는 공유를 넣지 않았다(375px 에서 4번째 버튼이 글자를 자르는 것을 80cff98 에서 이미 확인). 대신 스크롤해도 붙어 있는 맨 윗줄에 넣었다.

### 못 한 것·남은 것
- 라이트 테마 스크린샷은 찍지 않았다(색은 기존 토큰만 써서 테마를 따라간다).
- 실제 휴대폰의 공유 시트·실제 클립보드는 시험하지 못했다(가짜로 호출 인자만 확인).
- `npm run build` 가 `evidence/ledger.csv` 를 다시 쓴다(빌드 스크립트의 원래 동작). 이번 변경이 아니라 커밋하지 않았다.

## 파트 B

### 바꾼 파일
- `src/lib/ogMeta.ts` (신규) — `ogDescription(race, lang, summary, today?)`: `<접수 줄> <요약>` 을 160자 안쪽으로. 워커 안에 인라인으로 있던 조립 로직을 순수 함수로 옮겨 node 로 시험할 수 있게 했다. 동작은 같고 하나만 고쳤다. 대회명·장소 속 `St. Jude`·`Mt. Fuji` 의 `. ` 를 문장 끝으로 보지 않게 했다(전에는 넘칠 때 이름 중간에서 잘릴 수 있었다). 취소 대회는 요약만 쓴다(ko `[대회 취소]`, en `[Cancelled]`). 예상·미정 표시는 파트 A 의 `shareEntryLine` 을 그대로 쓴다.
- `worker/site.ts` — `withRaceMeta` 는 `ogTitle` 과 `ogDescription` 만 부른다. og·twitter `content` 에 넣는 값은 `&` 만 `&amp;` 로 바꾼다. HTMLRewriter `setAttribute` 가 `"` 는 `&quot;` 로 바꾸지만 `&` 는 그대로 두는 것을 실제 응답으로 확인했다(`Run & Learn` 이 생으로 나왔다). `describe`·`describeEn` 에는 `export` 만 붙였다(시험용 import, 동작 그대로).
  - `<title>`·`meta description`·canonical·hreflang·JSON-LD·og:image 는 바꾸지 않았다.
- `scripts/og-desc-test.mjs` (신규) — 워커의 실제 `describe`/`describeEn` 을 esbuild 로 묶어 부르고, data.json 2661개 × ko·en 을 검사한다. 160자 이내인지, 문장 중간에서 자르지 않는지, 취소 대회 형식, 예상 표시, 날짜 없음, 영어에 한글이 섞이지 않는지, 이름 속 점, 만든 사례 4개를 본다.
- `scripts/og-check.mjs` (신규) — 로컬 Pages 함수 응답에서 og·twitter·canonical 을 뽑아 기대값(`ogTitle`·`ogDescription`)과 비교한다. 이스케이프(이중 `&amp;amp;`, 생 `&`·`<`)와 없는 대회의 404 도 본다. 대표 대회의 `<head>` 는 `evidence/share/og/` 에 저장한다. `--all` 을 주면 전 대회 응답을 검사한다.

### 브리프와 다르게 한 것
- **`dist/r/<id>/index.html` 은 만들지 않았다.** 이 저장소 빌드에는 그 파일이 없다. `/r/*`·`/en/r/*` 는 `_routes.json` 으로 함수(`dist/_worker.js`)가 받고, `dist/index.html` 을 HTMLRewriter 로 고쳐서 준다(`npm run build` 뒤 `ls dist/r` 으로 없음 확인). 정적 파일을 만들어도 함수가 먼저 받아서 내보내지지 않는다. 그래서 같은 확인을 `wrangler pages dev dist` 의 실제 응답으로 했고, 받은 `<head>` 를 `evidence/share/og/<ko|en>-<id>.head.html` 24개로 저장해 직접 열어 봤다.

### 확인 (직접 한 것)
- `npm run build` EXIT 0, `npx tsc -b` EXIT 0, `npx oxlint`(바꾼 4개 파일) 경고 0.
- `node scripts/share-test.mjs` 통과(파트 A 커밋 a14cb10 반영 상태).
- `node scripts/og-desc-test.mjs`: 검사 34602건, 실패 0.
- `node scripts/og-check.mjs http://localhost:8791`: 대표 12개 × ko·en, 실패 0. `--all`: 5322개 응답 실패 0.
  - 메모 1건: `en stanley-marathon` 의 장소가 응답(workerd)에서는 `Falkland Islands (Islas Malvinas)`, node 에서는 `Falkland Islands` 다. 나라 이름이 Intl(ICU) 데이터라 런타임마다 다르다. 결함은 아니어서 og-check 는 장소 칸이 비었는지만 본다.
- 스크린샷(agent-browser — Playwright MCP 는 이 세션에서 권한이 없었다). `wrangler pages dev` 의 함수 응답 페이지로 찍었고, 모두 화면이 정상으로 뜨고 `scrollWidth` 가 창 폭과 같다(가로 넘침 없음).
  - `evidence/share/b-375-ko-chiangmai-utmb-trail.png`, `evidence/share/b-1280-ko-chiangmai-utmb-trail.png` (확정)
  - `evidence/share/b-375-en-hanam-misa-energy-run.png`, `evidence/share/b-1280-en-hanam-misa-energy-run.png` (취소)
- 포트: 8788 과 8790 은 다른 세션의 wrangler 가 쓰고 있어 건드리지 않고 8791 을 썼다. 끝낸 뒤 8791 에 연결이 거부되는 것(꺼짐)을 확인했다.

### 남은 것
- 예상 대회의 미리보기 설명은 `접수 예상 8/31~11/25 (일정 미공개)` 로 시작하지만, 뒤에 붙는 요약(검색용 meta description 과 같은 글)이 `선착순 접수 2026년 8월 31일부터 2026년 11월 25일까지.` 처럼 날짜를 확정처럼 다시 말한다. meta description 은 검색 결과가 바뀌지 않게 그대로 두기로 해서 손대지 않았다. 고치려면 `describe`/`describeEn` 의 접수 문장에 예상 표시를 넣어야 하고, 그러면 검색 설명도 함께 바뀐다(따로 정할 일).
- 원래 있던 문구 문제: 상시 접수 대회의 한국어 요약이 `상시 접수 접수 기간 미공개` 처럼 '접수' 를 두 번 쓴다(`worker/site.ts` `entryText`, 이번 변경 전부터 있었다). 검색 설명에도 나오는 글이라 이번 범위에서는 고치지 않았다.

## 미리보기 확인(실제 응답)

`wrangler pages dev dist --port 8791` 의 응답 값 그대로(오늘 2026-11-14, 한국 시간). 모든 대회에서 `og:image`·`twitter:image` = `https://marathon82.com/og.png`, `twitter:card` = `summary_large_image`, `og:url` = canonical = `https://marathon82.com[/en]/r/<id>`, `twitter:title`·`twitter:description` 은 og 와 같다. `og:locale` 은 ko `ko_KR`, en `en_US`.

| 경우 | 주소 | og:title | og:description |
|---|---|---|---|
| 확정 | `/r/chiangmai-utmb-trail` | 치앙마이 타일랜드 바이 UTMB · 2026년 12월 4일 · 태국 치앙마이 | 접수 7/1~10/31 (접수 마감) 치앙마이 타일랜드 바이 UTMB은 2026년 12월 4일 태국 치앙마이에서 열리는 트레일러닝 대회입니다. 종목 173K·100K·63K·57K·26K. 선착순 접수 2026년 7월 1일부터 2026년 10월 31일까지. |
| 확정 | `/en/r/chiangmai-utmb-trail` | HOKA Chiang Mai Thailand by UTMB · Dec 4, 2026 · Chiang Mai, Thailand | Entry 7/1–10/31 (Closed) HOKA Chiang Mai Thailand by UTMB is a trail race on Dec 4, 2026 in Chiang Mai, Thailand. |
| 예상 | `/r/geumsan-goldrun` | 전마협 금산 골드런 레이스 · 2026년 12월 5일 · 충남 금산 | 접수 예상 8/31~11/25 (일정 미공개) 전마협 금산 골드런 레이스는 2026년 12월 5일 충남 금산에서 열리는 마라톤 대회입니다. 종목 하프·10km·5km. 선착순 접수 2026년 8월 31일부터 2026년 11월 25일까지. 일정, 비용, 후기를 확인하세요. |
| 예상 | `/en/r/geumsan-goldrun` | Geumsan Gold Run Race · Dec 5, 2026 · Geumsan, Chungnam | Entry expected 8/31–11/25 (Dates TBA) Geumsan Gold Run Race is a marathon on Dec 5, 2026 in Geumsan, Chungnam. |
| 접수 미정 | `/r/aqaba-ayla-red-sea-half` | 아일라 홍해 하프마라톤 아카바 · 2026년 12월 4일 · 요르단 아카바 | (일정 미공개) 아일라 홍해 하프마라톤 아카바는 2026년 12월 4일 요르단 아카바에서 열리는 마라톤 대회입니다. 종목 하프·10km. 상시 접수 접수 기간 미공개. 일정, 비용, 후기를 확인하세요. |
| 접수 미정 | `/en/r/aqaba-ayla-red-sea-half` | Ayla Red Sea Half Marathon · Dec 4, 2026 · Aqaba, Jordan | (Dates TBA) Ayla Red Sea Half Marathon is a marathon on Dec 4, 2026 in Aqaba, Jordan. Distances: Half, 10km. Registration (Open entry) dates TBA. |
| 취소 | `/r/hanam-misa-energy-run` | 하남 미사 호수 에너지런 · 2026년 12월 5일 · 경기 하남 | [대회 취소] 하남 미사 호수 에너지런은 2026년 12월 5일 경기 하남에서 열리는 마라톤 대회입니다. 종목 10km·5km. 상시 접수 접수 2026년 11월 26일 마감. 일정, 비용, 후기를 확인하세요. |
| 취소 | `/en/r/hanam-misa-energy-run` | Hanam Misa Lake Energy Run · Dec 5, 2026 · Hanam, Gyeonggi | [Cancelled] Hanam Misa Lake Energy Run is a marathon on Dec 5, 2026 in Hanam, Gyeonggi. Distances: 10km, 5km. Registration (Open entry) closes Nov 26, 2026. |

특수문자(응답 원문, 속성값 그대로):
- `"` — `en gwangju-youth-marathon`: `content="Gwangju Youth Marathon &quot;Here in Seo-gu, Run with Youth&quot; · Sep 20, 2025 · Seo-gu, Gwangju"` (속성 안 깨짐, 이중 이스케이프 없음)
- `'` — `en jeonju-savethechildren-kids-marathon`: `Save the Children International Children's Marathon Jeonju · …` (큰따옴표로 감싼 속성이라 그대로 둬도 된다)
- `&` — `en seoul-run-and-learn-donation-run`: `content="Run &amp; Learn Donation Run · Oct 25, 2025 · Guro, Seoul"`, `incheon-third-bridge-walk-run`: `WALK &amp; RUN` (`&amp;amp;` 없음)
- 그 밖의 대표 대회(조기 마감 `charlotte-marathon`, 지난 대회 `tongyeong-hansando-trail`, 긴 이름 `jirisan-hwadae-utmb-trail`, 이름에 점 `memphis-stjude`)도 ko·en 모두 통과. 저장한 head 는 `evidence/share/og/` 에 있다.
- 없는 대회 `/r/no-such-race-og-check` 는 404 그대로다.

## 다른 파트 메모
