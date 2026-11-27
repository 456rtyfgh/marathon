# 검색 개선 + 관련 검색어 — 보고서 (파트 A)

브랜치 g-search. 파트 B(검색 사전·정확도·인기 검색어 데이터)의 표는 아래 '파트 B 테스트 표' 에 옮겨 두었고, 결정 근거·전체 묶음은 `search-report-b.md` 에 있다.

## 바꾼 파일 (파트 A)

| 파일 | 내용 |
|---|---|
| `src/App.tsx` | `searchWithFixes` 로 검색, 필터 밖 결과 계산(지난 대회 색인은 필요할 때 한 번), `resetFilters()`(검색어는 두고 필터만 해제), 칩 줄·자판 변환 안내·필터 밖 안내 배치, '혹시 이 대회인가요?' 는 전체에서도 0개일 때만, `track('search')` 에 `outside` 추가 |
| `src/components/SearchAssist.tsx` (신규) | "필터 때문에 안 보이는 대회 N개" + [검색어는 두고 필터 풀기] + 대회 최대 5개. 결과 0개(`empty`)·몇 개 안 될 때(`few`, 5개 이하) 두 모양. 필터를 풀어도 안 나오는 끝난 대회만 있으면 버튼 없이 알리기만 |
| `src/components/RelatedChips.tsx` (신규) | 검색창 아래 칩 줄. 검색어 있으면 '관련 검색어', 비면 '많이 찾는 검색어'. 375px 한 줄 가로 스크롤, 1280px 은 줄바꿈. 필터 칩과 같은 모양(검정 단색 선택 없음) |
| `src/lib/relatedSearches.ts` (신규) | `relatedChips`: (가) 표기 사전 같은 묶음 (나) 같은 시·도/나라의 다른 도시 (다) 인기 검색어 중 글자·지역이 겹치는 것 (지역은 그 말 결과의 절반 이상이 같은 곳일 때) (라) 결과 대회 이름에서 자주 나오는 낱말. 출처를 번갈아 최대 6개, 결과 0개·중복·검색어와 같은 말 제외 |
| `src/lib/outsideFilter.ts` (신규) | 필터 밖 결과 계산 (다가오는 대회 먼저, 지난 대회는 최근 순), 기록 분기 `emptyKind` |
| `src/lib/popularSearches.ts` (신규) | `/popular-searches.json` 읽기·검사. 못 받거나 모양이 틀리면 빈 목록 (칩 줄만 안 나옴) |
| `src/lib/analytics.ts` | 결과 0개: `outside > 0` → `search_filtered_empty`, 아니면 `search_empty` |
| `src/components/AdminPanel.tsx` | 통계 라벨: `search_empty` = '전체에서도 결과가 없던 검색어 (추가 후보)', `search_filtered_empty` = '필터 때문에 결과가 없던 검색어 (필터를 풀거나 끝난 대회에는 있음)' |
| `src/components/ResultsAnnouncer.tsx` | 필터 밖 대회 수·자판 변환 안내를 스크린 리더 문구에 추가 |
| `src/i18n/ko.ts`, `src/i18n/en.ts` | `search.*`, `announce.hidden/fixed` (영어 단수형 포함) |
| `supabase/migrations/0024_stat_search_filtered_empty.sql` (신규) | `stat_hit` 허용 이벤트에 `search_filtered_empty` 추가. **적용하지 않았다** |
| `scripts/related-test.mjs` (신규) | 칩·필터 밖 결과 단위 테스트 43개 |
| `evidence/search/*.png` | 스크린샷 |

## 운영자가 해야 할 일

- **`0024_stat_search_filtered_empty.sql` 을 적용해야 `search_filtered_empty` 가 집계된다.** 지금 DB 의 `stat_hit` 은 알려진 이벤트 이름만 기록하므로 적용 전에는 필터 탓 0개가 어느 이벤트로도 남지 않는다(`search_empty` 로 잘못 세지 않음 — `search` 자체는 정상 기록). 적용 전에 운영 DB 의 `stat_hit` 정의가 `0012_security.sql` 과 같은지 확인할 것.
- 이 변경 이전에 쌓인 `search_empty` 에는 필터 탓 0개가 섞여 있다.

## 확인 결과

| 검사 | 결과 |
|---|---|
| `npx tsc -b` | 오류 0 |
| `npm run build` | EXIT 0 |
| `npx oxlint` | 이번에 건드린 파일에 새 경고 없음 (기존 경고만) |
| `node scripts/related-test.mjs` | PASS 43 / FAIL 0 |
| `node scripts/search-check.mjs` | PASS 31 / FAIL 0 / SKIP 0, 평균 2.5ms |
| `node scripts/search-test.mjs` (파트 B, 커밋 7850623 기준 직접 돌림) | PASS 104 / FAIL 0 (색인 2509개, 기준일 2026-11-15) |
| `node scripts/popular-test.mjs` (파트 B) | PASS 33 / FAIL 0 |
| `node scripts/admin-search-test.mjs` | 전부 ok |
| 375px 가로 넘침 | `scrollWidth 375 / innerWidth 375` |
| 눌러 보기 | [검색어는 두고 필터 풀기] → 검색어 유지·필터 해제로 결과 2개 표시, 칩 누르면 검색창 값이 칩 말로 바뀜 |

