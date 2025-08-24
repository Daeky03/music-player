// ========= PWA & Tema =========
let deferredPrompt;
const installBtn = document.getElementById('installBtn');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); deferredPrompt = e; installBtn?.classList.remove('hidden');
});
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return; await deferredPrompt.prompt(); deferredPrompt = null; installBtn.classList.add('hidden');
});

const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');
function setTheme(mode){
  if(mode==='dark'){ document.documentElement.classList.add('dark'); themeLabel.textContent='Koyu'; }
  else { document.documentElement.classList.remove('dark'); themeLabel.textContent='Açık'; }
  localStorage.setItem('theme', mode);
}
setTheme(localStorage.getItem('theme')||'dark');
themeToggle?.addEventListener('click', ()=> setTheme(document.documentElement.classList.contains('dark')?'light':'dark'));

// ========= Helpers =========
const $ = sel => document.querySelector(sel);
const fmt = t => { if(!isFinite(t)||t<0) t=0; const m=Math.floor(t/60); const s=Math.floor(t%60).toString().padStart(2,'0'); return `${m}:${s}`; };
const toast = (m)=> Swal.fire({title:m, toast:true, position:'top', timer:2000, showConfirmButton:false, background:'#12121a', color:'#fff'});

// ========= State (yalnızca YT) =========
const LS_PLAYLISTS='mp_playlists_v4';
const LS_DOWN='mp_down_v1';
let playlists = load(LS_PLAYLISTS, []);
let downloads = load(LS_DOWN, {}); // { [id]: true }
let tracks = [];            // son arama listesi
let queue = [];             // o anki oynatma kuyruğu (id[])
let currentIndex = -1;
let repeat = 'off';         // off | one | all
let shuffle = false;

function load(k,f){ try{ return JSON.parse(localStorage.getItem(k))||f; }catch{ return f; } }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }

// İlk girişte bir playlist oluştur
if(playlists.length===0){
  playlists.push({
    id: crypto.randomUUID(),
    name: 'Benim Mixim',
    cover: 'https://i.ytimg.com/vi/2Vv-BfVoq4g/hqdefault.jpg',
    items: [] // id listesi
  });
  save(LS_PLAYLISTS, playlists);
}

// ========= Views / Nav =========
const viewHome   = $('#view-home');
const viewSearch = $('#view-search');
const viewCreate = $('#view-create');
const tabHome   = $('#tab-home');
const tabSearch = $('#tab-search');
const tabCreate = $('#tab-create');

function show(v){
  viewHome.classList.toggle('hidden', v!=='home');
  viewSearch.classList.toggle('hidden', v!=='search');
  viewCreate.classList.toggle('hidden', v!=='create');
}
tabHome.addEventListener('click', ()=> show('home'));
tabSearch.addEventListener('click', ()=> show('search'));
tabCreate.addEventListener('click', ()=> show('create'));
show('home');

// ========= DOM Refs (player) =========
const audio = $('#audioEl');
const mini = { title:$('#npTitleMini'), artist:$('#npArtistMini'), art:$('#npArtMini'),
  btnPlay:$('#btnMiniPlay'), btnAdd:$('#btnMiniAdd'), btnMore:$('#btnMiniMore') };
const xp = { title:$('#npTitle'), artist:$('#npArtist'), art:$('#npArt'),
  cur:$('#npCur'), dur:$('#npDur'), seek:$('#seek'),
  btnClose:$('#btnClose'), btnPlay:$('#btnPlay'), btnPrev:$('#btnPrev'), btnNext:$('#btnNext'),
  btnRew:$('#btnRew'), btnFf:$('#btnFf'), btnRepeat:$('#btnRepeat'), btnShuffle:$('#btnShuffle'), btnCache:$('#btnCache')
};
const miniPanel = $('#miniPlayer');
const expanded  = $('#expandedPlayer');
$('#btnExpand').addEventListener('click', ()=>{ expanded.classList.remove('hidden'); });
xp.btnClose.addEventListener('click', ()=>{ expanded.classList.add('hidden'); });

