/**
 * 관리자 대회 수정: 칸 목록·바뀐 칸 계산·저장할 칸만 고르기·검사 (순수 함수, 네트워크 없음).
 * node 로 바로 테스트하도록 import 는 './types.ts' 뿐 (scripts/admin-edit-test.mjs).
 *
 * 왜 '바뀐 칸만' 저장하나 (.duo-data/adminedit.md): 예전 관리 화면은 행 전체를 upsert 해서, 폼을 연 뒤
 * 자동 갱신(매일 대회 갱신 작업)이 고친 칸이나 폼에 없는 칸(notes_en 등)을 연 시점 값으로 되돌렸다.
 */
import type { Race } from './types.ts';
import { REGIONS, COURSES, CONFIDENCE_LABEL, ENTRY_LABEL, DISCIPLINE_LABEL } from './types.ts';

export type RaceKey = Exclude<keyof Race, 'id'>;
export type FieldKind = 'text' | 'textarea' | 'date' | 'number' | 'select' | 'check' | 'list';
export interface RaceFieldMeta {
  key: RaceKey;
  /** 한국어 칸 이름 */
  label: string;
  group: '기본' | '일정' | '접수' | '참가' | '코스' | '출처' | '메모';
  kind: FieldKind;
  /** select 값·표시 */
  options?: [string, string][];
  hint?: string;
  required?: boolean;
  /** 빈칸 → null */
  nullable?: boolean;
}

const CONF: [string, string][] = (['confirmed', 'expected', 'tbc'] as const).map((c) => [c, CONFIDENCE_LABEL[c]]);

export const RACE_FIELDS: readonly RaceFieldMeta[] = [
  { key: 'name_ko', label: '대회명 (한글)', group: '기본', kind: 'text', required: true },
  { key: 'name_en', label: '대회명 (영문)', group: '기본', kind: 'text', required: true },
  { key: 'city_ko', label: '도시', group: '기본', kind: 'text', hint: '예: 도쿄, 서울 광진' },
  { key: 'country_ko', label: '국가', group: '기본', kind: 'text', hint: '예: 일본' },
  { key: 'country_code', label: '국가 코드', group: '기본', kind: 'text', required: true, hint: '두 글자 (KR, JP, US…) — 비용 계산 기준' },
  { key: 'region', label: '지역', group: '기본', kind: 'select', required: true, options: REGIONS.map((r) => [r, r]) },
  { key: 'subregion', label: '주·도 코드', group: '기본', kind: 'text', nullable: true, hint: 'ISO 3166-2 (US-CA, JP-13). 모르면 빈칸' },
  { key: 'is_major', label: '메이저 대회', group: '기본', kind: 'check', hint: '국내는 국내 메이저, 해외는 세계 메이저로 보인다' },
  { key: 'race_date', label: '대회 날짜', group: '일정', kind: 'date', required: true },
  { key: 'date_confidence', label: '날짜 신뢰도', group: '일정', kind: 'select', required: true, options: CONF },
  { key: 'entry_type', label: '접수 방식', group: '접수', kind: 'select', required: true, options: (Object.keys(ENTRY_LABEL) as (keyof typeof ENTRY_LABEL)[]).map((k) => [k, ENTRY_LABEL[k]]) },
  { key: 'entry_opens', label: '접수 시작', group: '접수', kind: 'date', nullable: true },
  { key: 'entry_closes', label: '접수 마감', group: '접수', kind: 'date', nullable: true, hint: "비우면 '정원 소진 시'" },
  { key: 'entry_confidence', label: '접수 일정 신뢰도', group: '접수', kind: 'select', required: true, options: CONF },
  { key: 'sold_out_on', label: '조기 마감일', group: '접수', kind: 'date', nullable: true, hint: '정원이 차서 끝난 날. 아니면 빈칸' },
  { key: 'entry_fee', label: '참가비', group: '참가', kind: 'number', nullable: true, hint: '대표 종목 금액, 모르면 빈칸' },
  { key: 'entry_fee_currency', label: '통화', group: '참가', kind: 'text', required: true, hint: 'KRW, JPY, USD, EUR…' },
  { key: 'distances', label: '거리', group: '참가', kind: 'list', hint: '쉼표로 구분: 풀, 하프, 10km, 50K, 100M' },
  { key: 'field_size', label: '정원 (명)', group: '참가', kind: 'number', nullable: true },
  { key: 'course', label: '코스', group: '코스', kind: 'select', nullable: true, options: [['', '선택 안 함'], ...COURSES.map((c) => [c, c] as [string, string])] },
  { key: 'discipline', label: '종목 구분', group: '코스', kind: 'select', options: (Object.keys(DISCIPLINE_LABEL) as (keyof typeof DISCIPLINE_LABEL)[]).map((d) => [d, DISCIPLINE_LABEL[d]]) },
  { key: 'elevation_gain', label: '누적 상승 (m)', group: '코스', kind: 'number', nullable: true, hint: '트레일만, 모르면 빈칸' },
  { key: 'flight_hours', label: '이동 시간 (시간)', group: '코스', kind: 'number', nullable: true, hint: '인천/서울 출발 기준' },
  { key: 'official_url', label: '공식 홈페이지', group: '출처', kind: 'text', required: true, hint: 'https://' },
  { key: 'source_url', label: '정보 출처 링크', group: '출처', kind: 'text', nullable: true, hint: 'https://' },
  { key: 'last_verified', label: '확인 날짜', group: '출처', kind: 'date', required: true },
  { key: 'notes_ko', label: '메모 (한글)', group: '메모', kind: 'textarea', nullable: true, hint: "상세 정보에 보인다. 맨 앞에 '[취소]' 를 넣으면 취소 대회" },
  { key: 'notes_en', label: '메모 (영문)', group: '메모', kind: 'textarea', nullable: true, hint: '비우면 영어 화면에 메모가 안 보인다' },
];

