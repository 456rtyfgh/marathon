/** 내 정보 안 '내가 쓴 러닝톡 글' (숨김·임시조치·삭제 상태 그대로). 누르면 그 글 주소로 간다 */
import { useEffect, useState } from 'react';
import { langPath, useLang } from '../i18n';
import type { PostListItem } from '../lib/communityTypes';
import { myPosts, useViewer, type CommunityError } from './api';
import PostList from './PostList';
import { COMMUNITY_PATH } from './route';
import { useS } from './strings';

export default function MyPosts() {
  const s = useS();
  const { lang } = useLang();
  const { viewer, uid } = useViewer();
  const [items, setItems] = useState<PostListItem[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    myPosts().then(
      (r) => alive && setItems(r.items),
      (e: CommunityError) => {
        if (!alive) return;
        // 서버에 러닝톡이 아직 없으면(0014 실행 전) 이 칸을 그리지 않는다
        if (e?.code === 'PGRST202') setItems(null);
        else setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [uid]);

  if (viewer === 'guest' || (!items && !failed)) return null;
  return (
    <section aria-labelledby="my-posts-title" className="space-y-3">
      <h3 id="my-posts-title" className="text-[15px] font-bold">
        {s.myTitle}
      </h3>
      {failed ? (
        <p className="text-[15px] text-ink-3">{s.loadFail}</p>
      ) : items!.length === 0 ? (
        <p className="text-[15px] text-ink-3">{s.myNone}</p>
      ) : (
        <PostList items={items!} href={(p) => langPath(`${COMMUNITY_PATH}/${p.id}`, lang)} showState />
      )}
    </section>
  );
}