### 관련 검색어 / 필터 밖 결과 테스트 (`related-test.mjs` 발췌)

| 상황 | 기대 | 결과 |
|---|---|---|
| '서울' 칩 | 최대 6개, 결과 0개 칩 없음, 검색어와 같은 칩 없음 | 영등포 · 서울마라톤 · 안양천 · 마포 · 벚꽃 · 광진 |
| '경주' 칩 | 같은 경북 도시 | 경북 · 문경 · 구미 · 포항 · 울릉 |
| '보스톤' 칩 | 표기 사전 출처 | 보스턴(alias) · boston(alias) · 미국 … |
| 인기 검색어에 결과 0개 말 | 칩에 안 나옴 | 통과 |
| 검색어 비었을 때 | 인기 순서대로, 결과 있는 것만 | 통과 |
| 인기 목록이 비었을 때 | 빈 검색어는 칩 없음, 검색어 있으면 (가)(나)(라)만 | 통과 |
| 필터 밖 '경주' (필터로 전부 숨김) | 12개, 다가오는 11 + 지난 1, 날짜순 | 통과 |
| 보이는 대회는 제외 | 통과 | 통과 |
| 전체에서도 0개 ('ㅋㅋㅋㅋㅋ') | `search_empty` 쪽 | 통과 |
| 칩 계산 속도 | 평균 50ms 이하 | 1.6ms |

## 스크린샷 (직접 열어 확인함)

필터 켠 상태는 주소 `?scope=abroad` (해외 탭) 로 만들었다. `a4-popular-empty-*` 는 `public/popular-searches.json` 이 생기기 전이라 `dist/` 에만 임시 파일을 두고 찍은 것이다. 지금 저장소 파일은 `source: "seed"` 8개(파트 B)이고, 아래 `fix-a`·`fix-a2` 는 그 파일 그대로 찍었다.

| 장면 | 375px | 1280px |
|---|---|---|
| 필터 켠 채 '경주' → 필터 밖 안내 10개 (결과 2개 + 아래 줄) | `evidence/search/a1-filtered-gyeongju-375.png` | `evidence/search/a1-filtered-gyeongju-1280.png` |
| 필터 켠 채 '경주 남산' → 결과 0개 → 필터 밖 안내 | `evidence/search/a2-empty-filtered-375.png` | `evidence/search/a2-empty-filtered-en-1280.png` (영어) |
| '서울' 관련 검색어 | `evidence/search/a3-related-seoul-375.png` | `evidence/search/a3-related-seoul-1280.png` |
| 빈 검색창 인기 검색어 | `evidence/search/a4-popular-empty-375.png` | `evidence/search/a4-popular-empty-1280.png` |
| 'rhvm' → '고프' 로 찾은 결과 | `evidence/search/a5-rhvm-375.png` | `evidence/search/a5-rhvm-1280.png` |
| 'rhrnfu' → '고구려' | `evidence/search/a6-rhrnfu-375.png` | — |
| '통영' (결과 1개 + 더 찾은 건 끝난 대회뿐) → "이미 끝난 대회 2개도 찾았습니다", 버튼 없음 | `evidence/search/a7-few-past-tongyeong-375.png` | `evidence/search/a7-few-past-tongyeong-1280.png` |

검수 때 다시 찍은 것 (`evidence/search/fix-a/`, 주소 `?q=…&scope=abroad&dist=full` 로 필터를 켠 상태): `empty-375.png`·`empty-1280.png`(해외+풀 '경주' → 필터 밖 12개), `empty-en-375.png`(영어), `gyeongju-abroad-375.png`(결과 2개 + 아래 안내), `seoul-375.png`·`seoul-1280.png`, `popular-375.png`(빈 검색창 인기 검색어), `rhvm-375.png`. 칩 줄·자판 변환 안내 줄이 넓은 화면에서 목록보다 8px 더 들어가던 것을 맞췄다.

2차 검수 때 다시 찍은 것 (`evidence/search/fix-a2/`, 해외 탭을 눌러 필터를 켠 뒤 검색): `gyeongju-filtered-375.png`·`gyeongju-filtered-1280.png`(해외 탭 + '경주' → 결과 2개 + "필터 때문에 안 보이는 대회 10개"), `gyeongju-cleared-375.png`·`gyeongju-cleared-1280.png`([검색어는 두고 필터 풀기] 를 누른 뒤 — 검색어 '경주' 그대로, 전체 탭, 결과 11개), `seoul-375.png`·`seoul-1280.png`, `popular-375.png`·`popular-1280.png`, `rhvm-375.png`·`rhvm-1280.png`, `en-tokyo-domestic-375.png`(영어, 국내 탭 + 'tokyo' → "25 races hidden by your filters"), `en-seoul-375.png`. 화면 값으로도 확인: 375·1280 모두 `scrollWidth = innerWidth`, 칩은 6개 이하, 칩을 누르면 검색창 값이 바뀜, 해외 탭 + `rhvm` 은 "필터 때문에 안 보이는 대회 1개" + '고프' 안내, `부피아` 는 기존 '찾지 못했습니다' 화면만(칩·필터 안내 없음). 필터가 하나도 없을 때 '필터 때문에 안 보이는 다가오는 대회' 가 생기는 검색어가 있는지 대회 이름·도시에서 뽑은 검색어 30,713개(한국어·영어 색인 각각)로 확인했고 0건이었다.

