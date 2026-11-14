# 접수 알림 제안 마무리

## 파트 A

제안 UI·자리·접근성·훅 연결.

### 바꾼 파일
- `src/components/AlertNudge.tsx` — `onAccept(box)`·`onDismiss(box)` 가 제안 상자(box)를 넘긴다(부모가 "포커스가 제안 안에 있었는지" 보려고). 모양·문구는 그대로.
- `src/components/RaceDetail.tsx`
  - 인라인 제안 코드(`nudgeFrom`·`nudgeRace`·`savedAlertsRef`·`nudgeSeq`·`offerNudge`, `getAlertPrefs`/`alertNudge` import)를 `useAlertNudge(race, !!session)` 로 교체(PLAN 2-5). `grep offerNudge|nudgeSeq|savedAlertsRef` → 없음.
  - 포커스: [닫기] 로 사라지면 포커스가 제안 안(또는 body)에 있었을 때만 제안을 띄운 버튼으로 보낸다(save = 화면에 보이는 관심 버튼(PC 위쪽 / 휴대폰 아래 줄), cal = 캘린더 저장 버튼). [알림 받기] 는 알림 탭 내용 상자(`tabIndex=-1`, 링 없음)로 보낸다. 뜰 때는 포커스를 옮기지 않는다.
  - 렌더 조건: 취소 대회·알림 탭(`view==='alert'`)에서는 그리지 않는다. 알림 탭을 보는 중 저장해서 `from` 이 채워지면 effect 가 바로 닫아, 다른 탭으로 나올 때 갑자기 뜨지 않게 했다(브라우저에서 이 현상을 발견해 고침).
- `ui.tsx`·`ko.ts`·`en.ts`: 바꾸지 않았다(휴대폰 닫기 버튼은 이미 44×44, 문구 키 추가 불필요).

### 확인 결과
- `npm run build` 성공, `npx tsc -b` 오류 0, `share-test`·`distance-test`·`status-tone-test`·`alert-nudge-test`(27/27) 통과. 범위 밖 파일 diff 없음.
- 브라우저(agent-browser, `wrangler pages dev dist` 로컬 8788, 모두 localStorage 비움 상태에서 시작. 375×812 / 1280×800):
  - 저장 → 제안 뜸(ko·en), 가로 스크롤 없음(`scrollWidth==innerWidth` 375·1280).
  - 닫기 → `marathon-cal:alert-nudge-dismissed=["nuaille-semi"]`, 새로고침 뒤 저장 해제→재저장해도 안 뜸. 기록 지우면 다시 뜸.
  - 저장 해제 → save 제안 닫힘. 접수 마감(`chuncheon-sunset-island-give-run`)·취소(`bagan`) 대회는 저장해도 안 뜸.
  - 비슷한 대회(몽생미셸)로 전환 → 제안 사라짐. 알림 탭에서 저장 → 안 뜸, 정보 탭으로 돌아와도 안 뜸.
  - [알림 받기] → 알림 탭 + 비회원 MemberGate. 포커스는 내용 상자로.
  - 휴대폰 닫기 버튼 getBoundingClientRect = 44×44, [알림 받기] 버튼 95×44. Tab 으로 아래 줄 '공식 홈페이지' 에서 Shift+Tab → 닫기 → [알림 받기] 순으로 도달. 닫기를 Enter 로 누르면 포커스가 '관심 대회' 버튼으로 간다. 포커스 링 보임(`a-375-ko-focus-close.png`).
  - 휴대폰 본문을 900px 내린 상태(`scrollTop=900`)에서 아래 줄 저장 → 제안이 버튼 바로 위에 보임.
  - 캘린더 추가 뒤 제안(회원): `NODE_ENV=development npx vite --port 5173` + `/r/nuaille-semi?amock=member&nick=tester`. 구글 캘린더를 누르면 캘린더 고르기 아래에 제안이 뜨고, 닫기 → 포커스가 '캘린더에 저장' 버튼으로, 기록 저장됨.
- 목록 행: 코드 변경 없음(저장 표시 아이콘만 있고 저장 동작 없음).
- 색·이모지: 새 색·이모지 없음(기존 `bg-surface`·`text-ink*`·`Button quiet`).

