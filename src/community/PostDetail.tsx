/**
 * 글 상세: 제목·메타, 본문 자리(MEMBERS_ONLY_CLASS — 프리렌더 구조화 데이터의 회원 전용 영역과 같은 클래스), 좋아요·신고·수정·삭제, 댓글.
 * 본문·댓글은 서버가 locked=false 일 때만 준다. 화면의 보는 사람 상태와 다르면 서버를 따른다.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Heart } from '@phosphor-icons/react';
import type { Race } from '../lib/types';
import { useLang } from '../i18n';
import { raceName } from '../i18n/names';
import { friendlyError } from '../lib/spam';
import { MEMBERS_ONLY_CLASS, type PostDetail as Detail, type PostListItem } from '../lib/communityTypes';
import { Note } from '../components/ui';
import { canWrite, deletePost, getPost, setLike, useMyBan, useViewer } from './api';
import Comments from './Comments';
import { GateNote, LockedNotice } from './MembersGate';
import PostForm from './PostForm';
import ReportDialog from './ReportDialog';
import { fmtWhen, useS } from './strings';

export default function PostDetail({
  id,
  races,
  onBack,
  onLogin,
  onSync,
  hideRace = false,
}: {
  id: string;
  races: Race[];
  onBack: () => void;
  onLogin: () => void;
  /** 바뀐 값(댓글 수·좋아요·삭제)을 목록 줄에도 */
  onSync?: (id: string, patch: Partial<PostListItem>) => void;
  /** 대회 '이야기' 탭 안: 대회 이름을 다시 쓰지 않는다 */
  hideRace?: boolean;
}) {
  const s = useS();
  const { lang } = useLang();
  const { viewer, uid } = useViewer();
  const ban = useMyBan(uid);
  const [d, setD] = useState<Detail | null | 'missing' | 'error'>(null);
  const [mode, setMode] = useState<null | 'edit' | 'report' | 'gate'>(null);
  const [err, setErr] = useState('');
  const [likeBusy, setLikeBusy] = useState(false);

  // onSync 는 목록 쪽 setState 라 바뀌어도 다시 읽을 필요가 없다 → ref 로
  const sync = useRef(onSync);
  useEffect(() => {
    sync.current = onSync;
  });
  const load = useCallback(() => {
    getPost(id).then(
      (x) => {
        setD(x ?? 'missing');
        if (x) sync.current?.(id, { comment_count: x.post.comment_count, like_count: x.post.like_count, state: x.post.state, title: x.post.title });
      },
      () => setD('error'),
    );
  }, [id]);
  // 로그인·인증 상태가 바뀌면 서버가 주는 내용(잠김)이 달라지므로 다시 읽는다
  useEffect(load, [load, viewer]);

  const back = (
    <button
      type="button"
      onClick={onBack}
      className="-ml-2 inline-flex min-h-11 items-center gap-2 rounded-ctl px-2 text-[15px] font-semibold text-ink-2 hover:bg-sunken hover:text-ink sm:min-h-9"
    >
      <ArrowLeft size={16} weight="bold" aria-hidden />
      {s.back}
    </button>
  );

  if (d === null)
    return (
      <div className="space-y-4" aria-busy="true">
        {back}
        <div className="h-8 w-3/4 animate-pulse rounded-ctl bg-surface" />
        <div className="h-40 animate-pulse rounded-box bg-surface" />
      </div>
    );
  if (d === 'missing' || d === 'error')
    return (
      <div className="space-y-4">
        {back}
        <Note tone={d === 'error' ? 'error' : 'info'}>{d === 'error' ? s.loadFail : s.notFound}</Note>
      </div>
    );

  const p = d.post;
  const race = p.race_id ? races.find((r) => r.id === p.race_id) : null;
  const gone = p.state === 'deleted' || p.state === 'temp_hidden';
  const writable = canWrite(viewer, ban);
  // 서버가 잠갔는데 화면은 회원으로 보면(인증 직후 세션 갱신 전 등) 서버를 따라 인증 안내를 보인다
  const lockViewer = viewer === 'guest' ? 'guest' : 'unverified';

  if (mode === 'edit' && p.title != null && p.body != null)
    return (
      <div className="space-y-4">
        {back}
        <PostForm
          races={races}
          fixedRace={hideRace && p.race_id ? p.race_id : undefined}
          initial={{ id: p.id, race_id: p.race_id, category: p.category, title: p.title, body: p.body }}
          onDone={() => {
            setMode(null);
            load();
          }}
          onCancel={() => setMode(null)}
        />
      </div>
    );

  const toggleLike = async () => {
    if (!writable || !uid) return setMode((m) => (m === 'gate' ? null : 'gate'));
    const on = !p.liked;
    const next = { ...d, post: { ...p, liked: on, like_count: p.like_count + (on ? 1 : -1) } };
    setD(next);
    setLikeBusy(true);
    try {
      await setLike(uid, p.id, on);
      onSync?.(p.id, { like_count: next.post.like_count });
    } catch (e) {
      setD(d);
      setErr(friendlyError(e, s.saveFail, lang));
    } finally {
      setLikeBusy(false);
    }
  };

  const action = 'inline-flex min-h-11 items-center gap-1.5 rounded-ctl px-3 text-[15px] font-semibold transition-colors hover:bg-sunken sm:min-h-9';

  return (
    <article className="space-y-6">
      {back}
      <header>
        <span className="inline-flex h-6 items-center rounded-tag border border-line px-2 text-[12px] font-semibold text-ink-2">{s.cat[p.category]}</span>
        <h3 className={`mt-2 text-[22px] leading-snug font-extrabold tracking-tight [overflow-wrap:anywhere] sm:text-[24px] ${gone ? 'text-ink-3' : ''}`}>
          {gone || p.title == null ? s.stateText[p.state] : p.title}
        </h3>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-3">
          {race && !hideRace && <span className="font-semibold text-ink-2">{raceName(race, lang)}</span>}
          {p.nickname && <span className="font-semibold text-ink-2">{p.nickname}</span>}
          <time className="num" dateTime={p.created_at}>
            {fmtWhen(p.created_at, lang)}
          </time>
          {p.edited && !gone && <span>{s.edited}</span>}
          <span>{s.comments(p.comment_count)}</span>
        </p>
      </header>

      {p.state === 'hidden' && <Note>{s.hiddenOwner}</Note>}

      <div className={MEMBERS_ONLY_CLASS}>
        {gone ? null : d.locked ? (
          <LockedNotice viewer={lockViewer} onLogin={onLogin} />
        ) : (
          <p className="max-w-[62ch] text-[16px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{p.body}</p>
        )}
      </div>

      {!gone && (
        <div className="space-y-3">
          <div className="-mx-3 flex flex-wrap items-center gap-1">
            <button type="button" onClick={toggleLike} disabled={likeBusy} aria-pressed={p.liked} className={`${action} ${p.liked ? 'text-ink' : 'text-ink-2'}`}>
              <Heart size={17} weight={p.liked ? 'fill' : 'bold'} aria-hidden />
              {s.like}
              <span className="num font-normal text-ink-3">{p.like_count}</span>
            </button>
            {p.mine ? (
              <>
                <button type="button" className={`${action} text-ink-2`} onClick={() => setMode('edit')}>
                  {s.edit}
                </button>
                <button
                  type="button"
                  className={`${action} text-ink-2`}
                  onClick={async () => {
                    if (!confirm(s.confirmDelPost)) return;
                    try {
                      await deletePost(p.id);
                      onSync?.(p.id, { state: 'deleted', title: null, nickname: null });
                      load();
                    } catch (e) {
                      setErr(friendlyError(e, s.saveFail, lang));
                    }
                  }}
                >
                  {s.del}
                </button>
              </>
            ) : (
              <button
                type="button"
                aria-expanded={mode === 'report'}
                className={`${action} text-ink-2`}
                onClick={() => setMode((m) => (m === 'report' || m === 'gate' ? null : writable ? 'report' : 'gate'))}
              >
                {s.report}
              </button>
            )}
          </div>
          {mode === 'gate' && <GateNote viewer={viewer} ban={ban} onLogin={onLogin} />}
          {mode === 'report' && <ReportDialog target={{ type: 'post', id: p.id }} onClose={() => setMode(null)} />}
          {err && <Note tone="error">{err}</Note>}
        </div>
      )}

      {!d.locked && (
        <div className="border-t border-line pt-6">
          <Comments
            comments={d.comments}
            postId={p.id}
            viewer={viewer}
            ban={ban}
            onLogin={onLogin}
            onChanged={load}
            open={p.state === 'visible'}
          />
        </div>
      )}
    </article>
  );
}
