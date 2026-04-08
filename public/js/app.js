// ========== LOGS TECHNIQUES ==========
const techLogs = [];
const MAX_LOGS = 200;
function logTech(level, msg, data) {
    const entry = { time: new Date().toISOString(), level, msg };
    if (data !== undefined) entry.data = typeof data === 'object' ? JSON.stringify(data) : String(data);
    techLogs.push(entry);
    if (techLogs.length > MAX_LOGS) techLogs.shift();
    console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log']('[YT-DL]', msg, data || '');
}
function copyLogs() {
    const text = techLogs.map(e => e.time + ' [' + e.level + '] ' + e.msg + (e.data ? ' | ' + e.data : '')).join('\n');
    navigator.clipboard.writeText(text).then(() => alert('Logs copies dans le presse-papier !')).catch(() => {
        const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
        alert('Logs copies !');
    });
}
function showLogsPanel() {
    const panel = document.getElementById('logsPanel');
    if (panel) { panel.style.display = panel.style.display === 'none' ? 'block' : 'none'; refreshLogsPanel(); return; }
}
function refreshLogsPanel() {
    const el = document.getElementById('logsContent');
    if (!el) return;
    el.textContent = techLogs.map(e => e.time.split('T')[1].split('.')[0] + ' [' + e.level + '] ' + e.msg + (e.data ? ' | ' + e.data : '')).join('\n');
    el.scrollTop = el.scrollHeight;
}

// ========== STATE ==========
let currentFolder = '';
let moveItemId = '';
let libraryData = { folders: [], items: [], stats: {} };

// ========== THEME ==========
function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'light';
    const theme = isDark ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : '');
    localStorage.setItem('yt_theme', theme);
    document.getElementById('themeIcon').textContent = theme === 'light' ? '\u263E' : '\u2600';
}
(function() {
    const saved = localStorage.getItem('yt_theme') || 'dark';
    if (saved === 'light') document.documentElement.setAttribute('data-theme', 'light');
    document.addEventListener('DOMContentLoaded', () => {
        const icon = document.getElementById('themeIcon');
        if (icon) icon.textContent = saved === 'light' ? '\u263E' : '\u2600';
    });
})();

// ========== NOTIFICATIONS ==========
function notifyDone(title) {
    if (localStorage.getItem('yt_notif_off') === '1') return;
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Telechargement termine', { body: title, icon: 'youtube.ico' });
    }
}
function toggleNotifications() {
    const off = localStorage.getItem('yt_notif_off') === '1';
    if (off) {
        localStorage.removeItem('yt_notif_off');
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    } else {
        localStorage.setItem('yt_notif_off', '1');
    }
    updateNotifToggle();
}
function updateNotifToggle() {
    const btn = document.getElementById('notifToggle');
    if (!btn) return;
    const off = localStorage.getItem('yt_notif_off') === '1';
    btn.textContent = off ? '🔕' : '🔔';
    btn.title = off ? 'Notifications desactivees' : 'Notifications activees';
}

// ========== TABS ==========
function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab-content#tab-' + tab).classList.add('active');
    // Trouver le bon onglet a activer dans la barre
    document.querySelectorAll('.tab').forEach(t => {
        const tabMap = { 'Telecharger': 'download', 'Recherche': 'search', 'Bibliotheque': 'library', 'Mon Flow': 'flow', 'Profil': 'profile' };
        if (tabMap[t.textContent] === tab) t.classList.add('active');
    });
    localStorage.setItem('yt_tab', tab);
    if (tab === 'flow') { loadFlow(); }
    if (tab === 'profile') { loadCacheStats(); }
    if (tab === 'library') { loadLibrary(); loadHistory(); loadSystemInfo(); }
}

// ========== FORMATS ==========
const audioFormats = {
    formats: [
        { value: 'mp3', label: 'MP3' }, { value: 'flac', label: 'FLAC' },
        { value: 'wav', label: 'WAV' }, { value: 'aac', label: 'AAC' }, { value: 'ogg', label: 'OGG' }
    ],
    qualities: [
        { value: '0', label: 'Meilleure qualite' }, { value: '5', label: 'Qualite moyenne' },
        { value: '9', label: 'Qualite basse' }
    ]
};
const videoFormats = {
    formats: [
        { value: 'mp4', label: 'MP4' }, { value: 'mkv', label: 'MKV' }, { value: 'webm', label: 'WEBM' }
    ],
    qualities: [
        { value: 'best', label: 'Meilleure qualite' }, { value: '1080', label: '1080p' },
        { value: '720', label: '720p' }, { value: '480', label: '480p' }, { value: '360', label: '360p' }
    ]
};

const formatSelect = document.getElementById('format');
const qualitySelect = document.getElementById('quality');

function updateOptions() {
    const type = document.querySelector('input[name="type"]:checked').value;
    const config = type === 'audio' ? audioFormats : videoFormats;
    formatSelect.innerHTML = config.formats.map(f => '<option value="'+f.value+'">'+f.label+'</option>').join('');
    qualitySelect.innerHTML = config.qualities.map(q => '<option value="'+q.value+'">'+q.label+'</option>').join('');
}

document.querySelectorAll('input[name="type"]').forEach(r => r.addEventListener('change', () => { updateOptions(); updateDlSummary(); }));
formatSelect.addEventListener('change', updateDlSummary);
qualitySelect.addEventListener('change', updateDlSummary);
updateOptions();

function toggleDlOptions() {
    const panel = document.getElementById('dlOptionsPanel');
    const arrow = document.getElementById('dlArrow');
    panel.classList.toggle('open');
    arrow.classList.toggle('open');
}

function updateDlSummary() {
    const type = document.querySelector('input[name="type"]:checked').value;
    const format = formatSelect.options[formatSelect.selectedIndex]?.text || '';
    const quality = qualitySelect.options[qualitySelect.selectedIndex]?.text || '';
    const summary = document.getElementById('dlSummary');
    if (summary) summary.textContent = format + ' — ' + quality + (type === 'video' ? ' (video)' : '');
}
setTimeout(updateDlSummary, 100);

// ========== DOWNLOAD ==========
let currentDlInterval = null;
let currentDlCancelled = false;

function cancelDownload() {
    if (currentDlInterval) {
        clearInterval(currentDlInterval);
        currentDlInterval = null;
    }
    currentDlCancelled = true;
    document.getElementById('progressText').textContent = 'Annule';
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('btnCancel').style.display = 'none';
    document.getElementById('result').innerHTML = '<div class="message error">Telechargement annule.</div>';
    document.getElementById('btn').disabled = false;
    document.getElementById('btn').textContent = 'Telecharger';
}

document.getElementById('dlForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const url = document.getElementById('url').value.trim();
    const btn = document.getElementById('btn');
    const videoCard = document.getElementById('videoCard');
    const progressZone = document.getElementById('progressZone');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');
    const result = document.getElementById('result');

    if (!url) return;

    const type = document.querySelector('input[name="type"]:checked').value;
    const format = formatSelect.value;
    const quality = qualitySelect.value;
    const saveCover = document.getElementById('saveCover').checked ? '1' : '0';
    const folder = document.getElementById('targetFolder').value;

    btn.disabled = true;
    btn.textContent = 'Chargement...';
    videoCard.classList.remove('active');
    progressZone.classList.remove('active');
    result.innerHTML = '';
    progressBar.style.width = '0%';
    currentDlCancelled = false;
    if (currentDlInterval) { clearInterval(currentDlInterval); currentDlInterval = null; }

    // Verifier si c'est une playlist
    if (url.includes('list=')) {
        const isPlaylist = await checkPlaylist(url);
        if (isPlaylist) { btn.disabled = false; btn.textContent = 'Telecharger'; return; }
    }

    progressZone.classList.add('active');
    progressText.textContent = 'Recuperation des infos...';
    progressBar.style.width = '5%';

    try {
        logTech('INFO', 'Recuperation infos', { url, type, format, quality });
        const infoResp = await fetch('api/info', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'url=' + encodeURIComponent(url)
        });
        const info = await infoResp.json();
        logTech(info.success ? 'INFO' : 'ERROR', 'Reponse /api/info', info.success ? { title: info.title } : { error: info.error });

        if (!info.success) {
            result.innerHTML = '<div class="message error">' + info.error + '</div>';
            reset(); return;
        }

        document.getElementById('thumb').src = info.thumbnail;
        document.getElementById('videoTitle').textContent = info.title;
        let metaText = info.channel + '  |  ' + info.duration;
        if (info.views_display) metaText += '  |  ' + info.views_display;
        if (info.year) metaText += '  |  ' + info.year;
        if (info.likes) metaText += '  |  \u25B2 ' + formatLikes(info.likes);
        document.getElementById('videoMeta').textContent = metaText;
        videoCard.classList.add('active');

        progressText.textContent = 'Lancement du telechargement...';
        progressBar.style.width = '10%';
        document.getElementById('btnCancel').style.display = 'block';

        startWithRetry(url, type, format, quality, saveCover, info, folder);

    } catch (err) {
        result.innerHTML = '<div class="message error">Erreur de connexion au serveur.</div>';
        reset();
    }

    async function startWithRetry(url, type, format, quality, saveCover, info, folder, attempt = 1) {
        const MAX_RETRIES = 2;

        if (attempt > 1) {
            progressText.textContent = 'Nouvelle tentative (' + attempt + '/' + (MAX_RETRIES + 1) + ')...';
            progressBar.style.width = '10%';
        }

        try {
            const dlResp = await fetch('api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'url=' + encodeURIComponent(url) + '&type=' + type + '&format=' + format
                    + '&quality=' + quality + '&cover=' + saveCover
            });
            const dlData = await dlResp.json();
            logTech(dlData.success ? 'INFO' : 'ERROR', 'Reponse /api/download', dlData);

            if (!dlData.success) {
                if (attempt <= MAX_RETRIES) {
                    setTimeout(() => startWithRetry(url, type, format, quality, saveCover, info, folder, attempt + 1), 1500);
                    return;
                }
                result.innerHTML = '<div class="message error">' + dlData.error + '</div>';
                reset(); return;
            }

            pollProgress(dlData.jobId, info, type, format, folder, saveCover, url, quality, attempt);
        } catch (err) {
            if (attempt <= MAX_RETRIES) {
                setTimeout(() => startWithRetry(url, type, format, quality, saveCover, info, folder, attempt + 1), 1500);
            } else {
                result.innerHTML = '<div class="message error">Erreur de connexion au serveur.</div>';
                reset();
            }
        }
    }

    function pollProgress(jobId, info, type, format, folder, saveCover, url, quality, attempt) {
        const MAX_RETRIES = 2;
        let lastMessage = '';
        let stallCount = 0;
        const STALL_LIMIT = 240;

        currentDlInterval = setInterval(async () => {
            if (currentDlCancelled) { clearInterval(currentDlInterval); currentDlInterval = null; return; }
            try {
                const resp = await fetch('api/progress?id=' + jobId);
                const data = await resp.json();

                if (data.status === 'done') {
                    logTech('INFO', 'Telechargement termine', { jobId, file: data.file });
                    clearInterval(currentDlInterval); currentDlInterval = null;
                    progressBar.style.width = '100%';
                    progressText.textContent = 'Termine !';
                    const ext = data.file.split('.').pop().toUpperCase();
                    const fileUrl = data.file.split('/').map(encodeURIComponent).join('/');
                    let html = '<div class="message success">' + info.title
                        + '<br><a class="dl-btn" href="' + fileUrl + '" download>Telecharger le ' + ext + '</a>';
                    if (data.cover) {
                        const coverUrl = data.cover.split('/').map(encodeURIComponent).join('/');
                        html += '<br><a class="dl-btn" style="background:#2196F3;margin-top:8px;" href="' + coverUrl + '" download>Telecharger la couverture</a>';
                    }
                    html += '</div>';
                    result.innerHTML = html;

                    // Ajouter a la bibliotheque
                    await fetch('api/library', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: 'action=add_item&file=' + encodeURIComponent(data.file)
                            + '&title=' + encodeURIComponent(info.title)
                            + '&type=' + type + '&format=' + format
                            + '&folder=' + encodeURIComponent(folder)
                            + '&thumbnail=' + encodeURIComponent(info.thumbnail)
                            + '&channel=' + encodeURIComponent(info.channel)
                            + '&duration=' + encodeURIComponent(info.duration)
                            + '&cover=' + encodeURIComponent(data.cover || '')
                            + '&url=' + encodeURIComponent(url)
                    });

                    notifyDone(info.title);
                    addHistory(info.title, 'success', format, type, url, info);
                    incrementDownloadCount();
                    loadSystemInfo();
                    // Fix cover si manquant
                    if (!data.cover) {
                        fetch('api/library', { method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: 'action=fix_covers'
                        }).catch(() => {});
                    }
                    reset();
                } else if (data.status === 'error') {
                    clearInterval(currentDlInterval); currentDlInterval = null;
                    logTech('ERROR', 'Erreur telechargement', { jobId, message: data.message, attempt });
                    const is429 = data.message && data.message.includes('429');
                    // Pas de retry sur 429 (rate-limit YouTube)
                    if (!is429 && attempt <= MAX_RETRIES) {
                        setTimeout(() => startWithRetry(url, type, format, quality, saveCover, info, folder, attempt + 1), 3000);
                    } else {
                        progressText.textContent = 'Erreur';
                        const msg429 = is429 ? '<br><small>YouTube t\'a temporairement bloque. Attends quelques minutes avant de reessayer.</small>' : '';
                        result.innerHTML = '<div class="message error">' + data.message + msg429 + '</div>';
                        addHistory(info.title, 'error', format, type, url, info);
                        reset();
                    }
                } else {
                    if (data.message === lastMessage) { stallCount++; } else { stallCount = 0; lastMessage = data.message; }
                    if (stallCount >= STALL_LIMIT) {
                        clearInterval(currentDlInterval); currentDlInterval = null;
                        // Retry silencieux si bloque
                        if (attempt <= MAX_RETRIES) {
                            setTimeout(() => startWithRetry(url, type, format, quality, saveCover, info, folder, attempt + 1), 1500);
                        } else {
                            progressText.textContent = 'Bloque';
                            result.innerHTML = '<div class="message error">Le telechargement semble bloque (aucune progression depuis 2 min).</div>';
                            reset();
                        }
                        return;
                    }
                    progressBar.style.width = Math.max(10, data.percent) + '%';
                    let msg = data.message;
                    if (stallCount >= 60) msg += ' (en attente depuis ' + Math.round(stallCount/2) + 's...)';
                    progressText.textContent = msg;
                }
            } catch (err) {
                // Erreur reseau silencieuse, on continue le polling
            }
        }, 500);
    }

    function reset() { btn.disabled = false; btn.textContent = 'Telecharger'; document.getElementById('btnCancel').style.display = 'none'; currentDlInterval = null; }
});

// ========== LIBRARY ==========
async function loadLibrary() {
    const resp = await fetch('api/library?action=list');
    libraryData = await resp.json();
    renderLibrary();
    updateFolderSelect();
    buildFilterChips();
}

function sortLibrary() {
    renderLibrary();
}

let activeFilters = new Set(['all']);

function buildFilterChips() {
    const container = document.getElementById('libFilterChips');
    if (!container) return;

    // Compter par type et format
    const items = libraryData.items || [];
    const audioCount = items.filter(i => i.type === 'audio').length;
    const videoCount = items.filter(i => i.type === 'video').length;
    const formatCounts = {};
    items.forEach(i => {
        if (i.format) formatCounts[i.format] = (formatCounts[i.format] || 0) + 1;
    });

    let html = '';
    // Tout
    html += '<label class="lib-filter-chip ' + (activeFilters.has('all') ? 'active' : '') + '">'
        + '<input type="checkbox" ' + (activeFilters.has('all') ? 'checked' : '') + ' onchange="toggleFilter(\'all\')">'
        + '<span class="chip-dot all"></span> Tout <span class="chip-count">(' + items.length + ')</span></label>';
    // Audio
    if (audioCount > 0) {
        html += '<label class="lib-filter-chip ' + (activeFilters.has('audio') ? 'active' : '') + '">'
            + '<input type="checkbox" ' + (activeFilters.has('audio') ? 'checked' : '') + ' onchange="toggleFilter(\'audio\')">'
            + '<span class="chip-dot audio"></span> Audio <span class="chip-count">(' + audioCount + ')</span></label>';
    }
    // Video
    if (videoCount > 0) {
        html += '<label class="lib-filter-chip ' + (activeFilters.has('video') ? 'active' : '') + '">'
            + '<input type="checkbox" ' + (activeFilters.has('video') ? 'checked' : '') + ' onchange="toggleFilter(\'video\')">'
            + '<span class="chip-dot video"></span> Video <span class="chip-count">(' + videoCount + ')</span></label>';
    }
    // Formats
    Object.keys(formatCounts).sort().forEach(f => {
        html += '<label class="lib-filter-chip ' + (activeFilters.has('fmt:' + f) ? 'active' : '') + '">'
            + '<input type="checkbox" ' + (activeFilters.has('fmt:' + f) ? 'checked' : '') + ' onchange="toggleFilter(\'fmt:' + f + '\')">'
            + '<span class="chip-dot format"></span> ' + f.toUpperCase() + ' <span class="chip-count">(' + formatCounts[f] + ')</span></label>';
    });

    container.innerHTML = html;
}

function toggleFilter(key) {
    if (key === 'all') {
        // Tout selectionner = reset tous les filtres
        activeFilters.clear();
        activeFilters.add('all');
    } else {
        // Desactiver "all"
        activeFilters.delete('all');

        if (activeFilters.has(key)) {
            activeFilters.delete(key);
        } else {
            activeFilters.add(key);
        }

        // Si rien de selectionne, revenir a "all"
        if (activeFilters.size === 0) {
            activeFilters.add('all');
        }
    }

    buildFilterChips();
    filterLibrary();
}

