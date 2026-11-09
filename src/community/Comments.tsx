/** 댓글·대댓글(1단계) 목록과 쓰기·고치기·지우기·신고. 잠긴 글(비회원·미인증)에는 그리지 않는다 — 서버도 댓글을 주지 않는다 */
import { useState, type FormEvent } from 'react';
import { ArrowBendDownRight } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import { friendlyError } from '../lib/spam';
import { LIMITS, type CommentItem, type Viewer } from '../lib/communityTypes';
import { Button, Note, inputCls } from '../components/ui';
import { addComment, canWrite, deleteComment, editComment, useViewer } from './api';
import { GateNote } from './MembersGate';
import ReportDialog from './ReportDialog';
import { communityTextReason } from './rules';
import { fmtWhen, useS } from './strings';

interface Ctx {
  postId: string;
  viewer: Viewer;
  ban: string | null;
  onLogin: () => void;
  onChanged: () => void;
  /** 글이 정상(visible)일 때만 새 댓글·답글 */
  open: boolean;
}

export default function Comments({ comments, ...ctx }: Ctx & { comments: CommentItem[] }) {
  const s = useS();
  const top = comments.filter((c) => !c.parent_id);
  const replies = (id: string) => comments.filter((c) => c.parent_id === id);
  const count = comments.filter((c) => c.state === 'visible').length;
  const writable = canWrite(ctx.viewer, ctx.ban);
  return (
    <section aria-labelledby="comments-title" className="space-y-4">
      <h3 id="comments-title" className="text-[17px] font-bold">
        {s.cTitle} <span className="num font-semibold text-ink-3">{count}</span>
      </h3>
      {top.length === 0 ? (
        // 댓글을 달 수 없는 글(임시조치·숨김)에는 '첫 댓글을 남겨 보세요' 를 보이지 않는다
        ctx.open && <p className="text-[15px] text-ink-3">{s.cNone}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {top.map((c) => (
            <li key={c.id} className="py-4">
              <Row c={c} ctx={ctx} canReply />
              {replies(c.id).length > 0 && (
                <ul className="mt-3 space-y-3 border-l-2 border-line pl-3 sm:pl-4">
                  {replies(c.id).map((r) => (
                    <li key={r.id}>
                      <Row c={r} ctx={ctx} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {ctx.open && (writable ? <CommentForm ctx={ctx} parentId={null} /> : <GateNote viewer={ctx.viewer} ban={ctx.ban} onLogin={ctx.onLogin} />)}
    </section>
  );
}

function Row({ c, ctx, canReply = false }: { c: CommentItem; ctx: Ctx; canReply?: boolean }) {
  const s = useS();
  const { lang } = useLang();
  const [mode, setMode] = useState<null | 'reply' | 'edit' | 'report' | 'gate'>(null);
  const [err, setErr] = useState('');
  const writable = canWrite(ctx.viewer, ctx.ban);
  const toggle = (m: 'reply' | 'edit' | 'report') => setMode((x) => (x === m || x === 'gate' ? null : writable || m === 'edit' ? m : 'gate'));

  if (c.state !== 'visible')
    return <p className="text-[15px] text-ink-3">{c.state === 'deleted' ? s.commentGone : s.commentHidden}</p>;

  const link = 'inline-flex min-h-11 items-center text-[13px] font-semibold text-ink-3 underline-offset-4 hover:text-ink hover:underline sm:min-h-8';
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        {!canReply && <ArrowBendDownRight size={13} className="self-center text-ink-3" aria-hidden />}
        <span className="text-[15px] font-bold">{c.nickname}</span>
        <span className="num text-[13px] text-ink-3">{fmtWhen(c.created_at, lang)}</span>
        {c.edited && <span className="text-[13px] text-ink-3">{s.edited}</span>}
      </div>
      {mode === 'edit' ? (
        <CommentForm ctx={ctx} parentId={c.parent_id} edit={c} onDone={() => setMode(null)} />
      ) : (
        <p className="mt-1 max-w-[62ch] text-[15px] leading-relaxed whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">{c.body}</p>
      )}
      <div className="-mb-2 flex flex-wrap gap-x-4">
        {canReply && ctx.open && (
          <button type="button" className={link} aria-expanded={mode === 'reply'} onClick={() => toggle('reply')}>
            {s.cReply}
          </button>
        )}
        {c.mine && mode !== 'edit' && (
          <>
            <button type="button" className={link} onClick={() => toggle('edit')}>
              {s.edit}
            </button>
            <button
              type="button"
              className={link}
              onClick={async () => {
                if (!confirm(s.confirmDelComment)) return;
                setErr('');
                try {
                  await deleteComment(c.id);
                  ctx.onChanged();
                } catch (e) {
                  setErr(friendlyError(e, s.saveFail, lang));
                }
              }}
            >
              {s.del}
            </button>
          </>
        )}
        {!c.mine && (
          <button type="button" className={link} aria-expanded={mode === 'report'} onClick={() => toggle('report')}>
            {s.report}
          </button>
        )}
      </div>
      {err && <div className="mt-2"><Note tone="error">{err}</Note></div>}
      {mode === 'gate' && (
        <div className="mt-2">
          <GateNote viewer={ctx.viewer} ban={ctx.ban} onLogin={ctx.onLogin} />
        </div>
      )}
      {mode === 'reply' && (
        <div className="mt-2">
          <CommentForm ctx={ctx} parentId={c.id} onDone={() => setMode(null)} />
        </div>
      )}
      {mode === 'report' && (
        <div className="mt-2">
          <ReportDialog target={{ type: 'comment', id: c.id }} onClose={() => setMode(null)} />
        </div>
      )}
    </div>
  );
}

function CommentForm({ ctx, parentId, edit, onDone }: { ctx: Ctx; parentId: string | null; edit?: CommentItem; onDone?: () => void }) {
  const s = useS();
  const { lang } = useLang();
  const { uid } = useViewer();
  const [body, setBody] = useState(edit?.body ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const b = body.trim();
    if (b.length < 1 || b.length > LIMITS.commentMax) return setErr(s.cLen);
    const why = communityTextReason(b, lang);
    if (why) return setErr(why);
    if (!uid) return;
    setBusy(true);
    setErr('');
    try {
      if (edit) await editComment(edit.id, b);
      else await addComment(uid, ctx.postId, parentId, b);
      setBody('');
      onDone?.();
      ctx.onChanged();
    } catch (e2) {
      setErr(friendlyError(e2, s.saveFail, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-2 space-y-2">
      <label className="block">
        <span className="sr-only">{parentId ? s.cReplyPh : s.cPh}</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={parentId || edit ? 2 : 3}
          maxLength={LIMITS.commentMax}
          placeholder={parentId ? s.cReplyPh : s.cPh}
          className={`${inputCls} resize-y py-3 leading-relaxed`}
        />
      </label>
      {err && <Note tone="error">{err}</Note>}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={busy || !body.trim()}>
          {busy ? s.saving : edit ? s.saveEdit : parentId ? s.cReplyPost : s.cPost}
        </Button>
        {onDone && (
          <Button type="button" tone="quiet" size="sm" onClick={onDone}>
            {s.cancel}
          </Button>
        )}
        <span className="num ml-auto text-[13px] text-ink-3">
          {body.length}/{LIMITS.commentMax}
        </span>
      </div>
    </form>
  );
}
