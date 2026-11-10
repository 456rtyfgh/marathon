/** 글·댓글 신고: 사유 5종 + 설명 ≤300자. 권리 침해는 임시조치 절차 한 줄. 누른 자리 바로 아래 펼쳐진다 */
import { useState } from 'react';
import { useLang } from '../i18n';
import { friendlyError } from '../lib/spam';
import { LIMITS, REPORT_REASONS, type ReportReason } from '../lib/communityTypes';
import { Button, Note, inputCls } from '../components/ui';
import { sendReport, useViewer } from './api';
import { useS } from './strings';

export default function ReportDialog({ target, onClose }: { target: { type: 'post' | 'comment'; id: string }; onClose: () => void }) {
  const s = useS();
  const { lang } = useLang();
  const { uid } = useViewer();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  if (done)
    return (
      <div className="space-y-3">
        <Note tone="ok">{s.rDone}</Note>
        <Button tone="quiet" size="sm" onClick={onClose}>
          {s.close}
        </Button>
      </div>
    );

  return (
    <form
      className="space-y-4 rounded-box border border-line bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!reason) return setErr(s.rNeedReason);
        if (!uid) return;
        setBusy(true);
        setErr('');
        try {
          await sendReport(uid, target, reason, note.trim());
          setDone(true);
        } catch (e2) {
          const dup = (e2 as { code?: string } | null)?.code === '23505'; // 같은 대상을 또 신고
          setErr(dup ? s.rDup : friendlyError(e2, s.saveFail, lang));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset>
        <legend className="mb-2 text-[15px] font-bold">{s.rTitle}</legend>
        <div className="flex flex-col">
          {REPORT_REASONS.map((r) => (
            <label key={r} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px] sm:min-h-9">
              <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-[var(--ink)]" />
              {s.rReason[r]}
            </label>
          ))}
        </div>
      </fieldset>
      {reason === 'rights' && <p className="text-[15px] sm:text-[13px] leading-relaxed text-ink-2">{s.rRights}</p>}
      <label className="flex flex-col gap-2">
        <span className="text-[13px] font-semibold text-ink-2">
          {s.rNote} <span className="font-normal text-ink-3">{`${note.length}/${LIMITS.noteMax}`}</span>
        </span>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          maxLength={LIMITS.noteMax}
          placeholder={s.rNotePh}
          className={`${inputCls} resize-y py-3 leading-relaxed`}
        />
      </label>
      {err && <Note tone="error">{err}</Note>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? s.saving : s.rSend}
        </Button>
        <Button type="button" tone="quiet" size="sm" onClick={onClose}>
          {s.cancel}
        </Button>
      </div>
    </form>
  );
}
