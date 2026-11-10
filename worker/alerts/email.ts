/**
 * 일정 알림 메일 (Resend). 예약 워커(worker/cron.ts)가 매일 KST 08:00 에 부르고, 12:17 에 한 번 더(실패분 재시도).
 *  - 받을 목록은 dueAlerts (worker/alerts/due.ts, 푸시와 공용). 한 사람 = 한 통에 오늘 알림을 묶는다.
 *  - 하루 한도(ALERT_DAILY_LIMIT, 기본 100 = Resend 무료) 를 넘으면 나머지는 다음 날로 (DB 가 3일까지 이어 준다).
 *  - 보내고 나면 바로 markSent. 주소 오류(422)는 'failed' 로 기록해 다시 안 보내고, 5xx·연결 실패는 기록 없이 다음 실행에 다시.
 *  - 같은 알림 묶음은 같은 Idempotency-Key → 기록이 실패해 다시 보내도 Resend 가 24시간 안 중복을 막는다.
 * 비밀값은 env 이름만 (RESEND_API_KEY · AUTOMATION_KEY · SUPABASE_SECRET_KEY). 로그에 키·주소 전체를 남기지 않는다.
 */
import {
  dueAlerts,
  maskEmail,
  marksFor,
  markSent,
  missingEnv,
  type AlertGroup,
  type AlertItem,
  type AlertKind,
  type AlertLang,
  type AlertsDeps,
  type AlertsEnv,
} from './due';

export interface EmailEnv extends AlertsEnv {
  RESEND_API_KEY: string;
  /** 기본 https://marathon82.com */
  SITE_ORIGIN?: string;
  /** 하루 최대 통 수 (기본 100) */
  ALERT_DAILY_LIMIT?: string;
}

export const FROM_ADDRESS = 'noreply@marathon82.com';
const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_ORIGIN = 'https://marathon82.com';

// ── 문안 ─────────────────────────────────────────────────────────────────────────────────────
const L = {
  ko: {
    brand: '마라톤 캘린더',
    kind: { entry_opens: '접수 시작', entry_closes: '접수 마감', race_day: '대회일' } as Record<AlertKind, string>,
    more: (n: number) => ` 외 ${n}건`,
    intro: '신청하신 대회 일정 알림입니다.',
    entry: '공식 홈페이지 (접수)',
    detail: '마라톤 캘린더에서 보기',
    stopOne: '이 대회 알림 끄기',
    stopAll: '알림 모두 그만 받기',
    check: '일정은 주최 측 사정으로 바뀔 수 있습니다. 접수 전 공식 홈페이지에서 꼭 확인해 주세요.',
    info: '이 메일은 회원님이 마라톤 캘린더(marathon82.com)에서 신청한 대회 일정 알림으로, 광고가 없는 정보성 메일입니다. 보내기 전용 주소라 답장은 받지 않습니다.',
  },
  en: {
    brand: 'Marathon Calendar',
    kind: { entry_opens: 'Registration opens', entry_closes: 'Registration closes', race_day: 'Race day' } as Record<AlertKind, string>,
    more: (n: number) => ` and ${n} more`,
    intro: 'Here are the race date alerts you asked for.',
    entry: 'Official site (registration)',
    detail: 'View on Marathon Calendar',
    stopOne: 'Turn off alerts for this race',
    stopAll: 'Unsubscribe from all alerts',
    check: 'Dates can change at the organizer’s discretion. Please check the official site before you register.',
    info: 'This is an informational email (no ads) about race date alerts you set up on Marathon Calendar (marathon82.com). This address does not receive replies.',
  },
};

