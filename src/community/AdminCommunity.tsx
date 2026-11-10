/**
 * 관리 화면 '커뮤니티' 탭 (한국어만 — 기존 관리 화면과 같다): 신고함(대상 미리보기·사유 개수·설명, 숨김·복구·삭제·임시조치·기각,
 * 작성자 정지 1일·7일·영구·해제)과 금칙어 추가·삭제. 서버 RPC 는 첫 줄에서 관리자인지 다시 확인한다.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { REPORT_REASONS, type ReportReason } from '../lib/communityTypes';
import { Button, Input, Note } from '../components/ui';
import { adminAction, adminBan, adminReports, adminWordAdd, adminWordRemove, adminWords, type AdminAction, type AdminReportRow } from './api';

const REASON: Record<ReportReason, string> = { spam: '광고·도배', abuse: '욕설·비방', privacy: '개인정보', rights: '권리 침해', other: '기타' };
const ACTION: Record<AdminAction, string> = { hide: '숨김', restore: '복구', delete: '삭제', temp_hide: '임시조치 30일', dismiss: '기각' };

const dt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', year: '2-digit', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '';
const msg = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

function statusText(r: AdminReportRow): string {
  if (r.status === 'deleted') return '삭제됨';
  if (r.status === 'visible') return '보이는 중';
  if (r.hidden_reason === 'rights') {
    const over = r.hidden_until && Date.parse(r.hidden_until) < Date.now();
    return over ? `임시조치 기한 지남 (${dt(r.hidden_until)})` : `임시조치 중 (~${dt(r.hidden_until)})`;
  }
  return r.hidden_reason === 'reports' ? '신고 3건 자동 숨김' : '숨김';
}

function banText(until: string | null): string | null {
  if (!until) return null;
  if (until === 'infinity' || !Number.isFinite(Date.parse(until))) return '영구 정지';
  return Date.parse(until) > Date.now() ? `${dt(until)}까지 정지` : null;
}

/** 정지 버튼: 1일·7일·영구, 정지 중이면 해제도 */
const banOptions = (banned: boolean): [1 | 7 | 0 | null, string][] => [[1, '1일'], [7, '7일'], [null, '영구'], ...(banned ? ([[0, '해제']] as [0, string][]) : [])];

