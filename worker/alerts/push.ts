/**
 * 웹 푸시 보내기 — Cloudflare Workers 의 WebCrypto 만 쓴다 (node 전용 라이브러리 없음, 다른 파일 import 없음).
 *  - 암호화: RFC 8291 (Message Encryption for Web Push) + RFC 8188 aes128gcm, 레코드 하나.
 *  - 보낸 쪽 인증: RFC 8292 VAPID — JWT(ES256) 를 VAPID 비밀키로 서명해 'Authorization: vapid t=…, k=…'.
 *  - 비밀값은 env 로만 받는다: VAPID_PRIVATE_KEY(base64url 32바이트), VAPID_PUBLIC_KEY(base64url 65바이트 비압축 점),
 *    VAPID_SUBJECT('mailto:…' 또는 'https://…'). 키 값은 오류 문구·로그에 넣지 않는다.
 *  - 푸시 서비스가 410 Gone / 404 Not Found 로 답하면 그 구독은 끝난 것 → gone: true (부르는 쪽이 DB 에서 지운다).
 * 시험: worker/alerts/push.test.ts (RFC 8291 부록 A·RFC 8292 그림 1·2 예제 값과 대조).
 */

export interface PushSubscriptionRecord {
  endpoint: string;
  /** 브라우저 PushSubscription.toJSON().keys 그대로 (base64url) */
  keys: { p256dh: string; auth: string };
}

/** 서비스 워커(public/sw.js)가 받는 내용 */
export interface PushPayload {
  title: string;
  body: string;
  /** 누르면 열 우리 사이트 주소 (예: /r/seoul-2027). 다른 사이트 주소는 sw.js 가 첫 화면으로 바꾼다 */
  url: string;
  /** 같은 tag 의 알림은 새 것이 이전 것을 바꾼다 */
  tag?: string;
  lang?: 'ko' | 'en';
}

export interface VapidEnv {
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
}

export interface SendOptions {
  /** 기기가 꺼져 있을 때 푸시 서비스가 들고 있을 시간(초). 기본 하루 */
  ttl?: number;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
  /** 시험용으로 바꿔 끼우는 fetch */
  fetch?: typeof fetch;
}

export type PushResult =
  | { ok: true; status: number }
  /** gone: 410/404 — 구독이 끝났으니 지울 것. retry: 429·5xx·네트워크 오류 — 나중에 다시 보내 볼 만함 */
  | { ok: false; status: number; gone: boolean; retry: boolean; error: string };

/* ── base64url ──────────────────────────────────────────────────────────────────────────── */

