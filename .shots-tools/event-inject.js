// 러닝 이벤트 화면 확인용: 브라우저 시작 스크립트로 넣어 목록 파일(/d/<hash>.json)에 예시 이벤트 행 하나를 끼우고,
// 그 행의 상세(/r/<id>.json)도 돌려준다. DB·파일은 건드리지 않는다 (event-shots.sh)
(() => {
  const ev = {
    id: 'shot-event-sample',
    name_ko: '아디다스 스피드트랙 10K TT 선발전 (화면 확인용)',
    name_en: 'adidas SPEEDTRACK 10K TT (screenshot sample)',
    city_ko: '부천', country_ko: '한국', country_code: 'KR', region: '한국',
    race_date: '2026-11-22', date_confidence: 'confirmed', is_major: false,
    entry_type: 'qualifying', entry_opens: null, entry_closes: '2026-11-08', entry_confidence: 'confirmed',
    entry_fee: null, entry_fee_currency: 'KRW', distances: ['10K'], field_size: null, course: null, flight_hours: null,
    official_url: 'https://www.adidas.co.kr/', source_url: null, last_verified: '2026-11-10',
    notes_ko: '[브랜드 아디다스 | 선발전·기록측정] 화면 확인용 예시 행입니다.',
    notes_en: 'Screenshot sample row.',
    discipline: 'event', elevation_gain: null, sold_out_on: null, subregion: null,
  };
  const orig = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/\/r\/shot-event-sample\.json/.test(url)) {
      return new Response(JSON.stringify({ race: ev, packages: [], agencies: [], costs: [] }), { headers: { 'content-type': 'application/json' } });
    }
    const res = await orig(input, init);
    if (/\/d\/[^/?]+\.json/.test(url) && res.ok) {
      const j = await res.clone().json();
      if (Array.isArray(j.races)) {
        j.races = [ev, ...j.races];
        return new Response(JSON.stringify(j), { status: 200, headers: { 'content-type': 'application/json' } });
      }
    }
    return res;
  };
})();
