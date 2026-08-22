export type EntryType =
  | 'lottery' // 추첨
  | 'fcfs' // 선착순
  | 'qualifying' // 기록 기준
  | 'tour_only' // 여행사(투어 슬롯) 전용
  | 'open'; // 정원 미달 / 상시 접수

export type Confidence = 'confirmed' | 'expected' | 'tbc';

export interface Race {
  id: string;
  name_ko: string;
  name_en: string;
  city_ko: string;
  country_ko: string;
  country_code: string;
  region: '일본' | '아시아' | '오세아니아' | '유럽' | '북미' | '기타';
  race_date: string; // YYYY-MM-DD
  date_confidence: Confidence;
  is_major: boolean;
  entry_type: EntryType;
  entry_opens: string | null;
  entry_closes: string | null;
  entry_confidence: Confidence;
  entry_fee: number | null;
  entry_fee_currency: string;
  distances: string[];
  field_size: number | null;
  course: '평지' | '완만' | '언덕' | null;
  flight_hours: number | null; // 인천 기준 직항 소요시간
  official_url: string;
  source_url: string | null;
  last_verified: string;
  notes_ko: string | null;
}

export interface Agency {
  id: string;
  name: string;
  url: string;
  note: string | null;
}

export interface Package {
  id: string;
  race_id: string;
  agency_id: string;
  title: string;
  nights: number | null;
  price_solo_krw: number | null;
  price_group_krw: number | null;
  group_min: number | null;
  includes: string[];
  url: string;
  updated_at: string | null;
}

export interface CostBaseline {
  race_id: string;
  flight_low_krw: number;
  flight_mid_krw: number;
  flight_high_krw: number;
  hotel_night_krw: number;
  daily_krw: number;
}

export interface AlertSub {
  email: string;
  race_id: string;
  days_before: number[];
}

export const ENTRY_LABEL: Record<EntryType, string> = {
  lottery: '추첨',
  fcfs: '선착순',
  qualifying: '기록 기준',
  tour_only: '여행사 전용',
  open: '상시 접수',
};

export const ENTRY_DESC: Record<EntryType, string> = {
  lottery: '신청 기간 안에 응모하면 무작위 추첨. 빨리 넣는다고 유리하지 않음.',
  fcfs: '오픈과 동시에 마감되는 경우가 많음. 오픈 시각에 대기 필수.',
  qualifying: '연령대별 공인 기록을 충족해야 신청 가능.',
  tour_only: '개인 신청 창구가 없거나 사실상 막혀 있어 여행사 슬롯으로 참가.',
  open: '정원에 여유가 있어 마감 전까지 신청 가능.',
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  confirmed: '확정',
  expected: '예상',
  tbc: '미정',
};
