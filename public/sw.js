/// <reference lib="WebWorker" />
const SW_VERSION = 'v16'; // bump to update clients

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

// ---- Minimal IndexedDB queue for offline API writes ----
const DB_NAME = 'scout-logger-sw';
const DB_STORE = 'api-queue';

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueRequest(record) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).add(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function drainQueue() {
  const db = await idbOpen();
  const pending = [];
  await new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    const getAllReq = store.getAll();
    getAllReq.onsuccess = () => {
      pending.push(...(getAllReq.result || []));
      resolve();
    };
    getAllReq.onerror = () => reject(getAllReq.error);
  });

  for (const rec of pending) {
    try {
      const { url, method, headers, body } = rec;
      const res = await fetch(url, {
        method,
        headers: new Headers(headers || {}),
        body: body ? (headers && headers['Content-Type'] === 'application/json'
          ? JSON.stringify(body)
          : body) : undefined,
        credentials: 'same-origin'
      });
      if (!res.ok) throw new Error('retry failed ' + res.status);

      // delete on success
      const db2 = await idbOpen();
      await new Promise((resolve, reject) => {
        const tx = db2.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(rec.id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (_) {
      // leave it queued; we’ll retry next sync/focus
    }
  }
}

// Install: precache app shell
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SW_VERSION).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

// Activate: cleanup old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== SW_VERSION ? caches.delete(k) : null)));
      await self.clients.claim();
      // attempt initial drain in case user reloaded online
      try { await drainQueue(); } catch {}
    })()
  );
});

// Background sync to flush queued API writes
self.addEventListener('sync', (event) => {
  if (event.tag === 'api-sync') {
    event.waitUntil(drainQueue());
  }
});

// Helper: simple SW-side stale-while-revalidate for GET
async function staleWhileRevalidate(req) {
  const cache = await caches.open(SW_VERSION);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req)
    .then((res) => {
      const copy = res.clone();
      // only cache successful basic/same-origin
      if (res.ok && (copy.type === 'basic' || new URL(req.url).origin === self.location.origin)) {
        cache.put(req, copy);
      }
      return res;
    })
    .catch(() => null);
  return cached || fetchPromise || caches.match('/index.html');
}

// Fetch
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Ignore non-http(s)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // ---- Non-GET (POST/PUT/DELETE): try network-first, queue if offline ----
  if (req.method !== 'GET') {
    const isApi = url.origin === self.location.origin && url.pathname.startsWith('/api/');
    if (!isApi) return; // let browser handle non-API writes

    e.respondWith((async () => {
      try {
        const res = await fetch(req.clone());
        return res;
      } catch (_) {
        // serialize minimal request for queue
        let body = null;
        if (req.headers.get('Content-Type')?.includes('application/json')) {
          try { body = await req.clone().json(); } catch { body = null; }
        } else {
          try { body = await req.clone().text(); } catch { body = null; }
        }
        const headers = {};
        req.headers.forEach((v, k) => { headers[k] = v; });

        await queueRequest({ url: req.url, method: req.method, headers, body });
        // attempt to register background sync
        if ('sync' in self.registration) {
          try { await self.registration.sync.register('api-sync'); } catch {}
        }
        // Accept and let UI proceed optimistically
        return new Response(JSON.stringify({ queued: true }), {
          status: 202,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    })());
    return;
  }

  // ---- Navigations: online-first, fallback to shell ----
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // ---- Static assets (same-origin): cache-first ----
  const isStatic =
    url.origin === self.location.origin &&
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
          const copy = res.clone();
          if (res.ok && (copy.type === 'basic' || url.origin === self.location.origin)) {
            caches.open(SW_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => caches.match('/index.html'))
      )
    );
    return;
  }

  // ---- API GETs: stale-while-revalidate (but never cache auth endpoints) ----
  const isApiGet = url.origin === self.location.origin && url.pathname.startsWith('/api/');
  const isAuth = /\/api\/(login|users|refresh|logout)/.test(url.pathname);
  if (isApiGet && !isAuth) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  // ---- Everything else: network-first, fallback to cache ----
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      if (res.ok && (copy.type === 'basic' || url.origin === self.location.origin)) {
        caches.open(SW_VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req))
  );
});

// Optional: try draining queue when a client becomes visible (fallback when Sync unsupported)
self.addEventListener('message', (event) => {
  if (event.data === 'flush-api-queue') {
    event.waitUntil(drainQueue());
  }
});
