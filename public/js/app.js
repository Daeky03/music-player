// public/js/app.js
// Full-featured frontend player logic — mobile-first, media session, notifications, cache, yt search & queue.
// Assumes DOM structure from layout.ejs / index.ejs provided earlier.

const audio = document.getElementById('audioEl');

// UI refs (big player + controls)
const npArt = document.getElementById('npArt');
const npTitle = document.getElementById('npTitle');
const npArtist = document.getElementById('npArtist');
const npCur = document.getElementById('npCur');
const npDur = document.getElementById('npDur');
const seek = document.getElementById('seek');

const btnPlay = document.getElementById('btnPlay');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnRew = document.getElementById('btnRew');
const btnFf = document.getElementById('btnFf');
const btnRepeat = document.getElementById('btnRepeat');
const btnShuffle = document.getElementById('btnShuffle');
const btnExpand = document.getElementById('btnExpand');
const btnClose = document.getElementById('btnClose');

const tracksEl = document.getElementById('tracks');
const playlistListEl = document.getElementById('playlistList');
const downloadListEl = document.getElementById('downloadList');
const searchInput = document.getElementById('searchInput');
const searchBtnLocal = document.getElementById('searchBtnLocal');
const installBtn = document.getElementById('installBtn');
const themeToggle = document.getElementById('themeToggle');
const themeLabel = document.getElementById('themeLabel');

let deferredPrompt = null;

// PWA install prompt handling
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn?.classList.remove('hidden');
});
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const res = await deferredPrompt.userChoice.catch(()=>({outcome:'dismissed'}));
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});

// Theme toggle
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

// Storage keys and sample tracks
const LS_TRACKS = 'mp_tracks_v3';
const LS_PLAYLISTS = 'mp_playlists_v3';
const SAMPLE_TRACKS = [
  // Note: local tracks are present but play is disabled per request (only YouTube & cached YT allowed)
  { id: 'local1', title: 'Local Example', artist: 'Artist', url: '/audio/sample1.mp3', artwork: '/icons/icon-512.png', duration: 0 }
];

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let tracks = load(LS_TRACKS, SAMPLE_TRACKS);
let playlists = load(LS_PLAYLISTS, [{ id:'pl1', name:'Favoriler', cover:null, items:[] }]);

// Player state
let queue = [];            // array of items: {id, type:'yt'|'local', title, artist, artwork, url? , videoId?}
let currentIndex = -1;
let repeatMode = 'off';    // off | one | all
let shuffle = false;
let seekDragging = false;

// Helpers
const fmt = (t) => {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t/60), s = Math.floor(t%60).toString().padStart(2,'0');
  return `${m}:${s}`;
};

function updateUIPlaying(isPlaying) {
  if (isPlaying) {
    btnPlay.classList.add('playing');
    btnPlay.innerHTML = '⏸';
  } else {
    btnPlay.classList.remove('playing');
    btnPlay.innerHTML = '▶';
  }
}

// Media Session & Notification helpers
function updateMediaSessionMeta(item) {
  if (!('mediaSession' in navigator)) return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: item.title || 'Unknown',
      artist: item.artist || '',
      album: 'SLP',
      artwork: [{ src: item.artwork || '/icons/icon-512.png', sizes: '512x512', type: 'image/png' }]
    });
    navigator.mediaSession.setActionHandler('play', async ()=> await audio.play());
    navigator.mediaSession.setActionHandler('pause', ()=> audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', playPrev);
    navigator.mediaSession.setActionHandler('nexttrack', playNext);
    navigator.mediaSession.setActionHandler('seekbackward', ()=> audio.currentTime = Math.max(0, audio.currentTime - 10));
    navigator.mediaSession.setActionHandler('seekforward', ()=> audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10));
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.fastSeek && typeof audio.fastSeek === 'function') audio.fastSeek(details.seekTime);
      else audio.currentTime = details.seekTime;
    });
  } catch(e) { /* ignore */ }
}

