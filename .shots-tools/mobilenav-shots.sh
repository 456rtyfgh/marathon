#!/usr/bin/env bash
# 휴대폰 메뉴(mobilenav) 확인: 너비 × 상태(비로그인·회원 흉내·관리자 흉내) × 언어 스크린샷과 측정값.
#   NODE_ENV=development npm run dev -- --port 5198 --strictPort   (먼저 띄워 둔다. ?amock 흉내는 개발 서버에서만 된다)
#   bash .shots-tools/mobilenav-shots.sh [저장 폴더=.duo-shots/mobilenav] [포트=5198]
# 저장: <폴더>/<너비>-<guest|member|admin>-<ko|en>.png, 메뉴를 연 것은 -menu.png, 측정값은 <폴더>/metrics.txt
# 측정 함수는 mobilenav-measure.js (브라우저 시작 스크립트로 넣는다). 375·700px 은 측정만(스크린샷 없음).
# 끝나면 브라우저 세션을 닫는다.
# 주의
#  - 셸에 NODE_ENV=production 이 걸려 있으면 개발 서버에서도 import.meta.env.DEV 가 false 라 ?amock 이 안 먹는다.
#  - node_modules 가 다른 폴더를 가리키는 심볼릭 링크(git worktree)면 글꼴이 'serving allow list 밖' 으로 막혀
#    글자 폭이 달라진다 → server.fs.allow 에 그 node_modules 를 더한 설정으로 띄운다 (vite --config <설정>).
#  - agent-browser screenshot 의 상대 경로는 브라우저 데몬 기준이라 저장 폴더를 절대 경로로 바꿔 쓴다.
#  - 화면 크기 흉내(set viewport)로는 resize·matchMedia change 이벤트가 나지 않는다 ('넓히면 메뉴 닫힘' 은 여기서 확인 못 함).
set -u
mkdir -p "${1:-.duo-shots/mobilenav}"
OUT=$(cd "${1:-.duo-shots/mobilenav}" && pwd)
PORT=${2:-5198}
HERE=$(cd "$(dirname "$0")" && pwd)
AB=(agent-browser --session "${AB_SESSION:-mobilenav-b}")
LOG="$OUT/metrics.txt"
: > "$LOG"
SHOT_W=" 360 390 414 768 1280 "

"${AB[@]}" close >/dev/null 2>&1
"${AB[@]}" --init-script "$HERE/mobilenav-measure.js" set viewport 390 844 >/dev/null

for w in 360 375 390 414 700 768 1280; do
  "${AB[@]}" set viewport "$w" 844 >/dev/null
  for who in guest member admin; do
    for lang in ko en; do
      path=/
      [ "$lang" = en ] && path=/en/
      q=""
      [ "$who" != guest ] && q="?amock=$who"
      name="$w-$who-$lang"
      "${AB[@]}" open "http://localhost:$PORT$path$q" >/dev/null
      "${AB[@]}" wait "header nav" >/dev/null
      "${AB[@]}" wait 500 >/dev/null
      echo "$name header $("${AB[@]}" eval "__navHeader()")" >> "$LOG"
      case "$SHOT_W" in *" $w "*) "${AB[@]}" screenshot "$OUT/$name.png" >/dev/null ;; esac
      has=$("${AB[@]}" eval "JSON.parse(__navHeader()).menuBtn")
      if [ "$has" = "true" ]; then
        "${AB[@]}" click "[data-nav-menu-button]" >/dev/null
        "${AB[@]}" wait 300 >/dev/null
        echo "$name menu $("${AB[@]}" eval "__navMenu()")" >> "$LOG"
        case "$SHOT_W" in *" $w "*) "${AB[@]}" screenshot "$OUT/$name-menu.png" >/dev/null ;; esac
        "${AB[@]}" press Escape >/dev/null
        "${AB[@]}" wait 250 >/dev/null
      fi
    done
  done
done
"${AB[@]}" close >/dev/null
echo "저장: $OUT ($(ls "$OUT"/*.png 2>/dev/null | wc -l | tr -d ' ')장), 측정값: $LOG"
