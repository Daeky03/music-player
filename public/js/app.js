// ===============================
// SLP - app.js (full rewrite)
// ===============================

// ---------- PWA / Install ----------
let deferredPrompt;
const installBtn = document.getElementById('installBtn');
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn?.classList.remove('hidden');
});
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});

// ---------- Theme ----------
const themeToggle = document.getElementById('themeToggle');
const themeLabel  = document.getElementById('themeLabel');
function setTheme(mode) {
  if (mode === 'dark') {
    document.documentElement.classList.add('dark');
    themeLabel && (themeLabel.textContent = 'Koyu');
  } else {
    document.documentElement.classList.remove('dark');
    themeLabel && (themeLabel.textContent = 'Açık');
  }
  localStorage.setItem('theme', mode);
}
setTheme(localStorage.getItem('theme') || 'dark');
themeToggle?.addEventListener('click', () => {
  const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  setTheme(cur === 'dark' ? 'light' : 'dark');
});

// ---------- Small CSS injection (global rounded corners) ----------
(() => {
  const css = `
    button, .btn, input, .playlist-card, .mini-player, .big-player, .pill, .chip {
      border-radius: 9999px !important;
    }
    .icon-btn {
      width: 36px; height: 36px; display:flex; align-items:center; justify-content:center;
    }
    .badge-downloaded {
      font-size: 10px; padding: 2px 6px; border-radius: 9999px;
      background: rgba(168,85,247,0.15); color: #a855f7;
    }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
})();

// ---------- Storage ----------
const LS_PLAYLISTS = 'mp_playlists_v4';
const LS_LIBRARY   = 'mp_library_v1';       // track index (by id) for saved metadata
const LS_SETTINGS  = 'mp_settings_v1';

function load(k, f){ try { return JSON.parse(localStorage.getItem(k)) ?? f; } catch { return f; } }
function save(k, v){ localStorage.setItem(k, JSON.stringify(v)); }

let library  = load(LS_LIBRARY, {});      // { [id]: {id,title,artist,artwork} }
let playlists = load(LS_PLAYLISTS, []);   // [{id,name,cover,items:[trackId,...]}]
let settings  = load(LS_SETTINGS, { repeat:'off', shuffle:false });

// İlk girişte varsayılan playlist
if (!playlists.length) {
  playlists.push({
    id: crypto.randomUUID(),
    name: 'Benim Listem',
    cover: '/icons/icon-512.png',
    items: []
  });
  save(LS_PLAYLISTS, playlists);
}

// ---------- DOM Refs ----------
const tracksEl        = document.getElementById('tracks');
const playlistListEl  = document.getElementById('playlistList');
const searchInput     = document.getElementById('search');

const audio = document.getElementById('audioEl');
const mini  = {
  art:   document.querySelector('#npArtMini'),
  title: document.querySelector('#npTitleMini'),
  artist:document.querySelector('#npArtistMini'),
  btnPlay:document.querySelector('#btnMiniPlay'),
  btnPrev:document.querySelector('#btnMiniPrev'),
  btnNext:document.querySelector('#btnMiniNext'),
  btnRew: document.querySelector('#btnMiniRew'),
  btnFf:  document.querySelector('#btnMiniFf')
};
const xp = {
  art:   document.querySelector('#npArt'),
  title: document.querySelector('#npTitle'),
  artist:document.querySelector('#npArtist'),
  cur:   document.querySelector('#npCur'),
  dur:   document.querySelector('#npDur'),
  seek:  document.querySelector('#seek'),
  btnPlay:document.querySelector('#btnPlay'),
  btnPrev:document.querySelector('#btnPrev'),
  btnNext:document.querySelector('#btnNext'),
  btnRew: document.querySelector('#btnRew'),
  btnFf:  document.querySelector('#btnFf'),
  btnRepeat:document.querySelector('#btnRepeat'),
  btnShuffle:document.querySelector('#btnShuffle'),
  btnClose: document.querySelector('#btnClose')
};
const expandBtn     = document.querySelector('#btnExpand');
const expandedPanel = document.querySelector('#expandedPlayer');
const miniPanel     = document.querySelector('#miniPlayer');

// ---------- State: queue ----------
let currentResults = []; // last search results (array of tracks)
let queue   = [];        // array of trackIds
let index   = -1;        // current index in queue
let repeat  = settings.repeat || 'off';  // off|one|all
let shuffle = !!settings.shuffle;

// ---------- Helpers ----------
const svg = {
  play:   `<svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`,
  plus:   `<svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor"><path d="M12 5v14M5 12h14"/></svg>`,
  dl:     `<svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor"><path d="M12 3v12m0 0l4-4m-4 4l-4-4M4 19h16"/></svg>`,
  prev:   `<svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M6 7h2v10H6zM9 12l10 7V5z"/></svg>`,
  next:   `<svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M16 7h2v10h-2zM5 5v14l10-7z"/></svg>`,
  pause:  `<svg viewBox="0 0 24 24" class="w-6 h-6" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>`,
  shuffle:`<svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor"><path d="M17 3h4v4h-2V5h-2V3zM3 7h6l3 4 3-4h4v2h-3l-4 6-4-6H3V7zm14 10h2v-2h2v4h-4v-2z"/></svg>`,
  loop:   `<svg viewBox="0 0 24 24" class="w-5 h-5" fill="currentColor"><path d="M7 7h9V4l5 4.5L16 13v-3H7a4 4 0 100 8h2v2H7a6 6 0 010-12zm10 10H8v3l-5-4.5L8 11v3h9a4 4 0 010 8h-2v-2h2a2 2 0 000-4z"/></svg>`
};
function $(sel){ return document.querySelector(sel); }
function fmt(t){ if(!isFinite(t) || t < 0) t = 0; const m = Math.floor(t/60); const s = Math.floor(t%60).toString().padStart(2,'0'); return `${m}:${s}`; }
function streamUrl(id){ return `/stream/${id}`; }

// Cache helpers
async function isCached(id){
  const c = await caches.open('offline-audio-v1');
  const hit = await c.match(streamUrl(id));
  return !!hit;
}
async function cacheTrack(id){
  const url = streamUrl(id);
  const res = await fetch(url);
  if(!res.ok) throw new Error('fetch fail');
  const c = await caches.open('offline-audio-v1');
  await c.put(url, res.clone());
}

// ---------- Search (YouTube) ----------
async function searchYouTube(q){
  const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
  if(!r.ok) throw new Error('search error');
  const data = await r.json();
  const list = (data.results||[]).map(x => {
    const id = new URL(x.url).searchParams.get('v');
    return { id, title:x.title, artist:x.author, artwork:x.thumbnail, url: x.url };
  }).filter(x => !!x.id);
  currentResults = list;
  // library metadata’yı güncelle (kalıcı)
  list.forEach(t => { library[t.id] = library[t.id] || {id:t.id, title:t.title, artist:t.artist, artwork:t.artwork}; });
  save(LS_LIBRARY, library);
  return list;
}

// ---------- Render: Search Results ----------
async function renderResults(q){
  tracksEl.innerHTML = '';
  if(!q || !q.trim()) return;
  let list = [];
  try {
    list = await searchYouTube(q.trim());
  } catch(e) {
    console.error(e);
  }
  for(const t of list){
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-2 rounded-2xl bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition mb-2';
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <img src="${t.artwork}" class="w-12 h-12 rounded-2xl object-cover"/>
        <div class="min-w-0">
          <div class="font-medium truncate max-w-[220px]">${t.title}</div>
          <div class="text-xs text-gray-600 dark:text-white/60 truncate max-w-[220px]">${t.artist||''}</div>
          <div class="mt-1 hidden sm:block">
            <span class="cache-badge-${t.id}"></span>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="icon-btn btn-play bg-accent text-white hover:bg-accent2" title="Çal" data-id="${t.id}">${svg.play}</button>
        <button class="icon-btn btn-add  bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20" title="Playlist'e ekle" data-id="${t.id}">${svg.plus}</button>
        <button class="icon-btn btn-dl   bg-black/10 dark:bg-white/10 hover:bg-black/20 dark:hover:bg-white/20" title="İndir (Cache)" data-id="${t.id}">${svg.dl}</button>
      </div>
    `;
    tracksEl.appendChild(row);
    // cache etiketi
    isCached(t.id).then(ok=>{
      const el = row.querySelector(`.cache-badge-${t.id}`);
      if(!el) return;
      if(ok){
        el.innerHTML = `<span class="badge-downloaded">İndirildi</span>`;
      } else {
        el.innerHTML = ``;
      }
    });
  }
}

// ---------- Render: Playlists grid ----------
function renderPlaylists(){
  if(!playlistListEl) return;
  playlistListEl.innerHTML = '';
  playlists.forEach(pl=>{
    const li = document.createElement('li');
    li.className = 'playlist-card overflow-hidden bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition';
    li.innerHTML = `
      <div class="flex items-center gap-3 p-2">
        <img src="${pl.cover||'/icons/icon-512.png'}" class="w-16 h-16 rounded-2xl object-cover"/>
        <div class="min-w-0 flex-1">
          <div class="font-medium truncate">${pl.name}</div>
          <div class="text-xs text-gray-500">${pl.items.length} parça</div>
        </div>
        <div class="flex items-center gap-1">
          <button class="icon-btn open bg-accent text-white hover:bg-accent2" title="Aç" data-id="${pl.id}">${svg.play}</button>
          <button class="icon-btn share bg-black/10 dark:bg-white/10" title="Paylaş" data-id="${pl.id}">🔗</button>
          <button class="icon-btn edit bg-black/10 dark:bg-white/10" title="Düzenle" data-id="${pl.id}">✎</button>
          <button class="icon-btn del bg-black/10 dark:bg-white/10" title="Sil" data-id="${pl.id}">🗑</button>
        </div>
      </div>
    `;
    playlistListEl.appendChild(li);
  });
}

// ---------- Queue controls ----------
function buildQueueFromResults(){
  queue = currentResults.map(x=>x.id);
}
function idxNext(){
  if(shuffle && queue.length>1) {
    let r; do { r = Math.floor(Math.random()*queue.length); } while(r===index);
    return r;
  }
  let i = index + 1;
  if(i >= queue.length) i = (repeat==='all' ? 0 : queue.length - 1);
  return i;
}
function idxPrev(){
  if(shuffle && queue.length>1) {
    let r; do { r = Math.floor(Math.random()*queue.length); } while(r===index);
    return r;
  }
  let i = index - 1;
  if(i < 0) i = (repeat==='all' ? queue.length - 1 : 0);
  return i;
}

async function playByIndex(i){
  if(i < 0 || i >= queue.length) return;
  index = i;
  const id = queue[index];
  const meta = library[id] || currentResults.find(x=>x.id===id) || { id, title:'Bilinmiyor', artist:'', artwork:'/icons/icon-512.png' };

  // cache varsa ordan
  const c = await caches.open('offline-audio-v1');
  const hit = await c.match(streamUrl(id));
  if(hit){
    const blob = await hit.blob();
    audio.src = URL.createObjectURL(blob);
  } else {
    audio.src = streamUrl(id);
  }
  await audio.play().catch(()=>{});

  // UI mini & xp
  mini.title.textContent = meta.title;
  mini.artist.textContent = meta.artist || '';
  mini.art.src = meta.artwork || '/icons/icon-192.png';

  xp.title.textContent = meta.title;
  xp.artist.innerHTML = (meta.artist || '—') + " <span class='text-accent'>• SLP Player</span>";
  xp.art.src = meta.artwork || '/icons/icon-512.png';

  // Toolbar play/pause ikonları
  setPlayButtonsState();

  // Media Session + Notification
  updateMediaSession(meta);
  showNowPlayingNotification(meta);

  // Hash (paylaşılabilir şarkı)
  history.replaceState(null, '', `#song=${encodeURIComponent(id)}`);
}

function setPlayButtonsState(){
  const isPaused = audio.paused;
  mini.btnPlay.innerHTML = isPaused ? svg.play : svg.pause;
  xp.btnPlay.innerHTML   = isPaused ? svg.play : svg.pause;
}

function playNext(){ const i = idxNext(); if(i !== index) playByIndex(i); else if(repeat==='one'){ audio.currentTime=0; audio.play(); } }
function playPrev(){ if(audio.currentTime > 3){ audio.currentTime = 0; return; } const i = idxPrev(); if(i !== index) playByIndex(i); }
function seekBy(sec){ const d = audio.duration||0; audio.currentTime = Math.max(0, Math.min(d, audio.currentTime + sec)); }

// ---------- Events: search ----------
searchInput?.addEventListener('input', () => renderResults(searchInput.value));

// ---------- Events: list buttons (play/add/dl) ----------
tracksEl.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  const id = btn.dataset.id;
  if(!id) return;

  // Çal
  if(btn.classList.contains('btn-play')){
    buildQueueFromResults();
    const i = queue.indexOf(id);
    if(i === -1){ queue = [id]; index = 0; }
    playByIndex(i === -1 ? 0 : i);
  }

  // Playlist'e ekle (varsayılan ilk playlist)
  if(btn.classList.contains('btn-add')){
    const pl = playlists[0];
    if(!pl.items.includes(id)) pl.items.unshift(id);
    save(LS_PLAYLISTS, playlists);
    // Library'ye meta’yı yaz
    const t = currentResults.find(x=>x.id===id);
    if(t){ library[id] = library[id] || {id:t.id,title:t.title,artist:t.artist,artwork:t.artwork}; save(LS_LIBRARY, library); }
    toast('Playlist’e eklendi');
    renderPlaylists();
  }

  // İndir/Cache
  if(btn.classList.contains('btn-dl')){
    try{
      await cacheTrack(id);
      toast('İndirildi (cache)');
      // rozeti güncelle
      const badge = tracksEl.querySelector(`.cache-badge-${id}`);
      if(badge) badge.innerHTML = `<span class="badge-downloaded">İndirildi</span>`;
    }catch{
      toast('İndirme hatası');
    }
  }
});

