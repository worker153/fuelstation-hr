/**
 * FuelStation HR — Service Worker
 * Strategy: Network-first for API calls, cache-first for static assets,
 * offline fallback to cached shell for navigation.
 */

const CACHE_VERSION  = 'v8';
const SHELL_CACHE    = `fuelstation-shell-${CACHE_VERSION}`;
const ASSET_CACHE    = `fuelstation-assets-${CACHE_VERSION}`;
const API_BASE       = '/api';

// Pre-cache the app shell on install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache =>
      cache.addAll(['/index.html', '/terminal', '/worker', '/'])
        .catch(() => cache.add('/index.html'))  // SPA routes may 404 — that's OK
    )
  );
  self.skipWaiting();
});

// Clean up old caches on activate
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== ASSET_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, cross-origin, and API requests — let them go to network
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(API_BASE)) return;
  // Skip face-api CDN — large models, don't cache in SW
  if (url.hostname.includes('jsdelivr') || url.hostname.includes('cdn')) return;

  // ── Navigation requests (HTML pages) ─────────────────────────────────────────
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(res => {
          // Cache a fresh copy of the shell
          const clone = res.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put('/index.html', clone));
          return res;
        })
        .catch(async () => {
          // Offline → serve cached shell (React Router handles the route client-side)
          const cached = await caches.match('/index.html');
          if (cached) return cached;
          return new Response('<h1>Offline</h1><p>Open the app when online to cache it first.</p>',
            { headers: { 'Content-Type': 'text/html' } });
        })
    );
    return;
  }

  // ── Static assets (JS, CSS, fonts, images) — stale-while-revalidate ──────────
  event.respondWith(
    caches.open(ASSET_CACHE).then(async cache => {
      const cached = await cache.match(request);

      const networkFetch = fetch(request).then(res => {
        if (res.ok) cache.put(request, res.clone());
        return res;
      }).catch(() => null);

      // Return cached immediately; update in background
      if (cached) {
        event.waitUntil(networkFetch);
        return cached;
      }

      // Not cached → wait for network
      const fresh = await networkFetch;
      return fresh || new Response('', { status: 408 });
    })
  );
});

// Listen for skip-waiting message from app
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
