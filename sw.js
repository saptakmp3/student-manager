/* Student Ledger offline app shell. Bump CACHE_VERSION for each published release. */
const CACHE_VERSION = 'student-ledger-shell-v1';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    await cache.addAll(APP_SHELL.map(path => new Request(new URL(path, self.registration.scope), {cache: 'reload'})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('student-ledger-shell-') && name !== CACHE_VERSION).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const base = new URL(self.registration.scope);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;

  // Navigation is network-first so deployments update promptly; cached HTML is the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const response = await fetch(request, {cache: 'no-store'});
        if (response.ok) await cache.put(new URL('./index.html', base), response.clone());
        return response;
      } catch (_) {
        return (await cache.match(request)) || (await cache.match(new URL('./index.html', base))) || Response.error();
      }
    })());
    return;
  }

  // Same-origin app assets are network-first and refreshed in the cache after a successful response.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    try {
      const response = await fetch(request, {cache: 'no-store'});
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return (await cache.match(request)) || Response.error();
    }
  })());
});
