#!/usr/bin/env bash
# 내 정보 '저장한 대회' 확인: 스크린샷 + 측정값 + 실제 앱 동작 확인.
#   bash .shots-tools/mypage-shots.sh [저장 폴더=.duo-shots/mypage] [포트=5181]
# 개발 서버를 이 스크립트가 띄우고 끝나면 끈다(이미 그 포트에 떠 있으면 그것을 쓴다).
# ① 미리보기 mypage-preview.html: 1280·390px × ko·en × member-full·member-empty·member-local·guest-full
#    → <폴더>/<너비>-<who>-<state>-<lang>.png (창 맨 위) 와 -2.png (창을 아래로 내린 것)
# ② 실제 앱 /?amock=member (로그인 흉내, src/lib/auth.tsx devAuthMock): localStorage 에 실제 대회 id 를 저장·접수로 넣고
#    내 정보 창(PC 는 머리말 닉네임 버튼, 390px 는 메뉴 → 내 정보)을 연 화면 → <폴더>/<너비>-app-<lang>.png
#    + 줄 누름 → 상세가 위에 뜸 → Esc → 내 정보로 돌아옴, 저장 해제 → 저장 수 줄어듦 확인 (metrics.txt 의 check 줄)
# 측정값(metrics.txt): 창 가로 넘침(scrollWidth>clientWidth), 44px 보다 작은 터치 대상 수, 영어 화면에 한글 섞임
# 주의 (mobilenav-shots.sh 와 같음)
#  - NODE_ENV=production 이면 import.meta.env.DEV 가 false 라 미리보기·?amock 이 안 먹는다 → development 로 띄운다.
#  - node_modules 가 다른 폴더를 가리키는 심볼릭 링크(git worktree)면 글꼴이 'serving allow list 밖' 으로 막혀
#    글자 폭이 달라진다 → server.fs.allow 에 그 node_modules 실제 경로를 더한 임시 설정으로 띄운다.
#  - .env 에 실제 Supabase 가 잡혀 있으면 amock 세션으로 실제 DB 를 부르게 되므로 VITE_SUPABASE_* 를 비우고 띄운다.
#  - agent-browser screenshot 의 상대 경로는 브라우저 데몬 기준이라 저장 폴더를 절대 경로로 바꿔 쓴다.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "${1:-$ROOT/.duo-shots/mypage}"
OUT=$(cd "${1:-$ROOT/.duo-shots/mypage}" && pwd)
PORT=${2:-5181}
AB=(agent-browser --session "${AB_SESSION:-mypage-shots}")
LOG="$OUT/metrics.txt"
: > "$LOG"
BASE="http://localhost:$PORT"

# ── 개발 서버 ──────────────────────────────────────────────
SERVER_PID=""
TMP=$(mktemp -d)
cleanup() {
  "${AB[@]}" close >/dev/null 2>&1
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null
  rm -rf "$TMP"
}
trap cleanup EXIT
if ! curl -sf "$BASE/mypage-preview.html" >/dev/null 2>&1; then
  NM=$(cd "$ROOT/node_modules" && pwd -P)
  cat > "$TMP/vite.config.ts" <<EOF
import { mergeConfig } from 'vite';
import base from '$ROOT/vite.config.ts';
export default mergeConfig(base, { root: '$ROOT', server: { fs: { allow: ['$ROOT', '$NM'] } } });
EOF
  (cd "$ROOT" && NODE_ENV=development VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= \
    npx vite --config "$TMP/vite.config.ts" --port "$PORT" --strictPort >"$TMP/vite.log" 2>&1) &
  SERVER_PID=$!
  for _ in $(seq 1 60); do
    curl -sf "$BASE/mypage-preview.html" >/dev/null 2>&1 && break
    sleep 0.5
  done
  curl -sf "$BASE/mypage-preview.html" >/dev/null 2>&1 || { echo "개발 서버가 뜨지 않음"; cat "$TMP/vite.log"; exit 1; }
fi

