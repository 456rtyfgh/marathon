/**
 * 러닝톡 (상단 메뉴). 카테고리 칩·대회 거르기·목록·더 보기·글쓰기, 글을 열면 같은 패널 안에서 상세.
 * 주소: /community?cat=&race= ↔ /community/<id> (영어 /en 접두). 글을 열면 pushState, '목록으로'·뒤로 가기는 이전 주소로.
 * 히스토리 호출은 history.state 를 그대로 넘긴다 — 패널을 뒤로 가기로 닫는 표시(panelDepth, components/ui.tsx)가 이어지게.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PencilSimple } from '@phosphor-icons/react';
import type { Race } from '../lib/types';
import { langPath, useLang } from '../i18n';
import { raceName } from '../i18n/names';
import { CATEGORIES, type Category, type PostListItem } from '../lib/communityTypes';
import { Button, CloseButton, Note } from '../components/ui';
import { canWrite, useMyBan, usePostList, useViewer } from './api';
import { GateNote } from './MembersGate';
import PostDetail from './PostDetail';
import PostForm, { CatChip } from './PostForm';
import PostList, { ListSkeleton } from './PostList';
import RacePicker from './RacePicker';
import { COMMUNITY_PATH, parseCommunity } from './route';
import { useS } from './strings';

export default function CommunityPage({ races, onClose, onLogin }: { races: Race[]; onClose: () => void; onLogin: () => void }) {
  const s = useS();
  const { lang } = useLang();
  const [route, setRoute] = useState(() => parseCommunity(location));
  const { post, cat, race } = route;
  const [writing, setWriting] = useState(false);
  const [gate, setGate] = useState(false);
  const { viewer, uid, nickname } = useViewer();
  const ban = useMyBan(uid);
  // 정지 중인 회원: 안내를 늘 보이고 글쓰기 버튼을 끈다
  const banned = !!ban && (viewer === 'member' || viewer === 'admin');
  const list = usePostList({ race, cat });
  const raceMap = useMemo(() => new Map(races.map((r) => [r.id, r])), [races]);
  const raceLabel = (id: string) => {
    const r = raceMap.get(id);
    return r ? raceName(r, lang) : null;
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const listTop = useRef(0);
  const pushed = useRef(false);
  // 지금 보이는 화면의 주소. 주소가 그대로인 popstate(러닝톡 위에 뜬 로그인 시트가 닫히며 Panel 이 뺀 칸)는 넘긴다
  const shownUrl = useRef(location.pathname + location.search);

  /** 그 상태의 주소 (cmock 같은 다른 쿼리는 그대로 둔다) */
  const href = (p: string | null, c: Category | null = cat, r: string | null = race) => {
    const q = new URLSearchParams(location.search);
    q.delete('cat');
    q.delete('race');
    if (!p && c) q.set('cat', c);
    if (!p && r) q.set('race', r);
    const qs = q.toString();
    return langPath(p ? `${COMMUNITY_PATH}/${p}` : COMMUNITY_PATH, lang) + (qs ? `?${qs}` : '');
  };

  // 뒤로·앞으로 가기: 주소를 다시 읽고, 러닝톡 주소가 아니면 닫는다
  useEffect(() => {
    const onPop = () => {
      if (!/^(?:\/en)?\/community(\/|$)/.test(location.pathname)) return onClose();
      const url = location.pathname + location.search;
      if (url === shownUrl.current) return; // 주소 그대로 — 글쓰기 중인 내용·목록 자리를 건드리지 않는다
      shownUrl.current = url;
      pushed.current = false;
      setWriting(false);
      setRoute(parseCommunity(location));
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, [onClose]);

  useEffect(() => {
    document.title = lang === 'ko' ? '러닝톡 | 마라톤 캘린더' : 'Run Talk | Marathon Calendar';
  }, [lang]);

  // 목록 ↔ 상세를 오가면 목록 스크롤 자리를 되살린다
  useEffect(() => {
    const box = scrollRef.current;
    if (box) box.scrollTop = post ? 0 : listTop.current;
  }, [post]);

  const filter = (c: Category | null, r: string | null) => {
    history.replaceState(history.state, '', href(null, c, r));
    shownUrl.current = location.pathname + location.search;
    setRoute({ post: null, cat: c, race: r });
  };
  const open = (id: string) => {
    listTop.current = scrollRef.current?.scrollTop ?? 0;
    history.pushState(history.state, '', href(id));
    shownUrl.current = location.pathname + location.search;
    pushed.current = true;
    setWriting(false);
    setRoute((x) => ({ ...x, post: id }));
  };
  const back = () => {
    if (pushed.current) return history.back(); // popstate 가 목록으로 되돌린다
    history.replaceState(history.state, '', href(null));
    shownUrl.current = location.pathname + location.search;
    setRoute((x) => ({ ...x, post: null }));
  };

  const onWrite = () => {
    if (canWrite(viewer, ban)) {
      listTop.current = scrollRef.current?.scrollTop ?? 0;
      setGate(false);
      setWriting(true);
    } else setGate((g) => !g);
  };

  const created = (id: string, input: { race_id: string | null; category: Category; title: string }) => {
    const item: PostListItem = {
      id,
      race_id: input.race_id,
      category: input.category,
      title: input.title,
      nickname,
      created_at: new Date().toISOString(),
      comment_count: 0,
      like_count: 0,
      edited: false,
      state: 'visible',
    };
    if ((!cat || cat === item.category) && (!race || race === item.race_id)) list.prepend(item);
    open(id);
  };

  return (
    <div ref={scrollRef} className="relative h-full overflow-y-auto">
      <div className="sticky top-0 z-10 flex h-16 items-center justify-between gap-2 bg-bg px-5 sm:h-14 sm:px-7">
        <span className="text-[15px] font-semibold text-ink-2">{s.title}</span>
        <CloseButton onClick={onClose} />
      </div>

      <div className="px-5 pb-12 sm:px-7">
        {post ? (
          <div className="pt-1">
            <PostDetail key={post} id={post} races={races} onBack={back} onLogin={onLogin} onSync={list.patch} />
          </div>
        ) : writing ? (
          <div className="pt-1">
            <PostForm
              races={races}
              onDone={(id, input) => {
                setWriting(false);
                created(id, input);
              }}
              onCancel={() => setWriting(false)}
            />
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-end justify-between gap-4 pt-1 pb-5">
              <div className="min-w-0">
                <h2 className="text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">{s.title}</h2>
                <p className="mt-1 max-w-[44ch] text-[15px] leading-relaxed text-ink-2">{s.lead}</p>
              </div>
              <Button onClick={onWrite} aria-expanded={gate || undefined} disabled={banned}>
                <PencilSimple size={16} weight="bold" aria-hidden />
                {s.write}
              </Button>
            </header>
            {(gate || banned) && (
              <div className="pb-4">
                <GateNote viewer={viewer} ban={ban} onLogin={onLogin} />
              </div>
            )}

            <div role="group" aria-label={s.catAria} className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
              <CatChip on={!cat} onClick={() => filter(null, race)}>
                {s.all}
              </CatChip>
              {CATEGORIES.map((c) => (
                <CatChip key={c} on={cat === c} onClick={() => filter(cat === c ? null : c, race)}>
                  {s.cat[c]}
                </CatChip>
              ))}
            </div>
            <div className="mt-3 sm:max-w-sm">
              <RacePicker races={races} value={race} onChange={(r) => filter(cat, r)} placeholder={`${s.race}: ${s.raceSearch}`} />
            </div>

            <div className="mt-5">
              {list.items === null ? (
                <ListSkeleton />
              ) : (
                <>
                  {list.failed && <Note tone="error">{s.loadFail}</Note>}
                  {list.items.length === 0 && !list.failed ? (
                    <p className="py-10 text-center text-[15px] text-ink-3">{s.empty}</p>
                  ) : (
                    <PostList items={list.items} href={(p) => href(p.id)} onOpen={(p) => open(p.id)} raceLabel={raceLabel} />
                  )}
                  {list.hasMore && (
                    <div className="pt-3">
                      <button
                        type="button"
                        onClick={list.more}
                        disabled={list.busy}
                        className="h-11 rounded-ctl bg-sunken px-4 text-[15px] font-semibold transition hover:bg-line disabled:opacity-50 sm:h-10"
                      >
                        {list.busy ? s.loading : s.more}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