function renderLibrary() {
    const { folders, items, stats } = libraryData;

    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statAudio').textContent = stats.audio;
    document.getElementById('statVideo').textContent = stats.video;

    // Render folders bar
    let foldersHtml = '<div class="folder-chip ' + (currentFolder === '' ? 'active' : '') + '" data-folder-id="" onclick="filterFolder(\'\')">Tout</div>';
    folders.forEach(f => {
        foldersHtml += '<div class="folder-chip ' + (currentFolder === f.id ? 'active' : '') + '" data-folder-id="' + f.id + '" onclick="filterFolder(\'' + f.id + '\')">'
            + f.name
            + '<span class="folder-del" onclick="event.stopPropagation();deleteFolder(\'' + f.id + '\')">x</span>'
            + '</div>';
    });
    document.getElementById('foldersBar').innerHTML = foldersHtml;

    // Sort items
    const libSort = document.getElementById('libSortBy') ? document.getElementById('libSortBy').value : 'date-desc';
    items.sort((a, b) => {
        switch (libSort) {
            case 'date-desc': return (b.date || '').localeCompare(a.date || '');
            case 'date-asc': return (a.date || '').localeCompare(b.date || '');
            case 'title-asc': return (a.title || '').localeCompare(b.title || '', 'fr');
            case 'title-desc': return (b.title || '').localeCompare(a.title || '', 'fr');
            case 'type-audio': return (a.type === 'audio' ? 0 : 1) - (b.type === 'audio' ? 0 : 1);
            case 'type-video': return (a.type === 'video' ? 0 : 1) - (b.type === 'video' ? 0 : 1);
            case 'size-desc': return (b.size || 0) - (a.size || 0);
            case 'size-asc': return (a.size || 0) - (b.size || 0);
            default: return 0;
        }
    });

    // Filter items
    const filtered = currentFolder === '' ? items : items.filter(i => i.folder === currentFolder);

    const grid = document.getElementById('itemsGrid');
    const empty = document.getElementById('emptyLib');

    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.style.display = 'block';
        return;
    }

    empty.style.display = 'none';

    // Show select bar if items exist
    // Les gros boutons apparaissent quand on coche des items

    grid.innerHTML = filtered.map(item => {
        const thumbSrc = item.cover || item.thumbnail || '';
        const thumbHtml = thumbSrc
            ? '<img src="' + thumbSrc + '" alt="">'
            : '<div class="no-thumb">' + (item.type === 'audio' ? '&#9835;' : '&#9654;') + '</div>';
        const badge = item.type === 'audio'
            ? '<span class="badge badge-audio">' + item.format + '</span>'
            : '<span class="badge badge-video">' + item.format + '</span>';
        const isPlayable = ['mp3','flac','wav','aac','ogg','mp4','webm'].includes(item.format);

        return '<div class="item-card" data-id="' + item.id + '">'
            + '<div class="item-check"><input type="checkbox" onchange="updateSelectCount()" data-item-id="' + item.id + '"></div>'
            + (isPlayable ? '<button class="item-play-btn" onclick="playSingle(\'' + item.id + '\')">&#9654;</button>' : '')
            + thumbHtml + badge
            + '<div class="item-body">'
            + '<div class="item-title" title="' + item.title + '">' + item.title + '</div>'
            + '<div class="item-meta">' + (item.channel || '') + ' | ' + (item.duration || '') + ' | ' + item.date.split(' ')[0] + '</div>'
            + '<div class="item-actions">'
            + '<a class="item-dl" href="' + item.file.split('/').map(encodeURIComponent).join('/') + '" download>DL</a>'
            + (item.type === 'video' ? '<button class="item-move" onclick="convertToAudio(\'' + item.id + '\')" title="Extraire l\'audio">MP3</button>' : '')
            + '<button class="item-move" onclick="showMoveItem(\'' + item.id + '\')">Deplacer</button>'
            + '<button class="item-del" onclick="deleteItem(\'' + item.id + '\')">Suppr</button>'
            + '</div></div></div>';
    }).join('');

    // Activer le drag & drop et calculer les stats
    enableDragDrop();
    computeDurationStats();
    // Afficher les boutons de selection des le chargement
    updateSelectCount();
}

function filterLibrary() {
    const query = document.getElementById('libSearch').value.trim().toLowerCase();
    const showAll = activeFilters.has('all');

    document.querySelectorAll('.item-card').forEach(card => {
        const id = card.dataset.id;
        const item = libraryData.items.find(i => i.id === id);
        if (!item) return;

        const matchText = !query || (item.title + ' ' + (item.channel || '') + ' ' + (item.format || '')).toLowerCase().includes(query);

        let matchFilter = showAll;
        if (!showAll) {
            // Verifier type (audio/video)
            if (activeFilters.has(item.type)) matchFilter = true;
            // Verifier format (fmt:mp3, fmt:mp4, etc.)
            if (activeFilters.has('fmt:' + item.format)) matchFilter = true;
        }

        const match = matchText && matchFilter;
        card.classList.toggle('search-hidden', !match);
        card.classList.toggle('search-highlight', match && query.length > 0);
    });

    const visible = document.querySelectorAll('.item-card:not(.search-hidden)').length;
    const total = document.querySelectorAll('.item-card').length;
    const empty = document.getElementById('emptyLib');
    const hasFilter = query || !showAll;
    if (hasFilter && visible === 0) {
        empty.style.display = 'block';
        empty.textContent = 'Aucun resultat.';
    } else if (!hasFilter && total === 0) {
        empty.style.display = 'block';
        empty.textContent = 'Aucun telechargement pour le moment.';
    } else {
        empty.style.display = 'none';
    }
}

function filterFolder(folderId) {
    currentFolder = folderId;
    renderLibrary();
}

function updateFolderSelect() {
    const sel = document.getElementById('targetFolder');
    sel.innerHTML = '<option value="">Aucun dossier</option>'
        + libraryData.folders.map(f => '<option value="' + f.id + '">' + f.name + '</option>').join('');
}

// Modals
function showCreateFolder() {
    document.getElementById('folderName').value = '';
    document.getElementById('modalFolder').classList.add('active');
    document.getElementById('folderName').focus();
}

async function createFolder() {
    const name = document.getElementById('folderName').value.trim();
    if (!name) return;
    await fetch('api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=create_folder&name=' + encodeURIComponent(name)
    });
    closeModal('modalFolder');
    loadLibrary();
}

function deleteFolder(id) {
    showConfirm('Supprimer le dossier', 'Les elements du dossier retourneront a la racine.', 'Supprimer', 'var(--error)', async () => {
        await fetch('api/library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=delete_folder&folder_id=' + id
        });
        if (currentFolder === id) currentFolder = '';
        loadLibrary();
        loadSystemInfo();
    });
}

async function convertToAudio(id) {
    const item = libraryData.items.find(i => i.id === id);
    if (!item) return;

    const format = prompt('Format audio ? (mp3, flac, wav, aac, ogg)', 'mp3');
    if (!format || !['mp3', 'flac', 'wav', 'aac', 'ogg'].includes(format.toLowerCase())) {
        if (format !== null) alert('Format invalide. Choisis parmi : mp3, flac, wav, aac, ogg');
        return;
    }

    try {
        const resp = await fetch('api/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: item.file, format: format.toLowerCase(), quality: '0' })
        });
        const data = await resp.json();
        if (!data.success) { alert('Erreur : ' + data.error); return; }

        // Attendre la conversion (poll toutes les 2s)
        const outputFile = data.outputFile;
        const pollConvert = setInterval(async () => {
            try {
                const check = await fetch('api/convert?file=' + encodeURIComponent(outputFile));
                const status = await check.json();
                if (status.done) {
                    clearInterval(pollConvert);
                    // Ajouter a la bibliotheque
                    await fetch('api/library', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: 'action=add_item&file=' + encodeURIComponent(outputFile)
                            + '&title=' + encodeURIComponent(item.title)
                            + '&type=audio&format=' + format.toLowerCase()
                            + '&folder=' + encodeURIComponent(item.folder || '')
                            + '&thumbnail=' + encodeURIComponent(item.thumbnail || '')
                            + '&channel=' + encodeURIComponent(item.channel || '')
                            + '&duration=' + encodeURIComponent(item.duration || '')
                            + '&cover=' + encodeURIComponent(item.cover || '')
                            + '&url=' + encodeURIComponent(item.url || '')
                    });
                    loadLibrary();
                }
            } catch (e) { clearInterval(pollConvert); }
        }, 2000);
    } catch (e) {
        alert('Erreur de connexion au serveur.');
    }
}

function deleteItem(id) {
    const item = libraryData.items.find(i => i.id === id);
    const title = item ? item.title : 'cet element';
    showConfirm('Supprimer', 'Supprimer "' + title + '" ? Le fichier sera supprime du disque.', 'Supprimer', 'var(--error)', async () => {
        await fetch('api/library', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=delete_item&item_id=' + id
        });
        loadLibrary();
        loadSystemInfo();
    });
}

function showMoveItem(itemId) {
    moveItemId = itemId;
    const sel = document.getElementById('moveTarget');
    sel.innerHTML = '<option value="">Racine (aucun dossier)</option>'
        + libraryData.folders.map(f => '<option value="' + f.id + '">' + f.name + '</option>').join('');
    document.getElementById('modalMove').classList.add('active');
}

async function confirmMove() {
    const folderId = document.getElementById('moveTarget').value;
    await fetch('api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=move_item&item_id=' + moveItemId + '&folder_id=' + encodeURIComponent(folderId)
    });
    closeModal('modalMove');
    loadLibrary();
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

function showConfirm(title, message, btnText, btnColor, callback) {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    const btn = document.getElementById('confirmBtn');
    btn.textContent = btnText || 'Confirmer';
    btn.style.background = btnColor || 'var(--error)';
    btn.onclick = () => { closeModal('modalConfirm'); callback(); };
    document.getElementById('modalConfirm').classList.add('active');
}

function showToast(message) {
    document.getElementById('toastMessage').textContent = message;
    document.getElementById('modalToast').classList.add('active');
}

function deleteSelected() {
    const ids = getSelectedIds();
    if (ids.length === 0) { showToast('Selectionne au moins un element.'); return; }
    showConfirm('Supprimer la selection', ids.length + ' element(s) seront supprimes du disque.', 'Supprimer tout', 'var(--error)', async () => {
        for (const id of ids) {
            await fetch('api/library', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'action=delete_item&item_id=' + id
            });
        }
        loadLibrary();
        loadSystemInfo();
    });
}

// Enter key in modal
document.getElementById('folderName').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); createFolder(); }
});

// ========== PLAYER ==========
let playlist = [];
let playIndex = 0;
let playMode = 'normal'; // normal, loop, loopOne, shuffle
const audioEl = document.getElementById('audioEl');
const videoEl = document.getElementById('videoEl');

// --- Persistance du lecteur ---
function savePlayerState() {
    try {
        // Sauvegarder aussi l'etat Mon Flow
        if (flowCurrentIdx >= 0 && flowTracks[flowCurrentIdx]) {
            const t = flowTracks[flowCurrentIdx];
            localStorage.setItem('flow_state', JSON.stringify({
                trackId: t.id,
                trackIdx: flowCurrentIdx,
                type: flowCurrentType || 'audio',
                currentTime: audioEl.currentTime || 0,
                volume: audioEl.volume,
                playing: !audioEl.paused,
                shuffle: flowShuffle
            }));
            localStorage.removeItem('player_state');
            return;
        }
        localStorage.removeItem('flow_state');
        localStorage.setItem('player_state', JSON.stringify({
            playlist, playIndex, playMode,
            currentTime: audioEl.currentTime || 0,
            volume: audioEl.volume,
            playing: !audioEl.paused
        }));
    } catch (e) {}
}

function restorePlayerState() {
    // Essayer de restaurer Mon Flow d'abord
    try {
        const flowState = JSON.parse(localStorage.getItem('flow_state') || 'null');
        if (flowState && flowState.trackId) {
            restoreFlowState(flowState);
            return;
        }
    } catch (e) {}

    // Sinon restaurer la lecture locale
    try {
        const state = JSON.parse(localStorage.getItem('player_state') || 'null');
        if (!state || !state.playlist || !state.playlist.length) return;
        playlist = state.playlist;
        playIndex = state.playIndex || 0;
        playMode = state.playMode || 'normal';

        const item = getItemById(playlist[playIndex]);
        if (!item || item.type === 'video') return;

        audioEl.src = item.file;
        audioEl.volume = state.volume ?? 0.5;
        document.getElementById('volumeSlider').value = Math.round(audioEl.volume * 100);

        const bar = document.getElementById('playerBar');
        bar.classList.add('active');
        document.body.classList.add('player-open');
        document.getElementById('playerThumb').src = item.cover || item.thumbnail || '';
        document.getElementById('playerTitle').textContent = item.title;
        document.getElementById('playerArtist').textContent = item.channel || '';

        audioEl.addEventListener('loadedmetadata', function onLoaded() {
            audioEl.removeEventListener('loadedmetadata', onLoaded);
            if (state.currentTime > 0) audioEl.currentTime = state.currentTime;
            if (state.playing) {
                audioEl.play().catch(() => {
                    document.getElementById('btnPlayPause').innerHTML = '&#9654;';
                });
            }
        });

        document.getElementById('btnPlayPause').innerHTML = state.playing ? '&#9646;&#9646;' : '&#9654;';
    } catch (e) {}
}

async function restoreFlowState(state) {
    // Charger les tracks de Mon Flow
    try {
        const resp = await fetch('api/flow?action=list');
        const data = await resp.json();
        if (!data.success) return;
        flowTracks = data.tracks || [];
        flowPlaylists = data.playlists || [];
    } catch (e) { return; }

    // Retrouver le track par son ID
    const idx = flowTracks.findIndex(t => t.id === state.trackId);
    if (idx === -1) return;

    const t = flowTracks[idx];
    flowCurrentIdx = idx;
    flowCurrentType = state.type || 'audio';
    flowShuffle = state.shuffle || false;

    // Afficher le player bar
    const bar = document.getElementById('playerBar');
    bar.classList.add('active');
    document.body.classList.add('player-open');

    let thumb = t.thumbnail || '';
    if (!thumb && t.url) { const m = t.url.match(/[?&]v=([^&]+)/); if (m) thumb = 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg'; }

    document.getElementById('playerThumb').src = thumb;
    document.getElementById('playerTitle').textContent = t.title || '';
    document.getElementById('playerArtist').textContent = (t.channel || '') + ' · Reprise...';
    document.getElementById('btnPlayPause').innerHTML = '&#9654;';
    document.getElementById('volumeSlider').value = Math.round((state.volume ?? 0.5) * 100);

    // Recuperer le flux stream
    try {
        const resp = await fetch('api/stream?url=' + encodeURIComponent(t.url) + '&type=' + flowCurrentType);
        const data = await resp.json();
        if (!data.success) {
            document.getElementById('playerArtist').textContent = 'Erreur : flux indisponible';
            return;
        }

        audioEl.src = data.streamUrl;
        audioEl.volume = state.volume ?? 0.5;

        audioEl.addEventListener('loadedmetadata', function onLoaded() {
            audioEl.removeEventListener('loadedmetadata', onLoaded);
            if (state.currentTime > 0) audioEl.currentTime = state.currentTime;
            if (state.playing) {
                audioEl.play().then(() => {
                    document.getElementById('btnPlayPause').innerHTML = '&#9646;&#9646;';
                }).catch(() => {
                    document.getElementById('btnPlayPause').innerHTML = '&#9654;';
                });
            }
        });

        document.getElementById('playerArtist').textContent = (t.channel || '') + ' · Streaming';
        if (state.playing) document.getElementById('btnPlayPause').innerHTML = '&#9646;&#9646;';

        // Remettre le onended
        audioEl.onended = function() { flowNext(flowCurrentType); };

        // Pre-charger le suivant
        flowPreloadNext(idx, flowCurrentType);

    } catch (e) {
        document.getElementById('playerArtist').textContent = 'Erreur de connexion';
    }
}

function getItemById(id) {
    return libraryData.items.find(i => i.id === id);
}

// Selection
function selectAll() {
    document.querySelectorAll('.item-check input').forEach(c => c.checked = true);
    updateSelectCount();
}

function deselectAll() {
    document.querySelectorAll('.item-check input').forEach(c => c.checked = false);
    updateSelectCount();
}

function updateSelectCount() {
    const count = document.querySelectorAll('.item-check input:checked').length;
    const total = document.querySelectorAll('.item-check input').length;
    document.getElementById('selectCount').textContent = count + ' / ' + total + ' selectionne(s)';
    // Toujours afficher le bloc si il y a des items
    document.getElementById('bigActionBtns').style.display = total > 0 ? 'block' : 'none';
    // Afficher deselect/lire/supprimer seulement si selection > 0
    const hasSelection = count > 0;
    document.getElementById('btnDeselect').style.display = hasSelection ? '' : 'none';
    document.getElementById('btnPlaySel').style.display = hasSelection ? '' : 'none';
    document.getElementById('btnDeleteSel').style.display = hasSelection ? '' : 'none';
}

function getSelectedIds() {
    return [...document.querySelectorAll('.item-check input:checked')].map(c => c.dataset.itemId);
}

// Play
function playSingle(itemId) {
    playlist = [itemId];
    playIndex = 0;
    playCurrentItem();
}

function playSelected() {
    const ids = getSelectedIds();
    if (ids.length === 0) { showToast('Selectionne au moins un element.'); return; }
    playlist = ids;
    playIndex = 0;
    if (playMode === 'shuffle') shufflePlaylist();
    playCurrentItem();
}

function playCurrentItem() {
    if (playIndex < 0 || playIndex >= playlist.length) return;
    const item = getItemById(playlist[playIndex]);
    if (!item) return;

    if (item.type === 'video') {
        playVideo(item);
    } else {
        playAudio(item);
    }
}

function playAudio(item) {
    // Hide video overlay if open
    document.getElementById('videoOverlay').classList.remove('active');
    videoEl.pause();

    audioEl.src = item.file;
    audioEl.volume = document.getElementById('volumeSlider').value / 100;
    audioEl.play();

    // Show player bar
    const bar = document.getElementById('playerBar');
    bar.classList.add('active');
    document.body.classList.add('player-open');

    document.getElementById('playerThumb').src = item.cover || item.thumbnail || '';
    document.getElementById('playerTitle').textContent = item.title;
    document.getElementById('playerArtist').textContent = item.channel || '';
    document.getElementById('btnPlayPause').innerHTML = '&#9646;&#9646;';
    updateNextTrack();
    savePlayerState();
    if (document.getElementById('playerQueue').style.display !== 'none') renderPlayerQueue();
}

function updateNextTrack() {
    const el = document.getElementById('playerNext');
    const titleEl = document.getElementById('playerNextTitle');
    const thumbEl = document.getElementById('playerNextThumb');
    if (!el) return;
    const nextIdx = playIndex + 1;
    if (nextIdx < playlist.length) {
        const next = getItemById(playlist[nextIdx]);
        if (next) {
            titleEl.textContent = next.title;
            thumbEl.src = next.thumbnail || '';
            thumbEl.style.display = next.thumbnail ? '' : 'none';
            el.style.display = 'flex';
            return;
        }
    }
    el.style.display = 'none';
}

function playVideo(item) {
    // Pause audio
    audioEl.pause();
    document.getElementById('playerBar').classList.remove('active');
    document.body.classList.remove('player-open');

    videoEl.src = item.file;
    videoEl.volume = document.getElementById('volumeSlider').value / 100;
    videoEl.play();
    document.getElementById('videoPlayerTitle').textContent = item.title;
    document.getElementById('videoOverlay').classList.add('active');
}

function closeVideoPlayer() {
    videoEl.pause();
    videoEl.src = '';
    const iframe = document.getElementById('videoIframe');
    if (iframe) { iframe.src = ''; iframe.style.display = 'none'; }
    videoEl.style.display = '';
    document.getElementById('videoOverlay').classList.remove('active');
}

function playYoutubeVideo(url, title) {
    const vMatch = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/) || url.match(/\/shorts\/([^?&]+)/);
    if (!vMatch) return;

    audioEl.pause();
    document.getElementById('playerBar').classList.remove('active');
    document.body.classList.remove('player-open');

    videoEl.style.display = 'none';
    const iframe = document.getElementById('videoIframe');
    iframe.src = 'https://www.youtube.com/embed/' + vMatch[1] + '?autoplay=1&rel=0';
    iframe.style.display = 'block';
    document.getElementById('videoPlayerTitle').textContent = title || '';
    document.getElementById('videoOverlay').classList.add('active');
}

function previewYouTube(videoId, title) {
    if (!videoId) return;
    playYoutubeVideo('https://www.youtube.com/watch?v=' + videoId, title);
}

function playerToggle() {
    const a = document.getElementById('audioEl');
    if (a.paused) {
        a.play();
        document.getElementById('btnPlayPause').innerHTML = '&#9646;&#9646;';
    } else {
        a.pause();
        document.getElementById('btnPlayPause').innerHTML = '&#9654;';
    }
    savePlayerState();
}

function playerNext() {
    // Si Mon Flow est actif, utiliser flowNext
    if (flowCurrentIdx >= 0) { flowNext(); return; }
    if (playlist.length === 0) return;
    if (playMode === 'loopOne') {
        audioEl.currentTime = 0; audioEl.play(); return;
    }
    playIndex++;
    if (playIndex >= playlist.length) {
        if (playMode === 'loop' || playMode === 'shuffle') {
            playIndex = 0;
            if (playMode === 'shuffle') shufflePlaylist();
        } else {
            playIndex = playlist.length - 1;
            audioEl.pause();
            document.getElementById('btnPlayPause').innerHTML = '&#9654;';
            return;
        }
    }
    playCurrentItem();
}

