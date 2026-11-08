import json, sys

# 전마협(mara1080.com) 공식 상세 API 로 대회명 확인한 대회 페이지 (2026-11-07)
URLS = {
    'asan-yisunsin': 'https://mara1080.com/event/e40f1082-eb59-40b3-9fbe-b05afe6bf741',
    'icheon-ceramic': 'https://mara1080.com/event/b2dd5c44-a875-484a-b2b5-38b21977e56b',
    'muju-half': 'https://mara1080.com/event/6b68a627-24cf-4844-ac1d-9358b2a54227',
    'samcheok-hwangyoungcho': 'https://mara1080.com/event/8921cdef-67fc-4e1c-9237-763520b90c80',
    'yeoju-sejong': 'https://mara1080.com/event/edaee6e1-0d92-4248-9927-06ed3b0abfd0',
}

root, out = sys.argv[1], sys.argv[2]
d = json.load(open(root + '/public/data.json'))
races = d['races'] if isinstance(d, dict) else d
rows = []
for r in races:
    if r['id'] in URLS:
        assert 'search.naver.com' in (r.get('official_url') or ''), r['id']
        row = dict(r)
        row['official_url'] = URLS[r['id']]
        row['last_verified'] = '2026-11-07'
        rows.append(row)
assert len(rows) == len(URLS), [r['id'] for r in rows]
json.dump(rows, open(out, 'w'), ensure_ascii=False, indent=1)
print(len(rows), 'rows ->', out)
