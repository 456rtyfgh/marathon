/**
 * worker/alerts/push.ts 시험 — `npm run test:push` (node --test, 네트워크 없음).
 *  - 암호화: RFC 8291 부록 A 의 입력(보내는 쪽 임시 키·salt·받는 기기 키)으로 §5 본문과 한 바이트도 다르지 않은지,
 *    중간값(ecdh_secret·IKM·CEK·NONCE)도 RFC 값과 같은지.
 *  - VAPID: RFC 8292 그림 1·2 의 JWT 앞부분이 우리 함수와 같은지, RFC 의 서명이 RFC 공개키로 검증되는지(형식 r‖s·base64url),
 *    시험용 임시 키로 만든 우리 JWT·Authorization 헤더가 검증되는지.
 *  - 보내기: 410/404 는 gone, 429/5xx 는 retry, 201 은 ok (fetch 를 바꿔 끼워서).
 * 여기 나오는 키는 모두 RFC 공개 예제이거나 시험 중에 만든 임시 키다 (운영 키 아님).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  b64urlDecode,
  b64urlEncode,
  encodePayload,
  encryptPayload,
  importP256Private,
  sendPush,
  vapidAuthorization,
  vapidJwt,
  vapidSigningInput,
  MAX_PLAINTEXT,
} from './push.ts';

const j = (...parts: string[]) => parts.join('');

// RFC 8291 부록 A (공백 줄바꿈은 붙여 씀)
const RFC = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPublic: j('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIg', 'Dll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8'),
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: j('BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-', 'JvLexhqUzORcx', 'aOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4'),
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  ecdh: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs',
  ikm: 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg',
  cek: 'oIhVW04MRdy2XN9CiKLxTg',
  nonce: '4h_95klXJ5E_qnoN',
  header: j('DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z', '9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml', 'mlMoZIIgDll6e3vCYLocInmYWAmS6Tlz', 'AC8wEqKK6PBru3jl7A8'),
  ciphertext: j('8pfeW0KbunFT06SuDKoJH9Ql87S1QUrd', 'irN6GcG7sFz1y1sqLgVi1VhjVkHsUoEs', 'bI_0LpXMuGvnzQ'),
  // §5 의 요청 본문 전체
  body: j(
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml',
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT',
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
  ),
};

// RFC 8292 그림 1·2
const VAPID_RFC = {
  jwt: j(
    'eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL3',
    'B1c2guZXhhbXBsZS5uZXQiLCJleHAiOjE0NTM1MjM3NjgsInN1YiI6Im1ha',
    'Wx0bzpwdXNoQGV4YW1wbGUuY29tIn0.i3CYb7t4xfxCDquptFOepC9GAu_H',
    'LGkMlMuCGSK2rpiUfnK9ojFwDXb1JrErtmysazNjjvW2L9OkSSHzvoD1oA',
  ),
  k: j('BA1Hxzyi1RUM1b5wjxsn7nGxAszw2u61m164i3MrAIxHF6YK5h4SDYic-dR', 'uU_RCPCfA5aq9ojSwk5Y2EmClBPs'),
  aud: 'https://push.example.net',
  exp: 1453523768,
  sub: 'mailto:push@example.com',
};

const hkdf = async (salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: string | Uint8Array<ArrayBuffer>, n: number) => {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const i = typeof info === 'string' ? new TextEncoder().encode(info) : info;
  return b64urlEncode(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: i }, k, n * 8));
};

/** 받는 기기 쪽 복호화 (시험에서만 — RFC 8291 §3 을 거꾸로) */
async function decrypt(body: Uint8Array<ArrayBuffer>, uaPrivB64: string, uaPubB64: string, authB64: string): Promise<Uint8Array> {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const ct = body.slice(21 + idlen);
  const uaPriv = await importP256Private(uaPrivB64, uaPubB64, 'ECDH');
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaPriv, 256));
  const uaPub = b64urlDecode(uaPubB64);
  const info = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...uaPub, ...asPublic]);
  const ikm = b64urlDecode(await hkdf(b64urlDecode(authB64), ecdh, info, 32));
  const cek = b64urlDecode(await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16));
  const nonce = b64urlDecode(await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12));
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, ct));
  assert.equal(pt[pt.length - 1], 2, '마지막 레코드 구분 바이트 0x02');
  return pt.slice(0, -1);
}

async function tempKeyPair(alg: 'ECDSA' | 'ECDH') {
  const usage: KeyUsage[] = alg === 'ECDSA' ? ['sign', 'verify'] : ['deriveBits'];
  const pair = (await crypto.subtle.generateKey({ name: alg, namedCurve: 'P-256' }, true, usage)) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  return {
    pair,
    publicB64: b64urlEncode(await crypto.subtle.exportKey('raw', pair.publicKey)),
    privateB64: jwk.d!,
  };
}

