import json, re, sys, urllib.request

KEYS = ['아산', '이순신', '보은', '보청천', '이천', '무주', '반딧불', '삼척', '황영조', '여주', '세종']
BASE = 'https://user-api.mara1080.com/api/v1/public/main-page/block-list?year={}&month={}'

for y in (2026, 2027):
    for m in range(1, 13):
        url = BASE.format(y, m)
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            s = urllib.request.urlopen(req, timeout=15).read().decode()
        except Exception as e:
            print(y, m, 'ERR', e)
            continue
        for evs in json.loads(s).values():
            for e in evs:
                print(y, m, e['eventId'], e['eventDate'][:10], e['status'], e['eventNameKr'], e.get('eventUrl'))
