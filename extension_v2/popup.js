let API = 'http://127.0.0.1:3000/api';

// Test auto : essayer 127.0.0.1, sinon localhost
(async () => {
  try {
    const r = await fetch('http://127.0.0.1:3000/api/system?action=info');
    if (r.ok) { API = 'http://127.0.0.1:3000/api'; return; }
  } catch (e) {}
  try {
    const r = await fetch('http://localhost:3000/api/system?action=info');
    if (r.ok) { API = 'http://localhost:3000/api'; return; }
  } catch (e) {}
})();

const audioFormats = [
  { value: 'mp3', label: 'MP3' }, { value: 'flac', label: 'FLAC' },
  { value: 'wav', label: 'WAV' }, { value: 'aac', label: 'AAC' }, { value: 'ogg', label: 'OGG' }
];
const audioQualities = [
  { value: '0', label: 'Meilleure' }, { value: '5', label: 'Moyenne' }, { value: '9', label: 'Basse' }
];
const videoFormats = [
  { value: 'mp4', label: 'MP4' }, { value: 'mkv', label: 'MKV' }, { value: 'webm', label: 'WEBM' }
];
const videoQualities = [
  { value: 'best', label: 'Meilleure' }, { value: '1080', label: '1080p' },
  { value: '720', label: '720p' }, { value: '480', label: '480p' }, { value: '360', label: '360p' }
];

const formatSel = document.getElementById('format');
const qualitySel = document.getElementById('quality');
const urlBox = document.getElementById('urlBox');
const status = document.getElementById('status');
const btnDl = document.getElementById('btnDl');
const btnQueue = document.getElementById('btnQueue');
const btnFlow = document.getElementById('btnFlow');
const flowPlaylistSel = document.getElementById('flowPlaylist');
const flowNewBtn = document.getElementById('flowNewBtn');
const flowNewRow = document.getElementById('flowNewRow');
const flowNewName = document.getElementById('flowNewName');
const flowCreateBtn = document.getElementById('flowCreateBtn');
let currentUrl = '';

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  if (tab && tab.url && tab.url.match(/youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\//)) {
    currentUrl = tab.url;
    urlBox.textContent = tab.title || tab.url;
    urlBox.classList.add('active');
    btnDl.disabled = false;
    btnQueue.disabled = false;
    btnFlow.disabled = false;
  }
});

function updateOptions() {
  const type = document.querySelector('input[name="type"]:checked').value;
  const formats = type === 'audio' ? audioFormats : videoFormats;
  const qualities = type === 'audio' ? audioQualities : videoQualities;
  formatSel.innerHTML = formats.map(f => '<option value="' + f.value + '">' + f.label + '</option>').join('');
  qualitySel.innerHTML = qualities.map(q => '<option value="' + q.value + '">' + q.label + '</option>').join('');
}
document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', updateOptions));
updateOptions();

chrome.storage.local.get(['type', 'format', 'quality', 'cover'], (data) => {
  if (data.type === 'video') document.getElementById('tVideo').checked = true;
  updateOptions();
  if (data.format) formatSel.value = data.format;
  if (data.quality) qualitySel.value = data.quality;
  if (data.cover) document.getElementById('cover').checked = true;
});

function savePrefs() {
  chrome.storage.local.set({
    type: document.querySelector('input[name="type"]:checked').value,
    format: formatSel.value, quality: qualitySel.value,
    cover: document.getElementById('cover').checked
  });
}

function showStatus(msg, cls) {
  status.textContent = msg;
  status.className = 'status ' + cls;
}

// ========== TELECHARGEMENT ==========
async function sendDownload(url, action) {
  const type = document.querySelector('input[name="type"]:checked').value;
  const format = formatSel.value;
  const quality = qualitySel.value;
  const cover = document.getElementById('cover').checked ? '1' : '0';
  savePrefs();
  btnDl.disabled = true; btnQueue.disabled = true;
  showStatus(action === 'queue' ? 'Ajout a la file...' : 'Lancement...', 'wait');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const test = await fetch(API + '/system?action=info', { signal: controller.signal });
    clearTimeout(timer);
    if (!test.ok) throw new Error('Serveur inaccessible');

    const infoResp = await fetch(API + '/info', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'url=' + encodeURIComponent(url)
    });
    const info = await infoResp.json();
    if (!info.success) { showStatus('Erreur: ' + info.error, 'err'); return; }

    const dlResp = await fetch(API + '/download', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'url=' + encodeURIComponent(url) + '&type=' + type + '&format=' + format
        + '&quality=' + quality + '&cover=' + cover
    });
    const dlData = await dlResp.json();
    if (!dlData.success) { showStatus('Erreur: ' + dlData.error, 'err'); return; }

    pollAndAdd(dlData.jobId, info, type, format, cover);
    showStatus((action === 'queue' ? 'En file: ' : 'Lance: ') + info.title, 'ok');
  } catch (err) {
    showStatus('Erreur: ' + err.message, 'err');
  } finally {
    btnDl.disabled = !currentUrl; btnQueue.disabled = !currentUrl;
  }
}