async function showNowPlayingNotification(item) {
  try {
    if (!('serviceWorker' in navigator) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return;
    // Make artwork available: if remote CORS issues, fallback to icon
    const icon = item.artwork || '/icons/icon-192.png';
    await reg.showNotification(item.title || 'Çalınıyor', {
      body: (item.artist || '') + ' — SLP',
      icon,
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
  } catch (e) {
    console.warn('Notif error', e);
  }
}

// Queue management
function setQueue(items, start = 0) {
  queue = items.slice();
  currentIndex = Math.min(Math.max(start, 0), queue.length - 1);
  // Play index safely
  if (queue.length > 0 && currentIndex >= 0) playIndex(currentIndex);
}

function playIndex(idx) {
  if (!queue[idx]) return;
  currentIndex = idx;
  const item = queue[idx];

  // If cached in Cache API -> play cached response
  const cacheKey = (item.type === 'yt' && item.videoId) ? `/stream/${item.videoId}` : item.url;
  caches.open('yt-audio-v1').then(c => c.match(cacheKey)).then(hit => {
    if (hit) {
      // cached -> use blob URL
      return hit.blob().then(b => URL.createObjectURL(b));
    } else {
      // not cached -> use stream endpoint (for yt) or direct url for local (local play disabled by requirement)
      if (item.type === 'yt') return `/stream/${item.videoId}`;
      return item.url || '';
    }
  }).then(src => {
    if (!src) return;
    audio.src = src;
    audio.play().catch(()=>{});
    // Update UI meta
    npTitle.textContent = item.title || '—';
    npArtist.textContent = item.artist || '—';
    npArt.src = item.artwork || '/icons/icon-512.png';
    updateMediaSessionMeta(item);
    showNowPlayingNotification(item);
    updateUIPlaying(true);
  }).catch(err => {
    console.error('playIndex error', err);
  });
}

function playNext() {
  if (queue.length === 0) return;
  if (shuffle) {
    const next = Math.floor(Math.random() * queue.length);
    playIndex(next);
    return;
  }
  let nextIndex = currentIndex + 1;
  if (nextIndex >= queue.length) {
    if (repeatMode === 'all') nextIndex = 0;
    else { /* stop at end */ audio.pause(); return; }
  }
  playIndex(nextIndex);
}

function playPrev() {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (shuffle) {
    const prev = Math.floor(Math.random() * queue.length);
    playIndex(prev); return;
  }
  let prevIndex = currentIndex - 1;
  if (prevIndex < 0) {
    if (repeatMode === 'all') prevIndex = queue.length - 1;
    else { audio.currentTime = 0; return; }
  }
  playIndex(prevIndex);
}

// Audio events
audio.addEventListener('loadedmetadata', () => {
  npDur.textContent = fmt(audio.duration || 0);
  seek.max = Math.floor(audio.duration || 0);
});
audio.addEventListener('timeupdate', () => {
  npCur.textContent = fmt(audio.currentTime || 0);
  if (!seekDragging) seek.value = Math.floor(audio.currentTime || 0);
});
seek.addEventListener('input', () => {
  seekDragging = true;
  npCur.textContent = fmt(+seek.value);
});
seek.addEventListener('change', () => {
  audio.currentTime = +seek.value;
  seekDragging = false;
});
audio.addEventListener('play', () => updateUIPlaying(true));
audio.addEventListener('pause', () => updateUIPlaying(false));
audio.addEventListener('ended', () => {
  if (repeatMode === 'one') {
    audio.currentTime = 0; audio.play();
  } else playNext();
});

// Control wiring
btnPlay.addEventListener('click', () => {
  if (audio.paused) audio.play();
  else audio.pause();
});
btnPrev.addEventListener('click', playPrev);
btnNext.addEventListener('click', playNext);
btnRew.addEventListener('click', () => audio.currentTime = Math.max(0, audio.currentTime - 10));
btnFf.addEventListener('click', () => audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10));
btnRepeat.addEventListener('click', () => {
  repeatMode = repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off';
  btnRepeat.textContent = repeatMode === 'one' ? '⟲1' : repeatMode === 'all' ? '⟲∞' : '⟲';
});
btnShuffle.addEventListener('click', () => {
  shuffle = !shuffle;
  btnShuffle.classList.toggle('ring-2', shuffle);
});

// Play/pause via space bar when focused (accessibility)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault(); if (audio.paused) audio.play(); else audio.pause();
  }
});