function playerPrev() {
    // Si Mon Flow est actif, utiliser flowPrev
    if (flowCurrentIdx >= 0) { flowPrev(); return; }
    if (playlist.length === 0) return;
    // If more than 3s in, restart current track
    if (audioEl.currentTime > 3) {
        audioEl.currentTime = 0; return;
    }
    playIndex--;
    if (playIndex < 0) {
        if (playMode === 'loop' || playMode === 'shuffle') {
            playIndex = playlist.length - 1;
        } else {
            playIndex = 0;
        }
    }
    playCurrentItem();
}

function playerSetMode(mode) {
    if (playMode === mode) {
        playMode = 'normal';
    } else {
        playMode = mode;
    }
    // Update button styles
    document.getElementById('btnLoop').classList.toggle('active-mode', playMode === 'loop');
    document.getElementById('btnLoopOne').classList.toggle('active-mode', playMode === 'loopOne');
    document.getElementById('btnShuffle').classList.toggle('active-mode', playMode === 'shuffle');
}

function playerSetVolume(val) {
    audioEl.volume = val / 100;
    videoEl.volume = val / 100;
    savePlayerState();
}

function playerMute() {
    const slider = document.getElementById('volumeSlider');
    if (audioEl.volume > 0) {
        slider.dataset.prev = slider.value;
        slider.value = 0;
        audioEl.volume = 0;
    } else {
        slider.value = slider.dataset.prev || 80;
        audioEl.volume = slider.value / 100;
    }
}

function seekPlayer(e) {
    if (!audioEl.duration) return;
    const rect = e.target.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    audioEl.currentTime = pct * audioEl.duration;
    savePlayerState();
}

function playerClose() {
    audioEl.pause();
    audioEl.src = '';
    audioEl.onended = null;
    document.getElementById('playerBar').classList.remove('active');
    document.body.classList.remove('player-open');
    document.getElementById('playerQueue').style.display = 'none';
    playlist = [];
    flowCurrentIdx = -1;
    flowPreloaded = null;
    document.querySelectorAll('.flow-track').forEach(el => el.classList.remove('fl-playing'));
    localStorage.removeItem('player_state');
    localStorage.removeItem('flow_state');
}

function togglePlayerQueue() {
    const panel = document.getElementById('playerQueue');
    const btn = document.querySelector('.player-queue-btn');
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        btn.classList.add('active');
        renderPlayerQueue();
    } else {
        panel.style.display = 'none';
        btn.classList.remove('active');
    }
}

function renderPlayerQueue() {
    const list = document.getElementById('pqList');
    const count = document.getElementById('pqCount');
    if (!list) return;

    count.textContent = playlist.length + ' piste(s)';

    if (playlist.length === 0) {
        list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">Aucune piste</div>';
        return;
    }

    list.innerHTML = playlist.map((id, i) => {
        const item = getItemById(id);
        if (!item) return '';
        const isActive = i === playIndex;
        const isNext = i === playIndex + 1;
        const thumb = item.thumbnail
            ? '<img class="pq-item-thumb" src="' + item.thumbnail + '">'
            : '<div class="pq-no-thumb">&#9835;</div>';
        var label = '';
        if (isActive) label = '<div class="pq-label">En cours</div>';
        else if (isNext) label = '<div class="pq-label">Suivante</div>';

        return label + '<div class="pq-item' + (isActive ? ' pq-active' : '') + (isNext ? ' pq-next' : '') + '" onclick="jumpToTrack(' + i + ')">'
            + '<span class="pq-item-num">' + (isActive ? '&#9654;' : (i + 1)) + '</span>'
            + thumb
            + '<div class="pq-item-info">'
            + '<div class="pq-item-title">' + item.title + '</div>'
            + '<div class="pq-item-duration">' + (item.duration || '') + '</div>'
            + '</div>'
            + '</div>';
    }).join('');
}

function jumpToTrack(index) {
    playIndex = index;
    playCurrentItem();
    renderPlayerQueue();
}

function shufflePlaylist() {
    for (let i = playlist.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
    }
    playIndex = 0;
}

function formatTime(s) {
    if (!s || isNaN(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
}

// Audio events
let _lastPlayerSave = 0;
audioEl.addEventListener('timeupdate', () => {
    if (!audioEl.duration) return;
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    document.getElementById('playerSeekFill').style.width = pct + '%';
    document.getElementById('playerTime').textContent = formatTime(audioEl.currentTime) + ' / ' + formatTime(audioEl.duration);
    // Sauvegarder la position toutes les 3 secondes
    const now = Date.now();
    if (now - _lastPlayerSave > 3000) { _lastPlayerSave = now; savePlayerState(); }
});

audioEl.addEventListener('ended', () => {
    playerNext();
});

// Video ended -> next
videoEl.addEventListener('ended', () => {
    closeVideoPlayer();
    playerNext();
});

// ========== PROFILE ==========
let currentUser = null;

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

async function loadProfilesList() {
    const resp = await fetch('api/profile?action=list');
    const data = await resp.json();
    const container = document.getElementById('profilesList');
    if (!data.success || data.profiles.length === 0) {
        container.innerHTML = '<p style="color:#555; font-size:13px;">Aucun profil pour le moment.</p>';
        return;
    }
    container.innerHTML = data.profiles.map(p => {
        const initial = p.username.charAt(0).toUpperCase();
        return '<div class="profile-option" onclick="selectProfile(\'' + p.username.replace(/'/g, "\\'") + '\')">'
            + '<div class="po-avatar">' + initial + '</div>'
            + '<div class="po-info">'
            + '<div class="po-name">' + p.username + '</div>'
            + '<div class="po-meta">' + (p.download_count || 0) + ' telechargements</div>'
            + '</div></div>';
    }).join('');
}

async function selectProfile(username) {
    const resp = await fetch('api/profile?action=load&username=' + encodeURIComponent(username));
    const data = await resp.json();
    if (data.success) {
        currentUser = data.profile;
        document.cookie = 'yt_user=' + encodeURIComponent(username) + ';max-age=' + (86400*3650) + ';path=/';
        localStorage.setItem('yt_user', username);
        showProfile();
        applyPrefs();
    }
}

async function loginUser() {
    const name = document.getElementById('loginName').value.trim();
    if (!name) return;

    const resp = await fetch('api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=save&username=' + encodeURIComponent(name)
    });
    const data = await resp.json();
    if (data.success) {
        currentUser = data.profile;
        document.cookie = 'yt_user=' + encodeURIComponent(name) + ';max-age=' + (86400*3650) + ';path=/';
        localStorage.setItem('yt_user', name);
        showProfile();
        applyPrefs();
    }
}

async function loadProfile(username) {
    const resp = await fetch('api/profile?action=load&username=' + encodeURIComponent(username));
    const data = await resp.json();
    if (data.success) {
        currentUser = data.profile;
        showProfile();
        applyPrefs();
    }
}

function showProfile() {
    if (!currentUser) return;

    document.getElementById('loginView').style.display = 'none';
    document.getElementById('profileView').style.display = 'block';

    const initial = currentUser.username.charAt(0).toUpperCase();
    document.getElementById('profileAvatar').textContent = initial;
    document.getElementById('profileName').textContent = currentUser.username;
    document.getElementById('profileSince').textContent = 'Membre depuis le ' + (currentUser.created || '').split(' ')[0];


    // Remplir les preferences
    if (currentUser.pref_type === 'video') {
        document.getElementById('prefVideo').checked = true;
    } else {
        document.getElementById('prefAudio').checked = true;
    }
    document.getElementById('prefFormatAudio').value = currentUser.pref_format_audio || 'mp3';
    document.getElementById('prefQualityAudio').value = currentUser.pref_quality_audio || '0';
    document.getElementById('prefFormatVideo').value = currentUser.pref_format_video || 'mp4';
    document.getElementById('prefQualityVideo').value = currentUser.pref_quality_video || 'best';
    document.getElementById('prefCover').checked = (currentUser.pref_cover === '1');

    // Welcome bar
    document.getElementById('welcomeBar').style.display = 'flex';
    document.getElementById('welcomeName').textContent = currentUser.username;
}

function applyPrefs() {
    if (!currentUser) return;

    // Appliquer le type
    if (currentUser.pref_type === 'video') {
        document.getElementById('typeVideo').checked = true;
    } else {
        document.getElementById('typeAudio').checked = true;
    }
    updateOptions();

    // Appliquer le format et la qualite selon le type
    const type = currentUser.pref_type || 'audio';
    if (type === 'audio') {
        formatSelect.value = currentUser.pref_format_audio || 'mp3';
        qualitySelect.value = currentUser.pref_quality_audio || '0';
    } else {
        formatSelect.value = currentUser.pref_format_video || 'mp4';
        qualitySelect.value = currentUser.pref_quality_video || 'best';
    }

    // Appliquer la couverture
    document.getElementById('saveCover').checked = (currentUser.pref_cover === '1');
}

async function savePrefs() {
    if (!currentUser) return;

    const prefType = document.querySelector('input[name="prefType"]:checked').value;
    const body = 'action=save&username=' + encodeURIComponent(currentUser.username)
        + '&pref_type=' + prefType
        + '&pref_format_audio=' + document.getElementById('prefFormatAudio').value
        + '&pref_format_video=' + document.getElementById('prefFormatVideo').value
        + '&pref_quality_audio=' + document.getElementById('prefQualityAudio').value
        + '&pref_quality_video=' + document.getElementById('prefQualityVideo').value
        + '&pref_cover=' + (document.getElementById('prefCover').checked ? '1' : '0');

    const resp = await fetch('api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body
    });
    const data = await resp.json();
    if (data.success) {
        currentUser = data.profile;
        applyPrefs();
        showToast('Preferences sauvegardees !');
    }
}

async function logoutUser() {
    currentUser = null;
    document.cookie = 'yt_user=;max-age=0;path=/';
    localStorage.removeItem('yt_user');
    document.getElementById('loginView').style.display = 'block';
    document.getElementById('profileView').style.display = 'none';
    document.getElementById('welcomeBar').style.display = 'none';
    await fetch('api/profile', { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=logout'
    });
    loadProfilesList();
}

// Incrementer le compteur apres un telechargement reussi
async function incrementDownloadCount() {
    if (!currentUser) return;
    currentUser.download_count = (currentUser.download_count || 0) + 1;
    await fetch('api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=increment&username=' + encodeURIComponent(currentUser.username)
    });
}

// Enter dans le login
document.getElementById('loginName').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); loginUser(); }
});

let lastSearchResults = [];

// ========== SEARCH YOUTUBE ==========
let searchPage = 1;
let searchQuery = '';

async function searchYouTube(loadMore) {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    const container = document.getElementById('searchResults');

    if (!loadMore || query !== searchQuery) {
        searchPage = 1;
        searchQuery = query;
        lastSearchResults = [];
        container.innerHTML = '<div class="items-grid">'
            + Array(4).fill('<div class="item-card skeleton"><div class="skeleton-thumb"></div><div class="skeleton-body"><div class="skeleton-line w70"></div><div class="skeleton-line w40"></div></div></div>').join('')
            + '</div>';
    } else {
        searchPage++;
        const moreBtn = document.getElementById('searchMoreBtn');
        if (moreBtn) moreBtn.textContent = 'Chargement...';
    }

    const max = 20 * searchPage;

    try {
        const resp = await fetch('api/search?q=' + encodeURIComponent(query) + '&max=' + max);
        const data = await resp.json();

        if (!data.success || data.results.length === 0) {
            container.innerHTML = '<div class="search-loading">Aucun resultat.</div>';
            return;
        }

        lastSearchResults = data.results;
        var sqType = document.getElementById('sqType').value;
        var sqFmt = document.getElementById('sqFormat').value.toUpperCase();
        var badgeClass = sqType === 'audio' ? 'badge-audio' : 'badge-video';
        var bar = '<div class="search-results-bar">'
            + '<span class="sr-count">' + data.results.length + ' resultat(s) pour "' + query.replace(/</g, '&lt;') + '"</span>'
            + '<button class="sr-btn-all" onclick="sqAddAll()">&#11015; Tout telecharger (' + data.results.length + ')</button>'
            + '<button class="sr-btn-all" style="background:#9C27B0;" onclick="searchAddAllToFlow()">+ Tout dans Mon Flow</button>'
            + '</div>';
        container.innerHTML = bar + '<div class="items-grid" id="searchGrid">' + data.results.map((r, i) => {
            var videoId = r.url.match(/[?&]v=([\w-]+)/);
            videoId = videoId ? videoId[1] : '';
            var safeTitle = r.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            var thumbHtml = r.thumbnail
                ? '<img src="' + r.thumbnail + '" alt="" onclick="previewYouTube(\'' + videoId + '\', \'' + safeTitle + '\')" style="cursor:pointer">'
                : '<div class="no-thumb">&#9654;</div>';
            return '<div class="item-card">'
            + '<button class="item-play-btn" onclick="previewYouTube(\'' + videoId + '\', \'' + safeTitle + '\')">&#9654;</button>'
            + thumbHtml
            + '<span class="badge ' + badgeClass + '">' + sqFmt + '</span>'
            + '<div class="item-body">'
            + '<div class="item-title" title="' + safeTitle + '">' + r.title + '</div>'
            + '<div class="item-meta">' + (r.channel || '') + ' | ' + (r.duration || '') + '</div>'
            + '<div class="item-actions">'
            + '<button class="item-dl" onclick="sqAdd(' + i + ', true)">DL</button>'
            + '<button class="item-move" onclick="sqAdd(' + i + ')">+ File</button>'
            + '<button class="item-move" style="background:#9C27B0;color:#fff;" onclick="searchAddToFlow(' + i + ', this)">+ Flow</button>'
            + '<button class="item-move" style="background:#2196F3;color:#fff;" onclick="playYoutubeVideo(\'' + r.url.replace(/'/g, "\\'") + '\', \'' + safeTitle + '\')">&#9654; Video</button>'
            + '</div></div></div>';
        }).join('') + '</div>'
        + '<div style="text-align:center;padding:14px;">'
        + '<button id="searchMoreBtn" onclick="searchYouTube(true)" style="background:var(--primary);color:#fff;border:none;padding:10px 28px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">Charger plus de resultats (' + data.results.length + ' affiches)</button>'
        + '</div>';
        // Marquer les videos deja telechargees
        sqMarkDownloaded();
    } catch (err) {
        container.innerHTML = '<div class="search-loading">Erreur de recherche.</div>';
    }
}

function useSearchResult(url) {
    document.getElementById('url').value = url;
    switchTab('download');
}

document.getElementById('searchInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); searchYouTube(); }
});

// ========== SEARCH QUEUE (meme logique que l'extension) ==========
let sqQueue = [];
let sqRunning = false;
let sqLog = [];

// --- Formats ---
function sqUpdateFormats() {
    const type = document.getElementById('sqType').value;
    const fmtSelect = document.getElementById('sqFormat');
    const qualSelect = document.getElementById('sqQuality');
    if (type === 'audio') {
        fmtSelect.innerHTML = '<option value="mp3">MP3</option><option value="flac">FLAC</option><option value="wav">WAV</option><option value="aac">AAC</option><option value="ogg">OGG</option>';
        qualSelect.innerHTML = '<option value="0">Haute</option><option value="5">Normale</option><option value="9">Legere</option>';
    } else {
        fmtSelect.innerHTML = '<option value="mp4">MP4</option><option value="mkv">MKV</option><option value="webm">WEBM</option>';
        qualSelect.innerHTML = '<option value="best">Meilleure</option><option value="1080">1080p</option><option value="720">720p</option><option value="480">480p</option><option value="360">360p</option>';
    }
}
sqUpdateFormats();

// --- Anti-doublons ---
async function sqCheckUrl(url, format) {
    try {
        let checkUrl = 'api/library?action=check_url&url=' + encodeURIComponent(url);
        if (format) checkUrl += '&format=' + encodeURIComponent(format);
        const resp = await fetch(checkUrl, { signal: AbortSignal.timeout(2000) });
        const data = await resp.json();
        return data.exists === true;
    } catch (e) { return false; }
}

async function sqMarkDownloaded() {
    if (!lastSearchResults.length) return;

    // Charger la biblio et Mon Flow en parallele
    let libItems = [];
    let flowItems = [];
    try {
        const [libResp, flowResp] = await Promise.all([
            fetch('api/library', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=list' }),
            fetch('api/flow?action=list')
        ]);
        const libData = await libResp.json();
        const flowData = await flowResp.json();
        if (libData.success) libItems = libData.items || [];
        if (flowData.success) flowItems = flowData.tracks || [];
    } catch (e) {}

    const libVids = new Set(libItems.map(i => { const m = (i.url || '').match(/[?&]v=([^&]+)/); return m ? m[1] : ''; }).filter(Boolean));
    const flowVids = new Set(flowItems.map(i => { const m = (i.url || '').match(/[?&]v=([^&]+)/); return m ? m[1] : ''; }).filter(Boolean));

    for (let i = 0; i < lastSearchResults.length; i++) {
        const vMatch = (lastSearchResults[i].url || '').match(/[?&]v=([^&]+)/);
        const vid = vMatch ? vMatch[1] : '';
        const card = document.querySelector('#searchGrid .item-card:nth-child(' + (i + 1) + ')');
        if (!card) continue;

        if (vid && libVids.has(vid) && !card.classList.contains('sq-downloaded')) {
            card.classList.add('sq-downloaded');
            const badge = card.querySelector('.badge');
            if (badge) { badge.className = 'badge badge-downloaded'; badge.textContent = '✓ DL'; }
        }
        if (vid && flowVids.has(vid)) {
            card.classList.add('sq-in-flow');
            const flowBtn = card.querySelector('[onclick*="searchAddToFlow"]');
            if (flowBtn) { flowBtn.textContent = '✓ Flow'; flowBtn.style.background = '#666'; flowBtn.disabled = true; }
        }
    }
}

// --- Ajouter un element ---
async function searchAddToFlow(index, btn) {
    const r = lastSearchResults[index];
    if (!r) return;
    btn.textContent = '...';
    btn.disabled = true;
    try {
        const resp = await fetch('api/flow', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=add&url=' + encodeURIComponent(r.url)
                + '&title=' + encodeURIComponent(r.title || '')
                + '&channel=' + encodeURIComponent(r.channel || '')
                + '&thumbnail=' + encodeURIComponent(r.thumbnail || '')
                + '&duration=' + encodeURIComponent(r.duration || '')
        });
        const data = await resp.json();
        btn.textContent = data.duplicate ? 'Deja' : 'OK!';
        btn.style.background = data.duplicate ? '#666' : '#4CAF50';
    } catch (e) { btn.textContent = '!'; }
    setTimeout(() => { btn.textContent = '+ Flow'; btn.style.background = '#9C27B0'; btn.disabled = false; }, 2500);
}

async function searchAddAllToFlow() {
    if (!lastSearchResults || lastSearchResults.length === 0) return;
    const items = lastSearchResults.map(r => ({
        url: r.url, title: r.title || '', channel: r.channel || '',
        thumbnail: r.thumbnail || '', duration: r.duration || ''
    }));
    try {
        const resp = await fetch('api/flow', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=add_bulk&items=' + encodeURIComponent(JSON.stringify(items))
        });
        const data = await resp.json();
        alert(data.added + ' titre(s) ajoute(s) a Mon Flow');
    } catch (e) { alert('Erreur'); }
}

