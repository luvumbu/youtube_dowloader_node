const API = 'http://127.0.0.1:3000/api';

// Helper : verifie que le contexte extension est encore valide
function chromeOk() {
  try { return !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { return false; }
}

/**
 * Proxy fetch vers le background service worker.
 * Les content scripts ne peuvent pas fetch localhost (CORS Manifest V3).
 * On intercepte tous les appels fetch vers l'API locale et on les
 * redirige via chrome.runtime.sendMessage au service worker.
 */
const _origFetch = window.fetch;
window.fetch = function(url, opts = {}) {
  // Seuls les appels vers notre API locale passent par le background
  if (typeof url === 'string' && (url.startsWith('http://127.0.0.1:3000/api') || url.startsWith('http://localhost:3000/api'))) {
    if (!chromeOk()) return Promise.reject(new Error('Extension context invalidated'));

    // Extraire l'endpoint relatif
    const apiBase = url.startsWith('http://127.0.0.1:3000/api') ? 'http://127.0.0.1:3000/api' : 'http://localhost:3000/api';
    const endpoint = url.substring(apiBase.length) || '/';

    // Determiner le content-type depuis les headers originaux
    let contentType = null;
    if (opts.headers) {
      contentType = opts.headers['Content-Type'] || opts.headers['content-type'] || null;
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: 'api', endpoint, method: opts.method || 'GET', body: opts.body || null, params: null, contentType },
        (response) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          // Simuler une Response pour que le code existant (.json() etc.) fonctionne
          resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(response)
          });
        }
      );
    });
  }
  // Tout le reste passe par le fetch normal
  return _origFetch.apply(this, arguments);
};

// Notifications navigateur
if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
function notify(title) {
  if (!chromeOk()) return;
  try {
    chrome.storage.local.get(['notifications'], (data) => {
      if (chrome.runtime.lastError) return;
      if (data.notifications === false) return;
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Telechargement termine', { body: title, icon: 'https://www.youtube.com/favicon.ico' });
      }
    });
  } catch (e) {}
}

function toggleNotif() {
  if (!chromeOk()) return;
  try {
    chrome.storage.local.get(['notifications'], (data) => {
      if (chrome.runtime.lastError) return;
      const on = data.notifications === false; // inverse
      chrome.storage.local.set({ notifications: on });
      updateNotifBtn();
    });
  } catch (e) {}
}

function updateNotifBtn() {
  const btn = document.getElementById('ytdl-btn-notif');
  if (!btn) return;
  if (!chromeOk()) return;
  try {
    chrome.storage.local.get(['notifications'], (data) => {
      if (chrome.runtime.lastError) return;
      const on = data.notifications !== false;
      btn.textContent = on ? '\u{1F514}' : '\u{1F515}';
      btn.classList.toggle('off', !on);
      btn.title = on ? 'Notifications activees (clic pour desactiver)' : 'Notifications desactivees (clic pour activer)';
    });
  } catch (e) {}
}

const DL_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/></svg>';
const CHECK_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M9 16.2l-3.5-3.5L4 14.2l5 5 12-12-1.5-1.5z"/></svg>';
const MENU_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>';

// ========== OPTIONS ==========
const AUDIO_FORMATS = [
  { v: 'mp3', l: 'MP3' }, { v: 'flac', l: 'FLAC' },
  { v: 'wav', l: 'WAV' }, { v: 'aac', l: 'AAC' }, { v: 'ogg', l: 'OGG' }
];
const AUDIO_QUALITIES = [
  { v: '0', l: 'Meilleure qualite' }, { v: '5', l: 'Qualite moyenne' }, { v: '9', l: 'Qualite basse' }
];
const VIDEO_FORMATS = [
  { v: 'mp4', l: 'MP4' }, { v: 'mkv', l: 'MKV' }, { v: 'webm', l: 'WEBM' }
];
const VIDEO_QUALITIES = [
  { v: 'best', l: 'Meilleure qualite' }, { v: '1080', l: '1080p' },
  { v: '720', l: '720p' }, { v: '480', l: '480p' }, { v: '360', l: '360p' }
];

// ========== BOUTONS FLOTTANTS ==========
function createButtons() {
  if (document.getElementById('ytdl-bar')) return;

  const bar = document.createElement('div');
  bar.id = 'ytdl-bar';
  bar.innerHTML = `
    <button id="ytdl-btn-dl" class="ytdl-fab ytdl-fab-dl" title="Telecharger">${DL_ICON}</button>
    <button id="ytdl-btn-menu" class="ytdl-fab ytdl-fab-menu" title="Options">${MENU_ICON}</button>
    <button id="ytdl-btn-notif" class="ytdl-fab ytdl-fab-notif" title="Notifications activees">&#128276;</button>
  `;
  document.body.appendChild(bar);

  document.getElementById('ytdl-btn-dl').addEventListener('click', quickDownload);
  document.getElementById('ytdl-btn-menu').addEventListener('click', togglePanel);
  document.getElementById('ytdl-btn-notif').addEventListener('click', toggleNotif);
  updateNotifBtn();

  // Bouton DL inline a cote des likes
  injectInlineBtn();

  // Verifier si deja telecharge
  checkIfDownloaded(window.location.href);
}

function injectInlineBtn() {
  if (document.getElementById('ytdl-inline-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'ytdl-inline-btn';
  btn.innerHTML = DL_ICON + ' DL';
  btn.title = 'Telecharger avec YouTube Downloader';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    quickDownload();
  });

  // Retry insertion (YouTube charge les boutons en async)
  let tries = 0;
  const tryInsert = () => {
    tries++;
    const targets = [
      '#top-level-buttons-computed',
      'ytd-menu-renderer.ytd-watch-metadata',
      '#actions.ytd-watch-metadata',
      '#menu-container'
    ];
    for (const sel of targets) {
      const el = document.querySelector(sel);
      if (el) { el.appendChild(btn); return; }
    }
    if (tries < 20) setTimeout(tryInsert, 500);
  };
  tryInsert();
}

