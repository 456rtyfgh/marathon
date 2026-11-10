/**
 * 내 정보 '저장한 대회' 의 가짜 데이터 (개발 서버 미리보기 · scripts/myraces-test.mjs 전용, 배포 화면은 쓰지 않는다).
 * 모든 날짜는 today 기준 상대 날짜 — 어느 날 열어도 모든 묶음과 경계(마감 D-0·D-7·D-8, 시작 D-3, 이번 달 시작,
 * 예상 일정, 조기 마감, 접수 마감, 취소, 접수 완료, 지난 대회+기록, 목록에 없는 id)가 나온다.
 * 도시는 영어 화면에서도 이름이 나오게 places-en.json 표에 있는 것만 쓴다.
 */
import type { Race } from '../lib/types';
import type { RaceRecord } from '../lib/member';
import { TODAY } from '../lib/util';

export interface MyRacesFixture {
  races: Race[];
  favIds: string[];
  records: Map<string, RaceRecord>;
  registeredIds: string[];
}

const DAY = 86400000;

/** 이 fixture 의 대회 id (테스트에서 이름으로 찾는다) */
export const FX = {
  closesToday: 'fx-closes-today',
  closes7: 'fx-closes-7',
  closes8: 'fx-closes-8',
  noClose: 'fx-no-close',
  monthStart: 'fx-month-start',
  opens3: 'fx-opens-3',
  expected: 'fx-expected',
  soldout: 'fx-soldout',
  closed: 'fx-closed',
  cancelled: 'fx-cancelled',
  registered: 'fx-registered',
  registeredSaved: 'fx-registered-saved',
  finished: 'fx-finished',
  pastSaved: 'fx-past-saved',
  pastRecent: 'fx-past-recent',
  missing: 'fx-gone',
} as const;

