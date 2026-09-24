import { useState } from 'react';
import type { Race } from '../lib/types';
import { subscribeAlert } from '../lib/data';
import { useAuth } from '../lib/auth';
import { daysBetween, TODAY, fmtDate } from '../lib/util';
import { Button, Field, Input, Note } from './ui';

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

  const toggle = (n: number) =>
    setDays((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => b - a)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    try {
      await subscribeAlert(email.trim(), race.id, days);
      setState('ok');
      setMsg(`${email.trim()} 로 알려드릴게요.`);
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
          <p className="text-[15px] text-ink-2">접수 일정이 아직 나오지 않았습니다. 공개되면 알려드릴게요.</p>
        )}
      </div>

      <form onSubmit={submit} className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-2">며칠 전에 받을까요</legend>
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map((n) => {
              const on = days.includes(n);
              return (
                <button
                  type="button"
                  key={n}
                  aria-pressed={on}
                  onClick={() => toggle(n)}
                  className={`num h-9 min-w-14 rounded-ctl px-3 text-[17px] font-semibold transition active:translate-y-px ${
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
