# 조기 마감 조사 — 파트 A (국내 27 + 해외 race_date 순 앞 50 = 77개), 2026-11-07

입력 방법: DB 현재 row 를 REST 로 받아 `sold_out_on`·`source_url`·`last_verified` 만 바꿔 `upsert.py race a-all.json` (도구는 **배열 JSON** 을 받는다. 객체 하나를 주면 AttributeError). 결과 ok 9 fail 0, REST 로 재확인함.

## 마감 (sold_out_on 입력, 9개)
| id | sold_out_on | 근거 URL | 근거 문구 |
|---|---|---|---|
| yeongcheon-dam | 2026-11-07 (날짜 없음→확인일) | http://runyc.kr/ | "참가 신청이 마감되었습니다." |
| florence | 2026-08-27 | https://www.firenzemarathon.it/e-sold-out-la-42-estra-firenze-marathon/ | "Le iscrizioni alla Estra Firenze Marathon sono chiuse per sold-out." (27 Aug 2026) |
| macau | 2026-11-07 (날짜 없음) | https://www.macaomarathon.com/zh/ | "2026銀河娛樂澳門國際馬拉松的所有項目報名已額滿" |
| komatsushima-gyakufu-half | 2026-08-03 | komatsushima-marathon.jp/info/ハーフ種目エントリー終了のお知らせ | "ハーフ種目のエントリーが定員（850名）に到達したため、エントリーを終了" (10km 도 7/27 종료) |
| tokai-half | 2026-07-30 | https://www.tokai-halfmarathon.com/ | 2026.07.30 "「ハーフマラソン」の部は定員に達しました！" (10km 8/2, 2km 7/27) |
| tokyo-newyear-half | 2026-11-07 (날짜 없음) | https://hitech-half-marathon.net | "ハーフマラソンの部は、一般・プレミアムともに定員に達しましたので、エントリーを締め切らせていただきます" (10km 10/19) |
| katsuta | 2026-10-13 | https://www.katsutamarathon.jp/ | 2026.10.13 "マラソンの部《一般エントリー・ふるさと納税枠》受付終了いたしました。" (공식 마감 10/31 전) |
| hamamatsu-city-marathon | 2026-11-04 | https://www.hamamatsu-city-marathon.com/ | "11月4日現在【ハーフ・5km】締切" (종목 하프·5km 모두) |
| seville | 2026-04-24 | https://www.zurichmaratonsevilla.es/en/zms-news-item/leer/260424-sold-out-bibs | "The 2027 Zurich Seville Marathon sells out its race bibs with a record field of 20,000 runners" |

## 마감 아님 / 정상 마감 / 부분 (바꾸지 않음)
| id | 결과 | 메모 |
|---|---|---|
| ishigaki-island | 정상 마감 | 11/2 受付終了 공지 — 마감일 10/31 이후, 정원 사유 아님 (10km 릴레이만 정원) |
| nishio-marathon | 정상 마감 | 11/1 全種目受付終了 — 마감일 10/31 이후 |
| kochi-ryoma | 정상 마감 | "エントリー受付は終了" 날짜·사유 없음, 마감일 10/31 지남 |
| izumisano-kix-senshu | 부분 | 30km 만 정원 (10/7). 데이터 종목은 '하프' — 종목 표기 재확인 필요 |
| au-cadbury-marathon | 부분 | 하프만 Sold out, 마라톤은 접수 중 |
| ibusuki | 부분 | 펀런만 종료, 본 대회 PLUS 엔트리 11/1~11/20 접수 중 |
| daejeon-seogu | 열림/미확인 | "접수 마감 임박!" (9/28 공지) 만 있음 |
| korea-season-race | 미확인 | **대회 개최 취소 공지** 있음 ("대회 개최 취소 안내") — 조기 마감 범위 밖, 관리자 확인 필요 |
| k-geosang-trail | 열림 | 홈페이지 접수기간 ~11.15, DB entry_closes 11-21 (불일치, 범위 밖) |
| seoul-eoksaepul | 열림 | "현재 참가 접수 중" |
| incheon-marathon, muju-firefly-peace, busan-bridge, one-more-run, nago-challenge-run, it-conegliano-prosecco, hochiminh, usa-jingu-marathon, fukushima-j-village-half-marathon, huntsville-rocket-city, chiangmai, eg-luxor-marathon, bangkok, winter-spine-trail, tateyama-wakashio, kanagawa-marathon, moriya-half, tallahassee-marathon, saitama, jackson-mississippi-blues, okawa-kinoka-marathon, okinawa, ome-30k, onomichi-setoda-lemon, fukaya-city-half, inuyama-yomiuri-half, fukuoka-umi-no-nakamichi-haruka, kounosu-pansy, showa-kinen-flower, penang, cim | 열림 / 마감 문구 없음 | |
| jeungpyeong-retro-run, sangju-persimmon, namwon-chunghyang, gimhae-gaya, jinju-marathon, gijang-sea, miryang-arirang, nice-cannes | 미확인 | SPA·빈 페이지 (본문 없음) |
| son-kijung-peace, wonju-chiak | 미확인 | raceplan SSO 리다이렉트 반복 |
| daegu-newyear-bare, yeosu-marine, jeju-4full, fire-safety-seoul | 미확인 | 접속 거부·인증서 오류 (http 전용 사이트) |
| jeonmahyeop-newyear, cheongju-musimcheon, yeonggwang-gwangpung | 미확인 | mara1080 SPA |
| jeongeup-hometown-donation | 미확인 | love.myrunup.kr 인증서 오류 |
| mumbai, transgrancanaria-trail, wdw-marathon | 미확인 | 404 / 429 / 대기열 |
| jeongeup-freemarket, ahmedabad-adani-marathon, hanoi-midnight-marathon, iki-shinshun-marathon, buriram, tokashiki-marathon | 미확인 | official_url 이 검색 링크 (공식 홈페이지 없음) |

완료 — 파트 A 조사 끝 (2026-11-07). snapshot 1차는 A 가 뜸.