## 파트 B 테스트 표 (`search-report-b.md` 에서 옮김 — `node scripts/search-test.mjs` 직접 돌린 결과 PASS 104 / FAIL 0)

필터를 꺼도 0개였던 20개:

| 검색어 | 기대 | 실제 |
|---|---|---|
| 부피아 | 0개 정상 | 0 PASS |
| 호롤 | `honolulu`, 전부 호놀룰루, nyc·tokyo 없음 | 2개 (honolulu, hapalua-half) PASS |
| 전라남도 | 40개 이상, 전부 국내 전남·광주, seoul-marathon 없음 | 57 PASS |
| 경상도 | 100개 이상, 전부 경북·경남·대구·부산·울산, seoul-marathon 없음 | 151 PASS |
| 한강짐런 | 0개 정상 | 0 PASS |
| 뉴요 | `nyc` 포함, tokyo·honolulu 없음 | 9 PASS |
| 파나코니아 | 정확히 파타고니아 3개 | 3 PASS |
| 나눔레이스 서울 | 0개 정상 | 0 PASS |
| 경기국제 | 정확히 `suwon-intl-half` | 1 PASS |
| 대련 | 정확히 `dalian` | 1 PASS |
| 경주 동아 마라톤 | 정확히 `gyeongju-intl` | 1 PASS |
| 세계6대 | 정확히 해외 메이저 8개, 국내 메이저 없음 | 8 PASS |
| 새해 동계 | 0개 정상 | 0 PASS |
| newbq | 0개, 자판 변환 안 씀 | 0, fixed 없음 PASS |
| 교다 | 0개 정상 | 0 PASS |
| rhvm | `asics-goprun`, 변환 '고프' | 1, fixed '고프' PASS |
| 경주 동아 | 정확히 `gyeongju-intl` | 1 PASS |
| 국제동계 | 0개 정상 | 0 PASS |
| 잔시문 | 0개 정상 | 0 PASS |
| 경주경주 | `경주` 와 같은 결과 | 11 = 11 PASS |

상위 검색어(서울 ≥200 · 경주 ≥11 · 대구 ≥14 · 인천 ≥28 · 도쿄 ≥25 · 부산 ≥33 · 시카고 ≥2 · 보스턴 ≥3 — 다가오는 대회만 색인한 최소 개수), 지역어, 별칭·오타, 접두어 과확장, 반복 글자, 자판 변환 묶음의 기대값과 근거(경주동아 별칭의 출처 포함)는 `search-report-b.md` 의 표 그대로다.

## 동작 정리

- 결과 0개 + 필터 밖에 있음: 빈 결과 화면 대신 필터 밖 안내(대회 추가 요청 버튼·'혹시 이 대회인가요?' 는 나오지 않음). 전체에서도 0개: 기존 화면 + '혹시 이 대회인가요?'.
- 결과 1~5개 + 필터 밖에 있음: 목록 아래 같은 안내와 대회 최대 5개, '외 N개가 더 있습니다'.
- 다가오는 대회에는 없고 끝난 대회만 있으면 "이미 끝난 대회 N개만 찾았습니다" (버튼 없음).
- 칩은 `#list` 맨 위(고정 도구 막대 높이 불변). 인기 검색어 계산(최대 80개 검색)은 목록이 뜬 뒤 한가할 때 미리 해 둔다.

## 남은 문제 / 메모

- `public/popular-searches.json` 은 지금 `source: "seed"` 8개(실제 집계가 아닌 확인용 순위값)다. 배포 때 `npm run snapshot` 이 실제 값으로 덮어쓴다. 받지 못해 목록이 비면 빈 검색창에는 칩 줄이 나오지 않는다(의도한 동작).
- 영어 화면의 칩은 영어 색인으로 확인되는 이름(예: 'Gyeongju, Gyeongbuk')만 낸다. 인기 검색어와 표기 사전의 다른 표기는 한국어라 영어 화면에서도 한글 칩('서울', '도쿄')이 나온다 — 영어 화면에서 한글 칩을 뺄지는 정하지 않았다.
- 결과 대회 이름에서 뽑는 키워드 칩(라)은 낱말 빈도만 보므로 'Peace', '바이' 처럼 주최·시리즈 이름이 아닌 말이 섞일 수 있다(누르면 결과는 나온다).
- 다른 파트 메모: 없음 (B 의 인터페이스 `searchWithFixes`·`aliasSiblings` 는 약속대로 동작).
