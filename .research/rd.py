import re
p='src/components/RaceDetail.tsx'
s=open(p).read()
def rep(a,b):
    global s
    assert s.count(a)==1, a
    s=s.replace(a,b)
rep("""  statusLine,
  raceDayLine,""","""  statusLine,
  raceDayLine,
  entryStatus,
  isSoldOut,
  mayFillEarly,""")
rep("""import ReviewsTab from './ReviewsTab';
import { CloseButton, Tabs } from './ui';""","""import ReviewsTab from './ReviewsTab';
import { Button, CloseButton, Input, Note, Tabs } from './ui';
import { useAuth } from '../lib/auth';
import { submitSoldOutReport } from '../lib/data';
import { spamReason, friendlyError } from '../lib/spam';""")
rep("""  const st = statusLine(race, today);""","""  const st = statusLine(race, today, registered);
  const soldOut = isSoldOut(race, today) ? dateParts(race.sold_out_on!) : null;
  const canReport = raceDay.days != null && entryStatus(race, today) === 'open';""")
# raceDay must be defined before canReport: move
rep("""  const raceDay = raceDayLine(race, today);
""","")
rep("""  const st = statusLine(race, today, registered);""","""  const raceDay = raceDayLine(race, today);
  const st = statusLine(race, today, registered);""")
rep("""              <div className="num mt-0.5 text-[26px] leading-none font-bold">{st.days != null ? dday(st.days) : '-'}</div>
              <div className={`mt-1 text-[13px] ${st.hot ? 'opacity-85' : 'text-ink-3'}`}>
                {ENTRY_LABEL[race.entry_type]}
                {race.entry_confidence !== 'confirmed' && `, 일정 ${CONFIDENCE_LABEL[race.entry_confidence]}`}
              </div>""","""              <div className={`mt-0.5 text-[26px] leading-none font-bold ${soldOut ? '' : 'num'}`}>
                {st.days != null ? dday(st.days) : soldOut ? '마감' : '-'}
              </div>
              <div className={`mt-1 text-[13px] ${st.hot ? 'opacity-85' : 'text-ink-3'}`}>
                {soldOut ? (
                  `${soldOut.m}월 ${soldOut.d}일 정원 마감`
                ) : (
                  <>
                    {ENTRY_LABEL[race.entry_type]}
                    {race.entry_confidence !== 'confirmed' && `, 일정 ${CONFIDENCE_LABEL[race.entry_confidence]}`}
                  </>
                )}
              </div>""")
rep("""                <Fact label="접수 마감" value={race.entry_closes ? fmtDate(race.entry_closes) : '정원이 차면 마감'} />
              </dl>""","""                {soldOut ? (
                  <Fact
                    label="접수 마감"
                    value={`${soldOut.m}월 ${soldOut.d}일 정원 마감`}
                    sub={race.entry_closes ? `원래 마감 ${fmtDate(race.entry_closes)}` : undefined}
                  />
                ) : (
                  <Fact label="접수 마감" value={race.entry_closes ? fmtDate(race.entry_closes) : '정원이 차면 마감'} />
                )}
              </dl>
              {mayFillEarly(race, today) && (
                <div className="mt-3 max-w-[60ch] rounded-box border border-line px-4 py-3">
                  <p className="text-[14px] font-semibold">선착순 · 조기 마감될 수 있음</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-ink-2">
                    정원이 차면 마감일 전에 끝날 수 있습니다. 신청 전에 공식 홈페이지에서 확인하세요.
                  </p>
                </div>
              )}
              {canReport && <SoldOutReport race={race} onLogin={onLogin} />}""")
rep("""                <CalendarPlus size={16} weight="bold" /> 캘린더에 저장""","""                <CalendarPlus size={16} weight="bold" /> {calDates(race).length === 1 ? '대회 날 캘린더에 저장' : '캘린더에 저장'}""")
rep("""        접수 시작·마감 일정에는 하루 전 알림이 붙습니다. 접수일이 아직 발표되지 않은 대회는 대회 날만 넣을 수 있습니다.""","""        접수 시작·마감 일정에는 하루 전 알림이 붙습니다.{' '}
        {race.sold_out_on && dates.length === 1
          ? '조기 마감된 대회라 대회 날만 넣을 수 있습니다.'
          : '접수일이 아직 발표되지 않은 대회는 대회 날만 넣을 수 있습니다.'}""")
s += '''
const REPORTED_KEY = 'marathon-cal:soldout-reported';
const reportedIds = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(REPORTED_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};

/** '마감됐어요 제보' — 대회 추가 요청과 같은 표(race_requests)·같은 로그인·하루 제한 규칙 */
function SoldOutReport({ race, onLogin }: { race: Race; onLogin: () => void }) {
  const { session, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(() => reportedIds().includes(race.id));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (!session) return onLogin();
    const spam = spamReason(memo);
    if (spam) return setErr(spam);
    setBusy(true);
    try {
      await submitSoldOutReport(race, session.user.id, profile?.nickname ?? '러너', memo);
      track('soldout_report', { race_id: race.id });
      try {
        localStorage.setItem(REPORTED_KEY, JSON.stringify([...reportedIds(), race.id].slice(-200)));
      } catch {
        /* 저장 못 해도 제보는 들어감 */
      }
      setDone(true);
      setOpen(false);
    } catch (e2) {
      setErr(friendlyError(e2, '제보를 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <div className="mt-3">
        <Note tone="ok">제보 고맙습니다. 확인 후 반영합니다.</Note>
      </div>
    );

  if (!open)
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button tone="quiet" size="sm" type="button" onClick={() => (session ? setOpen(true) : onLogin())}>
          마감됐어요 제보
        </Button>
        <span className="text-[13px] text-ink-3">공식 홈페이지에 마감 공지가 있으면 알려 주세요</span>
      </div>
    );

  return (
    <form onSubmit={send} className="mt-3 max-w-[60ch] space-y-2 rounded-box bg-surface p-4">
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-semibold text-ink-2">
          어디서 봤나요 <span className="font-normal text-ink-3">선택</span>
        </span>
        <Input value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={200} placeholder="예: 홈페이지 공지에 정원 마감" />
      </label>
      {err && <Note tone="error">{err}</Note>}
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={busy}>
          {busy ? '보내는 중' : '제보 보내기'}
        </Button>
        <Button size="sm" tone="quiet" type="button" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </form>
  );
}
'''
open(p,'w').write(s)
