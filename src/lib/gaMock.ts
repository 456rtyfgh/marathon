/**
 * 개발 서버 전용 가짜 GA 응답 (PLAN 1-5 모킹 모드). gaClient.ts 가 `if (import.meta.env.DEV)` 안에서만 불러온다
 * — 배포 번들에 들어가지 않는다 (빌드 뒤 dist 에 '__GA_MOCK__' 가 없어야 한다).
 * 숫자는 날짜로 정해지는 그럴듯한 값 (새로 고쳐도 같은 그림). 실시간만 부를 때마다 조금씩 바뀐다.
 */
import { GaFetchError } from './gaClient';
import { GA_RANGES, type GaDay, type GaRange, type GaRealtime, type GaReport, type GaRow } from './gaTypes';

const MARK = '__GA_MOCK__';
let calls = 0;

const DAY = 86_400_000;
const seoulToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
/** 0~1 사이 고정 값 */
const wave = (i: number) => (Math.sin(i * 1.7) + Math.sin(i * 0.37) + 2) / 4;

function report(range: GaRange): GaReport {
  const days = Number(range.replace('d', ''));
  const today = seoulToday();
  const start = addDays(today, -days);
  const end = addDays(today, -1);
  const daily: GaDay[] = Array.from({ length: days }, (_, i) => {
    const date = addDays(start, i);
    const weekend = [0, 6].includes(new Date(date + 'T00:00:00Z').getUTCDay());
    const users = Math.round(140 + wave(i) * 120 + (weekend ? 60 : 0) + i * 0.8);
    return { date, activeUsers: users, sessions: Math.round(users * (1.25 + wave(i + 3) * 0.2)) };
  });
  daily[Math.floor(days / 2)] = { ...daily[Math.floor(days / 2)], activeUsers: 0, sessions: 0 }; // 빠진 날(0) 도 그려 보기
  const users = daily.reduce((a, d) => a + d.activeUsers, 0);
  const sessions = daily.reduce((a, d) => a + d.sessions, 0);
  const s = (n: number) => Math.round(sessions * n);
  const u = (n: number) => Math.round(users * n);
  return {
    configured: true,
    range,
    period: { start, end, prevStart: addDays(start, -days), prevEnd: addDays(start, -1) },
    totals: {
      activeUsers: { value: users, prev: Math.round(users * 0.88) },
      newUsers: { value: u(0.71), prev: Math.round(u(0.71) * 1.06) },
      sessions: { value: sessions, prev: Math.round(sessions * 0.91) },
      engagementPerUser: { value: 133, prev: 121 },
      engagementRate: { value: 0.523, prev: 0.523 },
      pageViews: { value: s(3.4), prev: 0 },
    },
    daily,
    channels: [
      ['Organic Search', 0.46], ['Direct', 0.24], ['Organic Social', 0.12], ['Referral', 0.08],
      ['Unassigned', 0.04], ['Organic Shopping', 0.01],
    ].map(([label, n]) => ({ label: label as string, value: s(n as number) })),
    sourceMedium: [
      ['google / organic', 0.31], ['(direct) / (none)', 0.24], ['naver / organic', 0.12], ['m.search.naver.com / referral', 0.06],
      ['instagram.com / referral', 0.05], ['threads.net / referral', 0.04], ['daum / organic', 0.03], ['bing / organic', 0.02],
      ['(not set)', 0.015], ['kakaotalk / referral', 0.01],
    ].map(([label, n]) => ({ label: label as string, value: s(n as number) })),
    countries: [
      ['South Korea', 0.86], ['Japan', 0.04], ['United States', 0.03], ['(not set)', 0.02], ['Taiwan', 0.01],
      ['China', 0.008], ['Germany', 0.006], ['Singapore', 0.005], ['Australia', 0.004], ['Canada', 0.003],
    ].map(([label, n]) => ({ label: label as string, value: u(n as number) })),
    devices: [['mobile', 0.74], ['desktop', 0.23], ['tablet', 0.03]].map(([label, n]) => ({ label: label as string, value: u(n as number) })),
    pages: [
      ['/', '마라톤 캘린더 — 2026·2027 국내·해외 마라톤 대회 일정과 접수', 0.38],
      ['/r/tokyo', '도쿄 마라톤 2027 일정·접수 기간 | 마라톤 캘린더', 0.08],
      ['/r/chuncheon', '춘천 마라톤 2026 일정·접수 기간 | 마라톤 캘린더', 0.06],
      ['/r/seoul', '서울 마라톤 2027 일정·접수 기간 | 마라톤 캘린더', 0.05],
      ['/en/', 'Marathon Calendar — 2026·2027 marathon dates and entry', 0.04],
      ['/r/jtbc', 'JTBC 서울 마라톤 2026 일정·접수 기간 | 마라톤 캘린더', 0.035],
      ['/r/boston', '보스턴 마라톤 2027 일정·접수 기간 | 마라톤 캘린더', 0.03],
      ['/r/berlin', '베를린 마라톤 2027 일정·접수 기간 | 마라톤 캘린더', 0.025],
      ['/r/gold-coast-marathon-very-long-path-name-for-wrap-check-2027', '골드코스트 마라톤 2027 일정·접수 기간 | 마라톤 캘린더', 0.02],
      ['/terms', '이용약관 | 마라톤 캘린더', 0.01],
    ].map(([label, extra, n]) => ({ label: label as string, extra: extra as string, value: s((n as number) * 3.4) })),
    events: (
      [
        ['race_view', 0.9], ['search', 0.42], ['official_click', 0.31], ['favorite', 0.09], ['calendar_add', 0.07],
        ['share', 0.04], ['agency_click', 0.03], ['alert_subscribe', 0.02], ['sign_up', 0.006],
      ] as [string, number][]
    ).map(([label, n]) => ({ label, value: s(n) })),
    fetchedAt: new Date(Date.now() - 2 * 60_000).toISOString(),
  };
}

