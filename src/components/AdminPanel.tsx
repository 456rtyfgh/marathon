import { useEffect, useState } from 'react';
import type { Race, ExternalKind, Region, Course, EntryType, Confidence } from '../lib/types';
import { REGIONS, COURSES, ENTRY_LABEL, CONFIDENCE_LABEL, KIND_LABEL } from '../lib/types';
import { adminUpsertRace, adminDeleteRace, adminAddExternalReview } from '../lib/data';

const EMPTY: Race = {
  id: '',
  name_ko: '',
  name_en: '',
  city_ko: '',
  country_ko: '',
  country_code: '',
  region: '아시아',
  race_date: '',
  date_confidence: 'expected',
  is_major: false,
  entry_type: 'fcfs',
  entry_opens: null,
  entry_closes: null,
  entry_confidence: 'expected',
  entry_fee: null,
  entry_fee_currency: 'KRW',
  distances: [],
  field_size: null,
  course: null,
  flight_hours: null,
  official_url: '',
  source_url: null,
  last_verified: new Date().toISOString().slice(0, 10),
  notes_ko: null,
};

export default function AdminPanel({ races, onClose, onSaved }: { races: Race[]; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<'race' | 'ext'>('race');

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-zinc-800 p-5">
          <div>
            <h2 className="text-xl font-bold text-zinc-50">관리자</h2>
            <p className="text-xs text-zinc-500">빈칸을 채워 대회와 외부 후기 링크를 등록합니다.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="flex gap-1 border-b border-zinc-800 px-3">
          {([['race', '대회 등록·수정'], ['ext', '외부 후기 링크']] as [typeof tab, string][]).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`border-b-2 px-3 py-3 text-sm font-medium transition ${
                tab === id ? 'border-emerald-500 text-zinc-50' : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'race' ? (
            <RaceForm races={races} onSaved={onSaved} />
          ) : (
            <ExtForm races={races} onSaved={onSaved} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── 대회 폼 ───────────────────────────────────────────── */

function RaceForm({ races, onSaved }: { races: Race[]; onSaved: () => void }) {
  const [editingId, setEditingId] = useState('');
  const [f, setF] = useState<Race>(EMPTY);
  const [distText, setDistText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const pick = (id: string) => {
    setEditingId(id);
    setMsg('');
    setErr('');
    if (!id) {
      setF(EMPTY);
      setDistText('');
      return;
    }
    const r = races.find((x) => x.id === id);
    if (r) {
      setF(r);
      setDistText(r.distances.join(', '));
    }
  };

  const set = <K extends keyof Race>(k: K, v: Race[K]) => setF((p) => ({ ...p, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!/^[a-z0-9-]{2,40}$/.test(f.id)) return setErr('대회 ID 는 영소문자·숫자·하이픈으로 2~40자여야 합니다. (예: tokyo, seoul-half)');
    if (!f.name_ko || !f.race_date || !f.official_url) return setErr('대회명(한글), 대회 날짜, 공식 홈페이지는 필수입니다.');
    setBusy(true);
    try {
      await adminUpsertRace({
        ...f,
        name_en: f.name_en || f.name_ko,
        distances: distText.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setMsg(editingId ? '수정했습니다.' : '등록했습니다.');
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editingId) return;
    setBusy(true);
    try {
      await adminDeleteRace(editingId);
      setMsg('삭제했습니다.');
      pick('');
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '삭제에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">기존 대회 불러오기</span>
        <select value={editingId} onChange={(e) => pick(e.target.value)} className={inputCls}>
          <option value="">+ 새 대회 등록</option>
          {races.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name_ko} ({r.id})
            </option>
          ))}
        </select>
      </label>

      <Group title="기본 정보">
        <Text label="대회 ID *" hint="영문 소문자·하이픈. 등록 후 바꾸지 마세요" value={f.id} onChange={(v) => set('id', v)} disabled={!!editingId} />
        <Text label="대회명 (한글) *" value={f.name_ko} onChange={(v) => set('name_ko', v)} />
        <Text label="대회명 (영문)" value={f.name_en} onChange={(v) => set('name_en', v)} />
        <Text label="도시" value={f.city_ko} onChange={(v) => set('city_ko', v)} placeholder="예: 도쿄" />
        <Text label="국가" value={f.country_ko} onChange={(v) => set('country_ko', v)} placeholder="예: 일본" />
        <Text label="국가 코드" hint="비용 계산 기준 (KR, JP, US…)" value={f.country_code} onChange={(v) => set('country_code', v.toUpperCase())} />
        <Select label="지역" value={f.region} onChange={(v) => set('region', v as Region)} options={REGIONS.map((r) => [r, r])} />
        <Check label="세계 메이저 대회" checked={f.is_major} onChange={(v) => set('is_major', v)} />
      </Group>

      <Group title="일정">
        <Text label="대회 날짜 *" type="date" value={f.race_date} onChange={(v) => set('race_date', v)} />
        <Select
          label="날짜 확실성"
          value={f.date_confidence}
          onChange={(v) => set('date_confidence', v as Confidence)}
          options={(['confirmed', 'expected', 'tbc'] as Confidence[]).map((c) => [c, CONFIDENCE_LABEL[c]])}
        />
        <Text label="신청 시작" type="date" value={f.entry_opens ?? ''} onChange={(v) => set('entry_opens', v || null)} />
        <Text label="신청 마감" type="date" hint="비우면 '정원 소진 시'" value={f.entry_closes ?? ''} onChange={(v) => set('entry_closes', v || null)} />
        <Select
          label="신청 방식"
          value={f.entry_type}
          onChange={(v) => set('entry_type', v as EntryType)}
          options={(Object.keys(ENTRY_LABEL) as EntryType[]).map((k) => [k, ENTRY_LABEL[k]])}
        />
        <Select
          label="일정 확실성"
          value={f.entry_confidence}
          onChange={(v) => set('entry_confidence', v as Confidence)}
          options={(['confirmed', 'expected', 'tbc'] as Confidence[]).map((c) => [c, CONFIDENCE_LABEL[c]])}
        />
      </Group>

      <Group title="상세">
        <Text label="참가비" type="number" value={f.entry_fee?.toString() ?? ''} onChange={(v) => set('entry_fee', v ? Number(v) : null)} />
        <Text label="통화" hint="KRW, JPY, USD, EUR…" value={f.entry_fee_currency} onChange={(v) => set('entry_fee_currency', v.toUpperCase())} />
        <Text label="종목" hint="쉼표로 구분: 풀, 하프, 10km" value={distText} onChange={setDistText} />
        <Text label="참가 규모 (명)" type="number" value={f.field_size?.toString() ?? ''} onChange={(v) => set('field_size', v ? Number(v) : null)} />
        <Select label="코스" value={f.course ?? ''} onChange={(v) => set('course', (v || null) as Course | null)} options={[['', '선택 안 함'], ...COURSES.map((c) => [c, c] as [string, string])]} />
        <Text label="이동 시간 (시간)" type="number" hint="인천/서울 출발 기준" value={f.flight_hours?.toString() ?? ''} onChange={(v) => set('flight_hours', v ? Number(v) : null)} />
      </Group>

      <Group title="출처">
        <Text label="공식 홈페이지 *" value={f.official_url} onChange={(v) => set('official_url', v)} placeholder="https://" wide />
        <Text label="정보 출처 링크" value={f.source_url ?? ''} onChange={(v) => set('source_url', v || null)} placeholder="https://" wide />
        <Text label="확인 날짜" type="date" value={f.last_verified} onChange={(v) => set('last_verified', v)} />
      </Group>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">메모 (카드 상세에 표시)</span>
        <textarea
          value={f.notes_ko ?? ''}
          onChange={(e) => set('notes_ko', e.target.value || null)}
          rows={3}
          className={inputCls + ' resize-y leading-relaxed'}
        />
      </label>

      {err && <p className="text-sm text-rose-400">{err}</p>}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-40">
          {busy ? '저장 중…' : editingId ? '수정 저장' : '대회 등록'}
        </button>
        {editingId && (
          <button type="button" onClick={remove} disabled={busy} className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-rose-400 transition hover:bg-zinc-700">
            삭제
          </button>
        )}
      </div>
    </form>
  );
}

/* ── 외부 후기 링크 폼 ─────────────────────────────────── */

function ExtForm({ races, onSaved }: { races: Race[]; onSaved: () => void }) {
  const [raceId, setRaceId] = useState('');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [url, setUrl] = useState('');
  const [author, setAuthor] = useState('');
  const [published, setPublished] = useState('');
  const [kind, setKind] = useState<ExternalKind>('blog');
  const [summary, setSummary] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!raceId || !title || !url) return setErr('대회, 제목, 링크는 필수입니다.');
    if (!/^https?:\/\//.test(url)) return setErr('링크는 http:// 또는 https:// 로 시작해야 합니다.');
    setBusy(true);
    try {
      await adminAddExternalReview({
        race_id: raceId,
        title: title.trim(),
        source: source.trim() || new URL(url).hostname.replace(/^www\./, ''),
        url: url.trim(),
        author: author.trim() || null,
        published_at: published || null,
        kind,
        summary: summary.trim() || null,
      });
      setMsg('등록했습니다.');
      setTitle('');
      setUrl('');
      setAuthor('');
      setSummary('');
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-xs leading-relaxed text-zinc-500">
        다른 사이트 후기는 <strong className="text-zinc-300">본문을 옮기지 않고 링크만</strong> 겁니다. 요약란에는
        직접 쓴 한 줄 메모만 넣어주세요 (원문 복사 금지).
      </p>

      <Group title="후기 정보">
        <Select label="대회 *" value={raceId} onChange={setRaceId} options={[['', '선택하세요'], ...races.map((r) => [r.id, r.name_ko] as [string, string])]} />
        <Select label="종류" value={kind} onChange={(v) => setKind(v as ExternalKind)} options={(Object.keys(KIND_LABEL) as ExternalKind[]).map((k) => [k, KIND_LABEL[k]])} />
        <Text label="제목 *" value={title} onChange={setTitle} wide placeholder="글 제목을 그대로" />
        <Text label="링크 *" value={url} onChange={setUrl} wide placeholder="https://" />
        <Text label="출처" hint="비우면 도메인 자동" value={source} onChange={setSource} placeholder="네이버 블로그" />
        <Text label="작성자" value={author} onChange={setAuthor} />
        <Text label="작성일" type="date" value={published} onChange={setPublished} />
        <Text label="한 줄 메모" value={summary} onChange={setSummary} wide placeholder="직접 쓴 짧은 설명" />
      </Group>

      {err && <p className="text-sm text-rose-400">{err}</p>}
      {msg && <p className="text-sm text-emerald-400">{msg}</p>}

      <button type="submit" disabled={busy} className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-40">
        {busy ? '저장 중…' : '링크 등록'}
      </button>
    </form>
  );
}

/* ── 폼 유틸 ───────────────────────────────────────────── */

const inputCls =
  'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500 disabled:opacity-50';

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-zinc-800 p-4">
      <legend className="px-2 text-xs font-semibold text-zinc-400">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Text({
  label, value, onChange, type = 'text', hint, placeholder, disabled, wide,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; hint?: string; placeholder?: string; disabled?: boolean; wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-zinc-400">
        {label}
        {hint && <span className="ml-1.5 font-normal text-zinc-600">{hint}</span>}
      </span>
      <input type={type} value={value} disabled={disabled} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options: [string, string][];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm text-zinc-300">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-emerald-400" />
      {label}
    </label>
  );
}