// ========= Playlist Grid (Ana sayfa) =========
const playlistGrid = $('#playlistGrid');
function renderPlaylists(){
  playlistGrid.innerHTML='';
  playlists.forEach(pl=>{
    const row=document.createElement('button');
    row.className='w-full rounded-xl2 bg-white/80 dark:bg-panel/80 shadow-glass p-3 flex items-center gap-3 text-left hover:ring-1 ring-accent/40 transition';
    row.innerHTML=`
      <img src="${pl.cover||'/icons/icon-192.png'}" class="w-16 h-16 rounded-lg object-cover"/>
      <div class="min-w-0 flex-1">
        <div class="font-semibold cut">${pl.name}</div>
        <div class="text-xs text-gray-600 dark:text-white/60">${pl.items.length} parça</div>
      </div>
      <div class="flex gap-2">
        <span class="pill bg-black/5 dark:bg-white/10 text-xs">Aç</span>
      </div>
    `;
    row.addEventListener('click', ()=> openPlaylist(pl.id));
    playlistGrid.appendChild(row);
  });
}
renderPlaylists();

// Playlist detay (modal tarzı sade promptlarla)
async function openPlaylist(id){
  const pl = playlists.find(x=>x.id===id);
  if(!pl) return;
  // basit liste UI — arama sonuçlarından ekleme akışı var, burada sadece çal/sil/paylaş
  const html = `
    <div class="text-left space-y-3">
      <div class="flex items-center gap-3">
        <img src="${pl.cover||'/icons/icon-192.png'}" class="w-12 h-12 rounded-lg"/>
        <div>
          <div class="font-semibold">${pl.name}</div>
          <div class="text-xs text-gray-400">${pl.items.length} parça</div>
        </div>
      </div>
      <div class="max-h-64 overflow-auto space-y-2">
        ${pl.items.map(id=>renderTrackRowInList(id)).join('') || '<div class="text-sm opacity-70">Henüz parça yok</div>'}
      </div>
    </div>`;
  const { value:action } = await Swal.fire({
    title:'Playlist',
    html,
    showCancelButton:true,
    confirmButtonText:'Çal',
    cancelButtonText:'Kapat',
    showDenyButton:true,
    denyButtonText:'Paylaş',
    background:'#12121a', color:'#fff', width:600
  });
  if(action){
    if(pl.items.length){ queue = pl.items.slice(); currentIndex=0; playByIndex(0); }
    else toast('Boş playlist');
  }else if(action===false && action!==undefined){
    // deny yoksa pas
  }
}
function renderTrackRowInList(id){
  const meta = trackMetaCache[id]; // arama sırasında dolduruyoruz
  const title = meta?.title || id;
  const artist = meta?.artist || '';
  const cached = !!downloads[id];
  const dot = cached ? `<span class="ml-2 text-accent">●</span>` : '';
  return `<div class="flex items-center justify-between rounded-lg bg-black/5 dark:bg-white/10 p-2">
    <div class="min-w-0">
      <div class="cut">${title}${dot}</div>
      <div class="text-xs text-gray-400 cut">${artist}</div>
    </div>
    <div class="flex items-center gap-2">
      <button onclick="window.__playId('${id}')" class="pill bg-accent text-white text-xs">Çal</button>
      <button onclick="window.__removeFromPl('${id}')" class="pill bg-black/5 dark:bg-white/10 text-xs">Sil</button>
      <button onclick="window.__shareSong('${id}')" class="pill bg-black/5 dark:bg-white/10 text-xs">Paylaş</button>
    </div>
  </div>`;
}
window.__playId = (id)=>{ const idx = queue.indexOf(id); if(idx>-1){ currentIndex=idx; playByIndex(idx); } else { queue=[id]; currentIndex=0; playByIndex(0); } }
window.__removeFromPl = (id)=>{
  const cur = playlists.find(p=>p.items.includes(id)); if(!cur) return;
  cur.items = cur.items.filter(x=>x!==id); save(LS_PLAYLISTS, playlists); renderPlaylists(); toast('Silindi');
}
window.__shareSong = (id)=>{
  const payload = LZString.compressToEncodedURIComponent(JSON.stringify({ id }));
  const url = `${location.origin}${location.pathname}#song=${payload}`;
  if(navigator.share){ navigator.share({ title:'Şarkı', url }).catch(()=>{}); }
  Swal.fire({title:'Bağlantı', html:`<input class="swal2-input" value="${url}" readonly>`, background:'#12121a', color:'#fff'});
}

