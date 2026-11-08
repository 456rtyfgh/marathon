# REVIEW — [CHECK] Dev-3, 2026-11-07 (시작 커밋 174e860)

확인 환경: `npm run build` 통과(seo-pages 월 13·나라 96, prerender 1,120 링크, sitemap 1,232), `npm run lint` 새 경고 없음(MapView 150·152 경고는 daf1131 부터 있던 것).
vite preview + agent-browser 로 390px·1440px, 밝은·다크 모드. 스크린샷·점검 스크립트 `.duo-data/dev3/`.

## 파트 1 (지도·로고·SEO) — 고칠 것 없음
- 국내 지도: 경남·대전·제주 클릭 → 그 시·도로 확대 + 선택(aria-pressed), 같은 곳 다시 클릭 → 풀림·전체, '전체 지도' → 풀림·전체. 대전도 최소 폭으로 둘레가 보임. 선택 색은 밝은 모드 짙은 남색 / 다크 모드 연한 파랑(검정 통채움 아님).
- 세계 지도: 프랑스 첫 클릭 = 유럽 확대(선택 없음), 다시 클릭 = 프랑스 선택·확대, 한국 클릭 = 한국 선택·확대 — 회귀 없음.
- 로고: symbol·logo-512·og.png·favicon·manifest 가 설명(남색 #0E2A47 둥근 타일 + 흰 체크 2줄 + 주황 #FF5A36 82, 소문자 marathoncalendar 굵게/가늘게)과 맞음. 헤더·정적 목록 페이지 다크 반전 정상. 로고 밖 주황 없음.
- SEO: dist 홈·월·나라 110쪽 JSON-LD 전부 파싱 통과(홈 Organization·WebSite·ItemList, 목록 BreadcrumbList·ItemList), 내부 링크 16,273개 중 없는 대회·없는 목록 페이지 0, sitemap 에 /r 1,122·/m 13·/c 96, 새 대회 id 도 들어 있음. robots.txt Sitemap 줄 있음.
- [.duo-data/seo-report.md:5절] 접근성 [보류] 원인을 '다크 ink-3 토큰·요즘 많이 보는 대회'로 잘못 적음 → lighthouse JSON 으로 보니 `RaceRow.tsx:42` 취소된 대회 날짜 칸의 `opacity-50`(#8d939e 가 반쯤 비친 #4e5158) 이라 보고서 문장을 고침 (보고서는 .gitignore 라 커밋 없음)

## 파트 2 (대회 발굴) — 고칠 것 없음
- 새 대회 35개(한국 21 + 이전 팀 일본 14) 모두 data.json 에 있음, id 규칙·city_ko 시·도 약칭 지킴, official_url 에 marathon.pe.kr·runjapan.jp 없음.
- 공식 주소 26개(검색 링크 아닌 것) 직접 받아 봄: 대회명·날짜가 data 와 맞음(화순·새해일출런·아산 이순신은 EUC-KR/이미지라 제목만 확인 — 셋 다 expected).
- 중복: ±7일·같은 시·도, 이름 앞 네 글자로 대조 → 같은 대회 없음.
- MTN 삼일절 접수 2026-10-06~10-12 처럼 이상해 보이는 값은 roadrun 원문 그대로임을 확인.
- 참고: source_url 은 marathon.pe.kr 대신 그 일정 프레임의 본문인 roadrun.co.kr 상세 주소. 대회별 근거가 바로 열려서 그대로 둠.

## 보류
- [보류] 추가 수 35개(목표 60 안팎에 못 미침). 두 출처(marathon.pe.kr=roadrun 목록, runjapan.jp)에 앞으로 열리는 하프 이상·DB 에 없는 대회가 더 없다는 Dev-2 보고를 후보 51개 목록으로 확인함. 더 채우려면 출처를 넓힐지(전마협 일정, RUNNET 등) 사용자 결정 필요.
- [보류] `muju-half` 날짜(DB 2027-03-28, roadrun·전마협 2027-03-07) — Dev-2 보고 그대로, 파트 2 FOLLOW 에서 공식 페이지 확인 후 처리.
- [보류] 취소된 대회 행 날짜 칸 흐림(opacity-50)이 대비 기준 미달 — 일부러 넣은 디자인이라 사용자 확인 필요.
- [보류] seo-report 의 CLS 0.13(요즘 많이 보는 대회가 늦게 끼어듦)·`.github/workflows/deploy 2.yml` 중복 파일 — Dev-1 보고 그대로, 범위·금지 규칙 밖.

## [FOLLOW Dev-2] 파트 1 (지도·로고·SEO) 검토
확인: `npm run build` 통과, lint 새 경고 없음. vite preview(4174) + agent-browser 390px·1440px, 밝은·다크. 스크린샷 `.duo-data/dev2-follow/`.
- [FOLLOW Dev-2] [src/components/MapView.tsx:범례] 국내 지도 범례(적음~많음·선택)가 왼쪽 아래에 고정돼 390px 에서 제주를 통째로 가려 보이지도 눌리지도 않음(daf1131 부터) → 국내 지도만 범례를 오른쪽 아래(남해 바다, 빈 곳)로. 세계 지도는 그대로 왼쪽 아래. 390px 에서 제주 보임·클릭 → 제주 확대·선택, 1440px 다크에서도 아무것도 안 가림 (c9684aa)
- [FOLLOW Dev-2] 7d70038·e0012e4(국내 확대 회귀 수정) 확인 — 고칠 것 없음: 경남·대전·부산·제주 클릭 → 그 시·도로 확대+선택+목록 필터, 같은 곳 다시 클릭 → 풀림·전체, '전체 지도' → 풀림·전체. 세계 지도 프랑스 첫 클릭 = 유럽 확대, 다시 클릭 = 프랑스 선택, 한국 첫 클릭 = 선택·확대 그대로.
- [FOLLOW Dev-2] 로고·SEO 확인 — 고칠 것 없음: 헤더 밝은(남색 타일)·다크(흰 타일) 정상, og.png 남색 바탕 + 흰 타일 심볼 + 소문자 marathoncalendar(굵게/가늘게), `/c/kr/` 390px 다크 로고·대회 링크 299·JSON-LD BreadcrumbList·ItemList 파싱 통과.
- 파트 1 [보류] 3건(취소 행 opacity-50 대비, CLS 0.13, `.github/workflows/deploy 2.yml`)은 그대로 둠: 각각 일부러 넣은 디자인(사용자 확인 필요) / `App.tsx` 본문 구조 변경 / `.github/` 금지 영역.
