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
const LS_TRACKS='mp_tracks_v3'; const LS_PLAYLISTS='mp_playlists_v3';
function load(k,f){ try{ return JSON.parse(localStorage.getItem(k))||f; }catch{ return f; } }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
let tracks = load(LS_TRACKS, SAMPLE_TRACKS);
let playlists = load(LS_PLAYLISTS, [{ id:'pl1', name:'Favoriler', cover:null, items:[tracks[0]?.id, tracks[1]?.id].filter(Boolean) }]);

// Tabs & Views
const viewLibrary=document.getElementById('view-library');
const viewPlaylists=document.getElementById('view-playlists');
const viewDownloaded=document.getElementById('view-downloaded');
const tracksEl=document.getElementById('tracks');
const playlistListEl=document.getElementById('playlistList');
const downloadListEl=document.getElementById('downloadList');

function showView(v){ viewLibrary.classList.toggle('hidden', v!=='lib'); viewPlaylists.classList.toggle('hidden', v!=='pl'); viewDownloaded.classList.toggle('hidden', v!=='dl'); }

document.getElementById('tab-library')?.addEventListener('click',()=>showView('lib'));
document.getElementById('tab-playlists')?.addEventListener('click',()=>showView('pl'));
document.getElementById('tab-downloaded')?.addEventListener('click',()=>showView('dl'));
// mobile tablar
const search_m=document.getElementById('search_m');
document.getElementById('m-tab-library')?.addEventListener('click',()=>showView('lib'));
document.getElementById('m-tab-playlists')?.addEventListener('click',()=>showView('pl'));
document.getElementById('m-tab-downloaded')?.addEventListener('click',()=>showView('dl'));

// Search (desktop + mobile)
const searchInput=document.getElementById('search');
function getSearchText(){ return (search_m?.value||'') || (searchInput?.value||''); }
searchInput?.addEventListener('input', ()=>renderLibrary(getSearchText()));
search_m?.addEventListener('input', ()=>renderLibrary(getSearchText()));

// SweetAlert2 yardımcıları
async function swalPrompt(html, confirmText='Kaydet'){
  const { value } = await Swal.fire({ title:'', html, focusConfirm:false, showCancelButton:true, confirmButtonText:confirmText, background:'#12121a', color:'#fff' });
  return value;
}
function swalToast(title, timer=2000){ Swal.fire({ title, toast:true, position:'top', showConfirmButton:false, timer, background:'#12121a', color:'#fff' }); }

// Playlist oluştur (SweetAlert2 + kapak)
document.getElementById('newPlaylistBtn')?.addEventListener('click', async()=>{
 
  Swal.fire({
    title: "Yeni Playlist",
    html: `
      <input id="plName" class="swal2-input" placeholder="Playlist adı">
      <input id="plCover" type="file" accept="image/*" class="swal2-file">
    `,
    showCancelButton: true,
    confirmButtonText: "Oluştur",
    background: "#12121a",
    color: "#fff",
    preConfirm: () => {
      const name = document.getElementById("plName").value.trim();
      const file = document.getElementById("plCover").files[0];

      if (!name) {
        Swal.showValidationMessage("Playlist adı boş olamaz!");
        return false;
      }

      // ✅ Eğer resim yüklenmişse base64 dönüştür
      return new Promise((resolve) => {
        if (file) {
          const reader = new FileReader();
          reader.onload = () => resolve({ name, cover: reader.result });
          reader.readAsDataURL(file);
        } else {
          resolve({ name, cover: null });
        }
      });
    }
  }).then((res) => {
    if (res.isConfirmed) {
      const newPl = {
        id: crypto.randomUUID(),
        name: res.value.name,
        cover: res.value.cover,  // ✅ artık base64 olarak kaydediliyor
        items: []
      };

      playlists.push(newPl);
      save(LS_PLAYLISTS, playlists);
      renderPlaylists();

      Swal.fire({
        title: "Playlist oluşturuldu!",
        html: `
          <strong>${newPl.name}</strong> başarıyla eklendi.<br>
          ${newPl.cover ? `<img src="${newPl.cover}" alt="Kapak" style="max-width:100px;margin-top:10px;">` : ""}
        `,
        icon: "success",
        background: "#12121a",
        color: "#fff"
      });
    }
  });
 
  
});

// Bildirim izni (SweetAlert2)
const notifyPermBtn=document.getElementById('notifyPermBtn');
notifyPermBtn?.addEventListener('click', async()=>{
  try{
    const perm = await Notification.requestPermission();
    Swal.fire({ title: 'Bildirim izni', text: perm, icon: perm==='granted'?'success':'info', background:'#12121a', color:'#fff' });
  }catch(e){ Swal.fire({ title:'Bildirim desteklenmiyor', icon:'error', background:'#12121a', color:'#fff' }); }
});

// Player state
const audio=document.getElementById('audioEl');
let queue=[]; let currentIndex=-1; let repeat='off'; let shuffle=false; // repeat: off|one|all

