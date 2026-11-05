/** Pages 고급 모드 진입점: 빌드 때 dist/_worker.js 로 묶인다 (scripts/pages.mjs). */
import { siteFetch, type SiteEnv } from './site';

export default {
  fetch: (req: Request, env: SiteEnv) => siteFetch(req, env),
};
