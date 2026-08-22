/**
 * src/lib/seed.ts 를 단일 소스로 삼아 supabase/seed.sql 을 생성한다.
 *   node scripts/gen-seed-sql.mjs
 */
import { build } from 'esbuild';
import { writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const out = join(tmpdir(), `seed-${Date.now()}.mjs`);
await build({
  entryPoints: ['src/lib/seed.ts'],
  outfile: out,
  format: 'esm',
  bundle: false,
  platform: 'node',
});
const { RACES, AGENCIES, PACKAGES, COSTS } = await import('file://' + out);

const q = (v) => {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `ARRAY[${v.map(q).join(',')}]::text[]`;
  return `'${String(v).replace(/'/g, "''")}'`;
};

const insert = (table, rows, cols) => {
  if (!rows.length) return '';
  const values = rows.map((r) => `  (${cols.map((c) => q(r[c])).join(', ')})`).join(',\n');
  const updates = cols
    .filter((c) => c !== 'id' && c !== 'race_id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ');
  const pk = table === 'cost_baselines' ? 'race_id' : 'id';
  return `insert into public.${table} (${cols.join(', ')}) values\n${values}\non conflict (${pk}) do update set ${updates};\n`;
};

const raceCols = [
  'id','name_ko','name_en','city_ko','country_ko','country_code','region','race_date',
  'date_confidence','is_major','entry_type','entry_opens','entry_closes','entry_confidence',
  'entry_fee','entry_fee_currency','distances','field_size','course','flight_hours',
  'official_url','source_url','last_verified','notes_ko',
];
const agencyCols = ['id','name','url','note'];
const packageCols = ['id','race_id','agency_id','title','nights','price_solo_krw','price_group_krw','group_min','includes','url','updated_at'];
const costCols = ['race_id','flight_low_krw','flight_mid_krw','flight_high_krw','hotel_night_krw','daily_krw'];

const sql = [
  '-- 자동 생성됨: node scripts/gen-seed-sql.mjs',
  '-- 원본: src/lib/seed.ts',
  '',
  insert('races', RACES, raceCols),
  insert('agencies', AGENCIES, agencyCols),
  insert('packages', PACKAGES, packageCols),
  insert('cost_baselines', COSTS, costCols),
].join('\n');

mkdirSync('supabase', { recursive: true });
writeFileSync('supabase/seed.sql', sql);
console.log(`✓ supabase/seed.sql (races=${RACES.length} agencies=${AGENCIES.length} packages=${PACKAGES.length} costs=${COSTS.length})`);
