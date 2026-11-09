import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { readSplit } from './scripts/data-split.mjs';

/**
 * npm run dev 에서도 화면이 지금처럼 뜨게: 배포 때 워커(worker/site.ts)가 하는 일 중
 * 목록 파일(/d/<hash>.json)·대회 상세(/r/<id>.json)를 public/data.json 에서 바로 내준다 (접근 검사는 없음).
 */
function devData(): Plugin {
  return {
    name: 'dev-data',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0];
        const send = (status: number, body: string) => {
          res.statusCode = status;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(body);
        };
        if (/^\/d\/[0-9a-f]{16}\.json$/.test(path)) return send(200, readSplit().listJson);
        const m = path.match(/^\/r\/([a-z0-9-]{2,40})\.json$/);
        if (!m) return next();
        const { full } = readSplit();
        const race = full.races.find((r) => r.id === m[1]);
        if (!race) return send(404, JSON.stringify({ _notice: full._notice, error: 'not_found' }));
        const packages = full.packages.filter((p) => p.race_id === race.id);
        const agencyIds = new Set(packages.map((p) => p.agency_id));
        send(
          200,
          JSON.stringify({
            _notice: full._notice,
            race,
            packages,
            agencies: full.agencies.filter((a) => agencyIds.has(a.id)),
            costs: full.costs.filter((c) => c.race_id === race.country_code),
          }),
        );
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devData()],
  // 목록 파일 주소 (빌드마다 내용 해시로 바뀐다 — scripts/data-split.mjs)
  define: { __DATA_LIST_URL__: JSON.stringify(readSplit().listPath) },
});