// Mini & Expanded player refs
const mini={ art:$('#npArtMini'), title:$('#npTitleMini'), artist:$('#npArtistMini'), btnPlay:$('#btnMiniPlay'), btnPrev:$('#btnMiniPrev'), btnNext:$('#btnMiniNext'), btnRew:$('#btnMiniRew'), btnFf:$('#btnMiniFf') };
const xp={ art:$('#npArt'), title:$('#npTitle'), artist:$('#npArtist'), cur:$('#npCur'), dur:$('#npDur'), seek:$('#seek'), btnClose:$('#btnClose'), btnPlay:$('#btnPlay'), btnPrev:$('#btnPrev'), btnNext:$('#btnNext'), btnRew:$('#btnRew'), btnFf:$('#btnFf'), btnRepeat:$('#btnRepeat'), btnShuffle:$('#btnShuffle') };
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
    xp.title.textContent=t.title; xp.artist.innerHTML=(t.artist||'—')+" <span class='text-accent'>• SLP Player</span>"; xp.art.src=t.artwork||'/icons/icon-512.png';
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

// Progress (sadece büyükte)
function syncSeek(){ if(!isFinite(audio.duration)) return; const v=Math.floor(audio.currentTime); const d=Math.floor(audio.duration); xp.seek.max=d; xp.seek.value=v; xp.cur.textContent=fmt(v); xp.dur.textContent=fmt(d); }
audio.addEventListener('timeupdate', syncSeek);
audio.addEventListener('loadedmetadata', syncSeek);
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

// Playlist'e ekleme (SweetAlert2 ile doğrudan seçim)
async function addToPlaylistDialog(trackId){
  if(playlists.length===0){ swalToast('Önce playlist oluştur'); return; }
  const options = playlists.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
  const { isConfirmed, value:plId } = await Swal.fire({
    title:'Playlist seç',
    html:`<select id="pl-select" class="swal2-select">${options}</select>`,
    preConfirm: ()=> document.getElementById('pl-select').value,
    showCancelButton:true, confirmButtonText:'Ekle', background:'#12121a', color:'#fff'
  });
  if(!isConfirmed) return;
  const pl = playlists.find(p=>p.id===plId); if(!pl) return;
  if(!pl.items.includes(trackId)) pl.items.push(trackId);
  save(LS_PLAYLISTS, playlists); renderPlaylists(); swalToast('Eklendi');
}

tracksEl.addEventListener('click', async(e)=>{
  const btn=e.target.closest('button'); if(!btn) return; const id=btn.dataset.id; const t=tracks.find(x=>x.id===id); if(!t) return;
  if(btn.classList.contains('play')){ setQueue([id],0); }
  if(btn.classList.contains('addpl')){ addToPlaylistDialog(id); }
  if(btn.classList.contains('cache')){ try{ const res=await fetch(t.url); if(!res.ok) throw new Error(); const clone=res.clone(); const c=await caches.open('offline-audio-v1'); await c.put(t.url, clone); swalToast('Cache tamam'); renderDownloads(); }catch{ swalToast('İndirme hatası'); } }
});

function renderPlaylists(){ playlistListEl.innerHTML=''; playlists.forEach(pl=>{
  const li=document.createElement('li'); li.className='group relative rounded-xl overflow-hidden bg-black/5 dark:bg-white/10';
  li.innerHTML=`
    <div class="aspect-square w-full bg-black/10">
      <img src="${pl.cover||'/icons/icon-512.png'}" class="w-full h-full object-cover"/>
    </div>
    <div class="p-2 flex items-center justify-between">
      <div class="min-w-0">
        <div class="font-medium truncate">${pl.name}</div>
        <div class="text-xs text-gray-500">${pl.items.length} parça</div>
      </div>
      <div class="flex gap-1">
        <button data-id="${pl.id}" class="open px-2 py-1 rounded-full bg-accent text-white text-xs">Çal</button>
        <button data-id="${pl.id}" class="share px-2 py-1 rounded-full bg-black/10 text-xs">Paylaş</button>
        <button data-id="${pl.id}" class="edit px-2 py-1 rounded-full bg-black/10 text-xs">Düzenle</button>
        <button data-id="${pl.id}" class="del px-2 py-1 rounded-full bg-black/10 text-xs">Sil</button>
      </div>
    </div>`;
  playlistListEl.appendChild(li);
}); }

playlistListEl.addEventListener('click',async(e)=>{
  const b=e.target.closest('button'); if(!b) return; const id=b.dataset.id; const pl=playlists.find(x=>x.id===id); if(!pl) return;
  if(b.classList.contains('open')){ const ids=pl.items.filter(i=>tracks.some(t=>t.id===i)); if(ids.length===0) { swalToast('Boş playlist'); return; } setQueue(ids,0); }
  if(b.classList.contains('edit')){
    const { isConfirmed, value:vals } = await Swal.fire({
      title:'Playlist Düzenle',
      html:`<input id="pln" class="swal2-input" value="${pl.name}" placeholder="Ad">
            <input id="plc" type="file" accept="image/*" class="swal2-input">`,
      preConfirm: ()=>({ name:document.getElementById('pln').value.trim(), file:document.getElementById('plc').files[0]||null }),
      showCancelButton:true, confirmButtonText:'Kaydet', background:'#12121a', color:'#fff'
    });
    if(isConfirmed){ if(vals.name) pl.name=vals.name; if(vals.file) pl.cover=URL.createObjectURL(vals.file); save(LS_PLAYLISTS, playlists); renderPlaylists(); swalToast('Güncellendi'); }
  }
  if(b.classList.contains('del')){ const ok = (await Swal.fire({title:'Silinsin mi?', showCancelButton:true, confirmButtonText:'Sil', background:'#12121a', color:'#fff'})).isConfirmed; if(!ok) return; playlists=playlists.filter(x=>x.id!==id); save(LS_PLAYLISTS, playlists); renderPlaylists(); }
  if(b.classList.contains('share')){ sharePlaylist(pl); }
});

