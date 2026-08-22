# 해외마라톤 캘린더 (runworld)

매년 날짜가 바뀌는 해외 마라톤의 **다음 회차 일정 · 신청 방식(추첨/선착순/기록) · 신청 마감 D-day ·
여행사 패키지 가격 · 인천 출발 예상 비용**을 한 화면에서 확인하는 사이트.

**Stack** — Vite + React 19 + TypeScript + Tailwind v4 / Supabase (Postgres) / Cloudflare Workers

---

## 1. 로컬 실행

```bash
npm install
cp .env.example .env        # Supabase 값 채우기 (없어도 내장 시드로 동작)
npm run dev
```

`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` 가 없으면 `src/lib/seed.ts` 의 내장 데이터로 그대로 돌아간다.
값이 있으면 Supabase 를 우선 사용하고, 조회 실패 시 시드로 자동 폴백한다.

## 2. Supabase 설정

1. [supabase.com](https://supabase.com) 에서 새 프로젝트 생성 (리전은 `ap-northeast-2` 권장)
2. Settings → Database → Connection string → **Session pooler** URI 복사
3. 스키마 + 데이터 적용:

```bash
export SUPABASE_DB_URL='postgresql://postgres.xxxx:PASSWORD@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres'
npm run db:push
```

또는 Supabase 대시보드 → SQL Editor 에 `supabase/migrations/0001_init.sql` → `supabase/seed.sql` 순서로
붙여넣어 실행해도 된다.

### 테이블

| 테이블 | 용도 |
|---|---|
| `races` | 대회 기본 정보. 날짜/신청기간마다 `*_confidence`(확정·예상·미정)와 `source_url`, `last_verified` 를 함께 저장 |
| `agencies` | 취급 여행사 |
| `packages` | 대회별 여행사 상품 (개인가 / 단체가) |
| `cost_baselines` | `country_code` 단위 항공·숙박·체류비 기준값 |
| `alert_subscriptions` | D-day 알림 구독 (이메일 + 대회 + 며칠 전) |

RLS: 앞의 4개 테이블은 공개 읽기, `alert_subscriptions` 는 **insert/update 만 허용하고 select 는 막아**
구독자 이메일이 anon key 로 조회되지 않게 했다.

### 데이터 갱신

대회 데이터의 단일 소스는 `src/lib/seed.ts` 다. 수정 후:

```bash
npm run seed:sql   # supabase/seed.sql 재생성
npm run db:push    # DB 반영 (upsert)
```

## 3. Cloudflare 배포

```bash
export CLOUDFLARE_API_TOKEN=...      # "Edit Cloudflare Workers" 템플릿으로 생성
export CLOUDFLARE_ACCOUNT_ID=...
npm run deploy
```

`wrangler.jsonc` 는 `dist/` 를 정적 자산으로 서빙하는 Workers 설정이다.
SPA 라우팅은 `not_found_handling: single-page-application` 로 처리된다.

### GitHub Actions 자동 배포

`main` 에 push 하면 `.github/workflows/deploy.yml` 이 빌드 후 배포한다.
레포 Settings → Secrets and variables → Actions 에 아래 4개를 등록:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## 4. D-day 알림 발송

현재는 **구독 저장까지만** 구현돼 있다. 실제 메일 발송은 별도 크론이 필요하다.
가장 간단한 경로는 Supabase `pg_cron` + Edge Function, 또는 Cloudflare Worker Cron Trigger 에서
`alert_subscriptions` 를 service-role key 로 읽어 Resend 같은 메일 API 로 보내는 것.
(anon key 로는 select 가 막혀 있으므로 반드시 service-role key 를 서버 측에서 써야 한다.)

## 5. 데이터에 관한 주의

- 대회 일정·신청 기간은 주최 측 사정으로 예고 없이 바뀐다. `expected`/`tbc` 로 표시된 값은 **직전 회차
  패턴 기준 추정치**이며, UI 에도 그대로 표시된다.
- 비용 계산기 금액은 인천 출발 왕복 이코노미 기준의 참고용 추정치다. 실제 항공권가가 아니다.
- 여행사 패키지 가격은 공개 상품가 기준이며 출발일·객실 조건에 따라 달라진다. 대부분 **대회 참가비
  불포함**이다.
- 각 대회 카드의 "출처 확인" 링크와 `last_verified` 로 언제 확인한 정보인지 추적할 수 있다.
