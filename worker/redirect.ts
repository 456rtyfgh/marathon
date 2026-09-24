/** 예전 주소 runworld.junubenchoi.workers.dev → 새 주소로 영구 이동 */
const TARGET = 'https://marathon.junubenchoi.workers.dev';

export default {
  fetch(req: Request): Response {
    const u = new URL(req.url);
    return Response.redirect(TARGET + u.pathname + u.search, 301);
  },
};
