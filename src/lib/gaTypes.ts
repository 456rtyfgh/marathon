/** /api/admin/ga 응답 형식 (worker/gaRoute.ts 가 만들고 src/components/GaSection.tsx 가 그린다) */
export const GA_RANGES = ['7d', '28d', '90d'] as const;
export type GaRange = (typeof GA_RANGES)[number];

/** 주요 이벤트 표에 보일 이벤트 이름 (src/lib/analytics.ts 의 track() 이름 = GA 로 가는 이름) */
export const GA_KEY_EVENTS = [
  'race_view', 'official_click', 'agency_click', 'calendar_add', 'favorite', 'share',
  'search', 'alert_subscribe', 'sign_up', 'request_submit', 'review_submit', 'booking',
] as const;

/** 지금 값과 직전 같은 길이 기간 값. prev 가 0 이면 화면은 증감 % 대신 '—' */
export interface GaMetric { value: number; prev: number }

export interface GaTotals {
  activeUsers: GaMetric;
  newUsers: GaMetric;
  sessions: GaMetric;
  /** 활성 사용자 1명당 평균 참여 시간(초) = userEngagementDuration / activeUsers */
  engagementPerUser: GaMetric;
  /** 참여율 0~1 (GA engagementRate) */
  engagementRate: GaMetric;
  pageViews: GaMetric; // screenPageViews
}

/** 일별 추이. date 는 'YYYY-MM-DD' (GA 의 'YYYYMMDD' 를 바꾼 값), 빠진 날은 0 으로 채워 기간 일수만큼 */
export interface GaDay { date: string; activeUsers: number; sessions: number }

/** 표 한 줄. label 은 GA 차원 값 그대로('(not set)' 포함), extra 는 페이지 제목 등 보조 글 */
export interface GaRow { label: string; extra?: string; value: number }

export interface GaRealtime {
  /** 최근 30분 활성 사용자 */
  activeUsers: number;
  countries: GaRow[]; // 상위 5, value = activeUsers
  pages: GaRow[];     // 상위 5, label = unifiedScreenName(페이지 제목), value = activeUsers
  fetchedAt: string;  // ISO 시각
}

export interface GaReport {
  configured: true;
  range: GaRange;
  /** 실제 조회한 기간 (속성 시간대 기준, 'YYYY-MM-DD'). 오늘은 빼고 어제까지 */
  period: { start: string; end: string; prevStart: string; prevEnd: string };
  totals: GaTotals;
  daily: GaDay[];
  channels: GaRow[];     // sessionDefaultChannelGroup, value = sessions, 상위 8
  sourceMedium: GaRow[]; // sessionSourceMedium ('google / organic'), value = sessions, 상위 10
  countries: GaRow[];    // country, value = activeUsers, 상위 10
  devices: GaRow[];      // deviceCategory, value = activeUsers (전부, 보통 3개)
  pages: GaRow[];        // label = pagePath, extra = pageTitle, value = screenPageViews, 상위 10
  events: GaRow[];       // label = eventName (GA_KEY_EVENTS 안), value = eventCount, 많은 순, 0 인 것은 빠짐
  fetchedAt: string;     // ISO 시각 (워커가 구글에서 받은 시각 — 캐시 응답이면 예전 시각)
}

/** 키가 없을 때 (HTTP 200) */
export interface GaUnconfigured { configured: false }

/** 오류일 때 (HTTP 4xx/5xx). message 는 한국어 한 문장 */
export interface GaError { error: string; message: string }

export type GaReportResponse = GaReport | GaUnconfigured;
export type GaRealtimeResponse = (GaRealtime & { configured: true }) | GaUnconfigured;
