// public/js/app.js
// Robust, working frontend for SLP (fixes for previous broken app.js)
// Assumes existence of:
//  - /api/search?q=...  -> returns JSON { results: [ { title, author, thumbnail, url, id? } ] }
//  - /stream/:videoId   -> audio stream (server should support Range requests for seeking)
// Uses: SweetAlert2 (Swal) and LZString (optional)

(function () {
  'use strict';

  // Config
  const API_SEARCH = '/api/search';
  const STREAM_PREFIX = '/stream/'; // final stream URL: /stream/:videoId
  const LS_PL = 'slp_playlists_v1';
  const LS_CACHE_META = 'slp_cache_meta_v1';

  // Utility helpers
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  const exists = el => !!el;
  const formatTime = (t) => {
    if (!isFinite(t) || t <= 0) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // DOM ready
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    try {
      // Elements (try several IDs to be robust)
      const audio = $('#audioEl') || document.createElement('audio');
      const mainSearch = $('#mainSearch') || $('#search') || $('#search_m');
      const searchBtn = $('#searchBtn') || null;
      const playlistsGrid = $('#playlistsGrid') || $('#playlists') || null;
      const resultsEl = $('#results') || $('#tracks') || null;
      const cachedList = $('#cachedList') || $('#downloadList') || null;

      const miniPlayer = $('#miniPlayer');
      const miniArt = $('#miniArt') || $('#npArtMini');
      const miniTitle = $('#miniTitle') || $('#npTitleMini');
      const miniArtist = $('#miniArtist') || $('#npArtistMini');
      const miniPlay = $('#miniPlay') || $('#btnMiniPlay');
      const miniAdd = $('#miniAdd') || null;

      const bigPlayer = $('#bigPlayer') || $('#expandedPlayer');
      const bigArt = $('#bigArt') || $('#npArt');
      const bigTitle = $('#bigTitle') || $('#npTitle');
      const bigArtist = $('#bigArtist') || $('#npArtist');
      const btnPlay = $('#btnPlay') || $('#btnMiniPlay');
      const btnPrev = $('#btnPrev') || $('#btnMiniPrev');
      const btnNext = $('#btnNext') || $('#btnMiniNext');
      const btnShuffle = $('#btnShuffle') || $('#btnShuffle');
      const btnLoop = $('#btnLoop') || $('#btnRepeat');
      const btnDownload = $('#btnDownload') || null;
      const btnAddToPl = $('#btnAddToPl') || null;
      const btnShare = $('#btnShare') || null;
      const btnClose = $('#btnClose') || null;

      const progressTrack = document.querySelector('.progress-track') || $('#seek') || null;
      const progressFill = $('#progressFill') || null;
      const curTimeEl = $('#curTime') || $('#npCur') || null;
      const durTimeEl = $('#durTime') || $('#npDur') || null;

      // Playlist detail elements (if present)
      const playlistDetail = $('#playlistDetail');
      const detailCover = $('#detailCover');
      const detailName = $('#detailName');
      const detailCount = $('#detailCount');
      const detailTracks = $('#detailTracks');

      // left panel buttons
      const createPlBtn = $('#createPlBtn') || $('#newPlaylistBtn');
      const installBtn = $('#installBtn');
      const themeToggle = $('#themeToggle');
      const themeLabel = $('#themeLabel');

      // state
      let playlists = load(LS_PL, null);
      let cacheMeta = load(LS_CACHE_META, {});
      if (!playlists) {
        playlists = [{ id: 'pl_liked', name: 'Liked (YouTube)', cover: '/icons/icon-512.png', items: [] }];
        save(LS_PL, playlists);
      }

      let queue = [];
      let currentIndex = -1;
      let shuffle = false;
      let loopMode = 'off';
      let lastSearch = [];

      // Helper: load/save
      function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }
      function load(key, fallback) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }

      function savePl() { save(LS_PL, playlists); }
      function saveCacheMeta() { save(LS_CACHE_META, cacheMeta); }

      // UI render: playlists
      function renderPlaylists() {
        if (!playlistsGrid) return;
        playlistsGrid.innerHTML = '';
        playlists.forEach(pl => {
          const div = document.createElement('div');
          div.className = 'pl-card flex items-center gap-3 p-3 rounded-lg mb-2';
          div.innerHTML = `
            <img src="${pl.cover||'/icons/icon-512.png'}" class="w-16 h-16 rounded-lg object-cover"/>
            <div class="flex-1 min-w-0">
              <div class="font-semibold truncate">${pl.name}</div>
              <div class="text-xs text-gray-500">${pl.items.length} parça</div>
            </div>
            <div class="flex flex-col gap-1">
              <button data-id="${pl.id}" class="open-pl text-xs px-2 py-1 rounded-full bg-accent text-white">Aç</button>
              <button data-id="${pl.id}" class="edit-pl text-xs px-2 py-1 rounded-full bg-white/10">Düzenle</button>
            </div>
          `;
          playlistsGrid.appendChild(div);
        });

        // wire open/edit buttons
        $$('.open-pl').forEach(b => b.addEventListener('click', e => openPlaylistDetail(e.currentTarget.dataset.id)));
        $$('.edit-pl').forEach(b => b.addEventListener('click', e => editPlaylist(e.currentTarget.dataset.id)));
      }

      // Playlist detail
      function openPlaylistDetail(plId) {
        const pl = playlists.find(x => x.id === plId);
        if (!pl || !playlistDetail) return;
        detailCover.src = pl.cover || '/icons/icon-512.png';
        detailName.textContent = pl.name;
        detailCount.textContent = `${pl.items.length} parça`;
        detailTracks.innerHTML = '';

        pl.items.forEach((it, idx) => {
          // support "yt:VIDEOID" stored items
          const videoId = (typeof it === 'string' && it.startsWith('yt:')) ? it.split(':')[1] : null;
          const meta = (videoId && cacheMeta[videoId]) ? cacheMeta[videoId] : {};
          const li = document.createElement('li');
          li.className = 'flex items-center justify-between p-2 rounded-lg mb-2';
          li.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
              <img src="${meta.thumb||'/icons/icon-192.png'}" class="w-12 h-12 rounded object-cover"/>
              <div class="min-w-0">
                <div class="truncate font-medium">${meta.title||videoId||'—'}</div>
                <div class="text-xs text-gray-500 truncate">${meta.author||''}</div>
              </div>
            </div>
            <div class="flex gap-2">
              <button class="play-song px-3 py-1 rounded-full bg-accent text-white" data-vid="${videoId}">Çal</button>
              <button class="more-song px-3 py-1 rounded-full bg-white/10" data-vid="${videoId}">⋯</button>
              <button class="del-song px-3 py-1 rounded-full bg-white/10" data-index="${idx}">Sil</button>
            </div>
          `;
          detailTracks.appendChild(li);
        });

        // wire actions
        $$('.play-song').forEach(b => b.addEventListener('click', e => playPlaylistAt(plId, Number(e.currentTarget.dataset.vid ? 0 : 0))));
        $$('.del-song').forEach(b => b.addEventListener('click', async (e) => {
          const idx = Number(e.currentTarget.dataset.index);
          const ok = await Swal.fire({ title: 'Silinsin mi?', showCancelButton: true, confirmButtonText: 'Sil' });
          if (ok.isConfirmed) {
            playlists = playlists.map(p => { if (p.id === plId) { p.items.splice(idx, 1); } return p; });
            savePl(); renderPlaylists(); openPlaylistDetail(plId);
          }
        }));
        $$('.more-song').forEach(b => b.addEventListener('click', e => songMoreMenu(e.currentTarget.dataset.vid)));

        // show/hide sections
        if ($('#homeArea')) $('#homeArea').classList.add('hidden');
        playlistDetail.classList.remove('hidden');
      }

      function editPlaylist(plId) {
        const pl = playlists.find(x => x.id === plId);
        if (!pl) return;
        Swal.fire({
          title: 'Playlist Düzenle',
          html: `<input id="plName" class="swal2-input" placeholder="Ad" value="${pl.name}"><input id="plCover" type="text" class="swal2-input" placeholder="Kapak URL (image)">`,
          preConfirm: () => ({ name: document.getElementById('plName').value.trim(), cover: document.getElementById('plCover').value.trim() })
        }).then(res => {
          if (res.isConfirmed) {
            pl.name = res.value.name || pl.name;
            if (res.value.cover) pl.cover = res.value.cover;
            savePl(); renderPlaylists();
            Swal.fire('Güncellendi');
          }
        });
      }

      function playPlaylistAt(plId, idx) {
        const pl = playlists.find(x => x.id === plId);
        if (!pl) return;
        const items = pl.items.map(it => {
          if (typeof it === 'string' && it.startsWith('yt:')) {
            const vid = it.split(':')[1];
            const m = cacheMeta[vid] || {};
            return { type: 'yt', videoId: vid, title: m.title || vid, author: m.author || '', thumb: m.thumb || '' };
          }
          return null;
        }).filter(Boolean);
        if (items.length === 0) { Swal.fire('Playlist boş'); return; }
        queue = items;
        currentIndex = Math.max(0, Math.min(idx, queue.length - 1));
        startQueueAt(currentIndex);
      }

      // song more menu (play, cache, share)
      function songMoreMenu(videoId) {
        if (!videoId) return;
        Swal.fire({
          title: 'Seçenekler',
          showCancelButton: true,
          html: `<div class="space-y-2"><button id="splay" class="swal2-confirm swal2-styled">Çal</button>
                 <button id="scache" class="swal2-confirm swal2-styled" style="background:#7c3aed">Önbelleğe al</button>
                 <button id="sshare" class="swal2-confirm swal2-styled" style="background:#444">Paylaş</button></div>`,
          showConfirmButton: false
        });
        setTimeout(() => {
          const sp = document.getElementById('splay'); if (sp) sp.addEventListener('click', () => { playSingleVideo(videoId); Swal.close(); });
          const sc = document.getElementById('scache'); if (sc) sc.addEventListener('click', () => { cacheVideo(videoId); Swal.close(); });
          const ss = document.getElementById('sshare'); if (ss) ss.addEventListener('click', () => { shareSong(videoId); Swal.close(); });
        }, 80);
      }

      // play single video (with lastSearch queue fallback)
      function playSingleVideo(videoId) {
        const idx = lastSearch.findIndex(x => x.videoId === videoId);
        if (idx !== -1) {
          queue = lastSearch.map(r => ({ type: 'yt', videoId: r.videoId, title: r.title, author: r.author, thumb: r.thumbnail }));
          startQueueAt(idx);
        } else {
          const meta = cacheMeta[videoId] || {};
          queue = [{ type: 'yt', videoId, title: meta.title || videoId, author: meta.author || '', thumb: meta.thumb || '' }];
          startQueueAt(0);
        }
      }

      // start queue
      function startQueueAt(i) {
        currentIndex = i;
        playCurrent();
        showMini();
      }

      // playCurrent chooses cached blob or /stream/:id
      async function playCurrent() {
        if (!queue[currentIndex]) return;
        const item = queue[currentIndex];
        updateMetaUI(item);
        // check cache
        try {
          const c = await caches.open('slp_streams_v1');
          const cachedUrl = STREAM_PREFIX + item.videoId;
          const hit = await c.match(cachedUrl);
          if (hit) {
            const blob = await hit.blob();
            audio.src = URL.createObjectURL(blob);
          } else {
            audio.src = STREAM_PREFIX + item.videoId;
          }
          audio.play().catch(e => console.warn('play() error', e));
          // save meta if available
          if (!cacheMeta[item.videoId]) cacheMeta[item.videoId] = { title: item.title, author: item.author, thumb: item.thumb };
          saveCacheMeta();
          renderCachedList(); // update badge etc
        } catch (e) {
          console.error('playCurrent error', e);
        }
      }

      function updateMetaUI(item) {
        if (bigTitle) bigTitle.textContent = item.title || '—';
        if (bigArtist) bigArtist.textContent = item.author || '—';
        if (bigArt) bigArt.src = item.thumb || '/icons/icon-512.png';
        if (miniArt) miniArt.src = item.thumb || '/icons/icon-192.png';
        if (miniTitle) miniTitle.textContent = item.title || '—';
        if (miniArtist) miniArtist.textContent = item.author || '—';
      }

      // show mini player
      function showMini() { if (miniPlayer) miniPlayer.classList.remove('hidden'); }
      function hideMini() { if (miniPlayer) miniPlayer.classList.add('hidden'); }

      // audio events -> UI progress
      audio.addEventListener('timeupdate', () => {
        if (!audio.duration || !progressFill || !curTimeEl || !durTimeEl) return;
        const d = audio.duration || 0;
        const cur = audio.currentTime || 0;
        const pct = d ? Math.max(0, Math.min(1, cur / d)) * 100 : 0;
        progressFill.style.width = pct + '%';
        curTimeEl.textContent = formatTime(cur);
        durTimeEl.textContent = formatTime(d);
      });

      // progress click (if progressTrack exists)
      if (progressTrack) {
        progressTrack.addEventListener('click', (e) => {
          const rect = progressTrack.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const pct = Math.max(0, Math.min(1, x / rect.width));
          if (audio.duration) audio.currentTime = pct * audio.duration;
        });
      }

      // play/pause buttons
      if (miniPlay) miniPlay.addEventListener('click', (e) => { e.stopPropagation(); togglePlay(); });
      if (btnPlay) btnPlay.addEventListener('click', togglePlay);
      function togglePlay() {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
      }
      audio.addEventListener('play', () => { if (miniPlay) miniPlay.innerHTML = '⏸'; if (btnPlay) btnPlay.innerHTML = '⏸'; updateMediaSession(); });
      audio.addEventListener('pause', () => { if (miniPlay) miniPlay.innerHTML = '▶'; if (btnPlay) btnPlay.innerHTML = '▶'; updateMediaSession(); });

      // mini click opens big player
      if (miniPlayer && bigPlayer) miniPlayer.addEventListener('click', () => bigPlayer.classList.toggle('hidden'));

      // prev/next
      if (btnPrev) btnPrev.addEventListener('click', () => {
        if (!audio) return;
        if (audio.currentTime > 3) { audio.currentTime = 0; return; }
        if (shuffle) { currentIndex = Math.floor(Math.random() * queue.length); } else { currentIndex = Math.max(0, currentIndex - 1); }
        playCurrent();
      });
      if (btnNext) btnNext.addEventListener('click', () => {
        if (!queue.length) return;
        if (shuffle) { currentIndex = Math.floor(Math.random() * queue.length); playCurrent(); return; }
        currentIndex++;
        if (currentIndex >= queue.length) {
          if (loopMode === 'all') currentIndex = 0;
          else { audio.pause(); return; }
        }
        playCurrent();
      });

      // shuffle/loop
      if (btnShuffle) btnShuffle.addEventListener('click', () => { shuffle = !shuffle; btnShuffle.classList.toggle('ring-2', shuffle); });
      if (btnLoop) btnLoop.addEventListener('click', () => { loopMode = loopMode === 'off' ? 'all' : loopMode === 'all' ? 'one' : 'off'; btnLoop.textContent = loopMode === 'one' ? '⟲1' : loopMode === 'all' ? '⟲∞' : '⟲'; });

      // ended
      audio.addEventListener('ended', () => {
        if (loopMode === 'one') { audio.currentTime = 0; audio.play(); return; }
        if (shuffle) currentIndex = Math.floor(Math.random() * queue.length);
        else currentIndex++;
        if (currentIndex >= queue.length) {
          if (loopMode === 'all') currentIndex = 0; else { audio.pause(); return; }
        }
        playCurrent();
      });

      // search wiring robustly
      if (searchBtn) searchBtn.addEventListener('click', () => performSearch((mainSearch && mainSearch.value) ? mainSearch.value : ''));
      if (mainSearch) mainSearch.addEventListener('keydown', (e) => { if (e.key === 'Enter') performSearch(mainSearch.value); });

      async function performSearch(q) {
        if (!q || !q.trim()) return;
        if (!resultsEl) return;
        resultsEl.innerHTML = `<div class="text-sm">Aranıyor…</div>`;
        try {
          const res = await fetch(API_SEARCH + '?q=' + encodeURIComponent(q));
          if (!res.ok) throw new Error('Search failed: ' + res.status);
          const json = await res.json();
          const arr = (json.results || []).map(r => {
            // best-effort normalize: get videoId
            let vid = null;
            if (r.id) vid = (typeof r.id === 'string') ? r.id : (r.id.videoId || null);
            try { if (!vid && r.url) vid = (new URL(r.url)).searchParams.get('v'); } catch {}
            return { title: r.title, author: r.author || r.channel || '', thumbnail: r.thumbnail || r.thumb || '', url: r.url || '', videoId: vid };
          }).filter(x => x.videoId);
          lastSearch = arr;
          renderSearchResults(arr);
        } catch (e) {
          console.error('performSearch error', e);
          if (resultsEl) resultsEl.innerHTML = `<div class="text-sm text-red-500">Arama başarısız.</div>`;
        }
      }

      function renderSearchResults(list) {
        if (!resultsEl) return;
        resultsEl.innerHTML = '';
        list.forEach(item => {
          const row = document.createElement('div');
          row.className = 'flex items-center justify-between p-2 rounded-lg mb-2';
          row.innerHTML = `
            <div class="flex items-center gap-3 min-w-0">
              <img src="${item.thumbnail||'/icons/icon-192.png'}" class="w-12 h-12 rounded object-cover"/>
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
          resultsEl.appendChild(row);
        });

        // wire result buttons
        $$('.play-it').forEach(b => b.addEventListener('click', (e) => {
          const vid = e.currentTarget.dataset.vid;
          // queue = lastSearch map
          queue = lastSearch.map(r => ({ type: 'yt', videoId: r.videoId, title: r.title, author: r.author, thumb: r.thumbnail }));
          const idx = queue.findIndex(q => q.videoId === vid);
          startQueueAt(idx >= 0 ? idx : 0);
        }));
        $$('.add-it').forEach(b => b.addEventListener('click', (e) => {
          const vid = e.currentTarget.dataset.vid;
          promptAddToPlaylist({ videoId: vid });
        }));
        $$('.dl-it').forEach(b => b.addEventListener('click', (e) => {
          const vid = e.currentTarget.dataset.vid;
          const meta = lastSearch.find(x => x.videoId === vid) || {};
          cacheVideo(vid, { title: meta.title, author: meta.author, thumb: meta.thumbnail });
        }));
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
        const pl = playlists.find(p => p.id === value);
        pl.items.push('yt:' + (item.videoId || item));
        savePl();
        renderPlaylists();
        Swal.fire('Eklendi');
      }

      // cache video (download)
      async function cacheVideo(videoId, meta = {}) {
        if (!videoId) { Swal.fire('videoId yok'); return; }
        try {
          const cache = await caches.open('slp_streams_v1');
          const url = STREAM_PREFIX + videoId;
          const resp = await fetch(url, { headers: { 'Accept': 'audio/*' } });
          if (!resp.ok) throw new Error('download failed: ' + resp.status);
          await cache.put(url, resp.clone());
          cacheMeta[videoId] = { title: meta.title || cacheMeta[videoId]?.title || videoId, author: meta.author || cacheMeta[videoId]?.author || '', thumb: meta.thumb || cacheMeta[videoId]?.thumb || '/icons/icon-192.png' };
          saveCacheMeta();
          renderCachedList();
          Swal.fire('İndirildi (cache)');
        } catch (e) {
          console.error('cacheVideo error', e);
          Swal.fire('İndirme başarısız: ' + (e.message || ''));
        }
      }

      // render cached list
      async function renderCachedList() {
        if (!cachedList) return;
        cachedList.innerHTML = '';
        try {
          const c = await caches.open('slp_streams_v1');
          const keys = await c.keys();
          if (keys.length === 0) { cachedList.innerHTML = '<div class="text-sm text-gray-500">Önbellek boş</div>'; return; }
          for (const req of keys) {
            const vid = req.url.split('/').pop();
            const meta = cacheMeta[vid] || {};
            const div = document.createElement('div');
            div.className = 'flex items-center justify-between p-2 rounded-lg mb-2';
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
            cachedList.appendChild(div);
          }
          $$('.play-cache').forEach(b => b.addEventListener('click', async (e) => {
            const vid = e.currentTarget.dataset.vid;
            queue = [{ type: 'yt', videoId: vid, title: cacheMeta[vid]?.title || vid, author: cacheMeta[vid]?.author || '', thumb: cacheMeta[vid]?.thumb || '' }];
            startQueueAt(0);
          }));
          $$('.del-cache').forEach(b => b.addEventListener('click', async (e) => {
            const vid = e.currentTarget.dataset.vid;
            const ok = (await Swal.fire({ title: 'Silinsin mi?', showCancelButton: true, confirmButtonText: 'Sil' })).isConfirmed;
            if (!ok) return;
            const c = await caches.open('slp_streams_v1'); await c.delete(STREAM_PREFIX + vid); delete cacheMeta[vid]; saveCacheMeta(); renderCachedList();
          }));
        } catch (e) {
          console.error('renderCachedList error', e);
        }
      }

      // share
      function shareSong(videoId) {
        const url = location.origin + location.pathname + '#song=' + encodeURIComponent(videoId);
        if (navigator.share) navigator.share({ title: 'Song', url }).catch(() => navigator.clipboard?.writeText(url));
        else navigator.clipboard?.writeText(url).then(()=> Swal.fire('Kopyalandı'));
      }

      function processHash() {
        const h = location.hash;
        if (!h) return;
        const m = h.match(/#song=([^&]+)/);
        if (m) playSingleVideo(decodeURIComponent(m[1]));
      }

      // Media Session
      function updateMediaSession() {
        if (!('mediaSession' in navigator) || !queue[currentIndex]) return;
        const it = queue[currentIndex];
        navigator.mediaSession.metadata = new MediaMetadata({
          title: it.title || '',
          artist: it.author || '',
          artwork: [{ src: it.thumb || '/icons/icon-192.png', sizes: '512x512', type: 'image/png' }]
        });
        navigator.mediaSession.setActionHandler('play', () => audio.play());
        navigator.mediaSession.setActionHandler('pause', () => audio.pause());
        navigator.mediaSession.setActionHandler('previoustrack', () => btnPrev && btnPrev.click());
        navigator.mediaSession.setActionHandler('nexttrack', () => btnNext && btnNext.click());
        navigator.mediaSession.setActionHandler('seekbackward', () => audio.currentTime = Math.max(0, audio.currentTime - 10));
        navigator.mediaSession.setActionHandler('seekforward', () => audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10));
      }

      // create playlist
      if (createPlBtn) createPlBtn.addEventListener('click', async () => {
        const { value } = await Swal.fire({
          title: 'Yeni Playlist',
          html: `<input id="pn" class="swal2-input" placeholder="Ad"> <input id="pc" class="swal2-input" placeholder="Kapak URL (isteğe bağlı)">`,
          preConfirm: () => ({ name: document.getElementById('pn')?.value.trim(), cover: document.getElementById('pc')?.value.trim() })
        });
        if (!value || !value.name) return;
        const newPl = { id: crypto.randomUUID(), name: value.name, cover: value.cover || '/icons/icon-512.png', items: [] };
        playlists.push(newPl); savePl(); renderPlaylists(); Swal.fire('Playlist oluşturuldu');
      });

      // install prompt (progressive web app)
      let deferredPrompt = null;
      window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; if (installBtn) installBtn.classList.remove('hidden'); });
      if (installBtn) installBtn.addEventListener('click', async () => {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt = null;
        installBtn.classList.add('hidden');
      });

      // theme toggle
      if (themeToggle) {
        themeToggle.addEventListener('click', () => {
          const cur = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
          setTheme(cur === 'dark' ? 'light' : 'dark');
        });
        function setTheme(mode) {
          if (mode === 'dark') { document.documentElement.classList.add('dark'); if (themeLabel) themeLabel.textContent = 'Koyu'; }
          else { document.documentElement.classList.remove('dark'); if (themeLabel) themeLabel.textContent = 'Açık'; }
          try { localStorage.setItem('theme', mode); } catch {}
        }
      }

      // service worker
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW register failed', e));
        navigator.serviceWorker.addEventListener('message', (e) => {
          const { type } = e.data || {};
          if (!type) return;
          if (type === 'prev') btnPrev && btnPrev.click();
          if (type === 'next') btnNext && btnNext.click();
          if (type === 'rew') audio.currentTime = Math.max(0, audio.currentTime - 10);
          if (type === 'ff') audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
          if (type === 'toggle') togglePlay();
        });
      }

      // initial renders
      renderPlaylists();
      renderCachedList();
      processHash();

      // expose some debug helpers
      window.SLP = {
        playlists, savePl, cacheMeta, renderPlaylists, renderCachedList
      };

      console.info('SLP frontend initialized');
    } catch (err) {
      console.error('init error', err);
    }
  } // end init
})(); 
