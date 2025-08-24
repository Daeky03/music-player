// Basit app shell + ses cache pass-through
const APP_VER = 'v1.0.0';
const APP_SHELL = [
  '/',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/js/app.js'
];

self.addEventListener('install', (e)=>{
  e.waitUntil((async()=>{
    const c = await caches.open('shell-'+APP_VER);
    await c.addAll(APP_SHELL);
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e)=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('shell-') && k !== 'shell-'+APP_VER).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

// fetch: /stream/:id -> network; düşerse cache’e bak
self.addEventListener('fetch', (event)=>{
  const url = new URL(event.request.url);

  // Ses akışları
  if(url.pathname.startsWith('/stream/')){
    event.respondWith((async()=>{
      try{
        // Range varsa olduğu gibi ilet
        const net = await fetch(event.request);
        // Başarılıysa döndür
        return net;
      }catch{
        // offline: cached var mı?
        const c = await caches.open('offline-audio-v1');
        const hit = await c.match(url.pathname);
        if(hit) return hit;
        return new Response('Offline ve bu parça yok', { status: 503 });
      }
    })());
    return;
  }

  // Shell: cache-first
  if(APP_SHELL.includes(url.pathname)){
    event.respondWith((async()=>{
      const c = await caches.open('shell-'+APP_VER);
      const hit = await c.match(event.request);
      if(hit) return hit;
      try{
        const net = await fetch(event.request);
        c.put(event.request, net.clone());
        return net;
      }catch{
        return new Response('', {status: 504});
      }
    })());
    return;
  }
});
