import json, urllib.request

IDS = {
    'muju-half': '6b68a627-24cf-4844-ac1d-9358b2a54227',
    'icheon-ceramic': 'b2dd5c44-a875-484a-b2b5-38b21977e56b',
    'samcheok-hwangyoungcho': '8921cdef-67fc-4e1c-9237-763520b90c80',
    'asan-yisunsin': 'e40f1082-eb59-40b3-9fbe-b05afe6bf741',
    'yeoju-sejong': 'edaee6e1-0d92-4248-9927-06ed3b0abfd0',
}

for rid, eid in IDS.items():
    url = 'https://user-api.mara1080.com/api/v1/public/event/' + eid
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        s = urllib.request.urlopen(req, timeout=15).read().decode()
    except Exception as e:
        print(rid, 'ERR', e)
        continue
    d = json.loads(s)
    d = d.get('data', d) if isinstance(d, dict) else d
    keys = ('eventNameKr', 'eventDate', 'eventAddress', 'eventPlace', 'host', 'organizer', 'status')
    found = {k: d.get(k) for k in keys if isinstance(d, dict) and k in d}
    print(rid, eid, found or s[:300])
