#!/usr/bin/env python3
"""대회 공식 홈페이지 링크 점검.

모든 대회의 official_url 을 열어 보고
  - gambling : 도박·성인·게임 다운로드 등 엉뚱한 사이트로 넘어감 (도메인 만료 후 남이 산 경우가 대부분)
  - parked   : 도메인 판매·주차 페이지
  - dead     : 도메인이 없거나(DNS) 404/410
  - unreachable : 시간 초과·5xx 등 (일시적일 수 있음, 보고만)
  - blocked     : 403·429 등 봇 차단 (사람이 열면 보통 정상, 보고만)
  - unrelated   : 열리긴 하는데 대회와 관련된 말이 안 보임 (보고만)
로 분류한다. --fix 를 주면 gambling/parked/dead 는 즉시 검색 링크로 바꿔
사이트에 이상한 링크가 남지 않게 한다. (공식 주소로 다시 바꾸는 건 주간 갱신 작업이 맡는다)

환경변수: AUTOMATION_KEY (없으면 ~/Documents/.tools/secrets/automation.key)
사용: python3 link_audit.py [--fix] [--out 폴더] [--only id1,id2]
"""
import json, os, re, ssl, sys, socket, time, urllib.parse, urllib.request, urllib.error
import concurrent.futures as cf

SB = 'https://zhwmfvkwtmakieatlqtz.supabase.co'
PUB = 'sb_publishable_uOBwP5-BbK7keBuq3gsMAg_Oil1yg6O'
UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'

GAMBLING = [
    'casino', 'baccarat', 'roulette', 'sportsbook', 'bookmaker', 'jackpot', 'slot gacor', 'slot online', 'judi', 'togel',
    'gacor', 'poker online', 'texas hold', 'bet365', '1xbet', 'betting', 'online betting', 'pokies',
    '카지노', '바카라', '토토', '먹튀', '슬롯', '홀덤', '배팅', '룰렛',
    '博彩', '赌场', '赌博', '德州扑克', '娱乐城', '彩票', '百家乐', '老虎机', '棋牌', '真人视讯',
    'カジノ', 'オンラインカジノ', 'スロット',
    'porn', 'xxx', 'escort', 'hentai', '成人', '色情',
    'apk download', 'dragon city', 'free spins', 'deposit bonus', 'crypto casino',
]
PARKED = [
    'domain is for sale', 'domain for sale', 'buy this domain', 'this domain may be for sale', 'domain name is for sale',
    'parked free', 'parkingcrew', 'sedoparking', 'sedo.com', 'dan.com', 'afternic', 'hugedomains', 'bodis.com',
    'godaddy.com/domainsearch', 'is parked', 'domain has expired', 'this domain has expired', 'renew this domain',
    'website is under construction', 'account suspended', 'default web site page', 'welcome to nginx', 'it works!',
]
RACE_WORDS = ['marathon', 'maraton', 'marató', 'maratón', 'maratona', 'marathón', 'maraþon', 'maraton',
              'マラソン', '마라톤', '马拉松', '馬拉松', 'half', 'halb', 'lauf', 'löp', 'juoksu', 'run', 'race', 'course', 'carrera',
              'corrida', 'corsa', 'loop', 'bieg', 'beh', 'ハーフ', '하프', '달리기', '러닝', '跑', 'km']


def search_link(r):
    year = (r.get('race_date') or '')[:4]
    if r.get('country_code') == 'KR':
        return 'https://search.naver.com/search.naver?query=' + urllib.parse.quote(f"{r['name_ko']} {year}".strip())
    return 'https://www.google.com/search?q=' + urllib.parse.quote(f"{r.get('name_en') or r['name_ko']} {year} official".strip())


def is_search(u):
    return u.startswith('https://search.naver.com/') or u.startswith('https://www.google.com/search')


def rest(path):
    req = urllib.request.Request(f'{SB}/rest/v1/{path}', headers={'apikey': PUB})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def all_races():
    out, start = [], 0
    while True:
        page = rest(f'races?select=*&order=id&offset={start}&limit=1000')
        out += page
        if len(page) < 1000:
            return out
        start += 1000


def fetch(url):
    """(status, final_url, text, err)"""
    ctxs = [ssl.create_default_context()]
    insecure = ssl.create_default_context(); insecure.check_hostname = False; insecure.verify_mode = ssl.CERT_NONE
    ctxs.append(insecure)  # 인증서가 깨진 사이트도 '무엇이 떠 있는지'는 확인한다 (읽기만)
    last = (0, url, '', '')
    for ctx in ctxs:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ko,en;q=0.8'})
            opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
            with opener.open(req, timeout=20) as r:
                raw = r.read(400_000)
                cs = r.headers.get_content_charset() or 'utf-8'
                return r.status, r.geturl(), raw.decode(cs, 'ignore'), ''
        except urllib.error.HTTPError as e:
            return e.code, url, '', f'HTTP {e.code}'
        except urllib.error.URLError as e:
            reason = e.reason
            if isinstance(reason, socket.gaierror):
                return 0, url, '', 'DNS'
            if isinstance(reason, ssl.SSLError):
                last = (0, url, '', 'SSL'); continue
            last = (0, url, '', str(reason)[:80])
        except Exception as e:  # noqa
            last = (0, url, '', str(e)[:80])
        break
    return last


