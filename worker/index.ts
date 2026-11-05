/** 예전 주소 marathon.junubenchoi.workers.dev → 새 주소로 영구 이동(301). 공유 링크·북마크가 그대로 이어진다. */
interface Env {
  SITE_ORIGIN: string;
}

export default {
  fetch(req: Request, env: Env): Response {
    const url = new URL(req.url);
    return Response.redirect(env.SITE_ORIGIN + url.pathname + url.search, 301);
  },
};
