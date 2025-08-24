// public/sw.js
const CACHE_NAME = 'slp-shell-v1';
const ASSETS = [
  '/',
  '/views/index.ejs',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/js/app.js'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (evt) => {
  // let static assets come from cache; API calls go to network
  const url = new URL(evt.request.url);
  if (url.origin === location.origin && ASSETS.includes(url.pathname)) {
    evt.respondWith(caches.match(evt.request).then(r => r || fetch(evt.request)));
  }
});

// notification action handling: forward to clients
self.addEventListener('notificationclick', (evt) => {
  const action = evt.action;
  evt.notification.close();
  evt.waitUntil(
    clients.matchAll({ type: 'window' }).then(all => {
      if (all.length === 0) return;
      const client = all[0];
      let msg = null;
      if (action === 'prev') msg = { type: 'prev' };
      if (action === 'rew') msg = { type: 'rew' };
      if (action === 'toggle') msg = { type: 'toggle' };
      if (action === 'ff') msg = { type: 'ff' };
      if (action === 'next') msg = { type: 'next' };
      if (msg) client.postMessage(msg);
      client.focus();
    })
  );
});
