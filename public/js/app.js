/* app.js — SLP client script
   - YouTube-only search
   - mobile-first responsive UI wiring
   - queue/playlist/cache/play controls
*/

const installBtn = document.getElementById('installBtn');
let deferredPrompt = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(console.warn);
}
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn?.classList.remove('hidden');
});
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  try {
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    deferredPrompt = null;
    installBtn.classList.add('hidden');
  } catch (err) {
    console.warn('install prompt error', err);
  }
});

// Theme
const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');
function setTheme(mode){
  if(mode === 'dark'){
    document.documentElement.classList.add('dark');
    themeLabel.textContent = 'Koyu';
  } else {
    document.documentElement.classList.remove('dark');
    themeLabel.textContent = 'Açık';
  }
  localStorage.setItem('theme', mode);
}
setTheme(localStorage.getItem('theme') || 'dark');
themeToggle?.addEventListener('click', ()=> setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark'));

// Helpers
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const fmt = t => {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};
const ytIdFromUrl = (url) => {
  try {
    if (!url) return null;
    // handle full URLs and youtu.be
    const u = new URL(url, location.origin);
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
    if ((u.hostname.includes('youtube.com') || u.hostname.includes('music.youtube.com')) && u.searchParams.has('v')) return u.searchParams.get('v');
    // fallback: if string looks like a bare id
    const maybe = url.match(/^[A-Za-z0-9_-]{11}$/);
    return maybe ? maybe[0] : null;
  } catch(e){ return null; }
};

// DOM refs
const searchInput = $('#search');
const tracksEl = $('#tracks');
const playlistListEl = $('#playlistList');
const downloadListEl = $('#downloadList');

const audio = $('#audioEl');
const mini = {
  art: $('#npArtMini'),
  title: $('#npTitleMini'),
  artist: $('#npArtistMini'),
  btnPlay: $('#btnMiniPlay'),
  btnPrev: $('#btnMiniPrev'),
  btnNext: $('#btnMiniNext'),
  btnRew: $('#btnMiniRew'),
  btnFf: $('#btnMiniFf')
};
const xp = {
  art: $('#npArt'),
  title: $('#npTitle'),
  artist: $('#npArtist'),
  cur: $('#npCur'),
  dur: $('#npDur'),
  seek: $('#seek'),
  btnClose: $('#btnClose'),
  btnPlay: $('#btnPlay'),
  btnPrev: $('#btnPrev'),
  btnNext: $('#btnNext'),
  btnRew: $('#btnRew'),
  btnFf: $('#btnFf'),
  btnRepeat: $('#btnRepeat'),
  btnShuffle: $('#btnShuffle')
};
const expandBtn = $('#btnExpand');
const expandedPanel = $('#expandedPlayer');
const miniPanel = $('#miniPlayer');

// State
let searchResults = []; // array of { id, title, author, thumbnail, url }
let queue = [];         // array of ids (videoId or local id)
let currentIndex = 0;   // index in queue
let repeat = 'off';     // off|one|all
let shuffle = false;

// UI util classes (small helpers for consistent button style)
function mkBtnClass() {
  return 'inline-flex items-center justify-center w-10 h-10 p-2 rounded-full bg-black/5 dark:bg-white/10 hover:scale-[1.02] transition';
}

// Search + render (YouTube-only)
let searchTimer = 0;
searchInput?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(()=> renderLibrary(searchInput.value.trim()), 220);
});