// ========= Oluştur sekmesi =========
$('#createPlaylist').addEventListener('click', ()=>{
  const name = $('#plName').value.trim();
  const cover = $('#plCoverUrl').value.trim();
  if(!name) return toast('Ad gerekli');
  playlists.push({ id:crypto.randomUUID(), name, cover, items:[] });
  save(LS_PLAYLISTS, playlists); renderPlaylists();
  $('#plName').value=''; $('#plCoverUrl').value='';
  toast('Playlist oluşturuldu');
});

// ========= Arama =========
const searchInput = $('#search');
const btnDoSearch = $('#btnDoSearch');
const searchResults = $('#searchResults');
const trackMetaCache = {}; // { id: {title, artist, artwork, duration} }

btnDoSearch.addEventListener('click', ()=> doSearch(searchInput.value));
searchInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(searchInput.value); });

async function doSearch(q){
  searchResults.innerHTML='';
  if(!q.trim()) return;
  try{
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const items = (data.results||[])
      .map(r=>{
        const id = new URL(r.url).searchParams.get('v');
        if(!id) return null;
        const meta = { id, title:r.title, artist:r.author, artwork:r.thumbnail, duration:r.duration||'' };
        trackMetaCache[id] = meta;
        return meta;
      })
      .filter(Boolean);

    // sonuçları çiz
    items.forEach(t=>{
      const row = document.createElement('div');
      const cached = !!downloads[t.id];
      row.className = 'rounded-xl bg-white/80 dark:bg-panel/80 shadow-glass p-3 flex items-center gap-3';
      row.innerHTML = `
        <img src="${t.artwork}" class="w-14 h-14 rounded-lg object-cover"/>
        <div class="min-w-0 flex-1">
          <div class="cut font-medium">${t.title} ${cached?'<span class="text-accent">●</span>':''}</div>
          <div class="cut text-xs text-gray-500 dark:text-white/60">${t.artist}</div>
        </div>
        <div class="flex items-center gap-2">
          <button class="btn-play pill bg-accent text-white" data-id="${t.id}">Çal</button>
          <button class="btn-add pill bg-black/5 dark:bg-white/10" data-id="${t.id}">Ekle</button>
          <button class="btn-dl pill bg-black/5 dark:bg-white/10" data-id="${t.id}">İndir</button>
          <button class="btn-more btn-icon" data-id="${t.id}">⋯</button>
        </div>
      `;
      searchResults.appendChild(row);
    });
  }catch(e){
    console.error(e);
    toast('Arama hatası');
  }
}

// sonuç butonları
searchResults.addEventListener('click', async (e)=>{
  const btn = e.target.closest('button'); if(!btn) return;
  const id = btn.dataset.id; if(!id) return;
  const meta = trackMetaCache[id];

  if(btn.classList.contains('btn-play')){
    queue = Object.keys(trackMetaCache); // arama listesinden sırayla/karıştır
    currentIndex = queue.indexOf(id);
    if(currentIndex<0){ queue=[id]; currentIndex=0; }
    playByIndex(currentIndex);
  }

  if(btn.classList.contains('btn-add')){
    const pl = await pickPlaylist();
    if(pl){ pl.items.includes(id)||pl.items.push(id); save(LS_PLAYLISTS, playlists); toast('Eklendi'); renderPlaylists(); }
  }

  if(btn.classList.contains('btn-dl')){
    await cacheSong(id, meta);
  }

  if(btn.classList.contains('btn-more')){
    // paylaş vs
    window.__shareSong(id);
  }
});

