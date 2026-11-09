/** 글쓰기·고치기: 카테고리, 대회 연결(선택), 제목 2~60자, 내용 ≤3000자. 광고·링크 규칙은 rules.ts 로 미리 검사 */
import { useState, type FormEvent } from 'react';
import type { Race } from '../lib/types';
import { useLang } from '../i18n';
import { friendlyError } from '../lib/spam';
import { track } from '../lib/analytics';
import { CATEGORIES, LIMITS, type Category } from '../lib/communityTypes';
import { Button, Field, Input, Note, inputCls } from '../components/ui';
import { createPost, updatePost, useViewer, type PostInput } from './api';
import { communityTextReason } from './rules';
import RacePicker from './RacePicker';
import { useS } from './strings';

export default function PostForm({
  races,
  fixedRace,
  initial,
  onDone,
  onCancel,
}: {
  races: Race[];
  /** 대회 '이야기' 탭: 그 대회로 고정하고 고르기 칸을 숨긴다 */
  fixedRace?: string;
  /** 고치기: 원래 값 + id */
  initial?: PostInput & { id: string };
  onDone: (id: string, input: PostInput) => void;
  onCancel: () => void;
}) {
  const s = useS();
  const { lang } = useLang();
  const { uid, nickname } = useViewer();
  const [category, setCategory] = useState<Category | null>(initial?.category ?? null);
  const [raceId, setRaceId] = useState<string | null>(fixedRace ?? initial?.race_id ?? null);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const t = title.trim();
    const b = body.trim();
    if (!category) return setErr(s.needCat);
    if (t.length < LIMITS.titleMin || t.length > LIMITS.titleMax) return setErr(s.titleLen);
    if (b.length < 1 || b.length > LIMITS.bodyMax) return setErr(s.bodyLen);
    const why = communityTextReason(`${t}\n${b}`, lang);
    if (why) return setErr(why);
    if (!uid) return;
    setBusy(true);
    setErr('');
    const input: PostInput = { race_id: raceId, category, title: t, body: b };
    try {
      if (initial) {
        await updatePost(initial.id, input);
        onDone(initial.id, input);
      } else {
        const id = await createPost(uid, input);
        track('community_post', { category, race_id: raceId ?? '' });
        onDone(id, input);
      }
    } catch (e2) {
      setErr(friendlyError(e2, s.saveFail, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-box bg-surface p-4 sm:p-5">
      <h3 className="text-[17px] font-bold">{initial ? s.formEdit : s.formNew}</h3>
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">{s.fCat}</legend>
        <div role="radiogroup" aria-label={s.fCat} className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <CatChip key={c} on={category === c} role="radio" onClick={() => setCategory(c)}>
              {s.cat[c]}
            </CatChip>
          ))}
        </div>
      </fieldset>

      {!fixedRace && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-2">
            {s.race} <span className="font-normal text-ink-3">{s.raceOptional}</span>
          </span>
          <RacePicker races={races} value={raceId} onChange={setRaceId} />
        </div>
      )}

      <Field label={s.fTitle} hint={`${title.trim().length}/${LIMITS.titleMax}`}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.titleMax} placeholder={s.fTitlePh} required />
      </Field>

      <Field label={s.fBody} hint={`${body.length}/${LIMITS.bodyMax}`}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={LIMITS.bodyMax}
          placeholder={s.fBodyPh}
          className={`${inputCls} resize-y py-3 leading-relaxed`}
          required
        />
      </Field>

      {err && <Note tone="error">{err}</Note>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? s.saving : initial ? s.saveEdit : s.post}
        </Button>
        <Button type="button" tone="quiet" onClick={onCancel}>
          {s.cancel}
        </Button>
        {nickname && !initial && <span className="text-[13px] text-ink-3">{s.postedAs(nickname)}</span>}
      </div>
    </form>
  );
}

/** 카테고리 칩. 고른 것은 검정 꽉 채우기 대신 진한 테두리·굵은 글자 */
export function CatChip({
  on,
  onClick,
  children,
  role,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  role?: 'radio';
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role ? on : undefined}
      aria-pressed={role ? undefined : on}
      onClick={onClick}
      className={`inline-flex h-11 shrink-0 items-center rounded-ctl border px-3 text-[15px] whitespace-nowrap transition-colors active:translate-y-px sm:h-9 ${
        on ? 'border-ink bg-surface font-bold text-ink shadow-[inset_0_0_0_1px_var(--ink)]' : 'border-line bg-surface font-semibold text-ink-2 hover:border-ink-3 hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