test('base64url 왕복', () => {
  for (const n of [0, 1, 2, 3, 16, 65]) {
    const b = crypto.getRandomValues(new Uint8Array(n));
    assert.deepEqual(b64urlDecode(b64urlEncode(b)), b);
  }
  assert.throws(() => b64urlDecode('ab$c'));
});

test('RFC 8291 부록 A: 중간값이 RFC 와 같다', async () => {
  const asPriv = await importP256Private(RFC.asPrivate, RFC.asPublic, 'ECDH');
  const uaKey = await crypto.subtle.importKey('raw', b64urlDecode(RFC.uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, asPriv, 256));
  assert.equal(b64urlEncode(ecdh), RFC.ecdh);
  const info = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...b64urlDecode(RFC.uaPublic), ...b64urlDecode(RFC.asPublic)]);
  const ikm = await hkdf(b64urlDecode(RFC.auth), ecdh, info, 32);
  assert.equal(ikm, RFC.ikm);
  assert.equal(await hkdf(b64urlDecode(RFC.salt), b64urlDecode(ikm), 'Content-Encoding: aes128gcm\0', 16), RFC.cek);
  assert.equal(await hkdf(b64urlDecode(RFC.salt), b64urlDecode(ikm), 'Content-Encoding: nonce\0', 12), RFC.nonce);
});

test('RFC 8291 §5: 같은 입력이면 본문(머리 86바이트 + 암호문)이 RFC 예제와 똑같다', async () => {
  const privateKey = await importP256Private(RFC.asPrivate, RFC.asPublic, 'ECDH');
  const out = await encryptPayload(b64urlDecode(RFC.plaintext), RFC.uaPublic, RFC.auth, {
    asKeys: { privateKey, publicRaw: b64urlDecode(RFC.asPublic) },
    salt: b64urlDecode(RFC.salt),
  });
  // RFC §5 요청 머리에는 Content-Length: 145 라고 적혀 있지만 같은 절의 본문(base64url 192자)은 144바이트다
  // (머리 86 + 평문 41 + 구분 1 + 태그 16 = 144). 본문 값과 대조한다.
  assert.equal(out.length, 144);
  assert.equal(b64urlEncode(out.slice(0, 86)), RFC.header);
  assert.equal(b64urlEncode(out.slice(86)), RFC.ciphertext);
  assert.equal(b64urlEncode(out), RFC.body);
  // 받는 쪽 비밀키로 풀면 원문
  assert.equal(new TextDecoder().decode(await decrypt(out, RFC.uaPrivate, RFC.uaPublic, RFC.auth)), 'When I grow up, I want to be a watermelon');
});

test('임시 키: 매번 새 키·salt 로 암호화해도 받는 기기가 푼다, 곡선 밖 점은 거절', async () => {
  const ua = await tempKeyPair('ECDH');
  const auth = b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
  const msg = new TextEncoder().encode(JSON.stringify({ title: '서울마라톤 접수 시작 D-3', body: '한글 ✓', url: '/r/x' }));
  const a = await encryptPayload(msg, ua.publicB64, auth);
  const b = await encryptPayload(msg, ua.publicB64, auth);
  assert.notEqual(b64urlEncode(a), b64urlEncode(b));
  assert.deepEqual(await decrypt(a, ua.privateB64, ua.publicB64, auth), msg);
  assert.deepEqual(await decrypt(b, ua.privateB64, ua.publicB64, auth), msg);
  const bad = b64urlDecode(ua.publicB64);
  bad[64] ^= 1; // y 를 한 비트 바꾸면 곡선 위 점이 아니다
  await assert.rejects(encryptPayload(msg, b64urlEncode(bad), auth));
  await assert.rejects(encryptPayload(new Uint8Array(MAX_PLAINTEXT + 1), ua.publicB64, auth), /too large/);
});