export function b64urlEncode(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(text: string): Uint8Array<ArrayBuffer> {
  const clean = text.replace(/\s+/g, '').replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
  if (/[^A-Za-z0-9+/]/.test(clean)) throw new Error('invalid base64url');
  const bin = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const utf8 = (s: string) => new TextEncoder().encode(s);

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/* ── 키 ──────────────────────────────────────────────────────────────────────────────────── */

/** 비압축 P-256 공개키(0x04‖x‖y, 65바이트) → JWK 의 x·y */
function pointToXY(raw: Uint8Array): { x: string; y: string } {
  if (raw.length !== 65 || raw[0] !== 4) throw new Error('P-256 public key must be 65 bytes, uncompressed');
  return { x: b64urlEncode(raw.subarray(1, 33)), y: b64urlEncode(raw.subarray(33, 65)) };
}

/** base64url 비밀값 d 와 공개키로 P-256 비밀키 만들기 (VAPID 서명·시험용 ECDH 공용) */
export async function importP256Private(dB64: string, publicB64: string, alg: 'ECDSA' | 'ECDH'): Promise<CryptoKey> {
  const d = b64urlDecode(dB64);
  if (d.length !== 32) throw new Error('P-256 private key must be 32 bytes');
  const jwk: JsonWebKey = { kty: 'EC', crv: 'P-256', d: b64urlEncode(d), ...pointToXY(b64urlDecode(publicB64)), ext: false };
  return crypto.subtle.importKey('jwk', jwk, { name: alg, namedCurve: 'P-256' }, false, alg === 'ECDSA' ? ['sign'] : ['deriveBits']);
}

// 워커 인스턴스 안에서 VAPID 비밀키를 한 번만 읽는다 (비밀값이 바뀌면 다시)
let vapidKey: { pub: string; priv: string; key: Promise<CryptoKey> } | null = null;
function vapidSigningKey(env: VapidEnv): Promise<CryptoKey> {
  if (!vapidKey || vapidKey.pub !== env.VAPID_PUBLIC_KEY || vapidKey.priv !== env.VAPID_PRIVATE_KEY) {
    const key = importP256Private(env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY, 'ECDSA').catch(() => {
      vapidKey = null;
      // 원래 오류(키 값이 섞일 수 있음) 대신 이름만
      throw new Error('VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY are not a valid P-256 key pair');
    });
    vapidKey = { pub: env.VAPID_PUBLIC_KEY, priv: env.VAPID_PRIVATE_KEY, key };
  }
  return vapidKey.key;
}

/* ── VAPID (RFC 8292) ─────────────────────────────────────────────────────────────────────── */

/** 서명할 JWT 앞부분 'header.claims' — 키 순서는 RFC 8292 예제와 같게(typ, alg / aud, exp, sub) */
export function vapidSigningInput(aud: string, exp: number, sub: string): string {
  const enc = (o: unknown) => b64urlEncode(utf8(JSON.stringify(o)));
  return `${enc({ typ: 'JWT', alg: 'ES256' })}.${enc({ aud, exp, sub })}`;
}

/** ES256 JWT. WebCrypto ECDSA 서명은 r‖s 64바이트(IEEE P1363)라 JWS 형식 그대로다 */
export async function vapidJwt(key: CryptoKey, aud: string, exp: number, sub: string): Promise<string> {
  const input = vapidSigningInput(aud, exp, sub);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(input));
  return `${input}.${b64urlEncode(sig)}`;
}

/** Authorization 헤더 값. aud = 푸시 서비스 주소의 origin, 만료는 12시간 뒤 (RFC 8292: 24시간 넘으면 안 됨) */
export async function vapidAuthorization(endpoint: string, env: VapidEnv, now = Date.now()): Promise<string> {
  if (!/^(mailto:|https:\/\/)/.test(env.VAPID_SUBJECT ?? '')) throw new Error('VAPID_SUBJECT must start with mailto: or https://');
  const aud = new URL(endpoint).origin;
  const jwt = await vapidJwt(await vapidSigningKey(env), aud, Math.floor(now / 1000) + 12 * 3600, env.VAPID_SUBJECT);
  return `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`;
}

/* ── 암호화 (RFC 8291 + RFC 8188 aes128gcm) ────────────────────────────────────────────────── */

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}

export interface EncryptOptions {
  /** 시험용: 보내는 쪽 임시 키 (없으면 보낼 때마다 새로 만든다) */
  asKeys?: { privateKey: CryptoKey; publicRaw: Uint8Array };
  /** 시험용: 16바이트 salt (없으면 무작위) */
  salt?: Uint8Array;
  /** 레코드 크기 (기본 4096) */
  rs?: number;
}

export const RECORD_SIZE = 4096;
/** 레코드 하나에 들어가는 평문 최대 길이: rs − 태그 16 − 구분 바이트 1 */
export const MAX_PLAINTEXT = RECORD_SIZE - 16 - 1;

/**
 * 받는 기기의 공개키(p256dh)·auth 로 평문을 암호화해 aes128gcm 본문(머리 86바이트 + 암호문)을 만든다.
 * 받는 기기 공개키는 importKey 가 P-256 곡선 위의 점인지 확인한다(RFC 8291 §6).
 */
