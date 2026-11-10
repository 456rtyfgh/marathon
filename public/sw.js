/*
 * 마라톤 캘린더 서비스 워커 — 휴대폰 알림(웹 푸시)만 한다.
 * - fetch 이벤트를 듣지 않는다 = 캐시·오프라인 없음, 사이트 요청은 지금과 똑같이 네트워크로 간다.
 * - 보내는 쪽: worker/alerts/push.ts. 내용(JSON): { title, body, url, tag? }
 *   url 은 우리 사이트 안 주소만 연다 (다른 주소면 첫 화면).
 */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = typeof data.title === 'string' && data.title ? data.title : '마라톤 캘린더';
  const options = {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/brand/logo-192.png',
    badge: '/brand/badge-96.png',
    lang: data.lang === 'en' ? 'en' : 'ko',
    data: { url: typeof data.url === 'string' ? data.url : '/' },
  };
  // 같은 대회·같은 알림은 하나로 (tag 가 같으면 새 알림이 이전 것을 바꾼다)
  if (typeof data.tag === 'string' && data.tag) options.tag = data.tag;
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url;
  try {
    url = new URL(event.notification.data && event.notification.data.url ? event.notification.data.url : '/', self.location.origin);
    if (url.origin !== self.location.origin) url = new URL('/', self.location.origin);
  } catch {
    url = new URL('/', self.location.origin);
  }
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      // 이미 그 주소가 열려 있으면 그 창으로, 아니면 새 창
      for (const w of wins) {
        if (w.url === url.href && 'focus' in w) return w.focus();
      }
      return self.clients.openWindow(url.href);
    })(),
  );
});