const WD = { ko: ['일', '월', '화', '수', '목', '금', '토'], en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' → ko '2027년 1월 13일 (수)' · en 'Wed, Jan 13, 2027' (연도 포함) */
export function fmtDateLong(iso: string, lang: AlertLang): string {
  const d = new Date(`${iso}T00:00:00Z`);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const w = d.getUTCDay();
  return lang === 'en' ? `${WD.en[w]}, ${MON[m]} ${day}, ${y}` : `${y}년 ${m + 1}월 ${day}일 (${WD.ko[w]})`;
}

const dday = (n: number, lang: AlertLang) =>
  lang === 'en' ? (n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`) : n === 0 ? '오늘' : `D-${n}`;

const raceName = (i: AlertItem, lang: AlertLang) => (lang === 'en' ? i.name_en?.trim() || i.name_ko : i.name_ko);

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** 공식 주소는 http(s) 만 링크로 (DB 값이지만 혹시 모를 javascript: 등 차단) */
const safeUrl = (u: string) => (/^https?:\/\//i.test(u ?? '') ? u : '');

export function unsubscribeUrl(origin: string, tokens: string[], lang: AlertLang): string {
  return `${origin}/unsubscribe?t=${tokens.map(encodeURIComponent).join(',')}${lang === 'en' ? '&lang=en' : ''}`;
}

export function detailUrl(origin: string, raceId: string, lang: AlertLang): string {
  return `${origin}${lang === 'en' ? '/en' : ''}/r/${encodeURIComponent(raceId)}`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  listUnsubscribe: string;
}

/** 한 사람의 오늘 알림 → 메일 한 통 */
export function renderAlertEmail(group: AlertGroup, origin = DEFAULT_ORIGIN): RenderedEmail {
  const lang: AlertLang = group.lang === 'en' ? 'en' : 'ko';
  const t = L[lang];
  const first = group.items[0];
  const head = (i: AlertItem) =>
    lang === 'en'
      ? `${raceName(i, lang)} — ${t.kind[i.kind].toLowerCase()} ${dday(i.days_left, lang)}`
      : `${raceName(i, lang)} ${t.kind[i.kind]} ${dday(i.days_left, lang)}`;
  const subject =
    `[${t.brand}] ${head(first)}` +
    (group.items.length > 1 ? t.more(group.items.length - 1) : ` (${fmtDateLong(first.event_date, lang).replace(/ \(.\)$/, '')})`);
  const stopAll = unsubscribeUrl(origin, group.unsubscribe_tokens, lang);

  const textParts = [t.intro, ''];
  const htmlItems: string[] = [];
  for (const i of group.items) {
    const name = raceName(i, lang);
    const when = `${t.kind[i.kind]}: ${fmtDateLong(i.event_date, lang)} (${dday(i.days_left, lang)})`;
    const raceDay = i.kind === 'race_day' ? '' : `${t.kind.race_day}: ${fmtDateLong(i.race_date, lang)}`;
    const place = lang === 'ko' ? [i.city_ko, i.country_ko].filter(Boolean).join(', ') : '';
    const official = safeUrl(i.official_url);
    const detail = detailUrl(origin, i.race_id, lang);
    const stopOne = unsubscribeUrl(origin, i.unsubscribe_tokens, lang);
    textParts.push(
      `■ ${name}${place ? ` (${place})` : ''}`,
      `  ${when}`,
      ...(raceDay ? [`  ${raceDay}`] : []),
      ...(official ? [`  ${t.entry}: ${official}`] : []),
      `  ${t.detail}: ${detail}`,
      `  ${t.stopOne}: ${stopOne}`,
      '',
    );
    htmlItems.push(`<tr><td style="padding:16px 0;border-top:1px solid #e5e5e5">
<div style="font-size:17px;font-weight:700;color:#111">${esc(name)}</div>
${place ? `<div style="font-size:13px;color:#666;margin-top:2px">${esc(place)}</div>` : ''}
<div style="font-size:15px;color:#111;margin-top:8px"><strong>${esc(t.kind[i.kind])}</strong> · ${esc(fmtDateLong(i.event_date, lang))} · <strong>${esc(dday(i.days_left, lang))}</strong></div>
${raceDay ? `<div style="font-size:14px;color:#444;margin-top:2px">${esc(raceDay)}</div>` : ''}
<div style="font-size:14px;margin-top:10px">${official ? `<a href="${esc(official)}" style="color:#0b57d0">${esc(t.entry)}</a> &nbsp;·&nbsp; ` : ''}<a href="${esc(detail)}" style="color:#0b57d0">${esc(t.detail)}</a></div>
<div style="font-size:12px;margin-top:8px"><a href="${esc(stopOne)}" style="color:#888">${esc(t.stopOne)}</a></div>
</td></tr>`);
  }
  textParts.push(t.check, '', t.info, `${t.stopAll}: ${stopAll}`);

  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f6f6f6"><div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,BlinkMacSystemFont,'Apple SD Gothic Neo','Malgun Gothic',sans-serif">
<div style="background:#fff;border-radius:12px;padding:24px">
<div style="font-size:13px;font-weight:700;color:#666">${esc(t.brand)}</div>
<p style="font-size:15px;color:#111;margin:8px 0 8px">${esc(t.intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${htmlItems.join('\n')}</table>
<p style="font-size:13px;color:#666;margin:16px 0 0">${esc(t.check)}</p>
</div>
<p style="font-size:12px;color:#888;line-height:1.6;margin:16px 4px 0">${esc(t.info)}<br><a href="${esc(stopAll)}" style="color:#888">${esc(t.stopAll)}</a></p>
</div></body></html>`;

  return { subject, html, text: textParts.join('\n'), listUnsubscribe: stopAll };
}

// ── 보내기 ───────────────────────────────────────────────────────────────────────────────────
async function sha256Hex(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** 같은 사람·같은 알림 묶음이면 같은 키 (다음 날 이어 보내도 같음 → 24시간 안 중복은 Resend 가 막음) */
export async function idempotencyKey(g: AlertGroup): Promise<string> {
  const k = g.items.map((i) => `${i.race_id}|${i.kind}|${i.scheduled_for}`).sort().join(',');
  return `alert-${(await sha256Hex(`${g.email}#${k}`)).slice(0, 48)}`;
}

type SendResult =
  | { ok: true; id: string | null }
  | { ok: false; kind: 'invalid' | 'quota' | 'auth' | 'transient'; status: number; name: string };

async function resendSend(env: EmailEnv, g: AlertGroup, mail: RenderedEmail, deps: AlertsDeps): Promise<SendResult> {
  const f = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const brand = g.lang === 'en' ? L.en.brand : L.ko.brand;
  const body = JSON.stringify({
    from: `${brand} <${FROM_ADDRESS}>`,
    to: [g.email],
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    headers: { 'List-Unsubscribe': `<${mail.listUnsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
    tags: [{ name: 'type', value: 'race_alert' }],
  });
  const key = await idempotencyKey(g);
  let last: SendResult = { ok: false, kind: 'transient', status: 0, name: 'not_sent' };
  for (let i = 0; i < 3; i++) {
    let r: Response;
    try {
      r = await f(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body,
      });
    } catch (e) {
      last = { ok: false, kind: 'transient', status: 0, name: e instanceof Error ? e.name : 'network' };
      await sleep(2000 * (i + 1));
      continue;
    }
    if (r.ok) {
      const j = (await r.json().catch(() => ({}))) as { id?: string };
      return { ok: true, id: j.id ?? null };
    }
    const j = (await r.json().catch(() => ({}))) as { name?: string };
    const name = String(j.name ?? '').slice(0, 60);
    if (r.status === 429 && /quota/i.test(name)) return { ok: false, kind: 'quota', status: 429, name };
    if (r.status === 401 || r.status === 403) return { ok: false, kind: 'auth', status: r.status, name };
    if (r.status === 400 || r.status === 422) return { ok: false, kind: 'invalid', status: r.status, name };
    last = { ok: false, kind: 'transient', status: r.status, name };
    if (r.status === 429) {
      const ra = Number(r.headers.get('retry-after'));
      await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 1500 * (i + 1));
    } else if (r.status >= 500 || r.status === 409) {
      await sleep(2000 * (i + 1));
    } else {
      return { ok: false, kind: 'invalid', status: r.status, name };
    }
  }
  return last;
}

export interface SendSummary {
  date: string;
  /** 보낸 통 수 */
  sent: number;
  /** 주소 오류 등으로 포기(기록) */
  failed: number;
  /** 잠깐 실패 → 다음 실행에 다시 */
  retryLater: number;
  /** 하루 한도로 다음 날로 넘김 */
  deferred: number;
  /** 멈춘 이유 (설정 없음·키 거절·한도) */
  stopped?: string;
}

/** 오늘 알림 메일 전부 보내기. 예외를 던지지 않고 요약을 돌려준다 (cron 이 로그로 남김) */
export async function sendAlertEmails(env: EmailEnv, deps: AlertsDeps & { date?: string; gapMs?: number } = {}): Promise<SendSummary> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const sum: SendSummary = { date: deps.date ?? '', sent: 0, failed: 0, retryLater: 0, deferred: 0 };
  const missing = missingEnv(env as unknown as Record<string, unknown>, ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'AUTOMATION_KEY', 'RESEND_API_KEY']);
  if (missing.length) {
    sum.stopped = `missing env: ${missing.join(', ')}`;
    console.error('[alerts] 설정 없음 → 보내지 않음:', missing.join(', '));
    return sum;
  }
  const origin = (env.SITE_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, '');
  const limit = Math.max(0, Number(env.ALERT_DAILY_LIMIT) || 100);

  const due = await dueAlerts(env, { channel: 'email', date: deps.date, ...deps });
  sum.date = due.date;
  let budget = limit - (due.sent_today || 0);
  console.log(`[alerts] ${due.date} 보낼 사람 ${due.groups.length}명, 오늘 이미 ${due.sent_today}통, 한도 ${limit}`);

  for (let gi = 0; gi < due.groups.length; gi++) {
    const g = due.groups[gi];
    if (!g.items?.length) continue;
    if (budget <= 0) {
      sum.deferred = due.groups.length - gi;
      sum.stopped = sum.stopped ?? 'daily limit';
      break;
    }
    if (gi) await sleep(deps.gapMs ?? 600); // Resend 기본 초당 2건
    const mail = renderAlertEmail(g, origin);
    const r = await resendSend(env, g, mail, deps);
    if (r.ok) {
      budget--;
      sum.sent++;
      try {
        await markSent(env, marksFor(g, g.items, { status: 'sent', message_id: r.id }), { channel: 'email', ...deps });
      } catch (e) {
        // 보냈는데 기록 실패 → 더 보내면 기록 없는 메일이 쌓인다. 여기서 멈춘다 (같은 묶음은 Idempotency-Key 로 24시간 중복 방지)
        console.error(`[alerts] 기록 실패 → 이번 실행 멈춤 (${maskEmail(g.email)}):`, e instanceof Error ? e.message : 'error');
        sum.stopped = 'mark_sent failed';
        sum.deferred = due.groups.length - gi - 1;
        break;
      }
      continue;
    }
    console.error(`[alerts] 보내기 실패 ${maskEmail(g.email)}: ${r.kind} ${r.status} ${r.name}`);
    if (r.kind === 'quota' || r.kind === 'auth') {
      sum.stopped = r.kind === 'quota' ? 'resend quota' : 'resend auth';
      sum.retryLater++;
      sum.deferred = due.groups.length - gi - 1;
      break;
    }
    if (r.kind === 'invalid') {
      sum.failed++;
      try {
        await markSent(env, marksFor(g, g.items, { status: 'failed', message_id: null }), { channel: 'email', ...deps });
      } catch {
        /* 다음 실행에 다시 실패하면 그때 기록 */
      }
    } else {
      sum.retryLater++;
    }
  }
  console.log(`[alerts] 끝: ${JSON.stringify(sum)}`);
  return sum;
}
