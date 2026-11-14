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

## 미리보기 확인(실제 응답)

## 다른 파트 메모
