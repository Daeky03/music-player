/* Service Worker for SLP
   - caches app shell
   - handles fetch: serves cached assets, proxies /stream/ requests to network (allows streaming)
   - notification actions: prev, rew, toggle, ff, next -> postMessage to clients
*/

const CACHE_NAME = 'slp-shell-v1';
const ASSETS = [
  '/', '/index.html', '/js/app.js', '/icons/icon-192.png', '/icons/icon-512.png',
  '/manifest.json'
];

// Install: cache app shell
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(err => console.warn('SW cache addAll failed', err)))
  );
});

// Activate: cleanup old caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE_NAME) ? caches.delete(k) : Promise.resolve()))).then(() => self.clients.claim())
  );
});

// Fetch: serve static from cache, fallback to network
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Special: stream proxy requests (same-origin /stream/*)
  if (url.pathname.startsWith('/stream/')) {
    // Let the network handle stream (avoid caching huge binary), but we forward Range header transparently.
    e.respondWith(fetch(req).catch(err => {
      // fallback: if offline, try to serve from cache (if previously cached)
      return caches.match(req).then(r => r || new Response('', { status: 503, statusText: 'Offline' }));
    }));
    return;
  }

  // For navigation (app shell) serve index.html
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('/index.html').then(resp => resp || fetch(req).then(r => {
        // Optional: cache on the fly
        const clone = r.clone();
        caches.open(CACHE_NAME).then(c => c.put('/index.html', clone));
        return r;
      })).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For other assets: cache-first for known assets, network-first otherwise
  if (ASSETS.includes(url.pathname) || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.png') || url.pathname.endsWith('.webmanifest')) {
    e.respondWith(
      caches.match(req).then(cached => cached || fetch(req).then(net => {
        // optionally cache
        return caches.open(CACHE_NAME).then(cache => { cache.put(req, net.clone()); return net; });
      }))
    );
    return;
  }

  // Default: network-first then fallback to cache
  e.respondWith(
    fetch(req).catch(() => caches.match(req))
  );
});

// Notification click (actions)
self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  event.notification.close();

  // Post message to all clients
  event.waitUntil(
    self.clients.matchAll({ includeUncontrolled: true, type: 'window' }).then(clients => {
      if (clients && clients.length) {
        clients.forEach(client => client.postMessage({ type: 'notification-action', action }));
        // focus the first
        clients[0].focus && clients[0].focus();
      }
    })
  );
});

// notification close (optional)
self.addEventListener('notificationclose', (event) => {
  // can track analytics etc.
});

// Message from client -> handle some actions (optional)
self.addEventListener('message', (e) => {
  // example: client can tell SW to clear caches, etc.
  const data = e.data || {};
  if (data && data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k)));
  }
});
