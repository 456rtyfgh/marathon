/** 대회 상세 '이야기' 탭: 그 대회 러닝톡 글 목록·글쓰기(대회 고정)·상세(탭 안에서 열기) */
import { useState } from 'react';
import { PencilSimple } from '@phosphor-icons/react';
import type { Race } from '../lib/types';
import { langPath, useLang } from '../i18n';
import type { PostListItem } from '../lib/communityTypes';
import { Button, Note } from '../components/ui';
import { canWrite, useMyBan, usePostList, useViewer } from './api';
import { GateNote } from './MembersGate';
import PostDetail from './PostDetail';
import PostForm from './PostForm';
import PostList, { ListSkeleton } from './PostList';
import { COMMUNITY_PATH } from './route';
import { useS } from './strings';

export default function RaceTalkTab({ race, onLogin }: { race: Race; onLogin: () => void }) {
  const s = useS();
  const { lang } = useLang();
  const { viewer, uid, nickname } = useViewer();
  const ban = useMyBan(uid);
  // 정지 중인 회원: 안내를 늘 보이고 글쓰기 버튼을 끈다
  const banned = !!ban && (viewer === 'member' || viewer === 'admin');
  const list = usePostList({ race: race.id });
  const [open, setOpen] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [gate, setGate] = useState(false);

  if (open)
    return <PostDetail key={open} id={open} races={[race]} hideRace onBack={() => setOpen(null)} onLogin={onLogin} onSync={list.patch} />;

  if (writing)
    return (
      <PostForm
        races={[race]}
        fixedRace={race.id}
        onDone={(id, input) => {
          const item: PostListItem = {
            id,
            race_id: race.id,
            category: input.category,
            title: input.title,
            nickname,
            created_at: new Date().toISOString(),
            comment_count: 0,
            like_count: 0,
            edited: false,
            state: 'visible',
          };
          list.prepend(item);
          setWriting(false);
          setOpen(id);
        }}
        onCancel={() => setWriting(false)}
      />
    );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <a
          href={`${langPath(COMMUNITY_PATH, lang)}?race=${encodeURIComponent(race.id)}`}
          className="-my-3 inline-flex min-h-11 min-w-0 items-center text-[15px] font-semibold text-ink-2 underline decoration-ink-3 underline-offset-4 hover:text-ink hover:decoration-ink"
        >
          {s.seeAll}
        </a>
        <Button
          disabled={banned}
          onClick={() => {
            if (canWrite(viewer, ban)) {
              setGate(false);
              setWriting(true);
            } else setGate((g) => !g);
          }}
        >
          <PencilSimple size={16} weight="bold" aria-hidden />
          {s.write}
        </Button>
      </div>
      {(gate || banned) && <GateNote viewer={viewer} ban={ban} onLogin={onLogin} />}
      {list.items === null ? (
        <ListSkeleton />
      ) : (
        <>
          {list.failed && <Note tone="error">{s.loadFail}</Note>}
          {list.items.length === 0 && !list.failed ? (
            <p className="py-8 text-center text-[15px] text-ink-3">{s.emptyRace}</p>
          ) : (
            <PostList items={list.items} href={(p) => langPath(`${COMMUNITY_PATH}/${p.id}`, lang)} onOpen={(p) => setOpen(p.id)} />
          )}
          {list.hasMore && (
            <button
              type="button"
              onClick={list.more}
              disabled={list.busy}
              className="h-11 rounded-ctl bg-sunken px-4 text-[15px] font-semibold transition hover:bg-line disabled:opacity-50 sm:h-10"
            >
              {list.busy ? s.loading : s.more}
            </button>
          )}
        </>
      )}
    </div>
  );
}
