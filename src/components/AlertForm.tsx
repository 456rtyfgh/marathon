import { useState } from 'react';
import type { Race } from '../lib/types';
import { subscribeAlert } from '../lib/data';
import { useAuth } from '../lib/auth';
import { daysBetween, TODAY, fmtDate, isSoldOut, isCancelled, isEntryConfirmed } from '../lib/util';
import { Button, Field, Input, Note } from './ui';
import { track } from '../lib/analytics';
import { useLang } from '../i18n';

const OPTIONS = [30, 14, 7, 3, 1];

export default function AlertForm({ race }: { race: Race }) {
  const { session } = useAuth();
  const { lang, t } = useLang();
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [days, setDays] = useState<number[]>([14, 3]);
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  const today = TODAY();
  const opensAhead = race.entry_opens && daysBetween(today, race.entry_opens) > 0;
  // 예상 접수일로는 알리지 않는다 → 확정 전에는 '공개되면 알려 드립니다' 화면
  const target = !isEntryConfirmed(race) ? null : opensAhead ? race.entry_opens : race.entry_closes ?? race.entry_opens;
  const d = target ? daysBetween(today, target) : null;

  // 취소된 대회는 상세에서 알림 탭을 숨기지만, 다른 경로로 열려도 신청을 받지 않는다
  if (isCancelled(race)) {
    return (
      <div className="rounded-box bg-surface px-4 py-4">
        <div className="text-[13px] text-ink-3">{t('alert.cancelled')}</div>
        <div className="mt-0.5 text-[17px] font-bold">{t('alert.cancelledOn', { d: fmtDate(race.race_date, lang) })}</div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{t('alert.cancelledText')}</p>
      </div>
    );
  }

  // 정원이 차서 이미 끝난 대회는 접수 알림이 의미 없으니 신청을 받지 않는다
  if (isSoldOut(race, today) && !opensAhead) {
    return (
      <div className="rounded-box bg-surface px-4 py-4">
        <div className="text-[13px] text-ink-3">{t('alert.soldout')}</div>
        <div className="mt-0.5 text-[17px] font-bold">{t('alert.soldoutOn', { d: fmtDate(race.sold_out_on!, lang) })}</div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{t('alert.soldoutText')}</p>
      </div>
    );
  }

  const toggle = (n: number) =>
    setDays((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => b - a)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    try {
      await subscribeAlert(email.trim(), race.id, days, lang);
      track('alert_subscribe', { race_id: race.id });
      setState('ok');
      setMsg(t('alert.ok', { email: email.trim() }));
    } catch (err) {
      setState('err');
      // 서버 오류 글은 영어일 수 있어 영어 화면에서만 그대로, 한국어 화면은 지금처럼
      setMsg(err instanceof Error ? (lang === 'en' && /[가-힣]/.test(err.message) ? t('common.tryAgain') : err.message) : t('common.tryAgain'));
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-box bg-surface px-4 py-4">
        {target ? (
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-[13px] text-ink-3">{opensAhead ? t('alert.opens') : t('alert.closes')}</div>
              <div className="mt-0.5 text-[17px] font-bold">{fmtDate(target, lang)}</div>
            </div>
            {d != null && d >= 0 && <div className="num text-[34px] font-bold leading-none">D-{d}</div>}
          </div>
        ) : (
          <p className="text-[15px] text-ink-2">{t('alert.tbd')}</p>
        )}
      </div>

      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">{t('alert.when')}</legend>
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map((n) => {
              const on = days.includes(n);
              return (
                <button
                  type="button"
                  key={n}
                  aria-pressed={on}
                  onClick={() => toggle(n)}
                  className={`num h-11 min-w-14 sm:h-9 rounded-ctl px-3 text-[17px] font-semibold transition active:translate-y-px ${
                    on ? 'bg-ink text-bg' : 'bg-surface text-ink-2 hover:bg-sunken'
                  }`}
                >
                  D-{n}
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field label={t('alert.email')}>
          <div className="flex gap-2">
            <Input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
            <Button type="submit" disabled={state === 'busy' || !days.length}>
              {state === 'busy' ? t('common.saving') : t('alert.submit')}
            </Button>
          </div>
        </Field>

        {state === 'ok' && <Note tone="ok">{msg}</Note>}
        {state === 'err' && <Note tone="error">{msg}</Note>}
      </form>
    </div>
  );
}
