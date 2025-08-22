let deferredPrompt;const installBtn=document.getElementById('installBtn');
if('serviceWorker' in navigator){ navigator.serviceWorker.register('/sw.js'); }
window.addEventListener('beforeinstallprompt', e=>{ e.preventDefault(); deferredPrompt=e; installBtn?.classList.remove('hidden'); });
installBtn?.addEventListener('click', async()=>{ if(!deferredPrompt) return; deferredPrompt.prompt(); deferredPrompt=null; installBtn.classList.add('hidden'); });

// Tema toggle
const themeToggle=document.getElementById('themeToggle'); const themeLabel=document.getElementById('themeLabel');
function setTheme(mode){ if(mode==='dark'){ document.documentElement.classList.add('dark'); themeLabel.textContent='Koyu'; } else { document.documentElement.classList.remove('dark'); themeLabel.textContent='Açık'; } localStorage.setItem('theme', mode); }
setTheme(localStorage.getItem('theme')||'dark');
themeToggle?.addEventListener('click', ()=>{ const cur=document.documentElement.classList.contains('dark')?'dark':'light'; setTheme(cur==='dark'?'light':'dark'); });

// Örnek veriler
const SAMPLE_TRACKS = [
  { id: 's1', title: 'Nebula Dreams', artist: 'Luna V.', url: '/audio/Arcane S2 - Ma Meilleure Ennemie (Turkish Cover by @Minachua & @batumation ).mp3', artwork: '/icons/icon-512.png', duration: 0 },
  { id: 's2', title: 'Violet Night', artist: 'Noir Keys', url: '/audio/sample2.mp3', artwork: '/icons/icon-512.png', duration: 0 },
  { id: 's3', title: 'Pulse Runner', artist: 'Astra', url: '/audio/sample3.mp3', artwork: '/icons/icon-512.png', duration: 0 },
];

// Storage keys
const LS_TRACKS='mp_tracks_v2'; const LS_PLAYLISTS='mp_playlists_v2';
function load(k,f){ try{ return JSON.parse(localStorage.getItem(k))||f; }catch{ return f; } }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
let tracks = load(LS_TRACKS, SAMPLE_TRACKS);
let playlists = load(LS_PLAYLISTS, [{ id:'pl1', name:'Favoriler', items:[tracks[0]?.id, tracks[1]?.id].filter(Boolean) }]);

// Tabs & Views
const viewLibrary=document.getElementById('view-library');
const viewPlaylists=document.getElementById('view-playlists');
const viewDownloaded=document.getElementById('view-downloaded');
const tracksEl=document.getElementById('tracks');
const playlistListEl=document.getElementById('playlistList');
const downloadListEl=document.getElementById('downloadList');

document.getElementById('tab-library').addEventListener('click',()=>showView('lib'));
document.getElementById('tab-playlists').addEventListener('click',()=>showView('pl'));
document.getElementById('tab-downloaded').addEventListener('click',()=>showView('dl'));
function showView(v){ viewLibrary.classList.toggle('hidden', v!=='lib'); viewPlaylists.classList.toggle('hidden', v!=='pl'); viewDownloaded.classList.toggle('hidden', v!=='dl'); }

// Search
const searchInput=document.getElementById('search');
searchInput.addEventListener('input', e=>renderLibrary(e.target.value));

// Playlist oluştur
document.getElementById('newPlaylistBtn').addEventListener('click',()=>{ const name=prompt('Playlist adı'); if(!name) return; playlists.push({ id:crypto.randomUUID(), name, items:[] }); save(LS_PLAYLISTS, playlists); renderPlaylists(); });

// Bildirim izni
const notifyPermBtn=document.getElementById('notifyPermBtn');
notifyPermBtn.addEventListener('click', async()=>{ try{ const perm = await Notification.requestPermission(); alert('Bildirim izni: '+perm); }catch(e){ alert('Bildirim desteklenmiyor'); } });

// Player state
const audio=document.getElementById('audioEl');
let queue=[]; let currentIndex=-1; let repeat='off'; let shuffle=false; // repeat: off|one|all

