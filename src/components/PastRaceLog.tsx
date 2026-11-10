/**
 * 내 정보 '내 기록' 아래: 내가 참가한 대회 목록 + '지난 대회 등록' 버튼과 등록 창.
 * 대회 상세에 가지 않고 여기서 바로 대회를 찾아(한글·영문 이름·도시, 지난 대회 먼저) 종목·완주 기록을 남기고,
 * 같은 대회를 여러 해 뛰었으면 한 줄에 참가 횟수(또는 참가한 해 목록 — 고르면 횟수 자동)·마지막 참가 해·최고 기록을 둔다(0019).
 * 이미 등록한 대회는 눌러서 고치거나 지운다. 저장은 member.ts 의 user_races(status 'finished') 함수 그대로.
 * 바꾼 뒤에는 onChanged(위 요약 다시 읽기)와 RECORDS_CHANGED 이벤트(대회 목록·상세의 내 기록 다시 읽기)를 보낸다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { CaretLeft, CaretRight, Check, MagnifyingGlass, Minus, PencilSimple, Plus } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import { DIST_TEXT, fmtCount } from '../i18n/format';
import { raceName, whereText } from '../i18n/names';
import { loadAllRaces } from '../lib/data';
import {
  cleanYears,
  deleteRecord,
  distanceKm,
  fmtFinish,
  isMemberNotReady,
  listRecords,
  parseFinish,
  participationReady,
  saveRecord,
  type RaceRecord,
} from '../lib/member';
import { RECORDS_CHANGED } from '../lib/registered';
import { buildIndex, normalize, searchRaces, suggestRaces } from '../lib/search';
import { hasSupabase } from '../lib/supabase';
import { track } from '../lib/analytics';
import { fmtDate, todayISO } from '../lib/util';
import type { Race } from '../lib/types';
import { Button, CloseButton, Field, Input, Note, Panel, inputCls } from './ui';

/* ── 대회 목록 (목록 파일 → 안 되면 DB). 내 정보를 여러 번 열어도 한 번만 받는다 ── */

let racesP: Promise<Race[]> | null = null;
function loadRaces(): Promise<Race[]> {
  racesP ??= (async () => {
    try {
      const res = await fetch(__DATA_LIST_URL__);
      if (res.ok) {
        const j = (await res.json()) as { races?: Race[] };
        if (j.races?.length) return j.races;
      }
    } catch {
      /* 아래 DB 로 */
    }
    if (hasSupabase) {
      const { data } = await loadAllRaces();
      if (data?.length) return data;
    }
    throw new Error('race list unavailable');
  })().catch((e) => {
    racesP = null; // 다음에 다시 시도
    throw e;
  });
  return racesP;
}

const SHOW = 5; // 내 대회 목록 처음에 보이는 수
const MAX_HITS = 40;

/** 대회 둘째 줄: 지난 대회는 '날짜 · 장소', 다음 회차로 넘어간 대회는 '다음 대회 날짜 · 장소' */
function raceLine(r: Race, lang: 'ko' | 'en', t: ReturnType<typeof useLang>['t'], today = todayISO()): string {
  const d = fmtDate(r.race_date, lang);
  return `${r.race_date <= today ? d : t('pastrace.next', { d })} · ${whereText(r, lang)}`;
}

/**
 * 내가 참가한 회차의 날짜. 대회 행은 끝나면 다음 회차 날짜로 넘어가므로(매년 열리는 대회), 날짜가 아직 안 온 행에
 * 남긴 참가 기록은 한 해 전 회차로 본다. 내 대회 목록 순서와 '올해 참가·총 거리'에 쓴다.
 */
function editionDate(r: Pick<Race, 'race_date'>, today = todayISO()): string {
  return r.race_date <= today ? r.race_date : `${Number(r.race_date.slice(0, 4)) - 1}${r.race_date.slice(4)}`;
}

