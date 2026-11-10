/** 대회 연결 고르기: 이름으로 찾아 하나 고른다 (러닝톡 목록 거르기·글쓰기 공용). 고르면 이름과 풀기 버튼만 보인다 */
import { useId, useMemo, useState } from 'react';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import type { Race } from '../lib/types';
import { useLang } from '../i18n';
import { raceName } from '../i18n/names';
import { fmtDateShort } from '../lib/dateFormat';
import { inputCls } from '../components/ui';
import { useS } from './strings';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

export default function RacePicker({
  races,
  value,
  onChange,
  placeholder,
}: {
  races: Race[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
}) {
  const s = useS();
  const { lang } = useLang();
  const [q, setQ] = useState('');
  const listId = useId();
  const picked = value ? races.find((r) => r.id === value) : null;
  const hits = useMemo(() => {
    const n = norm(q);
    if (!n) return [];
    // 다가오는 대회를 앞에 (같은 이름이 해마다 있으면 올해 것이 먼저)
    const today = new Date().toISOString().slice(0, 10);
    return races
      .filter((r) => norm(r.name_ko).includes(n) || norm(r.name_en ?? '').includes(n))
      .sort((a, b) => Number(b.race_date >= today) - Number(a.race_date >= today) || a.race_date.localeCompare(b.race_date))
      .slice(0, 8);
  }, [q, races]);

  if (value)
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-ctl border border-ink bg-surface pr-1 pl-3 sm:min-h-10">
        <span className="min-w-0 truncate text-[15px] font-semibold">{picked ? raceName(picked, lang) : value}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={s.raceClear}
          className="grid size-11 shrink-0 place-items-center rounded-ctl text-ink-3 hover:bg-sunken hover:text-ink sm:size-8"
        >
          <X size={16} weight="bold" />
        </button>
      </div>
    );

  return (
    <div className="relative">
      <label className="relative block">
        <span className="sr-only">{s.raceSearch}</span>
        <MagnifyingGlass size={16} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder ?? s.raceSearch}
          // 목록은 검색어가 있을 때만 그려진다 — 없는 id 를 가리키지 않게(접근성 검사: aria-controls 값이 유효해야 한다)
          aria-controls={q.trim() ? listId : undefined}
          className={`${inputCls} pl-9`}
        />
      </label>
      {q.trim() && (
        <ul id={listId} className="mt-1 max-h-72 overflow-y-auto rounded-ctl border border-line bg-surface">
          {hits.length === 0 ? (
            <li className="px-3 py-3 text-[15px] text-ink-3">{s.raceNone}</li>
          ) : (
            hits.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(r.id);
                    setQ('');
                  }}
                  className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-left text-[15px] hover:bg-sunken"
                >
                  <span className="min-w-0 truncate font-semibold">{raceName(r, lang)}</span>
                  <span className="num shrink-0 text-[13px] text-ink-3">{fmtDateShort(r.race_date, lang)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
