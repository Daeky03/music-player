// public/js/app.js
// Module: Full frontend logic for SLP (Lark-like experience)
const API_SEARCH = '/api/search';    // expects JSON { results: [ { title, author, thumbnail, url } ] }
const STREAM_PREFIX = '/stream/';    // server: /stream/:videoId
const LS_PL = 'slp_playlists_v1';
const LS_CACHE_META = 'slp_cache_meta_v1';

const audio = document.getElementById('audioEl');
const mainSearch = document.getElementById('mainSearch');
const searchBtn = document.getElementById('searchBtn');
const playlistsGrid = document.getElementById('playlistsGrid');
const resultsEl = document.getElementById('results');
const cachedList = document.getElementById('cachedList');

const miniPlayer = document.getElementById('miniPlayer');
const miniArt = document.getElementById('miniArt');
const miniTitle = document.getElementById('miniTitle');
const miniArtist = document.getElementById('miniArtist');
const miniPlay = document.getElementById('miniPlay');
const miniAdd = document.getElementById('miniAdd');

const bigPlayer = document.getElementById('bigPlayer');
const bigArt = document.getElementById('bigArt');
const bigTitle = document.getElementById('bigTitle');
const bigArtist = document.getElementById('bigArtist');
const btnPlay = document.getElementById('btnPlay');
const btnPrev = document.getElementById('btnPrev');
const btnNext = document.getElementById('btnNext');
const btnShuffle = document.getElementById('btnShuffle');
const btnLoop = document.getElementById('btnLoop');
const btnDownload = document.getElementById('btnDownload');
const btnAddToPl = document.getElementById('btnAddToPl');
const btnShare = document.getElementById('btnShare');
const btnClose = document.getElementById('btnClose');

const progressFill = document.getElementById('progressFill');
const progressThumb = document.getElementById('progressThumb');
const curTimeEl = document.getElementById('curTime');
const durTimeEl = document.getElementById('durTime');

let playlists = JSON.parse(localStorage.getItem(LS_PL) || 'null') || null;
let cacheMeta = JSON.parse(localStorage.getItem(LS_CACHE_META) || '{}');
if (!playlists) {
  // first-run: create a default playlist; use placeholder cover (can be changed later)
  playlists = [
    { id: 'pl_liked', name: 'Liked (YouTube)', cover: '/icons/icon-512.png', items: [] }
  ];
  localStorage.setItem(LS_PL, JSON.stringify(playlists));
}

function savePl() { localStorage.setItem(LS_PL, JSON.stringify(playlists)); }
function saveCacheMeta() { localStorage.setItem(LS_CACHE_META, JSON.stringify(cacheMeta)); }

// State: queue (array of {type:'yt',videoId,title,author,thumb}), currentIndex
let queue = [];
let currentIndex = -1;
let shuffle = false;
let loopMode = 'off'; // off|one|all
let lastSearch = [];

// UI helpers
function mkSVGPlay(){ return '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M5 3v18l15-9"/></svg>'; }
function mkSVGPause(){ return '<svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zM14 5v14h4V5h-4z"/></svg>'; }
function mkBadge(){ return '<span class="badge-down">İndirildi</span>'; }

// render playlists (left)
function renderPlaylists() {
  playlistsGrid.innerHTML = '';
  playlists.forEach(pl => {
    const div = document.createElement('div');
    div.className = 'pl-card flex items-center gap-3 p-3 rounded-lg bg-gradient-to-r from-white/60 to-white/40 dark:from-panel/80 dark:to-panel/70';
    div.innerHTML = `
      <img src="${pl.cover || '/icons/icon-512.png'}" class="w-16 h-16 rounded-lg object-cover"/>
      <div class="flex-1 min-w-0">
        <div class="font-semibold truncate">${pl.name}</div>
        <div class="text-xs text-gray-500 dark:text-white/50">${pl.items.length} parça</div>
      </div>
      <div class="flex flex-col gap-1">
        <button class="open-pl text-xs px-2 py-1 rounded-full bg-accent text-white" data-id="${pl.id}">Aç</button>
        <button class="edit-pl text-xs px-2 py-1 rounded-full bg-white/10" data-id="${pl.id}">Düzenle</button>
      </div>
    `;
    // clicking anywhere on card opens
    div.querySelector('.open-pl').addEventListener('click', ()=> openPlaylistDetail(pl.id));
    div.querySelector('.edit-pl').addEventListener('click', ()=> editPlaylist(pl.id));
    playlistsGrid.appendChild(div);
  });
}

