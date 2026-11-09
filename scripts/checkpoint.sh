#!/bin/zsh
# 체크포인트(버전) 관리 — 잘못 만들어졌을 때 예전 상태로 되돌리기 위한 것.
#   ./scripts/checkpoint.sh save "메모"     지금 코드 + 지금 사이트의 대회 데이터를 체크포인트로 저장
#   ./scripts/checkpoint.sh list            저장된 체크포인트 목록 (최신이 위)
#   ./scripts/checkpoint.sh show <이름>     그 체크포인트 이후 바뀐 파일
#   ./scripts/checkpoint.sh restore <이름>  코드를 그 체크포인트 상태로 되돌리는 커밋을 만든다 (push 하면 배포)
# 체크포인트 = git 태그 cp-YYYYMMDD-HHMM + checkpoints/<이름>.json.gz (그 시점 사이트의 data.json)
# 되돌리기는 기록을 지우지 않고 '되돌림' 커밋을 새로 쌓는다 → 되돌린 것도 다시 되돌릴 수 있다.
set -euo pipefail
cd "$(dirname "$0")/.."
SITE="${SITE_ORIGIN:-https://marathon82.com}"
cmd="${1:-list}"

case "$cmd" in
save)
  memo="${2:-체크포인트}"
  [[ -z "$(git status --porcelain -- . ':!checkpoints')" ]] || { echo "커밋 안 된 변경이 있습니다. 먼저 커밋하세요."; git status --short; exit 1; }
  name="cp-$(date +%Y%m%d-%H%M)"
  mkdir -p checkpoints
  # 대회 목록 주소는 배포마다 바뀐다(/data/<해시>.json) → 첫 화면의 미리받기 줄에서 찾고, 없으면 예전 /data.json
  data_path="$(curl -fsS -m 30 "$SITE/" | grep -oE '/data/[0-9a-f]{12}\.json' | head -1 || true)"
  if curl -fsS -m 30 "$SITE${data_path:-/data.json}" | gzip -9 > "checkpoints/$name.json.gz" && [[ "$(gzip -dc "checkpoints/$name.json.gz" | head -c 1)" == "{" ]]; then
    git add "checkpoints/$name.json.gz"
    git commit -qm "체크포인트 데이터: $name ($memo)"
  else
    rm -f "checkpoints/$name.json.gz"; echo "(데이터 사본은 못 받음 — 코드만 저장)"
  fi
  git tag -a "$name" -m "$memo"
  echo "SAVED $name  $memo"
  ;;
list)
  git tag -l 'cp-*' --sort=-creatordate --format='%(refname:short)  %(creatordate:short)  %(contents:subject)'
  ;;
show)
  [[ -n "${2:-}" ]] || { echo "사용법: show <이름>"; exit 2; }
  git diff --stat "$2" HEAD -- . ':!public/data.json' ':!checkpoints' | tail -30
  ;;
restore)
  t="${2:-}"; [[ -n "$t" ]] && git rev-parse -q --verify "refs/tags/$t" >/dev/null || { echo "그런 체크포인트가 없습니다: $t"; exit 2; }
  [[ -z "$(git status --porcelain)" ]] || { echo "커밋 안 된 변경이 있습니다. 먼저 정리하세요."; exit 1; }
  # 코드만 되돌린다. data.json 은 매일 DB 에서 새로 뜨므로 그대로, checkpoints/ 도 그대로 둔다.
  git checkout "$t" -- . ':!public/data.json' ':!checkpoints' ':!scripts/checkpoint.sh'
  # 그 뒤에 새로 생긴 파일은 지운다
  for f in $(git diff --name-only --diff-filter=A "$t" HEAD -- . ':!public/data.json' ':!checkpoints' ':!scripts/checkpoint.sh'); do git rm -q "$f"; done
  if git diff --cached --quiet; then echo "이미 $t 와 같은 상태입니다."; exit 0; fi
  git commit -qm "되돌림: $t 상태로 ($(git tag -l "$t" --format='%(contents:subject)'))"
  echo "RESTORED $t  — push 하면 사이트에 반영됩니다."
  ;;
*)
  sed -n '2,8p' "$0"; exit 2 ;;
esac