async function pickPlaylist(){
  if(!playlists.length) return null;
  const options = playlists.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  const { value, isConfirmed } = await Swal.fire({
    title:'Playlist seç',
    html:`<select id="plsel" class="swal2-select">${options}</select>`,
    preConfirm: ()=> document.getElementById('plsel').value,
    showCancelButton:true, confirmButtonText:'Ekle',
    background:'#12121a', color:'#fff'
  });
  if(!isConfirmed) return null;
  return playlists.find(p=>p.id===value);
}

// ========= Player =========
function updateUI(meta){
  miniPanel.classList.remove('hidden');
  mini.title.textContent = meta.title;
  mini.artist.textContent = meta.artist||'';
  mini.art.src = meta.artwork||'/icons/icon-192.png';

  xp.title.textContent = meta.title;
  xp.artist.innerHTML = (meta.artist||'—') + " <span class='text-accent'>• SLP Player</span>";
  xp.art.src = meta.artwork||'/icons/icon-512.png';

  if('mediaSession' in navigator){
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title, artist: meta.artist||'', album: 'SLP Player',
      artwork: [{ src: meta.artwork||'/icons/icon-512.png', sizes:'512x512', type:'image/png' }]
    });
  }
}
function getIdAt(i){ return queue[i]; }
function getMeta(id){ return trackMetaCache[id] || { id, title:id, artist:'', artwork:'/icons/icon-192.png' }; }

async function playByIndex(i){
  if(i<0 || i>=queue.length) return;
  currentIndex = i;
  const id = getIdAt(i);
  const meta = getMeta(id);

  // offline ise sadece indirilenler
  if(!navigator.onLine && !downloads[id]){
    toast('Offline: İndirilenler oynatılabilir'); return;
  }

  const c = await caches.open('offline-audio-v1');
  const cached = await c.match(`/stream/${id}`);
  if(cached){
    const blob = await cached.blob();
    audio.src = URL.createObjectURL(blob);
  } else {
    audio.src = `/stream/${id}`;
  }
  await audio.play().catch(()=>{});
  updateUI(meta);
  showNowPlayingNotification(meta);
}

function idxNext(){
  if(shuffle) return Math.floor(Math.random()*queue.length);
  let i = currentIndex+1; if(i>=queue.length){ if(repeat==='all') i=0; else i=queue.length-1; } return i;
}
function idxPrev(){
  if(shuffle) return Math.floor(Math.random()*queue.length);
  let i = currentIndex-1; if(i<0){ if(repeat==='all') i=queue.length-1; else i=0; } return i;
}
function playNext(){ currentIndex = idxNext(); playByIndex(currentIndex); }
function playPrev(){ if(audio.currentTime>3){ audio.currentTime=0; return; } currentIndex = idxPrev(); playByIndex(currentIndex); }
function seekBy(sec){ audio.currentTime = Math.max(0, Math.min((audio.duration||0), audio.currentTime + sec)); }

// mini & expanded controls
mini.btnPlay.addEventListener('click', ()=> audio.paused?audio.play():audio.pause());
xp.btnPlay.addEventListener('click',   ()=> audio.paused?audio.play():audio.pause());
xp.btnPrev.addEventListener('click', playPrev);
xp.btnNext.addEventListener('click', playNext);
xp.btnRew.addEventListener('click', ()=>seekBy(-10));
xp.btnFf.addEventListener('click',  ()=>seekBy(10));
xp.btnShuffle.addEventListener('click', ()=>{ shuffle=!shuffle; xp.btnShuffle.classList.toggle('ring-2', shuffle); });
xp.btnRepeat.addEventListener('click', ()=>{ repeat = repeat==='off'?'all': repeat==='all'?'one':'off'; xp.btnRepeat.textContent = repeat==='one'?'⟲1': repeat==='all'?'⟲∞':'⟲'; });
mini.btnAdd.addEventListener('click', async ()=>{
  const id = getIdAt(currentIndex); if(!id) return;
  const pl = await pickPlaylist(); if(pl){ pl.items.includes(id)||pl.items.push(id); save(LS_PLAYLISTS, playlists); renderPlaylists(); toast('Eklendi'); }
});
xp.btnCache.addEventListener('click', async ()=>{
  const id = getIdAt(currentIndex); if(!id) return;
  await cacheSong(id, getMeta(id));
});

