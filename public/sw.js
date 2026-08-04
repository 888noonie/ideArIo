/*
 * Ideario service worker — cache-first app shell for offline use.
 * - Precaches the app shell on install.
 * - Runtime-caches same-origin static assets (JS/CSS/fonts/images) cache-first.
 * - NEVER caches /api/* or cross-origin requests (NVIDIA proxy, GitHub).
 * - Navigation requests fall back to the cached shell when offline.
 */

const SHELL_CACHE = 'ideario-shell-v4';
const RUNTIME_CACHE = 'ideario-runtime-v4';

const SHELL_ASSETS = ['/', '/index.html', '/manifest.json', '/favicon.svg', '/icons.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== RUNTIME_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET requests are cacheable.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API calls or cross-origin requests.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // Navigation requests: network-first, fall back to cached shell offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() =>
          caches.match('/index.html').then((cached) => cached || caches.match('/'))
        )
    );
    return;
  }

  // Static assets: cache-first, then network + runtime cache.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