async function pollAndAdd(jobId, info, type, format, cover) {
  const poll = setInterval(async () => {
    try {
      const resp = await fetch(API + '/progress?id=' + jobId);
      const data = await resp.json();
      if (data.status === 'done') {
        clearInterval(poll);
        await fetch(API + '/library', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'action=add_item&file=' + encodeURIComponent(data.file)
            + '&title=' + encodeURIComponent(info.title)
            + '&type=' + type + '&format=' + format
            + '&folder=&thumbnail=' + encodeURIComponent(info.thumbnail)
            + '&channel=' + encodeURIComponent(info.channel)
            + '&duration=' + encodeURIComponent(info.duration)
            + '&cover=' + encodeURIComponent(data.cover || '')
        });
        await fetch(API + '/history', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'action=add&title=' + encodeURIComponent(info.title) + '&status=success'
            + '&format=' + format + '&type=' + type + '&url=' + encodeURIComponent(currentUrl)
            + '&thumbnail=' + encodeURIComponent(info.thumbnail || '')
            + '&channel=' + encodeURIComponent(info.channel || '')
        });
        showStatus('Termine : ' + info.title, 'ok');
      } else if (data.status === 'error') {
        clearInterval(poll);
        showStatus('Echec : ' + (data.message || ''), 'err');
      }
    } catch (e) { clearInterval(poll); }
  }, 2000);
}

// ========== MON FLOW ==========
async function loadFlowPlaylists() {
  try {
    const resp = await fetch(API + '/flow?action=list');
    const data = await resp.json();
    if (!data.success) return;
    const playlists = data.playlists || [];
    const trackPls = [...new Set((data.tracks || []).map(t => t.playlist).filter(Boolean))];
    const allPls = [...new Set([...playlists.map(p => p.name), ...trackPls])];

    flowPlaylistSel.innerHTML = '<option value="">Sans playlist</option>'
      + allPls.map(p => '<option value="' + p + '">' + p + '</option>').join('');
  } catch (e) {}
}
loadFlowPlaylists();

flowNewBtn.addEventListener('click', () => {
  flowNewRow.style.display = flowNewRow.style.display === 'none' ? 'flex' : 'none';
  if (flowNewRow.style.display === 'flex') flowNewName.focus();
});

flowCreateBtn.addEventListener('click', async () => {
  const name = flowNewName.value.trim();
  if (!name) return;
  try {
    await fetch(API + '/flow', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'action=create_playlist&name=' + encodeURIComponent(name)
    });
    flowNewName.value = '';
    flowNewRow.style.display = 'none';
    await loadFlowPlaylists();
    flowPlaylistSel.value = name;
    showStatus('Playlist "' + name + '" creee !', 'ok');
  } catch (e) { showStatus('Erreur creation playlist', 'err'); }
});

flowNewName.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') flowCreateBtn.click();
});

async function addToFlow(url) {
  if (!url) return;
  btnFlow.disabled = true;
  btnFlow.textContent = 'Ajout en cours...';
  showStatus('Recuperation des infos...', 'wait');

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const test = await fetch(API + '/system?action=info', { signal: controller.signal });
    clearTimeout(timer);
    if (!test.ok) throw new Error('Serveur inaccessible');

    const infoResp = await fetch(API + '/info', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'url=' + encodeURIComponent(url)
    });
    const info = await infoResp.json();
    if (!info.success) { showStatus('Erreur: ' + info.error, 'err'); return; }

    const playlist = flowPlaylistSel.value;
    const flowResp = await fetch(API + '/flow', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'action=add&url=' + encodeURIComponent(url)
        + '&title=' + encodeURIComponent(info.title || '')
        + '&channel=' + encodeURIComponent(info.channel || '')
        + '&thumbnail=' + encodeURIComponent(info.thumbnail || '')
        + '&duration=' + encodeURIComponent(info.duration || '')
        + '&views=' + encodeURIComponent(info.views_display || '')
        + '&year=' + encodeURIComponent(info.year || '')
        + '&playlist=' + encodeURIComponent(playlist)
    });
    const flowData = await flowResp.json();

    if (flowData.duplicate) {
      showStatus('Deja dans Mon Flow : ' + info.title, 'wait');
      btnFlow.textContent = 'Deja dans Mon Flow';
    } else {
      const plLabel = playlist ? ' (' + playlist + ')' : '';
      showStatus('Ajoute a Mon Flow' + plLabel + ' : ' + info.title, 'ok');
      btnFlow.textContent = 'Ajoute !';
    }
  } catch (err) {
    showStatus('Erreur: ' + err.message, 'err');
  } finally {
    setTimeout(() => {
      btnFlow.textContent = '+ Ajouter a Mon Flow';
      btnFlow.disabled = !currentUrl;
    }, 3000);
  }
}

// ========== EVENTS ==========
btnDl.addEventListener('click', () => sendDownload(currentUrl, 'download'));
btnQueue.addEventListener('click', () => sendDownload(currentUrl, 'queue'));
btnFlow.addEventListener('click', () => addToFlow(currentUrl));