/** 마지막으로 참가한 해: 적은 해 목록 → 마지막 참가 해 → 대회 행의 참가 회차 */
function lastYearOf(rec: RaceRecord, r: Race | undefined): number | null {
  return rec.years?.[0] ?? rec.last_year ?? (r ? Number(editionDate(r).slice(0, 4)) : null);
}

/** year 에 참가했는지 (0019 의 my_record_summary 와 같은 규칙: 해 목록 → 마지막 해 → 대회 행 회차) */
function ranIn(rec: RaceRecord, r: Race | undefined, year: number): boolean {
  if (rec.years?.length) return rec.years.includes(year);
  if (rec.last_year != null) return rec.last_year === year;
  return !!r && editionDate(r).startsWith(`${year}-`);
}

export interface RecordStats {
  /** year 에 참가한 대회 수·거리 (참가 회차 기준) */
  count: number;
  km: number;
  /** 참가한 대회 수(줄 수)·참가 횟수 합 */
  races: number;
  times: number;
  /** 가장 많이 뛴 대회 (2회 이상, 횟수 많은 순 → 최근 순, 3개까지) */
  top: { id: string; name: string; n: number }[];
}

/** 내 대회 목록 둘째 줄의 해: 마지막 참가가 그 대회 행의 지난 날짜면 날짜까지, 아니면 해만 (요일까지 짐작하지 않는다) */
function ranLine(rec: RaceRecord, r: Race, lang: 'ko' | 'en'): string {
  const y = lastYearOf(rec, r);
  const sameRow = r.race_date <= todayISO() && y === Number(r.race_date.slice(0, 4));
  return `${sameRow ? fmtDate(r.race_date, lang) : y} · ${whereText(r, lang)}`;
}

