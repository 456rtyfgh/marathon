import type { ReactNode } from 'react';
import { COLLECT_MEMBER, PRIVACY_PATH, TERMS_PATH, requiredOk, type CollectionItem, type ConsentChecks } from '../lib/policy';
import { langPath, useLang, type Lang } from '../i18n';

export interface OptionalConsent {
  key: string;
  label: string;
}

/** 가입 화면 동의 체크. 필수 3개 + 선택 항목(지금은 없음 — 선택으로 모으는 정보가 생기면 optional 로 넘긴다) */
export function SignupConsent({
  value,
  onChange,
  optional = [],
}: {
  value: ConsentChecks;
  onChange: (v: ConsentChecks) => void;
  optional?: OptionalConsent[];
}) {
  const { lang, t } = useLang();
  const all = requiredOk(value) && optional.every((o) => value.optional[o.key]);
  const setAll = (on: boolean) =>
    onChange({ age14: on, collect: on, terms: on, optional: Object.fromEntries(optional.map((o) => [o.key, on])) });
  const req = <span className="font-semibold text-ink">[{t('consent.required')}]</span>;

  return (
    <fieldset className="space-y-1 rounded-box border border-line px-3 py-2">
      <legend className="px-1 text-[13px] font-semibold text-ink-2">{t('consent.legend')}</legend>
      <Check checked={all} onChange={setAll} strong>
        {t('consent.all')}
      </Check>
      <div className="border-t border-line" />
      <Check checked={value.age14} onChange={(on) => onChange({ ...value, age14: on })}>
        {req} {t('consent.age14')}
        <span className="block text-[13px] text-ink-3">{t('consent.age14Hint')}</span>
      </Check>
      <Check checked={value.collect} onChange={(on) => onChange({ ...value, collect: on })}>
        {req} {t('consent.collect')}
      </Check>
      <details className="pb-1 pl-7">
        <summary className="min-h-11 cursor-pointer py-2 text-[13px] text-ink-3 underline underline-offset-2 hover:text-ink sm:min-h-0">
          {t('consent.view')}
        </summary>
        <CollectionTable item={COLLECT_MEMBER} lang={lang} />
        <a
          href={langPath(PRIVACY_PATH, lang)}
          target="_blank"
          rel="noopener"
          className="mt-2 inline-block py-1 text-[13px] text-ink-2 underline underline-offset-2 hover:no-underline"
        >
          {t('consent.policyLink')}
        </a>
      </details>
      <div className="flex items-center justify-between gap-2">
        <Check checked={value.terms} onChange={(on) => onChange({ ...value, terms: on })}>
          {req} {t('consent.terms')}
        </Check>
        <a
          href={langPath(TERMS_PATH, lang)}
          target="_blank"
          rel="noopener"
          className="shrink-0 py-2 text-[13px] whitespace-nowrap text-ink-3 underline underline-offset-2 hover:text-ink"
        >
          {t('consent.viewTerms')}
        </a>
      </div>
      {optional.map((o) => (
        <Check
          key={o.key}
          checked={!!value.optional[o.key]}
          onChange={(on) => onChange({ ...value, optional: { ...value.optional, [o.key]: on } })}
        >
          <span className="text-ink-3">[{t('consent.optional')}]</span> {o.label}
        </Check>
      ))}
    </fieldset>
  );
}

function Check({
  checked,
  onChange,
  strong,
  children,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-start gap-3 py-2 text-[15px] leading-snug sm:min-h-10 ${strong ? 'font-semibold text-ink' : 'text-ink-2'}`}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </label>
  );
}

/** 고지 4항목(목적·항목·보유기간·거부 권리와 불이익) 표. 알림 구독 고지도 같이 쓴다 */
export function CollectionTable({ item, lang }: { item: CollectionItem; lang: Lang }) {
  const { t } = useLang();
  const rows: [string, string][] = [
    [t('consent.purpose'), item.purpose[lang]],
    [t('consent.items'), item.items[lang]],
    [t('consent.retention'), item.retention[lang]],
    [t('consent.refusal'), item.refusal[lang]],
  ];
  return (
    <dl className="space-y-2 rounded-ctl bg-sunken px-3 py-3 text-[13px] leading-relaxed">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="font-semibold text-ink-2">{k}</dt>
          <dd className="text-ink-3">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