// Mini & Expanded player refs
const mini={ art:$('#npArtMini'), title:$('#npTitleMini'), artist:$('#npArtistMini'), btnPlay:$('#btnMiniPlay'), btnPrev:$('#btnMiniPrev'), btnNext:$('#btnMiniNext'), btnRew:$('#btnMiniRew'), btnFf:$('#btnMiniFf') };
const xp={ art:$('#npArt'), title:$('#npTitle'), artist:$('#npArtist'), cur:$('#npCur'), dur:$('#npDur'), btnClose:$('#btnClose'), btnPlay:$('#btnPlay'), btnPrev:$('#btnPrev'), btnNext:$('#btnNext'), btnRew:$('#btnRew'), btnFf:$('#btnFf'), btnRepeat:$('#btnRepeat'), btnShuffle:$('#btnShuffle') };
const expandBtn=$('#btnExpand'); const expandedPanel=$('#expandedPlayer'); const miniPanel=$('#miniPlayer');

function $(sel){ return document.querySelector(sel); }

function fmt(t){ if(!isFinite(t)||t<0) t=0; const m=Math.floor(t/60); const s=Math.floor(t%60).toString().padStart(2,'0'); return `${m}:${s}`; }

function setQueue(ids,start=0){ queue=ids.slice(); currentIndex=Math.min(Math.max(start,0), queue.length-1); playById(queue[currentIndex]); }
function idxNext(){ if(shuffle) return Math.floor(Math.random()*queue.length); let i=currentIndex+1; if(i>=queue.length){ if(repeat==='all') i=0; else i=queue.length-1; } return i; }
function idxPrev(){ if(shuffle) return Math.floor(Math.random()*queue.length); let i=currentIndex-1; if(i<0){ if(repeat==='all') i=queue.length-1; else i=0; } return i; }

function playNext(){ currentIndex=idxNext(); playById(queue[currentIndex]); }
function playPrev(){ if(audio.currentTime>3){ audio.currentTime=0; return; } currentIndex=idxPrev(); playById(queue[currentIndex]); }
function seekBy(sec){ audio.currentTime = Math.max(0, Math.min((audio.duration||0), audio.currentTime + sec)); }

function playById(id){ const t=tracks.find(x=>x.id===id); if(!t) return; // try cache first
  caches.open('offline-audio-v1').then(c=>c.match(t.url)).then(hit=> hit? hit.blob().then(b=>URL.createObjectURL(b)) : t.url ).then(src=>{
    audio.src=src; audio.play();
    mini.title.textContent=t.title; mini.artist.textContent=t.artist||''; mini.art.src=t.artwork||'/icons/icon-192.png';
    xp.title.textContent=t.title; xp.artist.textContent=t.artist||''; xp.art.src=t.artwork||'/icons/icon-512.png';
    updateMediaSession(t);
    showNowPlayingNotification(t);
  });
}

// UI wiring
[mini.btnPlay, xp.btnPlay].forEach(btn=>btn.addEventListener('click',()=>{ if(audio.paused) audio.play(); else audio.pause(); }));
[mini.btnPrev, xp.btnPrev].forEach(btn=>btn.addEventListener('click', playPrev));
[mini.btnNext, xp.btnNext].forEach(btn=>btn.addEventListener('click', playNext));
[mini.btnRew, xp.btnRew].forEach(btn=>btn.addEventListener('click', ()=>seekBy(-10)));
[mini.btnFf, xp.btnFf].forEach(btn=>btn.addEventListener('click', ()=>seekBy(10)));

xp.btnRepeat.addEventListener('click',()=>{ repeat = repeat==='off'?'all': repeat==='all'?'one':'off'; xp.btnRepeat.textContent = repeat==='one'?'⟲1': repeat==='all'?'⟲∞':'⟲'; });
xp.btnShuffle.addEventListener('click',()=>{ shuffle=!shuffle; xp.btnShuffle.classList.toggle('ring-2', shuffle); });

expandBtn.addEventListener('click',()=>{ expandedPanel.classList.remove('hidden'); miniPanel.classList.add('hidden'); });
xp.btnClose.addEventListener('click',()=>{ expandedPanel.classList.add('hidden'); miniPanel.classList.remove('hidden'); });

