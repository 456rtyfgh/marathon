#!/bin/bash
# 파트 B 지도 확인: 어떤 경로로 한국을 골라도 국내(시·도) 지도로 바뀌는지. 사용: map-test.sh <너비> <높이>
W=$1; H=$2; B=http://localhost:8791/
SHOT=/Users/choi-jun-u/Documents/runworld/.shots
AB=agent-browser
STATE="JSON.stringify({radio:[...document.querySelectorAll('[role=radio]')].filter(b=>b.getAttribute('aria-checked')==='true').map(b=>b.textContent.replace(/[0-9]/g,'').trim()), map:document.querySelector('svg[role=group]')?.getAttribute('aria-label'), seoul:!!document.querySelector('path[aria-label^=\"서울 대회\"]'), chipsOn:[...document.querySelectorAll('button[aria-pressed=true]')].map(b=>b.textContent.trim()).slice(0,4), back:[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='전체 지도')})"
# React onClick 은 path 의 click 이벤트로 돈다. 작은 화면에서 한국이 몇 px 라 좌표 클릭 대신 요소 클릭
clickPath() { $AB eval "(()=>{const p=document.querySelector('path[aria-label^=\"$1 대회\"]'); if(!p) return 'no path $1'; p.dispatchEvent(new MouseEvent('click',{bubbles:true})); return 'clicked $1'})()" ; }
clickBtn() { $AB eval "(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.replace(/[0-9]/g,'').trim()==='$1'); if(!b) return 'no button $1'; b.click(); return 'clicked $1'})()" ; }
fresh() {
  $AB open $B >/dev/null
  $AB eval "localStorage.removeItem('marathon-cal:map')" >/dev/null
  $AB reload >/dev/null
  $AB wait 'path[aria-label^="한국 대회"]' >/dev/null
  $AB wait 600 >/dev/null
}
shot() { $AB scrollintoview 'svg[role=group]' >/dev/null; $AB wait 500 >/dev/null; $AB screenshot "$SHOT/seo2-map-$1-$W.png" | tail -1; }
step() { echo "--- $1"; }

$AB set viewport $W $H >/dev/null

step "1 전체 탭: 세계 지도 한국 클릭"
fresh; echo "before $($AB eval "$STATE")"
clickPath 한국; $AB wait 800 >/dev/null; echo "after  $($AB eval "$STATE")"; shot world-click
step "1b 시·도(서울) 클릭 → 확대·선택, 전체 지도 복귀"
clickPath 서울; $AB wait 800 >/dev/null; echo "seoul  $($AB eval "$STATE")"; shot kr-seoul
clickBtn '전체 지도'; $AB wait 500 >/dev/null; echo "back   $($AB eval "$STATE")"
step "1c 전체 탭으로 세계 지도 복귀"
clickBtn 전체; $AB wait 800 >/dev/null; echo "all    $($AB eval "$STATE")"

step "2 지역 칩 '한국'"
fresh; clickBtn 한국; $AB wait 800 >/dev/null; echo "after  $($AB eval "$STATE")"; shot region-chip

step "3 아시아 확대 후 한국 클릭"
fresh; clickBtn 아시아; $AB wait 800 >/dev/null; echo "asia   $($AB eval "$STATE")"
clickPath 한국; $AB wait 800 >/dev/null; echo "after  $($AB eval "$STATE")"; shot asia-click

step "4 일본 클릭 → 전처럼 일본 확대 (국내로 안 바뀜)"
fresh; clickPath 일본; $AB wait 800 >/dev/null; echo "japan  $($AB eval "$STATE")"; shot japan

step "5 해외 탭: 한국 path 가 눌리는지"
fresh; clickBtn 해외; $AB wait 800 >/dev/null; echo "abroad $($AB eval "$STATE")"
clickPath 한국; $AB wait 800 >/dev/null; echo "after  $($AB eval "$STATE")"
step "5b 해외 탭 → 국내 탭 → 해외 탭 복귀"
clickBtn 국내; $AB wait 800 >/dev/null; echo "kr     $($AB eval "$STATE")"
clickBtn 해외; $AB wait 800 >/dev/null; echo "abroad $($AB eval "$STATE")"