test('RFC 8292: JWT 앞부분이 예제와 같고, 예제 서명이 예제 공개키로 검증된다', async () => {
  const [h, c, s] = VAPID_RFC.jwt.split('.');
  assert.equal(vapidSigningInput(VAPID_RFC.aud, VAPID_RFC.exp, VAPID_RFC.sub), `${h}.${c}`);
  const pub = await crypto.subtle.importKey('raw', b64urlDecode(VAPID_RFC.k), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(ok, 'RFC 8292 예제 서명 검증');
  assert.equal(b64urlDecode(s).length, 64, 'JWS ES256 서명은 r‖s 64바이트');
});

test('VAPID: 임시 키로 만든 JWT·Authorization 헤더가 검증된다', async () => {
  const k = await tempKeyPair('ECDSA');
  const env = { VAPID_PUBLIC_KEY: k.publicB64, VAPID_PRIVATE_KEY: k.privateB64, VAPID_SUBJECT: 'mailto:test@example.com' };
  const now = Date.UTC(2026, 10, 10);
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', env, now);
  const m = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.ok(m);
  assert.equal(m[2], k.publicB64);
  const [h, c, s] = m[1].split('.');
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)));
  assert.deepEqual(claims, { aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'mailto:test@example.com' });
  assert.deepEqual(JSON.parse(new TextDecoder().decode(b64urlDecode(h))), { typ: 'JWT', alg: 'ES256' });
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.pair.publicKey, b64urlDecode(s), new TextEncoder().encode(`${h}.${c}`));
  assert.ok(ok);
  // vapidJwt 를 직접 불러도 같은 키로 검증
  const key = await importP256Private(k.privateB64, k.publicB64, 'ECDSA');
  const jwt = await vapidJwt(key, VAPID_RFC.aud, VAPID_RFC.exp, VAPID_RFC.sub);
  const [h2, c2, s2] = jwt.split('.');
  assert.equal(`${h2}.${c2}`, vapidSigningInput(VAPID_RFC.aud, VAPID_RFC.exp, VAPID_RFC.sub));
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, k.pair.publicKey, b64urlDecode(s2), new TextEncoder().encode(`${h2}.${c2}`)));
  // 잘못된 subject 는 거절
  await assert.rejects(vapidAuthorization('https://x.example/', { ...env, VAPID_SUBJECT: 'test@example.com' }));
});

test('sendPush: 요청 모양, 201 ok · 410/404 gone · 429/503 retry, 키 값은 오류에 안 나온다', async () => {
  const k = await tempKeyPair('ECDSA');
  const env = { VAPID_PUBLIC_KEY: k.publicB64, VAPID_PRIVATE_KEY: k.privateB64, VAPID_SUBJECT: 'https://marathon82.com' };
  const ua = await tempKeyPair('ECDH');
  const sub = { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc', keys: { p256dh: ua.publicB64, auth: b64urlEncode(crypto.getRandomValues(new Uint8Array(16))) } };
  const payload = { title: '서울마라톤 접수 시작 D-3', body: '11월 13일 접수 시작', url: '/r/seoul', tag: 'seoul:opens' };
  let seen: { url: string; init: RequestInit } | null = null;
  const reply = (status: number) => (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(status === 201 ? null : 'x', { status });
  }) as unknown as typeof fetch;

  assert.deepEqual(await sendPush(sub, payload, env, { fetch: reply(201) }), { ok: true, status: 201 });
  const got = seen as unknown as { url: string; init: RequestInit };
  const hd = got.init.headers as Record<string, string>;
  assert.equal(got.url, sub.endpoint);
  assert.equal(hd['Content-Encoding'], 'aes128gcm');
  assert.equal(hd.TTL, '86400');
  assert.match(hd.Authorization, /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/);
  const sent = got.init.body as Uint8Array<ArrayBuffer>;
  const plain = JSON.parse(new TextDecoder().decode(await decrypt(sent, ua.privateB64, ua.publicB64, sub.keys.auth)));
  assert.deepEqual(plain, payload);

  for (const [status, gone, retry] of [[410, true, false], [404, true, false], [429, false, true], [503, false, true], [400, false, false]] as const) {
    const r = await sendPush(sub, payload, env, { fetch: reply(status) });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.gone, gone, `status ${status} gone`);
      assert.equal(r.retry, retry, `status ${status} retry`);
    }
  }
  const net = await sendPush(sub, payload, env, { fetch: (async () => { throw new Error('offline'); }) as unknown as typeof fetch });
  assert.ok(!net.ok && net.retry);

  // 비밀값이 없거나 짝이 틀리면 던지고, 오류 문구에 키 값이 없다
  await assert.rejects(sendPush(sub, payload, { ...env, VAPID_PRIVATE_KEY: '' }), /not set/);
  const other = await tempKeyPair('ECDSA');
  await assert.rejects(
    sendPush(sub, payload, { ...env, VAPID_PRIVATE_KEY: other.privateB64 + 'A' }),
    (e: Error) => !e.message.includes(env.VAPID_PUBLIC_KEY) && !e.message.includes(other.privateB64),
  );
});

test('encodePayload: 너무 긴 본문은 레코드 하나에 들어가게 줄인다', () => {
  const p = encodePayload({ title: 't', body: '가'.repeat(5000), url: '/' });
  assert.ok(p.length <= MAX_PLAINTEXT);
  assert.ok(JSON.parse(new TextDecoder().decode(p)).body.endsWith('…'));
});
