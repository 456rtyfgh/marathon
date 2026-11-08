#!/bin/zsh
# 사용: back-click.sh path "미국 대회"  |  back-click.sh sea  |  back-click.sh state
# 화면 좌표를 찾아 실제 마우스로 누른다 (JS click 아님)
dir=${0:A:h}
case $1 in
  state) agent-browser eval --stdin < $dir/back-state.js ;;
  path)
    agent-browser eval --stdin < $dir/back-helpers.js > /dev/null
    xy=$(agent-browser eval "__pt('$2')" | tr -d '"')
    [[ $xy == *' '* ]] || { echo "no point: $xy"; exit 1; }
    agent-browser mouse move ${=xy} > /dev/null && agent-browser mouse down > /dev/null && agent-browser mouse up > /dev/null
    echo "clicked $2 at $xy" ;;
  sea)
    xy=$(agent-browser eval --stdin < $dir/back-sea.js | tr -d '"')
    [[ $xy == *' '* ]] || { echo "no sea: $xy"; exit 1; }
    agent-browser mouse move ${=xy} > /dev/null && agent-browser mouse down > /dev/null && agent-browser mouse up > /dev/null
    echo "clicked sea at $xy" ;;
esac
sleep 1
agent-browser eval --stdin < $dir/back-state.js