function sqAdd(index, startNow) {
    const r = lastSearchResults[index];
    if (!r) return;
    if (sqQueue.some(q => q.url === r.url && q.status !== 'done' && q.status !== 'error')) return;

    const type = document.getElementById('sqType').value;
    const format = document.getElementById('sqFormat').value;
    const quality = document.getElementById('sqQuality').value;
    sqQueue.push({
        url: r.url, title: r.title, thumbnail: r.thumbnail || '',
        channel: r.channel || '', duration: r.duration || '',
        type, format, quality, cover: '1',
        status: 'waiting', percent: 0, message: '',
        jobId: null, _activeStart: 0, _skipped: false
    });

    // Ajouter aussi sur le serveur pour sync avec l'extension
    fetch('api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=add&url=' + encodeURIComponent(r.url)
            + '&title=' + encodeURIComponent(r.title)
            + '&type=' + encodeURIComponent(type)
            + '&format=' + encodeURIComponent(format)
            + '&quality=' + encodeURIComponent(quality)
            + '&source=web'
    }).catch(() => {});

    sqRender();
    sqShowPanel();
    if (!sqRunning) sqProcess();
}

function sqAddAll() {
    const type = document.getElementById('sqType').value;
    const format = document.getElementById('sqFormat').value;
    const quality = document.getElementById('sqQuality').value;

    const batch = [];
    lastSearchResults.forEach(r => {
        if (sqQueue.some(q => q.url === r.url && q.status !== 'done' && q.status !== 'error')) return;
        sqQueue.push({
            url: r.url, title: r.title, thumbnail: r.thumbnail || '',
            channel: r.channel || '', duration: r.duration || '',
            type, format, quality, cover: '1',
            status: 'waiting', percent: 0, message: '',
            jobId: null, _activeStart: 0, _skipped: false
        });
        batch.push({ url: r.url, title: r.title, type, format, quality });
    });

    // Envoyer tout en une seule requete
    if (batch.length > 0) {
        fetch('api/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=add_batch&source=web&items=' + encodeURIComponent(JSON.stringify(batch))
        }).catch(() => {});
    }

    sqRender();
    sqShowPanel();
    if (!sqRunning) sqProcess();
}

// --- Serveur = source de verite unique ---
// sqSave met a jour le statut de chaque element sur le serveur
function sqSave() {
    sqQueue.forEach(q => {
        fetch('api/queue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=update&url=' + encodeURIComponent(q.url)
                + '&status=' + encodeURIComponent(q.status)
                + '&percent=' + (q.percent || 0)
                + '&message=' + encodeURIComponent(q.message || '')
                + '&jobId=' + encodeURIComponent(q.jobId || '')
                + '&title=' + encodeURIComponent(q.title || '')
        }).catch(() => {});
    });
}

function sqLoad() {
    // Ne charge plus depuis localStorage, tout vient du serveur
    sqQueue = [];
}

// Poll la queue serveur toutes les 3 secondes
async function sqPollServer() {
    try {
        const resp = await fetch('api/queue?action=list');
        const data = await resp.json();
        if (!data.success || !data.queue) return;

        const serverQueue = data.queue;
        const serverUrls = serverQueue.map(q => q.url);
        let changed = false;

        // 1. Mettre a jour les statuts des elements traites par l'extension
        sqQueue.forEach(local => {
            const server = serverQueue.find(q => q.url === local.url);
            if (server && server.source === 'extension') {
                if (server.status !== local.status) {
                    if (server.status === 'done') {
                        local.status = 'done';
                        local.percent = 100;
                        local.message = server.message || 'Termine (extension)';
                        sqAddLog('success', local.title, 'Telecharge par l\'extension');
                        changed = true;
                    } else if (server.status === 'skipped') {
                        local.status = 'skipped';
                        local.percent = 100;
                        local.message = server.message || 'Deja en bibliotheque';
                        sqAddLog('skip', local.title, 'Deja en bibliotheque');
                        changed = true;
                    } else if (server.status === 'error') {
                        local.status = 'error';
                        local.message = server.message || 'Erreur (extension)';
                        sqAddLog('error', local.title, server.message || 'Erreur');
                        changed = true;
                    } else if (server.status === 'active' && local.status === 'waiting') {
                        local.status = 'active';
                        local.percent = server.percent || 0;
                        local.message = server.message || 'En cours (extension)';
                        changed = true;
                    }
                }
                if (server.status === 'active' && server.percent > local.percent) {
                    local.percent = server.percent;
                    local.message = server.message || '';
                    changed = true;
                }
            }
        });

        // 2. Supprimer les elements locaux absents du serveur (supprimes par l'extension)
        const before = sqQueue.length;
        sqQueue = sqQueue.filter(q => {
            if (q.status === 'active' && !q._skipped) return true;
            if (serverUrls.includes(q.url)) return true;
            if (q.status === 'waiting') sqAddLog('skip', q.title, 'Retire par l\'extension');
            return false;
        });
        if (sqQueue.length !== before) changed = true;

        // 3. Ajouter les elements du serveur absents localement (ajoutes par l'extension)
        serverQueue.forEach(serverItem => {
            if ((serverItem.status === 'waiting' || serverItem.status === 'active') &&
                !sqQueue.some(q => q.url === serverItem.url)) {
                sqQueue.push({
                    url: serverItem.url,
                    title: serverItem.title || serverItem.url,
                    thumbnail: '', channel: '', duration: '',
                    type: serverItem.type || 'audio',
                    format: serverItem.format || 'mp3',
                    quality: serverItem.quality || '0',
                    cover: serverItem.cover || '1',
                    folder: serverItem.folder || '',
                    status: serverItem.status, percent: serverItem.percent || 0,
                    message: serverItem.message || '',
                    jobId: serverItem.jobId || null, _activeStart: 0, _skipped: false
                });
                changed = true;
            }
        });

        if (changed) {
            sqRender();
            if (sqQueue.length > 0) sqShowPanel();
            if (sqQueue.some(q => q.status === 'waiting') && !sqRunning) {
                sqProcess();
            }
        }
    } catch (e) {}
}

setInterval(sqPollServer, 3000);

// Auto-fix couvertures manquantes toutes les 30 secondes
setInterval(() => {
    fetch('api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=fix_covers'
    }).catch(() => {});
}, 30000);

function sqLogSave() {}

function sqLogLoad() {
    sqPollNotifications();
}

// --- Panel show/hide ---
function sqShowPanel() {
    const panel = document.getElementById('sqPanel');
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// --- Rendu file d'attente ---
function sqRender() {
    const list = document.getElementById('sqList');
    const panel = document.getElementById('sqPanel');
    if (!list) return;

    const waiting = sqQueue.filter(q => q.status === 'waiting').length;
    const active = sqQueue.filter(q => q.status === 'active').length;
    const done = sqQueue.filter(q => q.status === 'done').length;
    const total = sqQueue.length;

    // Compteur
    document.getElementById('sqCount').textContent = (waiting + active) || '0';

    // Barre globale
    const progTotal = document.getElementById('sqProgressTotal');
    if (total > 0) {
        progTotal.style.display = 'block';
        document.getElementById('sqProgressLabel').textContent = done + ' / ' + total;
        document.getElementById('sqBarFill').style.width = Math.round(done / total * 100) + '%';
    } else {
        progTotal.style.display = 'none';
    }

    if (total === 0) {
        list.innerHTML = '<div class="sq-empty">File d\'attente vide.</div>';
        return;
    }

    const firstWaiting = sqQueue.findIndex(q => q.status === 'waiting');
    const lastWaiting = sqQueue.length - 1 - [...sqQueue].reverse().findIndex(q => q.status === 'waiting');

    list.innerHTML = sqQueue.map((q, i) => {
        const icons = { waiting: '&#9203;', active: '&#11015;', done: '&#10003;', skipped: '&#10003;', error: '&#10007;' };
        const statusText = q.status === 'waiting' ? 'En attente'
            : q.status === 'active' ? (q.message || 'En cours...')
            : q.status === 'done' ? (q.message || 'Termine')
            : q.status === 'skipped' ? (q.message || 'Deja en bibliotheque')
            : (q.message || 'Erreur');
        const isWaiting = q.status === 'waiting';
        const isActive = q.status === 'active';
        const isError = q.status === 'error';

        let buttons = '';
        if (isActive) {
            buttons += '<button class="sq-action-btn sq-skip" onclick="sqSkip(' + i + ')" title="Passer">&#9654;&#9654;</button>';
        }
        if (isWaiting) {
            if (i > firstWaiting) buttons += '<button class="sq-action-btn" onclick="sqMoveUp(' + i + ')" title="Monter">&#9650;</button>';
            if (i < lastWaiting) buttons += '<button class="sq-action-btn" onclick="sqMoveDown(' + i + ')" title="Descendre">&#9660;</button>';
            buttons += '<button class="sq-remove" onclick="sqRemove(' + i + ')">&times;</button>';
        }
        if (isError) {
            buttons += '<button class="sq-action-btn sq-retry" onclick="sqRetry(' + i + ')" title="Relancer">&#8635;</button>';
            buttons += '<button class="sq-remove" onclick="sqRemove(' + i + ')">&times;</button>';
        }

        let progressBar = '';
        if (isActive) progressBar = '<div class="sq-item-bar"><div class="sq-item-bar-fill" style="width:' + Math.max(q.percent, 2) + '%"></div></div>';
        else if (q.status === 'done') progressBar = '<div class="sq-item-bar"><div class="sq-item-bar-fill sq-bar-done" style="width:100%"></div></div>';
        else if (q.status === 'skipped') progressBar = '<div class="sq-item-bar"><div class="sq-item-bar-fill sq-bar-skipped" style="width:100%"></div></div>';
        else if (isError) progressBar = '<div class="sq-item-bar"><div class="sq-item-bar-fill sq-bar-error" style="width:100%"></div></div>';

        var thumbSmall = q.thumbnail ? '<img class="sq-thumb" src="' + q.thumbnail + '">' : '<div class="sq-thumb sq-no-thumb">' + icons[q.status] + '</div>';

        return '<div class="sq-item sq-item-' + q.status + '">'
            + thumbSmall
            + '<div class="sq-item-info">'
            + '<div class="sq-title">' + q.title + '</div>'
            + '<div class="sq-meta">'
            + '<span>' + statusText + '</span>'
            + (q.format ? '<span class="sq-format-tag">' + q.format.toUpperCase() + '</span>' : '')
            + (isActive && q.percent > 0 ? '<span class="sq-pct">' + q.percent + '%</span>' : '')
            + '</div>'
            + progressBar
            + '</div>'
            + '<div class="sq-actions">' + buttons + '</div>'
            + '</div>';
    }).join('');

    // Badge global (toutes les tabs)
    sqUpdateGlobalBadge();
    // Barre de statut fixe en bas
    sqUpdateStatusbar();
}

// --- Badge global visible dans les tabs ---
function sqUpdateGlobalBadge() {
    let badge = document.getElementById('sqGlobalBadge');
    const count = sqQueue.filter(q => q.status === 'waiting' || q.status === 'active').length;
    if (!badge) {
        // Creer le badge a cote du titre Recherche dans les tabs
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(t => {
            if (t.textContent.includes('Recherche')) {
                badge = document.createElement('span');
                badge.id = 'sqGlobalBadge';
                badge.className = 'sq-global-badge';
                t.appendChild(badge);
            }
        });
    }
    if (badge) {
        badge.textContent = count > 0 ? count : '';
        badge.style.display = count > 0 ? 'inline-flex' : 'none';
    }
}

function sqUpdateStatusbar() {
    const bar = document.getElementById('sqStatusbar');
    if (!bar) return;

    const active = sqQueue.find(q => q.status === 'active');
    const waiting = sqQueue.filter(q => q.status === 'waiting').length;
    const done = sqQueue.filter(q => q.status === 'done' || q.status === 'skipped').length;
    const total = sqQueue.length;

    if (!active && waiting === 0) {
        // Rien en cours
        if (done > 0 && total > 0) {
            // Tout est fini
            bar.style.display = 'flex';
            bar.className = 'sq-statusbar sq-statusbar-done';
            document.getElementById('sqStatusTitle').textContent = done + ' telechargement(s) termine(s)';
            document.getElementById('sqStatusDetail').textContent = 'Cliquer pour voir la file d\'attente';
            document.getElementById('sqStatusBar').style.width = '100%';
            // Masquer apres 10 secondes
            clearTimeout(bar._hideTimer);
            bar._hideTimer = setTimeout(() => { bar.style.display = 'none'; }, 10000);
        } else {
            bar.style.display = 'none';
        }
        return;
    }

    clearTimeout(bar._hideTimer);
    bar.style.display = 'flex';
    bar.className = 'sq-statusbar';

    if (active) {
        document.getElementById('sqStatusTitle').textContent = active.title;
        const pct = active.percent || 0;
        document.getElementById('sqStatusDetail').textContent = pct + '% — ' + (waiting > 0 ? waiting + ' en attente' : 'dernier element');
        document.getElementById('sqStatusBar').style.width = pct + '%';
    } else {
        document.getElementById('sqStatusTitle').textContent = waiting + ' element(s) en attente';
        document.getElementById('sqStatusDetail').textContent = 'Telechargement va demarrer...';
        document.getElementById('sqStatusBar').style.width = '0%';
    }
}

// --- Actions ---
function sqRemove(index) {
    if (!sqQueue[index] || sqQueue[index].status === 'active') return;
    const url = sqQueue[index].url;
    sqQueue.splice(index, 1);
    fetch('api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=remove&url=' + encodeURIComponent(url)
    }).catch(() => {});
    sqRender();
}

function sqMoveUp(index) {
    if (index > 0 && sqQueue[index] && sqQueue[index].status === 'waiting') {
        [sqQueue[index], sqQueue[index - 1]] = [sqQueue[index - 1], sqQueue[index]];
        sqRender();
    }
}

function sqMoveDown(index) {
    if (index < sqQueue.length - 1 && sqQueue[index] && sqQueue[index].status === 'waiting') {
        [sqQueue[index], sqQueue[index + 1]] = [sqQueue[index + 1], sqQueue[index]];
        sqRender();
    }
}

function sqSkip(index) {
    if (!sqQueue[index] || sqQueue[index].status !== 'active') return;
    sqQueue[index]._skipped = true;
    sqQueue[index].status = 'error';
    sqQueue[index].message = 'Passe';
    sqAddLog('skip', sqQueue[index].title, 'Passe manuellement');
    sqSave(); sqRender();
}

function sqRetry(index) {
    if (!sqQueue[index] || sqQueue[index].status !== 'error') return;
    if (sqQueue[index].status === 'error') {
        sqQueue[index].status = 'waiting';
        sqQueue[index].jobId = null;
        sqQueue[index].percent = 0;
        sqQueue[index].message = '';
        sqQueue[index]._skipped = false;
        sqSave(); sqRender();
        if (!sqRunning) sqProcess();
    }
}

function sqClearDone() {
    sqQueue = sqQueue.filter(q => q.status !== 'done' && q.status !== 'skipped' && q.status !== 'error');
    fetch('api/queue', { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=clear&mode=done'
    }).catch(() => {});
    sqRender();
}

function sqClearAll() {
    sqQueue.forEach(q => {
        if (q.status === 'active') q._skipped = true;
    });
    sqQueue = [];
    sqRunning = false;
    fetch('api/queue', { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=clear&mode=all'
    }).catch(() => {});
    sqRender();
}

// --- Notifications (via serveur) ---
function sqAddLog(type, title, detail) {
    // Ajouter localement pour affichage immediat
    sqLog.unshift({ type, title, detail, time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) });
    if (sqLog.length > 100) sqLog.pop();
    sqRenderLog();
    // Envoyer au serveur
    fetch('api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=add&type=' + encodeURIComponent(type)
            + '&title=' + encodeURIComponent(title)
            + '&detail=' + encodeURIComponent(detail)
            + '&source=web'
    }).catch(() => {});
}

function sqRenderLog() {
    const body = document.getElementById('sqLogBody');
    const badge = document.getElementById('sqLogBadge');
    if (!body) return;

    if (badge) {
        badge.textContent = sqLog.length > 0 ? sqLog.length : '';
        badge.style.display = sqLog.length > 0 ? 'inline-flex' : 'none';
    }

    if (sqLog.length === 0) {
        body.innerHTML = '<div class="sq-empty">Aucune notification.</div>';
        return;
    }

    const icons = { skip: '&#9197;', success: '&#10003;', error: '&#10007;' };
    const cls = { skip: 'skip', success: 'ok', error: 'err' };
    body.innerHTML = sqLog.map(e =>
        '<div class="sq-log-item sq-log-' + (cls[e.type] || 'skip') + '">'
        + '<span class="sq-log-icon">' + (icons[e.type] || '&#8226;') + '</span>'
        + '<div class="sq-log-content">'
        + '<div class="sq-log-title">' + e.title + '</div>'
        + '<div class="sq-log-detail">' + e.detail + (e.source === 'extension' ? ' (ext)' : '') + '</div>'
        + '</div>'
        + '<span class="sq-log-time">' + e.time + '</span>'
        + '</div>'
    ).join('');
}

function sqClearLog() {
    sqLog = [];
    sqRenderLog();
    fetch('api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=clear'
    }).catch(() => {});
}

// Poll notifications serveur toutes les 3 secondes
async function sqPollNotifications() {
    try {
        const resp = await fetch('api/notifications?action=list');
        const data = await resp.json();
        if (!data.success || !data.notifications) return;
        sqLog = data.notifications.map(n => ({
            type: n.type, title: n.title, detail: n.detail,
            time: n.time, source: n.source
        }));
        sqRenderLog();
    } catch (e) {}
}

setInterval(sqPollNotifications, 3000);