### 스크린샷 (`evidence/alert/`)
`a-1280-ko-save-nudge.png`, `a-1280-en-save-nudge.png`, `a-1280-ko-cal-nudge.png`, `a-1280-ko-nudge-to-alert.png`,
`a-375-en-save-nudge.png`, `a-375-ko-save-nudge-scrolled.png`, `a-375-ko-cal-nudge.png`, `a-375-ko-nudge-to-alert.png`, `a-375-ko-focus-close.png`, `a-375-en-focus-close.png`

### 남은 점
- 알림 신청 목록은 브라우저에서 못 읽어, 다른 기기에서 신청한 대회에는 제안이 한 번 뜰 수 있다. 흉내 회원은 saved_races 를 늘 null 로 줘서 "saved_races 켠 회원"은 단위 테스트로만 확인했다.
- 캘린더 쪽 제안은 구글 캘린더 경로로만 눌러 봤다(.ics 내려받기는 서버가 필요한 회원 기능이라 흉내 DB 로는 `downloadIcs` 성공을 만들지 않음). 두 경로 모두 같은 `onAdded` 를 부른다.
- 제안은 `role="status"` 로 뜬다. 스크린리더 실제 낭독은 확인하지 못했다.

### 다른 파트 메모
- 파트 B 보고서의 "흉내 로그인(`?amock=member`)이 안 켜짐, 원인 미확인" 의 원인: 이 셸에는 `NODE_ENV=production` 이 걸려 있어 `npx vite` 가 `import.meta.env.DEV=false` 로 뜬다. `NODE_ENV=development npx vite --port 5173` 로 띄우면 흉내 로그인이 켜진다(위 캘린더 확인에 사용). 이어 하기 왕복을 브라우저로 확인하려면 이 방법을 쓸 수 있다.
- 확인 중 `agent-browser close --all` 로 다른 세션의 브라우저(og-b, g2)도 닫았다.

## 파트 B

조건 판정·흐름·경쟁 상태.

### 바꾼 파일
- `src/lib/alertNudge.ts` — `shouldOfferNudge(race, today?)` 추가만 (기존 export·키 그대로)
- `src/lib/alertNudgeFlow.ts` (새) — React·Supabase 를 import 하지 않는 순수 흐름 `createNudgeFlow({getPrefs, timeoutMs, today})` → `offer / cancel / resetMember`
- `src/lib/useAlertNudge.ts` (새) — flow 를 감싼 훅 `useAlertNudge(race, signedIn)` → `{from, offer, cancelSave, dismiss, accept}`
- `scripts/alert-nudge-test.mjs` (새) — 판정·경쟁 상태·localStorage 검사 27개
- `AlertForm.tsx`, `memberGate.ts`, `App.tsx` 는 고칠 곳이 없어 건드리지 않았다.

### 구현 요약
- offer 는 호출마다 `seq` 를 올려 가장 마지막 호출만 유효하다. `cancel`(저장 해제·대회 전환)과 `resetMember`(로그인 상태 변화)도 `seq` 를 올려 읽는 중인 판정을 버린다.
- `resetMember` 는 `epoch` 도 올려, 그 전에 시작한 읽기의 늦은 값은 saved_races 캐시에 들어가지 않는다.
- saved_races 는 flow 하나(패널이 열린 동안)에서 한 번만 읽는다. reject·동기 throw 는 "알림 없음"(뜸), 4초 초과는 "이번엔 안 뜸"이고 캐시하지 않는다(타이머는 정리).
- 읽고 난 뒤 닫기·신청 기록이 생겼는지 `shouldOfferNudge` 를 한 번 더 본다.
- 훅: `race.id` 바뀜 → `from=null` + `flow.cancel()`, `signedIn` 바뀜 → `from=null` + `flow.resetMember()`, 언마운트 → `cancel()`. `cancelSave` 는 `'save'` 만 닫고 `'cal'` 은 둔다. `accept` 는 기록하지 않는다(재제안 규칙), `dismiss` 만 `dismissNudge` 를 쓴다.

