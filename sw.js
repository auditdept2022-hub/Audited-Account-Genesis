const CACHE_NAME = 'gaa-dashboard-v2'; // bumped so old cached API responses from v1 get purged
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

/* Network-first for navigations/HTML (so you always get the latest dashboard
   when online), falling back to the cached copy when offline. Cache-first for
   everything else (icons, manifest) since those rarely change. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  // Never cache calls to the Apps Script backend (getRecords, saveAllRecords,
  // getActivityLog, etc). These are cross-origin (script.google.com) GET/POST
  // requests, not static assets — caching them was the actual bug behind
  // edits reverting after refresh: once a getRecords response got cached
  // here, EVERY later refresh returned that same stale snapshot straight
  // from the cache and never touched the network again, even though the
  // Google Sheet itself already had the correct, up-to-date data.
  const isSameOrigin = new URL(req.url).origin === self.location.origin;
  if (!isSameOrigin) {
    event.respondWith(fetch(req));
    return;
  }

  // Cache-first is fine for same-origin static assets (icons, manifest,
  // this file's own precached shell) since those rarely change.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        return res;
      }).catch(() => cached);
    })
  );
});
