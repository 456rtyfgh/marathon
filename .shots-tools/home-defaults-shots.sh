#!/usr/bin/env bash
# 첫 화면 목록 기본값(국내·대회 날짜·접수 중) 확인: 장면 × 너비(390·1280) 스크린샷과 측정값, 끝에 맞음/틀림.
#   bash .shots-tools/home-defaults-shots.sh serve [포트=5198]        개발 서버 띄우기 (백그라운드로 실행해 둔다)
#   bash .shots-tools/home-defaults-shots.sh <저장 폴더> [포트] before   App.tsx 고치기 전 기준 화면만(ko-before-<w>.png)
#   bash .shots-tools/home-defaults-shots.sh <저장 폴더> [포트]          고친 뒤 6장면 (PLAN B-4)
# 저장: <폴더>/<장면>-<너비>.png, 장면별 측정값 <폴더>/m-<장면>-<너비>.json → home-defaults-check.mjs 가 <폴더>/metrics.txt 로 모은다
#   (before 도 같은 폴더에 m-ko-before-*.json 으로 남아 3번 장면 비교에 쓰인다)
# 끝나면 브라우저 세션을 닫는다. 서버는 직접 끈다: lsof -ti:<포트> | xargs kill
# 주의
#  - node_modules 가 다른 폴더를 가리키는 심볼릭 링크(git worktree)면 글꼴이 'serving allow list 밖' 으로 막혀
#    글자 폭이 달라진다 → serve 는 server.fs.allow 에 그 node_modules 를 더한 임시 설정(.duo-shots/, git 무시)으로 띄운다.
#  - agent-browser screenshot 의 상대 경로는 브라우저 데몬 기준이라 저장 폴더를 절대 경로로 바꿔 쓴다.
#  - 묶음 안 대회는 React 의 key(=대회 id)로 알아내고 /data.json 과 맞춰 날짜·국내 여부를 본다.
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=$(cd "$HERE/.." && pwd)

if [ "${1:-}" = serve ]; then
  PORT=${2:-5198}
  NM=$(cd "$ROOT/node_modules" && pwd -P)
  # 임시 설정은 worktree 안 git 무시 폴더에 (.duo-data 는 원래 저장소를 가리키는 링크라 거기 쓰면 worktree 밖에 파일이 생기고,
  # 설정 안의 '../vite.config.ts' 가 원래 저장소 쪽으로 풀릴 수 있다)
  mkdir -p "$ROOT/.duo-shots"
  CFG="$ROOT/.duo-shots/vite-home-defaults.config.ts"
  cat > "$CFG" <<EOF
import base from '../vite.config.ts';
export default { ...base, server: { fs: { allow: ['$ROOT', '$NM'] } } };
EOF
  cd "$ROOT" && NODE_ENV=development exec npx vite --config "$CFG" --port "$PORT" --strictPort
fi

mkdir -p "${1:-.shots/home-defaults}"
OUT=$(cd "${1:-.shots/home-defaults}" && pwd)
PORT=${2:-5198}
MODE=${3:-after}
AB=(agent-browser --session "${AB_SESSION:-home-defaults}")

INIT="$HERE/home-defaults-measure.js"

if [ "$MODE" = before ]; then
  SCENES=("ko-before|/")
else
  SCENES=(
    "ko-default|/"
    "en-default|/en/"
    "ko-query-old|/?scope=all&sort=entry&status="
    "ko-query-abroad|/?scope=abroad&sort=views"
    "ko-q|/?q=%EB%8F%84%EC%BF%84"
    "en-query-upcoming|/en/?status=upcoming"
  )
fi

"${AB[@]}" close >/dev/null 2>&1
"${AB[@]}" --init-script "$INIT" set viewport 390 844 >/dev/null
for w in 390 1280; do
  h=844
  [ "$w" = 1280 ] && h=900
  "${AB[@]}" set viewport "$w" "$h" >/dev/null
  for s in "${SCENES[@]}"; do
    name=${s%%|*}
    path=${s#*|}
    "${AB[@]}" open "http://localhost:$PORT$path" >/dev/null
    "${AB[@]}" wait "#list h2" >/dev/null
    "${AB[@]}" wait 1200 >/dev/null
    "${AB[@]}" eval "__hdMeasure()" > "$OUT/m-$name-$w.json"
    "${AB[@]}" screenshot "$OUT/$name-$w.png" >/dev/null
  done
done
"${AB[@]}" close >/dev/null

# 맞음/틀림 (PLAN B-4) — 폴더의 m-*.json 을 모아 metrics.txt 로. before 만 찍었을 때는 측정값만 보면 된다
[ "$MODE" != before ] && node "$HERE/home-defaults-check.mjs" "$OUT"
echo "저장: $OUT ($(ls "$OUT"/*.png 2>/dev/null | wc -l | tr -d ' ')장), 측정값: $OUT/metrics.txt"