// ========== PANNEAU OPTIONS ==========
function createPanel() {
  if (document.getElementById('ytdl-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'ytdl-panel';
  panel.innerHTML = `
    <div class="ytdl-header">
      <span>${DL_ICON} Options</span>
      <button class="ytdl-close" id="ytdlClose">&times;</button>
    </div>
    <div class="ytdl-body">
      <div class="ytdl-status" id="ytdlStatus"></div>
      <div class="ytdl-video-info" id="ytdlVideoInfo" style="display:none;">
        <img id="ytdlThumb" src="" alt="">
        <div class="ytdl-vi-text">
          <div class="ytdl-vi-title" id="ytdlTitle">-</div>
          <div class="ytdl-vi-meta" id="ytdlMeta">-</div>
        </div>
      </div>

      <div class="ytdl-type-row">
        <input type="radio" name="ytdlType" id="ytdlAudio" value="audio" checked>
        <label for="ytdlAudio">Audio</label>
        <input type="radio" name="ytdlType" id="ytdlVideo" value="video">
        <label for="ytdlVideo">Video</label>
      </div>

      <div class="ytdl-row">
        <select id="ytdlFormat"></select>
        <select id="ytdlQuality"></select>
      </div>

      <div class="ytdl-check">
        <input type="checkbox" id="ytdlCover"><label for="ytdlCover">Couverture (image)</label>
      </div>

      <div class="ytdl-progress-zone" id="ytdlProgressZone">
        <div class="ytdl-progress-bg"><div class="ytdl-progress-fill" id="ytdlProgressBar"></div></div>
        <div class="ytdl-progress-text" id="ytdlProgressText">Demarrage...</div>
      </div>

      <button class="ytdl-btn ytdl-btn-dl" id="ytdlBtnDl">Telecharger</button>
      <button class="ytdl-btn ytdl-btn-queue" id="ytdlBtnQueue">+ File d'attente</button>

      <div class="ytdl-prefs-label" id="ytdlPrefsLabel"></div>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById('ytdlClose').addEventListener('click', () => panel.classList.remove('active'));
  document.getElementById('ytdlAudio').addEventListener('change', () => { updatePanelOptions(); savePrefs(); updatePrefsLabel(); });
  document.getElementById('ytdlVideo').addEventListener('change', () => { updatePanelOptions(); savePrefs(); updatePrefsLabel(); });
  document.getElementById('ytdlFormat').addEventListener('change', () => { savePrefs(); updatePrefsLabel(); });
  document.getElementById('ytdlQuality').addEventListener('change', () => { savePrefs(); updatePrefsLabel(); });
  document.getElementById('ytdlCover').addEventListener('change', () => { savePrefs(); updatePrefsLabel(); });
  document.getElementById('ytdlBtnDl').addEventListener('click', () => {
    const url = window.location.href;
    const title = document.getElementById('ytdlTitle')?.textContent || url;
    addToExtQueue(url, title);
    const status = document.getElementById('ytdlStatus');
    if (status) { status.textContent = '+ Ajoute a la file d\'attente'; status.className = 'ytdl-status ok'; }
  });
  document.getElementById('ytdlBtnQueue').addEventListener('click', () => {
    const url = window.location.href;
    const title = document.getElementById('ytdlTitle')?.textContent || url;
    addToExtQueue(url, title);
    const status = document.getElementById('ytdlStatus');
    if (status) { status.textContent = '+ Ajoute a la file d\'attente'; status.className = 'ytdl-status ok'; }
    const qp = document.getElementById('ytdl-queue-panel');
    if (qp) qp.classList.add('active');
  });

  updatePanelOptions();
  loadSavedPrefs();
}

function togglePanel() {
  const panel = document.getElementById('ytdl-panel');
  if (panel) {
    panel.classList.toggle('active');
    if (panel.classList.contains('active')) loadVideoInfo();
  }
}

// ========== PREFERENCES ==========
function updatePanelOptions() {
  const type = document.querySelector('input[name="ytdlType"]:checked')?.value || 'audio';
  const formats = type === 'audio' ? AUDIO_FORMATS : VIDEO_FORMATS;
  const qualities = type === 'audio' ? AUDIO_QUALITIES : VIDEO_QUALITIES;
  const fSel = document.getElementById('ytdlFormat');
  const qSel = document.getElementById('ytdlQuality');
  if (!fSel || !qSel) return;
  fSel.innerHTML = formats.map(f => '<option value="' + f.v + '">' + f.l + '</option>').join('');
  qSel.innerHTML = qualities.map(q => '<option value="' + q.v + '">' + q.l + '</option>').join('');
}

function loadSavedPrefs() {
  if (!chromeOk()) return;
  try { chrome.storage.local.get(['type', 'format', 'quality', 'cover', 'notifications'], (data) => {
    if (chrome.runtime.lastError) return;
    if (data.type === 'video') {
      const el = document.getElementById('ytdlVideo');
      if (el) el.checked = true;
    }
    updatePanelOptions();
    if (data.format) { const el = document.getElementById('ytdlFormat'); if (el) el.value = data.format; }
    if (data.quality) { const el = document.getElementById('ytdlQuality'); if (el) el.value = data.quality; }
    if (data.cover) { const el = document.getElementById('ytdlCover'); if (el) el.checked = true; }
    updatePrefsLabel();
    // Mettre a jour le bouton notif
    updateNotifBtn();
  }); } catch (e) {}
}

function savePrefs() {
  if (!chromeOk()) return;
  try {
    const type = document.querySelector('input[name="ytdlType"]:checked')?.value || 'audio';
    const format = document.getElementById('ytdlFormat')?.value || 'mp3';
    const quality = document.getElementById('ytdlQuality')?.value || '0';
    const cover = document.getElementById('ytdlCover')?.checked || false;
    chrome.storage.local.set({ type, format, quality, cover });
  } catch (e) {}
}

function getPrefs() {
  return new Promise(resolve => {
    if (!chromeOk()) { resolve({ type: 'audio', format: 'mp3', quality: '0', cover: '0' }); return; }
    try {
      chrome.storage.local.get(['type', 'format', 'quality', 'cover'], (data) => {
        if (chrome.runtime.lastError) { resolve({ type: 'audio', format: 'mp3', quality: '0', cover: '0' }); return; }
        resolve({
          type: data.type || 'audio',
          format: data.format || 'mp3',
          quality: data.quality || '0',
          cover: data.cover ? '1' : '0'
        });
      });
    } catch (e) { resolve({ type: 'audio', format: 'mp3', quality: '0', cover: '0' }); }
  });
}

function updatePrefsLabel() {
  const el = document.getElementById('ytdlPrefsLabel');
  if (!el) return;
  const type = document.querySelector('input[name="ytdlType"]:checked')?.value || 'audio';
  const format = document.getElementById('ytdlFormat')?.value || 'mp3';
  const quality = document.getElementById('ytdlQuality')?.value || '0';
  el.textContent = 'Bouton DL = ' + format.toUpperCase() + ' (' + (type === 'audio' ? 'audio' : 'video') + ')';
}

// ========== VIDEO INFO ==========
let cachedInfo = null;

async function loadVideoInfo() {
  const url = window.location.href;
  const infoDiv = document.getElementById('ytdlVideoInfo');
  const status = document.getElementById('ytdlStatus');

  try {
    const resp = await fetch(API + '/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'url=' + encodeURIComponent(url),
      signal: AbortSignal.timeout(10000)
    });
    cachedInfo = await resp.json();

    if (cachedInfo.success) {
      document.getElementById('ytdlThumb').src = cachedInfo.thumbnail || '';
      document.getElementById('ytdlTitle').textContent = cachedInfo.title;
      let meta = cachedInfo.channel || '';
      if (cachedInfo.duration) meta += ' | ' + cachedInfo.duration;
      if (cachedInfo.views_display) meta += ' | ' + cachedInfo.views_display;
      document.getElementById('ytdlMeta').textContent = meta;
      infoDiv.style.display = 'flex';
      status.className = 'ytdl-status';
    }
  } catch (err) {
    status.textContent = 'Serveur inaccessible. Lance start.bat.';
    status.className = 'ytdl-status err';
    if (infoDiv) infoDiv.style.display = 'none';
  }
}

async function checkIfDownloaded(url) {
  try {
    const resp = await fetch(API + '/library?action=check_url&url=' + encodeURIComponent(url), { signal: AbortSignal.timeout(2000) });
    const data = await resp.json();
    if (data.exists) markAsExists();
  } catch (e) {}
}

function markAsExists() {
  const fab = document.getElementById('ytdl-btn-dl');
  if (fab) { fab.innerHTML = CHECK_ICON; fab.classList.add('ytdl-exists'); fab.title = 'Deja en bibliotheque (clic pour re-telecharger)'; }
  const inline = document.getElementById('ytdl-inline-btn');
  if (inline) { inline.innerHTML = CHECK_ICON + ' DL'; inline.classList.add('ytdl-exists'); inline.title = 'Deja en bibliotheque (clic pour re-telecharger)'; }
}

function markAsDownloaded() {
  const fab = document.getElementById('ytdl-btn-dl');
  if (fab) { fab.innerHTML = CHECK_ICON; fab.classList.remove('ytdl-exists'); fab.classList.add('ytdl-downloaded'); fab.title = 'Telecharge avec succes'; }
  const inline = document.getElementById('ytdl-inline-btn');
  if (inline) { inline.innerHTML = CHECK_ICON + ' DL'; inline.classList.remove('ytdl-exists'); inline.classList.add('ytdl-downloaded'); inline.title = 'Telecharge avec succes'; }
}

// ========== QUICK DOWNLOAD (bouton DL) ==========
async function quickDownload() {
  const url = window.location.href;
  const title = cachedInfo?.title || document.title.replace(' - YouTube', '') || url;
  addToExtQueue(url, title);
}

function resetDlBtn(btn) {
  btn.innerHTML = DL_ICON;
  btn.disabled = false;
  btn.classList.remove('ytdl-error', 'ytdl-progress', 'ytdl-downloaded', 'ytdl-exists');
  btn.title = 'Telecharger';
}

// ========== PANEL DOWNLOAD ==========
// ========== LIBRARY ==========
async function addToLibrary(data, info, type, format, url, folder) {
  await fetch(API + '/library', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'action=add_item&file=' + encodeURIComponent(data.file)
      + '&title=' + encodeURIComponent(info.title)
      + '&type=' + type + '&format=' + format
      + '&folder=' + encodeURIComponent(folder || '')
      + '&thumbnail=' + encodeURIComponent(info.thumbnail || '')
      + '&channel=' + encodeURIComponent(info.channel || '')
      + '&duration=' + encodeURIComponent(info.duration || '')
      + '&cover=' + encodeURIComponent(data.cover || '')
      + '&url=' + encodeURIComponent(url)
  });
  await fetch(API + '/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'action=add&title=' + encodeURIComponent(info.title) + '&status=success'
      + '&format=' + format + '&type=' + type + '&url=' + encodeURIComponent(url)
      + '&views=' + encodeURIComponent(info.views_display || '')
      + '&year=' + encodeURIComponent(info.year || '')
      + '&likes=' + encodeURIComponent(info.likes || '0')
      + '&dislikes=' + encodeURIComponent(info.dislikes || '0')
  });
}

// ========== EXTENSION QUEUE ==========
let extQueue = [];
let extQueueProcessing = false;

function createQueuePanel() {
  if (document.getElementById('ytdl-queue-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'ytdl-queue-panel';
  panel.innerHTML = `
    <div class="ytdl-queue-header">
      <span>File d'attente <span class="ytdl-queue-count" id="ytdlQueueCount">0</span></span>
      <div>
        <button class="ytdl-queue-clear" id="ytdlQueueClearDone">Termines</button>
        <button class="ytdl-queue-clear" id="ytdlQueueClear">Tout vider</button>
        <button class="ytdl-queue-close" id="ytdlQueueClose">&times;</button>
      </div>
    </div>
    <div class="ytdl-queue-body" id="ytdlQueueBody">
      <p class="ytdl-queue-empty">File d'attente vide.</p>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById('ytdlQueueClose').addEventListener('click', () => panel.classList.remove('active'));
  document.getElementById('ytdlQueueClearDone').addEventListener('click', () => {
    extQueue = extQueue.filter(q => q.status !== 'done' && q.status !== 'skipped');
    renderExtQueue();
    saveExtQueue();
    updateQueueBadge();
    fetch(API + '/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', mode: 'done' })
    }).catch(() => {});
  });
  document.getElementById('ytdlQueueClear').addEventListener('click', () => {
    // Stopper les actifs
    extQueue.forEach(q => { if (q.status === 'active') q._skipped = true; });
    extQueue = [];
    extQueueProcessing = false;
    renderExtQueue();
    saveExtQueue();
    updateQueueBadge();
    fetch(API + '/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear', mode: 'all' })
    }).catch(() => {});
  });
}

