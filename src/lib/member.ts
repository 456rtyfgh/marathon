/**
 * 회원 기능의 DB 호출 (표·함수는 supabase/migrations/0013_member.sql). 화면 코드는 이 파일만 쓴다.
 * - 모두 로그인한 세션으로 부른다(RLS 가 본인 행만 보여 준다). 표의 user_id 는 DB 가 auth.uid() 로 채운다.
 * - 0013 을 아직 실행하지 않은 DB(표·함수 없음)나 Supabase 미연결이면 MemberNotReady 를 던진다
 *   → 화면은 지금처럼 브라우저 저장으로 동작하면 된다.
 * - 그 밖의 오류는 서버 메시지 그대로 Error(한국어일 수 있음 — 영어 화면은 일반 문구로 바꿔 보여 준다).
 */
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Lang } from '../i18n/lang';
import type { Race } from './types';
import { downloadIcs as downloadRaceIcs, type CalKind } from './ics';
import { devMemberMock } from './memberMock';

/** 개발 서버 로그인 흉내(?amock)일 때 서버 대신 쓰는 흉내 DB (memberMock.ts). 빌드에서는 null */
const MOCK = import.meta.env.DEV ? devMemberMock() : null;

export class MemberNotReady extends Error {
  constructor(message = 'member features are not ready') {
    super(message);
    this.name = 'MemberNotReady';
  }
}

export const isMemberNotReady = (e: unknown): e is MemberNotReady => e instanceof MemberNotReady;

// PGRST202: 함수 없음, PGRST205: 표 없음(스키마 캐시), 42P01: 표 없음, 42883: 함수 없음
const MISSING = new Set(['PGRST202', 'PGRST205', '42P01', '42883']);

function sb() {
  if (!supabase) throw new MemberNotReady('no supabase');
  return supabase;
}

function check(error: PostgrestError | null): void {
  if (!error) return;
  if (MISSING.has(error.code) || /could not find the (function|table)/i.test(error.message)) throw new MemberNotReady(error.message);
  throw new Error(error.message);
}

/* ── 저장한 대회 ─────────────────────────────────────────── */

export async function listFavorites(): Promise<string[]> {
  const { data, error } = await sb().from('user_favorites').select('race_id').order('created_at').order('race_id');
  check(error);
  return (data ?? []).map((r: { race_id: string }) => r.race_id);
}

/** 이미 저장돼 있어도 오류 없이 지나간다 */
export async function addFavorite(raceId: string): Promise<void> {
  const { error } = await sb().from('user_favorites').upsert({ race_id: raceId }, { onConflict: 'user_id,race_id', ignoreDuplicates: true });
  check(error);
}

export async function removeFavorite(raceId: string): Promise<void> {
  const { error } = await sb().from('user_favorites').delete().eq('race_id', raceId);
  check(error);
}

/** 브라우저에 저장해 둔 대회를 계정에 합치고(없는 대회 id 는 무시, 500개까지) 계정의 저장 목록 전체를 돌려준다 */
export async function mergeFavorites(ids: string[]): Promise<string[]> {
  const { data, error } = await sb().rpc('merge_favorites', { p_ids: ids });
  check(error);
  return (data ?? []) as string[];
}

/* ── 내 대회 (접수했어요 · 참가했어요 + 기록) ───────────────── */

export interface RaceRecord {
  race_id: string;
  status: 'registered' | 'finished';
  /** 고른 종목 이름 (race.distances 의 값) */
  distance: string | null;
  distance_km: number | null;
  /** 완주 기록(초) — status 가 finished 일 때만 */
  finish_sec: number | null;
  updated_at: string;
}

const RECORD_COLS = 'race_id, status, distance, distance_km, finish_sec, updated_at';
const toRecord = (r: RaceRecord): RaceRecord => ({ ...r, distance_km: r.distance_km == null ? null : Number(r.distance_km) });

export async function listRecords(): Promise<RaceRecord[]> {
  if (MOCK) return MOCK.list();
  const { data, error } = await sb().from('user_races').select(RECORD_COLS).order('created_at').order('race_id');
  check(error);
  return ((data ?? []) as RaceRecord[]).map(toRecord);
}

/**
 * 한 대회의 내 기록을 통째로 저장(있으면 바꾼다). 빠진 칸(distance·distance_km·finish_sec)은 비운다.
 * status 가 registered 면 finish_sec 은 비워야 한다(DB check).
 */
export async function saveRecord(
  r: Pick<RaceRecord, 'race_id' | 'status'> & Partial<Pick<RaceRecord, 'distance' | 'distance_km' | 'finish_sec'>>,
): Promise<RaceRecord> {
  const row = {
    race_id: r.race_id,
    status: r.status,
    distance: r.distance ?? null,
    distance_km: r.distance_km ?? null,
    finish_sec: r.status === 'finished' ? (r.finish_sec ?? null) : null,
  };
  if (MOCK) return MOCK.save(row);
  const { data, error } = await sb().from('user_races').upsert(row, { onConflict: 'user_id,race_id' }).select(RECORD_COLS).single();
  check(error);
  return toRecord(data as RaceRecord);
}

export async function deleteRecord(raceId: string): Promise<void> {
  if (MOCK) return MOCK.remove(raceId);
  const { error } = await sb().from('user_races').delete().eq('race_id', raceId);
  check(error);
}

