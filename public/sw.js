/// <reference lib="WebWorker" />
const SW_VERSION = 'v12'; // bump to invalidate old caches
const APP_SHELL = [
  '/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png', '/db.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SW_VERSION).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== SW_VERSION ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 🚫 Never cache API calls; go network-only and don't store responses
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(req).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Navigations: app-shell fallback
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  const url = new URL(req.url);
  const isStatic =
    url.origin === location.origin &&
    (url.pathname.endsWith('.png') ||
     url.pathname.endsWith('.jpg') ||
     url.pathname.endsWith('.svg') ||
     url.pathname.endsWith('.webp') ||
     url.pathname.endsWith('.ico') ||
     url.pathname.endsWith('.css') ||
     url.pathname.endsWith('.js') ||
     url.pathname === '/');

  // Static: cache-first
  if (isStatic) {
    e.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(SW_VERSION).then((c) => c.put(req, copy));
          return res;
        }).catch(() => caches.match('/index.html'))
      )
    );
    return;
  }

  // Default: network-first, fallback to cache
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(SW_VERSION).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
