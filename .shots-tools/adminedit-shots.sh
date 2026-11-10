#!/usr/bin/env bash
# 관리자 대회 수정(adminedit) 확인: PC(1280)·휴대폰(390) 에서
#   상세 '수정' 탭 → 칸 고침 → 바뀐 칸 미리보기 → 저장 → 정보 탭 반영 → 닫았다 다시 열어도 새 값,
#   회원 흉내에선 '수정' 탭 없음, 관리 화면 '고칠 대회 찾기' 자동완성 → 고르면 편집기.
#   NODE_ENV=development npm run dev -- --port 5198 --strictPort   (먼저 띄워 둔다. ?amock 흉내는 개발 서버에서만 된다)
#   bash .shots-tools/adminedit-shots.sh [저장 폴더=.duo-shots/adminedit] [포트=5198]
# 저장: <폴더>/<너비>-<장면>.png, 측정값·확인 결과는 <폴더>/metrics.txt
# 흉내 저장(?amock=admin)은 Supabase 를 부르지 않는다 — 쓰기 요청(POST/PATCH/PUT/DELETE) 수를 metrics.txt 에 적는다(0 이어야 함).
# 도우미 함수는 adminedit-helpers.js (브라우저 시작 스크립트). 끝나면 브라우저 세션을 닫는다.
# 주의는 mobilenav-shots.sh 머리 주석과 같다(NODE_ENV, worktree 글꼴, 절대 경로).
set -u
mkdir -p "${1:-.duo-shots/adminedit}"
OUT=$(cd "${1:-.duo-shots/adminedit}" && pwd)
PORT=${2:-5198}
HERE=$(cd "$(dirname "$0")" && pwd)
AB=(agent-browser --session "${AB_SESSION:-adminedit}")
LOG="$OUT/metrics.txt"
RACE=tokyo
: > "$LOG"
ev() { "${AB[@]}" eval "$1"; }
shot() { "${AB[@]}" screenshot "$OUT/$1.png" >/dev/null; }
pause() { "${AB[@]}" wait "${1:-600}" >/dev/null; }
note() { echo "$*" >> "$LOG"; }

"${AB[@]}" close >/dev/null 2>&1
"${AB[@]}" --init-script "$HERE/adminedit-helpers.js" set viewport 390 844 >/dev/null

