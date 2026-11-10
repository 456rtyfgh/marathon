/** worker/alerts/pushRun.ts 시험 — dueAlerts(push) → 기기로 보내기 → 보낸 줄만 기록. 가짜 Supabase·가짜 푸시 서비스 (네트워크 없음) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b64urlEncode } from './push.ts';
import { sendAlertPushes, toPushAlerts } from './pushRun.ts';
import { alertMessage, type PushTarget } from './pushAlerts.ts';
import type { AlertGroup, DueAlerts } from './due.ts';

async function tempVapid() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  return {
    VAPID_PUBLIC_KEY: b64urlEncode(await crypto.subtle.exportKey('raw', pair.publicKey)),
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d!,
    VAPID_SUBJECT: 'mailto:test@example.com',
  };
}
async function device(endpoint: string, user_id: string, email: string): Promise<PushTarget> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  return {
    user_id,
    email,
    endpoint,
    p256dh: b64urlEncode(await crypto.subtle.exportKey('raw', pair.publicKey)),
    auth: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))),
    lang: 'ko',
  };
}

const item = (race_id: string, kind: 'entry_opens' | 'entry_closes' | 'race_day', days_left: number) => ({
  race_id,
  kind,
  event_date: '2026-11-20',
  scheduled_for: '2026-11-10',
  days_left,
  name_ko: `${race_id} 대회`,
  name_en: `${race_id} race`,
  city_ko: '서울',
  country_ko: '한국',
  race_date: '2026-12-01',
  official_url: 'https://example.com',
  unsubscribe_tokens: [],
});
const group = (email: string, user_id: string | null, items: AlertGroup['items']): AlertGroup => ({ email, user_id, lang: 'ko', unsubscribe_tokens: [], items });

test('toPushAlerts: 종류·날짜·남은 날 옮기기 (race_day 포함)', () => {
  const g = group('a@x.com', 'u1', [item('seoul', 'entry_opens', 3), item('jeju', 'race_day', 0)]);
  const r = toPushAlerts(g).map((p) => p.alert);
  assert.deepEqual(
    r.map((a) => [a.race_id, a.kind, a.date, a.days_before, a.user_id, a.email]),
    [
      ['seoul', 'opens', '2026-11-20', 3, 'u1', 'a@x.com'],
      ['jeju', 'race_day', '2026-11-20', 0, 'u1', 'a@x.com'],
    ],
  );
  assert.equal(alertMessage(r[1], 'ko').title, '오늘은 jeju 대회 날');
  assert.match(alertMessage(r[1], 'en').title, /jeju race is today/);
});

test('VAPID 없으면 DB 도 안 부르고 건너뛴다', async () => {
  const f = (async () => assert.fail('불리면 안 됨')) as unknown as typeof fetch;
  const r = await sendAlertPushes({ SUPABASE_URL: 'https://db.example', SUPABASE_SECRET_KEY: 's', AUTOMATION_KEY: 'k' }, { fetch: f });
  assert.match(r.stopped ?? '', /VAPID_PUBLIC_KEY/);
});

test('기기 있는 사람만 보내고, 보낸 줄만 channel push 로 기록', async () => {
  const due: DueAlerts = {
    date: '2026-11-10',
    channel: 'push',
    sent_today: 0,
    groups: [
      group('a@x.com', 'u1', [item('seoul', 'entry_opens', 3), item('busan', 'entry_closes', 0)]),
      group('b@x.com', 'u2', [item('jeju', 'race_day', 1)]), // 기기 없음
      group('c@x.com', 'u3', [item('daegu', 'entry_opens', 0)]), // 기기 실패(500)
    ],
  };
  const rpc: { fn: string; body: Record<string, unknown> }[] = [];
  const db = (async (url: string, init: RequestInit) => {
    const fn = url.split('/rpc/')[1];
    const body = JSON.parse(init.body as string);
    rpc.push({ fn, body });
    if (fn === 'automation_due_alerts') return new Response(JSON.stringify(due));
    if (fn === 'automation_mark_sent') return new Response(String(body.p_items.length));
    return new Response('?', { status: 404 });
  }) as unknown as typeof fetch;
  const devA = await device('https://push.example/a', 'u1', 'a@x.com');
  const devC = await device('https://push.example/c', 'u3', 'c@x.com');
  const store = {
    targets: async (ids: string[]) => [devA, devC].filter((d) => ids.includes(d.user_id)),
    remove: async () => 0,
  };
  const pushFetch = (async (url: string) => new Response('', { status: url.endsWith('/c') ? 500 : 201 })) as unknown as typeof fetch;

  const r = await sendAlertPushes(
    { SUPABASE_URL: 'https://db.example', SUPABASE_SECRET_KEY: 'sb_secret_x', AUTOMATION_KEY: 'k', ...(await tempVapid()) },
    { fetch: db, store, push: { fetch: pushFetch } },
  );
  assert.equal(r.due, 4);
  assert.equal(r.sent, 2);
  assert.equal(r.failed, 1);
  assert.equal(r.delivered, 2);
  assert.equal(rpc[0].fn, 'automation_due_alerts');
  assert.equal(rpc[0].body.p_channel, 'push');
  const mark = rpc.find((x) => x.fn === 'automation_mark_sent')!;
  assert.equal(mark.body.p_channel, 'push');
  assert.deepEqual(
    (mark.body.p_items as { email: string; race_id: string; kind: string; status: string }[]).map((m) => [m.email, m.race_id, m.kind, m.status]),
    [
      ['a@x.com', 'seoul', 'entry_opens', 'sent'],
      ['a@x.com', 'busan', 'entry_closes', 'sent'],
    ],
  );
});