export default function PastRaceLog({
  year,
  onChanged,
  onStats,
  onError,
}: {
  year: number;
  onChanged: () => void;
  /** 참가 회차 기준 year 의 참가 수·거리와 전체 참가 대회·횟수·Top3 (대회 목록을 받은 뒤). DB 요약(0019 전)은 대회 행 날짜 기준이라 */
  onStats: (s: RecordStats | null) => void;
  onError: (e: unknown) => void;
}) {
  const { lang, t } = useLang();
  const [records, setRecords] = useState<RaceRecord[] | null>(null);
  const [races, setRaces] = useState<Race[] | null>(null);
  const [raceErr, setRaceErr] = useState(false);
  const [all, setAll] = useState(false);
  // undefined = 닫힘, null = 새로 등록(검색부터), Race = 그 대회 고치기
  const [sheet, setSheet] = useState<Race | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    listRecords().then((rows) => alive && setRecords(rows), onError);
    loadRaces().then(
      (rs) => alive && setRaces(rs),
      () => alive && setRaceErr(true),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byId = useMemo(() => new Map((races ?? []).map((r) => [r.id, r])), [races]);
  const mine = useMemo(() => {
    const done = (records ?? []).filter((r) => r.status === 'finished');
    // 마지막 참가 최근 순 → 같은 해면 대회 행 회차 날짜 (목록에 없는 대회는 맨 뒤)
    const when = (rec: RaceRecord) => {
      const r = byId.get(rec.race_id);
      return r ? `${lastYearOf(rec, r)}${editionDate(r).slice(4)}` : '';
    };
    return done.sort((a, b) => when(b).localeCompare(when(a)));
  }, [records, byId]);

  useEffect(() => {
    if (!records || !races) return onStats(null);
    const inYear = mine.filter((rec) => ranIn(rec, byId.get(rec.race_id), year));
    // mine 은 이미 최근 순 — 안정 정렬이라 횟수가 같으면 최근에 뛴 대회가 앞
    const top = mine
      .filter((rec) => rec.participation_count >= 2)
      .sort((a, b) => b.participation_count - a.participation_count)
      .slice(0, 3)
      .map((rec) => {
        const r = byId.get(rec.race_id);
        return { id: rec.race_id, name: r ? raceName(r, lang) : t('pastrace.gone'), n: rec.participation_count };
      });
    onStats({
      count: inYear.length,
      km: inYear.reduce((n, rec) => n + (rec.distance_km ?? 0), 0),
      races: mine.length,
      times: mine.reduce((n, rec) => n + rec.participation_count, 0),
      top,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, records, races, byId, year, lang]);
  const recMap = useMemo(() => new Map((records ?? []).map((r) => [r.race_id, r])), [records]);

  const changed = (id: string, row: RaceRecord | null) => {
    setRecords((prev) => {
      const rest = (prev ?? []).filter((r) => r.race_id !== id);
      return row ? [...rest, row] : rest;
    });
    onChanged();
    window.dispatchEvent(new Event(RECORDS_CHANGED));
  };

  const shown = all ? mine : mine.slice(0, SHOW);

  return (
    <div className="mt-4">
      {mine.length > 0 && (
        <>
          <h4 className="text-[13px] font-semibold text-ink-2">{t('me.records.list')}</h4>
          <ul className="mt-2 divide-y divide-line rounded-box border border-line">
            {shown.map((rec) => {
              const race = byId.get(rec.race_id);
              const name = race ? raceName(race, lang) : t('pastrace.gone');
              return (
                <li key={rec.race_id}>
                  <button
                    type="button"
                    disabled={!race}
                    onClick={() => race && setSheet(race)}
                    aria-label={t('me.records.editOne', { name })}
                    className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-sunken disabled:hover:bg-transparent"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{name}</span>
                      <span className="num block truncate text-[13px] text-ink-3">
                        {[
                          rec.participation_count > 1 ? t('pastrace.timesN', { n: rec.participation_count, count: rec.participation_count }) : null,
                          rec.distance ? DIST_TEXT[lang](rec.distance) : null,
                          race ? ranLine(rec, race, lang) : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className={`num shrink-0 text-right ${rec.finish_sec != null ? 'text-[15px] font-semibold text-ink' : 'text-[13px] text-ink-3'}`}>
                      {rec.finish_sec != null ? fmtFinish(rec.finish_sec) : t('record.noTime')}
                    </span>
                    {race && <PencilSimple size={16} className="shrink-0 text-ink-3" aria-hidden />}
                  </button>
                </li>
              );
            })}
          </ul>
          {mine.length > SHOW && (
            <button
              type="button"
              onClick={() => setAll((v) => !v)}
              className="mt-1 inline-flex min-h-11 items-center text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink"
            >
              {all ? t('me.records.fold') : t('me.records.all', { n: fmtCount(mine.length, lang) })}
            </button>
          )}
        </>
      )}
      {records && !mine.length && <p className="text-[15px] sm:text-[13px] leading-relaxed text-ink-3">{t('me.records.hint')}</p>}
      <Button type="button" tone="quiet" className="mt-3 w-full sm:w-auto" disabled={!records} onClick={() => setSheet(null)}>
        <Plus size={16} weight="bold" />
        {t('me.records.add')}
      </Button>

      <Panel open={sheet !== undefined} onClose={() => setSheet(undefined)} label={t(sheet ? 'pastrace.editTitle' : 'pastrace.title')} variant="sheet">
        {sheet !== undefined && (
          <RecordSheet
            initial={sheet}
            races={races}
            raceErr={raceErr}
            records={recMap}
            onClose={() => setSheet(undefined)}
            onSaved={(row) => {
              changed(row.race_id, row);
              setSheet(undefined);
            }}
            onRemoved={(id) => {
              changed(id, null);
              setSheet(undefined);
            }}
            onNotReady={onError}
          />
        )}
      </Panel>
    </div>
  );
}

/* ── 등록 창: 대회 찾기 → 종목·기록 ──────────────────────── */

function RecordSheet({
  initial,
  races,
  raceErr,
  records,
  onClose,
  onSaved,
  onRemoved,
  onNotReady,
}: {
  initial: Race | null;
  races: Race[] | null;
  raceErr: boolean;
  records: Map<string, RaceRecord>;
  onClose: () => void;
  onSaved: (row: RaceRecord) => void;
  onRemoved: (id: string) => void;
  onNotReady: (e: unknown) => void;
}) {
  const { t } = useLang();
  const [race, setRace] = useState<Race | null>(initial);
  const [q, setQ] = useState('');
  const editing = !!race && records.get(race.id)?.status === 'finished';
  return (
    // 휴대폰: 아래 시트(높이 90dvh 까지, index.css) 안에서 목록만 스크롤되고 제목·닫기는 위에 남게 시트 높이에 맞춘다
    <div className="flex max-h-[calc(90dvh-env(safe-area-inset-bottom)-1px)] flex-col sm:max-h-[min(680px,calc(100dvh-48px))]">
      <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-2">
        <h2 className="text-[17px] font-bold tracking-tight">{t(editing ? 'pastrace.editTitle' : 'pastrace.title')}</h2>
        <CloseButton onClick={onClose} />
      </div>
      {race ? (
        <RecordForm
          key={race.id}
          race={race}
          record={records.get(race.id)}
          // 고치기로 연 창은 대회가 정해져 있다 — 새 등록일 때만 다시 고르기
          onBack={initial ? undefined : () => setRace(null)}
          onSaved={onSaved}
          onRemoved={onRemoved}
          onNotReady={onNotReady}
        />
      ) : (
        <RacePicker q={q} setQ={setQ} races={races} raceErr={raceErr} records={records} onPick={setRace} />
      )}
    </div>
  );
}

function RacePicker({
  q,
  setQ,
  races,
  raceErr,
  records,
  onPick,
}: {
  q: string;
  setQ: (v: string) => void;
  races: Race[] | null;
  raceErr: boolean;
  records: Map<string, RaceRecord>;
  onPick: (r: Race) => void;
}) {
  const { lang, t } = useLang();
  const today = todayISO();
  const input = useRef<HTMLInputElement>(null);

  // 마우스로 쓰는 화면에서만 바로 입력 칸에 (휴대폰은 자판이 갑자기 올라오지 않게). 창이 열린 뒤에 잡히도록 한 박자 늦게
  useEffect(() => {
    if (!matchMedia('(pointer: fine)').matches) return;
    const id = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  // 한글·영문 이름·도시·나라만 본다 (메모까지 보면 '서울' 이 다른 대회 메모에도 걸린다). 영어 도시 이름은 화면 언어와 상관없이
  const index = useMemo(() => (races ? buildIndex(races.map((r) => ({ ...r, notes_ko: null, notes_en: null })), 'en') : []), [races]);
  const byId = useMemo(() => new Map((races ?? []).map((r) => [r.id, r])), [races]);
  const isPast = (r: Race) => r.race_date <= today;

  const { list, total, suggested } = useMemo(() => {
    if (!races) return { list: [] as Race[], total: 0, suggested: false };
    const term = q.trim();
    if (!term) {
      const recent = races.filter(isPast).sort((a, b) => b.race_date.localeCompare(a.race_date));
      return { list: recent.slice(0, 20), total: 0, suggested: false };
    }
    let hits = [...searchRaces(index, term)].map((r) => byId.get(r.id)!);
    let suggested = false;
    if (!hits.length) {
      hits = suggestRaces(index, term, 5).map((r) => byId.get(r.id)!);
      suggested = hits.length > 0;
    }
    const n = normalize(term);
    const nameHit = (r: Race) => normalize(r.name_ko).includes(n) || normalize(r.name_en ?? '').includes(n);
    // 이름이 맞는 것 먼저 → 지난 대회(최근 순) → 예정 대회(가까운 순)
    hits.sort(
      (a, b) =>
        Number(nameHit(b)) - Number(nameHit(a)) ||
        Number(isPast(b)) - Number(isPast(a)) ||
        (isPast(a) ? b.race_date.localeCompare(a.race_date) : a.race_date.localeCompare(b.race_date)),
    );
    return { list: hits.slice(0, MAX_HITS), total: hits.length, suggested };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [races, index, byId, q, today]);

  const hasNext = list.some((r) => !isPast(r));

  return (
    <>
      <div className="px-5 pb-3">
        <label className="relative block">
          <span className="sr-only">{t('pastrace.search')}</span>
          <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('pastrace.placeholder')}
            className={`${inputCls} pl-10 [&::-webkit-search-cancel-button]:appearance-none`}
          />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-line px-2 pb-3" aria-live="polite">
        {!races ? (
          <p className="px-3 py-6 text-[15px] sm:text-[13px] text-ink-3">{raceErr ? t('pastrace.loadFail') : t('pastrace.loading')}</p>
        ) : (
          <>
            <p className="px-3 pt-3 pb-1 text-[13px] font-semibold text-ink-3">
              {!q.trim()
                ? t('pastrace.recent')
                : suggested
                  ? t('pastrace.maybe')
                  : total
                    ? t('pastrace.found', { n: fmtCount(total, lang), count: total })
                    : t('pastrace.none')}
            </p>
            <ul>
              {list.map((r) => {
                const added = records.get(r.id)?.status === 'finished';
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => onPick(r)}
                      className="flex min-h-14 w-full items-center gap-3 rounded-ctl px-3 py-2 text-left transition hover:bg-sunken"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold text-ink">{raceName(r, lang)}</span>
                        <span className="num block truncate text-[13px] text-ink-3">{raceLine(r, lang, t, today)}</span>
                      </span>
                      {added ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ink px-2 py-0.5 text-[12px] font-semibold text-ink">
                          <Check size={12} weight="bold" />
                          {t('pastrace.added')}
                        </span>
                      ) : (
                        <CaretRight size={16} className="shrink-0 text-ink-3" aria-hidden />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
            {hasNext && <p className="px-3 pt-2 text-[15px] sm:text-[13px] leading-relaxed text-ink-3">{t('pastrace.nextHint')}</p>}
          </>
        )}
      </div>
    </>
  );
}

const CHIP_YEARS = 12; // 참가한 해 칩으로 바로 보이는 최근 해 수 (그 앞은 '이전 해 추가')
const FIRST_YEAR = 1970;
const stepCls = 'grid size-11 shrink-0 place-items-center rounded-ctl border border-line text-ink transition hover:border-ink-3 disabled:opacity-40 sm:size-10';

const chipCls = (on: boolean, size = 'gap-1.5 px-3 text-[15px]') =>
  `inline-flex min-h-11 items-center justify-center ${size} rounded-ctl border transition active:translate-y-px sm:min-h-9 ${
    on ? 'border-ink bg-sunken font-semibold text-ink' : 'border-line text-ink-2 hover:border-ink-3 hover:text-ink'
  }`;

function RecordForm({
  race,
  record,
  onBack,
  onSaved,
  onRemoved,
  onNotReady,
}: {
  race: Race;
  record: RaceRecord | undefined;
  onBack?: () => void;
  onSaved: (row: RaceRecord) => void;
  onRemoved: (id: string) => void;
  onNotReady: (e: unknown) => void;
}) {
  const { lang, t } = useLang();
  const finished = record?.status === 'finished';
  const [dist, setDist] = useState(record?.distance ?? (race.distances.length === 1 ? race.distances[0] : ''));
  const [time, setTime] = useState(finished && record?.finish_sec != null ? fmtFinish(record.finish_sec) : '');
  const thisYear = Number(todayISO().slice(0, 4));
  // 0019 전 DB 면 횟수·해 칸이 없다 → 예전처럼 종목·기록만
  const canCount = participationReady() !== false;
  const guessYear = Math.min(thisYear, Number(editionDate(race).slice(0, 4)));
  const [mode, setMode] = useState<'count' | 'years'>(finished && record?.years?.length ? 'years' : 'count');
  const [count, setCount] = useState(String(finished ? (record?.participation_count ?? 1) : 1));
  const [lastYear, setLastYear] = useState(String((finished ? record?.last_year : null) ?? guessYear));
  const [years, setYears] = useState<number[]>(finished && record?.years?.length ? record.years : [guessYear]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sure, setSure] = useState(false);

  const many = canCount && (mode === 'years' ? years.length : Number(count)) > 1;
  const chips = [...new Set([...Array.from({ length: CHIP_YEARS }, (_, k) => thisYear - k), ...years])].sort((a, b) => b - a);
  const allYears = Array.from({ length: thisYear - FIRST_YEAR + 1 }, (_, k) => thisYear - k);
  const older = allYears.filter((y) => y <= thisYear - CHIP_YEARS && !years.includes(y));
  const toggleYear = (y: number) => setYears((prev) => (prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y]).sort((a, b) => b - a));
  const step = (d: number) => setCount((c) => String(Math.min(99, Math.max(1, (Math.round(Number(c)) || 1) + d))));

  const fail = (e: unknown) => {
    if (isMemberNotReady(e)) onNotReady(e);
    setErr(e instanceof Error && lang === 'ko' && /[가-힣]/.test(e.message) ? e.message : t('record.fail'));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const raw = time.trim();
    const sec = raw ? parseFinish(raw) : null;
    if (raw && sec == null) return setErr(t('record.timeBad'));
    let part: Pick<RaceRecord, 'participation_count' | 'years' | 'last_year'> | null = null;
    if (canCount) {
      if (mode === 'years') {
        const ys = cleanYears(years);
        if (!ys) return setErr(t('pastrace.yearsNone'));
        part = { participation_count: ys.length, years: ys, last_year: ys[0] };
      } else {
        const c = Number(count);
        if (!Number.isInteger(c) || c < 1 || c > 99) return setErr(t('pastrace.countBad'));
        part = { participation_count: c, years: null, last_year: lastYear ? Number(lastYear) : null };
      }
    }
    setBusy(true);
    setErr('');
    try {
      const row = await saveRecord({
        race_id: race.id,
        status: 'finished',
        distance: dist || null,
        distance_km: dist ? distanceKm(dist) : null,
        finish_sec: sec,
        ...part,
      });
      if (!finished) track('race_finished', { race_id: race.id, from: 'me' });
      onSaved(row);
    } catch (e2) {
      fail(e2);
      setBusy(false);
    }
  }

  async function remove() {
    if (!sure) return setSure(true);
    setBusy(true);
    setErr('');
    try {
      await deleteRecord(race.id);
      onRemoved(race.id);
    } catch (e2) {
      fail(e2);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-5">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 inline-flex min-h-11 items-center gap-1 text-[13px] font-semibold text-ink-2 transition hover:text-ink sm:min-h-9"
        >
          <CaretLeft size={14} weight="bold" />
          {t('pastrace.back')}
        </button>
      )}
      <div className="rounded-box border border-line px-4 py-3">
        <p className="text-[15px] leading-snug font-semibold text-ink">{raceName(race, lang)}</p>
        <p className="num mt-0.5 text-[13px] text-ink-3">{raceLine(race, lang, t)}</p>
      </div>

      {canCount && (
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">{t('pastrace.times')}</legend>
          <div role="radiogroup" aria-label={t('pastrace.times')} className="grid grid-cols-2 gap-2 sm:inline-grid">
            {(['count', 'years'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={chipCls(mode === m)}>
                {mode === m && <Check size={14} weight="bold" aria-hidden />}
                {t(m === 'count' ? 'pastrace.modeCount' : 'pastrace.modeYears')}
              </button>
            ))}
          </div>
          {mode === 'count' ? (
            <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-3">
              <div className="flex items-center gap-1.5">
                <button type="button" onClick={() => step(-1)} disabled={Number(count) <= 1} aria-label={t('pastrace.less')} className={stepCls}>
                  <Minus size={16} weight="bold" />
                </button>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={2}
                  aria-label={t('pastrace.times')}
                  value={count}
                  onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))}
                  onBlur={() => setCount((c) => String(Math.min(99, Math.max(1, Number(c) || 1))))}
                  className={`${inputCls.replace('w-full', 'w-16')} num text-center font-semibold`}
                />
                <button type="button" onClick={() => step(1)} disabled={Number(count) >= 99} aria-label={t('pastrace.more')} className={stepCls}>
                  <Plus size={16} weight="bold" />
                </button>
                <span className="ml-1 text-[15px] text-ink-2">{t('pastrace.timesUnit', { count: Number(count) || 1 })}</span>
              </div>
              <label className="block min-w-36 flex-1 sm:flex-none">
                <span className="mb-1.5 block text-[13px] text-ink-3">
                  {t('pastrace.lastYear')}
                  <span className="ml-2">{t('common.optional')}</span>
                </span>
                <select value={lastYear} onChange={(e) => setLastYear(e.target.value)} className={`${inputCls} num`}>
                  <option value="">{t('pastrace.yearUnknown')}</option>
                  {allYears.map((y) => (
                    <option key={y} value={y}>
                      {t('pastrace.yearOpt', { y })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="mt-3">
              <p className="mb-2 text-[15px] sm:text-[13px] leading-relaxed text-ink-3">{t('pastrace.yearsHint')}</p>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {chips.map((y) => {
                  const on = years.includes(y);
                  return (
                    <button key={y} type="button" role="checkbox" aria-checked={on} onClick={() => toggleYear(y)} className={`num ${chipCls(on, 'gap-1 px-0 text-[14px]')}`}>
                      {on && <Check size={12} weight="bold" className="shrink-0" aria-hidden />}
                      {y}
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <select
                  value=""
                  onChange={(e) => e.target.value && toggleYear(Number(e.target.value))}
                  aria-label={t('pastrace.olderYear')}
                  className={`${inputCls.replace('w-full', 'w-auto')} num min-w-40`}
                >
                  <option value="">{t('pastrace.olderYear')}</option>
                  {older.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <p className="num text-[15px] font-semibold text-ink" aria-live="polite">
                  {years.length ? t('pastrace.yearsSum', { n: years.length, count: years.length, y: years[0] }) : t('pastrace.yearsNone')}
                </p>
              </div>
            </div>
          )}
        </fieldset>
      )}

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">
          {t(many ? 'pastrace.bestDistance' : 'record.distance')}
          <span className="ml-2 font-normal text-ink-3">{t('common.optional')}</span>
        </legend>
        {race.distances.length ? (
          <div role="radiogroup" className="flex flex-wrap gap-2">
            {[...race.distances, ''].map((d) => {
              const on = dist === d;
              return (
                <button
                  key={d || '-'}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setDist(d)}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-ctl border px-3 text-[15px] transition active:translate-y-px sm:min-h-9 ${
                    on ? 'border-ink bg-sunken font-semibold text-ink' : 'border-line text-ink-2 hover:border-ink-3 hover:text-ink'
                  }`}
                >
                  {on && <Check size={14} weight="bold" aria-hidden />}
                  {d ? DIST_TEXT[lang](d) : t('record.distanceNone')}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-[15px] sm:text-[13px] text-ink-3">{t('pastrace.distanceNone')}</p>
        )}
      </fieldset>

      <Field label={t(many ? 'pastrace.bestTime' : 'record.time')} hint={t('common.optional')}>
        <Input
          inputMode="numeric"
          autoComplete="off"
          maxLength={9}
          placeholder={t('record.timeHint')}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="num"
        />
      </Field>

      {err && <Note tone="error">{err}</Note>}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button type="submit" disabled={busy} className="flex-1 sm:flex-none">
          {busy ? t('common.saving') : t('record.save')}
        </Button>
        {finished && (
          <Button type="button" tone="danger" disabled={busy} onClick={remove} onBlur={() => setSure(false)}>
            {sure ? t('pastrace.removeConfirm') : t('pastrace.remove')}
          </Button>
        )}
      </div>
    </form>
  );
}
