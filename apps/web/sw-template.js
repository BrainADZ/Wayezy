/* WAY EZY service worker — generated at build time (see vite.config.ts). Do not edit dist/client/sw.js. */
/* global self, caches, fetch, URL, Response */
const BUILD_ID = '__BUILD_ID__';
const PRECACHE = __PRECACHE__;
const SHELL_CACHE = `wez-shell-${BUILD_ID}`;
const MEDIA_CACHE = 'wez-media-v1';
const SHELL_URL = '/index.html';
const NAVIGATION_TIMEOUT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // The app shell must be cached; individual optional assets may fail without blocking install.
      await cache.add(new Request(SHELL_URL, { cache: 'reload' }));
      await Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key.startsWith('wez-shell-') && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'cache-media' && Array.isArray(data.urls)) {
    event.waitUntil(
      cacheMedia(data.urls.filter((u) => typeof u === 'string' && u.startsWith('/')).slice(0, 400)),
    );
  }
});

async function cacheMedia(urls) {
  const cache = await caches.open(MEDIA_CACHE);
  const wanted = new Set(urls.map((u) => new URL(u, self.location.origin).href));
  // Evict media that is no longer published so storage does not grow forever.
  for (const request of await cache.keys())
    if (!wanted.has(request.url)) await cache.delete(request);
  for (const url of wanted) {
    if (await cache.match(url)) continue;
    try {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (response.ok && response.status === 200) await cache.put(url, response);
    } catch {
      /* offline right now; retried on the next publish */
    }
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Live data is handled by the app (localStorage snapshot + queued analytics); never serve it from the SW.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (
    url.pathname.startsWith('/assets/') ||
    PRECACHE.includes(url.pathname) ||
    PRECACHE.includes(url.pathname + url.search)
  ) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }
  if (
    /^\/(media|demo|brand|icons)\//.test(url.pathname) ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/manifest.webmanifest'
  ) {
    // Range requests (video seeking) go straight to the network; full responses are cached.
    if (request.headers.has('range')) return;
    event.respondWith(cacheFirst(request, MEDIA_CACHE));
  }
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS),
      ),
    ]);
    if (response.ok && (response.headers.get('content-type') || '').includes('text/html'))
      await cache.put(SHELL_URL, response.clone());
    return response;
  } catch {
    const cached = await cache.match(SHELL_URL);
    return (
      cached ||
      new Response('<h1>WAY EZY is offline</h1><p>Please try again in a moment.</p>', {
        status: 503,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.status === 200) await cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('', { status: 504 });
  }
}
