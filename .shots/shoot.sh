#!/bin/zsh
# 사용: zsh .shots/shoot.sh before|after   (vite preview 가 4317 에 떠 있어야 함)
set -e
out="$PWD/.shots/$1"
mkdir -p "$out"
B=agent-browser
U=http://localhost:4317
for scheme in light dark; do
  $B set media $scheme >/dev/null
  for vp in "390 844 m" "1440 900 d"; do
    set -- ${=vp}
    w=$1 h=$2 tag=$3
    $B set viewport $w $h >/dev/null
    # 목록
    $B open $U/ >/dev/null; $B wait 1200 >/dev/null
    $B screenshot "$out/list-$tag-$scheme.png" >/dev/null
    # 지도 (지도 영역까지 스크롤)
    $B eval "document.querySelector('svg[role],main svg, svg')?.closest('section,div')?.scrollIntoView({block:'center'})" >/dev/null
    $B wait 400 >/dev/null
    $B screenshot "$out/map-$tag-$scheme.png" >/dev/null
    # 로그인 패널
    $B scroll up 5000 >/dev/null
    $B find role button click --name "로그인" >/dev/null
    $B wait 600 >/dev/null
    $B screenshot "$out/login-$tag-$scheme.png" >/dev/null
    # 상세 (마감 임박 = 강조 칸 보이는 대회)
    $B open $U/r/goyang-half >/dev/null; $B wait 1200 >/dev/null
    $B screenshot "$out/detail-$tag-$scheme.png" >/dev/null
    echo "$scheme $tag ok"
  done
done
