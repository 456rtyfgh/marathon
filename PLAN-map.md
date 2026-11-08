# PLAN — 주·도 지도에서 '전체 지도'·'세계 지도'로 돌아가기

작성 2026-11-08. **코드 작업만, 지도 '돌아가기' 1건.**

- **`PLAN.md` 는 `.gitignore` 에 있다 → 커밋에 넣지 않는다** (`git add PLAN.md` 는 'ignored' 오류로 실패한다).

- 동시에 데이터 작업이 `public/data.json`·`.duo-data/` 를 커밋한다 → **이 두 곳은 읽기만, 수정·`git add` 금지.** (`PLAN-data.md` 도 데이터 작업 쪽 파일이라 건드리지 않는다)
- `git add <내가 바꾼 파일>` 만. `git add -A`·`git commit -a`·`git push` 금지.
- 요청에 없는 기능·화면 요소·색·안내 문구 추가/삭제 금지. 지도 클릭 규칙(지역 확대 → 나라 선택, 동아시아 확대 등)·확대/축소 버튼·범례·말풍선은 그대로.

---

## 1. 목표

사용자 제보: "주(주·도)로 확대했을 때 전체 지도로 돌아오기 어렵다."

지금 (`src/components/MapSection.tsx` 의 `onBack`, `src/components/MapView.tsx` 의 왼쪽 위 버튼):
- 주·도 지도(미국 등 8개 나라, `sub`)에서 **주·도를 고른 때만** '전체 지도'(→ 그 나라 전체) 버튼이 있다.
- **그 나라 전체 상태에서는 버튼이 없다** → 세계 지도로 가려면 위의 나라 칩을 다시 눌러야 한다 (찾기 어려움).
- 국내 시·도 지도(`scope === 'kr'`)도 같다: 시·도 고른 때만 '전체 지도', 세계로 가는 길은 위 도구 막대의 '전체' 탭뿐.
- 바다(빈 곳) 클릭·Esc 는 아무 일도 안 한다.

바뀐 뒤:

| 지도 상태 | 왼쪽 위 버튼 (왼쪽부터) | 바다 클릭 · Esc (= 한 단계 위) |
|---|---|---|
| 주·도 지도, **주·도 고름** (예: 캘리포니아) | `전체 지도` → `onPlace(sub)` (미국 전체), `세계 지도` → `leaveZone()` | `onPlace(sub)` (미국 전체) |
| 주·도 지도, **나라 전체** (예: 미국) | `세계 지도` → `leaveZone()` | `leaveZone()` |
| 국내 시·도 지도, **시·도 고름** | `전체 지도` → `onPlace(null)`, `세계 지도` → `toWorld()` | `onPlace(null)` |
| 국내 시·도 지도, **한국 전체** | `세계 지도` → `toWorld()` | `toWorld()` |
| 세계 지도, 동아시아 확대 중 (`nearOn`) | `전체 지도` → `setNear(false)` (지금 그대로) | `setNear(false)` |
| 세계 지도, 지역 확대 중 (`zone`) | `전체 지도` → `leaveZone()` (지금 그대로) | `leaveZone()` |
| 세계 지도, 확대 없음 | 없음 (지금 그대로) | 아무 일 없음 |

- `leaveZone()` = 지금 함수 그대로 (`onRegions([])` + `onPlace(null)`) → 확대 없는 세계 지도. 국내/해외 탭(`scope`)은 그대로.
- `toWorld()` (새로, MapSection 안) = 도구 막대 '전체' 탭을 누른 것과 같은 상태: `onScope('all')` + `onRegions([])` + `onPlace(null)` + `track('filter', { name: 'scope', value: 'all' })` (`toKorea()` 와 짝).
- 위 표에 없는 상태(예: 세계 지도에서 지역 없이 나라만 골라진 상태)는 지금 그대로 — 버튼 없음, 바다·Esc 아무 일 없음.
- 버튼 문구: 그 나라 전체로 = **`전체 지도`** (지금 문구 그대로), 세계로 = **`세계 지도`**.