export function fixture(today: Date = TODAY(), { synced = true }: { synced?: boolean } = {}): MyRacesFixture {
  const d = (n: number) => new Date(today.getTime() + n * DAY).toISOString().slice(0, 10);
  const monthFirst = today.toISOString().slice(0, 8) + '01';

  const base = (id: string, over: Partial<Race>): Race => ({
    id,
    name_ko: id,
    name_en: id,
    city_ko: '서울',
    country_ko: '한국',
    country_code: 'KR',
    region: '한국',
    race_date: d(60),
    date_confidence: 'confirmed',
    is_major: false,
    entry_type: 'fcfs',
    entry_opens: null,
    entry_closes: null,
    entry_confidence: 'confirmed',
    entry_fee: 60000,
    entry_fee_currency: 'KRW',
    distances: ['풀', '하프', '10km'],
    field_size: null,
    course: '평지',
    flight_hours: null,
    official_url: 'https://example.com',
    source_url: null,
    last_verified: d(-1),
    notes_ko: null,
    notes_en: null,
    discipline: 'road',
    ...over,
  });

  const overseas = (country_code: string, country_ko: string, city_ko: string, region: Race['region']) => ({
    country_code,
    country_ko,
    city_ko,
    region,
    entry_fee_currency: country_code === 'JP' ? 'JPY' : country_code === 'US' ? 'USD' : 'EUR',
  });

  const races: Race[] = [
    // 접수 중
    base(FX.closesToday, { name_ko: '서울 한강 나이트런', name_en: 'Seoul Han River Night Run', entry_opens: d(-20), entry_closes: d(0), race_date: d(25), distances: ['10km', '5km'] }),
    base(FX.closes7, {
      name_ko: '대구 수성못 국제 마라톤 대회 겸 전국 마스터스 마라톤 선수권 대회',
      name_en: 'Daegu Suseong Lake International Marathon & National Masters Championship',
      city_ko: '대구',
      entry_opens: d(-14),
      entry_closes: d(7),
      race_date: d(40),
    }),
    base(FX.closes8, {
      name_ko: '도쿄 레거시 하프 마라톤',
      name_en: 'Tokyo Legacy Half Marathon',
      ...overseas('JP', '일본', '도쿄', '일본'),
      entry_type: 'lottery',
      entry_opens: d(-5),
      entry_closes: d(8),
      race_date: d(120),
      distances: ['하프'],
      entry_fee: 13000,
      flight_hours: 2.5,
    }),
    base(FX.noClose, { name_ko: '부산 바다 마라톤', name_en: 'Busan Sea Marathon', city_ko: '부산', entry_type: 'open', entry_opens: d(-30), entry_closes: null, race_date: d(50) }),
    base(FX.monthStart, {
      name_ko: '춘천 호반 마라톤',
      name_en: 'Chuncheon Lakeside Marathon',
      city_ko: '강원 춘천',
      entry_opens: monthFirst,
      entry_closes: d(30),
      race_date: d(90),
    }),
    // 곧 접수 시작
    base(FX.opens3, {
      name_ko: '베를린 마라톤',
      name_en: 'Berlin Marathon',
      ...overseas('DE', '독일', '베를린', '유럽'),
      is_major: true,
      entry_type: 'lottery',
      entry_opens: d(3),
      entry_closes: d(30),
      race_date: d(300),
      distances: ['풀'],
      entry_fee: 160,
      flight_hours: 12,
    }),
    // 접수 마감·대기
    base(FX.expected, {
      name_ko: '오사카 마라톤',
      name_en: 'Osaka Marathon',
      ...overseas('JP', '일본', '오사카', '일본'),
      entry_opens: d(5),
      entry_closes: d(20),
      entry_confidence: 'expected',
      race_date: d(100),
      distances: ['풀'],
      flight_hours: 2,
    }),
    base(FX.soldout, { name_ko: '서울 가을 하프', name_en: 'Seoul Autumn Half', entry_opens: d(-30), entry_closes: d(10), sold_out_on: d(-2), race_date: d(30), distances: ['하프', '10km'] }),
    base(FX.closed, {
      name_ko: '시드니 마라톤',
      name_en: 'Sydney Marathon',
      ...overseas('AU', '호주', '시드니', '오세아니아'),
      entry_fee_currency: 'AUD',
      entry_opens: d(-90),
      entry_closes: d(-3),
      race_date: d(20),
      distances: ['풀', '10km'],
      flight_hours: 10,
    }),
    base(FX.cancelled, { name_ko: '부산 해운대 10K', name_en: 'Busan Haeundae 10K', city_ko: '부산', entry_opens: d(-40), entry_closes: d(5), race_date: d(40), notes_ko: '[취소] 주최 측 사정으로 올해 대회 취소', distances: ['10km'] }),
    // 접수 완료
    base(FX.registered, {
      name_ko: '타이베이 마라톤',
      name_en: 'Taipei Marathon',
      ...overseas('TW', '대만', '타이베이', '아시아'),
      entry_fee_currency: 'TWD',
      entry_opens: d(-60),
      entry_closes: d(-10),
      race_date: d(30),
      distances: ['풀', '하프'],
      flight_hours: 2.5,
    }),
    base(FX.registeredSaved, { name_ko: '서울 봄 마라톤', name_en: 'Seoul Spring Marathon', entry_opens: d(-10), entry_closes: d(15), race_date: d(140) }),
    // 지난 대회
    base(FX.finished, {
      name_ko: '보스턴 마라톤',
      name_en: 'Boston Marathon',
      ...overseas('US', '미국', '보스턴', '북미'),
      is_major: true,
      entry_type: 'qualifying',
      entry_opens: d(-200),
      entry_closes: d(-190),
      race_date: d(-20),
      distances: ['풀'],
      flight_hours: 14,
    }),
    base(FX.pastSaved, { name_ko: '런던 마라톤', name_en: 'London Marathon', ...overseas('GB', '영국', '런던', '유럽'), entry_fee_currency: 'GBP', entry_opens: d(-300), entry_closes: d(-280), race_date: d(-60), distances: ['풀'], is_major: true }),
    base(FX.pastRecent, { name_ko: '서울 달빛 10K', name_en: 'Seoul Moonlight 10K', entry_opens: d(-60), entry_closes: d(-20), race_date: d(-1), distances: ['10km'] }),
  ];

  const rec = (race_id: string, status: RaceRecord['status'], extra: Partial<RaceRecord> = {}): RaceRecord => ({
    race_id,
    status,
    distance: null,
    distance_km: null,
    finish_sec: null,
    participation_count: 1,
    years: null,
    last_year: null,
    updated_at: today.toISOString(),
    ...extra,
  });
  const all = [
    rec(FX.registered, 'registered', { distance: '풀', distance_km: 42.195 }),
    rec(FX.registeredSaved, 'registered'),
    rec(FX.finished, 'finished', { distance: '풀', distance_km: 42.195, finish_sec: 3 * 3600 + 28 * 60 + 41 }),
  ];
  const registeredIds = all.filter((r) => r.status === 'registered').map((r) => r.race_id);

  const favIds = [
    FX.closesToday,
    FX.closes7,
    FX.closes8,
    FX.noClose,
    FX.monthStart,
    FX.opens3,
    FX.expected,
    FX.soldout,
    FX.closed,
    FX.cancelled,
    FX.registeredSaved,
    FX.finished,
    FX.pastSaved,
    FX.pastRecent,
    FX.missing,
  ];

  return {
    races,
    favIds,
    // 동기화 전(브라우저 저장분)이면 계정 기록이 없고 '접수했어요' 는 id 목록만 있다 (useRegistered 와 같은 꼴)
    records: synced ? new Map(all.map((r) => [r.race_id, r])) : new Map(),
    registeredIds,
  };
}

export function emptyFixture(today: Date = TODAY()): MyRacesFixture {
  return { races: fixture(today).races, favIds: [], records: new Map(), registeredIds: [] };
}