async function renderLibrary(query = '') {
  tracksEl.innerHTML = '';
  searchResults = [];
  if (!query) return;

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('search failed');
    const data = await res.json();
    const results = data.results || [];

    // normalize
    searchResults = results.map(r => {
      const id = ytIdFromUrl(r.url) || (r.id || '');
      return {
        id,
        title: r.title || r.name || 'Unknown',
        author: r.author || r.channel || r.artist || '',
        thumbnail: r.thumbnail || r.thumbnails?.[0] || '/icons/icon-192.png',
        url: r.url
      };
    }).filter(x => x.id);

    // render each
    searchResults.forEach((t, idx) => {
      const row = document.createElement('div');
      row.className = 'flex flex-col sm:flex-row items-center justify-between p-2 rounded-lg bg-white/50 dark:bg-panel/50 mb-2';
      row.innerHTML = `
        <div class="flex items-center gap-3 w-full sm:w-auto min-w-0">
          <img src="${t.thumbnail}" class="w-12 h-12 rounded-lg object-cover" alt="thumb"/>
          <div class="ml-2 min-w-0">
            <div class="font-medium truncate">${escapeHtml(t.title)}</div>
            <div class="text-xs text-gray-600 dark:text-white/60 truncate">${escapeHtml(t.author)}</div>
          </div>
        </div>
        <div class="flex gap-2 mt-2 sm:mt-0">
          <button data-id="${t.id}" data-idx="${idx}" class="${mkBtnClass()} play-btn" title="Çal" aria-label="Çal">
            ${svgPlay()}
          </button>
          <button data-id="${t.id}" data-idx="${idx}" class="${mkBtnClass()} addpl-btn" title="Playlist'e ekle" aria-label="Playlist'e ekle">
            ${svgPlus()}
          </button>
          <button data-id="${t.id}" data-idx="${idx}" class="${mkBtnClass()} cache-btn" title="Cachele (offline)" aria-label="Cachele">
            ${svgDownload()}
          </button>
        </div>
      `;
      tracksEl.appendChild(row);
    });

    // When rendering search results, also set a "searchQueue" reference (used when user hits play on a result)
    // But don't auto-play anything.
  } catch (err) {
    console.error('YT Search error', err);
    tracksEl.innerHTML = `<div class="p-3 text-xs text-red-500">Arama sırasında hata oldu</div>`;
  }
}

// click handler (delegation)
tracksEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;

  const id = btn.dataset.id;
  const idx = Number(btn.dataset.idx);
  if (!id) return;

  if (btn.classList.contains('play-btn')) {
    // Create queue from current searchResults (so forward/prev follow search)
    const ids = searchResults.map(x => x.id);
    if (ids.length === 0) {
      // fallback: single id
      setQueue([id], 0);
    } else {
      setQueue(ids, idx);
    }
  } else if (btn.classList.contains('addpl-btn')) {
    // add to playlist (ask user)
    addToPlaylistDialog(id);
  } else if (btn.classList.contains('cache-btn')) {
    // cache /stream/:id response
    try {
      await cacheYouTubeTrack(id);
      swalToast('YT Cache tamam');
      renderDownloads();
    } catch (err) {
      console.error('cache error', err);
      swalToast('YT Cache hatası');
    }
  }
});

// Playlist helpers (use simplified dialogs)
async function addToPlaylistDialog(videoId){
  // fetch playlists from localStorage
  const playlists = loadPlaylists();
  if (!playlists.length) {
    const ok = confirm('Önce bir playlist oluştur?');
    return;
  }
  const name = prompt('Hangi playlist eklensin? Mevcut: ' + playlists.map(p=>p.name).join(', '));
  if (!name) return;
  const pl = playlists.find(p => p.name === name) || playlists[0];
  if (!pl.items.includes(videoId)) pl.items.push(videoId);
  savePlaylists(playlists);
  swalToast('Eklendi');
}

// queue control
function setQueue(ids = [], start = 0) {
  queue = ids.slice();
  if (!Array.isArray(queue) || queue.length === 0) {
    currentIndex = -1;
    audio.pause();
    audio.removeAttribute('src');
    return;
  }
  currentIndex = Math.min(Math.max(parseInt(start) || 0, 0), queue.length - 1);
  playById(queue[currentIndex]);
}

