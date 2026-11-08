# FIX(B) 검수용: 시나리오를 agent-browser 로 돌려 상태 요약 출력. 사용: python3 .shots-tools/fixb-scenarios.py
import json, subprocess, pathlib

ROOT = pathlib.Path('/Users/choi-jun-u/Documents/runworld')
LIB = (ROOT / '.shots-tools/ea-lib.js').read_text()
URL = 'http://localhost:4317/'
AB = ['agent-browser', '--session', 'fixb']


def ab(*a, stdin=None):
    return subprocess.run(AB + list(a), input=stdin, capture_output=True, text=True).stdout.strip()


SCEN = [
    ['p:일본', 'st', 'p:일본', 'st'],
    ['p:한국', 'p:중국', 'st'],
    ['p:한국', 'p:대만', 'st'],
    ['p:일본', 'b:전체 지도', 'st'],
    ['p:미국', 'st', 'p:미국', 'st'],
    ['p:프랑스', 'st', 'p:프랑스', 'st'],
    ['b:일본', 'st'],
    ['b:한국', 'st'],
    ['b:아시아', 'b:중국', 'st'],
    ['b:유럽', 'p:일본', 'st', 'p:일본', 'st'],
    ['b:아시아', 'p:일본', 'st'],
    ['b:해외', 'p:일본', 'st', 'p:일본', 'st'],
    ['p:한국', 'seen'],
]
KEYS = ('tab', 'map', 'on', 'back', 'rows', 'pressed', 'vb')

for w in (390, 1440):
    ab('set', 'viewport', str(w), '900')
    print('===', w)
    for s in SCEN:
        ab('open', URL)
        ab('wait', 'path[aria-label^="한국 대회"]')
        ab('wait', '500')
        ab('eval', '--stdin', stdin=LIB)
        out = json.loads(json.loads(ab('eval', '__ea.run(%s)' % json.dumps(s, ensure_ascii=False))))
        print(' '.join(s))
        for x in out:
            if isinstance(x, dict) and 'tab' in x:
                print('   ', {k: x[k] for k in KEYS})
            elif isinstance(x, dict):
                print('   ', x)
