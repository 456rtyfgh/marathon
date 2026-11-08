p='src/components/RequestPanel.tsx'
s=open(p).read()
def rep(a,b):
    global s
    assert s.count(a)==1, a
    s=s.replace(a,b)
rep("import { loadRaceRequests, submitRaceRequest, adminResolveRequest, type RaceRequest } from '../lib/data';",
"import { loadRaceRequests, submitRaceRequest, adminResolveRequest, soldOutReportRaceId, type RaceRequest } from '../lib/data';")
rep("""  const [list, setList] = useState<RaceRequest[] | null>(null);""","""  const [list, setList] = useState<RaceRequest[] | null>(null);
  const [reportCount, setReportCount] = useState(0);""")
rep("""    loadRaceRequests()
      .then(setList)
      .catch(() => setList([]));""","""    loadRaceRequests()
      .then((rows) => {
        // 조기 마감 제보는 같은 표에 들어가지만 대회 추가 요청이 아니다 → 관리 화면 '마감 제보' 탭에서 본다
        const reports = rows.filter((r) => soldOutReportRaceId(r) != null);
        setReportCount(reports.filter((r) => r.status === 'pending').length);
        setList(rows.filter((r) => soldOutReportRaceId(r) == null));
      })
      .catch(() => setList([]));""")
rep("""          </h3>
          {list === null ? (""","""          </h3>
          {profile?.is_admin && reportCount > 0 && (
            <p className="mt-1 text-[13px] text-ink-3">
              확인 전 조기 마감 제보 <span className="num">{reportCount}</span>건은 관리 화면 '마감 제보' 탭에 있습니다.
            </p>
          )}
          {list === null ? (""")
open(p,'w').write(s)
