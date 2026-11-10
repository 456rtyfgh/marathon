import { useEffect, useState } from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';
import { loadRaceRequests, submitRaceRequest, adminResolveRequest, soldOutReportRaceId, type RaceRequest } from '../lib/data';
import { useAuth } from '../lib/auth';
import { Button, CloseButton, Field, Input, Note } from './ui';
import { track } from '../lib/analytics';
import { spamReason, friendlyError } from '../lib/spam';
import { safeUrl } from '../lib/util';
import { useLang } from '../i18n';
import AdminSortBar from './AdminSortBar';
import { sortRequests, REQUEST_SORT_LABEL, REQUEST_SORT_DESC, type RequestSort } from '../lib/adminSort';

export default function RequestPanel({ onClose, onLogin }: { onClose: () => void; onLogin: () => void }) {
  const { session, profile } = useAuth();
  const { lang, t } = useLang();
  const statusLabel = (s: RaceRequest['status']) => t(`req.status.${s}` as const);
  const [list, setList] = useState<RaceRequest[] | null>(null);
  const [reportCount, setReportCount] = useState(0);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [month, setMonth] = useState('');
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  /** 관리자만 정렬을 바꾼다 (관리 화면처럼 한국어만). 일반 화면은 지금처럼 최신순 */
  const [sort, setSort] = useState<RequestSort>('status');
  const isAdmin = !!profile?.is_admin;
  const shown = list && isAdmin ? sortRequests(list, sort) : list;

  const reload = () =>
    loadRaceRequests()
      .then((rows) => {
        // 조기 마감 제보는 같은 표에 들어가지만 대회 추가 요청이 아니다 → 관리 화면 '마감 제보' 탭에서 본다
        const reports = rows.filter((r) => soldOutReportRaceId(r) != null);
        setReportCount(reports.filter((r) => r.status === 'pending').length);
        setList(rows.filter((r) => soldOutReportRaceId(r) == null));
      })
      .catch(() => setList([]));

  useEffect(() => {
    reload();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setMsg('');
    if (!session) return onLogin();
    if (name.trim().length < 2) return setErr(t('req.needName'));
    if (url && !/^https?:\/\//.test(url.trim())) return setErr(t('req.badUrl'));
    const spam = spamReason(name, lang) ?? spamReason(note, lang) ?? spamReason(country, lang);
    if (spam) return setErr(spam);
    setBusy(true);
    try {
      await submitRaceRequest({ race_name: name, country, race_month: month, url, note }, session.user.id, profile?.nickname ?? t('common.runner'));
      track('request_submit', { race_name: name.trim() });
      setMsg(t('req.ok'));
      setName('');
      setCountry('');
      setMonth('');
      setUrl('');
      setNote('');
      reload();
    } catch (e) {
      setErr(friendlyError(e, t('req.fail'), lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-6 sm:px-7">
        <div className="pt-1">
          <h2 className="text-[28px] leading-tight font-extrabold tracking-tight sm:text-[32px]">{t('req.title')}</h2>
          <p className="mt-2 max-w-[46ch] text-[15px] leading-relaxed text-ink-2">{t('req.lead')}</p>
        </div>
        <CloseButton onClick={onClose} />
      </header>

      <div className="flex-1 space-y-10 overflow-y-auto px-5 pb-10 sm:px-7">
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label={t('req.name')} wide>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('req.namePh')} required />
          </Field>
          <Field label={t('req.country')}>
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder={t('req.countryPh')} />
          </Field>
          <Field label={t('req.month')} hint={t('req.monthHint')}>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </Field>
          <Field label={t('req.url')} hint={t('common.optional')} wide>
            <Input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </Field>
          <Field label={t('req.note')} hint={t('common.optional')} wide>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </Field>

          <div className="space-y-3 sm:col-span-2">
            {err && <Note tone="error">{err}</Note>}
            {msg && <Note tone="ok">{msg}</Note>}
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={busy}>
                {busy ? t('common.sending') : session ? t('req.send') : t('req.loginSend')}
              </Button>
              {!session && <span className="text-[15px] sm:text-[13px] text-ink-3">{t('req.loginWhy')}</span>}
            </div>
          </div>
        </form>

        <section>
          <h3 className="text-[17px] font-bold">
            {t('req.list')} <span className="num ml-1 text-[17px] text-ink-3">{list?.length ?? 0}</span>
          </h3>
          {profile?.is_admin && reportCount > 0 && (
            <p className="mt-1 text-[15px] sm:text-[13px] text-ink-3">
              {t('req.reportsPre')}
              <span className="num">{reportCount}</span>
              {t('req.reportsPost')}
            </p>
          )}
          {isAdmin && shown && shown.length > 1 && (
            <div className="mt-3">
              <AdminSortBar
                label="대회 추가 요청"
                value={sort}
                onChange={setSort}
                options={(Object.keys(REQUEST_SORT_LABEL) as RequestSort[]).map((k) => [k, REQUEST_SORT_LABEL[k]])}
                desc={REQUEST_SORT_DESC[sort]}
              />
            </div>
          )}
          {shown === null ? (
            <div className="mt-3 h-16 animate-pulse rounded-box bg-surface" />
          ) : shown.length === 0 ? (
            <p className="mt-2 text-[15px] text-ink-3">{t('req.empty')}</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {shown.map((r) => (
                <li key={r.id} className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="line-clamp-2 min-w-0 text-[15px] leading-snug font-semibold">
                      {r.race_name}
                      {/* 이름 뒤 여백은 공백 글자로: 다음 줄로 넘어가도 들여쓰기가 생기지 않는다 */}
                      {(r.country || r.race_month) && (
                        <>
                          {' '}
                          <span className="font-normal whitespace-nowrap text-ink-3">{[r.country, r.race_month].filter(Boolean).join(', ')}</span>
                        </>
                      )}
                    </span>
                    <span
                      className={`inline-flex h-5 shrink-0 items-center rounded-tag px-2 text-[12px] font-bold whitespace-nowrap ${
                        r.status === 'added' ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2'
                      }`}
                    >
                      {statusLabel(r.status)}
                    </span>
                  </div>
                  <div className="mt-1 text-[13px] text-ink-3">
                    {r.nickname ?? t('common.anonymous')}, <span className="num">{r.created_at.slice(0, 10)}</span>
                  </div>
                  {r.note && <p className="mt-1 text-[15px] text-ink-2">{r.note}</p>}
                  {r.admin_note && <p className="mt-1 text-[15px] text-ink">{t('req.answer', { a: r.admin_note })}</p>}
                  {r.url && r.status !== 'added' && !profile?.is_admin ? (
                    // 승인 전 요청의 주소는 누르는 링크로 두지 않는다 — 도메인 글자만
                    hostOf(r.url) && (
                      <span className="-my-2 inline-flex min-h-11 items-center text-[13px] text-ink-2">{hostOf(r.url)}</span>
                    )
                  ) : r.url && (
                    <a
                      href={safeUrl(r.url)}
                      target="_blank"
                      rel="noreferrer"
                      className="-my-2 inline-flex min-h-11 items-center gap-1 text-[13px] text-ink-2 underline underline-offset-4"
                    >
                      {t('common.homepage')} <ArrowUpRight size={12} />
                    </a>
                  )}
                  {profile?.is_admin && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(['added', 'duplicate', 'rejected', 'pending'] as RaceRequest['status'][]).map((s) => (
                        <button
                          key={s}
                          onClick={async () => {
                            await adminResolveRequest(r.id, s, r.admin_note);
                            reload();
                          }}
                          aria-pressed={r.status === s}
                          // 지금 상태는 테두리로 (검정으로 꽉 채우지 않는다)
                          className={`h-11 rounded-ctl px-3 text-[13px] font-semibold whitespace-nowrap transition sm:h-8 ${
                            r.status === s ? 'bg-surface text-ink ring-[1.5px] ring-ink ring-inset' : 'bg-sunken text-ink-2 hover:bg-line'
                          }`}
                        >
                          {statusLabel(s)}
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

/** 링크로 만들지 않을 주소의 도메인 글자 (형식이 틀리면 빈 문자열) */
function hostOf(url: string): string {
  const u = safeUrl(url);
  return u ? new URL(u).hostname : '';
}
