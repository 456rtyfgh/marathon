import { useEffect, useId, useState } from 'react';
import type { Race } from '../lib/types';
import type { Lang } from '../i18n/lang';
import { RACE_FIELDS, diffRace, toPatch, validateRace, type RaceFieldMeta, type RaceKey, type FieldChange } from '../lib/raceDiff';
import { adminLoadRace, adminUpdateRace, adminErrorText } from '../lib/adminRace';
import { Button, Note, inputCls } from './ui';

/** 대회 상세 탭 줄의 '수정' 라벨 (관리자에게만 보인다). PLAN 공통 인터페이스라 이 파일에서 내보낸다 */
// oxlint-disable-next-line react/only-export-components
export const EDIT_TAB_LABEL: Record<Lang, string> = { ko: '수정', en: 'Edit' };

const GROUP_TITLE: Record<RaceFieldMeta['group'], string> = {
  기본: '기본 정보',
  일정: '대회 날짜',
  접수: '접수',
  참가: '참가비·거리·정원',
  코스: '코스',
  출처: '출처',
  메모: '메모',
};
const GROUPS = Object.keys(GROUP_TITLE) as RaceFieldMeta['group'][];
const WIDE = new Set<RaceKey>(['official_url', 'source_url', 'distances', 'notes_ko', 'notes_en']);

type Form = Record<RaceKey, unknown>;

/** DB 값 → 입력칸 값 (숫자는 글자, 거리는 'a, b') */
function toForm(r: Race): Form {
  const f = {} as Form;
  for (const m of RACE_FIELDS) {
    const v = r[m.key];
    if (m.kind === 'check') f[m.key] = v === true;
    else if (m.kind === 'list') f[m.key] = Array.isArray(v) ? v.join(', ') : '';
    else f[m.key] = v == null ? '' : String(v);
  }
  return f;
}

/**
 * 관리자 대회 수정기. 처음 값은 DB 전체 칸(adminLoadRace) — 목록·스냅샷 값으로 채우지 않는다.
 * '바뀐 칸 확인' → 바뀐 칸 미리보기 → '확인하고 저장' 하면 바뀐 칸만 저장(adminUpdateRace)하고, DB 에서 다시 읽은 값으로
 * 폼을 맞춘 뒤 onSaved(race) 로 화면에 바로 반영시킨다.
 */
