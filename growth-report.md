# growth-1114 보고

## 파트 A

### 바꾼 파일
- `src/lib/shareText.ts` (새 파일): `shareText()`·`shareEntryLine()`·`ogTitle()` — 앱 공유 버튼과 워커 og 태그가 같이 쓴다. 상태 글자는 기존 `STATUS_TEXT`(format.ts), 접수 날짜는 확정일 때만 넣는다.
- `src/lib/alertNudge.ts` (새 파일): 제안 닫기·알림 신청 기록(localStorage, 모두 try/catch, 최근 500개까지)과 `nudgeEligible()`(취소 아님·대회일 오늘 이후·접수 예정/접수 중/일정 미공개).
- `src/components/AlertNudge.tsx` (새 파일): 한 줄 제안 "접수 시작·마감 알림을 받을까요?" + [알림 받기](기존 `Button tone="quiet"`) + 닫기(기존 `CloseButton`). 새 색 없음.
- `src/components/RaceDetail.tsx`:
  - 저장을 켤 때(위쪽 버튼·휴대폰 아래 줄)와 캘린더 받기·Google 추가에 성공할 때 제안을 띄운다. 이미 알림이 있는 대회, 닫은 대회, 회원이 '저장한 대회 알림'(saved_races)을 켜 둔 경우는 띄우지 않는다. saved_races 는 로그인일 때 한 번만 읽는다.
  - [알림 받기]를 누르면 기존 알림 탭(AlertForm·PushToggle)으로 간다. 비회원은 기존 MemberGate 'alert' 의 로그인 뒤 이어 하기를 그대로 쓴다.
  - 공유 버튼은 `shareText()` 문구를 쓴다. 휴대폰은 `navigator.share({title,text,url})`, 그 밖은 클립보드에 전체 문구를 넣고 "주소 복사됨"을 띄운다. 공유 버튼은 같은 자리·같은 스타일이고, 아이콘을 `ShareNetwork` 로, 글자를 "공유"에서 "공유하기"로 바꿨다. `track('share', { race_id })` 는 그대로다.
- `src/components/AlertForm.tsx`: 신청 성공 때 `markAlerted(race.id)` 한 줄(+import).
- `worker/site.ts`: `/r/<id>`·`/en/r/<id>` 의 og:title·og:description·twitter:title·twitter:description 값만 바꿨다.
  - 제목: `대회명 · 날짜 · 장소`
  - 설명: `접수 M/D~M/D (상태)` + 기존 요약. 160자를 넘으면 요약 문장을 뒤에서부터 통째로 뺀다. 취소 대회는 기존 요약('[대회 취소] …')만 쓴다.
  - `<title>`·meta description·canonical·JSON-LD·og:image(`/og.png`)는 그대로다.
- `src/i18n/ko.ts`·`en.ts`: `share.entry`, `nudge.text`·`nudge.cta`·`nudge.close` 를 추가했다. `detail.share` 는 '공유'에서 '공유하기'로 바꿨다(en 'Share' 그대로).
- `scripts/share-test.mjs` (새 파일): `node scripts/share-test.mjs`
  - data.json 의 실제 대회 9개(접수 중·예정·미공개·마감·조기 마감·취소·지난 대회·한쪽 날짜만 2개)로 ko·en 공유 문구, og 제목, 제안 규칙을 assert 한다.
  - 다가오는 대회 2438개 전부 문구를 만들 수 있는지, 영어 접수 줄에 한글이 없는지 본다.
  - localStorage 저장·조회, 깨진 값, throw, 없음 경우도 본다.

