const APP_CACHE='app-shell-v3';
const AUDIO_CACHE='offline-audio-v1';
const ASSETS=['/','/js/app.js','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install', e=>{ e.waitUntil(caches.open(APP_CACHE).then(c=>c.addAll(ASSETS))); });
self.addEventListener('activate', e=>{ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e=>{
if(e.request.method!=='GET') return;
const url=new URL(e.request.url);
if(url.pathname.startsWith('/audio/')||url.pathname.match(/\.(mp3|ogg|flac|wav)$/i)){
e.respondWith(fetch(e.request).then(res=>{ const clone=res.clone(); caches.open(AUDIO_CACHE).then(c=>c.put(e.request, clone)); return res; }).catch(()=>caches.match(e.request)));
return;
}
e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});


// Bildirim aksiyonlarının yönlendirilmesi
self.addEventListener('notificationclick', (event)=>{
event.notification.close();
const action = event.action; // prev, rew, toggle, ff, next
event.waitUntil((async()=>{
const clientsList = await self.clients.matchAll({ type:'window', includeUncontrolled:true });
const client = clientsList[0];
if(client){ client.focus(); client.postMessage({ type: action||'toggle' }); }
})());
});