/** 브라우저의 '접수했어요' 를 계정에 합치고(이미 있는 대회는 그대로) 내 대회 전체를 돌려준다 */
export async function mergeRegistered(ids: string[]): Promise<RaceRecord[]> {
  if (MOCK) return MOCK.merge(ids);
  const { data, error } = await sb().rpc('merge_registered', { p_ids: ids });
  check(error);
  return ((data ?? []) as RaceRecord[]).map(toRecord);
}

export interface RecordSummary {
  /** year 에 열린 대회 중 참가(finished)한 수 */
  year_count: number;
  /** 그 대회들의 거리 합(km) */
  year_km: number;
  /** 전 기간 풀코스·하프 최고 기록(초), 없으면 null */
  best_full_sec: number | null;
  best_half_sec: number | null;
}

export async function recordSummary(year: number): Promise<RecordSummary> {
  if (MOCK) return MOCK.summary(year);
  const { data, error } = await sb().rpc('my_record_summary', { p_year: year });
  check(error);
  const r = ((data ?? []) as RecordSummary[])[0];
  return {
    year_count: Number(r?.year_count ?? 0),
    year_km: Number(r?.year_km ?? 0),
    best_full_sec: r?.best_full_sec ?? null,
    best_half_sec: r?.best_half_sec ?? null,
  };
}

/* ── 저장한 대회 알림 ───────────────────────────────────── */

export interface AlertPrefs {
  saved_races: boolean;
  days_before: number[];
}

/** 아직 한 번도 설정하지 않았으면 null */
export async function getAlertPrefs(): Promise<AlertPrefs | null> {
  if (MOCK) return MOCK.alertPrefs();
  const { data, error } = await sb().from('user_alert_prefs').select('saved_races, days_before').maybeSingle();
  check(error);
  return (data as AlertPrefs | null) ?? null;
}

export async function setSavedAlerts(on: boolean): Promise<AlertPrefs> {
  const { data, error } = await sb()
    .from('user_alert_prefs')
    .upsert({ saved_races: on }, { onConflict: 'user_id' })
    .select('saved_races, days_before')
    .single();
  check(error);
  return data as AlertPrefs;
}

/* ── 내 일정 구독 주소 ──────────────────────────────────── */

/** 내 구독 주소를 만든 시각(ISO), 없으면 null */
export async function calendarTokenInfo(): Promise<string | null> {
  if (MOCK) return MOCK.tokenInfo();
  const { data, error } = await sb().rpc('calendar_token_info');
  check(error);
  return (data as string | null) ?? null;
}

/** 새 구독 토큰(소문자 hex 64자). 원문은 이때 한 번만 받는다 — 이전 주소는 바로 멈춘다 */
export async function issueCalendarToken(): Promise<string> {
  const { data, error } = await sb().rpc('issue_calendar_token');
  check(error);
  return data as string;
}

/** 구독 주소. 캘린더 앱에 넣을 땐 webcal, 복사·구글 캘린더용으로 https 도 쓸 수 있다 */
export const feedUrl = (token: string, lang: Lang, scheme: 'webcal' | 'https' = 'webcal'): string =>
  `${scheme}://${location.host}/cal/u/${token}.ics${lang === 'en' ? '?lang=en' : ''}`;

/* ── 대회 하나 .ics 받기 ────────────────────────────────── */

/** ics.ts 의 downloadIcs 를 지금 로그인 세션의 access token 으로 부른다. 세션이 없으면 'unauthorized' */
export async function downloadIcs(race: Pick<Race, 'id'>, kinds: CalKind[], lang: Lang): Promise<'ok' | 'unauthorized' | 'kakao' | 'error'> {
  const token = supabase ? (await supabase.auth.getSession()).data.session?.access_token : undefined;
  if (!token) return 'unauthorized';
  return downloadRaceIcs(race, kinds, lang, token);
}

/* ── 거리·기록 글자 ─────────────────────────────────────── */

const MILE_KM = 1.609344;

/** 종목 이름 → km. '풀' 42.195, '하프' 21.0975, '10km'·'50K' → 숫자, '10마일'·'100M' → 마일 환산, 그 밖(건강달리기 등) null */
export function distanceKm(label: string): number | null {
  const s = label.trim();
  if (s === '풀' || /^(full|marathon)$/i.test(s)) return 42.195;
  if (s === '하프' || /^half$/i.test(s)) return 21.0975;
  let m = /^(\d+(?:\.\d+)?)\s*(?:km|k)$/i.exec(s);
  if (m) return Number(m[1]);
  m = /^(\d+(?:\.\d+)?)\s*(?:마일|mi|mile|miles|m)$/i.exec(s);
  if (m) return Math.round(Number(m[1]) * MILE_KM * 1000) / 1000;
  return null;
}

/** 초 → 'H:MM:SS' */
export function fmtFinish(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** 'H:MM:SS' 또는 'MM:SS' → 초. 형식이 틀리거나 DB 범위(1분~7일) 밖이면 null */
export function parseFinish(input: string): number | null {
  const s = input.trim();
  let sec: number | null = null;
  let m = /^(\d{1,3}):([0-5]\d):([0-5]\d)$/.exec(s);
  if (m) sec = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  else if ((m = /^([0-5]?\d):([0-5]\d)$/.exec(s))) sec = Number(m[1]) * 60 + Number(m[2]);
  return sec != null && sec >= 60 && sec <= 604800 ? sec : null;
}