### 계획과 다르게 한 점
- **휴대폰 아래 고정 줄에는 공유 버튼을 넣지 않았다.** 넣어 보니 375px 에서 '공식 홈페이지' 버튼 폭이 191px 에서 119px 로 줄어 글자가 "공식 홈페..."로 잘렸다(`a-375-ko-bottom-bar-4btn-rejected.png`). PLAN 의 대안대로 위쪽(본문 동작 버튼 줄) 공유 버튼만 보강했다.
- **저장 뒤 제안 자리:** 640px 이상은 머리 끝(요약·'접수했어요' 아래, 위쪽 '관심' 버튼 가까이)에 띄운다. 휴대폰은 아래 고정 줄('관심' 버튼) 바로 위에 띄운다. 본문을 내려 읽다가 저장해도 보여야 해서다(검수 때 고침: 머리 끝에만 두면 스크롤한 상태에서는 화면 밖에 떴다 — `a-375-ko-save-nudge-scrolled.png`). 캘린더 추가 뒤 제안은 계획대로 캘린더 고르기 아래에 띄운다.
- **회원 첫 저장 때 생기는 타이밍 문제(두 번째 검수 때 고침):** 회원은 제안을 띄우기 전에 '저장한 대회 알림' 설정(`getAlertPrefs`)을 한 번 읽는다. 그 응답을 기다리는 사이에 저장을 바로 풀거나 다른 대회로 넘어가도, 응답이 오면 제안이 떴다. 이제 저장 버튼을 누르거나 대회가 바뀔 때마다 번호(`nudgeSeq`)를 올리고, 응답이 왔을 때 번호가 달라졌으면 제안을 띄우지 않는다.

### 확인
- `npm run build` EXIT 0, `npx tsc -b` 오류 0, `share-test`·`distance-test`·`status-tone-test` 통과, `git diff public/robots.txt` 비어 있음.
- 로컬 워커(`wrangler pages dev dist --port 8788`)에서 og 태그를 확인했다. 예: `/r/nuaille-semi`
  - og:title = `뉘아예 숲 하프마라톤 · 2027년 3월 14일 · 프랑스 뉘아예`
  - og:description = `접수 12/1~3/10 (접수 예정) 뉘아예 숲 하프마라톤은 …`
  - `<title>`·canonical 은 이전과 같다. 영어(/en/r)·미공개·마감·취소·없는 대회(404) 경우도 확인했다. 확인 뒤 서버를 껐다.
- 브라우저 확인(agent-browser, 로컬 워커 위의 빌드 결과):
  - 접수 예정 대회를 저장하면 제안이 뜬다.
  - [알림 받기]를 누르면 알림 탭과 로그인 안내가 나온다.
  - 저장을 풀었다가 다시 저장하면 제안이 다시 뜬다.
  - [닫기] → 새로고침 → 다시 저장하면 뜨지 않는다(localStorage 확인).
  - 접수 마감·취소 대회는 저장해도 뜨지 않는다.
  - 공유하기를 누르면 복사된 문구는 `전국무등산무돌길완주대회 · 2027년 5월 8일 · 접수 1/3~3/9 (접수 예정) · <origin>/r/mudeungsan-mudolgil-trail` 이고, 영어는 `K-Mudeung Mudolgil Festival · May 8, 2027 · Entry 1/3–3/9 (Opening soon) · <origin>/en/r/…` 이다. 버튼은 "주소 복사됨"으로 바뀐다.
  - 375·1280 모두 `scrollWidth == innerWidth` 다.
- `vite preview` 는 대회 상세(`/r/<id>.json`)를 내주지 못한다(그 미들웨어는 dev 전용). 그래서 `wrangler pages dev` 로 빌드 결과를 찍었다. Playwright MCP 는 이 세션에서 권한이 없어 `agent-browser` CLI 를 썼다.

### 스크린샷 (`evidence/growth/`)
- `a-1280-ko-save-nudge.png`, `a-1280-ko-nudge-to-alert.png`, `a-1280-ko-share-copied.png`, `a-1280-en-save-nudge.png`
- `a-375-ko-save-nudge.png`, `a-375-ko-share-copied.png`, `a-375-en-save-nudge.png`, `a-375-en-share-copied.png` (두 save-nudge 는 고치기 전 자리: 휴대폰에서도 머리 끝)
- `a-375-ko-bottom-bar-4btn-rejected.png` (넣지 않기로 한 4버튼 아래 줄)
- `a-375-ko-save-nudge-scrolled.png` (본문을 900px 내린 뒤 아래 줄에서 저장 → 제안이 버튼 바로 위에 보임), `a-1280-ko-save-nudge-after-fix.png` (640px 이상은 그대로 머리 끝)

