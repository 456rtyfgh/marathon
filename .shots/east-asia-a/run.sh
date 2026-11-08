#!/bin/bash
# 파트 A 확인용 (커밋 안 함). 사용: bash run.sh 1440 900
W=$1; H=$2
D="$(cd "$(dirname "$0")" && pwd)"
URL=http://localhost:4317/
AB="agent-browser --session ea-a"
ST="$(cat "$D/state.js")"
state() { echo "[$W] $1: $($AB eval "$ST" 2>&1 | tail -1)"; }
shot() { $AB screenshot "$D/$W-$1.png" >/dev/null 2>&1; }
fresh() { $AB open "$URL" >/dev/null 2>&1; $AB wait 'path[aria-label^="일본 대회"]' >/dev/null 2>&1; $AB wait 700 >/dev/null; }
clickc() { $AB eval "document.querySelector('path[aria-label^=\"$1 대회\"]').dispatchEvent(new MouseEvent('click',{bubbles:true}))" >/dev/null 2>&1; $AB wait 700 >/dev/null; }
clickb() { $AB eval "[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('$1')).click()" >/dev/null 2>&1; $AB wait 700 >/dev/null; }

$AB set viewport "$W" "$H" >/dev/null 2>&1
fresh; state 'S0 처음'
clickc 한국; state 'S1 한국 1번'; shot kr-1
clickc 한국; state 'S2 한국 2번'; shot kr-2
fresh; clickc 일본; state 'S3 일본 1번'; shot jp-1
clickc 일본; state 'S4 일본 2번'; shot jp-2
fresh; clickc 일본; clickc 중국; state 'S5 동아시아→중국'; shot cn
fresh; clickc 일본; clickc 대만; state 'S6 동아시아→대만'
fresh; clickc 한국; clickb '전체 지도'; state 'S7 동아시아→전체 지도'
fresh; clickc 한국; clickc 베트남; state 'S8 동아시아→베트남'
fresh; clickc 미국; state 'S9 미국 1번'; clickc 미국; state 'S10 미국 2번'
fresh; clickc 프랑스; state 'S11 프랑스 1번'; clickc 일본; state 'S12 유럽→일본'; clickc 일본; state 'S13 다시 일본'
fresh; clickb 아시아; clickc 일본; state 'S14 아시아→일본'
fresh; clickb 일본; state 'S15 칩 일본'
fresh; clickb 한국; state 'S16 칩 한국'
fresh; clickb 해외; $AB wait 700 >/dev/null; clickc 일본; state 'S17 해외 일본 1번'; clickc 일본; state 'S18 해외 일본 2번'
$AB close >/dev/null 2>&1
