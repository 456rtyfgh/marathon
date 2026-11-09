import { ArrowUpRight } from '@phosphor-icons/react';
import type { Agency, Package } from '../lib/types';
import { track } from '../lib/analytics';
import { krwExact, safeUrl } from '../lib/util';
import { useLang, type Key } from '../i18n';
import { EN_EXTRA } from '../i18n/en';

/** 여행사 상품 '포함' 낱말 → 사전 키 (모르는 낱말은 원래 글자) */
const INCLUDES: Record<string, Key> = {
  항공: 'inc.flight',
  호텔: 'inc.hotel',
  Hotel: 'inc.hotel',
  조식: 'inc.breakfast',
  식사: 'inc.meals',
  일부식사: 'inc.someMeals',
  인솔자: 'inc.escort',
  가이드: 'inc.guide',
  여행자보험: 'inc.insurance',
  유류할증료: 'inc.fuel',
  엔트리: 'inc.entry',
  '엔트리 대행': 'inc.entryService',
  '접수 대행': 'inc.entryService',
  'Guaranteed entry': 'inc.guaranteed',
};

export default function PackageTable({ packages, agencies }: { packages: Package[]; agencies: Agency[] }) {
  const { lang, t } = useLang();
  const byId = new Map(agencies.map((a) => [a.id, a]));
  /** 여행사 메모·상품 이름: 영어 표(en.ts 'agency.<id>.note' · 'package.<id>.title')에 있으면 그것, 없으면 원래 글자 */
  const enText = (key: string, fallback: string) => (lang === 'en' ? (EN_EXTRA[key] ?? fallback) : fallback);
  const inc = (w: string) => (lang === 'en' && INCLUDES[w] ? t(INCLUDES[w]) : w);

  if (!packages.length) {
    return (
      <div className="space-y-4">
        <p className="text-[15px] text-ink-2">{t('pkg.none')}</p>
        <p className="text-[13px] text-ink-3">{t('pkg.agencies')}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {agencies.map((a) => (
            <li key={a.id}>
              <a
                href={safeUrl(a.url)}
                onClick={() => track('agency_click', { agency_id: a.id, from: 'list' })}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center justify-between rounded-box bg-surface px-4 py-3 transition hover:bg-sunken"
              >
                <span>
                  <span className="block text-[15px] font-semibold text-ink">{enText(`agency.${a.id}.name`, a.name)}</span>
                  {a.note && <span className="block text-[13px] text-ink-3">{enText(`agency.${a.id}.note`, a.note)}</span>}
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
                href={safeUrl(p.url)}
                onClick={() => track('agency_click', { agency_id: p.agency_id, race_id: p.race_id, package_id: p.id })}
                target="_blank"
                rel="noreferrer"
                className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 rounded-box bg-surface px-4 py-4 transition hover:bg-sunken"
              >
                <div className="min-w-0">
                  <div className="text-[13px] text-ink-3">{ag ? enText(`agency.${ag.id}.name`, ag.name) : p.agency_id}</div>
                  <div className="mt-1 line-clamp-2 text-[15px] leading-snug font-semibold text-ink">{enText(`package.${p.id}.title`, p.title)}</div>
                  <div className="mt-1 text-[13px] text-ink-3">
                    {p.nights != null ? t('pkg.nights', { n: p.nights, d: p.nights + 1 }) : t('pkg.ask')}
                    {p.includes.length > 0 && `, ${p.includes.map(inc).join(lang === 'en' ? ', ' : ' ')}`}
                  </div>
                </div>
                <div className="text-right">
                  {p.price_solo_krw != null ? (
                    <>
                      <div
                        className={`num inline-block rounded-tag px-1 text-[20px] font-bold leading-tight whitespace-nowrap ${
                          low ? 'bg-accent text-on-accent' : 'text-ink'
                        }`}
                      >
                        {krwExact(p.price_solo_krw, lang)}
                      </div>
                      <div className="mt-1 text-[12px] text-ink-3">
                        {low ? t('pkg.cheapest') : t('pkg.solo')}
                        {p.price_group_krw != null && t('pkg.group', { v: krwExact(p.price_group_krw, lang) })}
                      </div>
                    </>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[15px] font-semibold whitespace-nowrap text-ink-2 group-hover:text-ink">
                      {t('pkg.askPrice')} <ArrowUpRight size={14} />
                    </span>
                  )}
                </div>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="max-w-[60ch] text-[13px] leading-relaxed text-ink-3">{t('pkg.note')}</p>
    </div>
  );
}