// --- Processeur principal ---
async function sqProcess() {
    if (sqRunning) return;
    sqRunning = true;

    try {
        while (sqQueue.some(q => q.status === 'waiting')) {
            const item = sqQueue.find(q => q.status === 'waiting');
            if (!item) break;

            // Verifier l'etat actuel sur le serveur avant de traiter
            try {
                const checkResp = await fetch('api/queue?action=list');
                const checkData = await checkResp.json();
                if (checkData.success && checkData.queue) {
                    const serverItem = checkData.queue.find(q => q.url === item.url);
                    if (!serverItem) {
                        // Supprime du serveur par l'autre cote — retirer localement
                        sqQueue = sqQueue.filter(q => q.url !== item.url);
                        sqRender();
                        continue;
                    }
                    if (serverItem.status === 'active' || serverItem.status === 'done' || serverItem.status === 'skipped') {
                        // Deja pris en charge par l'extension — mettre a jour localement
                        item.status = serverItem.status;
                        item.percent = serverItem.percent || 0;
                        item.message = serverItem.message || '';
                        sqRender();
                        continue;
                    }
                }
            } catch (e) {}

            item.status = 'active';
            item._activeStart = Date.now();
            item.percent = 0;
            item.message = '';
            item._skipped = false;
            sqSave(); sqRender();

            try {
                // Anti-doublon
                const exists = await sqCheckUrl(item.url, item.format);
                if (exists) {
                    // Si dossier defini, deplacer l'element existant dedans
                    if (item.folder) {
                        try {
                            const listResp = await fetch('api/library?action=list');
                            const listData = await listResp.json();
                            if (listData.items) {
                                const videoId = item.url.match(/[?&]v=([^&]+)/)?.[1] || '';
                                const existing = listData.items.find(i => i.url && videoId && i.url.includes(videoId) && (i.format || '') === item.format);
                                if (existing && existing.folder !== item.folder) {
                                    await fetch('api/library', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                        body: 'action=move_item&item_id=' + encodeURIComponent(existing.id) + '&folder_id=' + encodeURIComponent(item.folder)
                                    });
                                    sqAddLog('skip', item.title, 'Deplace dans le dossier');
                                } else {
                                    sqAddLog('skip', item.title, 'Deja dans la bibliotheque');
                                }
                            }
                        } catch (e) {
                            sqAddLog('skip', item.title, 'Deja dans la bibliotheque');
                        }
                    } else {
                        sqAddLog('skip', item.title, 'Deja dans la bibliotheque');
                    }
                    item.status = 'skipped';
                    item.message = 'Deja en bibliotheque';
                    item.percent = 100;
                    sqSave(); sqRender();
                    continue;
                }

                // Info video
                item.message = 'Recuperation des infos...';
                sqRender();
                const infoResp = await fetch('api/info', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'url=' + encodeURIComponent(item.url)
                });
                const info = await infoResp.json();
                if (info.success) item.title = info.title;
                sqRender();

                // Lancer le telechargement
                item.message = 'Lancement...';
                sqRender();
                const dlResp = await fetch('api/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'url=' + encodeURIComponent(item.url)
                        + '&type=' + item.type + '&format=' + item.format
                        + '&quality=' + item.quality + '&cover=1'
                });
                const dlData = await dlResp.json();

                if (!dlData.success) {
                    item.status = 'error';
                    item.message = dlData.error || 'Erreur';
                    sqAddLog('error', item.title, dlData.error || 'Erreur de telechargement');
                    sqSave(); sqRender();
                    continue;
                }

                item.jobId = dlData.jobId;
                sqSave();

                // Poll progression avec timeout
                await new Promise((resolve) => {
                    let pollErrors = 0;
                    let lastMessage = '';
                    let lastPercent = -1;
                    let lastActivity = Date.now();
                    const STALL_TIMEOUT = 300000; // 5 min

                    const poll = setInterval(async () => {
                        // Skip demande
                        if (item._skipped) {
                            clearInterval(poll);
                            resolve();
                            return;
                        }
                        // Timeout inactivite
                        if (Date.now() - lastActivity > STALL_TIMEOUT) {
                            clearInterval(poll);
                            item.status = 'error';
                            item.message = 'Bloque (aucune activite depuis 5 min)';
                            sqAddLog('error', item.title, 'Bloque');
                            sqSave(); sqRender();
                            resolve();
                            return;
                        }
                        try {
                            const resp = await fetch('api/progress?id=' + dlData.jobId);
                            const data = await resp.json();
                            pollErrors = 0;

                            const curMsg = data.message || '';
                            const curPct = data.percent || 0;
                            if (curPct !== lastPercent || curMsg !== lastMessage || data.status === 'done' || data.status === 'error') {
                                lastPercent = curPct; lastMessage = curMsg; lastActivity = Date.now();
                            }

                            if (data.status === 'done') {
                                clearInterval(poll);
                                item.status = 'done';
                                item.percent = 100;
                                item.message = 'Termine';

                                // Ajouter a la bibliotheque
                                await fetch('api/library', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                    body: 'action=add_item&file=' + encodeURIComponent(data.file)
                                        + '&title=' + encodeURIComponent(item.title)
                                        + '&type=' + item.type + '&format=' + item.format
                                        + '&thumbnail=' + encodeURIComponent(item.thumbnail || '')
                                        + '&channel=' + encodeURIComponent(item.channel || '')
                                        + '&duration=' + encodeURIComponent(item.duration || '')
                                        + '&cover=' + encodeURIComponent(data.cover || '')
                                        + '&folder=' + encodeURIComponent(item.folder || '')
                                        + '&url=' + encodeURIComponent(item.url)
                                });
                                // Si pas de cover, reparer automatiquement
                                if (!data.cover) {
                                    fetch('api/library', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                        body: 'action=fix_covers'
                                    }).catch(() => {});
                                }
                                sqAddLog('success', item.title, item.format.toUpperCase());
                                notifyDone(item.title);
                                incrementDownloadCount();
                                sqSave(); sqRender();
                                resolve();
                            } else if (data.status === 'error') {
                                clearInterval(poll);
                                item.status = 'error';
                                item.message = data.message || 'Erreur';
                                sqAddLog('error', item.title, data.message || 'Erreur');
                                sqSave(); sqRender();
                                resolve();
                            } else {
                                item.percent = data.percent || 0;
                                item.message = data.message || '';
                                sqRender();
                            }
                        } catch (e) {
                            pollErrors++;
                            if (pollErrors >= 10) {
                                clearInterval(poll);
                                item.status = 'error';
                                item.message = 'Connexion perdue';
                                sqAddLog('error', item.title, 'Connexion perdue');
                                sqSave(); sqRender();
                                resolve();
                            }
                        }
                    }, 1000);
                });

            } catch (e) {
                item.status = 'error';
                item.message = 'Serveur inaccessible';
                sqAddLog('error', item.title, 'Serveur inaccessible');
                sqSave(); sqRender();
            }

            // Delai anti-blocage entre telechargements
            if (sqQueue.some(q => q.status === 'waiting')) {
                await new Promise(r => setTimeout(r, 2000 + Math.floor(Math.random() * 1000)));
            }
        }
    } finally {
        sqRunning = false;
        if (sqQueue.some(q => q.status === 'done')) loadSystemInfo();
        sqRender();
    }
}

// --- Resume apres refresh : reprendre les actifs bloques et relancer ---
async function sqResume() {
    let changed = false;
    for (const q of sqQueue) {
        if (q.status === 'active' && q.jobId) {
            // Verifier si le job tourne encore
            try {
                const resp = await fetch('api/progress?id=' + q.jobId);
                const data = await resp.json();
                if (data.status === 'done') {
                    q.status = 'done'; q.percent = 100; q.message = 'Termine';
                    changed = true;
                } else if (data.status === 'error') {
                    q.status = 'error'; q.message = data.message || 'Erreur';
                    changed = true;
                } else {
                    // Encore en cours, relancer le polling
                    sqResumePolling(q);
                }
            } catch (e) {
                q.status = 'error'; q.message = 'Connexion perdue';
                changed = true;
            }
        } else if (q.status === 'active') {
            q.status = 'waiting'; q.jobId = null; q.percent = 0; q.message = '';
            changed = true;
        }
    }
    if (changed) { sqSave(); sqRender(); }

    // Relancer si des waiting sans actif
    if (sqQueue.some(q => q.status === 'waiting') && !sqQueue.some(q => q.status === 'active') && !sqRunning) {
        sqProcess();
    }
}

function sqResumePolling(item) {
    let pollErrors = 0;
    let lastActivity = Date.now();
    const poll = setInterval(async () => {
        if (Date.now() - lastActivity > 300000) {
            clearInterval(poll);
            item.status = 'error'; item.message = 'Bloque';
            sqSave(); sqRender();
            if (sqQueue.some(q => q.status === 'waiting') && !sqRunning) sqProcess();
            return;
        }
        try {
            const resp = await fetch('api/progress?id=' + item.jobId);
            const data = await resp.json();
            pollErrors = 0;
            if (data.percent !== item.percent || data.message !== item.message) lastActivity = Date.now();

            if (data.status === 'done') {
                clearInterval(poll);
                item.status = 'done'; item.percent = 100; item.message = 'Termine';
                sqAddLog('success', item.title, item.format.toUpperCase());
                notifyDone(item.title);
                sqSave(); sqRender();
                if (sqQueue.some(q => q.status === 'waiting') && !sqRunning) sqProcess();
            } else if (data.status === 'error') {
                clearInterval(poll);
                item.status = 'error'; item.message = data.message || 'Erreur';
                sqSave(); sqRender();
                if (sqQueue.some(q => q.status === 'waiting') && !sqRunning) sqProcess();
            } else {
                item.percent = data.percent || 0;
                item.message = data.message || '';
                sqRender();
            }
        } catch (e) {
            pollErrors++;
            if (pollErrors >= 10) {
                clearInterval(poll);
                item.status = 'error'; item.message = 'Connexion perdue';
                sqSave(); sqRender();
            }
        }
    }, 1000);
}

// --- Watchdog : nettoie les bloques et relance (toutes les 15s) ---
setInterval(() => {
    let changed = false;
    sqQueue.forEach(q => {
        if (q.status === 'active' && q._activeStart && Date.now() - q._activeStart > 360000) {
            q.status = 'error'; q.message = 'Bloque (relance possible)';
            changed = true;
        }
    });
    if (changed) { sqSave(); sqRender(); }
    if (sqQueue.some(q => q.status === 'waiting') && !sqQueue.some(q => q.status === 'active') && !sqRunning) {
        sqProcess();
    }
}, 15000);

// --- Init au chargement ---
sqLogLoad();
sqRender();
sqRenderLog();
// Charger la queue depuis le serveur au demarrage
sqPollServer();

// ========== PLAYLIST DETECTION ==========
async function checkPlaylist(url) {
    if (!url.includes('list=')) return false;

    const result = document.getElementById('result');
    const progressZone = document.getElementById('progressZone');
    const progressText = document.getElementById('progressText');
    const progressBar = document.getElementById('progressBar');

    progressZone.classList.add('active');
    progressText.textContent = 'Detection de la playlist...';
    progressBar.style.width = '5%';

    try {
        const resp = await fetch('api/playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'url=' + encodeURIComponent(url)
        });
        const data = await resp.json();

        if (data.success && data.videos.length > 1) {
            progressZone.classList.remove('active');
            const type = document.querySelector('input[name="type"]:checked').value;
            const format = formatSelect.value;
            const quality = qualitySelect.value;
            const saveCover = document.getElementById('saveCover').checked ? '1' : '0';
            const folder = document.getElementById('targetFolder').value;

            result.innerHTML = '<div class="message success">'
                + 'Playlist detectee : ' + data.videos.length + ' videos'
                + '<br><button class="dl-btn" style="margin-top:10px;cursor:pointer;border:none;" onclick="addPlaylistToQueue()">Ajouter tout a la file d\'attente</button>'
                + '</div>';

            // Stocker les videos pour addPlaylistToQueue
            window._playlistVideos = data.videos;
            window._playlistParams = { type, format, quality, saveCover, folder };
            return true;
        }
    } catch (err) {}

    progressZone.classList.remove('active');
    return false;
}

function addPlaylistToQueue() {
    if (!window._playlistVideos) return;
    const p = window._playlistParams;
    window._playlistVideos.forEach(v => {
        downloadQueue.push({
            url: v.url, type: p.type, format: p.format, quality: p.quality,
            saveCover: p.saveCover, folder: p.folder, status: 'waiting',
            title: v.title, info: { success: true, title: v.title, thumbnail: v.thumbnail, channel: v.channel, duration: v.duration }
        });
    });
    renderQueue();
    document.getElementById('result').innerHTML = '<div class="message success">Playlist ajoutee ! ' + window._playlistVideos.length + ' videos en file d\'attente.</div>';
    window._playlistVideos = null;
    if (!queueProcessing) processQueue();
}

// ========== DOWNLOAD QUEUE ==========
let downloadQueue = [];
let queueProcessing = false;

function saveQueue() {
    const toSave = downloadQueue.filter(q => q.status !== 'done').map(q => ({
        url: q.url, type: q.type, format: q.format, quality: q.quality,
        saveCover: q.saveCover, folder: q.folder, status: q.status,
        title: q.title, jobId: q.jobId, info: q.info || null
    }));
    localStorage.setItem('ytQueue', JSON.stringify(toSave));
}

function restoreQueue() {
    try {
        const saved = JSON.parse(localStorage.getItem('ytQueue') || '[]');
        if (!saved.length) return;
        downloadQueue = saved;
        renderQueue();
        // Reprendre le polling pour les telechargements actifs (ont un jobId)
        saved.forEach((q, idx) => {
            if (q.status === 'active' && q.jobId) {
                resumePolling(idx);
            }
        });
        // Relancer la queue pour les "waiting"
        if (saved.some(q => q.status === 'waiting') && !queueProcessing) {
            processQueue();
        }
    } catch (e) {}
}

function resumePolling(idx) {
    const item = downloadQueue[idx];
    if (!item || !item.jobId) return;
    const interval = setInterval(async () => {
        try {
            const resp = await fetch('api/progress?id=' + item.jobId);
            const data = await resp.json();
            if (data.status === 'done') {
                clearInterval(interval);
                item.status = 'done';
                notifyDone(item.title);
                addHistory(item.title, 'success', item.format, item.type, item.url, item.info);
                await fetch('api/library', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'action=add_item&file=' + encodeURIComponent(data.file)
                        + '&title=' + encodeURIComponent((item.info && item.info.title) || item.title)
                        + '&type=' + item.type + '&format=' + item.format
                        + '&folder=' + encodeURIComponent(item.folder || '')
                        + '&thumbnail=' + encodeURIComponent((item.info && item.info.thumbnail) || '')
                        + '&channel=' + encodeURIComponent((item.info && item.info.channel) || '')
                        + '&duration=' + encodeURIComponent((item.info && item.info.duration) || '')
                        + '&cover=' + encodeURIComponent(data.cover || '')
                        + '&url=' + encodeURIComponent(item.url)
                });
                incrementDownloadCount();
                loadSystemInfo();
                renderQueue();
                saveQueue();
            } else if (data.status === 'error') {
                clearInterval(interval);
                item.status = 'error';
                addHistory(item.title, 'error', item.format, item.type, item.url, item.info);
                renderQueue();
                saveQueue();
            }
        } catch (err) {}
    }, 500);
}

function addToQueue() {
    const url = document.getElementById('url').value.trim();
    if (!url) return;

    const type = document.querySelector('input[name="type"]:checked').value;
    const format = formatSelect.value;
    const quality = qualitySelect.value;
    const saveCover = document.getElementById('saveCover').checked ? '1' : '0';
    const folder = document.getElementById('targetFolder').value;

    downloadQueue.push({ url, type, format, quality, saveCover, folder, status: 'waiting', title: url, jobId: null });
    document.getElementById('url').value = '';
    renderQueue();
    saveQueue();

    // Recuperer le titre en arriere-plan
    const idx = downloadQueue.length - 1;
    fetch('api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'url=' + encodeURIComponent(url)
    }).then(r => r.json()).then(info => {
        if (info.success && downloadQueue[idx]) {
            downloadQueue[idx].title = info.title;
            downloadQueue[idx].info = info;
            renderQueue();
        }
    }).catch(() => {});

    if (!queueProcessing) processQueue();
}

function removeFromQueue(idx) {
    if (downloadQueue[idx] && downloadQueue[idx].status === 'waiting') {
        downloadQueue.splice(idx, 1);
        renderQueue();
        saveQueue();
    }
}

function renderQueue() {
    const section = document.getElementById('queueSection');
    const list = document.getElementById('queueList');
    const waiting = downloadQueue.filter(q => q.status !== 'done');

    if (waiting.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    section.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    document.getElementById('queueCount').textContent = waiting.length;

    list.innerHTML = downloadQueue.map((q, i) => {
        if (q.status === 'done') return '';
        const statusClass = q.status === 'active' ? 'active' : (q.status === 'done' ? 'done' : '');
        const statusText = q.status === 'active' ? 'En cours...' : (q.status === 'error' ? 'Erreur' : 'En attente');
        return '<div class="queue-item">'
            + '<span class="qi-title">' + q.title + '</span>'
            + '<span class="qi-status ' + statusClass + '">' + statusText + '</span>'
            + (q.status === 'waiting' ? '<button class="qi-remove" onclick="removeFromQueue(' + i + ')">&times;</button>' : '')
            + '</div>';
    }).join('');
}

async function processQueue() {
    queueProcessing = true;

    while (downloadQueue.some(q => q.status === 'waiting')) {
        const idx = downloadQueue.findIndex(q => q.status === 'waiting');
        if (idx === -1) break;

        const item = downloadQueue[idx];
        item.status = 'active';
        renderQueue();
        saveQueue();

        try {
            // Recuperer info si pas deja fait
            if (!item.info) {
                const infoResp = await fetch('api/info', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'url=' + encodeURIComponent(item.url)
                });
                item.info = await infoResp.json();
                if (!item.info.success) { item.status = 'error'; renderQueue(); saveQueue(); continue; }
                item.title = item.info.title;
                renderQueue();
                saveQueue();
            }

            // Lancer le telechargement
            await new Promise((resolve) => {
                queueDownload(item, resolve);
            });
        } catch (err) {
            item.status = 'error';
            addHistory(item.title, 'error', item.format, item.type, item.url, item.info);
            renderQueue();
            saveQueue();
        }

        // Delai anti-blocage (3-5s) entre chaque telechargement
        if (downloadQueue.some(q => q.status === 'waiting')) {
            await new Promise(r => setTimeout(r, 3000 + Math.floor(Math.random() * 2000)));
        }
    }

    queueProcessing = false;
    renderQueue();
    saveQueue();
}

function queueDownload(item, resolve) {
    fetch('api/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'url=' + encodeURIComponent(item.url) + '&type=' + item.type + '&format=' + item.format
            + '&quality=' + item.quality + '&cover=' + item.saveCover
    }).then(r => r.json()).then(dlData => {
        if (!dlData.success) { item.status = 'error'; renderQueue(); saveQueue(); resolve(); return; }

        item.jobId = dlData.jobId;
        saveQueue();

        const interval = setInterval(async () => {
            try {
                const resp = await fetch('api/progress?id=' + dlData.jobId);
                const data = await resp.json();
                if (data.status === 'done') {
                    clearInterval(interval);
                    item.status = 'done';
                    notifyDone(item.title);
                    addHistory(item.title, 'success', item.format, item.type, item.url, item.info);
                    await fetch('api/library', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: 'action=add_item&file=' + encodeURIComponent(data.file)
                            + '&title=' + encodeURIComponent(item.info.title)
                            + '&type=' + item.type + '&format=' + item.format
                            + '&folder=' + encodeURIComponent(item.folder)
                            + '&thumbnail=' + encodeURIComponent(item.info.thumbnail)
                            + '&channel=' + encodeURIComponent(item.info.channel)
                            + '&duration=' + encodeURIComponent(item.info.duration)
                            + '&cover=' + encodeURIComponent(data.cover || '')
                            + '&url=' + encodeURIComponent(item.url)
                    });
                    incrementDownloadCount();
                    loadSystemInfo();
                    renderQueue();
                    saveQueue();
                    resolve();
                } else if (data.status === 'error') {
                    clearInterval(interval);
                    item.status = 'error';
                    addHistory(item.title, 'error', item.format, item.type, item.url, item.info);
                    renderQueue();
                    saveQueue();
                    resolve();
                }
            } catch (err) {}
        }, 500);
    }).catch(() => { item.status = 'error'; renderQueue(); saveQueue(); resolve(); });
}

// ========== HISTORY ==========
async function addHistory(title, status, format, type, url, info) {
    const extra = info || {};
    await fetch('api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=add&title=' + encodeURIComponent(title) + '&status=' + status
            + '&format=' + format + '&type=' + type + '&url=' + encodeURIComponent(url || '')
            + '&channel=' + encodeURIComponent(extra.channel || '')
            + '&views=' + encodeURIComponent(extra.views_display || '')
            + '&year=' + encodeURIComponent(extra.year || '')
            + '&likes=' + encodeURIComponent(extra.likes || '0')
            + '&dislikes=' + encodeURIComponent(extra.dislikes || '0')
            + '&thumbnail=' + encodeURIComponent(extra.thumbnail || '')
    }).catch(() => {});
}