function idxNext(){
  if (queue.length === 0) return -1;
  if (shuffle) return Math.floor(Math.random() * queue.length);
  let i = currentIndex + 1;
  if (i >= queue.length) {
    if (repeat === 'all') i = 0;
    else return -1; // stop
  }
  return i;
}
function idxPrev(){
  if (queue.length === 0) return -1;
  if (shuffle) return Math.floor(Math.random() * queue.length);
  let i = currentIndex - 1;
  if (i < 0) {
    if (repeat === 'all') i = queue.length - 1;
    else return -1;
  }
  return i;
}
function playNext(){
  const i = idxNext();
  if (i < 0) {
    audio.pause();
    return;
  }
  currentIndex = i;
  playById(queue[currentIndex]);
}
function playPrev(){
  // if >3s then restart
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  const i = idxPrev();
  if (i < 0) { audio.currentTime = 0; return; }
  currentIndex = i;
  playById(queue[currentIndex]);
}

// play implementation
async function playById(id){
  if (!id) return;
  const isYouTube = /^[A-Za-z0-9_-]{11}$/.test(id);
  let src;
  let meta = { title: id, artist: '', artwork: '/icons/icon-192.png' };

  if (isYouTube) {
    src = `/stream/${id}`;
    // try to find metadata from searchResults
    const found = searchResults.find(s => s.id === id);
    if (found) {
      meta.title = found.title;
      meta.artist = found.author;
      meta.artwork = found.thumbnail;
    } else {
      // fallback call to backend to get metadata? skip for now
      meta.title = meta.title || 'YouTube';
    }
  } else {
    // treat as local (but local is disabled by requirement) — still allow playing downloads by URL
    const t = findLocalTrackById(id);
    if (t) {
      src = t.url;
      meta.title = t.title;
      meta.artist = t.artist || '';
      meta.artwork = t.artwork || '/icons/icon-192.png';
    } else {
      src = id; // assume direct src
    }
  }

  try {
    // prefer cache if available
    const cached = await caches.open('offline-audio-v1').then(c => c.match(src));
    if (cached) {
      const blob = await cached.blob();
      audio.src = URL.createObjectURL(blob);
    } else {
      audio.src = src;
    }
    await audio.play();

    // update UI
    mini.title.textContent = meta.title;
    mini.artist.textContent = meta.artist || '—';
    mini.art.src = meta.artwork || '/icons/icon-192.png';
    xp.title.textContent = meta.title;
    xp.artist.innerHTML = (meta.artist || '—') + " <span class='text-accent'>• SLP Player</span>";
    xp.art.src = meta.artwork || '/icons/icon-512.png';

    updateMediaSession(meta);
    showNowPlayingNotification(meta);
  } catch (err) {
    console.error('play error', err);
    swalToast('Çalma hatası');
  }
}

// utility to find local track (we have local disabled but downloads list uses same cache keys)
function findLocalTrackById(id) {
  // not used much — left for fallback
  return null;
}

// Cache YT track: fetch /stream/:id and put in cache
async function cacheYouTubeTrack(videoId) {
  if (!videoId) throw new Error('no id');
  const url = `/stream/${videoId}`;
  const resp = await fetch(url, { credentials: 'same-origin' });
  if (!resp.ok) throw new Error('fetch failed ' + resp.status);
  const cache = await caches.open('offline-audio-v1');
  await cache.put(url, resp.clone());
  return true;
}