for w in 1280 390; do
  h=900
  [ "$w" = 390 ] && h=844
  "${AB[@]}" set viewport "$w" "$h" >/dev/null

  # ── 상세 '수정' 탭 (관리자 흉내) ──
  "${AB[@]}" open "http://localhost:$PORT/r/$RACE?amock=admin" >/dev/null
  "${AB[@]}" wait "dialog[open] [role=tab]" >/dev/null
  pause 800
  note "$w admin tabs $(ev "[...document.querySelectorAll('dialog[open] [role=tab]')].map(b=>b.textContent).join('|')")"
  ev "__click('수정')" >/dev/null
  "${AB[@]}" wait "dialog[open] fieldset" >/dev/null
  pause 400
  shot "$w-edit-tab"
  note "$w edit-tab $(ev "__measure()")"

  # 칸 고치기 → 미리보기
  ev "[__fill('대회명 (영문)','Tokyo Marathon 2027'), __fill('참가비','17,000'), __fill('메모 (영문)','Lottery entry. Edited in the admin tab.'), __fill('날짜 신뢰도','expected')].join(',')" >> "$LOG"
  ev "__click('바뀐 칸 확인')" >/dev/null
  pause 400
  ev "document.querySelector('dialog[open] section h3')?.scrollIntoView({block:'start'})" >/dev/null
  pause 300
  shot "$w-edit-preview"
  note "$w preview $(ev "[...document.querySelectorAll('dialog[open] section li')].map(li=>li.innerText.replace(/\\s+/g,' ')).join(' / ')")"

  # 저장 → 정보 탭에 반영
  ev "__click('확인하고 저장')" >/dev/null
  pause 900
  ev "[...document.querySelectorAll('dialog[open] p')].find(p=>p.textContent.startsWith('저장했습니다'))?.scrollIntoView({block:'center'})" >/dev/null
  pause 300
  shot "$w-edit-saved"
  note "$w saved-msg $(ev "!![...document.querySelectorAll('dialog[open] p')].find(p=>p.textContent.startsWith('저장했습니다'))")"
  ev "__click('정보')" >/dev/null
  pause 500
  ev "document.querySelector('dialog[open] .overflow-y-auto, dialog[open] > div')?.scrollTo(0,0)" >/dev/null
  pause 300
  shot "$w-overview-after"
  note "$w overview-after name_en=$(ev "document.querySelector('dialog[open]').innerText.includes('Tokyo Marathon 2027')") fee=$(ev "/17,000|¥17,000|17000/.test(document.querySelector('dialog[open]').innerText)")"

  # 닫았다 다시 열기 — 새로 고치면 흉내 저장(메모리)이 사라지므로 페이지는 그대로 두고 목록 검색으로 같은 대회를 연다
  ev "document.querySelector('dialog[open] button[aria-label=\"닫기\"]')?.click()" >/dev/null
  pause 500
  "${AB[@]}" fill "main input[type=search]" "Tokyo Marathon 2027" >/dev/null
  pause 600
  note "$w reopen $(ev "__openRow('도쿄 마라톤')")"
  "${AB[@]}" wait "dialog[open] [role=tab]" >/dev/null
  pause 600
  note "$w reopen name_en=$(ev "document.querySelector('dialog[open]').innerText.includes('Tokyo Marathon 2027')")"
  note "$w writes(POST/PATCH/PUT/DELETE)=$(ev "window.__writes.length")"

  # ── 회원 흉내: '수정' 탭 없음 ──
  "${AB[@]}" open "http://localhost:$PORT/r/$RACE?amock=member" >/dev/null
  "${AB[@]}" wait "dialog[open] [role=tab]" >/dev/null
  pause 600
  note "$w member tabs $(ev "[...document.querySelectorAll('dialog[open] [role=tab]')].map(b=>b.textContent).join('|')")"
  shot "$w-member-tabs"

  # ── 관리 화면 대회 찾기 ──
  "${AB[@]}" open "http://localhost:$PORT/?amock=admin" >/dev/null
  "${AB[@]}" wait "header" >/dev/null
  pause 800
  if [ "$(ev "__clickExact('관리')")" != '"ok"' ]; then
    "${AB[@]}" click "[data-nav-menu-button]" >/dev/null # 휴대폰: 아이콘 메뉴 버튼 → 메뉴 시트의 '관리'
    pause 400
    ev "__clickExact('관리')" >/dev/null
  fi
  "${AB[@]}" wait "dialog[open] [role=tab]" >/dev/null
  pause 400
  ev "__click('대회 추가·수정')" >/dev/null
  "${AB[@]}" wait "dialog[open] [role=combobox]" >/dev/null
  pause 300
  "${AB[@]}" focus "dialog[open] [role=combobox]" >/dev/null
  "${AB[@]}" type "dialog[open] [role=combobox]" "도쿄" >/dev/null
  pause 400
  shot "$w-admin-search"
  note "$w admin-search 도쿄 $(ev "[...document.querySelectorAll('dialog[open] [role=option]')].length")개 $(ev "__measure()")"
  "${AB[@]}" press ArrowDown >/dev/null
  "${AB[@]}" press Enter >/dev/null
  "${AB[@]}" wait "dialog[open] fieldset" >/dev/null
  pause 500
  shot "$w-admin-editor"
  note "$w admin-editor $(ev "document.querySelector('dialog[open] section h3')?.textContent") $(ev "__measure()")"
  for q in tokyo Tok seoul-half 오사카; do
    "${AB[@]}" fill "dialog[open] [role=combobox]" "$q" >/dev/null
    pause 250
    note "$w admin-search $q → $(ev "[...document.querySelectorAll('dialog[open] [role=option]')].slice(0,3).map(o=>o.firstElementChild.textContent).join(' | ')")"
  done
  note "$w admin writes(POST/PATCH/PUT/DELETE)=$(ev "window.__writes.length")"
done

"${AB[@]}" close >/dev/null
echo "저장: $OUT ($(ls "$OUT"/*.png 2>/dev/null | wc -l | tr -d ' ')장), 측정값: $LOG"
