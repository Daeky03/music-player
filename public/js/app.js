// public/js/app.js
// SLP — Yalnızca YouTube + Cache odaklı, EJS ID'lerine tam uyumlu, dark/light temaya duyarlı

(() => {
  'use strict';

  // ==== Sabitler & Depo Anahtarları ====
  const API_SEARCH = '/api/search';          // GET ?q=
  const STREAM = (vid) => `/stream/${vid}`;  // server tarafı Range destekli olmalı
  const CACHE_NAME = 'offline-audio-v1';     // mevcut sw.js ile uyumlu
  const LS_PLAYLISTS = 'mp_playlists_v3';    // senin önceki anahtarına sadık
  const OFFLINE_ONLY_SELECTOR = '#view-library'; // offline'da buraya sadece cache listesi basacağız

  // ==== Kısayol yardımcıları ====
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const safeJSON = (str, fb=null) => { try { return JSON.parse(str); } catch { return fb; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  const load = (k, fb) => safeJSON(localStorage.getItem(k), fb);
  const fmt = (t) => {
    if (!isFinite(t) || t < 0) t = 0;
    const m = Math.floor(t/60);
    const s = Math.floor(t%60).toString().padStart(2,'0');
    return `${m}:${s}`;
  };
  const debounce = (fn, ms=300) => { let to; return (...args)=>{ clearTimeout(to); to=setTimeout(()=>fn(...args), ms); }; };

  // ==== Global durum ====
  let playlists = load(LS_PLAYLISTS, null);
  if (!playlists) {
    // İlk girişte otomatik 1 playlist
    playlists = [{ id: 'pl1', name: 'Favoriler', cover: '/icons/icon-512.png', items: [] }]; // items: ['yt:VIDEOID', ...]
    save(LS_PLAYLISTS, playlists);
  }

  let queue = [];         // [{videoId,title,author,thumbnail}]
  let currentIndex = -1;
  let shuffle = false;
  let repeat = 'off';     // off|one|all
  let lastSearch = [];    // YouTube sonuçları

  // ==== DOM Referansları (EJS ile birebir) ====
  const audio           = $('#audioEl');

  // sol/üst alanlar
  const themeToggle     = $('#themeToggle');
  const themeLabel      = $('#themeLabel');
  const installBtn      = $('#installBtn');

  // sekmeler
  const viewLibrary     = $('#view-library');
  const viewPlaylists   = $('#view-playlists');
  const viewDownloaded  = $('#view-downloaded'); // tasarıma göre gizli kalabilir ama ID var
  const tracksEl        = $('#tracks');
  const playlistListEl  = $('#playlistList');
  const downloadListEl  = $('#downloadList');

  // arama
  const searchInput     = $('#search');

  // playlist butonları
  const newPlaylistBtn  = $('#newPlaylistBtn');
  const notifyPermBtn   = $('#notifyPermBtn');

  // mini oynatıcı
  const npArtMini       = $('#npArtMini');
  const npTitleMini     = $('#npTitleMini');
  const npArtistMini    = $('#npArtistMini');
  const btnMiniRew      = $('#btnMiniRew');
  const btnMiniPrev     = $('#btnMiniPrev');
  const btnMiniPlay     = $('#btnMiniPlay');
  const btnMiniNext     = $('#btnMiniNext');
  const btnMiniFf       = $('#btnMiniFf');
  const btnExpand       = $('#btnExpand');
  const miniPlayer      = $('#miniPlayer');

  // büyük oynatıcı
  const expandedPanel   = $('#expandedPlayer');
  const npArt           = $('#npArt');
  const npTitle         = $('#npTitle');
  const npArtist        = $('#npArtist');
  const npCur           = $('#npCur');
  const npDur           = $('#npDur');
  const seek            = $('#seek');
  const btnClose        = $('#btnClose');
  const btnPlay         = $('#btnPlay');
  const btnPrev         = $('#btnPrev');
  const btnNext         = $('#btnNext');
  const btnRew          = $('#btnRew');
  const btnFf           = $('#btnFf');
  const btnRepeat       = $('#btnRepeat');
  const btnShuffle      = $('#btnShuffle');

  // ==== PWA Kurulum & Tema ====
  let deferredPrompt = null;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn?.classList.remove('hidden');
  });
  installBtn?.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    deferredPrompt = null;
    installBtn.classList.add('hidden');
  });

  const setTheme = (mode) => {
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
      themeLabel && (themeLabel.textContent = 'Koyu');
    } else {
      document.documentElement.classList.remove('dark');
      themeLabel && (themeLabel.textContent = 'Açık');
    }
    localStorage.setItem('theme', mode);
  };
  setTheme(localStorage.getItem('theme') || 'dark');
  themeToggle?.addEventListener('click', () => {
    const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    setTheme(cur === 'dark' ? 'light' : 'dark');
  });

  // ==== Bildirim izin butonu ====
  notifyPermBtn?.addEventListener('click', async () => {
    try {
      const perm = await Notification.requestPermission();
      Swal.fire({ title: 'Bildirim izni', text: perm, icon: 'info', background:'#12121a', color:'#fff' });
    } catch {
      Swal.fire({ title:'Desteklenmiyor', icon:'error', background:'#12121a', color:'#fff' });
    }
  });

  // ==== Sekme gösterme (ID’ler sabit) ====
  function showView(v) {
    viewLibrary.classList.toggle('hidden', v !== 'lib');
    viewPlaylists.classList.toggle('hidden', v !== 'pl');
    viewDownloaded.classList.toggle('hidden', v !== 'dl');
  }
  $('#tab-library')?.addEventListener('click', ()=>showView('lib'));
  $('#tab-playlists')?.addEventListener('click', ()=>showView('pl'));
  $('#tab-downloaded')?.addEventListener('click', ()=>showView('dl'));

  // ==== Arama (Yalnızca YouTube) ====
  const doSearch = debounce(async (q) => {
    if (!tracksEl) return;
    if (!q || !q.trim()) { tracksEl.innerHTML = ''; return; }
    tracksEl.innerHTML = `<div class="text-sm opacity-70">Aranıyor…</div>`;
    try {
      const res = await fetch(`${API_SEARCH}?q=${encodeURIComponent(q)}`);
      if (!res.ok) throw new Error('Search failed');
      const data = await res.json();
      const list = (data.results || []).map(r => {
        let videoId = null;
        if (r.id) videoId = typeof r.id === 'string' ? r.id : (r.id.videoId || null);
        if (!videoId && r.url) {
          try { videoId = new URL(r.url).searchParams.get('v'); } catch {}
        }
        return {
          videoId,
          title: r.title || '—',
          author: r.author || r.channel || '',
          thumbnail: r.thumbnail || r.thumb || '/icons/icon-192.png'
        };
      }).filter(x => x.videoId);
      lastSearch = list;
      renderYouTubeResults(list);
    } catch (e) {
      console.error('search error', e);
      tracksEl.innerHTML = `<div class="text-sm text-red-500">Arama başarısız</div>`;
    }
  }, 350);

  searchInput?.addEventListener('input', () => doSearch(searchInput.value));
  searchInput?.addEventListener('keydown', (e)=>{ if(e.key==='Enter') doSearch(searchInput.value); });

  function renderYouTubeResults(list) {
    tracksEl.innerHTML = '';
    list.forEach(t => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10';
      row.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <img src="${t.thumbnail}" class="w-12 h-12 rounded-lg object-cover"/>
          <div class="min-w-0">
            <div class="font-medium truncate">${t.title}</div>
            <div class="text-xs opacity-70 truncate">${t.author}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button class="yt-play px-3 py-1.5 rounded-full bg-accent text-white" data-vid="${t.videoId}">Çal</button>
          <button class="yt-add  px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10" data-vid="${t.videoId}">Liste</button>
          <button class="yt-dl   px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10" data-vid="${t.videoId}">İndir</button>
        </div>
      `;
      tracksEl.appendChild(row);
    });
  }

  // YouTube sonuç butonları (event delegation)
  tracksEl?.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const vid = btn.dataset.vid;
    if (!vid) return;

    if (btn.classList.contains('yt-play')) {
      // Tüm arama sonucunu kuyruk yap, tıklananla başla
      queue = lastSearch.map(x => ({ videoId:x.videoId, title:x.title, author:x.author, thumbnail:x.thumbnail }));
      const idx = queue.findIndex(x => x.videoId === vid);
      startQueueAt(idx === -1 ? 0 : idx);
    }
    if (btn.classList.contains('yt-add')) {
      promptAddToPlaylist(vid);
    }
    if (btn.classList.contains('yt-dl')) {
      const meta = lastSearch.find(x=>x.videoId===vid) || {};
      await cacheVideo(vid, meta);
      // indirildi rozeti gerekiyorsa ileride burada güncelleyebilirsin
    }
  });

  // ==== Playlist Oluştur / Listele / Düzenle ====
  function renderPlaylists() {
    playlistListEl.innerHTML = '';
    playlists.forEach(pl => {
      const li = document.createElement('li');
      li.className = 'group relative rounded-xl overflow-hidden bg-black/5 dark:bg-white/10';
      li.innerHTML = `
        <div class="aspect-square w-full bg-black/10">
          <img src="${pl.cover||'/icons/icon-512.png'}" class="w-full h-full object-cover"/>
        </div>
        <div class="p-2 flex items-center justify-between">
          <div class="min-w-0">
            <div class="font-medium truncate">${pl.name}</div>
            <div class="text-xs opacity-70">${pl.items.length} parça</div>
          </div>
          <div class="flex gap-1">
            <button data-id="${pl.id}" class="open px-2 py-1 rounded-full bg-accent text-white text-xs">Çal</button>
            <button data-id="${pl.id}" class="share px-2 py-1 rounded-full bg-black/10 text-xs">Paylaş</button>
            <button data-id="${pl.id}" class="edit px-2 py-1 rounded-full bg-black/10 text-xs">Düzenle</button>
            <button data-id="${pl.id}" class="del  px-2 py-1 rounded-full bg-black/10 text-xs">Sil</button>
          </div>
        </div>`;
      playlistListEl.appendChild(li);
    });
  }

  newPlaylistBtn?.addEventListener('click', async () => {
    const { isConfirmed, value } = await Swal.fire({
      title: 'Yeni Playlist',
      html: `<input id="plName" class="swal2-input" placeholder="Ad">
             <input id="plCover" class="swal2-input" placeholder="Kapak URL (opsiyonel)">`,
      preConfirm: () => ({
        name: document.getElementById('plName').value.trim(),
        cover: document.getElementById('plCover').value.trim()
      }),
      showCancelButton: true,
      confirmButtonText: 'Oluştur',
      background:'#12121a', color:'#fff'
    });
    if (!isConfirmed) return;
    if (!value.name) { Swal.fire('Ad boş olamaz'); return; }
    const pl = { id: crypto.randomUUID(), name: value.name, cover: value.cover || '/icons/icon-512.png', items: [] };
    playlists.push(pl); save(LS_PLAYLISTS, playlists); renderPlaylists();
    Swal.fire('Playlist oluşturuldu');
  });

  playlistListEl?.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const id = b.dataset.id; const pl = playlists.find(x=>x.id===id); if(!pl) return;

    if (b.classList.contains('open')) {
      if (pl.items.length === 0) { Swal.fire('Boş playlist'); return; }
      // Kuyruğu pl.items -> yt:ID parse ederek kur
      queue = pl.items
        .map(code => (typeof code==='string' && code.startsWith('yt:')) ? code.slice(3) : null)
        .filter(Boolean)
        .map(vid => ({ videoId: vid, title: vid, author: '', thumbnail: '/icons/icon-192.png' }));
      startQueueAt(0);
    }

    if (b.classList.contains('edit')) {
      const { isConfirmed, value } = await Swal.fire({
        title:'Playlist Düzenle',
        html:`<input id="pln" class="swal2-input" value="${pl.name}" placeholder="Ad">
              <input id="plc" class="swal2-input" value="${pl.cover||''}" placeholder="Kapak URL">`,
        preConfirm: ()=>({ name: $('#pln').value.trim(), cover: $('#plc').value.trim() }),
        showCancelButton:true, confirmButtonText:'Kaydet',
        background:'#12121a', color:'#fff'
      });
      if (isConfirmed) {
        if (value.name) pl.name = value.name;
        if (value.cover) pl.cover = value.cover;
        save(LS_PLAYLISTS, playlists); renderPlaylists(); Swal.fire('Güncellendi');
      }
    }

    if (b.classList.contains('del')) {
      const ok = (await Swal.fire({title:'Silinsin mi?', showCancelButton:true, confirmButtonText:'Sil', background:'#12121a', color:'#fff'})).isConfirmed;
      if (!ok) return;
      playlists = playlists.filter(x=>x.id!==id); save(LS_PLAYLISTS, playlists); renderPlaylists();
    }

    if (b.classList.contains('share')) {
      // #song=VIDEOID yerine playlist paylaşımı (sıkıştırma)
      const payload = { name: pl.name, items: pl.items, cover: pl.cover||null };
      const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(payload));
      const url = `${location.origin}${location.pathname}#pl=${compressed}`;
      if (navigator.share) {
        try { await navigator.share({ title:'Playlist', text:pl.name, url }); } catch {}
      }
      await Swal.fire({ title:'Paylaşım linki', html:`<input class="swal2-input" value="${url}" readonly>`, background:'#12121a', color:'#fff' });
    }
  });

  async function promptAddToPlaylist(videoId) {
    if (playlists.length === 0) { Swal.fire('Önce playlist oluştur'); return; }
    const options = playlists.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
    const { isConfirmed, value:plId } = await Swal.fire({
      title:'Playlist seç',
      html:`<select id="pl-select" class="swal2-select">${options}</select>`,
      preConfirm: ()=> $('#pl-select').value,
      showCancelButton:true, confirmButtonText:'Ekle',
      background:'#12121a', color:'#fff'
    });
    if (!isConfirmed) return;
    const pl = playlists.find(p=>p.id===plId);
    if (!pl.items.includes('yt:'+videoId)) pl.items.push('yt:'+videoId);
    save(LS_PLAYLISTS, playlists); renderPlaylists(); Swal.fire('Eklendi');
  }

  // ==== Kuyruk & Çalma ====
  function startQueueAt(i) {
    currentIndex = Math.max(0, Math.min(i, queue.length-1));
    playCurrent();
    // mini bar görünür
    miniPlayer?.classList.remove('hidden');
  }

  async function playCurrent() {
    const cur = queue[currentIndex];
    if (!cur) return;

    // Cache varsa ordan çal, yoksa /stream
    const url = STREAM(cur.videoId);
    try {
      const c = await caches.open(CACHE_NAME);
      const hit = await c.match(url);
      if (hit) {
        const blob = await hit.blob();
        audio.src = URL.createObjectURL(blob);
      } else {
        audio.src = url;
      }
      await audio.play().catch(()=>{});
    } catch (e) {
      console.error('playCurrent', e);
      audio.src = url;
      audio.play().catch(()=>{});
    }

    // UI güncelle
    updateNowPlayingUI(cur);
    updateMediaSession(cur);
    showNowPlayingNotification(cur);
  }

  function updateNowPlayingUI(t) {
    npTitleMini && (npTitleMini.textContent = t.title || '—');
    npArtistMini && (npArtistMini.textContent = t.author || '');
    npArtMini   && (npArtMini.src = t.thumbnail || '/icons/icon-192.png');

    npTitle && (npTitle.textContent = t.title || '—');
    npArtist && (npArtist.innerHTML = (t.author||'—') + " <span class='text-accent'>• SLP Player</span>");
    npArt   && (npArt.src = t.thumbnail || '/icons/icon-512.png');
  }

  // next/prev/seek
  function idxNext() {
    if (shuffle) return Math.floor(Math.random()*queue.length);
    let i = currentIndex + 1;
    if (i >= queue.length) i = (repeat==='all') ? 0 : queue.length-1;
    return i;
  }
  function idxPrev() {
    if (shuffle) return Math.floor(Math.random()*queue.length);
    let i = currentIndex - 1;
    if (i < 0) i = (repeat==='all') ? queue.length-1 : 0;
    return i;
  }

  function playNext(){ currentIndex = idxNext(); playCurrent(); }
  function playPrev(){ if (audio.currentTime>3){ audio.currentTime=0; return; } currentIndex = idxPrev(); playCurrent(); }
  function seekBy(sec){ audio.currentTime = Math.max(0, Math.min((audio.duration||0), audio.currentTime + sec)); }

  // Mini & Büyük oynatıcı butonları
  btnMiniRew?.addEventListener('click', (e)=>{ e.stopPropagation(); seekBy(-10); });
  btnMiniPrev?.addEventListener('click', (e)=>{ e.stopPropagation(); playPrev(); });
  btnMiniPlay?.addEventListener('click', (e)=>{ e.stopPropagation(); audio.paused?audio.play():audio.pause(); });
  btnMiniNext?.addEventListener('click', (e)=>{ e.stopPropagation(); playNext(); });
  btnMiniFf?.addEventListener('click', (e)=>{ e.stopPropagation(); seekBy(10); });

  btnExpand?.addEventListener('click', (e)=>{ e.stopPropagation(); expandedPanel?.classList.remove('hidden'); });
  btnClose?.addEventListener('click', ()=> expandedPanel?.classList.add('hidden'));
  miniPlayer?.addEventListener('click', ()=> expandedPanel?.classList.remove('hidden'));

  btnPlay?.addEventListener('click', ()=> audio.paused?audio.play():audio.pause());
  btnPrev?.addEventListener('click', playPrev);
  btnNext?.addEventListener('click', playNext);
  btnRew ?.addEventListener('click', ()=>seekBy(-10));
  btnFf  ?.addEventListener('click', ()=>seekBy(10));

  btnRepeat?.addEventListener('click', ()=>{
    repeat = repeat==='off'?'all': repeat==='all'?'one':'off';
    btnRepeat.textContent = repeat==='one'?'⟲1': repeat==='all'?'⟲∞':'⟲';
  });
  btnShuffle?.addEventListener('click', ()=>{
    shuffle=!shuffle; btnShuffle.classList.toggle('ring-2', shuffle);
  });

  // Seek çubuğu (büyük oynatıcı)
  function syncSeek(){
    if (!isFinite(audio.duration)) return;
    const v = Math.floor(audio.currentTime);
    const d = Math.floor(audio.duration);
    if (seek) { seek.max = d; seek.value = v; }
    npCur && (npCur.textContent = fmt(v));
    npDur && (npDur.textContent = fmt(d));
  }
  audio.addEventListener('timeupdate', syncSeek);
  audio.addEventListener('loadedmetadata', syncSeek);
  seek?.addEventListener('input', ()=> audio.currentTime = +seek.value);

  audio.addEventListener('play', ()=>{ btnMiniPlay && (btnMiniPlay.textContent='⏸'); btnPlay && (btnPlay.textContent='⏸'); updateMediaSession(queue[currentIndex]); });
  audio.addEventListener('pause', ()=>{ btnMiniPlay && (btnMiniPlay.textContent='▶');  btnPlay && (btnPlay.textContent='▶');  updateMediaSession(queue[currentIndex]); });
  audio.addEventListener('ended', ()=>{ if(repeat==='one'){ audio.currentTime=0; audio.play(); } else playNext(); });

  // ==== İndirme / Cache (YouTube) ====
  async function cacheVideo(videoId, meta={}) {
    try{
      const url = STREAM(videoId);
      const resp = await fetch(url, { headers:{ 'Accept':'audio/*' } });
      if(!resp.ok) throw new Error('İndirme başarısız: '+resp.status);
      const c = await caches.open(CACHE_NAME);
      await c.put(url, resp.clone());
      Swal.fire({ title:'İndirildi', icon:'success', timer:1500, showConfirmButton:false, background:'#12121a', color:'#fff' });
      renderDownloads();
    }catch(e){
      console.error('cacheVideo', e);
      Swal.fire({ title:'İndirme hatası', text:e.message, icon:'error', background:'#12121a', color:'#fff' });
    }
  }

  async function renderDownloads(){
    if(!downloadListEl) return;
    downloadListEl.innerHTML='';
    const c = await caches.open(CACHE_NAME);
    const keys = await c.keys();
    if(keys.length===0){
      downloadListEl.innerHTML = `<li class="text-sm opacity-70">Önbellek boş</li>`;
      return;
    }
    for(const req of keys){
      const url = req.url.replace(location.origin,'');
      const vid = url.split('/').pop();
      const li = document.createElement('li');
      li.className='flex items-center justify-between p-2 rounded-lg bg-black/5 dark:bg-white/10';
      li.innerHTML = `
        <div class="truncate">YT: ${vid}</div>
        <div class="flex gap-2">
          <button data-vid="${vid}" class="play px-3 py-1.5 rounded-full bg-accent text-white">Çal</button>
          <button data-url="${url}" class="rm px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/10">Sil</button>
        </div>`;
      downloadListEl.appendChild(li);
    }
  }

  downloadListEl?.addEventListener('click', async (e)=>{
    const b = e.target.closest('button'); if(!b) return;
    if (b.classList.contains('play')) {
      const vid = b.dataset.vid;
      queue = [{ videoId: vid, title: `YT:${vid}`, author:'', thumbnail:'/icons/icon-192.png' }];
      startQueueAt(0);
    }
    if (b.classList.contains('rm')) {
      const url=b.dataset.url;
      const c=await caches.open(CACHE_NAME);
      await c.delete(url);
      renderDownloads();
    }
  });

  // ==== Paylaşım (tek şarkı) ====
  function shareSong(videoId){
    const url = `${location.origin}${location.pathname}#song=${encodeURIComponent(videoId)}`;
    if (navigator.share) navigator.share({ title:'Şarkı', url }).catch(()=>{});
    else { navigator.clipboard?.writeText(url); Swal.fire('Kopyalandı'); }
  }

  // Hash ile doğrudan şarkı oynat (#song=ID)
  function importFromHash(){
    // playlist import (#pl=...)
    const pm = location.hash.match(/#pl=([^&]+)/);
    if (pm) {
      try{
        const json = LZString.decompressFromEncodedURIComponent(pm[1]);
        const payload = JSON.parse(json);
        const newPl = {
          id: crypto.randomUUID(),
          name: payload.name || 'Paylaşılan',
          cover: payload.cover || null,
          items: Array.isArray(payload.items) ? payload.items : []
        };
        playlists.push(newPl); save(LS_PLAYLISTS, playlists); renderPlaylists();
        Swal.fire({ title:'Playlist içe aktarıldı', timer:1500, showConfirmButton:false, background:'#12121a', color:'#fff' });
        history.replaceState(null, '', location.pathname + location.search);
      }catch(e){ console.error(e); }
      return;
    }

    const m = location.hash.match(/#song=([^&]+)/);
    if(!m) return;
    const vid = decodeURIComponent(m[1]);
    queue = [{ videoId: vid, title:`YT:${vid}`, author:'', thumbnail:'/icons/icon-192.png' }];
    startQueueAt(0);
  }

  // ==== Media Session + Bildirim ====
  function updateMediaSession(t){
    if(!('mediaSession' in navigator) || !t) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title || '',
      artist: t.author || '',
      album: 'SLP Player',
      artwork: [{ src: t.thumbnail || '/icons/icon-512.png', sizes:'512x512', type:'image/png' }]
    });

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

  async function showNowPlayingNotification(t){
    try{
      if(!('serviceWorker' in navigator) || Notification.permission!=='granted') return;
      const reg = await navigator.serviceWorker.getRegistration(); if(!reg) return;
      await reg.showNotification('Çalınıyor: '+(t.title||''), {
        body: (t.author||'Bilinmiyor') + ' — SLP Player',
        icon: t.thumbnail || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: 'now-playing', renotify:true, requireInteraction:false,
        actions: [
          { action:'prev', title:'⏮' },
          { action:'rew', title:'-10s' },
          { action:'toggle', title: audio.paused?'▶':'⏸' },
          { action:'ff', title:'+10s' },
          { action:'next', title:'⏭' }
        ]
      });
    }catch{}
  }

  navigator.serviceWorker?.addEventListener('message', (e)=>{
    const { type } = e.data||{}; if(!type) return;
    if(type==='prev') playPrev();
    if(type==='rew') seekBy(-10);
    if(type==='ff') seekBy(10);
    if(type==='toggle'){ audio.paused?audio.play():audio.pause(); }
    if(type==='next') playNext();
  });

  // ==== Offline davranışı ====
  window.addEventListener('online',  ()=>{ /* istersen otomatik arama tetikle */ });
  window.addEventListener('offline', ()=>{ /* offline banner vs. */ });

  // İnternet yoksa sadece indirileni göster
  async function enforceOfflineModeIfNeeded(){
    if (navigator.onLine) return;
    showView('lib');
    // Library alanını cache listesi gibi kullan
    if (tracksEl) {
      tracksEl.innerHTML = `<div class="text-sm opacity-70 mb-2">Çevrimdışı: yalnızca indirilenler</div>`;
    }
    await renderDownloads();
  }

  // ==== Başlangıç ====
  (async function boot(){
    renderPlaylists();
    renderDownloads();
    importFromHash();
    await enforceOfflineModeIfNeeded();
  })();

})();
