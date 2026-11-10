/**
 * 관리 화면 목록 머리: 지금 정렬 기준 글자 + 바꾸기 버튼(커뮤니티 관리의 신고함·금칙어 전환과 같은 모양).
 * 고른 것은 표면색 칩 + 그림자 (검정으로 꽉 채우지 않는다).
 */
export default function AdminSortBar<T extends string>({
  label,
  value,
  onChange,
  options,
  desc,
  count,
}: {
  /** 목록 이름 (스크린리더용 묶음 이름) */
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
  /** 지금 기준 설명 — '대회 날짜 가까운 순 · 지난 대회는 뒤' */
  desc: string;
  count?: number;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p className="text-[13px] text-ink-3">
        {count != null && (
          <>
            <span className="num font-semibold text-ink-2">{count.toLocaleString()}</span>개 ·{' '}
          </>
        )}
        정렬 <span className="font-semibold text-ink-2">{desc}</span>
      </p>
      <div role="radiogroup" aria-label={`${label} 정렬`} className="inline-flex rounded-ctl bg-sunken p-0.5">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={`h-11 rounded-[4px] px-3 text-[13px] font-semibold whitespace-nowrap transition-colors sm:h-7 ${
              value === v ? 'bg-surface text-ink shadow-[0_1px_2px_var(--shadow)]' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}
