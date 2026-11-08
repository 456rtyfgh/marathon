import type { Race } from './types';
import { provinceOf } from './places';
import { isSubCountry, subOf } from './subregions';
import { isCancelled, todayISO } from './util';

const FULL = 42.195;
const HALF = 21.0975;
const MILE = 1.609344;

/** '풀'·'하프'·'10K'·'10km'·'100M'·'10마일' → km. 숫자로 못 바꾸는 값('건강달리기' 등)은 null */
function km(d: string): number | null {
  const s = d.trim().toLowerCase();
  if (/^(풀|풀코스|full)/.test(s)) return FULL;
  if (/^(하프|half)/.test(s)) return HALF;
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(km|k|m|마일|mi)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === 'm' || m[2] === '마일' || m[2] === 'mi' ? n * MILE : n;
}

const kmList = (r: Race) => r.distances.map(km).filter((x): x is number => x != null);
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b));

/**
 * 상세 맨 아래 '비슷한 대회' — 같은 지역·가까운 달·같은 종목/거리 순.
 * races 는 다가오는 대회. 자기 자신·같은 이름(다른 회차)·취소·지난 대회는 뺀다.
 */
export function similarRaces(race: Race, races: Race[], max = 6): Race[] {
  const today = todayISO();
  const kr = race.country_code === 'KR';
  const pv = kr ? provinceOf(race) : null;
  const sub = subOf(race);
  const subCountry = isSubCountry(race.country_code?.toLowerCase());
  const mi = monthIndex(race.race_date);
  const trail = race.discipline === 'trail';
  const mine = kmList(race);

  const score = (x: Race) => {
    let s = 0;
    if (x.country_code === race.country_code) {
      if (kr) s += pv && provinceOf(x) === pv ? 4 : 1;
      else if (subCountry) s += sub && subOf(x) === sub ? 4 : 2;
      else s += 4;
    }
    const dm = Math.abs(monthIndex(x.race_date) - mi);
    if (dm === 0) s += 3;
    else if (dm === 1) s += 2;
    if ((x.discipline === 'trail') === trail) s += 1;
    if (kmList(x).some((a) => mine.some((b) => Math.abs(a - b) <= 0.2))) s += 2;
    return s;
  };

  const pool = races.filter(
    (x) => x.id !== race.id && x.name_ko !== race.name_ko && x.race_date >= today && !isCancelled(x),
  );
  const rank = (list: Race[]) =>
    list
      .map((x) => ({ x, s: score(x), d: dayDiff(x.race_date, race.race_date) }))
      .sort((a, b) => b.s - a.s || a.d - b.d || a.x.name_ko.localeCompare(b.x.name_ko, 'ko'))
      .map((e) => e.x);

  const out = rank(pool.filter((x) => (kr ? x.country_code === 'KR' : !!race.country_code && x.country_code === race.country_code))).slice(0, max);
  if (out.length < 4) {
    const rest = rank(pool.filter((x) => x.region === race.region && x.country_code !== race.country_code));
    out.push(...rest.slice(0, max - out.length));
  }
  return out;
}
