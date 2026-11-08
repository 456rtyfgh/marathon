p='src/components/AdminPanel.tsx'
s=open(p).read()
def rep(a,b):
    global s
    assert s.count(a)==1, a
    s=s.replace(a,b)
rep("loadRaceRequests, adminResolveRequest, adminSetSoldOut, soldOutReportRaceId,",
    "loadRaceRequests, adminResolveRequest, adminSetSoldOut, soldOutReportRaceId, loadSoldOutDates,")
rep("""  const load = () =>
    loadRaceRequests()
      .then((r) => setRows(r.filter((x) => soldOutReportRaceId(x) != null)))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));""",
"""  const load = async () => {
    try {
      const r = (await loadRaceRequests()).filter((x) => soldOutReportRaceId(x) != null);
      // 조기 마감 여부는 스냅샷이 아니라 지금 DB 값으로 본다 (이미 처리한 날짜를 오늘로 덮지 않게)
      const live = await loadSoldOutDates([...new Set(r.map((x) => soldOutReportRaceId(x)!))]);
      setLocal(live);
      setRows(r);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };""")
rep("""  async function act(g: ReportGroup, kind: 'soldout' | 'undo' | 'reject') {""",
    """  async function act(g: ReportGroup, kind: 'soldout' | 'undo' | 'reject' | 'already') {""")
rep("""      } else {
        await Promise.all(g.reqs.filter((q) => q.status === 'pending').map((q) => adminResolveRequest(q.id, 'rejected', '마감 확인 안 됨')));
      }""","""      } else if (kind === 'already') {
        // 조기 마감일은 그대로 두고 남은 제보만 정리
        await Promise.all(g.reqs.filter((q) => q.status === 'pending').map((q) => adminResolveRequest(q.id, 'added', '이미 조기 마감')));
      } else {
        await Promise.all(g.reqs.filter((q) => q.status === 'pending').map((q) => adminResolveRequest(q.id, 'rejected', '마감 확인 안 됨')));
      }""")
rep("""                    {g.pending > 0 && !soldOn && (
                      <Button size="sm" tone="quiet" disabled={busy === g.raceId} onClick={() => act(g, 'reject')}>
                        보류
                      </Button>
                    )}""","""                    {g.pending > 0 && soldOn && (
                      <Button size="sm" disabled={busy === g.raceId} onClick={() => act(g, 'already')}>
                        이미 반영됨
                      </Button>
                    )}
                    {g.pending > 0 && (
                      <Button size="sm" tone="quiet" disabled={busy === g.raceId} onClick={() => act(g, 'reject')}>
                        보류
                      </Button>
                    )}""")
rep("""                      {g.race.entry_closes && ` · 원래 마감 ${fmtDate(g.race.entry_closes)}`}""",
    """                      {g.race.entry_closes && (!soldOn || soldOn < g.race.entry_closes) && ` · 원래 마감 ${fmtDate(g.race.entry_closes)}`}""")
open(p,'w').write(s)

p='src/components/RaceDetail.tsx'
s=open(p).read()
rep("""  const canReport = raceDay.days != null && entryStatus(race, today) === 'open';""",
"""  // 정원이 차서 끝나는 건 선착순·상시 접수뿐. 추첨·기록 기준 대회는 제보 대상이 아니다
  const canReport =
    raceDay.days != null && (race.entry_type === 'fcfs' || race.entry_type === 'open') && entryStatus(race, today) === 'open';""")
rep("""              {mayFillEarly(race, today) && (""","""              {!registered && mayFillEarly(race, today) && (""")
rep("""                    sub={race.entry_closes ? `원래 마감 ${fmtDate(race.entry_closes)}` : undefined}""",
"""                    sub={
                      race.entry_closes && race.sold_out_on! < race.entry_closes ? `원래 마감 ${fmtDate(race.entry_closes)}` : undefined
                    }""")
rep("""        접수 시작·마감 일정에는 하루 전 알림이 붙습니다.{' '}
        {race.sold_out_on && dates.length === 1
          ? '조기 마감된 대회라 대회 날만 넣을 수 있습니다.'
          : '접수일이 아직 발표되지 않은 대회는 대회 날만 넣을 수 있습니다.'}""",
"""        {dates.length > 1
          ? '접수 시작·마감 일정에는 하루 전 알림이 붙습니다.'
          : race.sold_out_on
            ? '조기 마감된 대회라 대회 날만 넣을 수 있습니다.'
            : '접수일이 아직 발표되지 않은 대회는 대회 날만 넣을 수 있습니다.'}""")
rep("""      setErr(friendlyError(e2, '제보를 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'));""",
"""      const m = friendlyError(e2, '제보를 저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
      // DB 의 하루 제한은 '대회 추가 요청' 과 같이 센다 (스키마는 그대로)
      setErr(/하루에 5개/.test(m) ? `마감 제보도 대회 추가 요청과 합쳐 하루 5건까지입니다. ${m}` : m);""")
open(p,'w').write(s)