function realtime(): GaRealtime & { configured: true } {
  const bump = calls % 5;
  const rows = (list: [string, number][]): GaRow[] => list.map(([label, value]) => ({ label, value }));
  return {
    configured: true,
    activeUsers: 23 + bump,
    countries: rows([['South Korea', 19 + bump], ['Japan', 2], ['United States', 1], ['(not set)', 1]]),
    pages: rows([
      ['마라톤 캘린더 — 2026·2027 국내·해외 마라톤 대회 일정과 접수', 11 + bump],
      ['도쿄 마라톤 2027 일정·접수 기간 | 마라톤 캘린더', 4],
      ['춘천 마라톤 2026 일정·접수 기간 | 마라톤 캘린더', 3],
      ['서울 마라톤 2027 일정·접수 기간 | 마라톤 캘린더', 2],
      ['Marathon Calendar — 2026·2027 marathon dates and entry', 1],
    ]),
    fetchedAt: new Date().toISOString(),
  };
}

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((ok, fail) => {
    const id = setTimeout(ok, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(id);
      fail(new DOMException('Aborted', 'AbortError'));
    });
  });

/** query = gaClient 가 서버에 보낼 검색어 ('range=7d' | 'realtime=1'), mode = ?gamock 값 */
export async function mockGa(query: string, mode: string, signal?: AbortSignal): Promise<unknown> {
  const q = new URLSearchParams(query);
  const kind = q.has('realtime') ? 'realtime' : 'report';
  calls++;
  console.info(MARK, kind, `#${calls}`, mode || 'ok'); // 30초 새로고침이 멈추는지 콘솔에서 센다
  await wait(mode === 'slow' ? 2000 : 250, signal);
  if (mode === 'off') return { configured: false };
  if (mode === 'error') {
    throw new GaFetchError(
      'GA 속성에 서비스 계정 권한이 없습니다. GA 관리 → 속성 액세스 관리에 서비스 계정 이메일을 뷰어로 추가해 주세요.',
      502,
      true,
    );
  }
  if (kind === 'realtime') return realtime();
  const range = q.get('range') as GaRange;
  if (!GA_RANGES.includes(range)) throw new GaFetchError('기간은 7d, 28d, 90d 중 하나여야 합니다.', 400, true);
  return report(range);
}