### 확인 결과
- `node scripts/alert-nudge-test.mjs` → `통과 27/27개`
  - 접수 상태 판정(data.json 실제 대회, today=2026-11-14): 접수 중 `new-orleans-marathon-nov`, 접수 예정 `seoul-hopidream-winter`, 일정 미공개(예상 날짜) `shirakawa-furusato-marathon`, 일정 미공개(날짜 없음) `daejeon-trail-rolling-trail`, 마감일만 `central-florida-legends-marathon`, 시작일만 `stromlo-running-festival-trail`, 접수 중인데 날짜 없음 `daegu-global-6k-for-water` → 참. 접수 마감 `chuncheon-sunset-island-give-run`, 조기 마감 `charlotte-marathon`, 취소 `bagan`, 지난 대회 `seoul-orange-run` → 거짓. 전체 2661개 대회가 `nudgeEligible` 규칙과 일치.
  - 경쟁 상태 ①~⑤(저장 해제·다른 대회 offer·resetMember·빠른 반복·읽는 중 닫기), reject→참, 시간 초과→거짓·캐시 안 함, 캐시 재사용·resetMember 뒤 재조회, saved_races true→false.
  - localStorage: 읽기 throw·쓰기 throw·JSON 깨짐·배열 아님·localStorage 없음 → 예외 없음, 두 키 모두 500개 상한. "알림 받기만 누르면 기록 없음 → 다시 뜸", "닫기·신청 성공 뒤엔 안 뜸" 고정.
- `node -e "import('./src/lib/alertNudgeFlow.ts')"` → 오류 없음(React·Supabase 미의존)
- `npm run build` → 성공(`tsc -b` 포함, 마지막 단계 evidence 까지 통과), `npx tsc -b` → 오류 0
- `share-test.mjs`·`distance-test.mjs`·`status-tone-test.mjs` 통과
- 범위 밖 파일(worker·supabase·public·shareText·member·memberMock·RaceRow·package*.json) 변경 없음

### 이어 하기 왕복 (코드 추적) — 끊김 없음
1. 제안 [알림 받기] → RaceDetail `goTab('alert', true)` → `AlertForm.tsx:90` 비로그인이면 `<MemberGate raceId action="alert" onLogin>`
2. `MemberGate.tsx:33,36` → `onLogin('in'|'up', {raceId, action:'alert'})`
3. `App.tsx:134-137` `openLogin` → `saveIntent`(localStorage `marathon-cal:after-login`, `memberGate.ts:25`) → 로그인 시트
4. 로그인으로 uid 생김 → `App.tsx:183-188` `peekIntent()` → `setResume`
5. `App.tsx:193-200` 대회 목록에서 찾아 `setSelected(r)` + `setPendingAction({raceId, action})`, `App.tsx:1174` `initialAction`
6. `RaceDetail.tsx` `initialAction==='alert'` → `setTab('alert')` (로그인 상태가 되면 훅이 `resetMember()` 로 이전 판정·캐시를 버림)
- 30분 지난 의도·모양이 틀린 값은 `peekIntent` 가 버리고, 한 번 쓰면 `clearIntent`(`App.tsx:189-191`).
- 브라우저로는 이 왕복을 재현할 수 없다. 흉내 로그인이 안 켜지던 원인은 이 셸의 `NODE_ENV=production` 이다(`NODE_ENV=development npx vite` 로 띄우면 켜진다, 파트 A 확인). 그런데 흉내(`src/lib/auth.tsx` `devAuthMock`)는 페이지가 처음부터 로그인된 상태로 시작한다. 이어 하기는 `App.tsx:183-188` 의 "uid 가 바뀔 때"에만 시작되므로 흉내로는 비로그인→로그인 전환이 생기지 않는다. 실제 로그인은 세션이 비어 있다가 채워지므로 전환이 일어난다. 위 판단은 코드 추적에 의존한다. dev 서버는 종료했다.

### 남은 점
- 알림 신청 목록(alert_subscriptions)을 브라우저에서 못 읽어 "이미 알림 있음"은 이 브라우저의 신청 성공 기록 + 회원 saved_races 로만 안다.
- 목록 행(`RaceRow`)에는 저장 동작이 없다.
- 흉내 회원의 `alertPrefs()` 는 늘 null 이라 "saved_races 켠 회원"은 단위 테스트로만 확인한다.
- `cancelSave()` 는 진행 중인 판정 전체를 무효로 하므로, 'cal' 제안을 읽는 중에 저장을 풀면 그 'cal' 제안도 안 뜬다(플랜 2-0 의 "저장 해제 시 진행 중 판정 무효" 를 그대로 따른 것).

### 다른 파트 메모
- (해결됨, b1eda5e) 파트 A 가 `RaceDetail.tsx` 의 인라인 제안 코드를 `useAlertNudge(race, !!session)` 로 교체했다. `offer`·`cancelSave`·`accept`·`dismiss`·`from` 을 PLAN 2-5 대로 쓴다. 알림 탭 이동은 RaceDetail 이 한다.
