import type { ReactNode } from 'react';
import { CaretRight } from '@phosphor-icons/react';
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
  const req = <Tag>{t('consent.required')}</Tag>;
  const link = 'text-[13px] text-ink-2 underline underline-offset-2 hover:text-ink';

  return (
    // 다른 입력 칸과 같은 모양의 이름표(legend) 아래에 동의 상자 하나
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold text-ink-2">{t('consent.legend')}</legend>
      <div className="rounded-box border border-line p-1.5">
        <div className="rounded-ctl bg-sunken px-2.5">
          <Check checked={all} onChange={setAll} strong>
            {t('consent.all')}
          </Check>
        </div>
        <div className="px-2.5 pt-1 pb-0.5">
          <Check checked={value.age14} onChange={(on) => onChange({ ...value, age14: on })}>
            {req}{' '}
            {t('consent.age14')}
            <span className="mt-0.5 block text-[13px] text-ink-3">{t('consent.age14Hint')}</span>
          </Check>
          <Check checked={value.collect} onChange={(on) => onChange({ ...value, collect: on })}>
            {req}{' '}
            {t('consent.collect')}
          </Check>
          <details className="group pb-2 pl-[30px]">
            <summary className="-ml-1 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-ctl px-1 text-[13px] font-semibold text-ink-2 hover:text-ink sm:min-h-8 [&::-webkit-details-marker]:hidden">
              <CaretRight size={12} weight="bold" className="transition-transform duration-150 ease-out group-open:rotate-90" aria-hidden />
              {t('consent.view')}
            </summary>
            <CollectionTable item={COLLECT_MEMBER} lang={lang} />
            <a href={langPath(PRIVACY_PATH, lang)} target="_blank" rel="noopener" className={`mt-2 inline-flex min-h-11 items-center sm:min-h-8 ${link}`}>
              {t('consent.policyLink')}
            </a>
          </details>
          <div className="flex items-start justify-between gap-3">
            <Check checked={value.terms} onChange={(on) => onChange({ ...value, terms: on })}>
              {req}{' '}
              {t('consent.terms')}
            </Check>
            <a
              href={langPath(TERMS_PATH, lang)}
              target="_blank"
              rel="noopener"
              className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap sm:min-h-10 ${link}`}
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
              <Tag quiet>{t('consent.optional')}</Tag>{' '}
              {o.label}
            </Check>
          ))}
        </div>
      </div>
    </fieldset>
  );
}

/** [필수]·[선택] 표시. 화면 읽기에서도 '필수' 로 읽히게 글자로 둔다 */
function Tag({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  return (
    <span
      className={`mr-0.5 inline-block rounded-tag border px-1 align-[1px] text-[12px] leading-[18px] font-semibold ${
        quiet ? 'border-line text-ink-3' : 'border-ink-3 text-ink'
      }`}
    >
      {children}
    </span>
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
      className={`flex min-h-11 cursor-pointer items-start gap-3 py-2.5 text-[15px] leading-snug ${strong ? 'font-semibold text-ink' : 'text-ink-2'}`}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-px size-[18px] shrink-0 cursor-pointer" />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

/** 고지 4항목(목적·항목·보유기간·거부 권리와 불이익) 표 */
export function CollectionTable({ item, lang }: { item: CollectionItem; lang: Lang }) {
  const { t } = useLang();
  const rows: [string, string][] = [
    [t('consent.purpose'), item.purpose[lang]],
    [t('consent.items'), item.items[lang]],
    [t('consent.retention'), item.retention[lang]],
    [t('consent.refusal'), item.refusal[lang]],
  ];
  return (
    <dl className="mt-1 divide-y divide-line rounded-ctl bg-sunken px-3 text-[15px] sm:text-[13px] leading-relaxed">
      {rows.map(([k, v]) => (
        <div key={k} className="py-2.5">
          <dt className="font-semibold text-ink">{k}</dt>
          <dd className="mt-0.5 text-ink-2">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
