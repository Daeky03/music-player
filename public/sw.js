const APP_CACHE = 'app-shell-v1';
const AUDIO_CACHE = 'offline-audio-v1';
const APP_ASSETS = [ '/', '/js/app.js', '/icons/icon-192.png', '/icons/icon-512.png' ];

self.addEventListener('install', e => { e.waitUntil(caches.open(APP_CACHE).then(c => c.addAll(APP_ASSETS))); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', e => {
  if(e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if(url.pathname.startsWith('/audio/') || url.pathname.match(/\.(mp3|ogg|flac|wav)$/i)){
    e.respondWith(fetch(e.request).then(res=>{ const clone = res.clone(); caches.open(AUDIO_CACHE).then(c=>c.put(e.request, clone)); return res; }).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