function formatLikes(n) {
    n = parseInt(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return '' + n;
}

let historyCache = [];

async function loadHistory() {
    try {
        const resp = await fetch('api/history?action=list');
        const data = await resp.json();
        if (!data.success) return;

        historyCache = data.history || [];
        const container = document.getElementById('historyList');
        const actionsBar = document.getElementById('historyActions');

        if (historyCache.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Aucun historique.</p>';
            actionsBar.style.display = 'none';
            return;
        }

        actionsBar.style.display = 'block';

        // Charger la bibliotheque pour detecter les doublons
        let libItems = [];
        try {
            const libResp = await fetch('api/library', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=list' });
            const libData = await libResp.json();
            if (libData.success) libItems = libData.items || [];
        } catch (e) {}

        container.innerHTML = historyCache.slice(0, 100).map((h, i) => {
            const icon = h.status === 'success' ? '&#10003;' : '&#10007;';
            const cls = h.status === 'success' ? 'success' : 'error';
            const views = h.views ? h.views : '';
            const year = h.year ? h.year : '';
            const likes = h.likes ? formatLikes(h.likes) : '';
            const dislikes = h.dislikes ? formatLikes(h.dislikes) : '';
            let meta = '';
            if (h.channel) meta += h.channel;
            if (views) meta += (meta ? ' · ' : '') + views;
            if (year) meta += (meta ? ' · ' : '') + year;
            if (likes) meta += (meta ? ' · ' : '') + '&#9650; ' + likes;
            if (dislikes && parseInt(h.dislikes) > 0) meta += ' · &#9660; ' + dislikes;
            const hasUrl = h.url && h.url.length > 5;

            // Detecter si deja dans la bibliotheque
            let inLib = false;
            if (hasUrl) {
                const vMatch = h.url.match(/[?&]v=([^&]+)/);
                const vid = vMatch ? vMatch[1] : '';
                if (vid) inLib = libItems.some(item => item.url && item.url.includes(vid) && (item.format || '') === (h.format || ''));
            }

            // Thumbnail : depuis l'historique ou fallback YouTube
            let thumb = h.thumbnail || '';
            if (!thumb && hasUrl) {
                const vMatch = h.url.match(/[?&]v=([^&]+)/);
                if (vMatch) thumb = 'https://i.ytimg.com/vi/' + vMatch[1] + '/mqdefault.jpg';
            }

            const source = h.source || 'local';
            const isLocal = source === 'local';
            const sourceBadge = isLocal
                ? '<span class="hi-badge-local">Local</span>'
                : '<span class="hi-badge-import" title="Importe depuis: ' + source + '">' + source + '</span>';

            return '<div class="history-item' + (hasUrl ? '' : ' no-url') + (inLib ? ' in-lib' : '') + '" data-idx="' + i + '" data-inlib="' + (inLib ? '1' : '0') + '"' + (hasUrl ? ' draggable="true" ondragstart="histDragStart(event, ' + i + ')"' : '') + '>'
                + (hasUrl ? '<input type="checkbox" class="hist-check" data-idx="' + i + '" onchange="historyUpdateCount()">' : '<span style="width:20px;display:inline-block;"></span>')
                + (thumb ? '<img class="hi-thumb" src="' + thumb + '" loading="lazy">' : '')
                + '<span class="hi-icon ' + cls + '">' + icon + '</span>'
                + '<div class="hi-body">'
                + '<span class="hi-title">' + h.title + (inLib ? ' <span class="hi-badge-lib">Dans la biblio</span>' : '') + '</span>'
                + (meta ? '<span class="hi-stats">' + meta + '</span>' : '')
                + '</div>'
                + sourceBadge
                + (hasUrl ? '<button class="hi-stream-btn hi-stream-audio" onclick="streamFromHistory(' + i + ',\'audio\')">&#9654; Ecouter</button>' : '')
                + (hasUrl ? '<button class="hi-stream-btn hi-stream-video" onclick="playYoutubeVideo(\'' + (h.url || '').replace(/'/g, "\\'") + '\', \'' + (h.title || '').replace(/'/g, "\\'") + '\')">&#9654; Video</button>' : '')
                + (hasUrl ? '<button class="hi-stream-btn hi-stream-flow" onclick="addToFlowFromHistory(' + i + ', this)">+ Flow</button>' : '')
                + '<span class="hi-format">' + (h.format || '').toUpperCase() + '</span>'
                + '<span class="hi-type">' + (h.type === 'video' ? 'Video' : 'Audio') + '</span>'
                + '<span class="hi-date">' + (h.date || '').split(' ')[0] + '</span>'
                + '</div>';
        }).join('');

        // Generer les filtres par source
        const sources = new Set(historyCache.map(h => h.source || 'local'));
        const filtersDiv = document.getElementById('historyFilters');
        if (sources.size > 1) {
            filtersDiv.style.display = 'flex';
            let filtersHtml = '<span class="hist-filter active" onclick="filterHistory(\'all\', this)">Tout (' + historyCache.length + ')</span>';
            for (const s of sources) {
                const count = historyCache.filter(h => (h.source || 'local') === s).length;
                const label = s === 'local' ? 'Local' : s;
                filtersHtml += '<span class="hist-filter" onclick="filterHistory(\'' + s.replace(/'/g, "\\'") + '\', this)">' + label + ' (' + count + ')</span>';
            }
            filtersDiv.innerHTML = filtersHtml;
        } else {
            filtersDiv.style.display = 'none';
        }

        historyUpdateCount();
    } catch (err) {}
}

let historyFilterSource = 'all';
let historyFilterPresence = 'all';

function filterHistory(source, el) {
    historyFilterSource = source;
    document.querySelectorAll('.hist-filter').forEach(f => f.classList.remove('active'));
    if (el) el.classList.add('active');
    applyHistoryFilters();
}

function sortHistory() {
    const sort = document.getElementById('historySortBy').value;
    historyCache.sort((a, b) => {
        switch (sort) {
            case 'date-desc': return (b.date || '').localeCompare(a.date || '');
            case 'date-asc': return (a.date || '').localeCompare(b.date || '');
            case 'title-asc': return (a.title || '').localeCompare(b.title || '', 'fr');
            case 'title-desc': return (b.title || '').localeCompare(a.title || '', 'fr');
            case 'type-audio': return (a.type === 'audio' ? 0 : 1) - (b.type === 'audio' ? 0 : 1);
            case 'type-video': return (a.type === 'video' ? 0 : 1) - (b.type === 'video' ? 0 : 1);
            default: return 0;
        }
    });
    loadHistory();
}

function filterHistorySearch() {
    applyHistoryFilters();
}

function filterHistoryPresence(val, el) {
    historyFilterPresence = val;
    el.parentElement.querySelectorAll('.hist-filter').forEach(f => f.classList.remove('active'));
    el.classList.add('active');
    applyHistoryFilters();
}

function applyHistoryFilters() {
    const search = (document.getElementById('historySearch').value || '').toLowerCase().trim();
    document.querySelectorAll('.history-item').forEach(item => {
        const idx = parseInt(item.dataset.idx);
        const h = historyCache[idx];
        if (!h) return;
        const itemSource = h.source || 'local';
        const inLib = item.dataset.inlib === '1';
        const matchSource = historyFilterSource === 'all' || itemSource === historyFilterSource;
        const matchSearch = !search || (h.title || '').toLowerCase().includes(search) || (h.channel || '').toLowerCase().includes(search);
        const matchPresence = historyFilterPresence === 'all' || (historyFilterPresence === 'present' && inLib) || (historyFilterPresence === 'absent' && !inLib);
        item.style.display = (matchSource && matchSearch && matchPresence) ? '' : 'none';
    });
    historyUpdateCount();
}

function historyUpdateCount() {
    const checks = document.querySelectorAll('.hist-check:checked');
    document.getElementById('historySelCount').textContent = checks.length + ' selectionne(s)';
}

function historySelectAll() {
    document.querySelectorAll('.hist-check').forEach(cb => cb.checked = true);
    historyUpdateCount();
    document.getElementById('btnHistSelectAll').style.display = 'none';
    document.getElementById('btnHistDeselectAll').style.display = '';
}

function historyDeselectAll() {
    document.querySelectorAll('.hist-check').forEach(cb => cb.checked = false);
    historyUpdateCount();
    document.getElementById('btnHistSelectAll').style.display = '';
    document.getElementById('btnHistDeselectAll').style.display = 'none';
}

function historyGetSelected() {
    const selected = [];
    document.querySelectorAll('.hist-check:checked').forEach(cb => {
        const idx = parseInt(cb.dataset.idx);
        if (historyCache[idx]) {
            const item = Object.assign({}, historyCache[idx]);
            item._histIdx = idx;
            selected.push(item);
        }
    });
    return selected;
}

async function historyRedownload() {
    const selected = historyGetSelected();
    if (selected.length === 0) { alert('Selectionne au moins un element.'); return; }

    // Lire le format choisi
    const formatSel = document.getElementById('redownloadFormat').value;
    let dlType, dlFormat;
    if (formatSel === 'original') {
        dlType = null; dlFormat = null; // garder le format d'origine de chaque element
    } else {
        const parts = formatSel.split(':');
        dlType = parts[0];
        dlFormat = parts[1];
    }

    // Verifier les doublons
    let libItems = [];
    try {
        const libResp = await fetch('api/library', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=list' });
        const libData = await libResp.json();
        if (libData.success) libItems = libData.items || [];
    } catch (e) {}

    // Marquer chaque element comme doublon ou non
    for (const h of selected) {
        h._skip = false;
        if (!h.url) { h._skip = true; h._skipReason = 'Pas d\'URL'; continue; }
        const vMatch = h.url.match(/[?&]v=([^&]+)/);
        const vid = vMatch ? vMatch[1] : '';
        const checkFormat = dlFormat || h.format || '';
        const inLib = vid && libItems.some(item => item.url && item.url.includes(vid) && (item.format || '') === checkFormat);
        if (inLib) { h._skip = true; h._skipReason = 'Deja dans la bibliotheque'; }
    }

    // Afficher la file de re-telechargement
    const queueDiv = document.getElementById('redownloadQueue');
    const listDiv = document.getElementById('redownloadList');
    const countSpan = document.getElementById('redownloadCount');
    queueDiv.style.display = 'block';

    // Creer les elements visuels
    // Thumbnail fallback YouTube
    function getThumb(h) {
        if (h.thumbnail) return h.thumbnail;
        if (h.url) { const m = h.url.match(/[?&]v=([^&]+)/); if (m) return 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg'; }
        return '';
    }

    listDiv.innerHTML = selected.map((h, i) => {
        const thumb = getThumb(h);
        const useType = dlType || h.type || 'audio';
        const useFormat = dlFormat || h.format || 'mp3';
        const skipped = h._skip;
        return '<div class="queue-item rdl-item' + (skipped ? ' rdl-skipped' : '') + '" id="rdl-' + i + '">'
            + (thumb ? '<img src="' + thumb + '" class="rdl-thumb">' : '')
            + '<div class="rdl-info">'
            + '<div class="qi-title">' + (h.title || 'Sans titre') + '</div>'
            + '<div class="rdl-meta">' + useFormat.toUpperCase() + ' ' + (useType === 'video' ? 'Video' : 'Audio') + (h.channel ? ' · ' + h.channel : '') + '</div>'
            + (skipped ? '' : '<div class="rdl-bar-wrap"><div class="rdl-bar" id="rdl-bar-' + i + '"></div></div>')
            + '</div>'
            + '<div class="rdl-right">'
            + '<div class="rdl-percent" id="rdl-percent-' + i + '">' + (skipped ? '' : '0%') + '</div>'
            + '<div class="qi-status' + (skipped ? '' : '') + '" id="rdl-status-' + i + '" style="' + (skipped ? 'color:var(--text-muted)' : '') + '">' + (skipped ? h._skipReason : 'En attente') + '</div>'
            + '</div>'
            + '</div>';
    }).join('');

    let done = 0;
    countSpan.textContent = '0/' + selected.length;

    for (let i = 0; i < selected.length; i++) {
        const h = selected[i];
        const statusEl = document.getElementById('rdl-status-' + i);
        const itemEl = document.getElementById('rdl-' + i);

        if (h._skip) {
            done++;
            countSpan.textContent = done + '/' + selected.length;
            continue;
        }

        // Marquer comme actif
        const barEl = document.getElementById('rdl-bar-' + i);
        const pctEl = document.getElementById('rdl-percent-' + i);
        statusEl.textContent = 'Connexion...';
        statusEl.className = 'qi-status active';
        itemEl.style.borderColor = 'var(--blue)';
        itemEl.style.background = 'rgba(33,150,243,0.05)';
        if (barEl) { barEl.style.width = '5%'; barEl.style.background = 'var(--blue)'; }

        try {
            const type = dlType || h.type || 'audio';
            const format = dlFormat || h.format || 'mp3';
            const quality = type === 'audio' ? '0' : 'best';

            const dlResp = await fetch('api/download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'url=' + encodeURIComponent(h.url) + '&type=' + type + '&format=' + format + '&quality=' + quality + '&cover=1'
            });
            const dlData = await dlResp.json();

            if (dlData.success) {
                logTech('INFO', 'Re-telechargement lance', { title: h.title, jobId: dlData.jobId });

                // Suivre la progression
                await new Promise((resolve) => {
                    const poll = setInterval(async () => {
                        try {
                            const pResp = await fetch('api/progress?id=' + dlData.jobId);
                            const pData = await pResp.json();

                            if (pData.status === 'done') {
                                clearInterval(poll);
                                statusEl.textContent = 'Termine !';
                                statusEl.className = 'qi-status done';
                                itemEl.style.borderColor = 'var(--success)';
                                itemEl.style.background = 'rgba(76,175,80,0.05)';
                                if (barEl) { barEl.style.width = '100%'; barEl.style.background = 'var(--success)'; }
                                if (pctEl) pctEl.textContent = '100%';
                                // Mettre a jour l'icone dans l'historique (croix -> check)
                                const histItem = document.querySelector('.history-item[data-idx="' + selected[i]._histIdx + '"] .hi-icon');
                                if (histItem) { histItem.innerHTML = '&#10003;'; histItem.className = 'hi-icon success'; }
                                // Ajouter a la bibliotheque
                                fetch('api/library', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                    body: 'action=add_item&file=' + encodeURIComponent(pData.file || '')
                                        + '&title=' + encodeURIComponent(h.title || '')
                                        + '&type=' + (h.type || 'audio') + '&format=' + (h.format || 'mp3')
                                        + '&folder=' + '&thumbnail='
                                        + '&channel=' + encodeURIComponent(h.channel || '')
                                        + '&duration=&cover=' + encodeURIComponent(pData.cover || '')
                                        + '&url=' + encodeURIComponent(h.url || '')
                                }).catch(() => {});
                                resolve();
                            } else if (pData.status === 'error') {
                                clearInterval(poll);
                                statusEl.textContent = 'Erreur';
                                statusEl.className = 'qi-status';
                                statusEl.style.color = 'var(--error)';
                                itemEl.style.borderColor = 'var(--error)';
                                itemEl.style.background = 'rgba(244,67,54,0.05)';
                                if (barEl) { barEl.style.width = '100%'; barEl.style.background = 'var(--error)'; }
                                if (pctEl) pctEl.textContent = '!';
                                resolve();
                            } else {
                                const pct = pData.percent || 0;
                                statusEl.textContent = pData.message || 'En cours...';
                                if (barEl) barEl.style.width = Math.max(5, pct) + '%';
                                if (pctEl) pctEl.textContent = pct + '%';
                            }
                        } catch (e) {
                            statusEl.textContent = 'Connexion...';
                        }
                    }, 1500);

                    // Timeout de 5 minutes max par element
                    setTimeout(() => { clearInterval(poll); resolve(); }, 300000);
                });
            } else {
                statusEl.textContent = dlData.error || 'Erreur';
                statusEl.className = 'qi-status';
                statusEl.style.color = 'var(--error)';
                itemEl.style.borderColor = 'var(--error)';
            }
        } catch (e) {
            statusEl.textContent = 'Erreur reseau';
            statusEl.className = 'qi-status';
            statusEl.style.color = 'var(--error)';
            logTech('ERROR', 'Echec re-telechargement', { title: h.title, error: e.message });
        }

        done++;
        countSpan.textContent = done + '/' + selected.length;

        // Delai entre chaque pour eviter le 429
        if (i < selected.length - 1) await new Promise(r => setTimeout(r, 3000));
    }

    countSpan.textContent = done + '/' + selected.length + ' - Termine !';
}

function historyExport() {
    const selected = historyGetSelected();
    const toExport = selected.length > 0 ? selected : historyCache;
    const blob = new Blob([JSON.stringify(toExport, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'youtube_downloads_' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
}

function historyImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const sourceName = file.name.replace('.json', '');
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            if (!Array.isArray(imported)) { alert('Fichier invalide.'); return; }

            // Dedoublonner : ne pas importer les URLs deja presentes
            const existingUrls = new Set(historyCache.map(h => h.url).filter(Boolean));
            let added = 0, skipped = 0;

            for (const h of imported) {
                if (h.url && existingUrls.has(h.url)) { skipped++; continue; }
                await fetch('api/history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'action=add&title=' + encodeURIComponent(h.title || '')
                        + '&status=' + encodeURIComponent(h.status || 'success')
                        + '&format=' + encodeURIComponent(h.format || '')
                        + '&type=' + encodeURIComponent(h.type || '')
                        + '&url=' + encodeURIComponent(h.url || '')
                        + '&channel=' + encodeURIComponent(h.channel || '')
                        + '&views=' + encodeURIComponent(h.views || '')
                        + '&year=' + encodeURIComponent(h.year || '')
                        + '&likes=' + encodeURIComponent(h.likes || '0')
                        + '&dislikes=' + encodeURIComponent(h.dislikes || '0')
                        + '&thumbnail=' + encodeURIComponent(h.thumbnail || '')
                        + '&source=' + encodeURIComponent(h.source === 'local' ? sourceName : (h.source || sourceName))
                });
                if (h.url) existingUrls.add(h.url);
                added++;
            }
            let msg = added + ' element(s) importe(s) depuis "' + sourceName + '"';
            if (skipped > 0) msg += '\n' + skipped + ' doublon(s) ignore(s)';
            alert(msg);
            loadHistory();
        } catch (err) {
            alert('Erreur de lecture du fichier.');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ========== STREAMING ==========
let currentStreamIdx = -1;
let preloadedNext = null; // { idx, type, streamUrl }

// Cache des fichiers locaux de la bibliotheque
let historyLibCache = [];

async function streamFromHistory(idx, type) {
    const h = historyCache[idx];
    if (!h || !h.url) return;

    const playerDiv = document.getElementById('streamPlayer');
    const audioEl = document.getElementById('streamAudio');
    const videoEl = document.getElementById('streamVideo');
    const titleEl = document.getElementById('streamTitle');
    const metaEl = document.getElementById('streamMeta');
    const thumbEl = document.getElementById('streamThumb');

    // Arreter le flux en cours
    audioEl.pause(); audioEl.src = '';
    videoEl.pause(); videoEl.src = '';

    playerDiv.style.display = 'block';
    titleEl.textContent = h.title || 'Chargement...';
    currentStreamIdx = idx;

    // Thumbnail
    let thumb = h.thumbnail || '';
    if (!thumb && h.url) {
        const m = h.url.match(/[?&]v=([^&]+)/);
        if (m) thumb = 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg';
    }
    thumbEl.src = thumb;

    // Marquer visuellement
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('hi-playing'));
    const histEl = document.querySelector('.history-item[data-idx="' + idx + '"]');
    if (histEl) histEl.classList.add('hi-playing');

    // Verifier si le fichier est present localement
    if (historyLibCache.length === 0) {
        try {
            const libResp = await fetch('api/library', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=list' });
            const libData = await libResp.json();
            if (libData.success) historyLibCache = libData.items || [];
        } catch (e) {}
    }

    const vMatch = h.url.match(/[?&]v=([^&]+)/);
    const vid = vMatch ? vMatch[1] : '';
    const localItem = vid ? historyLibCache.find(item => item.url && item.url.includes(vid)) : null;

    if (localItem && localItem.file) {
        // Si on demande video mais le fichier local est audio, passer au streaming
        if (type === 'video' && localItem.type !== 'video') {
            // Ne pas utiliser le local, continuer vers le streaming YouTube
        } else {
            // Lecture locale
            const localUrl = localItem.file.split('/').map(encodeURIComponent).join('/');

            if (type === 'video' && localItem.type === 'video') {
                audioEl.style.display = 'none';
                videoEl.style.display = 'block';
                videoEl.src = localUrl;
                videoEl.play().catch(() => {});
            } else {
                videoEl.style.display = 'none';
                audioEl.style.display = 'block';
                audioEl.src = localUrl;
                audioEl.play().catch(() => {});
            }
            metaEl.textContent = (h.channel || '') + (h.channel ? ' · ' : '') + 'Lecture locale';
            logTech('INFO', 'Lecture locale', { title: h.title });

            preloadNext(idx, type);
            const mediaEl = (type === 'video' && localItem.type === 'video') ? videoEl : audioEl;
            mediaEl.onended = function() { playNextStream(idx, type); };
            return;
        }
    }

    // Sinon streaming YouTube
    metaEl.textContent = 'Recuperation du flux ' + (type === 'video' ? 'video' : 'audio') + '...';

    try {
        let streamUrl;
        if (preloadedNext && preloadedNext.idx === idx && preloadedNext.type === type) {
            streamUrl = preloadedNext.streamUrl;
            preloadedNext = null;
            logTech('INFO', 'Stream pre-charge utilise', { title: h.title });
        } else {
            const resp = await fetch('api/stream?url=' + encodeURIComponent(h.url) + '&type=' + type);
            const data = await resp.json();
            if (!data.success) {
                metaEl.textContent = 'Erreur : ' + (data.error || 'Flux indisponible');
                return;
            }
            streamUrl = data.streamUrl;
        }

        if (type === 'video') {
            audioEl.style.display = 'none';
            videoEl.style.display = 'block';
            videoEl.src = streamUrl;
            videoEl.play().catch(() => {});
        } else {
            videoEl.style.display = 'none';
            audioEl.style.display = 'block';
            audioEl.src = streamUrl;
            audioEl.play().catch(() => {});
        }
        metaEl.textContent = (h.channel || '') + (h.channel ? ' · ' : '') + 'Streaming YouTube';
        logTech('INFO', 'Stream YouTube', { title: h.title, type });

        preloadNext(idx, type);
        const mediaEl = type === 'video' ? videoEl : audioEl;
        mediaEl.onended = function() { playNextStream(idx, type); };

    } catch (e) {
        metaEl.textContent = 'Erreur de connexion';
        logTech('ERROR', 'Echec stream', { title: h.title, error: e.message });
    }
}

function getNextStreamIdx(currentIdx) {
    const items = document.querySelectorAll('.history-item:not([style*="display: none"])');
    let foundCurrent = false;
    for (const item of items) {
        const idx = parseInt(item.dataset.idx);
        if (idx === currentIdx) { foundCurrent = true; continue; }
        if (foundCurrent && historyCache[idx] && historyCache[idx].url) {
            return idx;
        }
    }
    return -1;
}

function preloadNext(currentIdx, type) {
    const nextIdx = getNextStreamIdx(currentIdx);
    if (nextIdx === -1) { preloadedNext = null; return; }

    const h = historyCache[nextIdx];
    logTech('INFO', 'Pre-chargement du suivant', { title: h.title });

    fetch('api/stream?url=' + encodeURIComponent(h.url) + '&type=' + type)
        .then(r => r.json())
        .then(data => {
            if (data.success && currentStreamIdx === currentIdx) {
                preloadedNext = { idx: nextIdx, type, streamUrl: data.streamUrl };
                logTech('INFO', 'Pre-chargement OK', { title: h.title });
            }
        })
        .catch(() => { preloadedNext = null; });
}

function playNextStream(currentIdx, type) {
    const nextIdx = getNextStreamIdx(currentIdx);
    if (nextIdx === -1) {
        document.getElementById('streamMeta').textContent = 'Fin de la liste';
        return;
    }
    streamFromHistory(nextIdx, type);
}

function stopStream() {
    const audioEl = document.getElementById('streamAudio');
    const videoEl = document.getElementById('streamVideo');
    audioEl.pause(); audioEl.src = '';
    videoEl.pause(); videoEl.src = '';
    document.getElementById('streamPlayer').style.display = 'none';
    document.querySelectorAll('.history-item').forEach(el => el.classList.remove('hi-playing'));
    currentStreamIdx = -1;
    preloadedNext = null;
}

async function addToFlowFromHistory(idx, btn) {
    const h = historyCache[idx];
    if (!h || !h.url) return;
    btn.textContent = '...';
    btn.disabled = true;
    try {
        const resp = await fetch('api/flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=add&url=' + encodeURIComponent(h.url)
                + '&title=' + encodeURIComponent(h.title || '')
                + '&channel=' + encodeURIComponent(h.channel || '')
                + '&thumbnail=' + encodeURIComponent(h.thumbnail || '')
                + '&views=' + encodeURIComponent(h.views || '')
                + '&year=' + encodeURIComponent(h.year || '')
                + '&format=' + encodeURIComponent(h.format || '')
                + '&type=' + encodeURIComponent(h.type || 'audio')
        });
        const data = await resp.json();
        if (data.duplicate) {
            btn.textContent = 'Deja dans Flow';
            btn.style.background = 'var(--text-muted)';
        } else {
            btn.textContent = 'Ajoute !';
            btn.style.background = 'var(--success)';
        }
    } catch (e) {
        btn.textContent = 'Erreur';
        btn.style.background = 'var(--error)';
    }
}

// ========== MON FLOW ==========
let flowTracks = [];
let flowPlaylists = [];
let flowCurrentIdx = -1;
let flowCurrentType = 'audio';
let flowShuffle = false;
let flowCurrentPlaylist = '';
let flowPreloaded = null;

let flowLibItems = [];

async function loadFlow() {
    try {
        const resp = await fetch('api/flow?action=list');
        const data = await resp.json();
        if (!data.success) return;
        flowTracks = data.tracks || [];
        flowPlaylists = data.playlists || [];

        // Charger la biblio une seule fois pour detecter les fichiers deja telecharges
        try {
            const libResp = await fetch('api/library', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=list' });
            const libData = await libResp.json();
            if (libData.success) flowLibItems = libData.items || [];
        } catch (e) {}

        renderFlow();
    } catch (e) {}
}

function renderFlow() {
    const list = document.getElementById('flowList');
    const countEl = document.getElementById('flowTrackCount');
    const search = (document.getElementById('flowSearch').value || '').toLowerCase().trim();

    // Filtres playlists
    const plDiv = document.getElementById('flowPlaylists');
    const plNames = [...new Set(flowTracks.map(t => t.playlist).filter(Boolean))];
    let plHtml = '<span class="flow-pl-chip' + (!flowCurrentPlaylist ? ' active' : '') + '" onclick="flowFilterPlaylist(\'\', this)" ondragover="event.preventDefault()" ondrop="flowDropOnPlaylist(event, \'\')">Tout (' + flowTracks.length + ')</span>';
    const unassigned = flowTracks.filter(t => !t.playlist).length;
    if (plNames.length > 0 && unassigned > 0) {
        plHtml += '<span class="flow-pl-chip' + (flowCurrentPlaylist === '__none__' ? ' active' : '') + '" onclick="flowFilterPlaylist(\'__none__\', this)" ondragover="event.preventDefault(); this.classList.add(\'flow-pl-dragover\')" ondragleave="this.classList.remove(\'flow-pl-dragover\')" ondrop="this.classList.remove(\'flow-pl-dragover\'); flowDropOnPlaylist(event, \'\')">Sans playlist (' + unassigned + ')</span>';
    }
    // Inclure aussi les playlists vides
    const allPlNames = [...new Set([...plNames, ...flowPlaylists.map(p => p.name)])];
    for (const pl of allPlNames) {
        const c = flowTracks.filter(t => t.playlist === pl).length;
        const safePl = pl.replace(/'/g, "\\'");
        plHtml += '<span class="flow-pl-chip' + (flowCurrentPlaylist === pl ? ' active' : '') + '" onclick="flowFilterPlaylist(\'' + safePl + '\', this)" ondragover="event.preventDefault(); this.classList.add(\'flow-pl-dragover\')" ondragleave="this.classList.remove(\'flow-pl-dragover\')" ondrop="this.classList.remove(\'flow-pl-dragover\'); flowDropOnPlaylist(event, \'' + safePl + '\')">'
            + pl + ' (' + c + ')'
            + '<span class="flow-pl-play" onclick="event.stopPropagation(); flowPlayAll(\'' + safePl + '\')" title="Tout lire">&#9654;</span>'
            + '<span class="flow-pl-del" onclick="event.stopPropagation(); flowDeletePlaylist(\'' + safePl + '\')" title="Supprimer">&times;</span>'
            + '</span>';
    }
    plDiv.innerHTML = plHtml;

    // Filtrer
    const filtered = flowTracks.filter((t, i) => {
        const matchPl = !flowCurrentPlaylist || (flowCurrentPlaylist === '__none__' ? !t.playlist : t.playlist === flowCurrentPlaylist);
        const matchSearch = !search || (t.title || '').toLowerCase().includes(search) || (t.channel || '').toLowerCase().includes(search);
        return matchPl && matchSearch;
    });

    countEl.textContent = filtered.length + ' titre(s)';

    if (filtered.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:30px;">Aucun titre. Ajoute des morceaux depuis l\'historique ou importe une liste.</p>';
        return;
    }

    list.innerHTML = filtered.map(t => {
        const realIdx = flowTracks.indexOf(t);
        let thumb = t.thumbnail || '';
        if (!thumb && t.url) { const m = t.url.match(/[?&]v=([^&]+)/); if (m) thumb = 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg'; }
        const playing = realIdx === flowCurrentIdx;
        const plTag = t.playlist ? '<span class="fl-playlist-tag">' + t.playlist + '</span>' : '';
        // Menu playlist
        let plOptions = '<option value="">-- Deplacer vers --</option><option value="__none__">Aucune playlist</option>';
        for (const pl of flowPlaylists) {
            if (pl.name !== t.playlist) plOptions += '<option value="' + pl.name + '">' + pl.name + '</option>';
        }

            const vMatch = (t.url || '').match(/[?&]v=([^&]+)/);
            const vid = vMatch ? vMatch[1] : '';
            const dlFormatSel = document.getElementById('flowDlFormat') ? document.getElementById('flowDlFormat').value : 'audio:mp3';
            const dlParts = dlFormatSel.split(':');
            const dlType = dlParts[0];
            const dlFormat = dlParts[1];
            const inLib = vid && flowLibItems.some(item => item.url && item.url.includes(vid) && (item.format || '') === dlFormat);

            return '<div class="flow-track' + (playing ? ' fl-playing' : '') + (inLib ? ' fl-downloaded' : '') + '" data-idx="' + realIdx + '" draggable="true" ondragstart="flowDragStart(event, ' + realIdx + ')">'
            + (thumb ? '<img class="fl-thumb" src="' + thumb + '" loading="lazy" onclick="flowPlay(' + realIdx + ',\'audio\')">' : '')
            + '<div class="fl-body">'
            + '<span class="fl-title">' + (t.title || 'Sans titre') + ' ' + plTag + (inLib ? ' <span class="fl-dl-badge">DL</span>' : '') + '</span>'
            + '<span class="fl-info">' + [t.channel, t.duration, t.year].filter(Boolean).join(' · ') + '</span>'
            + ((t.playCount || 0) > 0 ? '<span class="fl-plays-badge">' + t.playCount + 'x</span>' : '')
            + '</div>'
            + (flowPlaylists.length > 0 ? '<select class="fl-move-select" onchange="flowMoveTrack(\'' + t.id + '\', this.value); this.selectedIndex=0;">' + plOptions + '</select>' : '')
            + '<button class="fl-play" onclick="flowPlay(' + realIdx + ',\'audio\')">&#9654; Ecouter</button>'
            + '<button class="fl-play fl-play-vid" onclick="flowPlay(' + realIdx + ',\'video\')">&#9654; Video</button>'
            + (inLib
                ? '<span class="fl-play fl-play-already" title="Deja telecharge">&#10003; DL</span>'
                : '<button class="fl-play fl-play-dl" onclick="flowDownload(' + realIdx + ', this)">&#11015; DL</button>')
            + '<button class="fl-remove" onclick="flowRemove(\'' + t.id + '\')" title="Retirer">&#10005;</button>'
            + '</div>';
    }).join('');
}

// Drag & Drop
function flowDragStart(event, idx) {
    const t = flowTracks[idx];
    if (!t) return;
    event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'flow', id: t.id, idx: idx }));
    event.dataTransfer.effectAllowed = 'move';
}

function histDragStart(event, idx) {
    const h = historyCache[idx];
    if (!h || !h.url) { event.preventDefault(); return; }
    event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'history', idx: idx }));
    event.dataTransfer.effectAllowed = 'copy';
}

async function flowDropOnTab(event) {
    event.preventDefault();
    return flowDropOnPlaylist(event, '');
}

async function flowDropOnPlaylist(event, playlist) {
    event.preventDefault();
    let data;
    try { data = JSON.parse(event.dataTransfer.getData('text/plain')); } catch (e) { return; }

    if (data.type === 'flow') {
        // Deplacer un morceau de Mon Flow vers une playlist
        await fetch('api/flow', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=move&id=' + data.id + '&playlist=' + encodeURIComponent(playlist)
        });
        loadFlow();
    } else if (data.type === 'history') {
        // Ajouter depuis l'historique vers Mon Flow dans cette playlist
        const h = historyCache[data.idx];
        if (!h || !h.url) return;
        await fetch('api/flow', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=add&url=' + encodeURIComponent(h.url)
                + '&title=' + encodeURIComponent(h.title || '')
                + '&channel=' + encodeURIComponent(h.channel || '')
                + '&thumbnail=' + encodeURIComponent(h.thumbnail || '')
                + '&views=' + encodeURIComponent(h.views || '')
                + '&year=' + encodeURIComponent(h.year || '')
                + '&format=' + encodeURIComponent(h.format || '')
                + '&type=' + encodeURIComponent(h.type || 'audio')
                + '&playlist=' + encodeURIComponent(playlist)
        });
        loadFlow();
    }
}

