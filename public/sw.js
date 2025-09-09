/// <reference lib="WebWorker" />
const SW_VERSION = 'v8'; // bump to invalidate old caches
const APP_SHELL = [
  '/',               // index.html served here
  '/index.html',
  '/manifest.jsopn', // <-- use your actual manifest filename
  '/icon-192.png',   // <-- icons at root, to match your manifest
  '/icon-512.png',
  '/db.js'
  // add more static files here if you later split CSS/JS
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