// ---------- Mini & Expanded Player wiring ----------
[mini.btnPlay, xp.btnPlay].forEach(b=>b.addEventListener('click', ()=>{ if(audio.paused) audio.play(); else audio.pause(); }));
[mini.btnPrev, xp.btnPrev].forEach(b=>b.addEventListener('click', playPrev));
[mini.btnNext, xp.btnNext].forEach(b=>b.addEventListener('click', playNext));
[mini.btnRew,  xp.btnRew ].forEach(b=>b.addEventListener('click', ()=>seekBy(-10)));
[mini.btnFf,   xp.btnFf  ].forEach(b=>b.addEventListener('click', ()=>seekBy(10)));

const expandBtnEl = document.querySelector('#btnExpand');
expandBtnEl?.addEventListener('click', ()=>{ expandedPanel.classList.remove('hidden'); miniPanel.classList.add('hidden'); });
xp.btnClose?.addEventListener('click', ()=>{ expandedPanel.classList.add('hidden'); miniPanel.classList.remove('hidden'); });

// Repeat/Shuffle
xp.btnRepeat?.addEventListener('click', ()=>{
  repeat = repeat==='off' ? 'all' : repeat==='all' ? 'one' : 'off';
  settings.repeat = repeat; save(LS_SETTINGS, settings);
  xp.btnRepeat.classList.toggle('ring-2', repeat!=='off');
});
xp.btnShuffle?.addEventListener('click', ()=>{
  shuffle = !shuffle;
  settings.shuffle = shuffle; save(LS_SETTINGS, settings);
  xp.btnShuffle.classList.toggle('ring-2', shuffle);
});