function createQueueToggle() {
  if (document.getElementById('ytdl-btn-queue-toggle')) return;
  const bar = document.getElementById('ytdl-bar');
  if (!bar) return;

  const btn = document.createElement('button');
  btn.id = 'ytdl-btn-queue-toggle';
  btn.className = 'ytdl-fab ytdl-fab-queue';
  btn.title = "File d'attente";
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M4 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h10v2H4zm14-3l4 3-4 3v-6z"/></svg><span class="ytdl-queue-badge" id="ytdlQueueBadge"></span>';
  btn.addEventListener('click', () => {
    const panel = document.getElementById('ytdl-queue-panel');
    if (panel) panel.classList.toggle('active');
  });
  bar.appendChild(btn);
}

async function addToExtQueue(url, title) {
  // Eviter les doublons dans la queue
  if (extQueue.some(q => q.url === url && q.status !== 'done' && q.status !== 'error')) return;

  const prefs = await getPrefs();
  extQueue.push({
    url, title: title || url, status: 'waiting',
    jobId: null, percent: 0, message: '', format: prefs.format, type: prefs.type
  });
  renderExtQueue();
  saveExtQueue();
  updateQueueBadge();

  // Ajouter aussi sur le serveur pour sync avec le web
  fetch(API + '/queue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'add', url: url, title: title || url,
      type: prefs.type, format: prefs.format,
      quality: prefs.quality, source: 'extension'
    })
  }).catch(() => {});

  if (!extQueueProcessing) processExtQueue();
}

