import { useId, useMemo, useState, type ReactNode } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import type { Race } from '../lib/types';
import { matchRaces, matchRange } from '../lib/adminSearch';
import { inputCls } from './ui';

/** 맞은 글자만 굵게 */
function Mark({ text, q }: { text: string; q: string }): ReactNode {
  const m = matchRange(text, q);
  if (!m) return text;
  return (
    <>
      {text.slice(0, m[0])}
      <b className="font-bold text-ink">{text.slice(m[0], m[1])}</b>
      {text.slice(m[1])}
    </>
  );
}

/**
 * 관리 화면 대회 찾기: 한글 이름·영문 이름·도시·나라·id 일부를 치면 아래에 최대 8개가 뜨고, 고르면 onPick(id).
 * 키보드: ↑↓ 로 옮기고 Enter 로 고름, Esc 는 목록 닫기(닫혀 있으면 지우기).
 */
export default function AdminRaceSearch({
  races,
  onPick,
  autoFocus,
}: {
  races: Race[];
  onPick: (id: string) => void;
  autoFocus?: boolean;
}) {
  const uid = useId();
  const listId = `${uid}-list`;
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const hits = useMemo(() => matchRaces(races, q, 8), [races, q]);
  const shown = open && q.trim() !== '';
  const cur = Math.min(active, Math.max(0, hits.length - 1));

  const pick = (r: Race) => {
    setQ(r.name_ko);
    setOpen(false);
    onPick(r.id);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return; // 한글 조합 중 Enter·화살표는 입력기 몫
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else if (hits.length) setActive((cur + 1) % hits.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      else if (hits.length) setActive((cur - 1 + hits.length) % hits.length);
    } else if (e.key === 'Enter') {
      if (shown && hits[cur]) {
        e.preventDefault();
        pick(hits[cur]);
      }
    } else if (e.key === 'Escape') {
      // 패널(dialog)이 같이 닫히지 않게
      if (shown || q) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (shown) setOpen(false);
      else setQ('');
    }
  };

  return (
    <div className="relative">
      <label htmlFor={`${uid}-input`} className="mb-1.5 block text-[13px] font-semibold text-ink-2">
        고칠 대회 찾기 <span className="ml-1 font-normal text-ink-3">한글·영문 이름, 도시, id 일부</span>
      </label>
      <div className="relative">
        <MagnifyingGlass size={18} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          id={`${uid}-input`}
          type="search"
          role="combobox"
          aria-expanded={shown}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={shown && hits[cur] ? `${uid}-opt-${cur}` : undefined}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder="예: 도쿄, tokyo, 보스턴, seoul-half"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => q && setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className={`${inputCls} pl-10`}
        />
      </div>
      {shown && (
        <ul
          id={listId}
          role="listbox"
          aria-label="찾은 대회"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-[60vh] overflow-y-auto rounded-ctl border border-line bg-surface py-1 shadow-lg"
        >
          {hits.length === 0 && (
            <li role="presentation" className="px-3 py-3 text-[15px] text-ink-3">
              맞는 대회가 없습니다.
            </li>
          )}
          {hits.map((r, i) => (
            <li
              key={r.id}
              id={`${uid}-opt-${i}`}
              role="option"
              aria-selected={i === cur}
              // 입력창 blur 보다 먼저 고르도록 mousedown 에서 막는다
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(r)}
              onMouseMove={() => i !== cur && setActive(i)}
              className={`cursor-pointer border-l-2 px-3 py-2.5 ${i === cur ? 'border-ink bg-sunken' : 'border-transparent'}`}
            >
              <div className="truncate text-[15px] text-ink-2">
                <Mark text={r.name_ko} q={q} />
              </div>
              <div className="mt-0.5 truncate text-[13px] text-ink-3">
                {[r.name_en, r.city_ko].filter(Boolean).map((s, k) => (
                  <span key={k}>
                    {k > 0 && ' · '}
                    <Mark text={s} q={q} />
                  </span>
                ))}
                {' · '}
                <span className="num">{r.race_date}</span>
                {' · '}
                <span className="font-mono">
                  <Mark text={r.id} q={q} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