// Progress
function syncSeek(){
  if(!isFinite(audio.duration)) return;
  const v = Math.floor(audio.currentTime);
  const d = Math.floor(audio.duration);
  if (xp.seek) { xp.seek.max = d; xp.seek.value = v; }
  if (xp.cur) xp.cur.textContent = fmt(v);
  if (xp.dur) xp.dur.textContent = fmt(d);
}

audio.addEventListener('timeupdate', syncSeek);
audio.addEventListener('loadedmetadata', syncSeek);
mini.seek.addEventListener('input', ()=> audio.currentTime = +mini.seek.value);
xp.seek.addEventListener('input', ()=> audio.currentTime = +xp.seek.value);

audio.addEventListener('play', ()=>{ mini.btnPlay.textContent='⏸'; xp.btnPlay.textContent='⏸'; });
audio.addEventListener('pause', ()=>{ mini.btnPlay.textContent='▶'; xp.btnPlay.textContent='▶'; });
audio.addEventListener('ended', ()=>{ if(repeat==='one'){ audio.currentTime=0; audio.play(); } else playNext(); });

// Renderers
function renderLibrary(filter=''){
  tracksEl.innerHTML='';
  const list=tracks.filter(t=> (t.title+' '+(t.artist||'')).toLowerCase().includes(filter.toLowerCase()));
  list.forEach(t=>{
    const row=document.createElement('div'); row.className='flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10';
    row.innerHTML=`<div class="flex items-center gap-3"><img src="${t.artwork||'/icons/icon-192.png'}" class="w-12 h-12 rounded-lg"/><div><div class="font-medium">${t.title}</div><div class="text-xs text-gray-600 dark:text-white/60">${t.artist||''}</div></div></div><div class="flex items-center gap-2"><button data-id="${t.id}" class="play px-3 py-1.5 rounded-full bg-accent text-white">Çal</button><button data-id="${t.id}" class="addpl px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10">Playlist</button><button data-id="${t.id}" class="cache px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10">Cache</button></div>`;
    tracksEl.appendChild(row);
  });
}

tracksEl.addEventListener('click', async(e)=>{
  const btn=e.target.closest('button'); if(!btn) return; const id=btn.dataset.id; const t=tracks.find(x=>x.id===id); if(!t) return;
  if(btn.classList.contains('play')){ setQueue([id],0); }
  if(btn.classList.contains('addpl')){ const plId=prompt('Playlist ID (Playlists sekmesinden bak)'); const pl=playlists.find(p=>p.id===plId); if(!pl) return alert('Bulunamadı'); if(!pl.items.includes(id)) pl.items.push(id); save(LS_PLAYLISTS, playlists); renderPlaylists(); }
  if(btn.classList.contains('cache')){ const res=await fetch(t.url); if(!res.ok) return alert('İndirme hatası'); const clone=res.clone(); const c=await caches.open('offline-audio-v1'); await c.put(t.url, clone); alert('Cache tamam'); renderDownloads(); }
});

function renderPlaylists(){ playlistListEl.innerHTML=''; playlists.forEach(pl=>{
  const li=document.createElement('li'); li.className='flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10';
  li.innerHTML=`<div><div class="font-medium">${pl.name}</div><div class="text-xs text-gray-600 dark:text-white/60">${pl.items.length} parça — id: ${pl.id}</div></div><div class="flex gap-2"><button data-id="${pl.id}" class="open px-3 py-1.5 rounded-full bg-accent text-white">Çal</button><button data-id="${pl.id}" class="rename px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10">Ad</button><button data-id="${pl.id}" class="del px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10">Sil</button></div>`;
  playlistListEl.appendChild(li);
}); }

playlistListEl.addEventListener('click',(e)=>{
  const b=e.target.closest('button'); if(!b) return; const id=b.dataset.id; const pl=playlists.find(x=>x.id===id); if(!pl) return;
  if(b.classList.contains('open')){ const ids=pl.items.filter(i=>tracks.some(t=>t.id===i)); if(ids.length===0) return alert('Boş'); setQueue(ids,0); }
  if(b.classList.contains('rename')){ const name=prompt('Yeni ad', pl.name); if(!name) return; pl.name=name; save(LS_PLAYLISTS, playlists); renderPlaylists(); }
  if(b.classList.contains('del')){ if(!confirm('Silinsin mi?')) return; playlists=playlists.filter(x=>x.id!==id); save(LS_PLAYLISTS, playlists); renderPlaylists(); }
});

