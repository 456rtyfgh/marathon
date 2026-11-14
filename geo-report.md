# geo-report — SEO·GEO 노출 늘리기 (파트 B)

기준: 브랜치 `g-geo`, 데이터 2026-11-14 (대회 2,661개). 파트 A 보고(`geo-report-a.md`)는 이 글을 쓸 때 아직 없어 A 몫은 "geo-report-a.md 참조"로 두고, `dist` 에서 직접 센 개수만 적는다.

## 새 페이지 (dist 에서 센 값)

| 종류 | 한국어 | 영어 | 담당 |
|---|---|---|---|
| `/about/` 마라톤 캘린더란 | 1 | 1 | B |
| `/faq/` 자주 묻는 질문 (질문 12개) | 1 | 1 | B |
| `/m/<ym>/<시·도>/` (대회 3개 이상 조합만) | 91 | 91 | A |
| `/distance/5k/` | 1 | 1 | A |
| `llms.txt` | 1 | - | A 가 만들고 B 가 빌드 체인·헤더 연결 |

- sitemap: 5,716 → 5,904개(+188 = 91×2 + 5k 2 + about/faq 4). about/faq 의 lastmod 는 글을 고친 날(`INFO_UPDATED` 2026-11-14)로 고정해 매일 IndexNow 로 다시 나가지 않게 했다.
- 날짜에 따라 있다·없다 하는 `/weekend/`·`/entry-open/` 은 `LANDINGS` 로 확인해 있을 때만 about/faq 안에서 링크한다.

## IndexNow

