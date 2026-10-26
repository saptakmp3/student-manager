/* Student Manager offline app shell. Pages and assets are network-first, so a new deploy shows up on the next
   open; the cache is only the offline fallback. Bump CACHE_VERSION if you ever change the file list below. */
const CACHE_VERSION = 'student-manager-shell-v3';
const FONT_CACHE = 'student-manager-fonts-v1';
const APP_SHELL = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];
const OLD_PREFIXES = ['student-ledger-shell-', 'student-manager-shell-'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // One missing file (an icon, say) must not stop the worker installing, so add each file on its own.
    await Promise.all(APP_SHELL.map(async path => {
      try {
        const response = await fetch(new Request(new URL(path, self.registration.scope), { cache: 'reload' }));
        if (response.ok) await cache.put(new URL(path, self.registration.scope), response);
      } catch (_) { /* offline during install, or file not deployed yet */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter(name => OLD_PREFIXES.some(prefix => name.startsWith(prefix)) && name !== CACHE_VERSION)
      .map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

// Only complete, successful responses go into the cache (a partial 206 would make cache.put throw).
const cacheable = response => response && response.ok && response.status === 200;

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Google Fonts: cache-first so the app keeps its typography offline.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith((async () => {
      const cache = await caches.open(FONT_CACHE);
      const hit = await cache.match(request);
      if (hit) return hit;
      try {
        const response = await fetch(request);
        if (response && (response.ok || response.type === 'opaque')) await cache.put(request, response.clone());
        return response;
      } catch (_) {
        return Response.error();
      }
    })());
    return;
  }

  const base = new URL(self.registration.scope);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;

  // Navigation is network-first so deployments update promptly; cached HTML is the offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_VERSION);
      try {
        const response = await fetch(request, { cache: 'no-store' });
        if (cacheable(response)) await cache.put(new URL('./index.html', base), response.clone());
        return response;
      } catch (_) {
        return (await cache.match(new URL('./index.html', base))) || (await cache.match(request, { ignoreSearch: true })) || Response.error();
      }
    })());
    return;
  }

  // Same-origin app assets: network-first, refreshed in the cache after each successful response.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_VERSION);
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (cacheable(response)) await cache.put(request, response.clone());
      return response;
    } catch (_) {
      return (await cache.match(request, { ignoreSearch: true })) || Response.error();
    }
  })());
});

self.addEventListener('push', event => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch (_) {}
  const icon = new URL('./icon-192.png', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(message.title || 'Student Manager', {
    body: message.body || 'You have a class reminder.',
    tag: message.tag || 'student-manager-reminder',
    icon,
    badge: icon,
    data: { url: new URL('./#today', self.registration.scope).href },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
        await client.focus();
        // Reminders are about today's classes, so land on the Today tab.
        if ('navigate' in client) { try { await client.navigate(target); } catch (_) {} }
        return;
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  })());
});
