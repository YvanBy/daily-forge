const CACHE_NAME = 'daily-forge-v3';
const BASE = self.location.pathname.replace(/\/service-worker\.js$/, '');

const LOCAL_ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/app.js',
  BASE + '/styles.css',
  BASE + '/manifest.json',
  BASE + '/icons/icon.svg',
  BASE + '/icons/icon-192.png',
  BASE + '/icons/icon-512.png',
];

// Install: pre-cache all local assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      // Use individual adds so one missing icon doesn't abort the whole install
      Promise.allSettled(LOCAL_ASSETS.map(url => cache.add(url)))
    )
  );
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch: cache-first, fall back to network and cache the response
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Cache successful responses (not opaque/error)
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline and not in cache — nothing we can do
        return new Response('Offline', { status: 503 });
      });
    })
  );
});