function sortFlow() {
    const sort = document.getElementById('flowSortBy').value;
    flowTracks.sort((a, b) => {
        switch (sort) {
            case 'added-desc': return (b.addedAt || '').localeCompare(a.addedAt || '');
            case 'added-asc': return (a.addedAt || '').localeCompare(b.addedAt || '');
            case 'title-asc': return (a.title || '').localeCompare(b.title || '', 'fr');
            case 'title-desc': return (b.title || '').localeCompare(a.title || '', 'fr');
            case 'channel-asc': return (a.channel || '').localeCompare(b.channel || '', 'fr');
            case 'plays-desc': return (b.playCount || 0) - (a.playCount || 0);
            case 'plays-asc': return (a.playCount || 0) - (b.playCount || 0);
            case 'recent-play': return (b.lastPlayed || '').localeCompare(a.lastPlayed || '');
            case 'type-audio': return (a.type === 'audio' ? 0 : 1) - (b.type === 'audio' ? 0 : 1);
            case 'type-video': return (a.type === 'video' ? 0 : 1) - (b.type === 'video' ? 0 : 1);
            default: return 0;
        }
    });
    renderFlow();
}

function flowFilterPlaylist(pl, el) {
    flowCurrentPlaylist = pl;
    document.querySelectorAll('.flow-pl-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    renderFlow();
}

function filterFlow() { renderFlow(); }

async function flowPlay(idx, type) {
    const t = flowTracks[idx];
    if (!t || !t.url) return;

    const bar = document.getElementById('playerBar');
    const mainAudio = document.getElementById('audioEl');
    const videoOverlay = document.getElementById('videoOverlay');

    // Arreter la lecture en cours
    mainAudio.pause();
    mainAudio.src = '';

    flowCurrentIdx = idx;
    flowCurrentType = type || 'audio';

    // Afficher le player bar
    bar.classList.add('active');
    document.body.classList.add('player-open');

    let thumb = t.thumbnail || '';
    if (!thumb && t.url) { const m = t.url.match(/[?&]v=([^&]+)/); if (m) thumb = 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg'; }

    document.getElementById('playerThumb').src = thumb;
    document.getElementById('playerTitle').textContent = t.title || 'Chargement...';
    document.getElementById('playerArtist').textContent = (t.channel || '') + ' · Streaming';
    document.getElementById('btnPlayPause').innerHTML = '&#9654;';

    // Marquer visuellement
    document.querySelectorAll('.flow-track').forEach(el => el.classList.remove('fl-playing'));
    const trackEl = document.querySelector('.flow-track[data-idx="' + idx + '"]');
    if (trackEl) trackEl.classList.add('fl-playing');

    // Mettre a jour le "suivant"
    const nextIdx = getNextFlowIdx(idx);
    const nextEl = document.getElementById('playerNext');
    if (nextIdx !== -1 && flowTracks[nextIdx]) {
        const nt = flowTracks[nextIdx];
        let nThumb = nt.thumbnail || '';
        if (!nThumb && nt.url) { const m = nt.url.match(/[?&]v=([^&]+)/); if (m) nThumb = 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg'; }
        document.getElementById('playerNextTitle').textContent = nt.title || '';
        document.getElementById('playerNextThumb').src = nThumb;
        document.getElementById('playerNextThumb').style.display = nThumb ? '' : 'none';
        if (nextEl) nextEl.style.display = 'flex';
    } else {
        if (nextEl) nextEl.style.display = 'none';
    }

    // Enregistrer la lecture
    fetch('api/flow', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=play&id=' + t.id }).catch(() => {});

    // Video = iframe YouTube
    if (type === 'video') {
        playYoutubeVideo(t.url, t.title);
        return;
    }

    // Audio = streaming
    closeVideoPlayer();
    try {
        let streamUrl;
        if (flowPreloaded && flowPreloaded.idx === idx && flowPreloaded.type === type) {
            streamUrl = flowPreloaded.streamUrl;
            flowPreloaded = null;
        } else {
            document.getElementById('playerArtist').textContent = (t.channel || '') + ' · Chargement...';
            const resp = await fetch('api/stream?url=' + encodeURIComponent(t.url) + '&type=' + type);
            const data = await resp.json();
            if (!data.success) {
                document.getElementById('playerArtist').textContent = 'Erreur : flux indisponible';
                return;
            }
            streamUrl = data.streamUrl;
        }

        mainAudio.src = streamUrl;
        mainAudio.volume = document.getElementById('volumeSlider').value / 100;
        mainAudio.play().catch(() => {});

        document.getElementById('playerArtist').textContent = (t.channel || '') + ' · Streaming';
        document.getElementById('btnPlayPause').innerHTML = '&#9646;&#9646;';

        // Pre-charger le suivant
        flowPreloadNext(idx, 'audio');

        // A la fin, passer au suivant
        mainAudio.onended = function() { flowNext('audio'); };

    } catch (e) {
        document.getElementById('playerArtist').textContent = 'Erreur de connexion';
    }
}

function getNextFlowIdx(currentIdx) {
    const visible = flowGetVisibleTracks();
    if (flowShuffle) {
        const others = visible.filter(i => i !== currentIdx);
        return others.length > 0 ? others[Math.floor(Math.random() * others.length)] : -1;
    }
    const curPos = visible.indexOf(currentIdx);
    return (curPos >= 0 && curPos < visible.length - 1) ? visible[curPos + 1] : -1;
}

function flowGetVisibleTracks() {
    const els = document.querySelectorAll('.flow-track');
    return Array.from(els).map(el => parseInt(el.dataset.idx)).filter(i => flowTracks[i]);
}

function flowNext(type) {
    type = type || flowCurrentType || 'audio';
    const visible = flowGetVisibleTracks();
    if (visible.length === 0) return;

    let nextIdx;
    if (flowShuffle) {
        const others = visible.filter(i => i !== flowCurrentIdx);
        if (others.length === 0) return;
        nextIdx = others[Math.floor(Math.random() * others.length)];
    } else {
        const curPos = visible.indexOf(flowCurrentIdx);
        if (curPos === -1 || curPos >= visible.length - 1) {
            document.getElementById('flowMeta').textContent = 'Fin de la liste';
            return;
        }
        nextIdx = visible[curPos + 1];
    }
    flowPlay(nextIdx, type);
}

function flowPrev() {
    const visible = flowGetVisibleTracks();
    const curPos = visible.indexOf(flowCurrentIdx);
    if (curPos <= 0) return;
    flowPlay(visible[curPos - 1], flowCurrentType || 'audio');
}

function flowToggleShuffle() {
    flowShuffle = !flowShuffle;
    document.getElementById('flowShuffleBtn').classList.toggle('active', flowShuffle);
}

function flowStop() {
    const mainAudio = document.getElementById('audioEl');
    mainAudio.pause();
    mainAudio.src = '';
    mainAudio.onended = null;
    document.getElementById('playerBar').classList.remove('active');
    document.body.classList.remove('player-open');
    document.querySelectorAll('.flow-track').forEach(el => el.classList.remove('fl-playing'));
    flowCurrentIdx = -1;
    flowPreloaded = null;
}

function flowPreloadNext(currentIdx, type) {
    const visible = flowGetVisibleTracks();
    const curPos = visible.indexOf(currentIdx);
    let nextIdx;
    if (flowShuffle) {
        const others = visible.filter(i => i !== currentIdx);
        nextIdx = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : -1;
    } else {
        nextIdx = (curPos >= 0 && curPos < visible.length - 1) ? visible[curPos + 1] : -1;
    }
    if (nextIdx === -1) { flowPreloaded = null; return; }

    const t = flowTracks[nextIdx];
    fetch('api/stream?url=' + encodeURIComponent(t.url) + '&type=' + type)
        .then(r => r.json())
        .then(data => {
            if (data.success && flowCurrentIdx === currentIdx) {
                flowPreloaded = { idx: nextIdx, type, streamUrl: data.streamUrl };
            }
        })
        .catch(() => { flowPreloaded = null; });
}

function flowShowCreatePlaylist() {
    const el = document.getElementById('flowCreatePl');
    el.style.display = el.style.display === 'flex' ? 'none' : 'flex';
    if (el.style.display === 'flex') document.getElementById('flowNewPlName').focus();
}

async function flowCreatePlaylist() {
    const name = document.getElementById('flowNewPlName').value.trim();
    if (!name) return;
    const resp = await fetch('api/flow', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=create_playlist&name=' + encodeURIComponent(name) });
    const data = await resp.json();
    if (!data.success) { alert(data.error || 'Erreur'); return; }
    document.getElementById('flowNewPlName').value = '';
    document.getElementById('flowCreatePl').style.display = 'none';
    loadFlow();
}

async function flowDeletePlaylist(name) {
    if (!confirm('Supprimer la playlist "' + name + '" ?\nLes morceaux ne seront pas supprimes.')) return;
    await fetch('api/flow', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=delete_playlist&name=' + encodeURIComponent(name) });
    if (flowCurrentPlaylist === name) flowCurrentPlaylist = '';
    loadFlow();
}

async function flowMoveTrack(id, playlist) {
    if (playlist === '__none__') playlist = '';
    await fetch('api/flow', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=move&id=' + id + '&playlist=' + encodeURIComponent(playlist) });
    loadFlow();
}

function flowPlayAll(playlist) {
    flowFilterPlaylist(playlist, null);
    // Jouer le premier morceau visible
    setTimeout(() => {
        const first = document.querySelector('.flow-track');
        if (first) {
            const idx = parseInt(first.dataset.idx);
            flowPlay(idx, 'audio');
        }
    }, 100);
}

function flowToggleSearch() {
    const el = document.getElementById('flowYtSearch');
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
    if (el.style.display === 'block') document.getElementById('flowYtQuery').focus();
}

let flowSearchPage = 1;
let flowSearchQuery = '';

async function flowYtDoSearch(loadMore) {
    const query = document.getElementById('flowYtQuery').value.trim();
    if (!query) return;

    const resultsDiv = document.getElementById('flowYtResults');

    if (!loadMore || query !== flowSearchQuery) {
        flowSearchPage = 1;
        flowSearchQuery = query;
        window._flowSearchResults = [];
        resultsDiv.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Recherche en cours...</p>';
    } else {
        flowSearchPage++;
        // Retirer le bouton "Plus de resultats"
        const moreBtn = document.getElementById('flowSearchMore');
        if (moreBtn) moreBtn.textContent = 'Chargement...';
    }

    const max = 30;
    const total = max * flowSearchPage;

    try {
        const resp = await fetch('api/search?q=' + encodeURIComponent(query) + '&max=' + total);
        const data = await resp.json();
        if (!data.success || !data.results || data.results.length === 0) {
            if (flowSearchPage === 1) {
                resultsDiv.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Aucun resultat.</p>';
            }
            return;
        }

        // Ne garder que les nouveaux resultats (apres ceux deja affiches)
        const allResults = data.results;
        window._flowSearchResults = allResults;

        const existingUrls = new Set(flowTracks.map(t => { const m = (t.url || '').match(/[?&]v=([^&]+)/); return m ? m[1] : ''; }).filter(Boolean));

        let html = allResults.map((r, i) => {
            const vid = (r.url || '').match(/[?&]v=([^&]+)/);
            const vidId = vid ? vid[1] : '';
            const alreadyIn = vidId && existingUrls.has(vidId);
            const thumb = r.thumbnail || (vidId ? 'https://i.ytimg.com/vi/' + vidId + '/mqdefault.jpg' : '');
            return '<div class="flow-track" style="border-bottom:1px solid var(--border);">'
                + (thumb ? '<img class="fl-thumb" src="' + thumb + '" loading="lazy">' : '')
                + '<div class="fl-body">'
                + '<span class="fl-title">' + (r.title || '') + '</span>'
                + '<span class="fl-info">' + [r.channel, r.duration].filter(Boolean).join(' · ') + '</span>'
                + '</div>'
                + (alreadyIn
                    ? '<span style="font-size:11px;color:var(--success);font-weight:600;flex-shrink:0;">Deja dans Mon Flow</span>'
                    : '<button class="fl-play" onclick="flowAddFromSearch(' + i + ')" id="flowSearchAdd' + i + '">+ Ajouter</button>')
                + '<button class="fl-play" style="background:var(--primary);" onclick="flowPlayPreview(\'' + encodeURIComponent(r.url) + '\')">&#9654;</button>'
                + '</div>';
        }).join('');

        // Bouton "Plus de resultats"
        html += '<div style="text-align:center;padding:12px;">'
            + '<button id="flowSearchMore" onclick="flowYtDoSearch(true)" style="background:#9C27B0;color:#fff;border:none;padding:8px 24px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;">Charger plus de resultats (' + allResults.length + ' affiches)</button>'
            + '</div>';

        resultsDiv.innerHTML = html;
    } catch (e) {
        if (flowSearchPage === 1) {
            resultsDiv.innerHTML = '<p style="color:var(--text-muted);text-align:center;">Erreur de recherche.</p>';
        }
    }
}

async function flowAddFromSearch(idx) {
    const r = window._flowSearchResults[idx];
    if (!r) return;
    const btn = document.getElementById('flowSearchAdd' + idx);
    if (btn) { btn.textContent = '...'; btn.disabled = true; }

    try {
        // Recuperer les infos completes
        const infoResp = await fetch('api/info', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'url=' + encodeURIComponent(r.url) });
        const info = await infoResp.json();

        await fetch('api/flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=add&url=' + encodeURIComponent(r.url)
                + '&title=' + encodeURIComponent(info.success ? info.title : r.title || '')
                + '&channel=' + encodeURIComponent(info.success ? info.channel : r.channel || '')
                + '&thumbnail=' + encodeURIComponent(info.success ? info.thumbnail : r.thumbnail || '')
                + '&duration=' + encodeURIComponent(info.success ? info.duration : r.duration || '')
                + '&views=' + encodeURIComponent(info.success ? info.views_display : '')
                + '&year=' + encodeURIComponent(info.success ? info.year : '')
        });

        if (btn) { btn.textContent = 'Ajoute !'; btn.style.background = 'var(--success)'; }
        loadFlow();
    } catch (e) {
        if (btn) { btn.textContent = 'Erreur'; btn.style.background = 'var(--error)'; }
    }
}

async function flowPlayPreview(encodedUrl) {
    const url = decodeURIComponent(encodedUrl);
    const audioEl = document.getElementById('flowAudio');
    const playerDiv = document.getElementById('flowPlayer');
    const titleEl = document.getElementById('flowTitle');
    const metaEl = document.getElementById('flowMeta');
    const thumbEl = document.getElementById('flowThumb');

    playerDiv.style.display = 'block';
    titleEl.textContent = 'Apercu...';
    metaEl.textContent = 'Chargement...';
    const m = url.match(/[?&]v=([^&]+)/);
    if (m) thumbEl.src = 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg';

    try {
        const resp = await fetch('api/stream?url=' + encodeURIComponent(url) + '&type=audio');
        const data = await resp.json();
        if (!data.success) { metaEl.textContent = 'Erreur'; return; }
        document.getElementById('flowVideo').style.display = 'none';
        audioEl.style.display = 'block';
        audioEl.src = data.streamUrl;
        audioEl.play().catch(() => {});
        metaEl.textContent = 'Apercu - Streaming';
    } catch (e) { metaEl.textContent = 'Erreur'; }
}

async function flowAddByUrl() {
    const url = prompt('Colle une URL YouTube :');
    if (!url || !url.includes('youtu')) return;

    try {
        const infoResp = await fetch('api/info', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'url=' + encodeURIComponent(url) });
        const info = await infoResp.json();
        if (!info.success) { alert('Impossible de recuperer les infos.'); return; }

        await fetch('api/flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=add&url=' + encodeURIComponent(url)
                + '&title=' + encodeURIComponent(info.title || '')
                + '&channel=' + encodeURIComponent(info.channel || '')
                + '&thumbnail=' + encodeURIComponent(info.thumbnail || '')
                + '&duration=' + encodeURIComponent(info.duration || '')
                + '&views=' + encodeURIComponent(info.views_display || '')
                + '&year=' + encodeURIComponent(info.year || '')
        });
        loadFlow();
    } catch (e) { alert('Erreur.'); }
}

async function flowDownload(idx, btn) {
    const t = flowTracks[idx];
    if (!t || !t.url) return;
    btn.textContent = '...';
    btn.disabled = true;

    const dlFormatSel = document.getElementById('flowDlFormat') ? document.getElementById('flowDlFormat').value : 'audio:mp3';
    const dlParts = dlFormatSel.split(':');
    const type = dlParts[0];
    const format = dlParts[1];
    const quality = type === 'video' ? 'best' : '0';

    try {

        const dlResp = await fetch('api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'url=' + encodeURIComponent(t.url) + '&type=' + type + '&format=' + format + '&quality=' + quality + '&cover=1'
        });
        const dlData = await dlResp.json();

        if (!dlData.success) {
            btn.textContent = 'Erreur';
            btn.style.background = 'var(--error)';
            setTimeout(() => { btn.textContent = '⬇ DL'; btn.style.background = ''; btn.disabled = false; }, 3000);
            return;
        }

        btn.textContent = '0%';
        btn.style.background = '#2196F3';

        // Suivre la progression
        const poll = setInterval(async () => {
            try {
                const pResp = await fetch('api/progress?id=' + dlData.jobId);
                const pData = await pResp.json();

                if (pData.status === 'done') {
                    clearInterval(poll);
                    btn.textContent = 'OK!';
                    btn.style.background = 'var(--success)';

                    // Ajouter a la bibliotheque
                    fetch('api/library', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: 'action=add_item&file=' + encodeURIComponent(pData.file || '')
                            + '&title=' + encodeURIComponent(t.title || '')
                            + '&type=' + type + '&format=' + format
                            + '&folder=&thumbnail=' + encodeURIComponent(t.thumbnail || '')
                            + '&channel=' + encodeURIComponent(t.channel || '')
                            + '&duration=' + encodeURIComponent(t.duration || '')
                            + '&cover=' + encodeURIComponent(pData.cover || '')
                            + '&url=' + encodeURIComponent(t.url || '')
                    }).catch(() => {});

                    // Ajouter a l'historique
                    fetch('api/history', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: 'action=add&title=' + encodeURIComponent(t.title || '') + '&status=success'
                            + '&format=' + format + '&type=' + (t.type || 'audio')
                            + '&url=' + encodeURIComponent(t.url || '')
                            + '&channel=' + encodeURIComponent(t.channel || '')
                            + '&thumbnail=' + encodeURIComponent(t.thumbnail || '')
                    }).catch(() => {});

                    setTimeout(() => { btn.textContent = '⬇ DL'; btn.style.background = ''; btn.disabled = false; }, 3000);
                } else if (pData.status === 'error') {
                    clearInterval(poll);
                    btn.textContent = 'Erreur';
                    btn.style.background = 'var(--error)';
                    setTimeout(() => { btn.textContent = '⬇ DL'; btn.style.background = ''; btn.disabled = false; }, 3000);
                } else {
                    btn.textContent = (pData.percent || 0) + '%';
                }
            } catch (e) {}
        }, 1500);

    } catch (e) {
        btn.textContent = 'Erreur';
        setTimeout(() => { btn.textContent = '⬇ DL'; btn.style.background = ''; btn.disabled = false; }, 3000);
    }
}

