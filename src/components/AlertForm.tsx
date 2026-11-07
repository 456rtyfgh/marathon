import { useState } from 'react';
import type { Race } from '../lib/types';
import { subscribeAlert } from '../lib/data';
import { useAuth } from '../lib/auth';
import { daysBetween, TODAY, fmtDate, isSoldOut, isCancelled } from '../lib/util';
import { Button, Field, Input, Note } from './ui';
import { track } from '../lib/analytics';

const OPTIONS = [30, 14, 7, 3, 1];

export default function AlertForm({ race }: { race: Race }) {
  const { session } = useAuth();
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [days, setDays] = useState<number[]>([14, 3]);
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  const today = TODAY();
  const opensAhead = race.entry_opens && daysBetween(today, race.entry_opens) > 0;
  const target = opensAhead ? race.entry_opens : race.entry_closes ?? race.entry_opens;
  const d = target ? daysBetween(today, target) : null;

  // 취소된 대회는 상세에서 알림 탭을 숨기지만, 다른 경로로 열려도 신청을 받지 않는다
  if (isCancelled(race)) {
    return (
      <div className="rounded-box bg-surface px-4 py-4">
        <div className="text-[13px] text-ink-3">대회 취소</div>
        <div className="mt-0.5 text-[17px] font-bold">{fmtDate(race.race_date)} 대회 취소</div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          취소된 대회라 알림을 받을 수 없습니다. 환불 안내는 공식 홈페이지에서 확인하세요.
        </p>
      </div>
    );
  }

  // 정원이 차서 이미 끝난 대회는 접수 알림이 의미 없으니 신청을 받지 않는다
  if (isSoldOut(race, today) && !opensAhead) {
    return (
      <div className="rounded-box bg-surface px-4 py-4">
        <div className="text-[13px] text-ink-3">조기 마감</div>
        <div className="mt-0.5 text-[17px] font-bold">{fmtDate(race.sold_out_on!)} 정원 마감</div>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-2">
          이번 회차 접수가 끝나 알림을 받을 수 없습니다. 취소분 추가 접수는 공식 홈페이지에서 확인하세요.
        </p>
      </div>
    );
  }

  const toggle = (n: number) =>
    setDays((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => b - a)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    try {
      await subscribeAlert(email.trim(), race.id, days);
      track('alert_subscribe', { race_id: race.id });
      setState('ok');
      setMsg(`${email.trim()} 로 알려 드립니다.`);
    } catch (err) {
      setState('err');
      setMsg(err instanceof Error ? err.message : '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-box bg-surface px-4 py-4">
        {target ? (
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="text-[13px] text-ink-3">{opensAhead ? '접수 시작일' : '접수 마감일'}</div>
              <div className="mt-0.5 text-[17px] font-bold">{fmtDate(target)}</div>
            </div>
            {d != null && d >= 0 && <div className="num text-[34px] font-bold leading-none">D-{d}</div>}
          </div>
        ) : (
          <p className="text-[15px] text-ink-2">접수 일정이 아직 나오지 않았습니다. 공개되면 알려 드립니다.</p>
        )}
      </div>

      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">알림 시점</legend>
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

        <Field label="받을 이메일">
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
              {state === 'busy' ? '저장 중' : '알림 받기'}
            </Button>
          </div>
        </Field>

        {state === 'ok' && <Note tone="ok">{msg}</Note>}
        {state === 'err' && <Note tone="error">{msg}</Note>}
      </form>
    </div>
  );
}