async function processExtQueue() {
  if (extQueueProcessing) return;
  extQueueProcessing = true;

  try {
    while (extQueue.some(q => q.status === 'waiting')) {
      const item = extQueue.find(q => q.status === 'waiting');
      if (!item) break;

      const prefs = await getPrefs();
      item.status = 'active';
      item._activeStart = Date.now();
      item.format = prefs.format;
      item.type = prefs.type;
      renderExtQueue();
      saveExtQueue();

      try {
        // Verifier doublon
        const exists = await checkUrlExists(item.url, item.format || prefs.format);
        if (exists) {
          // Si un dossier est defini, deplacer l'element existant dans ce dossier
          if (item.folder) {
            try {
              const listResp = await fetch(API + '/library?action=list');
              const listData = await listResp.json();
              if (listData.items) {
                const videoId = item.url.match(/[?&]v=([^&]+)/)?.[1] || '';
                const existing = listData.items.find(i => i.url && videoId && i.url.includes(videoId) && (i.format || '') === (item.format || prefs.format));
                if (existing && existing.folder !== item.folder) {
                  await fetch(API + '/library', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'action=move_item&item_id=' + encodeURIComponent(existing.id) + '&folder_id=' + encodeURIComponent(item.folder)
                  });
                  addLog('skip', item.title, 'Deplace dans le dossier');
                } else {
                  addLog('skip', item.title, 'Deja dans la bibliotheque');
                }
              }
            } catch (e) {
              addLog('skip', item.title, 'Deja dans la bibliotheque');
            }
          } else {
            addLog('skip', item.title, 'Deja dans la bibliotheque');
          }
          item.status = 'skipped';
          item.message = 'Deja en bibliotheque';
          item.percent = 100;
          renderExtQueue();
          saveExtQueue();
          updateQueueBadge();
          continue;
        }

        // Recuperer info
        const infoResp = await fetch(API + '/info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'url=' + encodeURIComponent(item.url)
        });
        const info = await infoResp.json();
        if (info.success) item.title = info.title;
        renderExtQueue();

        // Lancer le telechargement
        const dlResp = await fetch(API + '/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'url=' + encodeURIComponent(item.url) + '&type=' + prefs.type + '&format=' + prefs.format
            + '&quality=' + prefs.quality + '&cover=' + prefs.cover
        });
        const dlData = await dlResp.json();

        if (!dlData.success) {
          item.status = 'error';
          item.message = dlData.error || 'Erreur';
          addLog('error', item.title, 'Erreur de telechargement');
          renderExtQueue();
          saveExtQueue();
          updateQueueBadge();
          continue;
        }

        item.jobId = dlData.jobId;
        saveExtQueue();

        // Poll progression avec timeout si aucune activite pendant 5 min
        await new Promise((resolve) => {
          let pollErrors = 0;
          let lastMessage = '';
          let lastPercent = -1;
          let lastActivityTime = Date.now();
          const STALL_TIMEOUT = 300000; // 5 min sans aucun changement
          const poll = setInterval(async () => {
            // Skip demande par l'utilisateur
            if (item._skipped) {
              clearInterval(poll);
              resolve();
              return;
            }
            if (Date.now() - lastActivityTime > STALL_TIMEOUT) {
              clearInterval(poll);
              item.status = 'error';
              item.message = 'Bloque (aucune activite depuis 5 min)';
              renderExtQueue(); saveExtQueue(); updateQueueBadge();
              resolve();
              return;
            }
            try {
              const resp = await fetch(API + '/progress?id=' + dlData.jobId, { signal: AbortSignal.timeout(5000) });
              const data = await resp.json();
              pollErrors = 0;
              // Reset timer si n'importe quoi change (percent, message, status)
              const curMsg = data.message || '';
              const curPct = data.percent || 0;
              if (curPct !== lastPercent || curMsg !== lastMessage || data.status === 'done' || data.status === 'error') {
                lastPercent = curPct;
                lastMessage = curMsg;
                lastActivityTime = Date.now();
                item._activeStart = Date.now();
              }
              if (data.status === 'done') {
                clearInterval(poll);
                item.status = 'done';
                item.percent = 100;
                item.message = 'Termine';
                if (info.success) {
                  await addToLibrary(data, info, prefs.type, prefs.format, item.url, item.folder || '');
                  addLog('success', item.title, prefs.format.toUpperCase());
                  notify(item.title);
                }
                if (item.url === window.location.href) markAsDownloaded();
                renderExtQueue();
                saveExtQueue();
                updateQueueBadge();
                resolve();
              } else if (data.status === 'error') {
                clearInterval(poll);
                item.status = 'error';
                item.message = data.message || 'Erreur';
                addLog('error', item.title, data.message || 'Erreur');
                renderExtQueue();
                saveExtQueue();
                updateQueueBadge();
                resolve();
              } else {
                item.percent = data.percent || 0;
                item.message = data.message || '';
                renderExtQueue();
              }
            } catch (e) {
              pollErrors++;
              if (pollErrors >= 10) {
                clearInterval(poll);
                item.status = 'error';
                item.message = 'Connexion perdue';
                renderExtQueue(); saveExtQueue(); updateQueueBadge();
                resolve();
              }
            }
          }, 1000);
        });

      } catch (e) {
        item.status = 'error';
        item.message = 'Serveur inaccessible';
        renderExtQueue();
        saveExtQueue();
        updateQueueBadge();
      }

      // Delai anti-blocage
      if (extQueue.some(q => q.status === 'waiting')) {
        await new Promise(r => setTimeout(r, 3000 + Math.floor(Math.random() * 2000)));
      }
    }
  } finally {
    extQueueProcessing = false;
  }
}

// Watchdog : nettoie les actifs bloques et relance la queue (toutes les 15s)
setInterval(() => {
  let changed = false;

  // Detecter les items "active" sans jobId depuis plus de 60s (jamais lances)
  // ou avec jobId mais bloques — verifier via l'API
  extQueue.forEach(q => {
    if (q.status === 'active' && q._activeStart && Date.now() - q._activeStart > 360000) {
      // Actif depuis plus de 6 min sans changement = bloque
      q.status = 'error';
      q.message = 'Bloque (relance possible)';
      changed = true;
    }
  });

  if (changed) {
    renderExtQueue();
    saveExtQueue();
    updateQueueBadge();
  }

  // Relancer s'il y a des waiting sans actif
  const hasWaiting = extQueue.some(q => q.status === 'waiting');
  const hasActive = extQueue.some(q => q.status === 'active');
  if (hasWaiting && !hasActive && !extQueueProcessing) {
    processExtQueue();
  }
}, 15000);

function renderExtQueue() {
  const body = document.getElementById('ytdlQueueBody');
  const countEl = document.getElementById('ytdlQueueCount');
  if (!body) return;

  const active = extQueue.filter(q => (q.status !== 'done' && q.status !== 'skipped') || Date.now() - (q._doneTime || 0) < 30000);
  if (countEl) countEl.textContent = extQueue.filter(q => q.status === 'waiting' || q.status === 'active').length;

  if (extQueue.length === 0) {
    body.innerHTML = '<p class="ytdl-queue-empty">File d\'attente vide.</p>';
    return;
  }

  const firstWaiting = extQueue.findIndex(x => x.status === 'waiting');
  const lastWaiting = extQueue.length - 1 - [...extQueue].reverse().findIndex(x => x.status === 'waiting');

  body.innerHTML = extQueue.map((q, i) => {
    const icons = { waiting: '⏳', active: '⬇', done: '✓', skipped: '✓', error: '✗' };
    const statusText = { waiting: 'En attente', active: q.message || 'En cours...', done: q.message || 'Termine', skipped: q.message || 'Deja en bibliotheque', error: q.message || 'Erreur' };
    const isWaiting = q.status === 'waiting';
    const isError = q.status === 'error';

    let buttons = '';
    if (q.status === 'active') {
      buttons += '<button class="ytdl-qi-btn ytdl-qi-skip" data-action="skip" data-idx="' + i + '" title="Passer">&#9654;&#9654;</button>';
    }
    if (isWaiting) {
      if (i > firstWaiting) buttons += '<button class="ytdl-qi-btn ytdl-qi-up" data-action="move-up" data-idx="' + i + '" title="Monter">&#9650;</button>';
      if (i < lastWaiting) buttons += '<button class="ytdl-qi-btn ytdl-qi-down" data-action="move-down" data-idx="' + i + '" title="Descendre">&#9660;</button>';
      buttons += '<button class="ytdl-qi-remove" data-action="remove" data-idx="' + i + '">&times;</button>';
    }
    if (isError) {
      buttons += '<button class="ytdl-qi-btn ytdl-qi-retry" data-action="retry" data-idx="' + i + '" title="Relancer">&#8635;</button>';
      buttons += '<button class="ytdl-qi-remove" data-action="remove" data-idx="' + i + '">&times;</button>';
    }

    return '<div class="ytdl-queue-item ' + q.status + '">'
      + '<span class="ytdl-qi-icon">' + icons[q.status] + '</span>'
      + '<div class="ytdl-qi-info">'
      + '<div class="ytdl-qi-title">' + q.title + '</div>'
      + '<div class="ytdl-qi-meta">'
      + '<span>' + statusText[q.status] + '</span>'
      + (q.format ? '<span>' + q.format.toUpperCase() + '</span>' : '')
      + (q.status === 'active' && q.percent > 0 ? '<span>' + q.percent + '%</span>' : '')
      + '</div>'
      + (q.status === 'active' ? '<div class="ytdl-qi-progress"><div class="ytdl-qi-progress-fill" style="width:' + Math.max(q.percent, 2) + '%"></div></div>' : '')
      + (q.status === 'done' ? '<div class="ytdl-qi-progress"><div class="ytdl-qi-progress-fill" style="width:100%"></div></div>' : '')
      + (q.status === 'error' ? '<div class="ytdl-qi-progress"><div class="ytdl-qi-progress-fill" style="width:100%"></div></div>' : '')
      + '</div>'
      + '<div class="ytdl-qi-actions">' + buttons + '</div>'
      + '</div>';
  }).join('');
}