// Rendering library and YouTube search
function renderLocalTracks(container) {
  // local tracks are present but per request local play disabled -> show but disable play button visually
  const list = tracks || [];
  list.forEach(t => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10';
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <img src="${t.artwork||'/icons/icon-192.png'}" class="w-12 h-12 rounded-lg object-cover"/>
        <div class="min-w-0">
          <div class="font-medium truncate max-w-[220px]">${t.title}</div>
          <div class="text-xs text-slate-500 dark:text-white/50 truncate max-w-[220px]">${t.artist||''}</div>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn disabled-play" title="Local play disabled">⏵</button>
        <button class="btn addpl" data-id="${t.id}" title="Playlist'e ekle">＋</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function renderYtResults(container, results) {
  // results: [{title, author, thumbnail, url, videoId}]
  results.forEach(t => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10';
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <img src="${t.thumbnail}" class="w-12 h-12 rounded-lg object-cover"/>
        <div class="min-w-0">
          <div class="font-medium truncate max-w-[220px]">${t.title}</div>
          <div class="text-xs text-slate-500 dark:text-white/50 truncate max-w-[220px]">${t.author||''}</div>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn play-yt" data-videoid="${t.videoId}" data-title="${escapeHtmlAttr(t.title)}" data-author="${escapeHtmlAttr(t.author)}" data-thumb="${t.thumbnail}" title="Çal">▶</button>
        <button class="btn addpl-yt" data-videoid="${t.videoId}" data-title="${escapeHtmlAttr(t.title)}" data-author="${escapeHtmlAttr(t.author)}" data-thumb="${t.thumbnail}" title="Playlist'e ekle">＋</button>
        <button class="btn cache-yt" data-videoid="${t.videoId}" data-title="${escapeHtmlAttr(t.title)}" data-author="${escapeHtmlAttr(t.author)}" data-thumb="${t.thumbnail}" title="Önbelleğe al">⬇</button>
      </div>
    `;
    container.appendChild(row);
  });
}

// Escape helper for data attributes
function escapeHtmlAttr(s) { return String(s||'').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// Main render
async function renderLibrary(filter = '') {
  tracksEl.innerHTML = '';
  // 1) Local (but play disabled)
  renderLocalTracks(tracksEl);

  // 2) If search query provided -> YouTube search
  const q = (filter || '').trim();
  if (!q) {
    document.getElementById('noResults')?.classList.remove('hidden');
    return;
  }
  document.getElementById('noResults')?.classList.add('hidden');

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) throw new Error('YT search failed');
    const data = await res.json();
    const results = (data.results || []).map(r => ({
      title: r.title,
      author: r.author,
      thumbnail: r.thumbnail,
      url: r.url,
      videoId: (new URL(r.url)).searchParams.get('v') || r.id || null
    })).filter(x => x.videoId);
    if (results.length === 0) {
      const no = document.createElement('div'); no.className = 'text-sm text-slate-500'; no.textContent = 'YouTube sonuç bulunamadı.';
      tracksEl.appendChild(no);
      return;
    }
    renderYtResults(tracksEl, results);
    // Save last search results to ephemeral queue source (so "continue" from search works)
    lastSearchResults = results;
  } catch (e) {
    console.error('YT search error', e);
    const errDiv = document.createElement('div'); errDiv.className = 'text-sm text-red-500'; errDiv.textContent = 'Arama esnasında hata.';
    tracksEl.appendChild(errDiv);
  }
}

let lastSearchResults = [];

// Search wiring
searchBtnLocal?.addEventListener('click', () => renderLibrary(searchInput?.value || ''));
searchInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') renderLibrary(searchInput.value || ''); });

// Click delegation for play/add/cache on results
tracksEl.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  // YT play
  if (btn.classList.contains('play-yt')) {
    const videoId = btn.dataset.videoid;
    const title = btn.dataset.title;
    const author = btn.dataset.author;
    const thumb = btn.dataset.thumb;
    // Build queue from lastSearchResults so "continue" uses search order
    const items = lastSearchResults.map(r => ({ type:'yt', videoId: r.videoId, title: r.title, artist: r.author, artwork: r.thumbnail }));
    const start = items.findIndex(it => it.videoId === videoId);
    if (start === -1) {
      // fallback: single item
      setQueue([{ type:'yt', videoId, title, artist:author, artwork:thumb }], 0);
    } else {
      setQueue(items, start);
    }
    return;
  }
  // YT add to playlist
  if (btn.classList.contains('addpl-yt')) {
    const videoId = btn.dataset.videoid;
    const title = btn.dataset.title;
    // convert video item to a unique string id for playlist, e.g. "yt:videoId"
    const plItemId = `yt:${videoId}`;
    // show playlist selection
    if (playlists.length === 0) { Swal.fire('Önce playlist oluştur'); return; }
    const options = playlists.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
    const { value: plId } = await Swal.fire({ title:'Playlist seç', html:`<select id="pl-select" class="swal2-select">${options}</select>`, preConfirm: ()=> document.getElementById('pl-select').value, showCancelButton:true, confirmButtonText:'Ekle' });
    if (!plId) return;
    const pl = playlists.find(p=>p.id === plId);
    if (!pl.items.includes(plItemId)) pl.items.push(plItemId);
    save(LS_PLAYLISTS, playlists); renderPlaylists(); Swal.fire('Eklendi');
    return;
  }
  // YT cache button
  if (btn.classList.contains('cache-yt')) {
    const videoId = btn.dataset.videoid;
    await cacheYouTubeStream(videoId, { title: btn.dataset.title, artist: btn.dataset.author, artwork: btn.dataset.thumb });
    return;
  }
  // local playlist add (for disabled local play)
  if (btn.classList.contains('addpl')) {
    const id = btn.dataset.id;
    addToPlaylistDialog(id);
  }
});

// Caching function for YT streams: fetch /stream/:id and store in Cache API
async function cacheYouTubeStream(videoId, meta = {}) {
  try {
    const cache = await caches.open('yt-audio-v1');
    const streamUrl = `/stream/${videoId}`; // server should return proxied stream (Range supported)
    const resp = await fetch(streamUrl);
    if (!resp.ok) throw new Error('Stream fetch failed: ' + resp.status);
    // store clone in cache
    await cache.put(streamUrl, resp.clone());
    Swal.fire('YT Cache tamam');
    renderDownloads();
  } catch (e) {
    console.error('cache error', e);
    Swal.fire('YT Cache hatası: ' + (e.message || ''));
  }
}

// Downloads view - show cached entries
async function renderDownloads() {
  if (!downloadListEl) return;
  downloadListEl.innerHTML = '';
  const c = await caches.open('yt-audio-v1');
  const keys = await c.keys();
  if (keys.length === 0) {
    downloadListEl.innerHTML = '<div class="text-sm text-slate-500">Önbellek boş</div>';
    return;
  }
  for (const req of keys) {
    const url = req.url.replace(location.origin, '');
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10';
    const name = url.startsWith('/stream/') ? url.split('/').pop() : url;
    li.innerHTML = `<div class="truncate">${name}</div>
      <div class="flex gap-2">
        <button data-url="${url}" class="play cached-play">Çal</button>
        <button data-url="${url}" class="rm cached-del">Sil</button>
      </div>`;
    downloadListEl.appendChild(li);
  }
}

// Downloads click handling
downloadListEl.addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const url = b.dataset.url;
  const c = await caches.open('yt-audio-v1');
  if (b.classList.contains('cached-play')) {
    const hit = await c.match(url);
    if (hit) {
      const blob = await hit.blob();
      audio.src = URL.createObjectURL(blob);
      audio.play();
    }
  } else if (b.classList.contains('cached-del')) {
    await c.delete(url);
    renderDownloads();
  }
});

// Playlist rendering & CRUD
function renderPlaylists() {
  playlistListEl.innerHTML = '';
  playlists.forEach(pl => {
    const li = document.createElement('li');
    li.className = 'group relative rounded-xl overflow-hidden bg-black/5 dark:bg-white/10 p-2 mb-2 flex items-center justify-between';
    li.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <img src="${pl.cover || '/icons/icon-512.png'}" class="w-12 h-12 rounded-lg object-cover"/>
        <div class="min-w-0">
          <div class="font-medium truncate max-w-[180px]">${pl.name}</div>
          <div class="text-xs text-slate-500">${pl.items.length} parça</div>
        </div>
      </div>
      <div class="flex gap-1">
        <button data-id="${pl.id}" class="open pl-open px-2 py-1 rounded-full bg-accent text-white text-xs">Çal</button>
        <button data-id="${pl.id}" class="share pl-share px-2 py-1 rounded-full bg-white/10 text-xs">Paylaş</button>
        <button data-id="${pl.id}" class="edit pl-edit px-2 py-1 rounded-full bg-white/10 text-xs">Düzenle</button>
        <button data-id="${pl.id}" class="del pl-del px-2 py-1 rounded-full bg-white/10 text-xs">Sil</button>
      </div>
    `;
    playlistListEl.appendChild(li);
  });
}
playlistListEl.addEventListener('click', async (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const id = b.dataset.id; const pl = playlists.find(x => x.id === id); if (!pl) return;
  if (b.classList.contains('pl-open')) {
    // Build queue: items are stored as "yt:VIDEOID" or local ids
    const ids = pl.items.map(it => {
      if (typeof it === 'string' && it.startsWith('yt:')) {
        const vid = it.split(':')[1];
        return { type:'yt', videoId: vid, title: vid, artist: '' };
      } else {
        // local
        const t = tracks.find(tt => tt.id === it);
        return t ? { type:'local', url: t.url, title: t.title, artist: t.artist, artwork: t.artwork } : null;
      }
    }).filter(Boolean);
    if (ids.length === 0) { Swal.fire('Boş playlist'); return; }
    // Per requirement, local tracks are disabled from playback; filter only yt or cached items
    const filtered = ids.filter(i => i.type === 'yt');
    if (filtered.length === 0) { Swal.fire('Bu çalma listesinde oynatılabilir YouTube parçası yok'); return; }
    setQueue(filtered, 0);
  } else if (b.classList.contains('pl-edit')) {
    // simple edit name + cover
    const { value } = await Swal.fire({
      title: 'Playlist Düzenle',
      html: `<input id="pln" class="swal2-input" placeholder="Ad" value="${pl.name}"><input id="plc" type="file" accept="image/*" class="swal2-file">`,
      preConfirm: () => ({ name: document.getElementById('pln').value.trim(), file: document.getElementById('plc').files[0] || null }),
      showCancelButton: true, confirmButtonText: 'Kaydet'
    });
    if (!value) return;
    if (value.name) pl.name = value.name;
    if (value.file) {
      const reader = new FileReader();
      reader.onload = () => { pl.cover = reader.result; save(LS_PLAYLISTS, playlists); renderPlaylists(); Swal.fire('Güncellendi'); };
      reader.readAsDataURL(value.file);
    } else {
      save(LS_PLAYLISTS, playlists); renderPlaylists(); Swal.fire('Güncellendi');
    }
  } else if (b.classList.contains('pl-del')) {
    const ok = (await Swal.fire({ title: 'Silinsin mi?', showCancelButton:true, confirmButtonText:'Sil' })).isConfirmed;
    if (!ok) return;
    playlists = playlists.filter(x => x.id !== id);
    save(LS_PLAYLISTS, playlists); renderPlaylists();
  } else if (b.classList.contains('pl-share')) {
    sharePlaylist(pl);
  }
});

// Share playlist via compressed URL
function sharePlaylist(pl) {
  const payload = { name: pl.name, items: pl.items, cover: pl.cover || null };
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  const url = `${location.origin}${location.pathname}#pl=${compressed}`;
  if (navigator.share) navigator.share({ title: pl.name, text: 'Playlist', url }).catch(() => {});
  Swal.fire({ title: 'Paylaşım linki', html: `<input class="swal2-input" value="${url}" readonly>` });
}

// import from hash
(function importFromHash(){
  const m = location.hash.match(/#pl=([^&]+)/);
  if (!m) return;
  try {
    const json = LZString.decompressFromEncodedURIComponent(m[1]);
    if (!json) throw new Error('invalid');
    const payload = JSON.parse(json);
    const newPl = { id: crypto.randomUUID(), name: payload.name || 'Paylaşılan', cover: payload.cover || null, items: Array.isArray(payload.items) ? payload.items : [] };
    playlists.push(newPl); save(LS_PLAYLISTS, playlists); renderPlaylists(); Swal.fire('Playlist içe aktarıldı');
    history.replaceState(null, '', location.pathname + location.search);
  } catch (e) {
    console.error(e); Swal.fire('Playlist yüklenemedi');
  }
})();

// Add to playlist dialog (for local items)
async function addToPlaylistDialog(itemId) {
  if (playlists.length === 0) { Swal.fire('Önce playlist oluştur'); return; }
  const options = playlists.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  const { value: plId } = await Swal.fire({ title:'Playlist seç', html:`<select id="pl-select" class="swal2-select">${options}</select>`, preConfirm: ()=> document.getElementById('pl-select').value, showCancelButton:true, confirmButtonText:'Ekle' });
  if (!plId) return;
  const pl = playlists.find(p => p.id === plId);
  if (!pl.items.includes(itemId)) pl.items.push(itemId);
  save(LS_PLAYLISTS, playlists);
  renderPlaylists();
  Swal.fire('Eklendi');
}

// Escaping function for safety (small helper used above)
function decodeHTMLEntities(text) {
  const txt = document.createElement('textarea');
  txt.innerHTML = text;
  return txt.value;
}

// Service Worker messaging: react to notification actions forwarded from SW
navigator.serviceWorker?.addEventListener('message', (e) => {
  const { type } = e.data || {};
  if (!type) return;
  if (type === 'prev') playPrev();
  if (type === 'rew') audio.currentTime = Math.max(0, audio.currentTime - 10);
  if (type === 'ff') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
  if (type === 'toggle') { if (audio.paused) audio.play(); else audio.pause(); }
  if (type === 'next') playNext();
});

// initial render
renderPlaylists();
renderDownloads();
renderLibrary(''); // empty initially

// Request notification permission if not granted, but do not spam
if ('Notification' in window && Notification.permission === 'default') {
  // don't auto prompt; provide button in UI
}

// Expose for console debugging (optional)
window.SLP = {
  setQueue, playNext, playPrev, cacheYouTubeStream, renderLibrary, renderPlaylists, renderDownloads
};