# 열린 창(맨 위 dialog) 측정: 가로 넘침, 작은 터치 대상, (영어) 한글 섞임
MEASURE='(() => {
  const ds = [...document.querySelectorAll("dialog[open]")];
  const d = ds[ds.length - 1];
  if (!d) return JSON.stringify({ dialog: false });
  const s = d.querySelector("#me-saved-title")?.closest("section");
  const small = s ? [...s.querySelectorAll("button")].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.height < 43.5 || r.width < 43.5); }).map((b) => b.textContent.trim().slice(0, 20) || b.getAttribute("aria-label")) : [];
  const ko = document.documentElement.lang === "en" && s ? (s.innerText.match(/[가-힣]+/g) || []) : [];
  return JSON.stringify({ overflowX: d.scrollWidth > d.clientWidth, sectionW: s ? Math.round(s.getBoundingClientRect().width) : null, small, hangulInEn: ko.slice(0, 5) });
})()'
SCROLL_DOWN='(() => { const ds = [...document.querySelectorAll("dialog[open]")]; const d = ds[ds.length - 1]; d.scrollTop = Math.min(d.scrollHeight, d.clientHeight * 0.85); return d.scrollTop; })()'

"${AB[@]}" close >/dev/null 2>&1
"${AB[@]}" set viewport 390 844 >/dev/null

