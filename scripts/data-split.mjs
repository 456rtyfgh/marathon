/**
 * 대회 데이터 나누기. 원본 public/data.json(DB 사본, scripts/snapshot.mjs)은 빌드 입력으로만 쓰고
 *  - 목록 파일 /d/<hash>.json  : 첫 화면·목록·지도·검색에 필요한 필드만 (앱이 받는다)
 *  - 전체 파일 /d/f-<hash>.json: 원본 전체 (워커만 env.ASSETS 로 읽는다 — 공개 요청은 404, worker/site.ts)
 * 로 dist/d/ 에 쓴다. 이름은 내용 sha256 앞 16자라 데이터가 바뀌면 주소도 바뀐다.
 * 같은 입력 → 같은 이름이라 vite.config.ts·prerender.mjs·pages.mjs 가 따로 불러도 값이 같다.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_NOTICE } from '../src/lib/notice.ts';

/** 목록 파일에 남기는 대회 필드 (목록 줄·정렬·지도·검색·취소 표시가 쓰는 것) */
export const LIST_FIELDS = [
  'id',
  'name_ko',
  'name_en',
  'city_ko',
  'country_ko',
  'country_code',
  'region',
  'race_date',
  'date_confidence',
  'is_major',
  'entry_type',
  'entry_opens',
  'entry_closes',
  'entry_confidence',
  'entry_fee',
  'entry_fee_currency',
  'distances',
  'field_size',
  'flight_hours',
  'discipline',
  'elevation_gain',
  'sold_out_on',
  'subregion',
];
/** 목록 파일에서 빠지는 대회 필드 (대회를 열 때 /r/<id>.json 으로 받는다). notes_ko 는 취소 태그만 남는다 */
export const DETAIL_FIELDS = ['official_url', 'source_url', 'notes_ko', 'notes_en', 'course', 'last_verified'];

/** src/lib/util.ts 의 CANCEL_TAG_RE 와 같은 규칙 */
const CANCEL_TAG_RE = /^\s*\[(취소|중단)\]/;

const hash16 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function listRace(r) {
  const o = {};
  for (const k of LIST_FIELDS) if (k in r) o[k] = r[k];
  const tag = r.notes_ko?.match(CANCEL_TAG_RE);
  if (tag) o.notes_ko = `[${tag[1]}]`;
  return o;
}

export function splitData(snap) {
  const list = { _notice: DATA_NOTICE, generated_at: snap.generated_at, races: snap.races.map(listRace) };
  const full = { _notice: DATA_NOTICE, ...snap };
  const listJson = JSON.stringify(list);
  const fullJson = JSON.stringify(full);
  return { list, full, listJson, fullJson, listPath: `/d/${hash16(listJson)}.json`, fullPath: `/d/f-${hash16(fullJson)}.json` };
}

export function readSplit() {
  return splitData(JSON.parse(readFileSync(new URL('../public/data.json', import.meta.url), 'utf8')));
}

/** dist/d/ 에 두 파일을 쓰고(예전 것은 지움) dist/data.json 을 지운다 */
export function writeSplit(distDir) {
  const s = readSplit();
  const dir = join(distDir, 'd');
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) rmSync(join(dir, f));
  writeFileSync(join(distDir, s.listPath), s.listJson);
  writeFileSync(join(distDir, s.fullPath), s.fullJson);
  rmSync(join(distDir, 'data.json'), { force: true });
  return { listPath: s.listPath, fullPath: s.fullPath };
}