export async function encryptPayload(
  plaintext: Uint8Array,
  uaPublicB64: string,
  authB64: string,
  opts: EncryptOptions = {},
): Promise<Uint8Array<ArrayBuffer>> {
  const rs = opts.rs ?? RECORD_SIZE;
  if (plaintext.length > rs - 17) throw new Error(`push payload too large (${plaintext.length} bytes)`);
  const uaPublic = b64urlDecode(uaPublicB64);
  const authSecret = b64urlDecode(authB64);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh must be a 65-byte uncompressed P-256 key');
  if (authSecret.length !== 16) throw new Error('auth secret must be 16 bytes');
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  let as = opts.asKeys;
  if (!as) {
    const pair = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])) as CryptoKeyPair;
    as = { privateKey: pair.privateKey, publicRaw: new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)) };
  }
  const asPublic = concat(as.publicRaw);
  const salt = opts.salt ? concat(opts.salt) : crypto.getRandomValues(new Uint8Array(16));
  if (salt.length !== 16) throw new Error('salt must be 16 bytes');

  // ecdh_secret → (auth_secret 로) IKM → (salt 로) CEK·NONCE
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const keyInfo = concat(utf8('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdh, keyInfo, 32);
  const cek = await hkdf(salt, ikm, concat(utf8('Content-Encoding: aes128gcm\0')), 16);
  const nonce = await hkdf(salt, ikm, concat(utf8('Content-Encoding: nonce\0')), 12);

  // 마지막(유일한) 레코드: 평문 ‖ 0x02, 덧붙임 없음
  const record = concat(plaintext, new Uint8Array([2]));
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, aes, record));

  // 머리: salt(16) ‖ rs(4, big-endian) ‖ idlen(1) ‖ keyid(= 보내는 쪽 공개키 65)
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, rs);
  header[20] = asPublic.length;
  return concat(header, asPublic, ct);
}

/* ── 보내기 ───────────────────────────────────────────────────────────────────────────────── */

/** 알림 내용을 JSON 으로. 너무 길면 본문을 줄인다 (레코드 하나에 들어가게) */
export function encodePayload(p: PushPayload): Uint8Array {
  let body = p.body;
  for (;;) {
    const bytes = utf8(JSON.stringify({ ...p, body }));
    if (bytes.length <= MAX_PLAINTEXT) return bytes;
    if (!body) throw new Error('push payload too large');
    body = body.slice(0, Math.max(0, Math.floor(body.length * 0.8) - 1)) + '…';
    if (body === '…') body = '';
  }
}

/**
 * 기기 하나에 알림 하나를 보낸다. 던지지 않고 결과로 돌려준다 (여러 기기에 보낼 때 하나가 실패해도 계속).
 * 단, VAPID 비밀값이 없거나 틀리면 모든 기기가 같은 이유로 실패하므로 그때는 던진다.
 */
export async function sendPush(sub: PushSubscriptionRecord, payload: PushPayload, env: VapidEnv, opts: SendOptions = {}): Promise<PushResult> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_SUBJECT) {
    throw new Error('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT are not set');
  }
  let url: URL;
  try {
    url = new URL(sub.endpoint);
    if (url.protocol !== 'https:') throw new Error();
  } catch {
    return { ok: false, status: 0, gone: true, retry: false, error: 'invalid endpoint' };
  }
  let body: Uint8Array<ArrayBuffer>;
  try {
    body = await encryptPayload(encodePayload(payload), sub.keys.p256dh, sub.keys.auth);
  } catch (e) {
    // 기기 키가 망가진 구독 — 다시 보내도 안 된다. 다만 우리 쪽 잘못일 수도 있어 자동으로 지우지는 않는다(gone: false)
    return { ok: false, status: 0, gone: false, retry: false, error: `bad subscription keys: ${(e as Error).message}` };
  }
  const authorization = await vapidAuthorization(url.href, env);
  const doFetch = opts.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(url.href, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(opts.ttl ?? 86400),
        Urgency: opts.urgency ?? 'normal',
      },
      body,
    });
  } catch (e) {
    return { ok: false, status: 0, gone: false, retry: true, error: `network: ${(e as Error).message}` };
  }
  if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
  const text = (await res.text().catch(() => '')).slice(0, 200);
  const gone = res.status === 404 || res.status === 410;
  const retry = res.status === 429 || res.status >= 500;
  return { ok: false, status: res.status, gone, retry, error: text || res.statusText };
}
