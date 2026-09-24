import { useState } from 'react';
import { CloseButton, Tabs, Button, Note, inputCls } from './ui';
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

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-4 sm:px-7">
        <div className="pt-1.5">
          <h2 className="text-[26px] leading-tight font-extrabold tracking-tight">관리</h2>
          <p className="mt-1 text-[15px] text-ink-2">빈칸을 채우면 바로 사이트에 반영됩니다.</p>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      <Tabs<'race' | 'ext'>
        value={tab}
        onChange={setTab}
        items={[
          ['race', '대회 추가·수정'],
          ['ext', '다른 곳 후기 링크'],
        ]}
      />

      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
        {tab === 'race' ? <RaceForm races={races} onSaved={onSaved} /> : <ExtForm races={races} onSaved={onSaved} />}
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
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">고칠 대회 고르기</span>
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
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">메모 <span className="font-normal text-ink-3">상세 정보에 보입니다</span></span>
        <textarea
          value={f.notes_ko ?? ''}
          onChange={(e) => set('notes_ko', e.target.value || null)}
          rows={3}
          className={inputCls + ' h-auto resize-y py-2.5 leading-relaxed'}
        />
      </label>

      {err && <Note tone="error">{err}</Note>}
      {msg && <Note tone="ok">{msg}</Note>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? '저장 중…' : editingId ? '수정 저장' : '대회 등록'}
        </Button>
        {editingId && (
          <Button type="button" tone="danger" onClick={remove} disabled={busy}>
            이 대회 지우기
          </Button>
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
      <p className="rounded-ctl bg-sunken px-3 py-2.5 text-[14px] leading-relaxed text-ink-2">
        다른 사이트 후기는 <strong className="text-ink">본문을 옮기지 않고 링크만</strong> 겁니다. 요약란에는
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

      {err && <Note tone="error">{err}</Note>}
      {msg && <Note tone="ok">{msg}</Note>}

      <Button type="submit" disabled={busy}>
        {busy ? '저장 중…' : '링크 등록'}
      </Button>
    </form>
  );
}

/* ── 폼 유틸 ───────────────────────────────────────────── */


function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-box bg-surface p-4">
      <legend className="float-left mb-3 w-full text-[15px] font-bold">{title}</legend>
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
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">
        {label}
        {hint && <span className="ml-1.5 font-normal text-ink-3">{hint}</span>}
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
      <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">{label}</span>
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
    <label className="flex cursor-pointer items-center gap-2 self-end pb-2.5 text-[14px] text-ink">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4" />
      {label}
    </label>
  );
}
