# 접수 알림 제안 마무리

## 파트 A

(파트 A 가 채운다)

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
- 브라우저 확인은 못 했다: `npm run dev` 의 `/?amock=member` 로 열어도 이 환경의 agent-browser 에선 머리말이 계속 "로그인" 으로 보여(흉내 세션이 안 켜짐, 원인 미확인) 이어 하기를 재현하지 못했다. 위 판단은 코드 추적과 `memberGate` 로직 읽기에 의존한다. dev 서버는 종료했다.

### 남은 점
- 알림 신청 목록(alert_subscriptions)을 브라우저에서 못 읽어 "이미 알림 있음"은 이 브라우저의 신청 성공 기록 + 회원 saved_races 로만 안다.
- 목록 행(`RaceRow`)에는 저장 동작이 없다.
- 흉내 회원의 `alertPrefs()` 는 늘 null 이라 "saved_races 켠 회원"은 단위 테스트로만 확인한다.
- `cancelSave()` 는 진행 중인 판정 전체를 무효로 하므로, 'cal' 제안을 읽는 중에 저장을 풀면 그 'cal' 제안도 안 뜬다(플랜 2-0 의 "저장 해제 시 진행 중 판정 무효" 를 그대로 따른 것).

### 다른 파트 메모
- 파트 A: `RaceDetail.tsx` 의 인라인 코드(`nudgeFrom`·`nudgeRace`·`savedAlertsRef`·`nudgeSeq`·`offerNudge` 와 `getAlertPrefs`/`alertNudge` import)를 `useAlertNudge(race, !!session)` 로 교체해야 한다(`src/lib/useAlertNudge.ts` 가 이제 있음, 인터페이스는 PLAN 2-3·2-5 그대로). 훅은 `from`/`offer`/`cancelSave`/`dismiss`/`accept` 를 돌려준다. `accept()` 는 상태만 닫으므로 알림 탭 이동(`goTab('alert', true)`)은 RaceDetail 이 한다.