### 남은 점
- 캘린더 추가 뒤 제안과 saved_races 판단은 회원 전용이다. dev 서버의 로그인 흉내(`?amock=member`)가 이 환경에서 켜지지 않아 브라우저로는 눌러 보지 못했다. 저장 쪽과 같은 `offerNudge()` 를 부르는 것은 코드로 확인했다.
- "이미 알림 있음"은 이 브라우저에서 신청한 기록과 saved_races 로만 판단한다. 알림 신청 테이블은 브라우저에서 읽을 수 없고, DB 변경은 금지라서다. 그래서 다른 기기에서 신청한 대회에는 제안이 한 번 뜰 수 있다.
- 워커가 `shareText.ts` 를 통해 `util.ts`·i18n 사전을 함께 묶는다. 빌드된 `dist/_worker.js` 는 222KB(minify)로, Cloudflare 한도 안이다.
- 공유 시트(`navigator.share`)는 실제 휴대폰에서만 뜬다. 헤드리스 브라우저에서는 복사 경로로 확인했다.
- `evidence/ledger.csv` 는 빌드(`scripts/evidence.mjs`)가 바꾼 것이라 커밋하지 않았다.

## 파트 B

### 바꾼 파일
- `scripts/seo-lib.mjs`: `regionPages`·`distancePages`·`weekend`·`entryStatusOf`·`STATUS_EN`·`PROVINCES`·`provinceOf` 추가. `listPages` 에 새 페이지를 더했다(주말 0개면 빠짐, `/entry-open/` 0개면 빠짐). `LANDINGS`·`LANDINGS_EN` 에 `/weekend/` 를 더했다(0개가 아닐 때만).
- `scripts/seo-pages.mjs`: 새 페이지(한·영)를 만든다. `page()`·`pageEn()` 에 `noindex`, `item()`·`itemEn()` 에 `status` 옵션을 더했다(둘 다 기본은 꺼짐). 월별 페이지와 랜딩 `footNav` 에 "시·도별·거리별 국내 마라톤 일정" 링크 묶음을 더했다. `/kr/` 첫머리에 시·도 17개 링크를 넣었다. `/entry-open/` 에는 접수 상태 표시와 관련 링크를 더했고, 0개면 noindex 가 붙는다.
- `scripts/sitemap.mjs`: 새 페이지 수를 콘솔에 찍는다(sitemap 주소는 `listPages` 에서 자동으로 들어간다).
- `scripts/prerender.mjs`: 첫 화면에 미리 넣는 HTML(한·영)에 시·도별·거리별 링크 줄을 더했다.
- `src/lib/seoLinks.ts` (새 파일): 앱 푸터용 링크 목록(ko/en 문구 포함)
- `src/App.tsx`: 푸터 약관 링크 줄 위에 링크 한 줄(접수 중·이번 주말·풀코스·하프·10km·국내·해외)을 넣었다. 기존 약관 링크와 같은 스타일이다.
- `scripts/seo-pages-check.mjs` (새 파일): dist 검사 스크립트

### 새 페이지 (한국어 22 + 영어 22 = 44개)
- 시·도별 17개: `/kr/seoul/` 204, `/kr/gyeonggi/` 103, `/kr/incheon/` 29, `/kr/gangwon/` 53, `/kr/north-chungcheong/` 25, `/kr/south-chungcheong/` 36, `/kr/daejeon/` 24, `/kr/sejong/` 10, `/kr/north-jeolla/` 33, `/kr/south-jeolla/` 40, `/kr/gwangju/` 19, `/kr/north-gyeongsang/` 49, `/kr/south-gyeongsang/` 40, `/kr/daegu/` 15, `/kr/ulsan/` 17, `/kr/busan/` 33, `/kr/jeju/` 18 (다가오는 국내 대회 수, 2026-11-14 빌드 기준. 17개 시·도 모두 1개 이상이라 빠진 곳은 없다)
- 거리별 3개: `/distance/full/` 52, `/distance/half/` 270, `/distance/10k/` 544 (다가오는 국내 대회)
- 이번 주말 1개: `/weekend/` 86 (11/14~15, 국내 41·해외 45). 0개인 주에는 noindex 를 붙이고 sitemap 에서 뺀다.
- 넘김 1개: `/open/` 은 `/entry-open/` 으로 넘기는 페이지다(canonical + 즉시 refresh, sitemap 에서 뺐다).
- 위 페이지마다 `/en/…` 짝이 있다. sitemap 에 들어간 새 주소는 한·영 42개다(`/open/` 제외). sitemap 전체 주소는 5716개.

