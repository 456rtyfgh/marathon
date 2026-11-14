# growth-1114 보고

## 파트 A

(파트 A 가 채운다)

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