# ── ① 미리보기 ──────────────────────────────────────────────
for w in 1280 390; do
  "${AB[@]}" set viewport "$w" 844 >/dev/null
  for case in member-full member-empty member-local guest-full; do
    who=${case%%-*}
    state=${case#*-}
    for lang in ko en; do
      name="$w-$who-$state-$lang"
      q="who=$who&state=$state"
      [ "$lang" = en ] && q="$q&lang=en"
      "${AB[@]}" open "$BASE/mypage-preview.html?$q" >/dev/null
      "${AB[@]}" wait "#me-saved-title" >/dev/null
      # 창이 서서히 뜨는 동안(0.22s) 찍으면 흐리게 나온다 — 넉넉히
      "${AB[@]}" wait 900 >/dev/null
      "${AB[@]}" screenshot "$OUT/$name.png" >/dev/null
      echo "$name $("${AB[@]}" eval "$MEASURE")" >> "$LOG"
      "${AB[@]}" eval "$SCROLL_DOWN" >/dev/null
      "${AB[@]}" wait 200 >/dev/null
      "${AB[@]}" screenshot "$OUT/$name-2.png" >/dev/null
    done
  done
done

# ── ② 실제 앱 (?amock=member) ──────────────────────────────
# 실제 대회 id 고르기 (한국 시간 오늘 기준): 접수 중 2 · 접수 예정 1 · 일정 미공개 1 · 지난 대회 1 저장, 앞으로 대회 1 은 '접수했어요'만
IDS=$(cd "$ROOT" && node -e '
const races = require("./public/data.json").races;
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const fut = races.filter((r) => r.race_date >= today && !/^\s*\[(취소|중단)\]/.test(r.notes_ko ?? ""));
const conf = (r) => r.entry_confidence === "confirmed";
const open = fut.filter((r) => conf(r) && r.entry_opens && r.entry_opens <= today && r.entry_closes && r.entry_closes >= today && !r.sold_out_on).sort((a, b) => a.entry_closes.localeCompare(b.entry_closes));
const soon = fut.filter((r) => conf(r) && r.entry_opens && r.entry_opens > today).sort((a, b) => a.entry_opens.localeCompare(b.entry_opens));
const tba = fut.filter((r) => !conf(r));
const past = races.filter((r) => r.race_date < today).sort((a, b) => b.race_date.localeCompare(a.race_date));
const pick = (a, i = 0) => (a[i] ? [a[i].id] : []);
const fav = [...pick(open), ...pick(open, 1), ...pick(soon), ...pick(tba), ...pick(past)];
const reg = pick(fut.filter((r) => !fav.includes(r.id)), 3);
console.log(JSON.stringify({ fav, reg }));
')
echo "app ids $IDS" >> "$LOG"
SEED="(() => { const v = $IDS; localStorage.setItem('marathon-cal:favorites', JSON.stringify(v.fav)); localStorage.setItem('marathon-cal:registered', JSON.stringify(v.reg)); return v.fav.length; })()"
FAVN='JSON.parse(localStorage.getItem("marathon-cal:favorites") || "[]").length'
OPEN_DIALOGS='[...document.querySelectorAll("dialog[open]")].map((d) => d.getAttribute("aria-label")).join(" | ")'

for w in 1280 390; do
  "${AB[@]}" set viewport "$w" 844 >/dev/null
  for lang in ko en; do
    path=/
    [ "$lang" = en ] && path=/en/
    name="$w-app-$lang"
    "${AB[@]}" open "$BASE$path?amock=member" >/dev/null
    "${AB[@]}" eval "$SEED" >/dev/null
    "${AB[@]}" open "$BASE$path?amock=member" >/dev/null
    "${AB[@]}" wait "header nav" >/dev/null
    "${AB[@]}" wait 1200 >/dev/null
    if [ "$w" = 390 ]; then
      "${AB[@]}" click "[data-nav-menu-button]" >/dev/null
      "${AB[@]}" wait 300 >/dev/null
      "${AB[@]}" click '[data-menu-item="me"]' >/dev/null
    else
      # 머리말 닉네임 버튼 (title 은 있고 aria-label 은 없는 유일한 버튼)
      "${AB[@]}" click "header nav button[title]:not([aria-label])" >/dev/null
    fi
    "${AB[@]}" wait "#me-saved-title" >/dev/null
    "${AB[@]}" wait 500 >/dev/null
    "${AB[@]}" screenshot "$OUT/$name.png" >/dev/null
    echo "$name $("${AB[@]}" eval "$MEASURE")" >> "$LOG"
    "${AB[@]}" eval "$SCROLL_DOWN" >/dev/null
    "${AB[@]}" wait 200 >/dev/null
    "${AB[@]}" screenshot "$OUT/$name-2.png" >/dev/null
    if [ "$w" = 390 ] && [ "$lang" = ko ]; then
      # 줄 누름 → 상세가 내 정보 위에 → Esc → 내 정보로
      "${AB[@]}" click "#me-saved-title ~ div ul li button" >/dev/null
      "${AB[@]}" wait 600 >/dev/null
      "${AB[@]}" screenshot "$OUT/$name-detail.png" >/dev/null
      echo "check open-detail dialogs=[$("${AB[@]}" eval "$OPEN_DIALOGS")]" >> "$LOG"
      "${AB[@]}" press Escape >/dev/null
      "${AB[@]}" wait 400 >/dev/null
      echo "check after-esc dialogs=[$("${AB[@]}" eval "$OPEN_DIALOGS")] savedTitle=$("${AB[@]}" eval '!!document.querySelector("#me-saved-title")')" >> "$LOG"
      # 저장 해제 → 저장 수 줄고, 창을 닫으면 목록의 저장 필터 숫자도 같이
      before=$("${AB[@]}" eval "$FAVN")
      "${AB[@]}" click "#me-saved-title ~ div ul li button[title]" >/dev/null
      "${AB[@]}" wait 300 >/dev/null
      after=$("${AB[@]}" eval "$FAVN")
      "${AB[@]}" press Escape >/dev/null
      "${AB[@]}" wait 400 >/dev/null
      favBtn=$("${AB[@]}" eval '(() => { const b = [...document.querySelectorAll("main button[aria-pressed]")].find((x) => x.querySelector(".sr-only")?.textContent && x.querySelector(".num")); return b ? b.querySelector(".num").textContent : null; })()')
      echo "check unsave favorites $before -> $after, list fav chip=$favBtn" >> "$LOG"
    fi
  done
done

echo "저장: $OUT ($(ls "$OUT"/*.png 2>/dev/null | wc -l | tr -d ' ')장), 측정값: $LOG"