// Downloads list rendering (reads caches)
async function renderDownloads() {
  downloadListEl.innerHTML = '';
  const cache = await caches.open('offline-audio-v1');
  const keys = await cache.keys();
  for (const req of keys) {
    const url = new URL(req.url);
    const keyPath = url.pathname + url.search;
    // try to get some friendly name from searchResults / storage
    const vid = ytIdFromUrl(req.url) || (url.pathname.startsWith('/stream/') ? url.pathname.split('/stream/')[1] : null);
    const title = (searchResults.find(s => s.id === vid)?.title) || (vid ? `YT ${vid}` : keyPath);
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between p-2 rounded-lg bg-white/50 dark:bg-panel/50 mb-2';
    li.innerHTML = `<div class="truncate">${escapeHtml(title)}</div>
      <div class="flex gap-2">
        <button data-url="${req.url}" class="${mkBtnClass()} dl-play"> ${svgPlay()} </button>
        <button data-url="${req.url}" class="${mkBtnClass()} dl-remove"> ${svgTrash()} </button>
      </div>`;
    downloadListEl.appendChild(li);
  }
}
downloadListEl.addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const url = b.dataset.url;
  if (b.classList.contains('dl-play')) {
    const cache = await caches.open('offline-audio-v1');
    const hit = await cache.match(url);
    if (hit) {
      const blob = await hit.blob();
      audio.src = URL.createObjectURL(blob);
      audio.play();
    }
  } else if (b.classList.contains('dl-remove')) {
    const cache = await caches.open('offline-audio-v1');
    await cache.delete(url);
    renderDownloads();
  }
});

// Player controls wiring
mini.btnPlay.addEventListener('click', ()=> { if (audio.paused) audio.play(); else audio.pause(); });
xp.btnPlay.addEventListener('click', ()=> { if (audio.paused) audio.play(); else audio.pause(); });
mini.btnPrev.addEventListener('click', playPrev);
xp.btnPrev.addEventListener('click', playPrev);
mini.btnNext.addEventListener('click', playNext);
xp.btnNext.addEventListener('click', playNext);
mini.btnRew.addEventListener('click', ()=> seekBy(-10));
xp.btnRew.addEventListener('click', ()=> seekBy(-10));
mini.btnFf.addEventListener('click', ()=> seekBy(10));
xp.btnFf.addEventListener('click', ()=> seekBy(10));
expandBtn.addEventListener('click', ()=> { expandedPanel.classList.remove('hidden'); miniPanel.classList.add('hidden'); });
xp.btnClose.addEventListener('click', ()=> { expandedPanel.classList.add('hidden'); miniPanel.classList.remove('hidden'); });
xp.btnRepeat.addEventListener('click', ()=> { repeat = repeat==='off'?'all': repeat==='all'?'one':'off'; xp.btnRepeat.textContent = repeat==='one'?'⟲1': repeat==='all'?'⟲∞':'⟲'; });
xp.btnShuffle.addEventListener('click', ()=> { shuffle = !shuffle; xp.btnShuffle.classList.toggle('ring-2', shuffle); });

// seeking / progress
function seekBy(sec) {
  try {
    audio.currentTime = Math.max(0, Math.min((audio.duration || 0), audio.currentTime + sec));
  } catch(e){ console.warn(e); }
}
function syncSeek(){
  if (!isFinite(audio.duration)) return;
  const v = Math.floor(audio.currentTime);
  const d = Math.floor(audio.duration);
  xp.seek.max = d;
  xp.seek.value = v;
  xp.cur.textContent = fmt(v);
  xp.dur.textContent = fmt(d);
}
audio.addEventListener('timeupdate', syncSeek);
audio.addEventListener('loadedmetadata', syncSeek);
xp.seek.addEventListener('input', ()=> audio.currentTime = +xp.seek.value);

audio.addEventListener('play', ()=> { mini.btnPlay.innerHTML = svgPause(); xp.btnPlay.innerHTML = svgPause(); });
audio.addEventListener('pause', ()=> { mini.btnPlay.innerHTML = svgPlay(); xp.btnPlay.innerHTML = svgPlay(); });
audio.addEventListener('ended', ()=> {
  if (repeat === 'one') {
    audio.currentTime = 0; audio.play();
  } else playNext();
});