async function flowRemove(id) {
    await fetch('api/flow', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=remove&id=' + id });
    loadFlow();
}

async function flowAddFromHistory() {
    // Ajouter tous les elements de l'historique qui ont une URL
    try {
        const resp = await fetch('api/history?action=list');
        const data = await resp.json();
        if (!data.success || !data.history) return;

        const items = data.history.filter(h => h.url && h.status === 'success');
        if (items.length === 0) { alert('Aucun element dans l\'historique.'); return; }

        const addResp = await fetch('api/flow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=add_bulk&items=' + encodeURIComponent(JSON.stringify(items))
        });
        const addData = await addResp.json();
        alert(addData.added + ' titre(s) ajoute(s) a Mon Flow' + (items.length - addData.added > 0 ? '\n' + (items.length - addData.added) + ' doublon(s) ignore(s)' : ''));
        loadFlow();
    } catch (e) { alert('Erreur.'); }
}

function flowExport() {
    const blob = new Blob([JSON.stringify(flowTracks, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'mon_flow_' + new Date().toISOString().split('T')[0] + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
}

function flowImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const items = JSON.parse(e.target.result);
            if (!Array.isArray(items)) { alert('Fichier invalide.'); return; }
            const resp = await fetch('api/flow', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: 'action=add_bulk&items=' + encodeURIComponent(JSON.stringify(items))
            });
            const data = await resp.json();
            alert(data.added + ' titre(s) importe(s)');
            loadFlow();
        } catch (err) { alert('Erreur de lecture.'); }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// Charger Mon Flow quand on switch sur l'onglet
const origSwitchTab = typeof switchTab === 'function' ? switchTab : null;

function toggleHistory() {
    const panel = document.getElementById('historyPanel');
    const libElements = ['foldersBar', 'bigActionBtns', 'itemsGrid', 'emptyLib', 'libSearch', 'libFilterChips'];
    const showing = panel.style.display === 'none';
    panel.style.display = showing ? 'block' : 'none';
    libElements.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = showing ? 'none' : '';
    });
    if (showing) loadHistory();
}

// ========== SYSTEM INFO / YTDLP UPDATE ==========
async function loadCacheStats() {
    try {
        const resp = await fetch('api/system?action=cache_stats');
        const data = await resp.json();
        if (!data.success) return;
        const el = document.getElementById('cacheStats');
        if (!el) return;
        const c = data.cache;
        let html = '';
        for (const name in c) {
            const ttlMin = Math.round(c[name].ttl / 60000);
            html += '<div>' + name + ' : <strong>' + c[name].entries + '</strong> entree(s) (TTL: ' + ttlMin + ' min)</div>';
        }
        if (!html) html = 'Cache vide.';
        el.innerHTML = html;
    } catch (e) {}
}

async function clearCache() {
    try {
        await fetch('api/system?action=cache_clear');
        loadCacheStats();
    } catch (e) {}
}

async function loadSystemInfo() {
    try {
        const resp = await fetch('api/system?action=info');
        const data = await resp.json();
        if (data.success) {
            document.getElementById('ytdlpVersion').textContent = 'yt-dlp : v' + data.ytdlp_version;
            document.getElementById('statDisk').textContent = data.disk_display;
        }
    } catch (err) {}
}

async function updateYtdlp() {
    const status = document.getElementById('updateStatus');
    status.textContent = 'Mise a jour...';
    status.style.color = 'var(--text-secondary)';

    try {
        const resp = await fetch('api/system', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=update'
        });
        const data = await resp.json();
        if (data.success) {
            status.textContent = 'OK ! v' + data.version;
            status.style.color = 'var(--success)';
            document.getElementById('ytdlpVersion').textContent = 'yt-dlp : v' + data.version;
        } else {
            status.textContent = 'Echec';
            status.style.color = 'var(--error)';
        }
    } catch (err) {
        status.textContent = 'Erreur reseau';
        status.style.color = 'var(--error)';
    }
}

// ========== STATS ==========
function computeDurationStats() {
    if (!libraryData.items) return;
    let totalSeconds = 0;
    libraryData.items.forEach(item => {
        if (item.duration) {
            const parts = item.duration.split(':').map(Number);
            if (parts.length === 3) totalSeconds += parts[0] * 3600 + parts[1] * 60 + parts[2];
            else if (parts.length === 2) totalSeconds += parts[0] * 60 + parts[1];
        }
    });
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    document.getElementById('statDuration').textContent = h > 0 ? h + 'h ' + m + 'm' : m + ' min';
}

// ========== DRAG & DROP ==========
let dragItemId = null;

function enableDragDrop() {
    document.querySelectorAll('.item-card').forEach(card => {
        card.setAttribute('draggable', true);
        card.addEventListener('dragstart', (e) => {
            dragItemId = card.dataset.id;
            card.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            dragItemId = null;
        });
    });

    document.querySelectorAll('.folder-chip[data-folder-id]').forEach(chip => {
        chip.addEventListener('dragover', (e) => { e.preventDefault(); chip.classList.add('drag-over'); });
        chip.addEventListener('dragleave', () => { chip.classList.remove('drag-over'); });
        chip.addEventListener('drop', async (e) => {
            e.preventDefault();
            chip.classList.remove('drag-over');
            if (dragItemId) {
                const folderId = chip.dataset.folderId;
                const draggedCard = document.querySelector('.item-card[data-id="' + dragItemId + '"]');

                // Animation : la carte retrecit et disparait
                if (draggedCard) {
                    draggedCard.classList.add('drop-fly');
                }

                // Animation : le dossier pulse pour confirmer
                chip.classList.add('drop-success');

                await fetch('api/library', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'action=move_item&item_id=' + dragItemId + '&folder_id=' + encodeURIComponent(folderId)
                });

                // Attendre la fin de l'animation avant de recharger
                setTimeout(() => {
                    chip.classList.remove('drop-success');
                    loadLibrary();
                }, 500);
            }
        });
    });
}

// ========== INIT ==========
// Charger le profil depuis le cookie OU localStorage
const savedUser = getCookie('yt_user') || localStorage.getItem('yt_user');
if (savedUser) {
    // Re-setter le cookie au cas ou il aurait expire
    document.cookie = 'yt_user=' + encodeURIComponent(savedUser) + ';max-age=' + (86400*3650) + ';path=/';
    loadProfile(savedUser);
} else {
    loadProfilesList();
}

// Load folders for download tab on start
updateNotifToggle();
loadLibrary().then(() => {
    // Restaurer le lecteur apres chargement de la bibliotheque
    restorePlayerState();
});
loadSystemInfo();
restoreQueue();

// Restaurer l'onglet actif
const savedTab = localStorage.getItem('yt_tab');
if (savedTab && savedTab !== 'download') {
    switchTab(savedTab);
}
