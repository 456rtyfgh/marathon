# 개인정보 법적 의무 — 적용 결과 (브랜치 `privacy`)

> **보고서 미확인 — 기본값으로 구현.** `~/Documents/runworld/.duo-data/privacy-report.md` 는 이 세션에서 읽기 권한이 없어 열지 못했다.
> PLAN.md 1절의 ⚑ 확정값으로 구현했다. 보고서와 다른 곳이 있으면 아래 값을 고친다.
> (`.duo-data/` 는 바깥 저장소로 가는 링크라 쓰기가 막혀 이 파일을 작업 폴더에 둔다 — `.duo-data/privacy-applied.md` 로 옮길 것.)

| ⚑ 자리 | 적용한 값 | 근거 |
|---|---|---|
| 시행일 `POLICY_VERSION` | `2026-11-09` | 작업일 |
| 재동의 `RECONSENT_FROM` | `''` (개정 안내만) | 회원 정보는 계약 이행에 필요한 범위(개인정보 보호법 15조 1항 4호) |
| 선택 동의 항목 | 없음 | 선택적으로 모으는 정보가 없음 |
| 후기 처리 | 탈퇴 시 삭제(FK cascade) | 익명화는 0010 `guard_review`·`user_id not null` 을 바꿔야 해 main 보안 작업과 충돌 |
| 알림 메일 | 정보성(광고 아님) — 수신 거부 화면·RPC 없음, 해지는 문의 메일 | 구독한 대회 일정 알림 |
| 쿠키 배너 | 없음(고지만) — 처리방침에 거부 방법 + [GA 끄기/켜기] | 국내법은 사전 동의 배너를 요구하지 않음 |

## 파트 B — 처리방침·약관·쿠키 고지·푸터·영어판

| 항목 | 결과 | 파일 |
|---|---|---|
| 처리방침 `/privacy`, `/en/privacy` | 했음. 시행일·개정 이력·문의 메일. 수집 표는 `policy.ts` 의 `COLLECT_MEMBER`·`COLLECT_ALERT` 를 그대로 그림 | `src/legal/LegalPage.tsx`, `src/legal/PrivacyPolicy.tsx` |
| 처리방침 조항 | 수집 항목·목적·보유기간 / 자동 수집(GA·자체 집계·IP 해시 2일·Cloudflare 로그) / 파기(탈퇴 시 계정·이메일·닉네임·후기 삭제, 대회 요청은 작성자 없이 남음, 같은 이메일 알림 삭제 — 파트 A `delete_my_account` 와 같은 내용) / 알림 메일(정보성, 해지는 메일) / 제3자 제공·처리 위탁·국외 이전(이전 항목·나라·시기와 방법·보유기간·거부 방법) / 이용자 권리(열람·정정·삭제·처리정지 방법, 10일 안 처리) / 쿠키·GA 거부 / 만 14세 미만 / 안전성 확보 조치 / 보호책임자 / 권익침해 구제 기관 / 변경 고지 | `src/legal/PrivacyPolicy.tsx` |
| 이용약관 회원 조항 | 했음. `TermsMember`(가입·계정 관리·닉네임·게시물·탈퇴와 게시물 처리·이용 제한) | `src/legal/TermsMember.tsx` |
| `/terms`, `/en/terms` | 최소 페이지. `TermsPage` 의 `SECTIONS` 배열에 antiscrape 세션 조항을 한 줄로 추가하면 합쳐진다. 글자 모양은 `LegalPage` 가 섹션 바깥에서 입히므로 그쪽 섹션도 같은 모양이 된다 | `src/legal/TermsPage.tsx` |
| 경로 분기 | `main.tsx` 가 `/privacy`·`/terms`(끝 `/` 허용, `/en` 접두)면 App 대신 `LegalPage` 를 동적 import 로 그림(본문은 그 페이지에서만 받음). `_routes.json`·`404.html` 변경 없음(Pages SPA 대체) | `src/main.tsx` |
| GA 거부 | `getAnalyticsConsent`/`setAnalyticsConsent`(localStorage `mc:ga-consent`). `denied` 면 `initAnalytics` 가 gtag 를 불러오지 않고 `track`·`pageView` 도 보내지 않음. 이미 불러온 탭에서 끄면 `consent update denied`, 다시 켜면 `granted`. 자체 집계(쿠키 없음)는 그대로 | `src/lib/analytics.ts` |
| 쿠키 배너 | 안 함(⚑ 기본값) | — |
| 푸터 링크 | 했음. 처리방침(굵게)·이용약관, `footer.2` GA 문장 끝에 '자세히 보기 → /privacy#cookies'. i18n 키는 그대로 | `src/App.tsx`, `src/legal/strings.ts` |
| 영어판 | 했음. `/en/...` 본문에 한글 없음(agent-browser 로 확인) | 위 파일 전부 |

## 파트 A — 가입 동의·개정 안내·탈퇴·SQL (이 문서를 쓸 때 A 는 작업 중·커밋 전이라 파일 기준으로 적음)

| 항목 | 결과 | 파일 |
|---|---|---|
| 가입 동의(필수/선택 분리, 고지 4항목, 만 14세) | `SignupConsent` + `signUp(…, consent)` → `user_metadata` | `src/components/SignupConsent.tsx`, `src/lib/auth.tsx`, `src/components/AuthPanel.tsx` |
| 기존 가입자 개정 안내 | `PolicyNotice`(재동의 없음, 안내만) | `src/components/PolicyNotice.tsx` |
| 회원 탈퇴 | `WithdrawForm` → `rpc('delete_my_account')` | `src/components/WithdrawForm.tsx`, `supabase/migrations/0011_privacy.sql` |
| 알림 구독 고지 | `COLLECT_ALERT` 한 줄 + 처리방침 링크 | `src/components/AlertForm.tsx` |

※ 파트 A 커밋이 끝나면 이 표를 `git log` 기준으로 다시 확인할 것.

## 남은 빈칸 `[ ]` (사이트에 공개되지 않아 채우지 않음)
- 운영자·개인정보 보호책임자 이름 (`PrivacyPolicy.tsx` 9항) — 연락처는 `marathon82@kakao.com` 으로 채움
- Supabase 프로젝트 리전(국외 이전 나라) — 대시보드 Project Settings → General 에서 확인
- 대회 일정 알림 메일 발송 업체 이름·나라 (README 는 'Resend 같은' 이라고만 적혀 있음)

## Cowork 할 일
- `supabase/migrations/0011_privacy.sql` 실행. 실행 전 `select tgname, tgtype from pg_trigger where tgrelid = 'public.race_requests'::regclass` 로 `guard_request` 가 UPDATE 에도 붙어 있는지 확인(붙어 있으면 예전 요청 글이 지금 스팸 규칙에 걸려 탈퇴가 실패할 수 있음).
- 위 `[ ]` 값을 정해 `src/legal/PrivacyPolicy.tsx` 에 넣기.

## 한계
- 동의 기록은 `user_metadata` 에 있어 사용자가 직접 바꿀 수 있다 — 증빙으로는 약함.
- 로컬(`vite preview`)은 `isLocal` 때문에 GA 가 원래 꺼져 있어, GA 를 실제로 막는지는 네트워크로 확인하지 못하고 코드와 localStorage 값으로만 확인했다.
- `/privacy`·`/terms` 는 루트 `index.html` 을 받으므로 JS 가 뜨기 전에는 홈 미리 그림(대회 목록)과 홈 canonical 이 보인다.
