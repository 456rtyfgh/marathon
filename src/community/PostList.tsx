/**
 * 글 목록 한 줄씩 (러닝톡·대회 '이야기' 탭·내 글 공용). 본문 미리보기는 없다 — 서버도 목록에 본문을 주지 않는다.
 */
import { ChatCircle, Heart } from '@phosphor-icons/react';
import { useLang } from '../i18n';
import type { PostListItem } from '../lib/communityTypes';
import { fmtWhen, useS } from './strings';

export default function PostList({
  items,
  href,
  onOpen,
  raceLabel,
  showState = false,
}: {
  items: PostListItem[];
  href: (p: PostListItem) => string;
  /** 없으면 보통 링크로 이동한다 (내 글 목록) */
  onOpen?: (p: PostListItem) => void;
  /** 대회 이름 (대회 탭 안에서는 넘기지 않는다) */
  raceLabel?: (id: string) => string | null;
  /** 내 글: 숨김·임시조치·삭제 표시 */
  showState?: boolean;
}) {
  const s = useS();
  const { lang } = useLang();
  return (
    <ul className="divide-y divide-line border-y border-line">
      {items.map((p) => {
        const gone = p.state !== 'visible' && !p.title;
        const race = p.race_id && raceLabel ? raceLabel(p.race_id) : null;
        return (
          <li key={p.id}>
            <a
              href={href(p)}
              onClick={(e) => {
                if (!onOpen || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                onOpen(p);
              }}
              className="block px-1 py-4 transition-colors hover:bg-sunken/60 sm:px-2"
            >
              <span className="flex items-start gap-2">
                <span className="mt-0.5 inline-flex h-6 shrink-0 items-center rounded-tag border border-line px-2 text-[12px] font-semibold whitespace-nowrap text-ink-2">
                  {s.cat[p.category]}
                </span>
                <span className={`min-w-0 text-[16px] leading-snug ${gone ? 'text-ink-3' : 'font-bold text-ink'}`}>
                  {showState && s.myState[p.state] && (
                    <span className="mr-2 inline-flex h-6 items-center rounded-tag bg-sunken px-2 align-top text-[12px] font-semibold text-ink-2">
                      {s.myState[p.state]}
                    </span>
                  )}
                  <span className="line-clamp-2 [overflow-wrap:anywhere] inline">{gone ? s.stateText[p.state] : p.title}</span>
                </span>
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 pl-0.5 text-[13px] text-ink-3">
                {race && <span className="max-w-full truncate font-semibold text-ink-2">{race}</span>}
                {p.nickname && <span className="max-w-[12rem] truncate">{p.nickname}</span>}
                <span className="num">{fmtWhen(p.created_at, lang)}</span>
                {p.edited && !gone && <span>{s.edited}</span>}
                {p.comment_count > 0 && (
                  <span className="inline-flex items-center gap-1" aria-label={s.comments(p.comment_count)}>
                    <ChatCircle size={13} weight="bold" aria-hidden />
                    <span className="num">{p.comment_count}</span>
                  </span>
                )}
                {p.like_count > 0 && (
                  <span className="inline-flex items-center gap-1" aria-label={s.likes(p.like_count)}>
                    <Heart size={13} weight="bold" aria-hidden />
                    <span className="num">{p.like_count}</span>
                  </span>
                )}
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}

/** 목록 불러오는 동안 자리 */
export function ListSkeleton() {
  const s = useS();
  return (
    <div className="space-y-px" aria-busy="true" aria-label={s.loading}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[76px] animate-pulse bg-surface" />
      ))}
    </div>
  );
}
