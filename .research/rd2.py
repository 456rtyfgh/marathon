p='src/components/RaceDetail.tsx'
s=open(p).read()
a="""  if (done)
    return (
      <div className="mt-3">
        <Note tone="ok">제보 고맙습니다. 확인 후 반영합니다.</Note>
      </div>
    );"""
b="""  if (done)
    return justSent ? (
      <div className="mt-3">
        <Note tone="ok">제보 고맙습니다. 확인 후 반영합니다.</Note>
      </div>
    ) : (
      <p className="mt-3 text-[13px] text-ink-3">마감 제보를 보냈습니다. 확인 후 반영합니다.</p>
    );"""
assert s.count(a)==1; s=s.replace(a,b)
a="""      setDone(true);
      setOpen(false);"""
assert s.count(a)==1; s=s.replace(a,"""      setDone(true);
      setJustSent(true);
      setOpen(false);""")
a="""  const [done, setDone] = useState(() => reportedIds().includes(race.id));"""
assert s.count(a)==1; s=s.replace(a,a+"\n  const [justSent, setJustSent] = useState(false);")
open(p,'w').write(s)
