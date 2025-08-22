if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});

// Örnek veriler (sen public/audio içine yerleştireceksin)
const SAMPLE_TRACKS = [
  { id: 's1', title: 'Sample One', artist: 'Artist A', url: '/audio/Arcane S2 - Ma Meilleure Ennemie (Turkish Cover by @Minachua & @batumation ).mp3', artwork: '/icons/icon-192.png' },
  { id: 's2', title: 'Sample Two', artist: 'Artist B', url: '/audio/sample2.mp3', artwork: '/icons/icon-192.png' },
  { id: 's3', title: 'Sample Three', artist: 'Artist C', url: '/audio/sample3.mp3', artwork: '/icons/icon-192.png' }
];

// Storage keys
const LS_TRACKS = 'mp_tracks_v1';
const LS_PLAYLISTS = 'mp_playlists_v1';

function load(key, fallback){ try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function save(key, val){ localStorage.setItem(key, JSON.stringify(val)); }

let tracks = load(LS_TRACKS, SAMPLE_TRACKS);
let playlists = load(LS_PLAYLISTS, [ { id:'pl1', name:'Favoriler', items: [tracks[0].id, tracks[1].id] } ]);

// DOM
const tracksEl = document.getElementById('tracks');
const playlistListEl = document.getElementById('playlistList');
const downloadListEl = document.getElementById('downloadList');
const searchInput = document.getElementById('search');

const viewLibrary = document.getElementById('view-library');
const viewPlaylists = document.getElementById('view-playlists');
const viewDownloaded = document.getElementById('view-downloaded');

document.getElementById('tab-library').addEventListener('click', ()=>{ showView('library'); });
document.getElementById('tab-playlists').addEventListener('click', ()=>{ showView('playlists'); });
document.getElementById('tab-downloaded').addEventListener('click', ()=>{ showView('downloaded'); });

document.getElementById('newPlaylistBtn').addEventListener('click', ()=>{ const name = prompt('Yeni playlist adı'); if(!name) return; const pl = { id: crypto.randomUUID(), name, items: [] }; playlists.push(pl); save(LS_PLAYLISTS, playlists); renderPlaylists(); });

function showView(v){ viewLibrary.classList.toggle('hidden', v!=='library'); viewPlaylists.classList.toggle('hidden', v!=='playlists'); viewDownloaded.classList.toggle('hidden', v!=='downloaded'); }

// Player controls
const audioEl = document.getElementById('audioEl');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const nowTitle = document.getElementById('nowTitle');
const nowArtist = document.getElementById('nowArtist');
const nowArt = document.getElementById('nowArt');
const seek = document.getElementById('seek');

let currentIndex = -1; // index in playQueue
let playQueue = []; // array of track ids
let repeatMode = 'off'; // off / one / all
let shuffle = false;

playBtn.addEventListener('click', ()=>{ if(audioEl.paused) audioEl.play(); else audioEl.pause(); });
prevBtn.addEventListener('click', ()=>{ playPrev(); });
nextBtn.addEventListener('click', ()=>{ playNext(); });

audioEl.addEventListener('play', ()=>{ playBtn.textContent = 'Pause'; });
audioEl.addEventListener('pause', ()=>{ playBtn.textContent = 'Play'; });

audioEl.addEventListener('timeupdate', ()=>{
  if(!audioEl.duration) return;
  seek.max = Math.floor(audioEl.duration);
  seek.value = Math.floor(audioEl.currentTime);
});
seek.addEventListener('input', ()=>{ audioEl.currentTime = seek.value; });

audioEl.addEventListener('ended', ()=>{ if(repeatMode==='one') audioEl.currentTime = 0, audioEl.play(); else playNext(); });

function playTrackById(id){ const t = tracks.find(x=>x.id===id); if(!t) return; // ensure in queue
  // set audio src — first attempt cache, else network
  caches.open('offline-audio-v1').then(cache=>cache.match(t.url)).then(hit=>{
    if(hit) return hit.blob().then(b=>URL.createObjectURL(b));
    return Promise.resolve(t.url);
  }).then(src=>{
    audioEl.src = src;
    audioEl.play();
    nowTitle.textContent = t.title; nowArtist.textContent = t.artist || ''; nowArt.src = t.artwork || '/icons/icon-192.png';
  }).catch(err=>{ console.error(err); audioEl.src = t.url; audioEl.play(); nowTitle.textContent = t.title; });
}

function setQueue(ids, startIndex=0){ playQueue = ids.slice(); currentIndex = startIndex; playTrackById(playQueue[currentIndex]); }
function playNext(){ if(shuffle){ currentIndex = Math.floor(Math.random()*playQueue.length); } else { currentIndex++; if(currentIndex>=playQueue.length){ if(repeatMode==='all') currentIndex=0; else { currentIndex = playQueue.length-1; return; } } } playTrackById(playQueue[currentIndex]); }
function playPrev(){ if(audioEl.currentTime>3){ audioEl.currentTime=0; return; } if(shuffle){ currentIndex = Math.floor(Math.random()*playQueue.length); } else { currentIndex--; if(currentIndex<0){ if(repeatMode==='all') currentIndex=playQueue.length-1; else { currentIndex=0; } } } playTrackById(playQueue[currentIndex]); }

// Rendering
function renderLibrary(filter=''){
  tracksEl.innerHTML = '';
  const list = tracks.filter(t=> (t.title+ ' ' + (t.artist||'')).toLowerCase().includes(filter.toLowerCase()));
  list.forEach(t=>{
    const div = document.createElement('div'); div.className='flex items-center justify-between p-2 rounded-lg bg-black/30';
    div.innerHTML = `<div class="flex items-center gap-3"><img src="${t.artwork||'/icons/icon-192.png'}" class="w-12 h-12 rounded-md"/><div><div class="font-medium">${t.title}</div><div class="text-xs text-white/60">${t.artist||''}</div></div></div><div class="flex gap-2"><button data-id="${t.id}" class="playBtn px-3 py-1.5 rounded-full bg-white/10">Çal</button><button data-id="${t.id}" class="addPlBtn px-3 py-1.5 rounded-full bg-brand text-black">Playlist'e Ekle</button><button data-id="${t.id}" class="dlBtn px-3 py-1.5 rounded-full bg-red-600/80">Sil</button></div>`;
    tracksEl.appendChild(div);
  });
}

tracksEl.addEventListener('click',(e)=>{
  const play = e.target.closest('.playBtn');
  const addpl = e.target.closest('.addPlBtn');
  const dl = e.target.closest('.dlBtn');
  if(play){ const id=play.dataset.id; setQueue([id],0); }
  if(addpl){ const id=addpl.dataset.id; const plId = prompt('Hangi playlist id (liste görmek için Playlists sekmesine bak)'); if(!plId) return; const pl = playlists.find(x=>x.id===plId); if(!pl) return alert('Playlist bulunamadı'); if(!pl.items.includes(id)){ pl.items.push(id); save(LS_PLAYLISTS, playlists); renderPlaylists(); alert('Eklendi'); } }
  if(dl){ const id=dl.dataset.id; if(!confirm('Bu parçayı kütüphaneden sil?')) return; tracks = tracks.filter(x=>x.id!==id); // remove from playlists
    playlists.forEach(p=>{ p.items = p.items.filter(i=>i!==id); }); save(LS_TRACKS, tracks); save(LS_PLAYLISTS, playlists); renderLibrary(); renderPlaylists(); }
});

function renderPlaylists(){ playlistListEl.innerHTML=''; playlists.forEach(pl=>{
  const li = document.createElement('li'); li.className='flex items-center justify-between p-2 rounded-lg bg-black/30';
  li.innerHTML = `<div><div class="font-medium">${pl.name}</div><div class="text-xs text-white/60">${pl.items.length} şarkı</div></div><div class="flex gap-2"><button data-id="${pl.id}" class="openPl px-3 py-1.5 rounded-full bg-white/10">Aç</button><button data-id="${pl.id}" class="editPl px-3 py-1.5 rounded-full bg-brand text-black">Adı Değiştir</button><button data-id="${pl.id}" class="delPl px-3 py-1.5 rounded-full bg-red-600/80">Sil</button></div>`;
  playlistListEl.appendChild(li);
}); }

playlistListEl.addEventListener('click',(e)=>{
  const open = e.target.closest('.openPl');
  const edit = e.target.closest('.editPl');
  const del = e.target.closest('.delPl');
  if(open){ const id=open.dataset.id; const pl = playlists.find(x=>x.id===id); if(!pl) return; // build queue from ids present
    const ids = pl.items.filter(i=>tracks.some(t=>t.id===i)); if(ids.length===0) return alert('Boş playlist'); setQueue(ids,0); }
  if(edit){ const id=edit.dataset.id; const name = prompt('Yeni ad'); if(!name) return; const pl = playlists.find(x=>x.id===id); pl.name = name; save(LS_PLAYLISTS, playlists); renderPlaylists(); }
  if(del){ const id=del.dataset.id; if(!confirm('Bu playlisti sil?')) return; playlists = playlists.filter(p=>p.id!==id); save(LS_PLAYLISTS, playlists); renderPlaylists(); }
});

function renderDownloads(){ downloadListEl.innerHTML=''; caches.open('offline-audio-v1').then(cache=> cache.keys().then(keys=>{
  keys.forEach(req=>{
    const url = req.url.replace(location.origin,'');
    const t = tracks.find(x=>x.url===url);
    const name = t? t.title : url;
    const li = document.createElement('li'); li.className='flex items-center justify-between p-2 rounded-lg bg-black/30';
    li.innerHTML = `<div class="font-medium">${name}</div><div><button data-url="${url}" class="playCached px-3 py-1.5 rounded-full bg-white/10">Çal</button><button data-url="${url}" class="rmCache px-3 py-1.5 rounded-full bg-red-600/80">Sil</button></div>`;
    downloadListEl.appendChild(li);
  });
})); }

downloadListEl.addEventListener('click',(e)=>{
  const play = e.target.closest('.playCached');
  const rm = e.target.closest('.rmCache');
  if(play){ const url=play.dataset.url; caches.open('offline-audio-v1').then(c=>c.match(url).then(hit=>hit.blob().then(b=>{ audioEl.src = URL.createObjectURL(b); audioEl.play(); }))); }
  if(rm){ const url=rm.dataset.url; caches.open('offline-audio-v1').then(c=>c.delete(url).then(()=>{ renderDownloads(); alert('Silindi'); })); }
});

// Search
searchInput.addEventListener('input',(e)=>{ renderLibrary(e.target.value); });

// initial render
renderLibrary(); renderPlaylists(); renderDownloads();

// Helper: add sample track upload (kütüphaneye ekleme)
// Kullanıcı için açıklama: public/audio içine mp3 koy, sonra bu fonksiyonu çağırarak kütüphaneye ekle
window.addSampleTrack = (fileName, title=null, artist=null, artwork=null)=>{
  const id = crypto.randomUUID();
  const t = { id, title: title||fileName, artist: artist||'', url: '/audio/'+fileName, artwork: artwork||'/icons/icon-192.png' };
  tracks.push(t); save(LS_TRACKS, tracks); renderLibrary();
};

// Kullanım örneği (tarayıcı konsolundan):
// addSampleTrack('sample1.mp3','My Track','Me')
      
