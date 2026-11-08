#!/bin/bash
# 지도 돌아가기 확인용: 한 줄에 하나씩 명령 (st = 상태, sea = 바다 클릭, esc, cl <selector>, btn <문구>, vp w h, shot 파일, drag)
set -u
D="$(cd "$(dirname "$0")" && pwd)"
A() { agent-browser --session mapA "$@"; }
st() { A eval --stdin < "$D/state.js"; }
sea() {
  local p; p=$(A eval --stdin < "$D/sea.js" | tr -d '"')
  echo "sea at $p"
  [ "$p" = none ] && return
  A mouse move ${p% *} ${p#* } >/dev/null; A mouse down >/dev/null; A mouse up >/dev/null
  sleep 0.6
}
for cmd in "$@"; do
  set -- $cmd
  case "$1" in
    st) st ;;
    sea) sea ;;
    esc) A press Escape >/dev/null; sleep 0.6 ;;
    cl) shift; A click "$*" >/dev/null; sleep 0.7 ;;
    btn) shift; A find text "$*" click >/dev/null; sleep 0.7 ;;
    vp) A set viewport "$2" "$3" >/dev/null; sleep 0.5 ;;
    open) A open "$2" >/dev/null; A wait 'svg[role=group]' >/dev/null; sleep 1 ;;
    shot) A screenshot "$D/$2" >/dev/null; echo "shot $2" ;;
    eval) shift; A eval "$*" ;;
    drag)
      p=$(A eval --stdin < "$D/sea.js" | tr -d '"'); x=${p% *}; y=${p#* }
      echo "drag from $p"
      A mouse move $x $y >/dev/null; A mouse down >/dev/null
      A mouse move $((x+15)) $((y+5)) >/dev/null; A mouse move $((x+40)) $((y+10)) >/dev/null
      A mouse up >/dev/null; sleep 0.6 ;;
    *) echo "?? $cmd" ;;
  esac
done
