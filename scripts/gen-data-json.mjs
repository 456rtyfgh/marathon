/** seed.ts → supabase/data.json (Mac 등 esbuild 없는 환경에서 쓰기 위한 산출물) */
import { build } from 'esbuild';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const out = join(tmpdir(), `seed-${Date.now()}.mjs`);
await build({ entryPoints: ['src/lib/seed.ts'], outfile: out, format: 'esm', bundle: true, platform: 'node' });
const { RACES, AGENCIES, PACKAGES, COSTS } = await import('file://' + out);
writeFileSync('supabase/data.json', JSON.stringify({ RACES, AGENCIES, PACKAGES, COSTS }, null, 1));
console.log(`✓ supabase/data.json (races=${RACES.length} costs=${COSTS.length})`);
