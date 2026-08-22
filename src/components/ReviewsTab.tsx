import { useEffect, useState } from 'react';
import type { Race, Review, ExternalReview } from '../lib/types';
import { KIND_LABEL } from '../lib/types';
import { loadReviews, loadExternalReviews, saveReview, deleteReview } from '../lib/data';
import { useAuth } from '../lib/auth';
import { hasSupabase } from '../lib/supabase';
import StarRating from './StarRating';

const KIND_CLS: Record<string, string> = {
  blog: 'bg-emerald-500/15 text-emerald-300',
  youtube: 'bg-rose-500/15 text-rose-300',
  community: 'bg-sky-500/15 text-sky-300',
  news: 'bg-violet-500/15 text-violet-300',
  etc: 'bg-zinc-700 text-zinc-300',
};

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
      .catch((e) => {
        setErr(e instanceof Error ? e.message : String(e));
        setReviews([]);
      });
  };

  useEffect(reload, [race.id]);

  const mine = reviews?.find((r) => r.user_id === session?.user.id) ?? null;
  const avg = reviews?.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 0;

  return (
    <div className="space-y-7">
      {/* 요약 */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div>
          <div className="text-3xl font-bold tabular-nums text-amber-400">
            {avg ? avg.toFixed(1) : '—'}
          </div>
          <StarRating value={avg} size="sm" />
        </div>
        <div className="text-sm text-zinc-400">
          사이트 후기 <strong className="text-zinc-200">{reviews?.length ?? 0}</strong>개
          <span className="mx-2 text-zinc-700">·</span>
          외부 후기 링크 <strong className="text-zinc-200">{ext.length}</strong>개
        </div>
        <div className="ml-auto">
          {session ? (
            <button
              onClick={() => setWriting((v) => !v)}
              className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400"
            >
              {writing ? '닫기' : mine ? '내 후기 수정' : '후기 쓰기'}
            </button>
          ) : (
            <button
              onClick={onLogin}
              className="rounded-lg bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
            >
              로그인하고 후기 쓰기
            </button>
          )}
        </div>
      </div>

      {err && <p className="text-sm text-rose-400">{err}</p>}

      {writing && session && (
        <ReviewForm
          race={race}
          existing={mine}
          nickname={profile?.nickname ?? session.user.email ?? '러너'}
          userId={session.user.id}
          onDone={() => {
            setWriting(false);
            reload();
          }}
        />
      )}

      {/* 사이트 내 후기 */}
      <section>
        <h4 className="mb-3 text-sm font-semibold text-zinc-300">사이트 후기</h4>
        {reviews === null ? (
          <p className="text-sm text-zinc-600">불러오는 중…</p>
        ) : reviews.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
            아직 후기가 없습니다. 첫 후기를 남겨보세요.
          </p>
        ) : (
          <ul className="space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <StarRating value={r.rating} size="sm" />
                  <span className="text-sm font-medium text-zinc-200">{r.nickname}</span>
                  {r.race_year && <span className="text-xs text-zinc-500">{r.race_year}년 참가</span>}
                  {r.finish_time && (
                    <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] tabular-nums text-zinc-300">
                      {r.finish_time}
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-zinc-600">{r.created_at.slice(0, 10)}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed whitespace-pre-wrap text-zinc-300">{r.body}</p>
                {(r.course_rating || r.support_rating || r.value_rating) && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                    {r.course_rating != null && <span>코스 {r.course_rating}/5</span>}
                    {r.support_rating != null && <span>운영·보급 {r.support_rating}/5</span>}
                    {r.value_rating != null && <span>가성비 {r.value_rating}/5</span>}
                  </div>
                )}
                {(r.user_id === session?.user.id || profile?.is_admin) && (
                  <button
                    onClick={async () => {
                      await deleteReview(r.id);
                      reload();
                    }}
                    className="mt-2 text-[11px] text-zinc-600 transition hover:text-rose-400"
                  >
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 외부 후기 링크 */}
      <section>
        <h4 className="mb-1 text-sm font-semibold text-zinc-300">다른 사이트 후기</h4>
        <p className="mb-3 text-xs text-zinc-600">
          본문은 원문에 있습니다. 제목을 누르면 해당 사이트로 이동합니다.
        </p>
        {ext.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">
            등록된 외부 후기 링크가 없습니다.
          </p>
        ) : (
          <ul className="space-y-2">
            {ext.map((e) => (
              <li key={e.id}>
                <a
                  href={e.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 transition hover:border-zinc-600 hover:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${KIND_CLS[e.kind]}`}>
                      {KIND_LABEL[e.kind]}
                    </span>
                    <span className="text-xs text-zinc-500">{e.source}</span>
                    {e.author && <span className="text-xs text-zinc-600">· {e.author}</span>}
                    {e.published_at && <span className="ml-auto text-[11px] text-zinc-600">{e.published_at}</span>}
                  </div>
                  <div className="mt-1 text-sm text-zinc-200">{e.title} ↗</div>
                  {e.summary && <div className="mt-1 text-xs text-zinc-500">{e.summary}</div>}
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
    if (!rating) return setErr('별점을 선택해 주세요.');
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
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div>
        <span className="mb-1.5 block text-xs font-medium text-zinc-400">전체 별점 *</span>
        <StarRating value={rating} onChange={setRating} size="lg" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">참가 연도</span>
          <input
            type="number"
            min={1990}
            max={2100}
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="2026"
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">기록 (선택)</span>
          <input
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="3:45:12"
            maxLength={12}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
          />
        </label>
      </div>

      <div className="space-y-2 rounded-lg bg-zinc-900/60 p-3">
        <span className="block text-xs font-medium text-zinc-400">세부 평가 (선택)</span>
        <StarRating value={course} onChange={setCourse} size="sm" label="코스" />
        <StarRating value={support} onChange={setSupport} size="sm" label="운영·보급" />
        <StarRating value={value} onChange={setValue} size="sm" label="가성비" />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-400">후기 * (10자 이상)</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={3000}
          placeholder="코스는 어땠는지, 보급은 충분했는지, 다시 갈 의향이 있는지 등 다음 사람에게 도움 될 내용을 적어주세요."
          className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-emerald-500"
        />
        <span className="mt-1 block text-right text-[11px] text-zinc-600">{body.length}/3000</span>
      </label>

      {err && <p className="text-sm text-rose-400">{err}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:opacity-40"
        >
          {busy ? '저장 중…' : existing ? '수정하기' : '등록하기'}
        </button>
        <span className="text-xs text-zinc-600">{nickname} 님으로 작성됩니다</span>
      </div>
    </form>
  );
}
