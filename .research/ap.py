p='src/components/AdminPanel.tsx'
s=open(p).read()
def rep(a,b):
    global s
    assert s.count(a)==1, a
    s=s.replace(a,b)
rep("""import { adminUpsertRace, adminDeleteRace, adminAddExternalReview, adminListMembers, adminConfirmMember, adminStats, type Member, type StatRow } from '../lib/data';""",
"""import {
  adminUpsertRace, adminDeleteRace, adminAddExternalReview, adminListMembers, adminConfirmMember, adminStats,
  loadRaceRequests, adminResolveRequest, adminSetSoldOut, soldOutReportRaceId,
  type Member, type StatRow, type RaceRequest,
} from '../lib/data';
import { entryStatus, fmtDate, safeUrl, STATUS_LABEL, todayISO } from '../lib/util';""")
rep("""  const [tab, setTab] = useState<'stats' | 'race' | 'ext' | 'members'>('stats');""","""  const [tab, setTab] = useState<AdminTab>('stats');""")
rep("""      <Tabs<'stats' | 'race' | 'ext' | 'members'>""","""      <Tabs<AdminTab>""")
rep("""          ['race', '대회 추가·수정'],""","""          ['race', '대회 추가·수정'],
          ['reports', '마감 제보'],""")
rep("""        {tab === 'race' && <RaceForm races={races} onSaved={onSaved} />}""","""        {tab === 'race' && <RaceForm races={races} onSaved={onSaved} />}
        {tab === 'reports' && <SoldOutReports races={races} onSaved={onSaved} />}""")
rep("""export default function AdminPanel(""","""type AdminTab = 'stats' | 'race' | 'reports' | 'ext' | 'members';

export default function AdminPanel(""")
rep("""          options={(['confirmed', 'expected', 'tbc'] as Confidence[]).map((c) => [c, CONFIDENCE_LABEL[c]])}
        />
      </Group>

      <Group title="상세">""","""          options={(['confirmed', 'expected', 'tbc'] as Confidence[]).map((c) => [c, CONFIDENCE_LABEL[c]])}
        />
        <Text
          label="조기 마감일"
          type="date"
          hint="선착순 정원이 차서 끝난 날. 아니면 빈칸"
          value={f.sold_out_on ?? ''}
          onChange={(v) => set('sold_out_on', v || null)}
        />
      </Group>

      <Group title="상세">""")
