import type { Race } from './types';

/** 대회가 많아 주·도 지도로 나눠 보는 나라 (나라 코드 소문자 — MapSection 의 place 와 같은 꼴) */
export const SUB_COUNTRIES = ['jp', 'us', 'au', 'de', 'fr', 'cn', 'gb', 'nz'] as const;
export type SubCountry = (typeof SUB_COUNTRIES)[number];

const list = (cc: string, s: string) =>
  s.split(' ').map((x) => {
    const [code, name] = x.split(':');
    return { id: `${cc}-${code}`, name: name.replace(/_/g, ' ') };
  });

/**
 * 칩 줄 앞 이름과 주·도 목록. id 는 ISO 3166-2 (races.subregion 과 src/maps/<cc>.json 의 id 가 이것과 똑같다).
 * 이름은 한국어 (툴팁·칩·aria-label). '코드:이름' 을 빈칸으로 나눈 글 — 이름 안의 빈칸은 _
 */
export const SUBREGIONS: Record<SubCountry, { unit: string; list: { id: string; name: string }[] }> = {
  jp: {
    unit: '도도부현',
    list: list(
      'JP',
      '01:홋카이도 02:아오모리현 03:이와테현 04:미야기현 05:아키타현 06:야마가타현 07:후쿠시마현 08:이바라키현 09:도치기현 10:군마현 11:사이타마현 12:지바현 13:도쿄도 14:가나가와현 15:니가타현 16:도야마현 17:이시카와현 18:후쿠이현 19:야마나시현 20:나가노현 21:기후현 22:시즈오카현 23:아이치현 24:미에현 25:시가현 26:교토부 27:오사카부 28:효고현 29:나라현 30:와카야마현 31:돗토리현 32:시마네현 33:오카야마현 34:히로시마현 35:야마구치현 36:도쿠시마현 37:가가와현 38:에히메현 39:고치현 40:후쿠오카현 41:사가현 42:나가사키현 43:구마모토현 44:오이타현 45:미야자키현 46:가고시마현 47:오키나와현',
    ),
  },
  us: {
    unit: '주',
    list: list(
      'US',
      'AL:앨라배마 AK:알래스카 AZ:애리조나 AR:아칸소 CA:캘리포니아 CO:콜로라도 CT:코네티컷 DE:델라웨어 DC:워싱턴_D.C. FL:플로리다 GA:조지아 HI:하와이 ID:아이다호 IL:일리노이 IN:인디애나 IA:아이오와 KS:캔자스 KY:켄터키 LA:루이지애나 ME:메인 MD:메릴랜드 MA:매사추세츠 MI:미시간 MN:미네소타 MS:미시시피 MO:미주리 MT:몬태나 NE:네브래스카 NV:네바다 NH:뉴햄프셔 NJ:뉴저지 NM:뉴멕시코 NY:뉴욕 NC:노스캐롤라이나 ND:노스다코타 OH:오하이오 OK:오클라호마 OR:오리건 PA:펜실베이니아 RI:로드아일랜드 SC:사우스캐롤라이나 SD:사우스다코타 TN:테네시 TX:텍사스 UT:유타 VT:버몬트 VA:버지니아 WA:워싱턴 WV:웨스트버지니아 WI:위스콘신 WY:와이오밍',
    ),
  },
  au: {
    unit: '주',
    list: list(
      'AU',
      'NSW:뉴사우스웨일스 VIC:빅토리아 QLD:퀸즐랜드 WA:서오스트레일리아 SA:남오스트레일리아 TAS:태즈메이니아 ACT:오스트레일리아수도준주 NT:노던준주',
    ),
  },
  de: {
    unit: '주',
    list: list(
      'DE',
      'BW:바덴뷔르템베르크 BY:바이에른 BE:베를린 BB:브란덴부르크 HB:브레멘 HH:함부르크 HE:헤센 MV:메클렌부르크포어포메른 NI:니더작센 NW:노르트라인베스트팔렌 RP:라인란트팔츠 SL:자를란트 SN:작센 ST:작센안할트 SH:슐레스비히홀슈타인 TH:튀링겐',
    ),
  },
  fr: {
    unit: '레지옹',
    list: list(
      'FR',
      'ARA:오베르뉴론알프 BFC:부르고뉴프랑슈콩테 BRE:브르타뉴 CVL:상트르발드루아르 20R:코르시카 GES:그랑테스트 HDF:오드프랑스 IDF:일드프랑스 NOR:노르망디 NAQ:누벨아키텐 OCC:옥시타니 PDL:페이드라루아르 PAC:프로방스알프코트다쥐르',
    ),
  },
  cn: {
    unit: '성·시',
    list: list(
      'CN',
      'BJ:베이징 TJ:톈진 HE:허베이성 SX:산시성(山西) NM:네이멍구 LN:랴오닝성 JL:지린성 HL:헤이룽장성 SH:상하이 JS:장쑤성 ZJ:저장성 AH:안후이성 FJ:푸젠성 JX:장시성 SD:산둥성 HA:허난성 HB:후베이성 HN:후난성 GD:광둥성 GX:광시 HI:하이난성 CQ:충칭 SC:쓰촨성 GZ:구이저우성 YN:윈난성 XZ:시짱 SN:산시성(陝西) GS:간쑤성 QH:칭하이성 NX:닝샤 XJ:신장',
    ),
  },
  gb: {
    unit: '지역',
    list: list('GB', 'ENG:잉글랜드 SCT:스코틀랜드 WLS:웨일스 NIR:북아일랜드'),
  },
  nz: {
    unit: '지역',
    list: list(
      'NZ',
      'AUK:오클랜드 BOP:베이오브플렌티 CAN:캔터베리 GIS:기즈번 HKB:호크스베이 MWT:마나와투왕가누이 MBH:말버러 NSN:넬슨 NTL:노스랜드 OTA:오타고 STL:사우스랜드 TKI:타라나키 TAS:태즈먼 WKO:와이카토 WGN:웰링턴 WTC:웨스트코스트',
    ),
  },
};

/** 'US-CA' → '캘리포니아' */
export const SUBREGION_NAME = new Map(SUB_COUNTRIES.flatMap((c) => SUBREGIONS[c].list.map((s) => [s.id, s.name] as const)));

export const isSubCountry = (c: string | null | undefined): c is SubCountry =>
  !!c && (SUB_COUNTRIES as readonly string[]).includes(c);

/** 주·도 코드인지 ('US-CA'). 국내 시·도 id 는 'north-chungcheong' 처럼 소문자라 대문자로만 가른다 */
export const isSubregionId = (id: string | null | undefined): boolean => !!id && /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(id);

/** 'US-CA' → 'us', 'us' → 'us', 그 밖('kr'·'es'·'seoul'·null) → null */
export const subCountryOf = (place: string | null): SubCountry | null => {
  if (!place) return null;
  const c = isSubregionId(place) ? place.slice(0, 2).toLowerCase() : place;
  return isSubCountry(c) ? c : null;
};

/** 대회의 subregion (타입에 칸이 없어도 읽히게) — 8개 나라 + 위 목록에 있는 코드만, 아니면 null */
export const subOf = (r: Race): string | null => {
  const s: unknown = (r as Race & { subregion?: unknown }).subregion;
  if (typeof s !== 'string' || !SUBREGION_NAME.has(s)) return null;
  return s.slice(0, 2) === r.country_code?.toUpperCase() ? s : null;
};
