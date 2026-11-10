#!/usr/bin/env bash
# 러닝 이벤트 화면 확인: 390·1280px × ko·en — 필터(러닝 이벤트 칩 고름)·목록 배지·상세(주최 브랜드·성격)
#   NODE_ENV=development npx vite --port 5231 --strictPort   (먼저 띄워 둔다)
#   bash .shots-tools/event-shots.sh [저장 폴더=.duo-shots/event] [포트=5231]
# 예시 이벤트 행은 event-inject.js 가 브라우저 안에서만 끼운다 (DB 에 아직 이벤트 행이 없어서)
set -u
mkdir -p "${1:-.duo-shots/event}"
OUT=$(cd "${1:-.duo-shots/event}" && pwd)
PORT=${2:-5231}
HERE=$(cd "$(dirname "$0")" && pwd)
AB=(agent-browser --session "${AB_SESSION:-event-shots}")

"${AB[@]}" close >/dev/null 2>&1
"${AB[@]}" --init-script "$HERE/event-inject.js" set viewport 390 844 >/dev/null
for w in 390 1280; do
  "${AB[@]}" set viewport "$w" 900 >/dev/null
  for lang in ko en; do
    path=/; [ "$lang" = en ] && path=/en/
    chip='러닝 이벤트'; [ "$lang" = en ] && chip='Running events'
    filt='필터'; [ "$lang" = en ] && filt='Filters'
    "${AB[@]}" open "http://localhost:$PORT$path" >/dev/null
    "${AB[@]}" wait "li button" >/dev/null
    "${AB[@]}" wait 800 >/dev/null
    "${AB[@]}" screenshot "$OUT/$w-$lang-list.png" >/dev/null
    "${AB[@]}" find role button click --name "$filt" >/dev/null 2>&1 || "${AB[@]}" eval "[...document.querySelectorAll('button[aria-expanded]')].find(b=>b.textContent.includes('$filt'))?.click()" >/dev/null
    "${AB[@]}" wait 300 >/dev/null
    "${AB[@]}" eval "[...document.querySelectorAll('button[aria-pressed]')].find(b=>b.textContent.trim()==='$chip')?.click()" >/dev/null
    "${AB[@]}" wait 500 >/dev/null
    "${AB[@]}" screenshot "$OUT/$w-$lang-filter.png" >/dev/null
    "${AB[@]}" eval "[...document.querySelectorAll('li button')].find(b=>b.textContent.includes('SPEEDTRACK')||b.textContent.includes('스피드트랙'))?.click()" >/dev/null
    "${AB[@]}" wait 1200 >/dev/null
    "${AB[@]}" screenshot "$OUT/$w-$lang-detail.png" >/dev/null
    "${AB[@]}" eval "document.querySelector('[role=dialog] dl:last-of-type, aside dl:last-of-type')?.scrollIntoView({block:'center'})" >/dev/null
    "${AB[@]}" wait 300 >/dev/null
    "${AB[@]}" screenshot "$OUT/$w-$lang-detail-facts.png" >/dev/null
  done
done
"${AB[@]}" close >/dev/null
echo "저장: $OUT ($(ls "$OUT"/*.png | wc -l | tr -d ' ')장)"