rep("""/* ── 외부 후기 링크 폼 ─────────────────────────────────── */""","""/* ── 조기 마감 제보 ─────────────────────────────────────── */

interface ReportGroup {
  raceId: string;
  race: Race | undefined;
  reqs: RaceRequest[];
  pending: number;
  latest: string;
}

/** 상세의 '마감됐어요 제보'(race_requests, note 머리말로 구분)를 대회별로 묶어 바로 처리한다 */
function SoldOutReports({ races, onSaved }: { races: Race[]; onSaved: () => void }) {
  const [rows, setRows] = useState<RaceRequest[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  /** 저장 직후 races 가 새로 오기 전까지 화면에 바로 보여 줄 값 */
  const [local, setLocal] = useState<Record<string, string | null>>({});

  const load = () =>
    loadRaceRequests()
      .then((r) => setRows(r.filter((x) => soldOutReportRaceId(x) != null)))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  useEffect(() => {
    load();
  }, []);

  if (err && !rows) return <Note tone="error">{err}</Note>;
  if (!rows) return <p className="text-[15px] text-ink-3">불러오는 중</p>;

  const byId = new Map(races.map((r) => [r.id, r]));
  const map = new Map<string, ReportGroup>();
  for (const q of rows) {
    const id = soldOutReportRaceId(q)!;
    const g = map.get(id) ?? { raceId: id, race: byId.get(id), reqs: [], pending: 0, latest: q.created_at };
    g.reqs.push(q);
    if (q.status === 'pending') g.pending++;
    if (q.created_at > g.latest) g.latest = q.created_at;
    map.set(id, g);
  }
  const groups = [...map.values()].sort((a, b) => Number(b.pending > 0) - Number(a.pending > 0) || b.latest.localeCompare(a.latest));

  async function act(g: ReportGroup, kind: 'soldout' | 'undo' | 'reject') {
    if (!g.race) return;
    setBusy(g.raceId);
    setErr('');
    try {
      if (kind === 'soldout') {
        const day = todayISO();
        await adminSetSoldOut(g.race, day);
        setLocal((p) => ({ ...p, [g.raceId]: day }));
        await Promise.all(g.reqs.filter((q) => q.status === 'pending').map((q) => adminResolveRequest(q.id, 'added', '조기 마감 처리')));
      } else if (kind === 'undo') {
        await adminSetSoldOut(g.race, null);
        setLocal((p) => ({ ...p, [g.raceId]: null }));
        await Promise.all(g.reqs.filter((q) => q.status === 'added').map((q) => adminResolveRequest(q.id, 'pending', null)));
      } else {
        await Promise.all(g.reqs.filter((q) => q.status === 'pending').map((q) => adminResolveRequest(q.id, 'rejected', '마감 확인 안 됨')));
      }
      onSaved();
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-ink-2">
        상세 화면 '마감됐어요 제보'로 들어온 것입니다. 공식 홈페이지에서 마감 공지를 확인한 뒤 처리하세요. 처리하면 조기 마감일이 오늘로
        들어가고, 되돌리면 지워집니다.
      </p>
      {err && <Note tone="error">{err}</Note>}
      {groups.length === 0 ? (
        <p className="text-[15px] text-ink-3">들어온 제보가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-line rounded-box border border-line bg-surface">
          {groups.map((g) => {
            const soldOn = g.raceId in local ? local[g.raceId] : g.race?.sold_out_on ?? null;
            const status = g.race ? (soldOn ? '조기 마감' : STATUS_LABEL[entryStatus({ ...g.race, sold_out_on: null })]) : null;
            const memos = g.reqs.map((q) => ({ q, memo: q.note?.split('\\n').slice(1).join(' ').trim() })).filter((x) => x.memo);
            return (
              <li key={g.raceId} className="space-y-2 px-4 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 text-[15px] font-semibold">
                    {g.race?.name_ko ?? '삭제된 대회'} <span className="font-normal text-ink-3">{g.raceId}</span>
                  </p>
                  <span
                    className={`shrink-0 rounded-tag px-1.5 py-0.5 text-[12px] font-bold ${
                      g.pending ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2'
                    }`}
                  >
                    {g.pending ? `확인 전 ${g.pending}` : '처리함'}
                  </span>
                </div>
                <p className="text-[13px] text-ink-3">
                  제보 <span className="num">{g.reqs.length}</span>건 ·{' '}
                  {[...new Set(g.reqs.map((q) => q.nickname ?? '익명'))].slice(0, 3).join(', ')} · 마지막 {dt(g.latest)}
                  {g.race && (
                    <>
                      {' '}
                      · 지금 <strong className="font-semibold text-ink-2">{status}</strong>
                      {soldOn && ` (${fmtDate(soldOn)})`}
                      {g.race.entry_closes && ` · 원래 마감 ${fmtDate(g.race.entry_closes)}`}
                    </>
                  )}
                </p>
                {memos.length > 0 && (
                  <ul className="space-y-0.5">
                    {memos.slice(0, 3).map(({ q, memo }) => (
                      <li key={q.id} className="text-[14px] text-ink-2">
                        “{memo}” <span className="text-[13px] text-ink-3">{q.nickname ?? '익명'}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {g.race && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {soldOn ? (
                      <Button size="sm" tone="quiet" disabled={busy === g.raceId} onClick={() => act(g, 'undo')}>
                        {busy === g.raceId ? '처리 중' : '되돌리기'}
                      </Button>
                    ) : (
                      <Button size="sm" disabled={busy === g.raceId} onClick={() => act(g, 'soldout')}>
                        {busy === g.raceId ? '처리 중' : '조기 마감 처리'}
                      </Button>
                    )}
                    {g.pending > 0 && !soldOn && (
                      <Button size="sm" tone="quiet" disabled={busy === g.raceId} onClick={() => act(g, 'reject')}>
                        보류
                      </Button>
                    )}
                    <a
                      href={safeUrl(g.race.official_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 text-[13px] font-semibold text-ink-2 underline decoration-line underline-offset-4 hover:text-ink"
                    >
                      공식 홈페이지
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── 외부 후기 링크 폼 ─────────────────────────────────── */""")
open(p,'w').write(s)