function updateQueueBadge() {
  const badge = document.getElementById('ytdlQueueBadge');
  if (!badge) return;
  const count = extQueue.filter(q => q.status === 'waiting' || q.status === 'active').length;
  badge.textContent = count > 0 ? count : '';
  badge.classList.toggle('active', count > 0);
}

function saveExtQueue() {
  if (!chromeOk()) return;
  try {
    chrome.storage.local.set({ extQueue: extQueue.map(q => ({
      url: q.url, title: q.title, status: q.status, jobId: q.jobId,
      percent: q.percent, message: q.message, format: q.format, type: q.type,
      folder: q.folder || ''
    }))});
  } catch (e) {}
  // Sync avec le serveur
  syncQueueToServer();
}

function syncQueueToServer() {
  extQueue.forEach(q => {
    if (q.status === 'active' || q.status === 'done' || q.status === 'error' || q.status === 'skipped') {
      fetch(API + '/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update', url: q.url, status: q.status,
          percent: q.percent || 0, message: q.message || '',
          jobId: q.jobId || '', title: q.title || ''
        })
      }).catch(() => {});
    }
  });
}

function restoreExtQueue() {
  if (!chromeOk()) return;
  try {
    chrome.storage.local.get(['extQueue'], (data) => {
      if (chrome.runtime.lastError) return;
      if (!data.extQueue || !data.extQueue.length) return;
      extQueue = data.extQueue;
      renderExtQueue();
      updateQueueBadge();

      // Reprendre le polling des actifs
      extQueue.forEach(q => {
        if (q.status === 'active' && q.jobId) {
          resumeExtQueueItem(q);
        }
      });

      // Relancer pour les waiting
      if (extQueue.some(q => q.status === 'waiting') && !extQueueProcessing) {
        processExtQueue();
      }
    });
  } catch (e) {}
}

async function resumeExtQueueItem(item) {
  const prefs = await getPrefs();
  let pollErrors = 0;
  let lastMessage = '';
  let lastPercent = -1;
  let lastActivityTime = Date.now();
  const STALL_TIMEOUT = 300000;
  const poll = setInterval(async () => {
    if (Date.now() - lastActivityTime > STALL_TIMEOUT) {
      clearInterval(poll);
      item.status = 'error';
      item.message = 'Bloque (aucune activite depuis 5 min)';
      renderExtQueue(); saveExtQueue(); updateQueueBadge();
      return;
    }
    try {
      const resp = await fetch(API + '/progress?id=' + item.jobId, { signal: AbortSignal.timeout(5000) });
      const data = await resp.json();
      pollErrors = 0;
      const curMsg = data.message || '';
      const curPct = data.percent || 0;
      if (curPct !== lastPercent || curMsg !== lastMessage || data.status === 'done' || data.status === 'error') {
        lastPercent = curPct;
        lastMessage = curMsg;
        lastActivityTime = Date.now();
      }
      if (data.status === 'done') {
        clearInterval(poll);
        item.status = 'done';
        item.percent = 100;
        item.message = 'Termine';
        try {
          const infoResp = await fetch(API + '/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'url=' + encodeURIComponent(item.url)
          });
          const info = await infoResp.json();
          if (info.success) {
            await addToLibrary(data, info, item.type || prefs.type, item.format || prefs.format, item.url, item.folder || '');
            notify(info.title);
          }
        } catch (e) {}
        if (item.url === window.location.href) markAsDownloaded();
        renderExtQueue();
        saveExtQueue();
        updateQueueBadge();
      } else if (data.status === 'error') {
        clearInterval(poll);
        item.status = 'error';
        item.message = data.message || 'Erreur';
        renderExtQueue();
        saveExtQueue();
        updateQueueBadge();
      } else {
        item.percent = data.percent || 0;
        item.message = data.message || '';
        renderExtQueue();
      }
    } catch (e) {
      pollErrors++;
      if (pollErrors >= 10) {
        clearInterval(poll);
        item.status = 'error';
        item.message = 'Connexion perdue';
        renderExtQueue(); saveExtQueue(); updateQueueBadge();
      }
    }
  }, 1000);
}

// Listener delegue pour les actions queue
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const panel = btn.closest('#ytdl-queue-panel');
  if (!panel) return;

  const action = btn.dataset.action;
  const idx = parseInt(btn.dataset.idx);
  if (isNaN(idx)) return;

  if (action === 'remove') {
    if (extQueue[idx] && extQueue[idx].status !== 'active') {
      const url = extQueue[idx].url;
      extQueue.splice(idx, 1);
      renderExtQueue();
      saveExtQueue();
      updateQueueBadge();
      // Supprimer du serveur
      fetch(API + '/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', url: url })
      }).catch(() => {});
    }
  } else if (action === 'move-up') {
    if (idx > 0 && extQueue[idx] && extQueue[idx].status === 'waiting') {
      const temp = extQueue[idx];
      extQueue[idx] = extQueue[idx - 1];
      extQueue[idx - 1] = temp;
      renderExtQueue();
      saveExtQueue();
    }
  } else if (action === 'move-down') {
    if (idx < extQueue.length - 1 && extQueue[idx] && extQueue[idx].status === 'waiting') {
      const temp = extQueue[idx];
      extQueue[idx] = extQueue[idx + 1];
      extQueue[idx + 1] = temp;
      renderExtQueue();
      saveExtQueue();
    }
  } else if (action === 'retry') {
    if (extQueue[idx] && extQueue[idx].status === 'error') {
      extQueue[idx].status = 'waiting';
      extQueue[idx].jobId = null;
      extQueue[idx].percent = 0;
      extQueue[idx].message = '';
      renderExtQueue();
      saveExtQueue();
      updateQueueBadge();
      if (!extQueueProcessing) processExtQueue();
    }
  } else if (action === 'skip') {
    if (extQueue[idx] && extQueue[idx].status === 'active') {
      extQueue[idx]._skipped = true;
      extQueue[idx].status = 'error';
      extQueue[idx].message = 'Passe';
      addLog('skip', extQueue[idx].title, 'Passe manuellement');
      renderExtQueue();
      saveExtQueue();
      updateQueueBadge();
    }
  }
});

