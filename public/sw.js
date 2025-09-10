/// <reference lib="WebWorker" />
const SW_VERSION = 'v13'; // bump to update clients

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// Install: precache app shell
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SW_VERSION).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== SW_VERSION ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Fetch: only handle safe GET http(s) requests
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // Ignore anything that isn't a GET (avoids "POST is unsupported" error)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Ignore non-http(s) schemes (fixes chrome-extension://, data:, etc.)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // Navigations: online-first with fallback to cached index.html
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
}

  // Static assets: cache-first
  const isStatic =
    url.origin === location.origin &&
    (
      url.pathname === '/' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.css') ||
      url.pathname.endsWith('.js') ||
      url.pathname.endsWith('.png') ||
      url.pathname.endsWith('.jpg') ||
      url.pathname.endsWith('.jpeg') ||
      url.pathname.endsWith('.svg') ||
      url.pathname.endsWith('.webp') ||
      url.pathname.endsWith('.ico') ||
      url.pathname.startsWith('/icon-')
    );

  if (isStatic) {
    e.respondWith(
      caches.match(req).then((cached) =>
        cached ||
        fetch(req).then((res) => {
          // only cache successful same-origin/basic responses
          const copy = res.clone();
          if (res.ok && (copy.type === 'basic' || url.origin === location.origin)) {
            caches.open(SW_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => caches.match('/index.html'))
      )
    );
    return;
  }

  // Everything else: network-first, fallback to cache
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      if (res.ok && (copy.type === 'basic' || url.origin === location.origin)) {
        caches.open(SW_VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});