const META = new Map(RACE_FIELDS.map((f) => [f.key, f]));
const INT_KEYS = new Set<RaceKey>(['field_size', 'elevation_gain']);

export interface FieldChange {
  key: RaceKey;
  label: string;
  /** formatValue 결과 */
  before: string;
  after: string;
}

const isBlank = (v: unknown) => v == null || (typeof v === 'string' && v.trim() === '');

/** 폼 값(문자열일 수도 있음)을 DB 에 넣을 모양으로 */
function normalize(key: RaceKey, v: unknown): unknown {
  const m = META.get(key);
  if (!m) return v;
  switch (m.kind) {
    case 'check':
      return v === true || v === 'true';
    case 'number': {
      if (isBlank(v)) return null;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
      if (!Number.isFinite(n)) return v; // 검사(validateRace)에서 걸리게 그대로 둔다
      return INT_KEYS.has(key) ? Math.round(n) : n;
    }
    case 'list': {
      const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
      return arr.map((s) => String(s).trim()).filter(Boolean);
    }
    default: {
      if (isBlank(v)) return m.nullable ? null : '';
      const s = String(v).trim();
      if (key === 'country_code' || key === 'entry_fee_currency' || key === 'subregion') return s.toUpperCase();
      return s;
    }
  }
}

/** 비교용: null·''·undefined 는 같다, 배열은 내용으로 */
function same(key: RaceKey, a: unknown, b: unknown): boolean {
  const x = normalize(key, a);
  const y = normalize(key, b);
  if (Array.isArray(x) && Array.isArray(y)) return x.length === y.length && x.every((v, i) => v === y[i]);
  if (isBlank(x) && isBlank(y)) return true;
  if (META.get(key)?.kind === 'check') return Boolean(x) === Boolean(y);
  return x === y;
}

/** 빈 값 '—', 배열 'a, b', boolean '예/아니오', select 는 표시 라벨 */
export function formatValue(key: RaceKey, v: unknown): string {
  const m = META.get(key);
  if (m?.kind === 'check') return v === true || v === 'true' ? '예' : '아니오';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (isBlank(v)) return '—';
  if (m?.kind === 'select') return m.options?.find(([val]) => val === String(v))?.[1] ?? String(v);
  if (m?.kind === 'number' && typeof v === 'number') return v.toLocaleString('ko-KR');
  return String(v);
}