// open playlist detail (right panel)
const playlistDetail = document.getElementById('playlistDetail');
const detailCover = document.getElementById('detailCover');
const detailName = document.getElementById('detailName');
const detailCount = document.getElementById('detailCount');
const detailTracks = document.getElementById('detailTracks');

function openPlaylistDetail(plId) {
  const pl = playlists.find(x=>x.id===plId); if(!pl) return;
  detailCover.src = pl.cover || '/icons/icon-512.png';
  detailName.textContent = pl.name;
  detailCount.textContent = `${pl.items.length} parça`;
  detailTracks.innerHTML = '';
  // items stored as 'yt:VIDEOID' or local ids (we handle yt only)
  pl.items.forEach((it, idx) => {
    const videoId = (typeof it === 'string' && it.startsWith('yt:')) ? it.split(':')[1] : null;
    const li = document.createElement('li');
    li.className = 'flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10';
    if (videoId) {
      // try to get cached meta for nice display, else show id
      const meta = cacheMeta[videoId] || {};
      li.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <img src="${meta.thumb||'/icons/icon-192.png'}" class="w-12 h-12 rounded object-cover"/>
          <div class="min-w-0">
            <div class="truncate font-medium">${meta.title||videoId}</div>
            <div class="text-xs text-gray-500 dark:text-white/50 truncate">${meta.author||''}</div>
          </div>
        </div>
        <div class="flex gap-2">
          <button class="play-song px-3 py-1 rounded-full bg-accent text-white" data-vid="${videoId}">Çal</button>
          <button class="more-song px-3 py-1 rounded-full bg-white/10" data-vid="${videoId}">⋯</button>
          <button class="del-song px-3 py-1 rounded-full bg-white/10" data-index="${idx}">Sil</button>
        </div>
      `;
      li.querySelector('.play-song').addEventListener('click', ()=> playPlaylistAt(plId, idx));
      li.querySelector('.more-song').addEventListener('click', (e)=> songMoreMenu(videoId, e.target));
      li.querySelector('.del-song').addEventListener('click', ()=> {
        pl.items.splice(idx,1); savePl(); openPlaylistDetail(plId); renderPlaylists();
      });
    } else {
      li.textContent = 'Unsupported item';
    }
    detailTracks.appendChild(li);
  });

  playlistDetail.classList.remove('hidden');
  document.getElementById('homeArea').classList.add('hidden');
}

// play playlist at index
function playPlaylistAt(plId, idx) {
  const pl = playlists.find(x=>x.id===plId); if(!pl) return;
  const items = pl.items.map(it => {
    if (typeof it === 'string' && it.startsWith('yt:')) {
      const v = it.split(':')[1];
      const meta = cacheMeta[v] || {};
      return { type:'yt', videoId: v, title: meta.title || v, author: meta.author || '', thumb: meta.thumb || '' };
    }
    return null;
  }).filter(Boolean);
  queue = items;
  currentIndex = Math.max(0, Math.min(idx, queue.length-1));
  startQueueAt(currentIndex);
}

// song "more" menu: share, cache, view details
function songMoreMenu(videoId, btnEl) {
  Swal.fire({
    title: 'Seçenekler',
    showCancelButton: true,
    html: `<div class="space-y-2">
      <button id="splay" class="swal2-confirm swal2-styled" style="display:inline-block">Çal</button>
      <button id="scache" class="swal2-confirm swal2-styled" style="display:inline-block;margin-left:8px;background:#7c3aed">Önbelleğe al</button>
      <button id="sshare" class="swal2-confirm swal2-styled" style="display:inline-block;margin-left:8px;background:#444">Paylaş</button>
    </div>`,
    showConfirmButton: false
  }).then(()=>{});
  setTimeout(()=> {
    document.getElementById('splay').addEventListener('click', ()=> {
      playSingleVideo(videoId); Swal.close();
    });
    document.getElementById('scache').addEventListener('click', ()=> { cacheVideo(videoId); Swal.close(); });
    document.getElementById('sshare').addEventListener('click', ()=> { shareSong(videoId); Swal.close(); });
  },80);
}

// play a single video: build a transient queue with lastSearch if available
function playSingleVideo(videoId) {
  // if lastSearch includes this video, build queue from lastSearch (so continue works), else play single.
  const idx = lastSearch.findIndex(x=>x.videoId===videoId);
  if (idx !== -1) {
    queue = lastSearch.map(r=> ({ type:'yt', videoId: r.videoId, title:r.title, author:r.author, thumb:r.thumbnail }));
    startQueueAt(idx);
  } else {
    queue = [{ type:'yt', videoId, title: (cacheMeta[videoId] && cacheMeta[videoId].title) || videoId }];
    startQueueAt(0);
  }
}

// start queue at index (set current and play)
function startQueueAt(i) {
  currentIndex = i;
  playCurrent();
  showMini();
}

// playCurrent obtains src (cached blob if present, else /stream/:id) and sets audio.src
async function playCurrent() {
  if (!queue[currentIndex]) return;
  const item = queue[currentIndex];
  updateBigPlayerMeta(item);
  // check cache
  const cachedKey = STREAM_PREFIX + item.videoId;
  const c = await caches.open('slp_streams_v1');
  const hit = await c.match(cachedKey);
  if (hit) {
    const blob = await hit.blob();
    audio.src = URL.createObjectURL(blob);
  } else {
    // use stream endpoint (server must support Range)
    audio.src = STREAM_PREFIX + item.videoId;
  }
  audio.play().catch(()=>{});
}

// update big/mini UI meta
function updateBigPlayerMeta(item) {
  bigTitle.textContent = item.title || '—';
  bigArtist.textContent = item.author || '—';
  bigArt.src = item.thumb || '/icons/icon-512.png';
  miniTitle.textContent = item.title || '—';
  miniArtist.textContent = item.author || '—';
  miniArt.src = item.thumb || '/icons/icon-192.png';
}

// show mini
function showMini() { miniPlayer.classList.remove('hidden'); }
// hide mini
function hideMini(){ miniPlayer.classList.add('hidden'); }

// event: audio time/progress UI
audio.addEventListener('timeupdate', ()=>{
  const d = audio.duration || 0;
  const cur = audio.currentTime || 0;
  const pct = d ? Math.max(0, Math.min(1, cur/d))*100 : 0;
  progressFill.style.width = pct+'%';
  progressThumb.style.left = `calc(${pct}% - 7px)`;
  curTimeEl.textContent = formatTime(cur);
  durTimeEl.textContent = formatTime(d);
});

// click progress to seek
document.querySelector('.progress-track')?.addEventListener('click', (e)=>{
  const rect = e.currentTarget.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const pct = x / rect.width;
  audio.currentTime = (audio.duration || 0) * pct;
});

// play/pause wiring
miniPlay.addEventListener('click', (e)=> {
  e.stopPropagation();
  if (audio.paused) audio.play(); else audio.pause();
});
btnPlay.addEventListener('click', ()=> { if (audio.paused) audio.play(); else audio.pause(); });
audio.addEventListener('play', ()=> { miniPlay.innerHTML = mkSVGPause(); btnPlay.innerHTML = mkSVGPause(); updateMediaSession(); });
audio.addEventListener('pause', ()=> { miniPlay.innerHTML = mkSVGPlay(); btnPlay.innerHTML = mkSVGPlay(); updateMediaSession(); });

// prev/next
btnPrev.addEventListener('click', ()=> {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  if (shuffle) { currentIndex = Math.floor(Math.random()*queue.length); } else currentIndex = Math.max(0, currentIndex-1);
  playCurrent();
});
btnNext.addEventListener('click', ()=> {
  if (shuffle) currentIndex = Math.floor(Math.random()*queue.length);
  else {
    currentIndex++;
    if (currentIndex >= queue.length) {
      if (loopMode === 'all') currentIndex = 0;
      else { audio.pause(); return; }
    }
  }
  playCurrent();
});

// shuffle/loop toggles
btnShuffle.addEventListener('click', ()=> { shuffle = !shuffle; btnShuffle.classList.toggle('ring-2', shuffle); });
btnLoop.addEventListener('click', ()=> {
  loopMode = loopMode === 'off' ? 'all' : loopMode === 'all' ? 'one' : 'off';
  btnLoop.textContent = loopMode === 'one' ? '⟲1' : loopMode === 'all' ? '⟲∞' : '⟲';
});

// on track end
audio.addEventListener('ended', ()=> {
  if (loopMode === 'one') { audio.currentTime = 0; audio.play(); return; }
  // auto next
  btnNext.click();
});

// search wiring
searchBtn.addEventListener('click', ()=> performSearch(mainSearch.value || ''));
mainSearch.addEventListener('keydown', (e)=> { if (e.key === 'Enter') performSearch(mainSearch.value || ''); });

async function performSearch(q) {
  if (!q || q.trim().length < 1) return;
  resultsEl.innerHTML = '<div class="text-sm text-gray-500">Aranıyor…</div>';
  try {
    const res = await fetch(API_SEARCH + '?q=' + encodeURIComponent(q));
    if (!res.ok) throw new Error('search failed');
    const json = await res.json();
    const arr = (json.results || []).map(r => {
      // normalize: take URL and extract v param
      let vid = null;
      try { vid = new URL(r.url).searchParams.get('v') || r.id || null; } catch(e){ vid = r.id || null; }
      return { title: r.title, author: r.author, thumbnail: r.thumbnail, url: r.url, videoId: vid };
    }).filter(x=>x.videoId);
    lastSearch = arr;
    renderSearchResults(arr);
  } catch (e) {
    console.error(e);
    resultsEl.innerHTML = '<div class="text-sm text-red-500">Arama başarısız.</div>';
  }
}

function renderSearchResults(list) {
  resultsEl.innerHTML = '';
  list.forEach(item => {
    const row = document.createElement('div');
    row.className = 'flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10';
    row.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <img src="${item.thumbnail}" class="w-12 h-12 rounded object-cover"/>
        <div class="min-w-0">
          <div class="truncate font-medium">${item.title}</div>
          <div class="text-xs text-gray-500">${item.author}</div>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="play-it px-3 py-1 rounded-full bg-accent text-white" data-vid="${item.videoId}">Çal</button>
        <button class="add-it px-3 py-1 rounded-full bg-white/10" data-vid="${item.videoId}">＋</button>
        <button class="dl-it px-3 py-1 rounded-full bg-white/10" data-vid="${item.videoId}">⬇</button>
      </div>
    `;
    row.querySelector('.play-it').addEventListener('click', ()=> {
      // build queue from search results so continue works
      queue = list.map(l => ({ type:'yt', videoId: l.videoId, title: l.title, author: l.author, thumb: l.thumbnail }));
      const idx = queue.findIndex(q=>q.videoId === item.videoId);
      startQueueAt(idx);
    });
    row.querySelector('.add-it').addEventListener('click', ()=> promptAddToPlaylist(item));
    row.querySelector('.dl-it').addEventListener('click', ()=> cacheVideo(item.videoId, { title: item.title, author:item.author, thumb:item.thumbnail }));
    resultsEl.appendChild(row);
  });
}

// prompt add to playlist
async function promptAddToPlaylist(item) {
  const options = playlists.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  const { value } = await Swal.fire({
    title: 'Playlist seç',
    html: `<select id="pl-select" class="swal2-select">${options}</select>`,
    preConfirm: () => document.getElementById('pl-select').value,
    showCancelButton: true
  });
  if (!value) return;
  const pl = playlists.find(p=>p.id === value);
  pl.items.push('yt:' + item.videoId);
  savePl();
  renderPlaylists();
  Swal.fire('Eklendi');
}

// cache video (download)
async function cacheVideo(videoId, meta = {}) {
  try {
    const cache = await caches.open('slp_streams_v1');
    const url = STREAM_PREFIX + videoId;
    const resp = await fetch(url, { headers: { 'Accept': 'audio/*' }});
    if (!resp.ok) throw new Error('download failed: ' + resp.status);
    await cache.put(url, resp.clone());
    cacheMeta[videoId] = { title: meta.title || cacheMeta[videoId]?.title || videoId, author: meta.author || cacheMeta[videoId]?.author || '', thumb: meta.thumb || cacheMeta[videoId]?.thumb || '/icons/icon-192.png' };
    saveCacheMeta();
    renderCachedList();
    Swal.fire('İndirildi (cache)');
  } catch (e) {
    console.error(e);
    Swal.fire('İndirme başarısız: ' + (e.message||''));
  }
}

// render cached list (offline panel)
async function renderCachedList() {
  cachedList.innerHTML = '';
  const c = await caches.open('slp_streams_v1');
  const keys = await c.keys();
  if (keys.length === 0) { cachedList.innerHTML = '<div class="text-sm text-gray-500">Önbellek boş</div>'; return; }
  for (const req of keys) {
    const vid = req.url.split('/').pop();
    const meta = cacheMeta[vid] || {};
    const div = document.createElement('div');
    div.className = 'flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10';
    div.innerHTML = `
      <div class="flex items-center gap-3 min-w-0">
        <img src="${meta.thumb || '/icons/icon-192.png'}" class="w-10 h-10 rounded object-cover"/>
        <div class="min-w-0">
          <div class="truncate font-medium">${meta.title || vid}</div>
          <div class="text-xs text-gray-500">${meta.author || ''}</div>
        </div>
      </div>
      <div class="flex gap-2">
        <button class="play-cache px-3 py-1 rounded-full bg-accent text-white" data-vid="${vid}">Çal</button>
        <button class="del-cache px-3 py-1 rounded-full bg-white/10" data-vid="${vid}">Sil</button>
      </div>
    `;
    div.querySelector('.play-cache').addEventListener('click', async ()=> {
      queue = [{ type:'yt', videoId: vid, title: meta.title, author:meta.author, thumb:meta.thumb }];
      startQueueAt(0);
    });
    div.querySelector('.del-cache').addEventListener('click', async ()=> {
      const ok = (await Swal.fire({ title:'Silinsin mi?', showCancelButton:true, confirmButtonText:'Sil'})).isConfirmed;
      if (!ok) return;
      const c = await caches.open('slp_streams_v1'); await c.delete(STREAM_PREFIX + vid); delete cacheMeta[vid]; saveCacheMeta(); renderCachedList();
    });
    cachedList.appendChild(div);
  }
}

// share song as hash
function shareSong(videoId) {
  const url = location.origin + location.pathname + '#song=' + encodeURIComponent(videoId);
  navigator.clipboard?.writeText(url).then(()=> Swal.fire('Link kopyalandı: ' + url));
}

// handle hash on load (#song=VIDEOID)
function processHash() {
  const h = location.hash;
  if (!h) return;
  const m = h.match(/#song=([^&]+)/);
  if (m) {
    const vid = decodeURIComponent(m[1]);
    playSingleVideo(vid);
  }
  // other cases (playlist import) can be added
}

// media session update
function updateMediaSession(){
  if (!('mediaSession' in navigator) || !queue[currentIndex]) return;
  const it = queue[currentIndex];
  navigator.mediaSession.metadata = new MediaMetadata({
    title: it.title || '',
    artist: it.author || '',
    artwork: [{ src: it.thumb || '/icons/icon-192.png', sizes:'512x512', type:'image/png'}]
  });
  navigator.mediaSession.setActionHandler('play', ()=> audio.play());
  navigator.mediaSession.setActionHandler('pause', ()=> audio.pause());
  navigator.mediaSession.setActionHandler('previoustrack', ()=> btnPrev.click());
  navigator.mediaSession.setActionHandler('nexttrack', ()=> btnNext.click());
  navigator.mediaSession.setActionHandler('seekbackward', ()=> audio.currentTime = Math.max(0, audio.currentTime - 10));
  navigator.mediaSession.setActionHandler('seekforward', ()=> audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10));
}

// initial render
renderPlaylists();
renderCachedList();
processHash();

// Show only cached when offline
window.addEventListener('load', () => {
  if (!navigator.onLine) {
    // hide search and results, show cached only
    document.getElementById('homeArea').innerHTML = '<div class="text-sm">Çevrim dışı: yalnızca indirilen müzikler gö