export default function AdminCommunity() {
  const [view, setView] = useState<'reports' | 'words'>('reports');
  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="커뮤니티 관리" className="inline-flex rounded-ctl bg-sunken p-1">
        {(
          [
            ['reports', '신고함'],
            ['words', '금칙어'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            role="tab"
            aria-selected={view === v}
            onClick={() => setView(v)}
            className={`h-11 rounded-[4px] px-4 text-[15px] font-semibold transition-colors sm:h-8 ${
              view === v ? 'bg-surface text-ink shadow-[0_1px_2px_var(--shadow)]' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {view === 'reports' ? <Reports /> : <Words />}
    </div>
  );
}

function Reports() {
  const [rows, setRows] = useState<AdminReportRow[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = () =>
    adminReports()
      .then((r) => {
        setRows(r);
        setErr('');
      })
      .catch((e) => setErr(msg(e)));
  useEffect(() => {
    load();
  }, []);

  const run = async (key: string, f: () => Promise<void>) => {
    setBusy(key);
    try {
      await f();
      await load();
    } catch (e) {
      setErr(msg(e));
    } finally {
      setBusy(null);
    }
  };

  if (err && !rows) return <Note tone="error">{err}</Note>;
  if (!rows) return <p className="text-[15px] text-ink-3">불러오는 중</p>;

  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-ink-2">
        처리할 신고 <strong className="num text-[17px] text-ink">{rows.length}</strong>건. 신고가 3건 쌓이면 자동으로 숨겨지고, 여기서 복구하거나 지웁니다. 권리 침해
        신고는 ‘임시조치 30일’로 가려 두고 작성자의 이의를 받습니다.
      </p>
      {err && <Note tone="error">{err}</Note>}
      {rows.length === 0 ? (
        <p className="rounded-box border border-line bg-surface px-4 py-6 text-center text-[15px] text-ink-3">새 신고가 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const key = `${r.target_type}:${r.target_id}`;
            const ban = banText(r.banned_until);
            const actions: AdminAction[] =
              r.status === 'visible' ? ['hide', 'temp_hide', 'delete', 'dismiss'] : r.status === 'hidden' ? ['restore', 'delete', 'dismiss'] : ['dismiss'];
            return (
              <li key={key} className="rounded-box border border-line bg-surface px-4 py-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                  <span className="inline-flex h-6 items-center rounded-tag border border-line px-2 font-semibold">{r.target_type === 'post' ? '글' : '댓글'}</span>
                  <span className="font-semibold text-ink-2">{statusText(r)}</span>
                  <span className="text-ink-3">· 신고 {r.count}건 · 마지막 {dt(r.last_at)}</span>
                </div>
                {/* 댓글이면 서버가 원글 제목을 준다 → 맥락으로만 작게 */}
                {r.title &&
                  (r.target_type === 'comment' ? (
                    <p className="mt-2 text-[13px] text-ink-3 [overflow-wrap:anywhere]">글: {r.title}</p>
                  ) : (
                    <p className="mt-2 text-[16px] leading-snug font-bold [overflow-wrap:anywhere]">{r.title}</p>
                  ))}
                {r.body ? (
                  <p className="mt-1 line-clamp-4 text-[15px] leading-relaxed whitespace-pre-wrap text-ink-2 [overflow-wrap:anywhere]">{r.body}</p>
                ) : (
                  r.status === 'deleted' && <p className="mt-1 text-[15px] text-ink-3">(지운 내용)</p>
                )}
                <p className="mt-2 text-[13px] text-ink-3">
                  작성자 <span className="font-semibold text-ink-2">{r.nickname ?? '(알 수 없음)'}</span>
                  {ban && <span className="ml-2 font-semibold text-ink">{ban}</span>}
                </p>
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px] text-ink-2">
                  {REPORT_REASONS.filter((x) => r.reasons[x]).map((x) => (
                    <span key={x}>
                      {REASON[x]} <span className="num font-semibold">{r.reasons[x]}</span>
                    </span>
                  ))}
                </p>
                {r.notes.length > 0 && (
                  <ul className="mt-2 space-y-1 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-ink-2">
                    {r.notes.map((n, i) => (
                      <li key={i} className="[overflow-wrap:anywhere]">
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {actions.map((a) => (
                    <Button
                      key={a}
                      size="sm"
                      tone={a === 'delete' ? 'danger' : 'quiet'}
                      disabled={busy !== null}
                      onClick={() => {
                        if (a === 'delete' && !confirm('이 대상을 지울까요? 제목·본문이 비워지고 되돌릴 수 없습니다.')) return;
                        run(key, () => adminAction(r.target_type, r.target_id, a));
                      }}
                    >
                      {busy === key ? '처리 중' : ACTION[a]}
                    </Button>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <span className="mr-1 text-[13px] font-semibold text-ink-3">작성자 정지</span>
                  {banOptions(!!ban).map(([days, label]) => (
                    <Button
                      key={label}
                      size="sm"
                      tone="quiet"
                      disabled={busy !== null}
                      onClick={() => {
                        if (days === null && !confirm(`${r.nickname ?? '이 회원'} 님의 글쓰기를 영구 정지할까요?`)) return;
                        run(`ban:${key}`, () => adminBan(r.user_id, days));
                      }}
                    >
                      {busy === `ban:${key}` ? '처리 중' : label}
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Words() {
  const [words, setWords] = useState<string[] | null>(null);
  const [word, setWord] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () =>
    adminWords()
      .then((w) => {
        setWords(w);
        setErr('');
      })
      .catch((e) => setErr(msg(e)));
  useEffect(() => {
    load();
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const w = word.trim().toLowerCase();
    if (!w || w.length > 40) return setErr('금칙어는 1~40자로 넣어 주세요.');
    setBusy(true);
    try {
      await adminWordAdd(w);
      setWord('');
      await load();
    } catch (e2) {
      setErr(msg(e2));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-ink-2">
        이 단어가 들어간 러닝톡 글·댓글은 올릴 수 없습니다(대소문자 구분 없음). 도박·대출·전화번호 같은 기본 광고 규칙은 따로 늘 적용됩니다.
      </p>
      <form onSubmit={add} className="flex gap-2">
        <Input value={word} onChange={(e) => setWord(e.target.value)} maxLength={40} placeholder="추가할 단어" aria-label="추가할 금칙어" />
        <Button type="submit" disabled={busy || !word.trim()}>
          추가
        </Button>
      </form>
      {err && <Note tone="error">{err}</Note>}
      {!words ? (
        !err && <p className="text-[15px] text-ink-3">불러오는 중</p>
      ) : words.length === 0 ? (
        <p className="text-[15px] text-ink-3">등록한 금칙어가 없습니다.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {words.map((w) => (
            <li key={w} className="inline-flex h-11 items-center gap-1 rounded-ctl border border-line bg-surface pl-3 text-[15px] sm:h-9">
              <span className="[overflow-wrap:anywhere]">{w}</span>
              <button
                type="button"
                disabled={busy}
                aria-label={`${w} 지우기`}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await adminWordRemove(w);
                    await load();
                  } catch (e) {
                    setErr(msg(e));
                  } finally {
                    setBusy(false);
                  }
                }}
                className="grid h-full w-10 place-items-center rounded-ctl text-ink-3 hover:bg-sunken hover:text-ink"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
