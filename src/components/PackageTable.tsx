import { ArrowUpRight } from '@phosphor-icons/react';
import type { Agency, Package } from '../lib/types';
import { krwExact } from '../lib/util';

export default function PackageTable({ packages, agencies }: { packages: Package[]; agencies: Agency[] }) {
  const byId = new Map(agencies.map((a) => [a.id, a]));

  if (!packages.length) {
    return (
      <div className="space-y-4">
        <p className="text-[15px] text-ink-2">이 대회를 다루는 여행사 상품은 아직 등록되지 않았습니다.</p>
        <p className="text-[14px] text-ink-3">해외 마라톤 패키지를 주로 다루는 곳들입니다. 직접 문의해 보세요.</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {agencies.map((a) => (
            <li key={a.id}>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between rounded-box bg-surface px-4 py-3 transition hover:bg-sunken"
              >
                <span>
                  <span className="block text-[15px] font-semibold text-ink">{a.name}</span>
                  {a.note && <span className="block text-[13px] text-ink-3">{a.note}</span>}
                </span>
                <ArrowUpRight size={16} className="shrink-0 text-ink-3 group-hover:text-ink" />
              </a>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const priced = packages.filter((p) => p.price_solo_krw != null);
  const cheapest = priced.length > 1 ? Math.min(...priced.map((p) => p.price_solo_krw!)) : null;
  const sorted = [...packages].sort((a, b) => (a.price_solo_krw ?? Infinity) - (b.price_solo_krw ?? Infinity));

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {sorted.map((p) => {
          const ag = byId.get(p.agency_id);
          const low = cheapest != null && p.price_solo_krw === cheapest;
          return (
            <li key={p.id}>
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-box bg-surface px-4 py-3.5 transition hover:bg-sunken"
              >
                <div className="min-w-0">
                  <div className="text-[13px] text-ink-3">{ag?.name ?? p.agency_id}</div>
                  <div className="truncate text-[15px] font-semibold text-ink">{p.title}</div>
                  <div className="mt-1 text-[13px] text-ink-3">
                    {p.nights != null ? `${p.nights}박 ${p.nights + 1}일` : '일정 문의'}
                    {p.includes.length > 0 && `, ${p.includes.join(' ')}`}
                  </div>
                </div>
                <div className="text-right">
                  {p.price_solo_krw != null ? (
                    <>
                      <div
                        className={`num inline-block rounded-tag px-1 text-[22px] font-bold leading-tight ${
                          low ? 'bg-accent text-on-accent' : 'text-ink'
                        }`}
                      >
                        {krwExact(p.price_solo_krw)}
                      </div>
                      <div className="text-[12px] text-ink-3">
                        {low ? '가장 저렴' : '1인'}
                        {p.price_group_krw != null && `, 단체 ${krwExact(p.price_group_krw)}`}
                      </div>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-ink-2 group-hover:text-ink">
                      가격 문의 <ArrowUpRight size={14} />
                    </span>
                  )}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-3">
        공개된 상품가 기준이며 출발일과 객실 조건에 따라 달라집니다. 대부분의 패키지는 대회 참가비가 따로입니다.
      </p>
    </div>
  );
}
