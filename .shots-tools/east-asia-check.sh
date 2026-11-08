#!/bin/bash
# 파트 B 확인: 세계 지도에서 한국·일본 첫 클릭 = 동아시아 확대만, 다시 클릭 = 시·도 / 도도부현 지도.
# 사용: bash .shots-tools/east-asia-check.sh            (빌드 + preview 띄우고 1440·390 둘 다)
#       SKIP_BUILD=1 bash .shots-tools/east-asia-check.sh (빌드 건너뜀)
ROOT=/Users/choi-jun-u/Documents/runworld
PORT=${PORT:-4317}   # 다른 세션이 4317 을 쓰고 있으면 PORT=4318 로
B=http://localhost:$PORT/
SHOT=$ROOT/.shots/east-asia
AB="agent-browser --session ${AB_SESSION:-ea-b}"
mkdir -p "$SHOT"
cd "$ROOT" || exit 1

if [ -z "$SKIP_BUILD" ]; then
  npm run build >/tmp/east-asia-build.log 2>&1 || { echo "BUILD FAIL"; tail -20 /tmp/east-asia-build.log; exit 1; }
  echo "build ok"
fi

# 포트를 다른 세션이 쓰고 있으면 그 서버로 테스트하고 끝에 그 서버를 꺼 버리게 되므로 멈춘다
if lsof -ti tcp:$PORT -sTCP:LISTEN >/dev/null; then
  echo "port $PORT in use — PORT=4318 처럼 다른 포트로 다시 실행"; exit 1
fi
# npx 를 거치지 않고 바로 띄워 $! 가 서버 프로세스 자체가 되게 한다
./node_modules/.bin/vite preview --port $PORT --strictPort >/tmp/east-asia-preview.log 2>&1 &
PREVIEW=$!
cleanup() {
  $AB close >/dev/null 2>&1
  # 내가 띄운 서버만 끈다 (포트로 찾아 끄면 남의 서버까지 끌 수 있음)
  kill $PREVIEW 2>/dev/null
}
trap cleanup EXIT
for i in $(seq 1 40); do curl -s -o /dev/null $B && break; sleep 0.5; done

# 판정용 상태: 탭, 지도 종류, 켜진 칩, '전체 지도' 버튼, 칩 줄 이름(나라/도도부현/성·시/주), viewBox, 선택된 나라 path
STATE="JSON.stringify({tab:[...document.querySelectorAll('[role=radio]')].filter(b=>b.getAttribute('aria-checked')==='true').map(b=>b.textContent.replace(/[0-9,]/g,'').trim()), map:document.querySelector('svg[role=group]')?.getAttribute('aria-label'), on:[...document.querySelectorAll('section[aria-label=\"지역별로 보기\"] button[aria-pressed=true]')].map(b=>b.textContent.replace(/[0-9]/g,'').trim()), back:[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='전체 지도'), rows:[...document.querySelectorAll('section[aria-label=\"지역별로 보기\"] span.shrink-0.font-semibold')].map(s=>s.textContent.trim()), vb:document.querySelector('svg[role=group]')?.getAttribute('viewBox'), pressed:[...document.querySelectorAll('path[aria-pressed=true]')].map(p=>p.getAttribute('aria-label'))})"
# 나라 path 가 지도(svg) 안에 얼마나 보이는지 (보이는 넓이 비율 %, 화면 크기 px)
SEEN="(()=>{const s=document.querySelector('svg[role=group]').getBoundingClientRect(); const o={}; for(const n of ['한국','일본','중국','대만','몽골']){const p=document.querySelector('path[aria-label^=\"'+n+' 대회\"]'); if(!p){o[n]='none';continue} const r=p.getBoundingClientRect(); const w=Math.max(0,Math.min(r.right,s.right)-Math.max(r.left,s.left)), h=Math.max(0,Math.min(r.bottom,s.bottom)-Math.max(r.top,s.top)); o[n]=Math.round(100*w*h/(r.width*r.height||1))+'% '+r.width.toFixed(1)+'x'+r.height.toFixed(1)} return JSON.stringify(o)})()"
# React onClick 은 path 의 click 이벤트로 돈다. 작은 화면에서 한국이 몇 px 라 좌표 클릭 대신 요소 클릭
clickPath() { $AB eval "(()=>{const p=document.querySelector('path[aria-label^=\"$1 대회\"]'); if(!p) return 'no path $1'; p.dispatchEvent(new MouseEvent('click',{bubbles:true})); return 'clicked $1'})()" >/dev/null; $AB wait 700 >/dev/null; }
clickBtn() { $AB eval "(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.replace(/[0-9]/g,'').trim()==='$1'); if(!b) return 'no button $1'; b.click(); return 'clicked $1'})()" >/dev/null; $AB wait 700 >/dev/null; }
fresh() {
  $AB open $B >/dev/null
  $AB eval "localStorage.removeItem('marathon-cal:map')" >/dev/null
  $AB reload >/dev/null
  $AB wait 'path[aria-label^="한국 대회"]' >/dev/null
  $AB wait 600 >/dev/null
}
st() { echo "  $1: $($AB eval "$STATE")"; }
shot() { $AB scrollintoview 'svg[role=group]' >/dev/null; $AB wait 400 >/dev/null; $AB screenshot "$SHOT/$W-$1.png" >/dev/null; echo "  shot $SHOT/$W-$1.png"; }
step() { echo "--- [$W] $1"; }

for SIZE in "1440 900" "390 844"; do
  set -- $SIZE; W=$1; H=$2
  $AB set viewport $W $H >/dev/null

  step "0 처음 세계 지도"
  fresh; st home; shot 0-home

  step "1 한국: 첫 클릭 확대만 → 다시 클릭 시·도 지도"
  clickPath 한국; st kr1; echo "  seen: $($AB eval "$SEEN")"; shot 1-kr-1
  clickPath 한국; st kr2; shot 1-kr-2

  step "2 일본: 첫 클릭 확대만 → 다시 클릭 도도부현"
  fresh; clickPath 일본; st jp1; shot 2-jp-1
  clickPath 일본; st jp2; shot 2-jp-2

  step "3 동아시아 확대 → 중국 / 대만 / 전체 지도"
  fresh; clickPath 일본; clickPath 중국; st cn; shot 3-cn
  fresh; clickPath 한국; clickPath 대만; st tw; shot 3-tw
  fresh; clickPath 한국; clickBtn '전체 지도'; st back

  step "4 미국·프랑스 (전과 같음)"
  fresh; clickPath 미국; st us1; clickPath 미국; st us2; shot 4-us-2
  fresh; clickPath 프랑스; st fr1; clickPath 프랑스; st fr2

  step "5 칩은 한 번에"
  fresh; clickBtn 일본; st chip-jp
  fresh; clickBtn 한국; st chip-kr
  fresh; clickBtn 아시아; clickBtn 중국; st chip-asia-cn

  step "6 유럽 확대 중 일본 / 아시아 확대 중 일본"
  fresh; clickBtn 유럽; clickPath 일본; st eu-jp1; shot 6-eu-jp-1
  clickPath 일본; st eu-jp2
  fresh; clickBtn 아시아; clickPath 일본; st asia-jp

  step "7 해외 탭 일본"
  fresh; clickBtn 해외; clickPath 일본; st ab-jp1; echo "  seen: $($AB eval "$SEEN")"; shot 7-abroad-jp-1
  clickPath 일본; st ab-jp2
done
