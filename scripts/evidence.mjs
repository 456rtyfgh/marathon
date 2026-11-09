/**
 * 증거 기록: 우리 대회 데이터가 언제부터 어떤 모습으로 있었는지 남긴다 (evidence/ 는 커밋 대상).
 *   node scripts/evidence.mjs               빌드 끝에 돈다. evidence/ledger.csv 에 한 줄 추가
 *                                           (빌드 시각 KST, public/data.json 의 sha256, generated_at, 대회 수, 나라 수)
 *   node scripts/evidence.mjs --first-seen  손으로 한 번. DB 의 대회별 created_at 을 읽기만 해서 evidence/races-first-seen.csv 로
 *                                           (snapshot.mjs 와 같은 REST GET. 환경변수 → .duo-data/snap.env → .env 순으로 찾는다)
 * 값은 파일·DB 에 있는 그대로만 쓴다 (추정·보정 없음).
 */
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const dir = new URL('evidence/', root);
const DATA_FILE = 'public/data.json';

/** 지금 한국 시간 'YYYY-MM-DDTHH:MM:SS+09:00' */
const nowKst = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19) + '+09:00';
/** CSV 칸 (쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다) */
const cell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function ledger() {
  const buf = readFileSync(new URL(DATA_FILE, root));
  const snap = JSON.parse(buf.toString('utf8'));
  const races = snap.races ?? [];
  const countries = new Set(races.map((r) => r.country_code).filter(Boolean)).size;
  const row = [nowKst(), DATA_FILE, createHash('sha256').update(buf).digest('hex'), snap.generated_at ?? '', races.length, countries];
  mkdirSync(dir, { recursive: true });
  const file = new URL('ledger.csv', dir);
  if (!existsSync(file)) writeFileSync(file, 'built_at,data_file,sha256,generated_at,races,countries\n');
  appendFileSync(file, row.map(cell).join(',') + '\n');
  console.log(`evidence: ledger.csv + ${row[0]} races ${races.length}, countries ${countries}, sha256 ${row[2].slice(0, 12)}…`);
}

/** KEY=VALUE 줄만 읽는다 (따옴표는 벗긴다) */
function readEnvFile(path) {
  try {
    const out = {};
    for (const line of readFileSync(new URL(path, root), 'utf8').split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
    return out;
  } catch {
    return null;
  }
}

async function firstSeen() {
  let url = process.env.VITE_SUPABASE_URL;
  let key = process.env.VITE_SUPABASE_ANON_KEY;
  let from = '환경변수';
  for (const f of ['.duo-data/snap.env', '.env']) {
    if (url && key) break;
    const env = readEnvFile(f);
    if (env?.VITE_SUPABASE_URL && env?.VITE_SUPABASE_ANON_KEY) {
      url = env.VITE_SUPABASE_URL;
      key = env.VITE_SUPABASE_ANON_KEY;
      from = f;
    }
  }
  if (!url || !key) {
    console.log('evidence --first-seen: Supabase 주소·키를 못 찾아 건너뜀 (파일을 만들지 않음)');
    return;
  }
  // 읽기(GET)만. DB 는 한 번에 최대 1000줄 — 끝날 때까지 나눠 받는다
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const r = await fetch(`${url}/rest/v1/races?select=id,created_at&order=created_at,id&limit=1000&offset=${offset}`, {
      method: 'GET',
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      console.log(`evidence --first-seen: DB 응답 ${r.status} — 파일을 만들지 않음`);
      return;
    }
    const page = await r.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
  const ok = rows.filter((x) => x.id && x.created_at);
  const skipped = rows.length - ok.length;
  const head = `# 대회별 최초 등록 시각 = DB races.created_at 값 그대로 (${from} 의 주소로 ${nowKst()} 에 읽음). DB 이전·재시드 때 찍힌 값이면 실제 첫 등록보다 늦을 수 있다.\n`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(new URL('races-first-seen.csv', dir), head + 'id,first_seen\n' + ok.map((x) => `${cell(x.id)},${cell(x.created_at)}`).join('\n') + '\n');
  console.log(`evidence --first-seen: ${ok.length}개 저장${skipped ? `, created_at 이 없어 뺀 대회 ${skipped}개` : ''}`);
}

if (process.argv.includes('--first-seen')) await firstSeen();
else ledger();