### 거리 페이지 주소를 `/d/…` 가 아니라 `/distance/…` 로 둔 이유
`/d/*` 는 워커(`worker/site.ts`, `_routes.json`)가 앱 목록 데이터 파일만 내주고 나머지는 404 로 막는 주소다(데이터 무단 수집 방지). 브리프 예시 `/d/full/` 을 그대로 쓰면 운영에서 404 가 난다. 로컬 `wrangler pages dev` 에서도 `/d/full/` 404, `/distance/full/` 200 을 확인했다.

### 확인
- `npm run build` EXIT 0, `npx tsc -b --noEmit` 오류 0, `distance-test`·`status-tone-test` 통과, `git diff public/robots.txt` 비어 있음
- `node scripts/seo-pages-check.mjs` 통과. 검사 내용: 새 페이지 42개의 title(기존 목록 페이지까지 포함해 서로 다름)·description(160자 이내)·canonical(자기 주소)·h1, JSON-LD 의 JSON.parse·BreadcrumbList·ItemList, ItemList 수와 목록 `<li>` 수 일치, 접수 상태 글자·`/r/<id>` 링크·관련 링크 nav, sitemap 포함 여부(noindex·`/open/` 은 빠짐), `/open/` 의 canonical·refresh, `dist/d/` 아래 html 없음, 기존 랜딩 canonical·title, 옮겨 적은 시·도 id 와 `src/lib/places.ts` 일치
- 기존 정적 페이지 350개를 HEAD 코드로 만든 결과와 비교했다. title·description·canonical·og:title·h1·JSON-LD·`<li>` 수가 모두 같다(다른 곳 0). 늘어난 것은 내부 링크와 상태 표시뿐이다.
- 로컬 워커(`wrangler pages dev`, 포트 8789. 8788 은 다른 세션이 쓰는 중이었다): `/distance/{full,half,10k}/`·`/kr/seoul/`·`/kr/jeju/`·`/weekend/`·`/open/`·`/en/…`·`/kr/` 모두 200, `/d/full/` 404. 확인 뒤 서버를 껐다.
- 가로 넘침: 아래 모든 화면에서 `scrollWidth == innerWidth` 다(375·1280). 앱 푸터 링크의 누르는 높이는 375px 에서 44px, 1280px 에서 36px 이다.

### 스크린샷 (`evidence/growth/`)
Playwright MCP 는 이 세션에서 권한이 없어서 로컬 `agent-browser` CLI(헤드리스 Chromium, 다크 모드)로 `vite preview` 를 찍었다. 끝난 뒤 서버를 껐다.
- `b-kr-seoul-{375,1280}.png`, `b-kr-seoul-links-{375,1280}.png`(아래쪽 시·도·거리 링크)
- `b-distance-full-{375,1280}.png`, `b-weekend-{375,1280}.png`, `b-entry-open-{375,1280}.png`, `b-kr-{375,1280}.png`
- `b-en-kr-seoul-{375,1280}.png`, `b-en-weekend-{375,1280}.png`
- `b-footer-{375,1280}.png`, `b-footer-en-{375,1280}.png` (앱 푸터 링크 줄)

### 남은 점
- `/weekend/`·`/entry-open/` 은 빌드한 날 기준으로 계산하는 정적 페이지다. 매일 다시 빌드해야 내용이 맞는다(기존 `/entry-open/` 과 같은 방식).
- 1280px 앱 푸터 스크린샷에서는 위쪽에 앱의 기존 고정 필터 패널이 열려 있다. 기존 동작이고 이번 변경과는 관계없다.