버튼 모양·위치 (MapView):
- 지도 **왼쪽 위 고정**(`absolute top-2 left-2`, 지금 자리) 에 **가로 한 줄**로, 말풍선(대회 수)은 그 아래 (지금처럼).
- 오른쪽 위 확대·축소 버튼 줄과 겹치지 않게 버튼 줄 오른쪽 끝을 막는다: 휴대폰 `right-[60px]`(확대 버튼 44 + 여백), `sm:right-14`. 좁으면 줄바꿈(`flex-wrap`).
- 크기: 지금 '전체 지도' 버튼과 같은 클래스 (`h-11` = 휴대폰 44px, `sm:h-8`, `px-3`, 테두리·배경·그림자 그대로). 가로도 44px 이상(`min-w-11`).
- 아이콘: `전체 지도` = `ArrowLeft`(지금 그대로), `세계 지도` = `GlobeHemisphereEast` (`@phosphor-icons/react`, size 14 bold). 색은 지금 버튼과 같음.

---

## 2. 공통 인터페이스 (파트 A 가 만들고 파트 B 가 씀)

`src/components/MapView.tsx` 에서 export:

```ts
/** 지도 왼쪽 위 '돌아가기' 버튼 하나. icon 은 'back' = ArrowLeft, 'world' = GlobeHemisphereEast */
export type MapBack = { label: string; icon: 'back' | 'world'; onClick: () => void };
```

MapView props 변경 (나머지 props 는 그대로):

```ts
  /** 왼쪽 위 돌아가기 버튼들 (왼쪽부터 순서대로). 빈 배열이면 버튼 없음 */
  backs: MapBack[];
  /** 한 단계 위로 (바다 클릭·Esc). 없으면 둘 다 아무 일 없음 */
  onUp?: () => void;
```

- **`onBack` prop 은 없앤다** (`backs` 로 대신).
- MapSection 은 `import type { MapBack } from './MapView'` (type 만 — lazy 로 받는 MapView 를 즉시 불러오지 않게 반드시 `import type`).
- `backs` 는 그릴 때마다 새 배열이어도 된다 (버튼 몇 개라 memo 대상 아님. `Paths` memo 에는 넘기지 않는다).

---

## 3. 파트 A — MapView: 버튼 그리기 · 바다 클릭 · Esc

**담당 파일: `src/components/MapView.tsx` 만.**

1. 위 `MapBack` 타입 export, props 에서 `onBack` 빼고 `backs`·`onUp` 추가.
2. 왼쪽 위 상자(지금 `pointer-events-none absolute top-2 left-2 flex flex-col …`):
   - `right-[60px] sm:right-14` 를 더해 확대 버튼 줄 앞에서 끝나게.
   - 그 안 첫 줄: `backs.length > 0` 이면 `<div className="flex flex-wrap gap-1.5">` 에 버튼들 (지금 '전체 지도' 버튼 클래스 + `min-w-11`, `pointer-events-auto` 유지, `type="button"`).
   - 말풍선은 그 아래 그대로.
3. **바다 클릭**: `<svg>` 에 `onClick` 추가 — `e.target === e.currentTarget` (나라·주·도 path 가 아닌 svg 바탕) 이고 `!gesture.current.suppressClick` 일 때만 `onUp?.()`.
   - 대회 없는 회색 path(`aria-hidden`)는 '빈 곳'으로 치지 않는다 (svg 바탕만).
   - 드래그·핀치 뒤 click 은 지금 `onClickCapture` 가 막는다 — 그래도 핸들러 안에서 `suppressClick` 을 한 번 더 본다.
   - 고리(`circle`)는 `pointerEvents="none"` 이라 그대로 바탕 클릭으로 간다 (괜찮음).