// progress
function syncSeek(){ if(!isFinite(audio.duration)) return;
  xp.seek.max = Math.floor(audio.duration);
  xp.seek.value = Math.floor(audio.currentTime);
  xp.cur.textContent = fmt(audio.currentTime);
  xp.dur.textContent = fmt(audio.duration);
}
audio.addEventListener('timeupdate', syncSeek);
audio.addEventListener('loadedmetadata', syncSeek);
xp.seek.addEventListener('input', ()=> audio.currentTime = +xp.seek.value);

// play/pause icons
audio.addEventListener('play', ()=>{ $('#btnMiniPlay').textContent='⏸'; $('#btnPlay').textContent='⏸'; });
audio.addEventListener('pause', ()=>{ $('#btnMiniPlay').textContent='▶';  $('#btnPlay').textContent='▶'; });
audio.addEventListener('ended', ()=>{ if(repeat==='one'){ audio.currentTime=0; audio.play(); } else playNext(); });

// ========= İndirme / Cache =========
async function cacheSong(id, meta){
  try{
    const cache = await caches.open('offline-audio-v1');
    // Range ile iste, ama tümünü çekmeye çalış (server Range destekliyorsa meta bar düzgün olur)
    const res = await fetch(`/stream/${id}`, { headers: { 'Range':'bytes=0-' } });
    if(!res.ok && res.status!==206) throw new Error('download failed');

    // Bazı edge’lerde content-type yanlış gelebilir: Response’u yeniden sar
    const fixed = new Response(res.body, { status:200, headers:{ 'Content-Type':'audio/mp4' } });
    await cache.put(`/stream/${id}`, fixed);

    downloads[id] = true; save(LS_DOWN, downloads);
    toast('İndirildi');
    // UI’daki mor nokta
    const badgeTargets = [...document.querySelectorAll(`[data-id="${id}"]`)]
      .map(b=>b.closest('.rounded-xl')||b.closest('.rounded-xl2'));
    // basit: arama tekrar çizilsin
    if($('#searchResults')) doSearch($('#search').value||'');
  }catch(e){
    console.error(e); toast('İndirme hatası');
  }
}

// ========= Bildirim =========
async function showNowPlayingNotification(t){
  if(Notification.permission!=='granted') return;
  const reg = await navigator.serviceWorker.getRegistration(); if(!reg) return;
  await reg.showNotification('Çalınıyor: '+t.title, {
    body: (t.artist||'Bilinmiyor')+' — SLP Player',
    icon: t.artwork || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'now-playing', renotify: true
  });
}

// ========= Deep link: #song=... =========
(function(){
  const m = location.hash.match(/#song=([^&]+)/);
  if(!m) return;
  try{
    const obj = JSON.parse(LZString.decompressFromEncodedURIComponent(m[1])||'{}');
    if(obj.id){
      // tek şarkılık kuyruk
      queue=[obj.id]; currentIndex=0;
      // minimal meta yoksa başlık id olur; arama sonrası zaten dolacak
      if(!trackMetaCache[obj.id]) trackMetaCache[obj.id] = { id:obj.id, title:obj.id, artist:'', artwork:'/icons/icon-192.png' };
      playByIndex(0);
    }
  }catch{}
})();

// ========= Offline davranışı =========
window.addEventListener('online', ()=> toast('Çevrimiçi'));
window.addEventListener('offline', ()=> toast('Çevrimdışı: yalnızca indirilenler'));
