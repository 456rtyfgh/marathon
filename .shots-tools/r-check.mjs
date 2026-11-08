// 파트 B 확인용: /r/<id> 의 h1·FAQ·관련 링크·목록 링크를 뽑아 본다
const base = process.argv[2] || 'http://localhost:8791';
const ids = process.argv.slice(3);
for (const id of ids) {
  const h = await (await fetch(`${base}/r/${id}`)).text();
  console.log(`== ${id}`);
  console.log((h.match(/<h1>[^<]*<\/h1>/) || [])[0]);
  for (const m of h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)) {
    const j = JSON.parse(m[1]);
    if (j['@type'] === 'FAQPage') console.log('FAQ:', j.mainEntity.map((q) => `${q.name} → ${q.acceptedAnswer.text}`).join(' | '));
  }
  console.log((h.match(/<h2>[^<]*<\/h2>/g) || []).join(' '));
  console.log((h.match(/<nav aria-label="대회 일정 목록">.*?<\/nav>/) || [])[0]);
  console.log((h.match(/<dt>접수 기간.*?<\/dl>/) || [])[0]);
  console.log((h.match(/hreflang="ko" href="[^"]*"/) || [])[0]);
}