async function renderDownloads(){
  downloadListEl.innerHTML='';
  const c = await caches.open('offline-audio-v1');
  const keys = await c.keys();
  for(const req of keys){
    const url = req.url.replace(location.origin,'');
    const t = tracks.find(x => x.url === url);
    const name = t ? (t.title + (t.artist ? ` — ${t.artist}`:'')) : decodeURIComponent(url.split('/').pop());
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10';
    li.innerHTML = `<div class="truncate">${name}</div>
      <div class="flex gap-2">
        <button data-url="${url}" class="play px-3 py-1.5 rounded-full bg-accent text-white">Çal</button>
        <button data-url="${url}" class="rm px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10">Sil</button>
      </div>`;
    downloadListEl.appendChild(li);
  }
}

downloadListEl.addEventListener('click',async(e)=>{ const b=e.target.closest('button'); if(!b) return; const url=b.dataset.url; const c=await caches.open('offline-audio-v1'); if(b.classList.contains('play')){ const hit=await c.match(url); if(hit){ const blob=await hit.blob(); audio.src=URL.createObjectURL(blob); audio.play(); } } if(b.classList.contains('rm')){ await c.delete(url); renderDownloads(); }});

// Media Session API — bildirim/OS kontrol butonları
function updateMediaSession(t){ if(!('mediaSession' in navigator)) return; navigator.mediaSession.metadata=new MediaMetadata({ title:t.title, artist:t.artist||'', artwork:[{src:t.artwork||'/icons/icon-512.png', sizes:'512x512', type:'image/png'}] });
  try{
    navigator.mediaSession.setActionHandler('play', ()=>audio.play());
    navigator.mediaSession.setActionHandler('pause', ()=>audio.pause());
    navigator.mediaSession.setActionHandler('seekforward', ()=>seekBy(10));
    navigator.mediaSession.setActionHandler('seekbackward', ()=>seekBy(-10));
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    navigator.mediaSession.setActionHandler('seekto', (d)=>{ if(d.fastSeek && 'fastSeek' in audio) audio.fastSeek(d.seekTime); else audio.currentTime=d.seekTime; });
  }catch{}
}

// Bildirim + aksiyonlar (SW üzerinden)
async function showNowPlayingNotification(t){
  try{
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return;
    await reg.showNotification('Çalınıyor: ' + t.title, {
      body: (t.artist||'') + ' — SLP Player',
      icon: t.artwork || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'now-playing',
      requireInteraction: false,
      renotify: true,
      actions: [
        { action:'prev',   title:'⏮ Önceki' },
        { action:'rew',    title:'-10s' },
        { action:'toggle', title: audio.paused ? '▶ Oynat' : '⏸ Duraklat' },
        { action:'ff',     title:'+10s' },
        { action:'next',   title:'⏭ Sonraki' }
      ]
    });
  }catch{}
}

// SW mesajları (bildirim aksiyonlarını yakala)
navigator.serviceWorker?.addEventListener('message', (e)=>{
  const { type } = e.data||{}; if(!type) return;
  if(type==='prev') playPrev();
  if(type==='rew') seekBy(-10);
  if(type==='ff') seekBy(10);
  if(type==='toggle'){ if(audio.paused) audio.play(); else audio.pause(); }
  if(type==='next') playNext();
});

// İlk render
renderLibrary(); renderPlaylists(); renderDownloads();
// Otomatik kuyruk test: setQueue([tracks[0].id, tracks[1].id, tracks[2].id], 0);

// Dışa açık yardımcı (kendi mp3 eklemek için)
window.addSampleTrack=(fileName, title='', artist='', artwork='/icons/icon-512.png')=>{ const t={ id:crypto.randomUUID(), title: title||fileName, artist, url:'/audio/'+fileName, artwork }; tracks.push(t); save(LS_TRACKS, tracks); renderLibrary(); };
