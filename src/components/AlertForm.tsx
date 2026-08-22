import { useState } from 'react';
import type { Race } from '../lib/types';
import { subscribeAlert } from '../lib/data';
import { hasSupabase } from '../lib/supabase';
import { daysBetween, TODAY, fmtDate } from '../lib/util';

const OPTIONS = [30, 14, 7, 3, 1];

export default function AlertForm({ race }: { race: Race }) {
  const [email, setEmail] = useState('');
  const [days, setDays] = useState<number[]>([14, 3]);
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'err'>('idle');
  const [msg, setMsg] = useState('');

  const today = TODAY();
  const target = race.entry_closes ?? race.entry_opens;
  const d = target ? daysBetween(today, target) : null;

  const toggle = (n: number) =>
    setDays((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => b - a)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('busy');
    try {
      await subscribeAlert(email.trim(), race.id, days);
      setState('ok');
      setMsg('알림 신청이 저장됐습니다.');
    } catch (err) {
      setState('err');
      setMsg(err instanceof Error ? err.message : '저장에 실패했습니다.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="text-xs text-zinc-500">알림 기준일</div>
        {target ? (
          <>
            <div className="mt-1 text-lg font-semibold text-zinc-100">
              {race.entry_closes ? '신청 마감' : '신청 오픈'} · {fmtDate(target)}
            </div>
            <div className="mt-0.5 text-sm text-zinc-400">
              {d != null && (d >= 0 ? `오늘 기준 D-${d}` : `${-d}일 지남`)}
            </div>
          </>
        ) : (
          <div className="mt-1 text-sm text-amber-400">신청 일정이 아직 공개되지 않았습니다.</div>
        )}
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <span className="mb-2 block text-xs font-medium text-zinc-400">며칠 전에 받을까요?</span>
          <div className="flex flex-wrap gap-2">
            {OPTIONS.map((n) => (
              <button
                type="button"
                key={n}
                onClick={() => toggle(n)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  days.includes(n)
                    ? 'bg-emerald-500 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                D-{n}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={state === 'busy' || !days.length}
            className="shrink-0 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-40"
          >
            {state === 'busy' ? '저장 중…' : '알림 신청'}
          </button>
        </div>

        {state === 'ok' && <p className="text-sm text-emerald-400">{msg}</p>}
        {state === 'err' && <p className="text-sm text-rose-400">{msg}</p>}
        {!hasSupabase && (
          <p className="text-xs text-amber-400/80">
            Supabase 환경변수가 설정되지 않아 알림 저장이 비활성 상태입니다.
          </p>
        )}
      </form>
    </div>
  );
}