export default function RaceEditor({ raceId, onSaved }: { raceId: string; onSaved?: (r: Race) => void }) {
  const uid = useId();
  const [before, setBefore] = useState<Race | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [errors, setErrors] = useState<Partial<Record<RaceKey | 'form', string>>>({});
  const [preview, setPreview] = useState<FieldChange[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [saveErr, setSaveErr] = useState('');

  useEffect(() => {
    let alive = true;
    adminLoadRace(raceId).then(
      (r) => {
        if (!alive) return;
        setBefore(r);
        setForm(toForm(r));
      },
      (e) => alive && setLoadErr(adminErrorText(e)),
    );
    return () => {
      alive = false;
    };
  }, [raceId]);

  if (loadErr) return <Note tone="error">대회 정보를 DB 에서 받지 못해 고칠 수 없습니다. {loadErr}</Note>;
  if (!before || !form) return <p className="text-[15px] text-ink-3" role="status">DB 에서 대회 정보를 받는 중</p>;

  const merged = { ...before, ...form } as unknown as Race;
  const changes = diffRace(before, merged);

  const set = (k: RaceKey, v: unknown) => {
    setForm((p) => (p ? { ...p, [k]: v } : p));
    setPreview(null);
    setMsg('');
    setSaveErr('');
    if (errors[k]) setErrors((p) => ({ ...p, [k]: undefined, form: undefined }));
  };

  const check = () => {
    setMsg('');
    setSaveErr('');
    const err = validateRace(merged);
    setErrors(err);
    if (Object.keys(err).length) return;
    setPreview(changes);
  };

  async function save() {
    if (!before) return;
    setBusy(true);
    setSaveErr('');
    try {
      const saved = await adminUpdateRace(raceId, toPatch(before, merged));
      setBefore(saved);
      setForm(toForm(saved));
      setPreview(null);
      setMsg('저장했습니다. 이 화면과 관리자 화면에는 바로 보이고, 방문자 화면에는 다음 배포(매일 새벽) 뒤 보입니다.');
      onSaved?.(saved);
    } catch (e) {
      setSaveErr(adminErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  const field = (m: RaceFieldMeta) => {
    const id = `${uid}-${m.key}`;
    const err = errors[m.key];
    const v = form[m.key];
    const common = {
      id,
      'aria-invalid': err ? true : undefined,
      'aria-describedby': err ? `${id}-err` : undefined,
    } as const;
    if (m.kind === 'check') {
      // 다른 칸처럼 위 줄은 설명, 아래 줄(입력칸 높이)은 체크칸
      return (
        <div key={m.key} className="flex min-w-0 flex-col gap-1.5">
          {m.hint && <span className="text-[13px] text-ink-3">{m.hint}</span>}
          <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-[15px] font-semibold text-ink sm:min-h-10">
            <input id={id} type="checkbox" checked={v === true} onChange={(e) => set(m.key, e.target.checked)} className="size-4 accent-current" />
            {m.label}
          </label>
        </div>
      );
    }
    const box = err ? ' border-ink' : '';
    let input;
    if (m.kind === 'select') {
      input = (
        <select {...common} value={String(v ?? '')} onChange={(e) => set(m.key, e.target.value)} className={inputCls + box}>
          {m.options?.map(([val, label]) => (
            <option key={val} value={val}>
              {label}
            </option>
          ))}
        </select>
      );
    } else if (m.kind === 'textarea') {
      input = (
        <textarea
          {...common}
          value={String(v ?? '')}
          onChange={(e) => set(m.key, e.target.value)}
          rows={4}
          className={inputCls + box + ' h-auto resize-y py-2.5 leading-relaxed'}
        />
      );
    } else {
      input = (
        <input
          {...common}
          type={m.kind === 'date' ? 'date' : 'text'}
          inputMode={m.kind === 'number' ? 'decimal' : m.key.endsWith('_url') ? 'url' : undefined}
          value={String(v ?? '')}
          onChange={(e) => set(m.key, e.target.value)}
          autoComplete="off"
          spellCheck={m.kind === 'text' && !/_url$|_code$|currency|subregion/.test(m.key) ? undefined : false}
          className={inputCls + box}
        />
      );
    }
    return (
      <div key={m.key} className={`flex min-w-0 flex-col gap-1.5 ${WIDE.has(m.key) ? 'sm:col-span-2' : ''}`}>
        <label htmlFor={id} className="text-[13px] font-semibold text-ink-2">
          {m.label}
          {m.required && <span className="text-ink-3"> *</span>}
          {m.hint && <span className="ml-1.5 font-normal text-ink-3">{m.hint}</span>}
        </label>
        {input}
        {err && (
          <span id={`${id}-err`} className="text-[13px] font-semibold text-ink">
            {err}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <p className="text-[14px] leading-relaxed text-ink-3">
        <span className="font-mono text-ink-2">{before.id}</span> · DB 에서 지금 값을 받아 왔습니다. 고친 칸만 저장합니다.
      </p>

      {GROUPS.map((g) => (
        <fieldset key={g} className="min-w-0 rounded-box bg-surface p-4">
          <legend className="float-left mb-3 w-full text-[15px] font-bold">{GROUP_TITLE[g]}</legend>
          <div className="clear-both grid gap-3 sm:grid-cols-2">{RACE_FIELDS.filter((m) => m.group === g).map(field)}</div>
        </fieldset>
      ))}

      {preview && (
        <section aria-labelledby={`${uid}-pv`} className="rounded-box border border-line bg-surface p-4">
          <h3 id={`${uid}-pv`} className="text-[15px] font-bold">
            저장할 칸 <span className="num">{preview.length}</span>개
          </h3>
          <ul className="mt-3 divide-y divide-line">
            {preview.map((c) => (
              <li key={c.key} className="grid gap-1 py-2.5 text-[14px] sm:grid-cols-[9rem_1fr]">
                <span className="font-semibold text-ink-2">{c.label}</span>
                <span className="min-w-0 break-words">
                  <span className="text-ink-3 line-through decoration-ink-3/60">{c.before}</span>
                  <span className="mx-1.5 text-ink-3" aria-label="에서">→</span>
                  <span className="font-semibold text-ink">{c.after}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {errors.form && <Note tone="error">{errors.form} 표시된 칸을 고친 뒤 다시 확인해 주세요.</Note>}
      {saveErr && <Note tone="error">{saveErr}</Note>}
      {msg && <Note tone="ok">{msg}</Note>}

      {/* 저장 줄: 긴 폼 아래로 스크롤하지 않아도 누를 수 있게 붙여 둔다 */}
      <div className="sticky bottom-0 z-10 -mx-5 flex flex-wrap items-center gap-2 border-t border-line bg-bg px-5 py-3 sm:-mx-7 sm:px-7">
        <span className="mr-auto text-[14px] text-ink-2" aria-live="polite">
          {changes.length ? (
            <>
              바뀐 칸 <strong className="num text-ink">{changes.length}</strong>개
            </>
          ) : (
            '바뀐 칸 없음'
          )}
        </span>
        {preview ? (
          <>
            <Button type="button" tone="quiet" onClick={() => setPreview(null)} disabled={busy}>
              더 고치기
            </Button>
            <Button type="button" onClick={save} disabled={busy || preview.length === 0}>
              {busy ? '저장 중…' : '확인하고 저장'}
            </Button>
          </>
        ) : (
          <Button type="button" onClick={check} disabled={busy || changes.length === 0}>
            바뀐 칸 확인
          </Button>
        )}
      </div>
    </div>
  );
}