4. **Esc**: `useEffect` 로 `window` 에 `keydown` 하나 (onUp 은 ref 로 들고 있어 매번 다시 붙이지 않게 — `onSelectRef` 와 같은 방식).
   - `e.key === 'Escape'` 이고, 다음이 **모두 아닐 때만** `onUpRef.current?.()` + `e.preventDefault()`:
     - `e.defaultPrevented`, `e.isComposing`, Ctrl/Meta/Alt 눌림
     - `document.querySelector('dialog[open]')` 이 있음 (대회 상세·로그인 등 패널의 Esc 닫기와 겹치지 않게)
     - 포커스가 `input`·`textarea`·`select`·contenteditable (검색창에서 Esc)
     - 지도 상자(`relative` div — ref 하나 추가)가 화면에 전혀 안 보임: `r.bottom <= 0 || r.top >= window.innerHeight` (`r = getBoundingClientRect()`). 조금이라도 보이면 동작한다. 목록을 보다가 Esc 로 필터가 풀리지 않게.
   - 대회 상세 패널은 `src/components/ui.tsx` 의 native `<dialog>`(`showModal`) 라, 그 Esc keydown 이 window 에 올 때 `dialog[open]` 이 아직 남아 있다 → 위 조건으로 건너뛴다. 지금 앱에 다른 Escape 처리기는 없다.
   - MapView 는 지도를 펼친 때만 그려지므로 접힌 지도는 저절로 빠진다.
5. 그 밖 (확대·이동·맞춤·범례·말풍선·path) 은 건드리지 않는다.

**파트 A 자체 확인**: `npx tsc -b` → 에러는 `MapSection.tsx` 의 `onBack`/`backs` 관련만 나와야 한다 (파트 B 가 고친다; 파트 B 가 먼저 끝났으면 에러 0). `npm run lint` 로 MapView.tsx 에 새 경고 없음. 파트 A 만 따로 커밋하지 않는다 (빌드가 깨진 커밋이 되므로) — 커밋은 파트 B 가 둘 다 끝난 뒤 한 번.

## 4. 파트 B — MapSection: 상태별 버튼·한 단계 위 정하기 + 전체 확인·커밋

**담당 파일: `src/components/MapSection.tsx` 만.** (2장 인터페이스만 보고 파트 A 와 따로 짤 수 있다. 빌드는 둘 다 끝나야 통과)

파트 B 는 코드 양이 적은 대신 **두 파트가 다 끝난 뒤 5장 완료 기준·6장 브라우저 확인 전부와 커밋**을 맡는다. 확인 중 MapView 쪽 문제가 나오면 MapView 를 고치지 말고 파트 A 몫으로 적어 둔다.

1. `import type { MapBack } from './MapView'`.
2. `toWorld()` 추가 (1장 정의 그대로, `toKorea` 바로 아래).
3. 1장 표대로 `backs: MapBack[]` 와 `onUp` 을 계산 (렌더 안에서 한 번, 예: `const nav = (): { backs: MapBack[]; up?: () => void } => …`):
   - `nearOn` → `[{ '전체 지도', 'back', () => setNear(false) }]`, up 같음
   - `sub && subPicked` → `[{ '전체 지도', 'back', () => onPlace(sub) }, { '세계 지도', 'world', leaveZone }]`, up = `() => onPlace(sub)`
   - `sub` (나라 전체) → `[{ '세계 지도', 'world', leaveZone }]`, up = `leaveZone`
   - `zone` → `[{ '전체 지도', 'back', leaveZone }]`, up = `leaveZone`
   - `scope === 'kr' && place` → `[{ '전체 지도', 'back', () => onPlace(null) }, { '세계 지도', 'world', toWorld }]`, up = `() => onPlace(null)`
   - `scope === 'kr'` → `[{ '세계 지도', 'world', toWorld }]`, up = `toWorld`
   - 그 밖 → `[]`, up 없음
   - 판단 순서는 지금 `onBack` 삼항과 같게 (`nearOn` → `sub` → `zone` → `kr`). `nearOn` 은 이미 `!zone && !sub && scope !== 'kr'` 라 순서가 바뀌어도 결과는 같다.
4. `<MapView onBack={…}>` 를 `backs={…} onUp={…}` 로 바꾼다. 다른 props·칩·안내 문구는 그대로.

---

## 5. 완료 기준