/** RACE_FIELDS 순서, 값이 실제로 다른 칸만 */
export function diffRace(before: Race, after: Race): FieldChange[] {
  const out: FieldChange[] = [];
  for (const f of RACE_FIELDS) {
    const a = before[f.key];
    const b = after[f.key];
    if (same(f.key, a, b)) continue;
    out.push({ key: f.key, label: f.label, before: formatValue(f.key, normalize(f.key, a)), after: formatValue(f.key, normalize(f.key, b)) });
  }
  return out;
}

/** 바뀐 칸만 DB 모양으로 (빈 문자열은 nullable 이면 null, 숫자 칸은 number|null, 거리는 배열) */
export function toPatch(before: Race, after: Race): Partial<Race> {
  const patch: Record<string, unknown> = {};
  for (const f of RACE_FIELDS) {
    if (!same(f.key, before[f.key], after[f.key])) patch[f.key] = normalize(f.key, after[f.key]);
  }
  return patch as Partial<Race>;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s: string) => DATE_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().startsWith(s);
const validUrl = (s: string) => {
  if (!/^https?:\/\//i.test(s) || /\s/.test(s)) return false;
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
};

/**
 * 빈 객체면 통과. 필수·날짜 형식·URL(http/https — DB check races_official_url_http·races_source_url_http 와 같게)·
 * 통화 3글자·국가 코드 2글자·접수 시작≤마감·숫자 ≥0. 문구는 칸 옆에 그대로 보인다.
 */
export function validateRace(r: Race): Partial<Record<RaceKey | 'form', string>> {
  const err: Partial<Record<RaceKey | 'form', string>> = {};
  for (const f of RACE_FIELDS) {
    const v = normalize(f.key, r[f.key]);
    if (f.required && f.kind !== 'check' && isBlank(v)) {
      err[f.key] = `${f.label}은(는) 꼭 넣어야 합니다.`;
      continue;
    }
    if (isBlank(v)) continue;
    if (f.kind === 'date' && !validDate(String(v))) err[f.key] = '날짜는 YYYY-MM-DD 형식이어야 합니다.';
    if (f.kind === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) err[f.key] = '숫자만 넣어 주세요.';
      else if (v < 0) err[f.key] = '0 이상이어야 합니다.';
    }
    if (f.kind === 'select' && f.options && !f.options.some(([val]) => val === String(v))) err[f.key] = '목록에서 골라 주세요.';
  }
  const url = (k: 'official_url' | 'source_url') => {
    const v = normalize(k, r[k]);
    if (!isBlank(v) && !validUrl(String(v))) err[k] = '주소는 http:// 또는 https:// 로 시작해야 합니다.';
  };
  url('official_url');
  url('source_url');
  const cur = normalize('entry_fee_currency', r.entry_fee_currency);
  if (!err.entry_fee_currency && !/^[A-Z]{3}$/.test(String(cur))) err.entry_fee_currency = '통화는 영문 대문자 3글자입니다 (KRW, JPY…).';
  const cc = normalize('country_code', r.country_code);
  if (!err.country_code && !/^[A-Z]{2}$/.test(String(cc))) err.country_code = '국가 코드는 영문 대문자 2글자입니다 (KR, JP…).';
  const sub = normalize('subregion', r.subregion);
  if (!isBlank(sub) && !/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(String(sub))) err.subregion = '주·도 코드는 US-CA, JP-13 같은 모양입니다.';
  const o = normalize('entry_opens', r.entry_opens);
  const c = normalize('entry_closes', r.entry_closes);
  if (!err.entry_opens && !err.entry_closes && typeof o === 'string' && typeof c === 'string' && o > c) {
    err.entry_closes = '접수 마감이 접수 시작보다 빠릅니다.';
  }
  if (Object.keys(err).length) err.form = `고칠 칸이 ${Object.keys(err).length}개 있습니다.`;
  return err;
}