// Paylaşım: veritabanı yok -> URL fragmente base64 JSON
// Paylaşım: veritabanı yok -> URL fragmente base64 JSON
function sharePlaylist(pl){
  const payload = { name: pl.name, items: pl.items };
  // JSON'u LZ-String ile sıkıştır
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
  const url = `${location.origin}${location.pathname}#pl=${compressed}`;
  
  if(navigator.share){
    navigator.share({ title:'Playlist', text:pl.name, url }).catch(()=>{});
  }

  Swal.fire({
    title:'Paylaşım linki',
    html:`<input class="swal2-input" value="${url}" readonly>`,
    background:'#12121a', color:'#fff'
  });
}


// Link ile içe aktarma
// Link ile içe aktarma (SweetAlert ile bildirim)
(function importFromHash(){
  const m = location.hash.match(/#pl=([^&]+)/);
  if(!m) return;
  try{
    const json = LZString.decompressFromEncodedURIComponent(m[1]);
    if(!json) throw new Error('Bozuk veri');
    const payload = JSON.parse(json);
    const newPl = {
      id: crypto.randomUUID(),
      name: payload.name || 'Paylaşılan',
      cover: null,
      items: Array.isArray(payload.items) ? payload.items : []
    };
    playlists.push(newPl);
    save(LS_PLAYLISTS, playlists);
    renderPlaylists();
    swalToast('Playlist içe aktarıldı');
    // URL’den hash temizle
    history.replaceState(null, '', location.pathname + location.search);
  }catch(e){
    console.error(e);
    swalToast('Playlist yüklenemedi');
  }
})();



async function renderDownloads(){ downloadListEl.innerHTML=''; const c=await caches.open('offline-audio-v1'); const keys=await c.keys(); for(const req of keys){ const url=req.url.replace(location.origin,''); const t=tracks.find(x=>x.url===url); const name=t? `${t.title}`:'Bilinmeyen Şarkı'; const li=document.createElement('li'); li.className='flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10'; li.innerHTML=`<div class="truncate">${name}</div><div class="flex gap-2"><button data-url="${url}" class="play px-3 py-1.5 rounded-full bg-accent text-white">Çal</button><button data-url="${url}" class="rm px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10">Sil</button></div>`; downloadListEl.appendChild(li); } }

downloadListEl.addEventListener('click',async(e)=>{ const b=e.target.closest('button'); if(!b) return; const url=b.dataset.url; const c=await caches.open('offline-audio-v1'); if(b.classList.contains('play')){ const hit=await c.match(url); if(hit){ const blob=await hit.blob(); audio.src=URL.createObjectURL(blob); audio.play(); } } if(b.classList.contains('rm')){ await c.delete(url); renderDownloads(); }});

// Media Session API — bildirim/OS kontrol butonları
function updateMediaSession(t){ if(!('mediaSession' in navigator)) return; navigator.mediaSession.metadata=new MediaMetadata({ title:t.title, artist:t.artist||'', album:'SLP Player', artwork:[{src:t.artwork||'/icons/icon-512.png', sizes:'512x512', type:'image/png'}] });
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

// Bildirim + aksiyonlar (SW üzerinden) — sanatçı altında app adı
async function showNowPlayingNotification(t){ try{
  if(!('serviceWorker' in navigator) || Notification.permission!=='granted') return;
  const reg = await navigator.serviceWorker.getRegistration(); if(!reg) return;
  await reg.showNotification('Çalınıyor: '+t.title, {
    body: (t.artist||'Bilinmiyor') + ' — SLP Player',
    icon: t.artwork||'/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: 'now-playing',
    renotify: true,
    requireInteraction: false,
    actions: [
      { action:'prev', title:'⏮' },
      { action:'rew', title:'-10s' },
      { action:'toggle', title: audio.paused?'▶':'⏸' },
      { action:'ff', title:'+10s' },
      { action:'next', title:'⏭' }
    ]
  });
 }catch(e){ /* sessiz geç */ }
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

// Dışa açık yardımcı (kendi mp3 eklemek için)
window.addSampleTrack=(fileName, title='', artist='', artwork='/icons/icon-512.png')=>{ const t={ id:crypto.randomUUID(), title: title||fileName, artist, url:'/audio/'+fileName, artwork }; tracks.push(t); save(LS_TRACKS, tracks); renderLibrary(getSearchText()); };

