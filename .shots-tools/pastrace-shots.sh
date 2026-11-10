#!/usr/bin/env bash
# 내 정보 '지난 대회 등록' 확인: 회원 흉내(?amock=member)·기록 흉내(lib/memberMock.ts)로 PC(1280)·휴대폰(390) × ko·en 스크린샷.
#   NODE_ENV=development npx vite --port 5199 --strictPort   (먼저 띄워 둔다. 흉내는 개발 서버에서만 된다)
#   bash .shots-tools/pastrace-shots.sh [저장 폴더=.duo-shots/pastrace] [포트=5199]
# 장면: 1 빈 기록 · 2 등록 창(최근 지난 대회) · 3 검색 · 4 종목·기록 입력 · 5 저장 뒤(요약·목록 갱신) · 6 고치기(삭제 버튼)
# 7 삭제 확인 단계 · 8 삭제 뒤. 기록은 언어마다 ?rmock=reset 으로 비우고 시작한다.
set -eu
mkdir -p "${1:-.duo-shots/pastrace}"
OUT=$(cd "${1:-.duo-shots/pastrace}" && pwd)
PORT=${2:-5199}
AB=(agent-browser --session "${AB_SESSION:-pastrace}")
inner='dialog[open] dialog[open]'

run() {
  local w=$1 h=$2 lang=$3 tag=$4
  local me add q1 pick1 dist q2 pick2 save del
  if [ "$lang" = ko ]; then
    me='한강러너'; add='지난 대회 등록'; q1='춘천'; pick1='춘천마라톤'; dist='풀코스'; q2='tokyo'; pick2='도쿄 마라톤'; save='저장'; del='등록 삭제'
  else
    me='한강러너'; add='Add a past race'; q1='Chuncheon'; pick1='Chuncheon International Marathon'; dist='Marathon'; q2='도쿄'; pick2='Tokyo Marathon'; save='Save'; del='Remove'
  fi
  local path=/
  [ "$lang" = en ] && path=/en/
  "${AB[@]}" set viewport "$w" "$h" >/dev/null
  "${AB[@]}" open "http://localhost:$PORT$path?amock=member&rmock=reset" >/dev/null
  "${AB[@]}" wait 1500 >/dev/null
  if [ "$w" -lt 640 ]; then
    # 휴대폰은 머리말 메뉴 안의 '내 정보'
    "${AB[@]}" click "[data-nav-menu-button]" >/dev/null
    "${AB[@]}" wait 300 >/dev/null
    me=$( [ "$lang" = ko ] && echo '내 정보' || echo 'My account' )
  fi
  "${AB[@]}" find role button click --name "$me" >/dev/null
  "${AB[@]}" wait 900 >/dev/null
  "${AB[@]}" scrollintoview "$( [ "$lang" = ko ] && echo 'text=내 기록' || echo 'text=My races' )" >/dev/null
  "${AB[@]}" screenshot "$OUT/$tag-$lang-1-empty.png" >/dev/null
  "${AB[@]}" find role button click --name "$add" >/dev/null
  "${AB[@]}" wait 500 >/dev/null
  "${AB[@]}" screenshot "$OUT/$tag-$lang-2-sheet.png" >/dev/null
  "${AB[@]}" fill "$inner input[type=search]" "$q1" >/dev/null
  "${AB[@]}" wait 300 >/dev/null
  "${AB[@]}" screenshot "$OUT/$tag-$lang-3-search.png" >/dev/null
  "${AB[@]}" find text "$pick1" click >/dev/null
  "${AB[@]}" wait 300 >/dev/null
  "${AB[@]}" find role radio click --name "$dist" >/dev/null
  "${AB[@]}" fill "$inner input[inputmode=numeric]" "3:45:20" >/dev/null
  "${AB[@]}" screenshot "$OUT/$tag-$lang-4-form.png" >/dev/null
  "${AB[@]}" find role button click --name "$save" >/dev/null
  "${AB[@]}" wait 600 >/dev/null
  # 두 번째 대회: 다른 언어 이름으로 찾기 (한글 화면에서 영어, 영어 화면에서 한글)
  "${AB[@]}" find role button click --name "$add" >/dev/null
  "${AB[@]}" fill "$inner input[type=search]" "$q2" >/dev/null
  "${AB[@]}" wait 300 >/dev/null
  "${AB[@]}" find text "$pick2" click >/dev/null
  "${AB[@]}" wait 300 >/dev/null
  "${AB[@]}" fill "$inner input[inputmode=numeric]" "3:31:05" >/dev/null
  "${AB[@]}" find role button click --name "$save" >/dev/null
  "${AB[@]}" wait 900 >/dev/null
  "${AB[@]}" screenshot "$OUT/$tag-$lang-5-saved.png" >/dev/null
  # 고치기 → 삭제 두 단계
  "${AB[@]}" click "dialog[open] ul button" >/dev/null
  "${AB[@]}" wait 400 >/dev/null
  "${AB[@]}" screenshot "$OUT/$tag-$lang-6-edit.png" >/dev/null
  "${AB[@]}" find role button click --name "$del" >/dev/null
  "${AB[@]}" wait 200 >/dev/null
  "${AB[@]}" screenshot "$OUT/$tag-$lang-7-confirm.png" >/dev/null
  "${AB[@]}" click "$inner button.underline" >/dev/null
  "${AB[@]}" wait 900 >/dev/null
  "${AB[@]}" screenshot "$OUT/$tag-$lang-8-removed.png" >/dev/null
  echo "$tag-$lang summary: $("${AB[@]}" eval "[...document.querySelectorAll('dialog[open] dl dd')].map(d=>d.textContent).join(' | ')")"
}

"${AB[@]}" close >/dev/null 2>&1 || true
run 1280 900 ko pc
run 1280 900 en pc
run 390 844 ko m390
run 390 844 en m390
"${AB[@]}" close >/dev/null
echo "저장: $OUT ($(ls "$OUT"/*.png | wc -l | tr -d ' ')장)"