def host(u):
    try:
        h = urllib.parse.urlparse(u).hostname or ''
        return '.'.join(h.split('.')[-2:])
    except Exception:
        return ''


def classify(r):
    u = r.get('official_url') or ''
    if not u or is_search(u):
        return dict(id=r['id'], url=u, verdict='search')
    st, final, text, err = fetch(u)
    low = text.lower()
    m = re.search(r'<title[^>]*>(.*?)</title>', text, re.S | re.I)
    title = re.sub(r'\s+', ' ', m.group(1)).strip()[:120] if m else ''
    res = dict(id=r['id'], name=r['name_ko'], url=u, final=final, status=st, title=title, err=err)
    if err == 'DNS':
        time.sleep(3)
        st, final, text, err = fetch(u)  # DNS 는 일시 오류일 수 있어 한 번 더
        res.update(status=st, final=final, err=err)
    if err == 'DNS' or st in (404, 410):
        return dict(res, verdict='dead')
    if 300 <= st < 400 or st in (401, 403, 429):
        return dict(res, verdict='blocked')  # 봇 차단·리디렉션 루프: 사람이 열면 보통 정상, 보고만
    if st == 0 or st >= 500:
        return dict(res, verdict='unreachable')
    hits = sorted({w for w in GAMBLING if w in low})
    strong_title = any(w in title.lower() for w in GAMBLING)
    if strong_title or len(hits) >= 3:
        return dict(res, verdict='gambling', hits=hits[:8])
    if any(w in low for w in PARKED):
        return dict(res, verdict='parked', hits=[w for w in PARKED if w in low][:5])
    names = [w.lower() for w in re.findall(r'[A-Za-zÀ-ÿ]{4,}', r.get('name_en') or '') if w.lower() not in ('marathon', 'international', 'city', 'half')]
    names += [r.get('name_ko', '')[:2], (r.get('city_ko') or '').split(' ')[-1]]
    if not any(w in low for w in RACE_WORDS) and not any(n and n.lower() in low for n in names):
        return dict(res, verdict='unrelated')
    moved = host(final) != host(u)
    return dict(res, verdict='ok', moved=moved)


def upsert(row, key):
    body = json.dumps({'p_key': key, 'p_race': row}).encode()
    req = urllib.request.Request(f'{SB}/rest/v1/rpc/automation_upsert_race', data=body, method='POST',
                                 headers={'apikey': PUB, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status


def main():
    args = sys.argv[1:]
    fix = '--fix' in args
    out = args[args.index('--out') + 1] if '--out' in args else '.'
    only = set(args[args.index('--only') + 1].split(',')) if '--only' in args else None
    races = [r for r in all_races() if not only or r['id'] in only]
    t0 = time.time()
    with cf.ThreadPoolExecutor(16) as ex:
        results = list(ex.map(classify, races))
    by = {r['id']: r for r in races}
    fixed = []
    if fix:
        key = os.environ.get('AUTOMATION_KEY') or open(os.path.expanduser('~/Documents/.tools/secrets/automation.key')).read().strip()
        for x in results:
            if x['verdict'] in ('gambling', 'parked', 'dead'):
                row = dict(by[x['id']])
                row['notes_ko'] = row.get('notes_ko') or ''
                if not row.get('source_url') or row['source_url'] == row['official_url']:
                    row['source_url'] = None
                row['official_url'] = search_link(row)
                try:
                    upsert(row, key); fixed.append(x['id'])
                except Exception as e:  # noqa
                    x['fix_error'] = str(e)[:120]
    os.makedirs(out, exist_ok=True)
    json.dump(results, open(os.path.join(out, 'link-audit.json'), 'w'), ensure_ascii=False, indent=1)
    from collections import Counter
    c = Counter(x['verdict'] for x in results)
    lines = [f'# 링크 점검 {time.strftime("%Y-%m-%d %H:%M")}', '',
             f'대회 {len(results)}개 · ' + ' · '.join(f'{k} {v}' for k, v in c.most_common()) + f' · {int(time.time()-t0)}초', '']
    if fix:
        lines += [f'검색 링크로 바꾼 대회 {len(fixed)}개: ' + ', '.join(fixed), '']
    for v in ('gambling', 'parked', 'dead', 'unrelated', 'unreachable', 'blocked'):
        xs = [x for x in results if x['verdict'] == v]
        if xs:
            lines.append(f'## {v} ({len(xs)})')
            lines += [f"- {x['id']} {x.get('name','')} — {x['url']} → {x.get('final','')} [{x.get('status')}] {x.get('title','')} {','.join(x.get('hits', []))}" for x in xs]
            lines.append('')
    open(os.path.join(out, 'link-audit.md'), 'w').write('\n'.join(lines))
    print(lines[2]); print(f'fixed {len(fixed)}' if fix else 'report only')


if __name__ == '__main__':
    main()
