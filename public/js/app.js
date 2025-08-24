// 🌟 PWA & Theme
let deferredPrompt;
const installBtn = document.getElementById('installBtn');
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

window.addEventListener('beforeinstallprompt', e => {
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

const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');

function setTheme(mode) {
  if (mode === 'dark') {
    document.documentElement.classList.add('dark');
    themeLabel.textContent = 'Koyu';
  } else {
    document.documentElement.classList.remove('dark');
    themeLabel.textContent = 'Açık';
  }
  localStorage.setItem('theme', mode);
}
setTheme(localStorage.getItem('theme') || 'dark');

themeToggle?.addEventListener('click', () => {
  const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  setTheme(cur === 'dark' ? 'light' : 'dark');
});

// 📌 Data storage
const LS_TRACKS = 'mp_tracks_v3';
const LS_PLAYLISTS = 'mp_playlists_v3';
let tracks = []; // Yalnızca YT şarkıları
let playlists = load(LS_PLAYLISTS, []);

function load(k, f){ try{ return JSON.parse(localStorage.getItem(k))||f; }catch{ return f; } }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }

// 🔹 DOM refs
const tracksEl = document.getElementById('tracks');
const playlistListEl = document.getElementById('playlistList');
const audio = document.getElementById('audioEl');

// 🎵 Queue state
let queue = [], currentIndex = -1, repeat = 'off', shuffle = false;

// 🔹 UI refs
const mini = { title:$('#npTitleMini'), artist:$('#npArtistMini'), art:$('#npArtMini'), btnPlay:$('#btnMiniPlay'), btnPrev:$('#btnMiniPrev'), btnNext:$('#btnMiniNext') };
const xp = { title:$('#npTitle'), artist:$('#npArtist'), art:$('#npArt'), cur:$('#npCur'), dur:$('#npDur'), seek:$('#seek'), btnPlay:$('#btnPlay'), btnPrev:$('#btnPrev'), btnNext:$('#btnNext'), btnRepeat:$('#btnRepeat'), btnShuffle:$('#btnShuffle'), btnClose:$('#btnClose') };
const expandBtn = $('#btnExpand'); const expandedPanel = $('#expandedPlayer'); const miniPanel = $('#miniPlayer');

function $(sel){ return document.querySelector(sel); }
function fmt(t){ const m=Math.floor(t/60); const s=Math.floor(t%60).toString().padStart(2,'0'); return `${m}:${s}`; }

// 🔹 Queue controls
function setQueue(ids, start=0){ queue = ids.slice(); currentIndex = start; playByIndex(currentIndex); }
function idxNext(){ if(shuffle) return Math.floor(Math.random()*queue.length); let i=currentIndex+1; if(i>=queue.length){ if(repeat==='all') i=0; else i=queue.length-1; } return i; }
function idxPrev(){ if(shuffle) return Math.floor(Math.random()*queue.length); let i=currentIndex-1; if(i<0){ if(repeat==='all') i=queue.length-1; else i=0; } return i; }
function playNext(){ currentIndex = idxNext(); playByIndex(currentIndex); }
function playPrev(){ if(audio.currentTime>3){ audio.currentTime=0; return; } currentIndex = idxPrev(); playByIndex(currentIndex); }
function seekBy(sec){ audio.currentTime = Math.max(0, Math.min(audio.duration||0, audio.currentTime+sec)); }

// 🔹 Play by index
async function playByIndex(i){
  if(i<0 || i>=queue.length) return;
  const id = queue[i];
  const t = tracks.find(x=>x.id===id);
  if(!t) return;

  // 🎧 Cache kontrol
  const c = await caches.open('offline-audio-v1');
  const hit = await c.match(`/stream/${id}`);
  if(hit){
    const blob = await hit.blob();
    audio.src = URL.createObjectURL(blob);
  } else {
    audio.src = `/stream/${id}`; // MP4a link
  }
  audio.play();

  // UI update
  mini.title.textContent = t.title; mini.artist.textContent = t.artist||''; mini.art.src = t.thumbnail||'/icons/icon-192.png';
  xp.title.textContent = t.title; xp.artist.innerHTML = (t.artist||'—')+" <span class='text-accent'>• SLP Player</span>"; xp.art.src = t.thumbnail||'/icons/icon-512.png';

  updateMediaSession(t);
  showNowPlayingNotification(t);
}

// 🔹 Render Library
async function renderLibrary(filter=''){
  tracksEl.innerHTML = '';

  if(!filter.trim()) return;

  // 🎯 YouTube API fetch
  try{
    const res = await fetch(`/api/search?q=${encodeURIComponent(filter)}`);
    const data = await res.json();
    const ytResults = data.results || [];
    tracks = ytResults.map(t=>({ id: new URL(t.url).searchParams.get('v'), title:t.title, artist:t.author, artwork:t.thumbnail, url:t.url }));

    tracks.forEach(t=>{
      const row = document.createElement('div');
      row.className = 'flex flex-col sm:flex-row items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10 mb-2';
      row.innerHTML = `
        <div class="flex items-center gap-3 w-full sm:w-auto">
          <img src="${t.artwork}" class="w-12 h-12 rounded-lg"/>
          <div class="ml-2">
            <div class="font-medium truncate max-w-[200px]">${t.title}</div>
            <div class="text-xs text-gray-600 dark:text-white/60 truncate max-w-[200px]">${t.artist}</div>
          </div>
        </div>
        <div class="flex gap-2 mt-2 sm:mt-0">
          <button data-id="${t.id}" class="btn play-btn rounded-full flex items-center justify-center" title="Çal">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 3v18l15-9z"/></svg>
          </button>
          <button data-id="${t.id}" class="btn addpl-btn rounded-full flex items-center justify-center" title="Playlist'e ekle">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 5v14m7-7H5"/></svg>
          </button>
          <button data-id="${t.id}" class="btn cache-btn rounded-full flex items-center justify-center" title="Cachele">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>
          </button>
        </div>
      `;
      tracksEl.appendChild(row);
    });
  }catch(err){ console.error(err); }
}

// 🔹 Click events
tracksEl.addEventListener('click', async e=>{
  const btn = e.target.closest('button');
  if(!btn) return;

  const id = btn.dataset.id;
  if(!id) return;
  const t = tracks.find(x=>x.id===id); if(!t) return;

  // Play
  if(btn.classList.contains('play-btn')){
    const idx = queue.findIndex(x=>x===id);
    if(idx === -1) setQueue(tracks.map(x=>x.id), 0);
    else playByIndex(idx);
  }

  // Add to playlist
  if(btn.classList.contains('addpl-btn')) addToPlaylistDialog(id);

  // Cache
  if(btn.classList.contains('cache-btn')){
    try{
      const streamUrl = `/stream/${id}`;
      const res = await fetch(streamUrl);
      if(!res.ok) throw new Error();
      const clone = res.clone();
      const c = await caches.open('offline-audio-v1');
      await c.put(streamUrl, clone);
      swalToast('YT Cache tamam');
    }catch{
      swalToast('YT Cache hatası');
    }
  }
});

// 🔹 Media Session
function updateMediaSession(t){
  if(!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title:t.title, artist:t.artist||'', album:'SLP Player', artwork:[{src:t.artwork, sizes:'512x512', type:'image/png'}] });
  try{
    navigator.mediaSession.setActionHandler('play', ()=>audio.play());
    navigator.mediaSession.setActionHandler('pause', ()=>audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
  }catch{}
}

// 🔹 Notifications
async function showNowPlayingNotification(t){
  if(Notification.permission!=='granted') return;
  const reg = await navigator.serviceWorker.getRegistration();
  if(!reg) return;
  reg.showNotification('Çalınıyor: '+t.title, {
    body: (t.artist||'Bilinmiyor')+' — SLP Player',
    icon: t.thumbnail,
    badge: '/icons/icon-192.png',
    tag:'now-playing',
    renotify:true
  });
}

// 🔹 Mini/Expanded player wiring
[mini.btnPlay, xp.btnPlay].forEach(btn=>btn.addEventListener('click', ()=>audio.paused?audio.play():audio.pause()));
[mini.btnPrev, xp.btnPrev].forEach(btn=>btn.addEventListener('click', playPrev));
[mini.btnNext, xp.btnNext].forEach(btn=>btn.addEventListener('click', playNext));

expandBtn.addEventListener('click', ()=>{ expandedPanel.classList.remove('hidden'); miniPanel.classList.add('hidden'); });
xp.btnClose.addEventListener('click', ()=>{ expandedPanel.classList.add('hidden'); miniPanel.classList.remove('hidden'); });

// 🔹 Audio progress
function syncSeek(){ if(!isFinite(audio.duration)) return; xp.seek.max = Math.floor(audio.duration); xp.seek.value = Math.floor(audio.currentTime); xp.cur.textContent = fmt(audio.currentTime); xp.dur.textContent = fmt(audio.duration); }
audio.addEventListener('timeupdate', syncSeek);
audio.addEventListener('loadedmetadata', syncSeek);
xp.seek.addEventListener('input', ()=>audio.currentTime = +xp.seek.value);

// 🔹 Auto-play next
audio.addEventListener('ended', ()=>{ if(repeat==='one'){ audio.currentTime=0; audio.play(); } else playNext(); });

// 🔹 Initial
renderLibrary();
  