- 키 파일: `public/3fe389a4c8bcd4ffe8bbea03cdb0f4e4.txt` (내용 = 키 한 줄, 개행 없음). 키는 `scripts/indexnow-config.mjs` 상수. 공개 값이라 비밀 아님.
- `scripts/indexnow.mjs`: 직전 sitemap(`--prev`, 기본 https://marathon82.com/sitemap.xml)과 `dist/sitemap.xml` 을 비교해 새로 생기거나 lastmod 가 바뀐 `https://marathon82.com/` 아래 주소만(새 주소 먼저, 변경은 lastmod 최신순, 최대 10,000) `api.indexnow.org`·`searchadvisor.naver.com` 에 POST. 이전 sitemap 을 못 받거나 비면, 키 파일이 없거나 다르면 아무것도 보내지 않고 경고만. 모든 실패는 경고 + exit 0. `--dry-run` 은 전송 없이 목록만 출력.
- `deploy.yml`: Build 앞에 'Save previous sitemap', Pages 배포 바로 다음에 'IndexNow'(`continue-on-error: true`), Build env 에 `BING_SITE_VERIFICATION: ${{ vars.BING_SITE_VERIFICATION }}`. 기존 스텝·순서는 그대로.
- 확인: `node scripts/indexnow-test.mjs` 13개 통과(네트워크 없음). 픽스처 이전 sitemap(about/faq/월×시·도/5k 제거 + 대회 3개 lastmod 변경)으로 `--dry-run` → 새 188 + 변경 3 = 191개만 출력, 전송 없음. **실제 전송은 실행하지 않았다.**

## 빙·수집 요청

- 빙 meta 자리: `scripts/info-lib.mjs` 의 `BING_SITE_VERIFICATION = ''`(또는 환경변수). 빈 값이면 `msvalidate.01` 을 출력하지 않는다. 임시 값을 넣고 빌드해 홈 한·영에만 나오는 것, 비우고 다시 빌드해 사라지는 것을 확인하고 되돌렸다. `BingSiteAuth.xml` 은 만들지 않았다. `index.html` 에는 자리 안내 주석만.
- `scripts/crawl-priority.mjs`: 표준출력에 URL 만, 기본 20개, 파일을 만들지 않는다(`--verbose` 설명은 표준오류). 순서 ① 최근 추가·변경 대회 ② 새 검색어 페이지 ③ 접수 임박 대회. **한 종류가 20개를 다 채우면 뒤 종류가 안 나가므로 종류별 몫(① 절반 ② 4분의 1 ③ 나머지, 남으면 다른 종류로 채움)을 뒀다** — 출력 순서는 ①②③. 한국어 주소만, 취소·이미 끝난 대회 제외. 이전 sitemap 이 없으면 ①은 `last_verified` 최신순, ②는 이번 작업의 새 종류(`/m/<ym>/<id>/`·5k·about·faq).

## 구조화 데이터

- 홈(한·영)에 Organization(@id `https://marathon82.com/#organization`, alternateName, 로고, 연락처, sameAs = 인스타 하나) + WebSite(@id, publisher @id, SearchAction `?q=` — 앱이 실제로 읽는 주소) 한 벌씩. 값은 `info-lib.mjs` 의 `orgLd`·`websiteLd` 가 원본이고 `prerender.mjs` 가 빌드 때 교체(기존 `ldToEn` 대체), `index.html` 정적 값도 같게 맞춤.
- `/about/`(한·영)에 같은 Organization 을 `AboutPage.mainEntity` 로, 그 밖 페이지는 Organization 전체 정의 없음. `/faq/` 는 FAQPage + BreadcrumbList(본문이 주 — JSON-LD 는 보조).
- 유튜브(런약사) 채널 주소는 저장소·브리프에 없어 sameAs·링크에 넣지 않았다(소개 문장에 이름만).

## 확인 결과

- `npm run build` EXIT 0(체인: tsc → vite → seo-pages → info-pages → prerender → sitemap → llms → rss → pages → terms → evidence). `npx tsc -b` 0 오류.
- `node scripts/geo-check.mjs` 통과: html 586개(검사 584, noindex·넘김 2), title 584종 고유, canonical 자기 주소, hreflang ko/en/x-default 상호 참조, JSON-LD 전부 `JSON.parse`, 내부 링크 대상 존재(`/r/<id>`는 data.json id), 이모지 0, h1 1개, about 수치가 data.json 직접 센 값과 일치, FAQ 질문 수 = FAQPage 수, description 160자 이하, 키 파일 내용=키, 홈 Organization·WebSite 가 info-lib 값과 같음, 빙 meta 없음, robots.txt HEAD 와 같음, llms.txt 에 `/r/` 없음. (geo-check 는 일부러 깨 보지는 않았고, 처음 돌렸을 때 `/privacy`·`/en/privacy`(앱 주소)와 동시 빌드 흔적 파일을 잡아 앱 주소 허용 목록·흔적 경고로 고쳤다.)
- 기존 검사 회귀: `seo-pages-check`·`seo-data-check`·`distance-test`·`status-tone-test` 통과.
- `deploy.yml` YAML 검증: ruby·python yaml·node yaml 파서를 이 환경에서 쓸 수 없어(권한·패키지 없음) **파서로는 돌리지 못했다.** 바뀐 구간을 눈으로 확인(들여쓰기·키), 기존 스텝 순서 그대로. 사용자가 `ruby -ryaml -e 'YAML.load_file(".github/workflows/deploy.yml"); puts "ok"'` 로 한 번 확인할 것.

## 스크린샷 (375/1280, 직접 열어 확인 — 가로 스크롤 없음, 겹침·잘림 없음)

`evidence/geo/` 아래: `b-about-ko-375.png`·`b-about-ko-1280.png`·`b-about-en-375.png`·`b-about-en-1280.png`·`b-faq-ko-375.png`·`b-faq-ko-1280.png`·`b-faq-en-375.png`·`b-faq-en-1280.png`. 새 검색어 페이지·대회 상세 스크린샷은 A 것(`a-*.png`)을 가리킨다. Playwright MCP 권한이 없어 `agent-browser` CLI 로 찍었다(브라우저가 다크 모드라 어두운 배경). `vite preview`(4176)는 종료했다.

## 알아둘 것·사용자가 나중에 할 일

- 본문에 쓴 기능 설명(접수 알림 30·14·7·3·1일 전 + 휴대폰 알림, 캘린더 저장·내 일정 구독은 회원 전용, 대회 추가 요청·마감 제보, 매일 03:23 KST 갱신·월요일 추가 요청 확인)은 `src/` 와 `deploy.yml` 로 확인한 것만 적었다. "런약사 유튜브에 소개된 적 있음"은 브리프의 사실이라 코드로 확인하지 못했다.
- 대회 상세(`/r/<id>`)는 워커가 `dist/index.html` 을 바탕으로 만들어 홈의 Organization·WebSite 블록이 그대로 들어간다(A 가 `publisher` 에 같은 `@id` 를 달아 같은 개체로 합쳐진다). 충돌은 없다고 보지만 서치콘솔 '리치 결과' 확인에서 보면 좋다.
- 빙: 서치콘솔 가져오기로 등록하거나, 값을 받으면 GitHub 저장소 변수 `BING_SITE_VERIFICATION` 에 넣으면 다음 배포부터 meta 가 나온다.
- 유튜브 채널 주소가 확정되면 `info-lib.mjs` 의 `SAME_AS` 에 추가.
- 네이버 서치어드바이저 수동 수집 요청: 배포 뒤 `node scripts/crawl-priority.mjs --prev <배포 전 sitemap 파일> --verbose` 출력을 하루 20개씩 넣는다(화면 출력뿐, 파일은 만들지 않음).
- 앱 푸터에 about/faq 링크를 넣을지는 사용자 결정(React 화면 요소 추가 금지 규칙으로 안 넣음). 정적 페이지 푸터·홈 첫 화면 미리 넣은 nav·sitemap 으로 연결했다.
- IndexNow 첫 배포에서는 새 페이지 약 188개 + 바뀐 대회가 한꺼번에 나간다(1만 상한 안).
