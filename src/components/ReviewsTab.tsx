import { useEffect, useState } from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';
import type { Race, Review, ExternalReview } from '../lib/types';
import { useLang } from '../i18n';
import { loadReviews, loadExternalReviews, saveReview, deleteReview } from '../lib/data';
import { useAuth } from '../lib/auth';
import { hasSupabase } from '../lib/supabase';
import StarRating from './StarRating';
import { Button, Field, Input, Note, TimeInput, inputCls } from './ui';
import { track } from '../lib/analytics';
import { spamReason, friendlyError } from '../lib/spam';
import { safeUrl } from '../lib/util';

export default function ReviewsTab({ race, onLogin }: { race: Race; onLogin: () => void }) {
  const { session, profile } = useAuth();
  const { t } = useLang();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [ext, setExt] = useState<ExternalReview[]>([]);
  // 불러오기 실패 (문구는 화면 언어로 그릴 때 정한다)
  const [loadFailed, setLoadFailed] = useState(false);
  const [writing, setWriting] = useState(false);

  // 글쓴이 id 는 로그인했을 때만 받는다 → 로그인 상태가 바뀌면 다시 받는다
  const signedIn = !!session;
  const reload = () => {
    if (!hasSupabase) {
      setReviews([]);
      return;
    }
    Promise.all([loadReviews(race.id, signedIn), loadExternalReviews(race.id)])
      .then(([r, e]) => {
        setReviews(r);
        setExt(e);
      })
      .catch(() => {
        setLoadFailed(true);
        setReviews([]);
      });
  };

  useEffect(reload, [race.id, signedIn]);

  const mine = (session && reviews?.find((r) => r.user_id === session.user.id)) || null;
  const avg = reviews?.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          {avg ? (
            <>
              <div className="num text-[40px] leading-none font-bold">{avg.toFixed(1)}</div>
              <div className="mt-2">
                <StarRating value={avg} size={16} />
              </div>
            </>
          ) : (
            <p className="text-[15px] text-ink-2">{t('rev.none')}</p>
          )}
        </div>
        {session ? (
          <Button tone={writing ? 'quiet' : 'primary'} onClick={() => setWriting((v) => !v)}>
            {writing ? t('common.close') : mine ? t('rev.edit') : t('rev.write')}
          </Button>
        ) : (
          <Button onClick={onLogin}>{t('rev.loginToWrite')}</Button>
        )}
      </div>

      {loadFailed && <Note tone="error">{t('rev.loadFail')}</Note>}

      {writing && session && (
        <ReviewForm
          race={race}
          existing={mine}
          nickname={profile?.nickname ?? t('common.runner')}
          userId={session.user.id}
          onDone={() => {
            setWriting(false);
            reload();
          }}
        />
      )}

      {reviews === null ? (
        <div className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-box bg-surface" />
          ))}
        </div>
      ) : (
        reviews.length > 0 && (
          <ul className="divide-y divide-line">
            {reviews.map((r) => (
              <li key={r.id} className="py-5 first:pt-0">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StarRating value={r.rating} size={14} />
                  <span className="text-[15px] font-bold">{r.nickname}</span>
                  <span className="text-[13px] text-ink-3">
                    {r.race_year ? t('rev.year', { y: r.race_year }) : ''}
                    {r.finish_time ? t('rev.time', { t: r.finish_time }) : ''}
                  </span>
                  <span className="num ml-auto text-[13px] text-ink-3">{r.created_at.slice(0, 10)}</span>
                </div>
                <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed whitespace-pre-wrap text-ink-2">{r.body}</p>
                {(r.course_rating || r.support_rating || r.value_rating) && (
                  <p className="mt-2 text-[15px] sm:text-[13px] text-ink-3">
                    {[
                      r.course_rating != null && t('rev.course', { n: r.course_rating }),
                      r.support_rating != null && t('rev.support', { n: r.support_rating }),
                      r.value_rating != null && t('rev.value', { n: r.value_rating }),
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
                {((session && r.user_id === session.user.id) || profile?.is_admin) && (
                  <button
                    onClick={async () => {
                      await deleteReview(r.id);
                      reload();
                    }}
                    className="-mb-3 mt-2 inline-flex min-h-11 items-center text-[13px] text-ink-3 underline underline-offset-4 transition hover:text-ink"
                  >
                    {t('rev.delete')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      <section>
        <h3 className="text-[17px] font-bold">{t('rev.extTitle')}</h3>
        <p className="mt-1 text-[15px] sm:text-[13px] text-ink-3">{t('rev.extHelp')}</p>
        {ext.length === 0 ? (
          <p className="mt-3 text-[15px] text-ink-3">{t('rev.extNone')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {ext.map((e) => (
              <li key={e.id}>
                <a
                  href={safeUrl(e.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-start justify-between gap-4 rounded-box bg-surface px-4 py-3 transition hover:bg-sunken"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] text-ink-3">
                      {t(`kind.${e.kind}` as const)}, {e.source}
                      {e.author && `, ${e.author}`}
                    </span>
                    <span className="mt-1 block text-[15px] font-semibold text-ink">{e.title}</span>
                    {e.summary && <span className="mt-1 block text-[15px] sm:text-[13px] text-ink-2">{e.summary}</span>}
                  </span>
                  <ArrowUpRight size={16} className="mt-1 shrink-0 text-ink-3 group-hover:text-ink" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ReviewForm({
  race,
  existing,
  nickname,
  userId,
  onDone,
}: {
  race: Race;
  existing: Review | null;
  nickname: string;
  userId: string;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [year, setYear] = useState(existing?.race_year?.toString() ?? '');
  const [time, setTime] = useState(existing?.finish_time ?? '');
  const [body, setBody] = useState(existing?.body ?? '');
  const [course, setCourse] = useState(existing?.course_rating ?? 0);
  const [support, setSupport] = useState(existing?.support_rating ?? 0);
  const [value, setValue] = useState(existing?.value_rating ?? 0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const { lang, t } = useLang();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setErr(t('rev.needRating'));
    if (body.trim().length < 10) return setErr(t('rev.tooShort'));
    const spam = spamReason(body, lang) ?? spamReason(time, lang);
    if (spam) return setErr(spam);
    setBusy(true);
    setErr('');
    try {
      await saveReview(
        {
          race_id: race.id,
          rating,
          race_year: year ? Number(year) : null,
          finish_time: time.trim() || null,
          body: body.trim(),
          course_rating: course || null,
          support_rating: support || null,
          value_rating: value || null,
        },
        userId,
        nickname,
      );
      track('review_submit', { race_id: race.id });
      onDone();
    } catch (e) {
      setErr(friendlyError(e, t('common.tryAgain'), lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-box bg-surface p-4 sm:p-5">
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">{t('rev.overall')}</legend>
        <StarRating value={rating} onChange={setRating} size={28} />
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('rev.yearLabel')}>
          <Input type="number" inputMode="numeric" min={1990} max={2100} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
        </Field>
        <Field label={t('rev.timeLabel')} hint={t('common.optional')}>
          <TimeInput value={time} onChange={setTime} />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold text-ink-2">
          {t('rev.detail')} <span className="font-normal text-ink-3">{t('common.optional')}</span>
        </legend>
        <StarRating value={course} onChange={setCourse} size={18} label={t('rev.courseLabel')} />
        <StarRating value={support} onChange={setSupport} size={18} label={t('rev.supportLabel')} />
        <StarRating value={value} onChange={setValue} size={18} label={t('rev.valueLabel')} />
      </fieldset>

      <Field label={t('rev.body')} hint={`${body.length}/3000`}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={3000}
          placeholder={t('rev.placeholder')}
          className={`${inputCls} resize-y py-3 leading-relaxed`}
        />
      </Field>

      {err && <Note tone="error">{err}</Note>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? t('common.saving') : existing ? t('rev.saveEdit') : t('rev.post')}
        </Button>
        <span className="text-[13px] text-ink-3">{t('rev.postedAs', { name: nickname })}</span>
      </div>
    </form>
  );
}
