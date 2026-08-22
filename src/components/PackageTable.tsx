import type { Agency, Package } from '../lib/types';
import { krwExact } from '../lib/util';

export default function PackageTable({
  packages,
  agencies,
}: {
  packages: Package[];
  agencies: Agency[];
}) {
  const byId = new Map(agencies.map((a) => [a.id, a]));

  if (!packages.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-center">
        <p className="text-sm text-zinc-400">이 대회를 취급하는 여행사 정보가 아직 등록되지 않았습니다.</p>
        <p className="mt-2 text-xs text-zinc-600">
          아래 업체들이 해외 마라톤 패키지를 다룹니다 — 직접 문의해 보세요.
        </p>
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          {agencies.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-700"
            >
              {a.name} ↗
            </a>
          ))}
        </div>
      </div>
    );
  }

  const known = packages.filter((p) => p.price_solo_krw != null);
  const cheapest = known.length ? Math.min(...known.map((p) => p.price_solo_krw!)) : null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="bg-zinc-900 text-left text-xs text-zinc-500">
              <th className="px-4 py-2.5 font-medium">여행사</th>
              <th className="px-4 py-2.5 font-medium">상품</th>
              <th className="px-4 py-2.5 font-medium">일정</th>
              <th className="px-4 py-2.5 text-right font-medium">개인 (1인)</th>
              <th className="px-4 py-2.5 text-right font-medium">단체</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {packages.map((p) => {
              const ag = byId.get(p.agency_id);
              const isCheapest = cheapest != null && p.price_solo_krw === cheapest && known.length > 1;
              return (
                <tr key={p.id} className="bg-zinc-900/40">
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-200">{ag?.name ?? p.agency_id}</td>
                  <td className="px-4 py-3 text-zinc-300">
                    <div>{p.title}</div>
                    {p.includes.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {p.includes.map((i) => (
                          <span key={i} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">
                            {i}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-zinc-400">
                    {p.nights != null ? `${p.nights}박 ${p.nights + 1}일` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums">
                    {p.price_solo_krw != null ? (
                      <span className={isCheapest ? 'font-semibold text-emerald-400' : 'text-zinc-200'}>
                        {krwExact(p.price_solo_krw)}
                        {isCheapest && <span className="ml-1 text-[10px]">최저</span>}
                      </span>
                    ) : (
                      <span className="text-zinc-600">가격 문의</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap tabular-nums text-zinc-400">
                    {p.price_group_krw != null
                      ? `${krwExact(p.price_group_krw)}${p.group_min ? ` (${p.group_min}인~)` : ''}`
                      : '문의'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-700"
                    >
                      보기 ↗
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-zinc-500">
        여행사 가격은 출발일·객실 조건·유류할증료에 따라 수시로 바뀝니다. 표의 금액은 공개된 상품가 기준이며
        반드시 링크에서 최종 확인하세요. 대부분의 패키지는 <strong className="text-zinc-400">대회 참가비가
        불포함</strong>이니 총액 비교 시 참가비를 따로 더해야 합니다.
      </p>
    </div>
  );
}