// ---------- Audio events ----------
function syncSeek(){
  if(!isFinite(audio.duration)) return;
  xp.seek.max = Math.floor(audio.duration);
  xp.seek.value = Math.floor(audio.currentTime);
  xp.cur.textContent = fmt(audio.currentTime);
  xp.dur.textContent = fmt(audio.duration);
}
audio.addEventListener('timeupdate', syncSeek);
audio.addEventListener('loadedmetadata', syncSeek);
xp.seek?.addEventListener('input', ()=> audio.currentTime = +xp.seek.value);

audio.addEventListener('play', setPlayButtonsState);
audio.addEventListener('pause', setPlayButtonsState);
audio.addEventListener('ended', ()=>{ if(repeat==='one'){ audio.currentTime=0; audio.play(); } else playNext(); });

// ---------- Media Session ----------
function updateMediaSession(t){
  if(!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: t.title,
    artist: t.artist || '',
    album: 'SLP Player',
    artwork: [{ src: t.artwork || '/icons/icon-512.png', sizes:'512x512', type:'image/png' }]
  });
  try{
    navigator.mediaSession.setActionHandler('play', ()=>audio.play());
    navigator.mediaSession.setActionHandler('pause', ()=>audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    navigator.mediaSession.setActionHandler('seekbackward', ()=>seekBy(-10));
    navigator.mediaSession.setActionHandler('seekforward',  ()=>seekBy(10));
    navigator.mediaSession.setActionHandler('seekto', (d)=>{ if(d.fastSeek && 'fastSeek' in audio) audio.fastSeek(d.seekTime); else audio.currentTime=d.seekTime; });
  }catch{}
}

