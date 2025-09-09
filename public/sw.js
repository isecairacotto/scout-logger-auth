/// <reference lib="WebWorker" />
const SW_VERSION = 'v5'; // bump to bust old caches
const APP_SHELL = [
  '/',                 // make sure your server serves index.html here
  '/index.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
  // add any other static files you serve (css/js if separate)
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(SW_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
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

// Network strategy:
// - Navigations: return cached app shell fallback (offline HTML)
// - Static files: cache-first
// - Everything else: try network, fall back to cache
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // 1) Handle navigations (address bar / SPA deep-links)
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
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

  // 2) Static assets: cache-first
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

  // 3) Default: network-first, fallback to cache
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