- [ ] `npm run build` 통과 (tsc + vite + prerender 등 전부).
- [ ] `npm run lint` 에 새 경고 없음 (바꾼 두 파일) — 각 파트 시작 전에 `npm run lint > /tmp/lint-before.txt 2>&1` 로 기준을 남겨 두고 끝에 다시 돌려 비교.
- [ ] 1440px·390px 두 크기 모두, 아래 6장 시나리오가 표대로 동작.
- [ ] 휴대폰 390px: 돌아가기 버튼 높이·폭 44px 이상, 확대·축소 버튼과 겹치지 않음 (`getBoundingClientRect` 로 확인).
- [ ] 바다 클릭은 한 단계 위로, **드래그(끌어 옮기기) 뒤에는 안 올라감**. 나라·주·도 클릭 규칙은 지금 그대로.
- [ ] 검색창에 포커스가 있을 때·대회 상세 패널이 열려 있을 때 Esc 는 지도를 바꾸지 않음.
- [ ] `public/data.json`·`.duo-data/`·`PLAN-data.md` 안 건드림 (`git status` 로 확인), 띄운 서버 종료.
- [ ] 커밋 1개(작은 한국어 메시지, 예: `지도: 주·도 확대에서 전체 지도·세계 지도 버튼, 바다 클릭·Esc 로 한 단계 위`), `git add src/components/MapView.tsx src/components/MapSection.tsx` 만 (PLAN.md 는 ignored 라 넣지 않음), push 안 함. 커밋 전 `git diff --cached --name-only` 가 이 두 파일뿐인지 확인.

## 6. 확인 방법

```bash
cd ~/Documents/runworld
npx tsc -b                      # 타입만 빠르게
npm run lint
npm run build
npx vite preview --port 4173 --strictPort &   # 백그라운드 — 끝나면 반드시 종료 (kill %1 또는 lsof -ti:4173 | xargs kill)
```

agent-browser (`agent-browser --help` 로 명령 확인) — 1440×900, 390×844 각각:
1. `http://localhost:4173/` 열기 → 지도 펼쳐진 상태 확인 (접혀 있으면 '지도로 보기').
2. 세계 지도에서 미국 path(`aria-label` 이 '미국 대회 …') 클릭 → 북미 확대 → 미국 한 번 더 클릭 → 미국 주 지도. 왼쪽 위에 **`세계 지도`** 버튼만 보임.
3. 캘리포니아(`aria-label` '캘리포니아 대회 …') 클릭 → 확대. 왼쪽 위 **`전체 지도`·`세계 지도`** 둘 다 보임. 스크린샷.
4. `전체 지도` → 미국 전체. `세계 지도` → 확대 없는 세계 지도 (지역 칩 선택 풀림).
5. 다시 미국 → 캘리포니아 → **Esc** → 미국 전체 → **Esc** → 세계 지도.
6. 다시 미국 → 캘리포니아 → **바다(지도 바탕, 예: 태평양 쪽 빈 곳) 클릭** → 미국 전체 → 바다 클릭 → 세계 지도. 세계 지도 지역 확대 중 바다 클릭 → 확대 풀림.
   - 바다 좌표 찾기: `agent-browser eval` 로 svg(`[aria-label="주·도별 대회 지도"]` / `"나라별 대회 지도"`) 사각형 안을 훑어 `document.elementFromPoint(x, y) === svg` 인 점을 고르고, 그 좌표를 실제 마우스 클릭(`agent-browser mouse` 등 — `--help` 로 확인)으로 누른다. JS `svg.click()` 만으로 끝내지 않는다.
7. 미국 주 지도에서 지도를 끌어 옮긴 뒤(마우스 누름 → 바다 위로 20px 이상 이동 → 뗌) 지도 상태가 그대로인지 (미국 주 지도 유지).
8. 국내 탭 → 시·도 고름 → `전체 지도`·`세계 지도` 보임 → Esc → 한국 전체(`세계 지도` 만) → `세계 지도` → 도구 막대 '전체' 탭 선택 + 세계 지도.
9. 검색창 포커스 후 Esc → 지도 그대로.
10. 미국 → 캘리포니아 상태에서 목록의 대회 하나를 눌러 상세 패널 열기 → Esc → 패널만 닫히고 지도는 캘리포니아 그대로.
11. 390px 에서 버튼 크기: `agent-browser eval` 로 버튼·확대 버튼 `getBoundingClientRect()` 높이 ≥ 44·폭 ≥ 44, 서로 안 겹침. 1440px·390px 캘리포니아 상태 스크린샷은 `.shots/` 에 (커밋 안 함).
12. 끝나면 `agent-browser close`, preview 서버 종료 (`lsof -ti:4173` 가 비었는지), `git status` 로 `public/data.json`·`.duo-data/` 가 내 변경에 없음을 확인.
