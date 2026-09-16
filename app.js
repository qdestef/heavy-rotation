(function () {
  'use strict';

  var isEditMode = (location.protocol === 'file:' ||
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1');

  var songs = [];
  var fileHandle = null;
  var pickedResult = null; // { title, artist, url, artUrl } from search, or manual
  var editingId = null;
  var searchDebounce = null;
  var searchSeq = 0;
  var activeResultIndex = -1;
  var lastResults = [];

  var els = {
    featureSlot: document.getElementById('feature-slot'),
    tracklist: document.getElementById('tracklist'),
    emptyState: document.getElementById('empty-state'),
    trackCount: document.getElementById('track-count'),
    updatedLabel: document.getElementById('updated-label'),
    addBtn: document.getElementById('add-btn'),
    connectBtn: document.getElementById('connect-btn'),
    connStatus: document.getElementById('conn-status'),
    connText: document.getElementById('conn-text'),
    ownerHint: document.getElementById('owner-hint'),
    banner: document.getElementById('sample-banner'),
    clearSamplesBtn: document.getElementById('clear-samples-btn'),
    dialog: document.getElementById('track-dialog'),
    dialogTitle: document.getElementById('dialog-title'),
    dialogSub: document.getElementById('dialog-sub'),
    form: document.getElementById('track-form'),
    searchStep: document.getElementById('search-step'),
    searchInput: document.getElementById('search-input'),
    searchStatus: document.getElementById('search-status'),
    searchResults: document.getElementById('search-results'),
    manualToggleOn: document.getElementById('manual-toggle-on'),
    pickedStep: document.getElementById('picked-step'),
    pickedArt: document.getElementById('picked-art'),
    pickedTitle: document.getElementById('picked-title'),
    pickedArtist: document.getElementById('picked-artist'),
    pickedChange: document.getElementById('picked-change'),
    fId: document.getElementById('f-id'),
    fUrl: document.getElementById('f-url'),
    fArtUrl: document.getElementById('f-art-url'),
    manualFields: document.getElementById('manual-fields'),
    fTitle: document.getElementById('f-title'),
    fArtist: document.getElementById('f-artist'),
    fManualUrl: document.getElementById('f-manual-url'),
    noteField: document.getElementById('note-field'),
    fNote: document.getElementById('f-note'),
    dialogActions: document.getElementById('dialog-actions'),
    dialogCancel: document.getElementById('dialog-cancel'),
    toast: document.getElementById('toast')
  };

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function hashHue(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) >>> 0; }
    return h % 360;
  }

  function labelStyle(song) {
    if (song.artUrl) {
      return "background-image:url('" + escapeHtml(song.artUrl) + "')";
    }
    var hue = hashHue(song.title + song.artist);
    return 'background-image:linear-gradient(135deg, hsl(' + hue + ',72%,58%), hsl(' + ((hue + 48) % 360) + ',68%,32%))';
  }

  function fmtDate(ts) {
    try { return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
    catch (e) { return ''; }
  }

  function sortedSongs() {
    return songs.slice().sort(function (a, b) { return b.addedAt - a.addedAt; });
  }

  function showToast(msg) {
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function () { els.toast.classList.remove('show'); }, 3200);
  }

  // ---------- icons ----------
  function listenIcon() {
    return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7"></path><path d="M8 7h9v9"></path></svg>';
  }
  function trashIcon() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"></path><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>';
  }
  function editIcon() {
    return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
  }

  // ---------- vinyl ----------
  function vinylMarkup(song, size) {
    var stageId = size === 'large' ? ' id="feature-vinyl"' : '';
    var stageClass = size === 'large' ? 'vinyl-stage' : 'vinyl-stage mini';
    var labelContent = (song.artUrl || size !== 'large') ? '' : '<span>' + escapeHtml(song.title) + '</span>';
    return (
      '<div class="' + stageClass + '"' + stageId + '>' +
      '<div class="vinyl-disc">' +
      '<div class="vinyl-label" style="' + labelStyle(song) + '">' + labelContent + '</div>' +
      '<div class="vinyl-spindle"></div>' +
      '</div>' +
      '</div>'
    );
  }

  var featureVinylCancel = null;

  function initFeatureVinyl(stage) {
    if (featureVinylCancel) { featureVinylCancel(); featureVinylCancel = null; }
    var disc = stage.querySelector('.vinyl-disc');
    if (!disc) return;
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ambient = reduceMotion ? 0 : 0.12;
    var spin = 0, tilt = 14, vel = ambient, dragging = false, lastX = 0, lastY = 0, raf = null, stopped = false;

    function apply() {
      disc.style.transform = 'rotateX(' + tilt.toFixed(2) + 'deg) rotateZ(' + spin.toFixed(2) + 'deg)';
    }
    function loop() {
      if (stopped) return;
      if (!dragging) {
        vel += (ambient - vel) * 0.06;
        spin += vel;
        tilt += (14 - tilt) * 0.16;
      }
      apply();
      raf = requestAnimationFrame(loop);
    }
    function down(e) {
      dragging = true;
      vel = 0;
      lastX = e.clientX; lastY = e.clientY;
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    }
    function move(e) {
      if (!dragging) return;
      var dx = e.clientX - lastX;
      var dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      spin += dx * 1.35;
      vel = dx * 1.35;
      tilt = Math.max(-14, Math.min(52, tilt - dy * 0.7));
    }
    function up() { dragging = false; }

    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    loop();
    featureVinylCancel = function () { stopped = true; if (raf) cancelAnimationFrame(raf); };
  }

  // ---------- render ----------
  function render() {
    var list = sortedSongs();
    els.trackCount.textContent = list.length ? (list.length + (list.length === 1 ? ' track' : ' tracks')) : '';
    els.banner.hidden = !list.some(function (s) { return s.sample; });

    if (!list.length) {
      if (featureVinylCancel) { featureVinylCancel(); featureVinylCancel = null; }
      els.featureSlot.innerHTML = '';
      els.tracklist.innerHTML = '';
      els.emptyState.hidden = false;
      return;
    }
    els.emptyState.hidden = true;

    var feature = list[0];
    var rest = list.slice(1);

    els.featureSlot.innerHTML =
      '<div class="feature">' +
      vinylMarkup(feature, 'large') +
      '<div class="feature-body">' +
      '<span class="eyebrow">On repeat now</span>' +
      '<h2 class="serif">' + escapeHtml(feature.title) + (feature.sample ? '<span class="badge-sample">Sample</span>' : '') + '</h2>' +
      '<div class="artist">' + escapeHtml(feature.artist) + '</div>' +
      (feature.note ? '<p class="note">' + escapeHtml(feature.note) + '</p>' : '') +
      '<div class="feature-foot">' +
      '<a class="btn btn-accent" href="' + escapeHtml(feature.url) + '" target="_blank" rel="noopener">Listen on Apple Music</a>' +
      '<span class="added">Added ' + fmtDate(feature.addedAt) + '</span>' +
      '</div>' +
      '</div>' +
      '</div>';

    els.tracklist.innerHTML = rest.map(function (song, idx) {
      return (
        '<li class="track" data-id="' + escapeHtml(song.id) + '">' +
        '<span class="num">' + (idx + 2) + '</span>' +
        vinylMarkup(song, 'mini') +
        '<div class="track-main">' +
        '<div class="t-title">' + escapeHtml(song.title) + (song.sample ? '<span class="badge-sample">Sample</span>' : '') + '</div>' +
        '<div class="t-artist">' + escapeHtml(song.artist) + '</div>' +
        (song.note ? '<div class="t-note">' + escapeHtml(song.note) + '</div>' : '') +
        '</div>' +
        '<div class="track-actions">' +
        (isEditMode ? '<button class="icon-link edit-btn" title="Edit" data-id="' + escapeHtml(song.id) + '">' + editIcon() + '</button>' : '') +
        (isEditMode ? '<button class="icon-link delete-btn" title="Remove" data-id="' + escapeHtml(song.id) + '">' + trashIcon() + '</button>' : '') +
        '<a class="icon-link" title="Open in Apple Music" href="' + escapeHtml(song.url) + '" target="_blank" rel="noopener">' + listenIcon() + '</a>' +
        '</div>' +
        '</li>'
      );
    }).join('');

    var newest = list.reduce(function (max, s) { return s.addedAt > max ? s.addedAt : max; }, 0);
    els.updatedLabel.textContent = 'Updated ' + fmtDate(newest);

    var featureStage = document.getElementById('feature-vinyl');
    if (featureStage) initFeatureVinyl(featureStage);
  }

  function applyEditVisibility() {
    els.addBtn.hidden = !isEditMode;
    els.ownerHint.hidden = !isEditMode;
    els.connectBtn.hidden = !(isEditMode && !!window.showSaveFilePicker);
    render();
  }

  // ---------- persistence ----------
  function updateConnStatus(connected) {
    els.connStatus.hidden = !isEditMode || !window.showSaveFilePicker;
    els.connStatus.classList.toggle('on', connected);
    els.connText.textContent = connected ? 'Connected to songs.json' : 'Not connected';
    els.connectBtn.hidden = !isEditMode || !window.showSaveFilePicker || connected;
  }

  function downloadJson(data) {
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'songs.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  async function writeToHandle(handle, data) {
    var writable = await handle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
  }

  els.connectBtn.addEventListener('click', async function () {
    if (!window.showSaveFilePicker) return;
    try {
      var handle = await window.showSaveFilePicker({
        suggestedName: 'songs.json',
        types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
      });
      fileHandle = handle;
      updateConnStatus(true);
      showToast('Connected — edits now save straight to songs.json.');
    } catch (err) {
      // user cancelled the picker
    }
  });

  async function persist(newSongs, successMsg) {
    var previous = songs;
    songs = newSongs;
    render();
    if (!isEditMode) return;

    if (fileHandle) {
      try {
        await writeToHandle(fileHandle, newSongs);
        showToast(successMsg || 'Saved.');
        return;
      } catch (err) {
        showToast("Couldn't write to the connected file — downloaded instead.");
        downloadJson(newSongs);
        return;
      }
    }

    downloadJson(newSongs);
    showToast((successMsg || 'Saved') + ' — songs.json downloaded. Replace the file in your project (or click Connect) and redeploy.');
  }

  // ---------- dialog: search ----------
  function resetDialog() {
    pickedResult = null;
    editingId = null;
    els.fId.value = '';
    els.fUrl.value = '';
    els.fArtUrl.value = '';
    els.fTitle.value = '';
    els.fArtist.value = '';
    els.fManualUrl.value = '';
    els.fNote.value = '';
    els.searchInput.value = '';
    els.searchResults.innerHTML = '';
    els.searchStatus.textContent = '';
    lastResults = [];
    activeResultIndex = -1;
    els.searchStep.hidden = false;
    els.pickedStep.hidden = true;
    els.manualFields.hidden = true;
    els.noteField.hidden = true;
    els.dialogActions.hidden = true;
    els.dialogSub.textContent = "Search Apple Music's catalog and pick a match.";
  }

  function openDialog(existing) {
    resetDialog();
    if (existing) {
      els.dialogTitle.textContent = 'Edit track';
      editingId = existing.id;
      els.fNote.value = existing.note || '';
      selectResult({
        title: existing.title,
        artist: existing.artist,
        url: existing.url,
        artUrl: existing.artUrl
      }, true);
    } else {
      els.dialogTitle.textContent = 'Add a track';
    }
    els.dialog.showModal();
    if (!existing) setTimeout(function () { els.searchInput.focus(); }, 30);
  }

  function upsizeArtwork(url) {
    return url ? url.replace(/\/\d+x\d+bb\.(jpg|png)$/, '/600x600bb.$1') : url;
  }

  function renderResults(items) {
    lastResults = items;
    activeResultIndex = -1;
    if (!items.length) {
      els.searchResults.innerHTML = '';
      return;
    }
    els.searchResults.innerHTML = items.map(function (r, i) {
      return (
        '<button type="button" class="result-row" data-idx="' + i + '">' +
        '<div class="result-art" style="background-image:url(\'' + escapeHtml(r.artUrl || '') + '\')"></div>' +
        '<div class="result-info">' +
        '<div class="r-title">' + escapeHtml(r.title) + '</div>' +
        '<div class="r-sub">' + escapeHtml(r.artist) + (r.album ? ' &middot; ' + escapeHtml(r.album) : '') + '</div>' +
        '</div>' +
        '</button>'
      );
    }).join('');
  }

  function runSearch(term) {
    var seq = ++searchSeq;
    els.searchStatus.textContent = 'Searching…';
    var url = 'https://itunes.apple.com/search?media=music&entity=song&limit=8&country=us&term=' + encodeURIComponent(term);
    fetch(url).then(function (res) { return res.json(); }).then(function (data) {
      if (seq !== searchSeq) return; // stale response
      var items = (data.results || []).map(function (r) {
        return {
          title: r.trackName,
          artist: r.artistName,
          album: r.collectionName,
          url: r.trackViewUrl,
          artUrl: upsizeArtwork(r.artworkUrl100)
        };
      });
      els.searchStatus.textContent = items.length ? '' : 'No matches on Apple Music — try a different search or enter it manually.';
      renderResults(items);
    }).catch(function () {
      if (seq !== searchSeq) return;
      els.searchStatus.textContent = "Couldn't reach Apple Music's search — check your connection or enter it manually.";
      renderResults([]);
    });
  }

  els.searchInput.addEventListener('input', function () {
    var term = els.searchInput.value.trim();
    clearTimeout(searchDebounce);
    if (term.length < 2) {
      els.searchStatus.textContent = '';
      renderResults([]);
      return;
    }
    searchDebounce = setTimeout(function () { runSearch(term); }, 320);
  });

  els.searchInput.addEventListener('keydown', function (e) {
    if (!lastResults.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeResultIndex = Math.min(activeResultIndex + 1, lastResults.length - 1);
      highlightActive();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeResultIndex = Math.max(activeResultIndex - 1, 0);
      highlightActive();
    } else if (e.key === 'Enter' && activeResultIndex >= 0) {
      e.preventDefault();
      selectResult(lastResults[activeResultIndex]);
    }
  });

  function highlightActive() {
    var rows = els.searchResults.querySelectorAll('.result-row');
    rows.forEach(function (row, i) {
      row.classList.toggle('active', i === activeResultIndex);
      if (i === activeResultIndex) row.scrollIntoView({ block: 'nearest' });
    });
  }

  els.searchResults.addEventListener('click', function (e) {
    var row = e.target.closest('.result-row');
    if (!row) return;
    selectResult(lastResults[parseInt(row.dataset.idx, 10)]);
  });

  function selectResult(result, skipNoteFocus) {
    pickedResult = result;
    els.fUrl.value = result.url || '';
    els.fArtUrl.value = result.artUrl || '';
    els.pickedArt.style.backgroundImage = result.artUrl ? 'url(' + JSON.stringify(result.artUrl) + ')' : 'none';
    els.pickedArt.style.backgroundColor = result.artUrl ? '' : 'var(--card-dim)';
    els.pickedTitle.textContent = result.title;
    els.pickedArtist.textContent = result.artist;

    els.searchStep.hidden = true;
    els.pickedStep.hidden = false;
    els.manualFields.hidden = true;
    els.noteField.hidden = false;
    els.dialogActions.hidden = false;
    els.dialogSub.textContent = 'One line on why it earned a spot.';
    if (!skipNoteFocus) setTimeout(function () { els.fNote.focus(); }, 30);
  }

  els.pickedChange.addEventListener('click', function () {
    pickedResult = null;
    els.pickedStep.hidden = true;
    els.searchStep.hidden = false;
    els.noteField.hidden = true;
    els.dialogActions.hidden = true;
    els.dialogSub.textContent = "Search Apple Music's catalog and pick a match.";
    setTimeout(function () { els.searchInput.focus(); }, 30);
  });

  els.manualToggleOn.addEventListener('click', function () {
    els.searchStep.hidden = true;
    els.pickedStep.hidden = true;
    els.manualFields.hidden = false;
    els.noteField.hidden = false;
    els.dialogActions.hidden = false;
    els.dialogSub.textContent = 'Fill in the details by hand.';
    setTimeout(function () { els.fTitle.focus(); }, 30);
  });

  els.dialogCancel.addEventListener('click', function () { els.dialog.close(); });

  els.clearSamplesBtn.addEventListener('click', function () {
    persist(songs.filter(function (s) { return !s.sample; }), 'Samples cleared.');
  });

  els.tracklist.addEventListener('click', function (e) {
    var editBtn = e.target.closest('.edit-btn');
    var delBtn = e.target.closest('.delete-btn');
    if (editBtn) {
      var song = songs.find(function (s) { return s.id === editBtn.dataset.id; });
      if (song) openDialog(song);
    } else if (delBtn) {
      persist(songs.filter(function (s) { return s.id !== delBtn.dataset.id; }), 'Track removed.');
    }
  });

  els.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var usingManual = !els.manualFields.hidden;
    var title, artist, url, artUrl;

    if (usingManual) {
      title = els.fTitle.value.trim();
      artist = els.fArtist.value.trim();
      url = els.fManualUrl.value.trim();
      artUrl = null;
      if (!title || !artist || !url) return;
    } else {
      if (!pickedResult) return;
      title = pickedResult.title;
      artist = pickedResult.artist;
      url = els.fUrl.value;
      artUrl = els.fArtUrl.value || null;
    }
    var note = els.fNote.value.trim();

    var next;
    if (editingId) {
      next = songs.map(function (s) {
        if (s.id !== editingId) return s;
        return Object.assign({}, s, { title: title, artist: artist, url: url, note: note, artUrl: artUrl, sample: false });
      });
    } else {
      next = songs.concat([{
        id: 'trk-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        title: title, artist: artist, url: url, note: note, artUrl: artUrl,
        addedAt: Date.now(), sample: false
      }]);
    }
    els.dialog.close();
    persist(next, editingId ? 'Track updated.' : 'Added to the rotation.');
  });

  els.addBtn.addEventListener('click', function () { openDialog(null); });

  // ---------- boot ----------
  applyEditVisibility();
  updateConnStatus(false);

  fetch('songs.json').then(function (res) {
    if (!res.ok) throw new Error('fetch failed');
    return res.json();
  }).then(function (data) {
    songs = data;
    render();
  }).catch(function () {
    showToast("Couldn't load songs.json — serve this folder over http(s), don't open the file directly.");
    render();
  });
})();
