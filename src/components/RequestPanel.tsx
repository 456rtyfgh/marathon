import { useEffect, useState } from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';
import { loadRaceRequests, submitRaceRequest, adminResolveRequest, type RaceRequest } from '../lib/data';
import { useAuth } from '../lib/auth';
import { Button, CloseButton, Field, Input, Note } from './ui';

const STATUS_LABEL: Record<RaceRequest['status'], string> = {
  pending: '확인 전',
  added: '추가됨',
  rejected: '보류',
  duplicate: '이미 있음',
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
      .catch(() => setList([]));

  useEffect(() => {
    reload();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!session) return onLogin();
    if (name.trim().length < 2) return setErr('대회 이름을 적어주세요.');
    if (url && !/^https?:\/\//.test(url.trim())) return setErr('홈페이지 주소는 http 또는 https 로 시작해야 합니다.');
    setBusy(true);
    try {
      await submitRaceRequest({ race_name: name, country, race_month: month, url, note }, session.user.id, profile?.nickname ?? '러너');
      setMsg('받았습니다. 매주 월요일 정보를 갱신할 때 확인해서 넣을게요.');
      setName('');
      setCountry('');
      setMonth('');
      setUrl('');
      setNote('');
      reload();
    } catch {
      setErr('요청을 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-5 sm:px-7">
        <div className="pt-1.5">
          <h2 className="text-[26px] leading-tight font-extrabold tracking-tight">대회 추가 요청</h2>
          <p className="mt-1.5 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">
            목록에 없는 대회를 알려주세요. 매주 월요일 일정을 확인하면서 함께 넣습니다.
          </p>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      <div className="flex-1 space-y-10 overflow-y-auto px-5 pb-10 sm:px-7">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="대회 이름" wide>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 시드니 하프마라톤" required />
          </Field>
          <Field label="나라나 지역">
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="예: 호주" />
          </Field>
          <Field label="대략 언제" hint="모르면 비워두세요">
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Field label="공식 홈페이지" hint="선택" wide>
            <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </Field>
          <Field label="남길 말" hint="선택" wide>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>

          <div className="space-y-3 sm:col-span-2">
            {err && <Note tone="error">{err}</Note>}
            {msg && <Note tone="ok">{msg}</Note>}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? '보내는 중' : session ? '요청 보내기' : '로그인하고 요청하기'}
              </Button>
              {!session && <span className="text-[13px] text-ink-3">장난 요청을 막으려고 로그인이 필요합니다</span>}
            </div>
          </div>
        </form>

        <section>
          <h3 className="text-[15px] font-bold">
            들어온 요청 <span className="num ml-1 text-[17px] text-ink-3">{list?.length ?? 0}</span>
          </h3>
          {list === null ? (
            <div className="mt-3 h-16 animate-pulse rounded-box bg-surface" />
          ) : list.length === 0 ? (
            <p className="mt-2 text-[14px] text-ink-3">아직 요청이 없습니다. 첫 요청을 남겨주세요.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {list.map((r) => (
                <li key={r.id} className="py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-[15px] font-semibold">
                      {r.race_name}
                      {(r.country || r.race_month) && (
                        <span className="ml-2 font-normal text-ink-3">{[r.country, r.race_month].filter(Boolean).join(', ')}</span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 rounded-tag px-1.5 py-0.5 text-[12px] font-bold ${
                        r.status === 'added' ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2'
                      }`}
                    >
                      {STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[13px] text-ink-3">
                    {r.nickname ?? '익명'}, <span className="num text-[14px]">{r.created_at.slice(0, 10)}</span>
                  </div>
                  {r.note && <p className="mt-1 text-[14px] text-ink-2">{r.note}</p>}
                  {r.admin_note && <p className="mt-1 text-[14px] text-ink">답변: {r.admin_note}</p>}
                  {r.url && (
                    <a href={r.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[13px] text-ink-2 underline underline-offset-4">
                      홈페이지 <ArrowUpRight size={12} />
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
                          className={`h-7 rounded-ctl px-2.5 text-[12px] font-semibold transition ${
                            r.status === s ? 'bg-ink text-bg' : 'bg-sunken text-ink-2 hover:bg-line'
                          }`}
                        >
                          {STATUS_LABEL[s]}
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
  );
}
