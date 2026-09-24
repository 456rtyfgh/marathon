import { useEffect, useState } from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';
import type { Race, Review, ExternalReview } from '../lib/types';
import { KIND_LABEL } from '../lib/types';
import { loadReviews, loadExternalReviews, saveReview, deleteReview } from '../lib/data';
import { useAuth } from '../lib/auth';
import { hasSupabase } from '../lib/supabase';
import StarRating from './StarRating';
import { Button, Field, Input, Note, inputCls } from './ui';

export default function ReviewsTab({ race, onLogin }: { race: Race; onLogin: () => void }) {
  const { session, profile } = useAuth();
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [ext, setExt] = useState<ExternalReview[]>([]);
  const [err, setErr] = useState('');
  const [writing, setWriting] = useState(false);

  const reload = () => {
    if (!hasSupabase) {
      setReviews([]);
      return;
    }
    Promise.all([loadReviews(race.id), loadExternalReviews(race.id)])
      .then(([r, e]) => {
        setReviews(r);
        setExt(e);
      })
      .catch(() => {
        setErr('후기를 불러오지 못했습니다. 잠시 뒤 다시 열어주세요.');
        setReviews([]);
      });
  };

  useEffect(reload, [race.id]);

  const mine = reviews?.find((r) => r.user_id === session?.user.id) ?? null;
  const avg = reviews?.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          {avg ? (
            <>
              <div className="num text-[44px] leading-none font-bold">{avg.toFixed(1)}</div>
              <div className="mt-1.5">
                <StarRating value={avg} size={16} />
              </div>
            </>
          ) : (
            <p className="text-[15px] text-ink-2">아직 이 사이트에 남겨진 후기가 없습니다.</p>
          )}
        </div>
        {session ? (
          <Button tone={writing ? 'quiet' : 'primary'} onClick={() => setWriting((v) => !v)}>
            {writing ? '닫기' : mine ? '내 후기 고치기' : '후기 쓰기'}
          </Button>
        ) : (
          <Button onClick={onLogin}>로그인하고 쓰기</Button>
        )}
      </div>

      {err && <Note tone="error">{err}</Note>}

      {writing && session && (
        <ReviewForm
          race={race}
          existing={mine}
          nickname={profile?.nickname ?? '러너'}
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
                    {r.race_year ? `${r.race_year}년 참가` : ''}
                    {r.finish_time ? `, 기록 ${r.finish_time}` : ''}
                  </span>
                  <span className="num ml-auto text-[14px] text-ink-3">{r.created_at.slice(0, 10)}</span>
                </div>
                <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed whitespace-pre-wrap text-ink-2">{r.body}</p>
                {(r.course_rating || r.support_rating || r.value_rating) && (
                  <p className="mt-2 text-[13px] text-ink-3">
                    {[
                      r.course_rating != null && `코스 ${r.course_rating}`,
                      r.support_rating != null && `운영·보급 ${r.support_rating}`,
                      r.value_rating != null && `가성비 ${r.value_rating}`,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                )}
                {(r.user_id === session?.user.id || profile?.is_admin) && (
                  <button
                    onClick={async () => {
                      await deleteReview(r.id);
                      reload();
                    }}
                    className="mt-2 text-[13px] text-ink-3 underline underline-offset-4 transition hover:text-ink"
                  >
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
        )
      )}

      <section>
        <h3 className="text-[15px] font-bold">다른 곳에 올라온 후기</h3>
        <p className="mt-1 text-[13px] text-ink-3">원문 링크만 모았습니다. 누르면 해당 글로 이동합니다.</p>
        {ext.length === 0 ? (
          <p className="mt-3 text-[14px] text-ink-3">아직 모아둔 글이 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {ext.map((e) => (
              <li key={e.id}>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-start justify-between gap-4 rounded-box bg-surface px-4 py-3 transition hover:bg-sunken"
                >
                  <span className="min-w-0">
                    <span className="block text-[13px] text-ink-3">
                      {KIND_LABEL[e.kind]}, {e.source}
                      {e.author && `, ${e.author}`}
                    </span>
                    <span className="mt-0.5 block text-[15px] font-semibold text-ink">{e.title}</span>
                    {e.summary && <span className="mt-0.5 block text-[13px] text-ink-2">{e.summary}</span>}
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!rating) return setErr('별점을 골라주세요.');
    if (body.trim().length < 10) return setErr('후기는 10자 이상 써주세요.');
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
      onDone();
    } catch {
      setErr('저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-box bg-surface p-4 sm:p-5">
      <fieldset>
        <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">전체 별점</legend>
        <StarRating value={rating} onChange={setRating} size={28} />
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label="참가 연도">
          <Input type="number" inputMode="numeric" min={1990} max={2100} value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
        </Field>
        <Field label="기록" hint="선택">
          <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="3:45:12" maxLength={12} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-[13px] font-semibold text-ink-2">
          세부 평가 <span className="font-normal text-ink-3">선택</span>
        </legend>
        <StarRating value={course} onChange={setCourse} size={18} label="코스" />
        <StarRating value={support} onChange={setSupport} size={18} label="운영·보급" />
        <StarRating value={value} onChange={setValue} size={18} label="가성비" />
      </fieldset>

      <Field label="후기" hint={`${body.length}/3000`}>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={3000}
          placeholder="코스, 보급, 분위기, 다시 갈 생각이 있는지처럼 다음 사람에게 도움이 될 이야기를 적어주세요."
          className={`${inputCls} h-auto resize-y py-2.5 leading-relaxed`}
        />
      </Field>

      {err && <Note tone="error">{err}</Note>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy}>
          {busy ? '저장 중' : existing ? '고친 내용 저장' : '후기 올리기'}
        </Button>
        <span className="text-[13px] text-ink-3">{nickname} 이름으로 올라갑니다</span>
      </div>
    </form>
  );
}