// Poll serveur pour synchro avec le web (statuts, ajouts, suppressions)
setInterval(async () => {
  try {
    const resp = await fetch(API + '/queue?action=list', { signal: AbortSignal.timeout(3000) });
    const data = await resp.json();
    if (!data.success || !data.queue) return;

    const serverUrls = data.queue.map(q => q.url);
    let changed = false;

    // 1. Mettre a jour les statuts des elements existants (traites par le web)
    extQueue.forEach(local => {
      const server = data.queue.find(q => q.url === local.url);
      if (server && server.source === 'web') {
        // Le web a change le statut
        if (server.status !== local.status) {
          if (server.status === 'done') {
            local.status = 'done';
            local.percent = 100;
            local.message = server.message || 'Termine (web)';
            addLog('success', local.title, 'Telecharge par le web');
            changed = true;
          } else if (server.status === 'skipped') {
            local.status = 'skipped';
            local.percent = 100;
            local.message = server.message || 'Deja en bibliotheque';
            addLog('skip', local.title, 'Deja en bibliotheque');
            changed = true;
          } else if (server.status === 'error') {
            local.status = 'error';
            local.message = server.message || 'Erreur (web)';
            addLog('error', local.title, server.message || 'Erreur');
            changed = true;
          } else if (server.status === 'active' && local.status === 'waiting') {
            local.status = 'active';
            local.percent = server.percent || 0;
            local.message = server.message || 'En cours (web)';
            changed = true;
          }
        }
        // Mettre a jour la progression si actif
        if (server.status === 'active' && server.percent > local.percent) {
          local.percent = server.percent;
          local.message = server.message || '';
          changed = true;
        }
      }
    });

    // 2. Supprimer les elements locaux absents du serveur (supprimes par le web)
    const before = extQueue.length;
    extQueue = extQueue.filter(q => {
      if (q.status === 'active' && !q._skipped) return true;
      if (serverUrls.includes(q.url)) return true;
      // Disparu du serveur — notifier
      if (q.status === 'waiting') addLog('skip', q.title, 'Retire par le web');
      return false;
    });
    if (extQueue.length !== before) changed = true;

    // 3. Ajouter les elements du serveur absents localement (ajoutes par le web)
    data.queue.forEach(sq => {
      if ((sq.status === 'waiting' || sq.status === 'active') && !extQueue.some(q => q.url === sq.url)) {
        extQueue.push({
          url: sq.url, title: sq.title || sq.url, status: sq.status,
          jobId: sq.jobId || null, percent: sq.percent || 0,
          message: sq.message || '',
          format: sq.format || 'mp3', type: sq.type || 'audio',
          folder: sq.folder || ''
        });
        changed = true;
      }
    });

    if (changed) {
      renderExtQueue();
      saveExtQueue();
      updateQueueBadge();
      if (extQueue.some(q => q.status === 'waiting') && !extQueueProcessing) {
        processExtQueue();
      }
    }
  } catch (e) {}
}, 3000);

// ========== NOTIFICATION LOG ==========
let logEntries = [];

