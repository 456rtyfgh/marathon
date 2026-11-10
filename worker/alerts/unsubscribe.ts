/**
 * 알림 메일 수신 거부 (site.ts 의 /unsubscribe 가 여기로 넘긴다)
 *  - GET  /unsubscribe?t=<토큰,토큰…>[&lang=en]  확인 버튼만 보여 준다. 메일 보안 검사기가 링크를 미리 열어도 해지되지 않게.
 *  - POST /unsubscribe?t=…                       버튼(폼) 또는 메일 앱의 원클릭(List-Unsubscribe-Post) → RPC unsubscribe_alert(anon)
 * 토큰은 uuid 만, 100개까지. 없는 토큰도 '처리됨'과 같은 화면 (있는지 알려 주지 않음). 응답은 no-store·noindex·no-referrer.
 */
import { sbConfig, type FetchFn, type MemberEnv } from '../memberCal';

type Lang = 'ko' | 'en';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const T = {
  ko: {
    title: '알림 메일 그만 받기',
    ask: '아래 버튼을 누르면 이 링크에 해당하는 대회 일정 알림 메일이 더 이상 오지 않습니다.',
    button: '알림 그만 받기',
    done: '처리했습니다. 이 링크의 알림 메일은 더 이상 보내지 않습니다.',
    doneNote: '이미 오늘 보내기로 한 메일이 한 통 더 갈 수 있습니다. 회원은 마라톤 캘린더의 내 정보에서 알림 설정을 다시 켤 수 있습니다.',
    bad: '링크가 올바르지 않습니다. 메일에 있는 링크를 그대로 열어 주세요.',
    fail: '지금은 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
    home: '마라톤 캘린더로 가기',
  },
  en: {
    title: 'Unsubscribe from alert emails',
    ask: 'Press the button below to stop the race date alert emails for this link.',
    button: 'Unsubscribe',
    done: 'Done. We will no longer send alert emails for this link.',
    doneNote: 'One email already scheduled for today may still arrive. Members can turn alerts back on under My account on Marathon Calendar.',
    bad: 'This link is not valid. Please open the link from the email as it is.',
    fail: "We couldn't process this right now. Please try again in a moment.",
    home: 'Go to Marathon Calendar',
  },
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function page(lang: Lang, status: number, body: string): Response {
  const t = T[lang];
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(t.title)}</title></head>
<body style="margin:0;background:#f6f6f6;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#111">
<main style="max-width:480px;margin:48px auto;padding:24px;background:#fff;border-radius:12px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(t.title)}</h1>
${body}
<p style="margin-top:24px;font-size:14px"><a href="${lang === 'en' ? '/en/' : '/'}" style="color:#0b57d0">${esc(t.home)}</a></p>
</main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

/** ?t=a,b,c → uuid 배열 (형식이 하나라도 틀리면 null) */
export function parseTokens(raw: string | null): string[] | null {
  if (!raw) return null;
  const ts = [...new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
  if (!ts.length || ts.length > 100 || !ts.every((x) => UUID.test(x))) return null;
  return ts;
}

const netFetch: FetchFn = (input, init) => fetch(input, init);

export async function unsubscribeRoute(req: Request, env: MemberEnv, fetchFn: FetchFn = netFetch): Promise<Response> {
  const url = new URL(req.url);
  const lang: Lang = url.searchParams.get('lang') === 'en' ? 'en' : 'ko';
  const t = T[lang];
  const tokens = parseTokens(url.searchParams.get('t'));
  if (!tokens) return page(lang, 400, `<p>${esc(t.bad)}</p>`);

  if (req.method === 'GET' || req.method === 'HEAD') {
    // 폼은 같은 주소로 POST (CSP form-action 'self')
    return page(
      lang,
      200,
      `<p style="font-size:15px;line-height:1.6">${esc(t.ask)}</p>
<form method="post" action="${esc(url.pathname + url.search)}"><button type="submit" style="font-size:16px;font-weight:600;padding:12px 20px;border:0;border-radius:8px;background:#111;color:#fff;cursor:pointer">${esc(t.button)}</button></form>`,
    );
  }
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: { Allow: 'GET, POST' } });

  const { url: sb, key } = sbConfig(env);
  if (!sb || !key) return page(lang, 502, `<p>${esc(t.fail)}</p>`);
  let ok = false;
  try {
    const r = await fetchFn(`${sb}/rest/v1/rpc/unsubscribe_alert`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_tokens: tokens }),
    });
    ok = r.ok;
    if (!ok) console.error('[unsubscribe] rpc', r.status);
  } catch {
    console.error('[unsubscribe] rpc network');
  }
  if (!ok) return page(lang, 502, `<p>${esc(t.fail)}</p>`);
  return page(lang, 200, `<p style="font-size:15px;line-height:1.6"><strong>${esc(t.done)}</strong></p><p style="font-size:14px;color:#555;line-height:1.6">${esc(t.doneNote)}</p>`);
}