// Media Session + notifications
function updateMediaSession(meta) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: meta.title,
      artist: meta.artist || '',
      album: 'SLP Player',
      artwork: [{ src: meta.artwork || '/icons/icon-192.png', sizes: '512x512', type: 'image/png' }]
    });
    navigator.mediaSession.setActionHandler('play', ()=> audio.play());
    navigator.mediaSession.setActionHandler('pause', ()=> audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    navigator.mediaSession.setActionHandler('seekbackward', ()=> seekBy(-10));
    navigator.mediaSession.setActionHandler('seekforward', ()=> seekBy(10));
    navigator.mediaSession.setActionHandler('seekto', (details)=> {
      if (details.fastSeek && 'fastSeek' in audio) audio.fastSeek(details.seekTime);
      else audio.currentTime = details.seekTime;
    });
  } catch (e){ console.warn(e); }
}

async function showNowPlayingNotification(meta) {
  try {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    await reg.showNotification(meta.title || 'Çalınıyor', {
      body: (meta.artist || 'Bilinmiyor') + ' — SLP Player',
      icon: meta.artwork || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'now-playing',
      renotify: true,
      actions: [
        { action: 'prev', title: '⏮' },
        { action: 'rew', title: '-10s' },
        { action: 'toggle', title: audio.paused ? '▶' : '⏸' },
        { action: 'ff', title: '+10s' },
        { action: 'next', title: '⏭' }
      ]
    });
  } catch (e) { /* fail silently */ }
}

// Service worker messages are handled in SW to call client; unknown here

// Simple storage helpers for playlists (local)
const LS_PLAYLISTS = 'mp_playlists_v3';
function loadPlaylists(){ try { return JSON.parse(localStorage.getItem(LS_PLAYLISTS)) || []; } catch { return []; } }
function savePlaylists(p){ localStorage.setItem(LS_PLAYLISTS, JSON.stringify(p)); }
function renderPlaylists(){
  playlistListEl.innerHTML = '';
  const pls = loadPlaylists();
  if (!pls.length) {
    playlistListEl.innerHTML = '<div class="text-sm text-gray-500 p-2">Playlist yok</div>';
    return;
  }
  pls.forEach(pl => {
    const li = document.createElement('li');
    li.className = 'group relative rounded-xl overflow-hidden bg-white/50 dark:bg-panel/50 mb-2';
    li.innerHTML = `
      <div class="aspect-square w-full bg-black/10">
        <img src="${pl.cover || '/icons/icon-512.png'}" class="w-full h-full object-cover"/>
      </div>
      <div class="p-2 flex items-center justify-between">
        <div class="min-w-0">
          <div class="font-medium truncate">${escapeHtml(pl.name)}</div>
          <div class="text-xs text-gray-500">${pl.items.length} parça</div>
        </div>
        <div class="flex gap-1">
          <button data-id="${pl.id}" class="open px-2 py-1 rounded-full bg-accent text-white text-xs">Çal</button>
          <button data-id="${pl.id}" class="share px-2 py-1 rounded-full bg-white/10 text-xs">Paylaş</button>
        </div>
      </div>`;
    playlistListEl.appendChild(li);
  });
}
playlistListEl.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.dataset.id;
  const pls = loadPlaylists();
  const pl = pls.find(p => p.id === id);
  if (!pl) return;
  if (b.classList.contains('open')) {
    const ids = pl.items.slice();
    setQueue(ids, 0);
  }
});

// initial renders
renderPlaylists();
renderDownloads();

// small helpers & svg icons
function escapeHtml(s){ return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }
function svgPlay(){ return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3v18l15-9z"/></svg>`; }
function svgPause(){ return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`; }
function svgPlus(){ return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5v14m7-7H5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`; }
function svgDownload(){ return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v12"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>`; }
function svgTrash(){ return `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18"/><path d="M8 6v14m8-14v14"/><path d="M10 6V4h4v2"/></svg>`; }

// expose some debug helpers
window._SLP = {
  setQueue, playNext, playPrev, renderDownloads, renderPlaylists
};