// ---------- Notifications (prev/next/toggle) ----------
async function showNowPlayingNotification(t){
  try{
    if(Notification.permission!=='granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    if(!reg) return;
    await reg.showNotification('Çalınıyor: ' + t.title, {
      body: (t.artist||'Bilinmiyor') + ' — SLP Player',
      icon: t.artwork || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'now-playing',
      renotify: true,
      requireInteraction: false,
      actions: [
        { action:'prev',   title:'Önceki' },
        { action:'toggle', title: audio.paused ? '▶' : '⏸' },
        { action:'next',   title:'Sonraki' }
      ]
    });
  }catch{}
}

// SW’den gelen mesajları yakala
navigator.serviceWorker?.addEventListener('message', (e)=>{
  const { type } = e.data||{};
  if(!type) return;
  if(type==='prev') playPrev();
  if(type==='next') playNext();
  if(type==='toggle') { if(audio.paused) audio.play(); else audio.pause(); }
});

// ---------- Playlist CRUD + Share ----------
function toast(title){ 
  if(window.Swal){
    Swal.fire({ title, toast:true, position:'top', timer:1800, showConfirmButton:false, background:'#12121a', color:'#fff' });
  } else {
    console.log(title);
  }
}

// Paylaş (LZString ile #pl= sıkıştırılmış payload)
function sharePlaylistById(plId){
  const pl = playlists.find(p=>p.id===plId);
  if(!pl) return toast('Playlist bulunamadı');
  const payload = {
    // minimalist: isim + öğeler + kapak
    name: pl.name,
    cover: pl.cover || null,
    items: pl.items
  };
  const enc = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  const url = `${location.origin}${location.pathname}#pl=${enc}`;
  navigator.clipboard.writeText(url).then(()=> toast('Paylaşım linki kopyalandı')).catch(()=>toast('Kopyalanamadı'));
}

// Hash ile içe aktar (sayfa açılışında)
(function importFromHash(){
  const h = location.hash || '';
  if(h.startsWith('#pl=')){
    try{
      const json = LZString.decompressFromEncodedURIComponent(h.slice(4));
      const obj = JSON.parse(json);
      const newPl = {
        id: crypto.randomUUID(),
        name: obj.name || 'Paylaşılan',
        cover: obj.cover || null,
        items: Array.isArray(obj.items) ? obj.items : []
      };
      playlists.push(newPl);
      save(LS_PLAYLISTS, playlists);
      renderPlaylists();
      toast('Playlist içe aktarıldı');
      history.replaceState(null, '', location.pathname + location.search);
    }catch(e){
      console.error(e);
      toast('Playlist yüklenemedi');
    }
  } else if (h.startsWith('#song=')){
    const id = decodeURIComponent(h.slice(6));
    if(id){
      queue = [id];
      playByIndex(0);
    }
  }
})();

// Playlist listesinde butonlar
playlistListEl?.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button');
  if(!btn) return;
  const id = btn.dataset.id;
  const pl = playlists.find(p=>p.id===id);
  if(!pl) return;

  if(btn.classList.contains('open')){
    if(pl.items.length === 0) { toast('Boş playlist'); return; }
    queue = pl.items.slice();
    playByIndex(0);
  }
  if(btn.classList.contains('share')){
    sharePlaylistById(id);
  }
  if(btn.classList.contains('edit')){
    if(!window.Swal){ toast('Düzenleme için SweetAlert2 gerekli'); return; }
    const { value: vals, isConfirmed } = await Swal.fire({
      title:'Playlist Düzenle',
      html:`<input id="pln" class="swal2-input" value="${pl.name}" placeholder="Ad">
            <input id="plc" type="file" accept="image/*" class="swal2-input">`,
      preConfirm: ()=>({ name:document.getElementById('pln').value.trim(), file:document.getElementById('plc').files[0]||null }),
      showCancelButton:true, confirmButtonText:'Kaydet', background:'#12121a', color:'#fff'
    });
    if(isConfirmed){
      if(vals.name) pl.name = vals.name;
      if(vals.file){
        const b64 = await fileToBase64(vals.file);
        pl.cover = b64;
      }
      save(LS_PLAYLISTS, playlists);
      renderPlaylists();
      toast('Güncellendi');
    }
  }
  if(btn.classList.contains('del')){
    if(!window.Swal){ toast('Silmek için SweetAlert2 gerekli'); return; }
    const ok = (await Swal.fire({title:'Silinsin mi?', showCancelButton:true, confirmButtonText:'Sil', background:'#12121a', color:'#fff'})).isConfirmed;
    if(!ok) return;
    playlists = playlists.filter(p=>p.id!==id);
    save(LS_PLAYLISTS, playlists);
    renderPlaylists();
  }
});
function fileToBase64(file){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onload = ()=>res(fr.result);
    fr.onerror = rej;
    fr.readAsDataURL(file);
  });
}

