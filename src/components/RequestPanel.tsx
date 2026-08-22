import { useEffect, useState } from 'react';
import { loadRaceRequests, submitRaceRequest, adminResolveRequest, type RaceRequest } from '../lib/data';
import { useAuth } from '../lib/auth';

const STATUS_META: Record<RaceRequest['status'], { label: string; cls: string }> = {
  pending: { label: '검토 대기', cls: 'bg-sky-500/15 text-sky-300' },
  added: { label: '등록 완료', cls: 'bg-emerald-500/15 text-emerald-300' },
  rejected: { label: '보류', cls: 'bg-zinc-700 text-zinc-400' },
  duplicate: { label: '이미 있음', cls: 'bg-zinc-700 text-zinc-400' },
};

export default function RequestPanel({ onClose, onLogin }: { onClose: () => void; onLogin: () => void }) {
  const { session, profile } = useAuth();
  const [list, setList] = useState<RaceRequest[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [month, setMonth] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');

  const reload = () =>
    loadRaceRequests()
      .then(setList)
      .catch((e) => {
        setErr(e instanceof Error ? e.message : String(e));
        setList([]);
      });

  useEffect(() => {
    reload();
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', h);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!session) return onLogin();
    if (name.trim().length < 2) return setErr('대회 이름을 입력해 주세요.');
    setBusy(true);
    try {
      await submitRaceRequest(
        { race_name: name, country, race_month: month, url, note },
        session.user.id,
        profile?.nickname ?? '러너',
      );
      setMsg('요청을 접수했습니다. 매주 정보 갱신 때 확인해서 반영합니다.');
      setName('');
      setCountry('');
      setMonth('');
      setUrl('');
      setNote('');
      reload();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '요청 저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-zinc-800 bg-zinc-950 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 p-5">
          <div>
            <h2 className="text-xl font-bold text-zinc-50">찾는 대회가 없나요?</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">
              보고 싶은 대회를 알려주시면 매주 돌아가는 정보 갱신 작업이 확인해서 목록에 넣습니다.
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-2 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200" aria-label="닫기">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <form onSubmit={submit} className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <F label="대회 이름 *" value={name} onChange={setName} placeholder="예: 시드니 하프마라톤" wide />
              <F label="국가 / 지역" value={country} onChange={setCountry} placeholder="예: 호주" />
              <F label="대략 시기" type="month" value={month} onChange={setMonth} />
              <F label="공식 홈페이지" value={url} onChange={setUrl} placeholder="https://" wide />
              <F label="남길 말" value={note} onChange={setNote} placeholder="선택" wide />
            </div>

            {err && <p className="text-sm text-rose-400">{err}</p>}
            {msg && <p className="text-sm text-emerald-400">{msg}</p>}

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-40"
              >
                {busy ? '보내는 중…' : session ? '요청 보내기' : '로그인하고 요청하기'}
              </button>
              {!session && <span className="text-xs text-zinc-600">장난 요청을 막기 위해 로그인이 필요합니다</span>}
            </div>
          </form>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-zinc-300">요청 목록</h3>
            {list === null ? (
              <p className="text-sm text-zinc-600">불러오는 중…</p>
            ) : list.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
                아직 요청이 없습니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {list.map((r) => (
                  <li key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_META[r.status].cls}`}>
                        {STATUS_META[r.status].label}
                      </span>
                      <span className="text-sm font-medium text-zinc-200">{r.race_name}</span>
                      {r.country && <span className="text-xs text-zinc-500">{r.country}</span>}
                      {r.race_month && <span className="text-xs text-zinc-500">{r.race_month}</span>}
                      <span className="ml-auto text-[11px] text-zinc-600">
                        {r.nickname ?? '익명'} · {r.created_at.slice(0, 10)}
                      </span>
                    </div>
                    {r.note && <p className="mt-1.5 text-xs text-zinc-400">{r.note}</p>}
                    {r.admin_note && <p className="mt-1.5 text-xs text-emerald-400/80">↳ {r.admin_note}</p>}
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-sky-400 hover:underline">
                        공식 홈페이지 ↗
                      </a>
                    )}
                    {profile?.is_admin && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {(['added', 'duplicate', 'rejected', 'pending'] as RaceRequest['status'][]).map((s) => (
                          <button
                            key={s}
                            onClick={async () => {
                              await adminResolveRequest(r.id, s, r.admin_note);
                              reload();
                            }}
                            className={`rounded px-2 py-1 text-[11px] transition ${
                              r.status === s ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                            }`}
                          >
                            {STATUS_META[s].label}
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function F({
  label, value, onChange, placeholder, type = 'text', wide,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
      />
    </label>
  );
}
