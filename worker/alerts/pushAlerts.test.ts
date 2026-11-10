/** worker/alerts/pushAlerts.ts 시험 — 가짜 DB·가짜 푸시 서비스로 (네트워크 없음, 키는 시험 중에 만든 임시 키) */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { b64urlEncode } from './push.ts';
import { alertMessage, sendDueAlertPushes, supabasePushStore, type PushAlert, type PushTarget } from './pushAlerts.ts';

async function tempVapid() {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  return {
    VAPID_PUBLIC_KEY: b64urlEncode(await crypto.subtle.exportKey('raw', pair.publicKey)),
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d!,
    VAPID_SUBJECT: 'mailto:test@example.com',
  };
}
async function tempDevice(endpoint: string, user_id: string, email: string, lang: 'ko' | 'en' = 'ko'): Promise<PushTarget> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  return {
    user_id,
    email,
    endpoint,
    p256dh: b64urlEncode(await crypto.subtle.exportKey('raw', pair.publicKey)),
    auth: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))),
    lang,
  };
}

const alert = (over: Partial<PushAlert> = {}): PushAlert => ({
  race_id: 'seoul-2027',
  race_name_ko: '서울마라톤',
  race_name_en: 'Seoul Marathon',
  kind: 'opens',
  date: '2026-11-13',
  days_before: 3,
  ...over,
});

test('alertMessage: 한국어·영어 문구와 대회 주소', () => {
  assert.deepEqual(alertMessage(alert(), 'ko'), {
    title: '서울마라톤 접수 시작 D-3',
    body: '11월 13일 접수 시작. 눌러서 대회 정보를 확인하세요.',
    url: '/r/seoul-2027',
    tag: 'seoul-2027:opens',
    lang: 'ko',
  });
  const en = alertMessage(alert({ kind: 'closes', days_before: 1 }), 'en');
  assert.equal(en.title, 'Seoul Marathon: entry closes tomorrow');
  assert.equal(en.body, 'Entry closes Nov 13. Tap to see the race.');
  assert.equal(en.url, '/en/r/seoul-2027');
  assert.equal(alertMessage(alert({ days_before: 0 }), 'ko').title, '서울마라톤 접수 시작 오늘');
});

test('sendDueAlertPushes: 사람마다 모든 기기로, 기기 언어로, 410 은 지운다', async () => {
  const env = await tempVapid();
  const a1 = await tempDevice('https://fcm.googleapis.com/fcm/send/a1', 'u1', 'one@example.com');
  const a2 = await tempDevice('https://web.push.apple.com/a2', 'u1', 'one@example.com', 'en');
  const b1 = await tempDevice('https://updates.push.services.mozilla.com/wpush/v2/b1', 'u2', 'two@example.com');
  const asked: { ids: string[]; emails: string[] }[] = [];
  const removed: string[][] = [];
  const store = {
    targets: async (ids: string[], emails: string[]) => (asked.push({ ids, emails }), [a1, a2, b1]),
    remove: async (eps: string[]) => (removed.push(eps), eps.length),
  };
  const hits: string[] = [];
  const fakeFetch = (async (url: string) => {
    hits.push(url);
    return new Response(null, { status: url === a2.endpoint ? 410 : 201 });
  }) as unknown as typeof fetch;

  const report = await sendDueAlertPushes(
    [alert({ user_id: 'u1', email: 'ONE@example.com' }), alert({ email: 'two@example.com', kind: 'closes' }), alert({ email: 'nobody@example.com' })],
    env,
    store,
    { fetch: fakeFetch },
  );
  assert.deepEqual(asked, [{ ids: ['u1'], emails: ['one@example.com', 'two@example.com', 'nobody@example.com'] }]);
  // u1 기기 2개(user_id·email 둘 다로 잡혀도 한 번씩) + u2 기기 1개
  assert.deepEqual(hits.sort(), [a1.endpoint, a2.endpoint, b1.endpoint].sort());
  assert.deepEqual(removed, [[a2.endpoint]]);
  assert.equal(report.alerts, 2);
  assert.equal(report.sent, 2);
  assert.equal(report.failed, 1);
  assert.equal(report.removed, 1);
});

test('빈 목록이면 DB 도 부르지 않는다', async () => {
  const store = { targets: async () => assert.fail('불리면 안 됨'), remove: async () => assert.fail('불리면 안 됨') };
  const r = await sendDueAlertPushes([], await tempVapid(), store);
  assert.equal(r.sent, 0);
});

test('supabasePushStore: RPC 이름·인자·헤더, 오류에 키 값이 없다', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const env = { SUPABASE_URL: 'https://db.example', SUPABASE_SERVICE_KEY: 'svc-test', ALERTS_AUTOMATION_KEY: 'auto-test' };
  const ok = (async (url: string, init: RequestInit) => (calls.push({ url, init }), new Response('[]', { status: 200 }))) as unknown as typeof fetch;
  await supabasePushStore(env, ok).targets(['u1'], []);
  assert.equal(calls[0].url, 'https://db.example/rest/v1/rpc/automation_push_targets');
  assert.deepEqual(JSON.parse(calls[0].init.body as string), { p_key: 'auto-test', p_user_ids: ['u1'], p_emails: null });
  assert.equal((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer svc-test');
  assert.equal(await supabasePushStore(env, ok).remove([]), 0);
  assert.equal(calls.length, 1, '지울 것이 없으면 부르지 않는다');
  const bad = (async () => new Response('invalid automation key', { status: 403 })) as unknown as typeof fetch;
  await assert.rejects(supabasePushStore(env, bad).targets(['u1'], []), (e: Error) => !e.message.includes('svc-test') && !e.message.includes('auto-test'));
});