function createLogPanel() {
  if (document.getElementById('ytdl-log-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'ytdl-log-panel';
  panel.innerHTML = `
    <div class="ytdl-log-header">
      <span>Notifications</span>
      <div>
        <button class="ytdl-log-clear" id="ytdlLogClear">Vider</button>
        <button class="ytdl-log-close" id="ytdlLogClose">&times;</button>
      </div>
    </div>
    <div class="ytdl-log-body" id="ytdlLogBody">
      <p class="ytdl-log-empty">Aucune notification.</p>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById('ytdlLogClose').addEventListener('click', () => panel.classList.remove('active'));
  document.getElementById('ytdlLogClear').addEventListener('click', () => {
    logEntries = [];
    renderLog();
    updateLogBadge();
    fetch(API + '/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear' })
    }).catch(() => {});
  });
}

function createLogToggle() {
  if (document.getElementById('ytdl-btn-log')) return;
  const bar = document.getElementById('ytdl-bar');
  if (!bar) return;

  const btn = document.createElement('button');
  btn.id = 'ytdl-btn-log';
  btn.className = 'ytdl-fab ytdl-fab-log';
  btn.title = 'Notifications';
  btn.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg><span class="ytdl-log-badge" id="ytdlLogBadge"></span>';
  btn.addEventListener('click', () => {
    const panel = document.getElementById('ytdl-log-panel');
    if (panel) panel.classList.toggle('active');
  });
  bar.appendChild(btn);
}

function addLog(type, title, detail) {
  // Ajout local immediat
  logEntries.unshift({
    type, title, detail,
    time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  });
  if (logEntries.length > 100) logEntries.pop();
  renderLog();
  updateLogBadge();
  // Envoyer au serveur
  fetch(API + '/notifications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'add', type, title, detail, source: 'extension' })
  }).catch(() => {});
}

function renderLog() {
  const body = document.getElementById('ytdlLogBody');
  if (!body) return;
  if (logEntries.length === 0) {
    body.innerHTML = '<p class="ytdl-log-empty">Aucune notification.</p>';
    return;
  }
  body.innerHTML = logEntries.map(e => {
    const icons = { skip: '⏭', success: '✓', error: '✗' };
    const cls = { skip: 'skip', success: 'ok', error: 'err' };
    const src = e.source === 'web' ? ' (web)' : '';
    return `<div class="ytdl-log-item ytdl-log-${cls[e.type] || 'skip'}">
      <span class="ytdl-log-icon">${icons[e.type] || '•'}</span>
      <div class="ytdl-log-content">
        <div class="ytdl-log-title">${e.title}</div>
        <div class="ytdl-log-detail">${e.detail}${src}</div>
      </div>
      <span class="ytdl-log-time">${e.time}</span>
    </div>`;
  }).join('');
}

function updateLogBadge() {
  const badge = document.getElementById('ytdlLogBadge');
  if (!badge) return;
  const count = logEntries.length;
  badge.textContent = count > 0 ? count : '';
  badge.classList.toggle('active', count > 0);
}

// Poll notifications serveur toutes les 3 secondes
setInterval(async () => {
  try {
    const resp = await fetch(API + '/notifications?action=list', { signal: AbortSignal.timeout(3000) });
    const data = await resp.json();
    if (!data.success || !data.notifications) return;
    logEntries = data.notifications.map(n => ({
      type: n.type, title: n.title, detail: n.detail,
      time: n.time, source: n.source
    }));
    renderLog();
    updateLogBadge();
  } catch (e) {}
}, 3000);

async function checkUrlExists(url, format) {
  try {
    let checkUrl = API + '/library?action=check_url&url=' + encodeURIComponent(url);
    if (format) checkUrl += '&format=' + encodeURIComponent(format);
    const resp = await fetch(checkUrl, { signal: AbortSignal.timeout(2000) });
    const data = await resp.json();
    return data.exists === true;
  } catch (e) { return false; }
}

// ========== PLAYLIST DETECTION ==========
function scrapePlaylistVideos() {
  const videos = new Map(); // videoId -> {url, title, duration, durationSec}

  // Fonction pour parser la duree texte en secondes
  function parseDuration(text) {
    if (!text) return 0;
    text = text.trim();
    const parts = text.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 1) return parts[0];
    return 0;
  }

  // Videos dans la sidebar playlist (page watch avec playlist)
  document.querySelectorAll('ytd-playlist-panel-video-renderer').forEach(el => {
    const a = el.querySelector('a#wc-endpoint');
    const titleEl = el.querySelector('#video-title');
    const timeEl = el.querySelector('ytd-thumbnail-overlay-time-status-renderer span, #overlays span.ytd-thumbnail-overlay-time-status-renderer');
    if (a && a.href) {
      const match = a.href.match(/[?&]v=([^&]+)/);
      if (match) {
        const dur = timeEl ? timeEl.textContent.trim() : '';
        videos.set(match[1], {
          url: 'https://www.youtube.com/watch?v=' + match[1],
          title: titleEl ? titleEl.textContent.trim() : '',
          duration: dur,
          durationSec: parseDuration(dur)
        });
      }
    }
  });

  // Page playlist (/playlist?list=)
  document.querySelectorAll('ytd-playlist-video-renderer').forEach(el => {
    const a = el.querySelector('a#video-title');
    const timeEl = el.querySelector('#overlays ytd-thumbnail-overlay-time-status-renderer span, span.ytd-thumbnail-overlay-time-status-renderer');
    if (a && a.href) {
      const match = a.href.match(/[?&]v=([^&]+)/);
      if (match && !videos.has(match[1])) {
        const dur = timeEl ? timeEl.textContent.trim() : '';
        videos.set(match[1], {
          url: 'https://www.youtube.com/watch?v=' + match[1],
          title: a.textContent.trim(),
          duration: dur,
          durationSec: parseDuration(dur)
        });
      }
    }
  });

  return [...videos.values()];
}

function scrapePlaylistLinks() {
  return scrapePlaylistVideos().map(v => v.url);
}

let playlistScrollWatcher = null;

function createPlaylistBanner() {
  if (document.getElementById('ytdl-playlist-banner')) return;

  const allVideos = scrapePlaylistVideos();
  if (allVideos.length < 2) return;

  const banner = document.createElement('div');
  banner.id = 'ytdl-playlist-banner';
  banner.innerHTML = `
    <div class="ytdl-pb-top" id="ytdlPbToggle">
      <div class="ytdl-pb-left">
        <span class="ytdl-pb-icon">${DL_ICON}</span>
        <span class="ytdl-pb-text"><strong id="ytdlPbCount">${allVideos.length}</strong> videos detectees</span>
        <span class="ytdl-pb-arrow" id="ytdlPbArrow">&#9660;</span>
      </div>
      <div class="ytdl-pb-right">
        <button id="ytdl-pb-btn" class="ytdl-pb-dl" onclick="event.stopPropagation()">Tout telecharger</button>
        <button id="ytdl-pb-close" class="ytdl-pb-close" onclick="event.stopPropagation()">&times;</button>
      </div>
    </div>
    <div class="ytdl-pb-body">
      <div class="ytdl-pb-filters">
        <label class="ytdl-pb-filter-check">
          <input type="checkbox" id="ytdlPbFilterOn"> Filtrer par duree
        </label>
        <div class="ytdl-pb-filter-range" id="ytdlPbFilterRange" style="display:none;">
          <div class="ytdl-pb-filter-field">
            <span>Min</span>
            <input type="number" id="ytdlPbMin" value="0" min="0" step="1" placeholder="0"> min
          </div>
          <div class="ytdl-pb-filter-field">
            <span>Max</span>
            <input type="number" id="ytdlPbMax" value="60" min="0" step="1" placeholder="60"> min
          </div>
          <span class="ytdl-pb-filter-result" id="ytdlPbFilterResult"></span>
        </div>
      </div>
      <div class="ytdl-pb-progress" id="ytdlPbProgress" style="display:none;">
        <div class="ytdl-pb-bars">
          <div class="ytdl-pb-bar-group">
            <span class="ytdl-pb-label" id="ytdlPbCurrent">-</span>
            <div class="ytdl-pb-bar-bg"><div class="ytdl-pb-bar-fill" id="ytdlPbBarCurrent"></div></div>
          </div>
          <div class="ytdl-pb-bar-group">
            <span class="ytdl-pb-label" id="ytdlPbTotal">Total : 0 / 0</span>
            <div class="ytdl-pb-bar-bg ytdl-pb-bar-total"><div class="ytdl-pb-bar-fill" id="ytdlPbBarTotal"></div></div>
          </div>
        </div>
        <span class="ytdl-pb-status" id="ytdlPbStatus"></span>
      </div>
    </div>
  `;
  document.body.appendChild(banner);

  document.getElementById('ytdlPbToggle').addEventListener('click', () => {
    banner.classList.toggle('open');
  });
  document.getElementById('ytdl-pb-close').addEventListener('click', () => {
    banner.style.display = 'none';
    const tab = document.getElementById('ytdl-pb-tab');
    if (tab) tab.style.display = '';
  });

  // Bandeau masque par defaut, onglet visible
  banner.style.display = 'none';
  showPlaylistTab();
  document.getElementById('ytdl-pb-btn').addEventListener('click', () => {
    banner.classList.add('open'); // Ouvrir pour voir la progression
    const filtered = getFilteredVideos();
    downloadPlaylist(filtered.map(v => v.url));
  });

  // Filtre duree toggle
  document.getElementById('ytdlPbFilterOn').addEventListener('change', (e) => {
    document.getElementById('ytdlPbFilterRange').style.display = e.target.checked ? 'flex' : 'none';
    updateFilterCount();
  });
  document.getElementById('ytdlPbMin').addEventListener('input', updateFilterCount);
  document.getElementById('ytdlPbMax').addEventListener('input', updateFilterCount);

  // Charger la playlist complete via l'API (yt-dlp recupere tout)
  loadFullPlaylist();
}

let fullPlaylistVideos = null;

async function loadFullPlaylist() {
  const url = window.location.href;
  // Extraire l'URL playlist
  const listMatch = url.match(/[?&]list=([^&]+)/);
  if (!listMatch) return;

  const countEl = document.getElementById('ytdlPbCount');
  const tabEl = document.getElementById('ytdl-pb-tab');
  if (countEl) countEl.textContent = countEl.textContent + ' (chargement...)';

  try {
    const resp = await fetch(API + '/playlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'url=' + encodeURIComponent('https://www.youtube.com/playlist?list=' + listMatch[1])
    });
    const data = await resp.json();

    if (data.success && data.videos.length > 0) {
      // Convertir au meme format que scrapePlaylistVideos
      fullPlaylistVideos = data.videos.map(v => ({
        url: v.url,
        title: v.title,
        duration: v.duration,
        durationSec: parseDurationText(v.duration)
      }));

      if (countEl) countEl.textContent = fullPlaylistVideos.length;
      if (tabEl) {
        const span = tabEl.querySelector('span');
        if (span) span.textContent = 'Playlist (' + fullPlaylistVideos.length + ')';
      }
      updateFilterCount();
    }
  } catch (e) {
    // Fallback: garder le scraping DOM
    if (countEl) countEl.textContent = countEl.textContent.replace(' (chargement...)', '');
  }
}

function parseDurationText(text) {
  if (!text) return 0;
  text = text.trim();
  const parts = text.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return 0;
}

function showPlaylistTab() {
  if (document.getElementById('ytdl-pb-tab')) return;

  const banner = document.getElementById('ytdl-playlist-banner');
  if (!banner) return;

  const count = document.getElementById('ytdlPbCount');
  const nb = count ? count.textContent : '?';

  const tab = document.createElement('button');
  tab.id = 'ytdl-pb-tab';
  tab.innerHTML = DL_ICON + ' <span>Playlist (' + nb + ')</span>';
  tab.addEventListener('click', () => {
    const b = document.getElementById('ytdl-playlist-banner');
    if (b) {
      const visible = b.style.display !== 'none';
      b.style.display = visible ? 'none' : '';
    }
  });
  document.body.appendChild(tab);
}

function getFilteredVideos() {
  const all = fullPlaylistVideos || scrapePlaylistVideos();
  const filterOn = document.getElementById('ytdlPbFilterOn')?.checked;
  if (!filterOn) return all;

  const minMin = parseInt(document.getElementById('ytdlPbMin')?.value) || 0;
  const maxMin = parseInt(document.getElementById('ytdlPbMax')?.value) || 9999;
  const minSec = minMin * 60;
  const maxSec = maxMin * 60;

  return all.filter(v => {
    if (v.durationSec === 0) return true; // pas de duree connue → inclure
    return v.durationSec >= minSec && v.durationSec <= maxSec;
  });
}

function updateFilterCount() {
  const resultEl = document.getElementById('ytdlPbFilterResult');
  if (!resultEl) return;
  const filterOn = document.getElementById('ytdlPbFilterOn')?.checked;
  if (!filterOn) { resultEl.textContent = ''; return; }

  const all = fullPlaylistVideos || scrapePlaylistVideos();
  const filtered = getFilteredVideos();
  resultEl.textContent = filtered.length + ' / ' + all.length + ' videos';

  const btn = document.getElementById('ytdl-pb-btn');
  if (btn && !btn.disabled) {
    btn.textContent = 'Telecharger ' + filtered.length + ' videos';
  }
}

async function downloadPlaylist(urls) {
  const btn = document.getElementById('ytdl-pb-btn');
  const allVideos = fullPlaylistVideos || scrapePlaylistVideos();

  // Recuperer le nom de la playlist
  const playlistName = document.querySelector('yt-formatted-string.ytd-playlist-panel-renderer')?.textContent?.trim()
    || document.querySelector('#header-description h3')?.textContent?.trim()
    || document.querySelector('yt-dynamic-sizing-formatted-string#title')?.textContent?.trim()
    || document.querySelector('#title a.yt-simple-endpoint')?.textContent?.trim()
    || 'Playlist';

  // Creer le dossier dans la bibliotheque
  let folderId = '';
  try {
    const folderResp = await fetch(API + '/library', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'action=create_folder&name=' + encodeURIComponent(playlistName)
    });
    const folderData = await folderResp.json();
    if (folderData.success && folderData.folder) {
      folderId = folderData.folder.id;
    }
  } catch (e) {}

  // Ajouter toutes les videos a la queue
  const prefs = await getPrefs();
  let added = 0;
  const batch = [];
  for (const url of urls) {
    const video = allVideos.find(v => v.url === url);
    const title = video ? video.title : url;
    if (!extQueue.some(q => q.url === url && q.status !== 'done' && q.status !== 'error')) {
      extQueue.push({
        url, title, status: 'waiting',
        jobId: null, percent: 0, message: '',
        format: prefs.format, type: prefs.type,
        folder: folderId
      });
      batch.push({ url, title, type: prefs.type, format: prefs.format, quality: prefs.quality, folder: folderId });
      added++;
    }
  }

  if (added > 0) {
    renderExtQueue();
    saveExtQueue();
    updateQueueBadge();
    // Envoyer tout au serveur en une requete
    fetch(API + '/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add_batch', source: 'extension', items: batch })
    }).catch(() => {});
    if (!extQueueProcessing) processExtQueue();
  }

  // Ouvrir le panneau queue
  const qp = document.getElementById('ytdl-queue-panel');
  if (qp) qp.classList.add('active');

  btn.textContent = added + ' videos ajoutees a la queue';
  btn.classList.add('done');
  setTimeout(() => {
    btn.disabled = false;
    btn.textContent = 'Tout telecharger';
    btn.classList.remove('done');
  }, 3000);
}

function formatPlaylistStats(errors, skipped) {
  let s = '';
  if (skipped) s += ' (' + skipped + ' ignores)';
  if (errors) s += ' (' + errors + ' erreurs)';
  return s;
}

async function getCurrentUser() {
  try {
    const resp = await fetch(API + '/profile?action=list', { signal: AbortSignal.timeout(2000) });
    const data = await resp.json();
    // Pas ideal mais on prend le dernier profil actif
    if (data.success && data.profiles.length > 0) return data.profiles[0].username;
  } catch (e) {}
  return null;
}

// ========== INIT & NAVIGATION ==========
function initOnVideoPage() {
  cachedInfo = null;
  fullPlaylistVideos = null;
  createButtons();
  createPanel();
  createQueuePanel();
  createQueueToggle();
  createLogPanel();
  createLogToggle();
  restoreExtQueue();

  const status = document.getElementById('ytdlStatus');
  if (status) status.className = 'ytdl-status';
  const progressZone = document.getElementById('ytdlProgressZone');
  if (progressZone) progressZone.classList.remove('active');
  const infoDiv = document.getElementById('ytdlVideoInfo');
  if (infoDiv) infoDiv.style.display = 'none';

  checkIfDownloaded(window.location.href);

  // Detecter playlist apres un delai (le sidebar met du temps a charger)
  setTimeout(createPlaylistBanner, 2000);
}

function initOnPlaylistPage() {
  createPanel();
  // Retry pour attendre que les videos soient chargees
  let tries = 0;
  const tryBanner = () => {
    tries++;
    createPlaylistBanner();
    if (!document.getElementById('ytdl-playlist-banner') && tries < 10) {
      setTimeout(tryBanner, 1000);
    }
  };
  setTimeout(tryBanner, 1500);
}

function removeAll() {
  ['ytdl-bar', 'ytdl-panel', 'ytdl-queue-panel', 'ytdl-inline-btn', 'ytdl-playlist-banner', 'ytdl-log-panel', 'ytdl-pb-tab'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });
}

function isVideoPage() {
  return /youtube\.com\/watch|youtube\.com\/shorts\//.test(location.href);
}

function isPlaylistPage() {
  return /youtube\.com\/playlist\?list=/.test(location.href);
}

function ensureInit() {
  let attempts = 0;
  const tryInit = () => {
    attempts++;
    if (isPlaylistPage()) {
      initOnPlaylistPage();
      return;
    }
    if (!isVideoPage()) { removeAll(); return; }
    if (document.getElementById('ytdl-bar')) return;
    if (document.body) initOnVideoPage();
    if (!document.getElementById('ytdl-bar') && attempts < 15) {
      setTimeout(tryInit, 500);
    }
  };
  tryInit();
}

let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    removeAll();
    if (isVideoPage() || isPlaylistPage()) ensureInit();
  }
});

if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

if (isVideoPage() || isPlaylistPage()) {
  if (document.body) ensureInit();
  document.addEventListener('DOMContentLoaded', ensureInit);
  setTimeout(ensureInit, 500);
  setTimeout(ensureInit, 2000);
}

window.addEventListener('yt-navigate-finish', () => {
  removeAll();
  if (isVideoPage() || isPlaylistPage()) ensureInit();
});

window.addEventListener('popstate', () => {
  setTimeout(() => { removeAll(); if (isVideoPage() || isPlaylistPage()) ensureInit(); }, 300);
});