// ---------- Offline davranışı ----------
window.addEventListener('online', ()=>{ if(searchInput?.value) renderResults(searchInput.value); });
window.addEventListener('offline', async ()=>{
  // İnternet yoksa: sadece indirilenleri (cache) listede göster
  tracksEl.innerHTML = '';
  const c = await caches.open('offline-audio-v1');
  const keys = await c.keys();
  for(const req of keys){
    const id = req.url.split('/stream/')[1];
    const meta = library[id] || {id, title:'İndirilen parça', artist:'', artwork:'/icons/icon-512.png'};
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-2 rounded-2xl bg-black/5 dark:bg-white/10 mb-2';
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <img src="${meta.artwork}" class="w-12 h-12 rounded-2xl"/>
        <div class="min-w-0">
          <div class="font-medium truncate max-w-[220px]">${meta.title}</div>
          <div class="text-xs text-gray-600 dark:text-white/60 truncate max-w-[220px]">${meta.artist||''}</div>
          <span class="badge-downloaded">İndirildi</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button class="icon-btn only-play bg-accent text-white hover:bg-accent2" data-id="${id}" title="Çal">${svg.play}</button>
      </div>
    `;
    tracksEl.appendChild(row);
  }
  // offline oynat
  tracksEl.addEventListener('click', (e)=>{
    const b = e.target.closest('.only-play');
    if(!b) return;
    const id = b.dataset.id;
    queue = [id];
    playByIndex(0);
  }, { once:true });
});

// ---------- Init ----------
renderPlaylists();
if(searchInput?.value) renderResults(searchInput.value);

// ---------- Utility: toast variant for missing Swal ----------
if(!window.Swal){
  window.Swal = { fire: ({title}) => alert(title) };
}
