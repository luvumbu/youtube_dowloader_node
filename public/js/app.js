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
        const tabMap = { 'Telecharger': 'download', 'Recherche': 'search', 'Bibliotheque': 'library', 'Mon Flow': 'flow', 'Stats': 'stats', 'Profil': 'profile' };
        if (tabMap[t.textContent] === tab) t.classList.add('active');
    });
    localStorage.setItem('yt_tab', tab);
    if (tab === 'flow') { loadFlow(); }
    if (tab === 'profile') { loadCacheStats(); }
    if (tab === 'stats') {
        const sub = localStorage.getItem('yt_stats_subtab') || 'data';
        setStatsSubtab(sub);
    }
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
    const likedCount = items.filter(i => i.liked).length;
    const formatCounts = {};
    items.forEach(i => {
        if (i.format) formatCounts[i.format] = (formatCounts[i.format] || 0) + 1;
    });

    let html = '';
    // Tout
    html += '<label class="lib-filter-chip ' + (activeFilters.has('all') ? 'active' : '') + '">'
        + '<input type="checkbox" ' + (activeFilters.has('all') ? 'checked' : '') + ' onchange="toggleFilter(\'all\')">'
        + '<span class="chip-dot all"></span> Tout <span class="chip-count">(' + items.length + ')</span></label>';
    // Aimés — toujours visible, mis en valeur
    html += '<label class="lib-filter-chip lib-filter-liked ' + (activeFilters.has('liked') ? 'active' : '') + '">'
        + '<input type="checkbox" ' + (activeFilters.has('liked') ? 'checked' : '') + ' onchange="toggleFilter(\'liked\')">'
        + '<span class="chip-heart">&#10084;</span> Aim&eacute;s <span class="chip-count">(' + likedCount + ')</span></label>';
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
            + '<button class="item-like' + (item.liked ? ' liked' : '') + '" onclick="libToggleLike(\'' + item.id + '\', this)" title="' + (item.liked ? 'Retirer des aim&eacute;s' : 'Aimer') + '">' + (item.liked ? '&#10084;' : '&#9825;') + '</button>'
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

async function libToggleLike(itemId, btn) {
    console.log('[LIKE LIB] click id=', itemId);
    try {
        const resp = await fetch('api/library', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=toggle_like&item_id=' + encodeURIComponent(itemId)
        });
        const data = await resp.json();
        console.log('[LIKE LIB] response', resp.status, data);
        if (!data.success) { alert('Like refuse par le serveur : ' + (data.error || 'inconnu')); return; }
        const item = libraryData.items.find(i => i.id === itemId);
        if (item) item.liked = data.liked;
        if (btn) {
            btn.innerHTML = data.liked ? '&#10084;' : '&#9825;';
            btn.classList.toggle('liked', !!data.liked);
            btn.title = data.liked ? 'Retirer des aimés' : 'Aimer';
        }
        // Rafraichir compteur du chip Aimes + filtre si actif
        buildFilterChips();
        if (activeFilters.has('liked')) filterLibrary();
    } catch (e) { console.error('[LIKE LIB] erreur reseau', e); alert('Erreur reseau: ' + e.message); }
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
            // Verifier aimes
            if (activeFilters.has('liked') && item.liked) matchFilter = true;
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
let playbackContext = 'library'; // 'library', 'flow', 'history'
const audioEl = document.getElementById('audioEl');
const videoEl = document.getElementById('videoEl');

// --- Stream recovery / retry ---
let _streamRetryCount = 0;
const _streamMaxRetries = 3;
let _streamRetrying = false;

async function _streamRetry() {
    if (_streamRetrying || playbackContext !== 'flow') return;
    if (_streamRetryCount >= _streamMaxRetries) {
        _streamRetryCount = 0;
        console.warn('[Flow] Max retries reached, skipping to next');
        flowNext('audio');
        return;
    }
    _streamRetrying = true;
    _streamRetryCount++;
    const savedTime = audioEl.currentTime || 0;
    console.log('[Flow] Stream retry #' + _streamRetryCount + ' from ' + savedTime.toFixed(1) + 's');

    try {
        const t = flowTracks[flowCurrentIdx];
        if (!t || !t.url) { _streamRetrying = false; return; }
        const resp = await fetch('api/stream?url=' + encodeURIComponent(t.url) + '&type=' + (flowCurrentType || 'audio'));
        const data = await resp.json();
        if (!data.success) { _streamRetrying = false; flowNext('audio'); return; }

        audioEl.src = data.streamUrl;
        audioEl.volume = document.getElementById('volumeSlider').value / 100;

        audioEl.addEventListener('loadedmetadata', function _seekAfterRetry() {
            audioEl.removeEventListener('loadedmetadata', _seekAfterRetry);
            if (savedTime > 0 && savedTime < audioEl.duration) {
                audioEl.currentTime = savedTime;
            }
            audioEl.play().catch(() => {});
            _streamRetrying = false;
        }, { once: true });

        // Fallback si loadedmetadata ne fire pas
        setTimeout(() => {
            if (_streamRetrying) {
                audioEl.play().catch(() => {});
                _streamRetrying = false;
            }
        }, 5000);
    } catch (e) {
        console.error('[Flow] Retry failed:', e);
        _streamRetrying = false;
        flowNext('audio');
    }
}

audioEl.addEventListener('error', () => {
    if (playbackContext === 'flow' && flowCurrentIdx >= 0) {
        console.warn('[Flow] Audio error, attempting retry...');
        _streamRetry();
    }
});

audioEl.addEventListener('stalled', () => {
    if (playbackContext !== 'flow' || _streamRetrying) return;
    // Attendre 8s, si toujours stalled, retry
    setTimeout(() => {
        if (audioEl.paused || _streamRetrying) return;
        if (audioEl.readyState < 3) {
            console.warn('[Flow] Stream stalled for too long, retrying...');
            _streamRetry();
        }
    }, 8000);
});

audioEl.addEventListener('waiting', () => {
    if (playbackContext !== 'flow' || _streamRetrying) return;
    // Si waiting dure > 15s, c'est probablement mort
    setTimeout(() => {
        if (audioEl.paused || _streamRetrying) return;
        if (audioEl.readyState < 3) {
            console.warn('[Flow] Buffering too long, retrying...');
            _streamRetry();
        }
    }, 15000);
});

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
                shuffle: flowShuffle,
                playbackContext: 'flow'
            }));
            localStorage.removeItem('player_state');
            return;
        }
        localStorage.removeItem('flow_state');
        localStorage.setItem('player_state', JSON.stringify({
            playlist, playIndex, playMode, playbackContext,
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
        playbackContext = state.playbackContext || 'library';

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
    playbackContext = 'flow';

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
    playbackContext = 'library';

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
    // Respecter le contexte de lecture actuel
    if (playbackContext === 'flow' && flowCurrentIdx >= 0) { flowNext(); return; }
    if (playbackContext === 'search' && searchPlayIdx >= 0) { searchPlayNext(); return; }
    if (playbackContext === 'history' && currentStreamIdx >= 0) {
        const type = document.getElementById('streamVideo').style.display === 'block' ? 'video' : 'audio';
        playNextStream(currentStreamIdx, type);
        return;
    }
    // Contexte library
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
    // Respecter le contexte de lecture actuel
    if (playbackContext === 'flow' && flowCurrentIdx >= 0) { flowPrev(); return; }
    if (playbackContext === 'search' && searchPlayIdx >= 0) { searchPlayPrev(); return; }
    if (playbackContext === 'history' && currentStreamIdx >= 0) {
        const type = document.getElementById('streamVideo').style.display === 'block' ? 'video' : 'audio';
        const prevIdx = getPrevStreamIdx(currentStreamIdx);
        if (prevIdx !== -1) streamFromHistory(prevIdx, type);
        return;
    }
    // Contexte library
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
    playbackContext = 'library';
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

// ===== STATS (Global / Annee / Mois / Jour) =====
let statsState = {
    view: 'global', year: null, month: null, currentBucket: null,
    design: localStorage.getItem('yt_stats_design') || 'classic',
    availableMonths: [],
    cache: null
};

const STATS_MONTH_NAMES = ['Janvier','Fevrier','Mars','Avril','Mai','Juin','Juillet','Aout','Septembre','Octobre','Novembre','Decembre'];
const STATS_MONTH_SHORT = ['Jan','Fev','Mar','Avr','Mai','Juin','Juil','Aou','Sep','Oct','Nov','Dec'];

function statsParseTs(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return { Y: +m[1], Mo: +m[2], D: +m[3], H: +m[4], Mi: +m[5] };
}
function statsFmtDateEU(p) { return `${String(p.D).padStart(2,'0')}/${String(p.Mo).padStart(2,'0')}/${p.Y}`; }
function statsFmtTime(p) { return `${String(p.H).padStart(2,'0')}:${String(p.Mi).padStart(2,'0')}`; }

const STRATEGY_DETAILS = {
    monthly: {
        icon: '&#128197;', name: 'Mensuel', recommended: true,
        desc: 'Un fichier par mois civil. Quand tu consultes la vue Jour ou Mois, l\'app n\'ouvre que le fichier du mois concerne - tres rapide meme avec des annees de donnees.',
        files: ['2026-04.json', '2026-03.json', '2026-02.json', '...', '2024-01.json'],
        pros: [
            '<span>Charge ~1 fichier</span> pour Jour/Mois, ~12 pour Annee',
            '<span>Robuste</span> : si un fichier se corrompt, seul ce mois est perdu',
            '<span>Taille bornee</span> : ~50-200 ko/mois meme avec gros usage'
        ],
        cons: [
            '<span>Beaucoup de fichiers</span> a long terme (60+ apres 5 ans)',
            'Vue Global lit tous les fichiers (mais reste rapide)'
        ],
        perf: { read_day: 0.95, read_month: 0.9, read_year: 0.7, read_global: 0.6, scaling: 0.95 }
    },
    yearly: {
        icon: '&#128198;', name: 'Annuel',
        desc: 'Un fichier par annee. Bon compromis entre simplicite et performance : moins de fichiers a gerer, mais chaque fichier grossit avec l\'annee qui passe.',
        files: ['2026.json', '2025.json', '2024.json'],
        pros: [
            '<span>Tres peu de fichiers</span> (1 par annee)',
            '<span>Vue Annee instantanee</span> : 1 fichier a lire',
            'Plus simple a sauvegarder/exporter'
        ],
        cons: [
            'Vue Jour scanne tout le fichier de l\'annee',
            'Avec gros usage, un fichier peut atteindre plusieurs Mo',
            'Si corruption : 1 annee entiere perdue'
        ],
        perf: { read_day: 0.65, read_month: 0.7, read_year: 0.95, read_global: 0.75, scaling: 0.7 }
    },
    single: {
        icon: '&#128196;', name: 'Fichier unique',
        desc: 'Un seul fichier "all.json" qui contient tous les evenements. Le plus simple a comprendre, mais l\'app doit le charger entierement a chaque requete.',
        files: ['all.json'],
        pros: [
            '<span>Le plus simple</span> : 1 seul fichier a comprendre',
            'Facile a partager/sauvegarder/diff',
            'Aucune coordination multi-fichiers'
        ],
        cons: [
            '<span>Ne scale pas</span> : tout est rechargse a chaque event',
            'Risque de blocage en ecriture si 2 events arrivent en meme temps',
            'Si corruption : <strong>tout est perdu</strong>'
        ],
        perf: { read_day: 0.4, read_month: 0.4, read_year: 0.45, read_global: 0.5, scaling: 0.25 }
    }
};

function recordEphemeralListen(r) {
    if (!r || !r.url) return;
    const params = new URLSearchParams({
        action: 'record', kind: 'stream', source: 'audio',
        title: r.title || '', channel: r.channel || '', url: r.url, format: 'stream'
    });
    fetch('api/stats?' + params.toString()).catch(() => {});
}

function setStatsSubtab(sub) {
    localStorage.setItem('yt_stats_subtab', sub);
    document.querySelectorAll('.stats-subtab').forEach(b => {
        b.classList.toggle('active', b.dataset.sub === sub);
    });
    document.querySelectorAll('.stats-section').forEach(s => {
        s.classList.toggle('visible', s.dataset.section === sub);
    });
    if (sub === 'data') { loadProfileStats(); }
    if (sub === 'storage') { loadStorageInfo(); }
    if (sub === 'compare') { renderComparison(); }
    if (sub === 'ephemeral') { loadEphemeral(); }
    closeHourDetails();
}

let ephemeralCache = [];

async function loadEphemeral() {
    try {
        const data = await statsApiCall('api/stats?action=ephemeral');
        if (!data.success) return;
        ephemeralCache = data.items || [];
        document.getElementById('ephemTotal').textContent = data.total || 0;
        document.getElementById('ephemPlays').textContent = data.totalStreams || 0;
        if (ephemeralCache.length) {
            const top = [...ephemeralCache].sort((a, b) => b.count - a.count)[0];
            document.getElementById('ephemTopCount').textContent = top.count + 'x';
            document.getElementById('ephemTopTitle').textContent = top.title || top.url;
            document.getElementById('ephemTopTitle').title = top.title || top.url;
        } else {
            document.getElementById('ephemTopCount').textContent = '-';
            document.getElementById('ephemTopTitle').textContent = 'Aucune ecoute ephemere';
        }
        filterEphemeral();
    } catch (e) {
        const list = document.getElementById('ephemList');
        if (list) list.innerHTML = `<div style="color:var(--error);font-size:12px;padding:10px;background:var(--bg-hover);border-radius:8px;">${e.message}</div>`;
    }
}

function filterEphemeral() {
    const q = (document.getElementById('ephemSearch').value || '').toLowerCase().trim();
    const sortBy = document.getElementById('ephemSort').value;
    let items = ephemeralCache.slice();
    if (q) items = items.filter(it =>
        (it.title || '').toLowerCase().includes(q) || (it.artist || '').toLowerCase().includes(q)
    );
    if (sortBy === 'recent') items.sort((a, b) => String(b.lastTs).localeCompare(String(a.lastTs)));
    else if (sortBy === 'oldest') items.sort((a, b) => String(a.lastTs).localeCompare(String(b.lastTs)));
    else if (sortBy === 'most') items.sort((a, b) => b.count - a.count);
    else if (sortBy === 'title') items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    renderEphemeralList(items);
}

function renderEphemeralList(items) {
    const list = document.getElementById('ephemList');
    if (!list) return;
    if (!items.length) {
        list.innerHTML = '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:30px;">Aucun resultat. Tes ecoutes en streaming depuis la recherche apparaitront ici.</div>';
        return;
    }
    const esc = (s) => String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
    const fmtDate = (ts) => {
        const m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]} a ${m[4]}:${m[5]}` : '';
    };
    const vidFromUrl = (u) => { const m = (u || '').match(/[?&]v=([^&]+)|youtu\.be\/([^?&]+)/); return m ? (m[1] || m[2]) : ''; };

    list.innerHTML = items.map((it, i) => {
        const vid = vidFromUrl(it.url);
        const thumb = vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : '';
        const safeTitle = esc(it.title || '(sans titre)');
        const safeArtist = it.artist ? esc(it.artist) : '';
        return `<div class="ephem-row">
            <div class="ephem-thumb">${thumb ? `<img src="${esc(thumb)}" alt="" onerror="this.style.display='none'">` : '&#127925;'}</div>
            <div class="ephem-info">
                <div class="ephem-title" title="${safeTitle}">${safeTitle}</div>
                <div class="ephem-meta">${safeArtist ? safeArtist + ' &middot; ' : ''}<strong>${it.count}</strong> ecoute${it.count > 1 ? 's' : ''} &middot; dernier ${fmtDate(it.lastTs)}</div>
            </div>
            <div class="ephem-actions">
                <button onclick="ephemAddToFlow(${i})" title="Ajouter a Mon Flow" class="ephem-btn ephem-btn-flow">+ Flow</button>
                <button onclick="ephemDownload(${i})" title="Telecharger" class="ephem-btn ephem-btn-dl">DL</button>
                ${it.url ? `<a href="${esc(it.url)}" target="_blank" class="ephem-btn ephem-btn-yt" title="Ouvrir sur YouTube">YT</a>` : ''}
                <button onclick="ephemForget(${i})" title="Oublier ce titre (supprimer de la liste)" class="ephem-btn ephem-btn-forget">&times;</button>
            </div>
        </div>`;
    }).join('');
}

function ephemAddAllToFlow() {
    if (!ephemeralCache.length) { showToast('Aucun titre a ajouter'); return; }
    const items = ephemeralCache.map(it => ({
        url: it.url || '',
        title: it.title || '',
        channel: it.artist || '',
        thumbnail: '',
        duration: ''
    }));
    openAddBulkToFlow(items, async () => {
        await fetch('api/stats?action=forget_ephemeral', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'urls=' + encodeURIComponent(JSON.stringify(ephemeralCache.map(it => it.url)))
        }).catch(() => {});
        loadEphemeral();
    });
}

async function ephemForgetAll() {
    if (!ephemeralCache.length) return;
    if (!confirm('Effacer toutes les ' + ephemeralCache.length + ' ecoutes ephemeres de l\'historique ? Les evenements de type "stream" seront supprimes du stockage.')) return;
    try {
        await statsApiCall('api/stats?action=forget_ephemeral&all=1');
        showToast('Historique ephemere efface');
        loadEphemeral();
    } catch (e) { alert(e.message); }
}

async function ephemForget(idx) {
    const sorted = currentFilteredEphemeral();
    const it = sorted[idx];
    if (!it) return;
    try {
        const resp = await fetch('api/stats?action=forget_ephemeral', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'urls=' + encodeURIComponent(JSON.stringify([it.url]))
        });
        const data = await resp.json();
        if (data.success) {
            showToast('Titre oublie');
            loadEphemeral();
        }
    } catch (e) { alert('Erreur : ' + e.message); }
}

async function ephemAddToFlow(idx) {
    const sorted = currentFilteredEphemeral();
    const it = sorted[idx];
    if (!it) return;
    try {
        const body = new URLSearchParams({
            action: 'add', url: it.url || '', title: it.title || '',
            channel: it.artist || '', type: 'audio', format: 'mp3'
        });
        const resp = await fetch('api/flow', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        const data = await resp.json();
        if (data.success) {
            showToast(data.duplicate ? 'Deja dans Mon Flow' : 'Ajoute a Mon Flow');
            loadEphemeral();
        }
    } catch (e) { alert('Erreur : ' + e.message); }
}

async function ephemDownload(idx) {
    const sorted = currentFilteredEphemeral();
    const it = sorted[idx];
    if (!it || !it.url) return;
    if (typeof handleSubmit === 'function') {
        const urlInput = document.getElementById('urlInput');
        if (urlInput) {
            urlInput.value = it.url;
            switchTab('download');
            showToast('URL pre-remplie dans Telecharger');
            return;
        }
    }
    showToast('Va dans Telecharger et colle l\'URL');
}

function currentFilteredEphemeral() {
    const q = (document.getElementById('ephemSearch').value || '').toLowerCase().trim();
    const sortBy = document.getElementById('ephemSort').value;
    let items = ephemeralCache.slice();
    if (q) items = items.filter(it => (it.title || '').toLowerCase().includes(q) || (it.artist || '').toLowerCase().includes(q));
    if (sortBy === 'recent') items.sort((a, b) => String(b.lastTs).localeCompare(String(a.lastTs)));
    else if (sortBy === 'oldest') items.sort((a, b) => String(a.lastTs).localeCompare(String(b.lastTs)));
    else if (sortBy === 'most') items.sort((a, b) => b.count - a.count);
    else if (sortBy === 'title') items.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    return items;
}

// ===== COMPARATIF DES STRATEGIES =====
const CMP_SCORES = {
    monthly: { read_day: 0.95, read_month: 0.90, read_year: 0.70, read_global: 0.60, write: 0.85, disk: 0.85, robust: 0.95, scaling: 0.95 },
    yearly:  { read_day: 0.65, read_month: 0.70, read_year: 0.95, read_global: 0.75, write: 0.50, disk: 0.95, robust: 0.55, scaling: 0.70 },
    single:  { read_day: 0.40, read_month: 0.40, read_year: 0.45, read_global: 0.55, write: 0.20, disk: 1.00, robust: 0.10, scaling: 0.20 }
};

const CMP_CRIT_LABELS = {
    read_day: 'Vitesse vue Jour',
    read_month: 'Vitesse vue Mois',
    read_year: 'Vitesse vue Annee',
    read_global: 'Vitesse vue Global',
    write: 'Vitesse d\'ecriture',
    disk: 'Espace disque',
    robust: 'Robustesse',
    scaling: 'Scalabilite long terme'
};

const CMP_STRAT_META = {
    monthly: { name: 'Mensuel', icon: '&#128197;', cls: 'monthly', color: '#2196F3',
        pros: ['<span>Jour/Mois ultra-rapides</span> (1 fichier)', '<span>Robuste</span> : perte limitee a 1 mois', 'Taille bornee par fichier'],
        cons: ['Beaucoup de fichiers a long terme', 'Vue Global lit tous les fichiers'] },
    yearly: { name: 'Annuel', icon: '&#128198;', cls: 'yearly', color: '#4CAF50',
        pros: ['<span>Vue Annee instantanee</span>', 'Peu de fichiers a gerer', 'Facile a sauvegarder'],
        cons: ['Vue Jour scanne toute l\'annee', 'Fichiers grossissent avec le temps', 'Perte = 1 annee'] },
    single: { name: 'Fichier unique', icon: '&#128196;', cls: 'single', color: '#ff9800',
        pros: ['<span>Le plus simple</span>', 'Pas de coordination multi-fichiers', 'Aucun overhead JSON par fichier'],
        cons: ['<span>Ne scale pas</span>', 'Reecrit tout a chaque event', '<span>Perte = tout</span>'] }
};

function getSelectedCriteria() {
    return Array.from(document.querySelectorAll('#cmpCriteria input[type=checkbox]'))
        .filter(c => c.checked).map(c => c.dataset.crit);
}

function computeWinner(selected) {
    if (!selected.length) return null;
    const totals = {};
    Object.keys(CMP_SCORES).forEach(s => {
        totals[s] = selected.reduce((sum, c) => sum + (CMP_SCORES[s][c] || 0), 0) / selected.length;
    });
    const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
    return { winner: sorted[0][0], scores: totals, ranking: sorted };
}

function renderComparison() {
    const selected = getSelectedCriteria();
    const result = computeWinner(selected);
    const winnerEl = document.getElementById('cmpWinner');
    const chartEl = document.getElementById('cmpChart');
    const grid = document.getElementById('cmpProsCons');
    const radial = document.getElementById('cmpRadial');
    if (!winnerEl) return;

    if (!result) {
        winnerEl.className = 'cmp-winner empty';
        winnerEl.innerHTML = '<div style="padding:10px;">Coche au moins un critere pour voir la recommandation.</div>';
    } else {
        const meta = CMP_STRAT_META[result.winner];
        const score = (result.scores[result.winner] * 100).toFixed(0);
        winnerEl.className = 'cmp-winner';
        winnerEl.innerHTML = `
            <div class="cmp-winner-head">
                <div class="cmp-winner-trophy">&#127942;</div>
                <div>
                    <div><span class="cmp-winner-name">${meta.name}</span><span class="cmp-winner-tag">Recommande</span></div>
                    <div class="cmp-winner-detail">Meilleur compromis sur les ${selected.length} critere${selected.length > 1 ? 's' : ''} selectionne${selected.length > 1 ? 's' : ''}.</div>
                </div>
            </div>
            <div class="cmp-winner-scores">
                ${result.ranking.map(([s, sc], i) => `
                    <div>${i === 0 ? '&#129352;' : i === 1 ? '&#129353;' : '&#129354;'} ${CMP_STRAT_META[s].name} : <b>${(sc * 100).toFixed(0)}/100</b></div>
                `).join('')}
            </div>
        `;
    }

    const allCriteria = Object.keys(CMP_CRIT_LABELS);
    let chartHtml = `<div class="cmp-row head">
        <div class="cmp-cell">Critere</div>
        <div class="cmp-cell">Mensuel</div>
        <div class="cmp-cell">Annuel</div>
        <div class="cmp-cell">Fichier unique</div>
    </div>`;
    allCriteria.forEach(crit => {
        const isSelected = selected.includes(crit);
        const cellFor = (s) => {
            const v = CMP_SCORES[s][crit];
            const cls = v >= 0.75 ? 'fast' : v >= 0.5 ? 'med' : 'slow';
            const dis = isSelected ? '' : ' disabled';
            return `<div class="cmp-cell${dis}">
                <div class="cmp-bar"><div class="cmp-fill ${cls}" style="width:${(v*100).toFixed(0)}%"></div></div>
                <div class="cmp-val">${(v*100).toFixed(0)}</div>
            </div>`;
        };
        chartHtml += `<div class="cmp-row">
            <div class="cmp-cell label">${CMP_CRIT_LABELS[crit]}${isSelected ? '' : ' <span style="font-size:9px;color:var(--text-muted);">(non comptee)</span>'}</div>
            ${cellFor('monthly')}
            ${cellFor('yearly')}
            ${cellFor('single')}
        </div>`;
    });
    chartEl.innerHTML = chartHtml;

    grid.innerHTML = ['monthly', 'yearly', 'single'].map(s => {
        const m = CMP_STRAT_META[s];
        const isWinner = result && result.winner === s;
        return `<div class="cmp-strat ${isWinner ? 'winner' : ''}">
            <div class="cmp-strat-head">
                <div class="cmp-strat-icon" style="background:${m.color}22;color:${m.color}">${m.icon}</div>
                <div class="cmp-strat-name">${m.name}${isWinner ? ' &#127942;' : ''}</div>
            </div>
            <div class="cmp-strat-section">
                <h4>Avantages</h4>
                <ul class="pros">${m.pros.map(p => '<li>' + p + '</li>').join('')}</ul>
            </div>
            <div class="cmp-strat-section">
                <h4>Inconvenients</h4>
                <ul class="cons">${m.cons.map(p => '<li>' + p + '</li>').join('')}</ul>
            </div>
        </div>`;
    }).join('');

    if (result) {
        radial.innerHTML = result.ranking.map(([s, sc], i) => {
            const m = CMP_STRAT_META[s];
            const pct = sc * 100;
            const cls = pct >= 75 ? 'fast' : pct >= 50 ? 'med' : 'slow';
            return `<div class="cmp-radial-row">
                <div class="cmp-radial-name">${i === 0 ? '&#127942;' : ''} ${m.name}</div>
                <div class="cmp-radial-bar"><div class="cmp-radial-fill cmp-fill ${cls}" style="width:${pct}%"></div></div>
                <div class="cmp-radial-score">${pct.toFixed(0)}</div>
            </div>`;
        }).join('');
    } else {
        radial.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:10px;">Selectionne des criteres pour calculer les scores.</div>';
    }
}

function renderStrategyHelp(strategy) {
    const s = STRATEGY_DETAILS[strategy] || STRATEGY_DETAILS.monthly;
    const fileBoxes = s.files.map(f => `<div class="sh-file ${f === '...' ? 'dim' : ''}">${f === '...' ? '...' : 'data/stats/' + f}</div>`).join('');
    const perfRow = (label, val, ideal) => {
        const cls = val >= 0.85 ? 'fast' : val >= 0.6 ? 'med' : 'slow';
        const txt = val >= 0.85 ? 'Rapide' : val >= 0.6 ? 'Moyen' : 'Lent';
        return `<div class="sh-perf-row"><span class="sh-perf-label">${label}</span><div class="sh-perf-bar"><div class="sh-perf-fill ${cls}" style="width:${(val*100).toFixed(0)}%"></div></div><span class="sh-perf-val">${txt}</span></div>`;
    };
    return `
        <div class="sh-head">
            <div class="sh-icon ${strategy}">${s.icon}</div>
            <div>
                <div class="sh-name">${s.name}${s.recommended ? '<span class="sh-recommended">Recommande</span>' : ''}</div>
                <div class="sh-desc" style="margin-top:2px;">${s.desc}</div>
            </div>
        </div>
        <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">Fichiers crees :</div>
        <div class="sh-files">${fileBoxes}</div>
        <div class="sh-grid">
            <div class="sh-card">
                <div class="sh-card-title">Avantages</div>
                <ul class="sh-list pros">${s.pros.map(p => '<li>' + p + '</li>').join('')}</ul>
            </div>
            <div class="sh-card">
                <div class="sh-card-title">Inconvenients</div>
                <ul class="sh-list cons">${s.cons.map(p => '<li>' + p + '</li>').join('')}</ul>
            </div>
        </div>
        <div class="sh-perf">
            <div class="sh-card-title" style="margin-bottom:8px;font-weight:600;font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Performance</div>
            ${perfRow('Vue Jour', s.perf.read_day)}
            ${perfRow('Vue Mois', s.perf.read_month)}
            ${perfRow('Vue Annee', s.perf.read_year)}
            ${perfRow('Vue Global', s.perf.read_global)}
            ${perfRow('Sur 5 ans+', s.perf.scaling)}
        </div>
    `;
}

async function statsApiCall(url) {
    const resp = await fetch(url);
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
        throw new Error('Le serveur n\'expose pas /api/stats. Redemarre le serveur Node (Ctrl+C dans le terminal puis relance start.bat) pour charger la nouvelle route.');
    }
    return resp.json();
}

function previewStrategy(strategy) {
    const help = document.getElementById('strategyHelp');
    const applied = help && help.dataset.applied;
    document.querySelectorAll('#strategySeg .seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.strategy === strategy);
    });
    if (!help) return;
    help.innerHTML = renderStrategyHelp(strategy);
    if (strategy !== applied) {
        const btn = document.createElement('button');
        btn.className = 'btn-apply-strategy';
        btn.style.cssText = 'margin-top:12px;background:var(--primary);color:#fff;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-size:13px;width:100%;font-weight:600;';
        btn.textContent = `Appliquer la strategie "${STRATEGY_DETAILS[strategy].name}" (reecriture des fichiers)`;
        btn.onclick = () => applyStorageStrategy(strategy);
        help.appendChild(btn);
    }
}

function applyStorageStrategy(strategy) {
    if (!confirm(`Changer pour "${STRATEGY_DETAILS[strategy].name}" va reecrire tous les fichiers de stockage. Continuer ?`)) return;
    statsApiCall('api/stats?action=set_strategy&strategy=' + encodeURIComponent(strategy))
        .then(data => {
            if (!data.success) { alert('Erreur : ' + (data.error || 'inconnue')); return; }
            showToast(`Strategie "${strategy}" appliquee (${data.count || 0} evenements reecrits)`);
            loadStorageInfo();
            loadProfileStats();
        })
        .catch(e => alert(e.message));
}

function reimportStats() {
    if (!confirm('Cela va effacer le stockage actuel et reimporter depuis history.json + flow.json. Continuer ?')) return;
    statsApiCall('api/stats?action=reimport')
        .then(data => {
            if (!data.success) { alert('Erreur : ' + (data.error || 'inconnue')); return; }
            showToast(`Import termine : ${data.count || 0} evenements`);
            loadStorageInfo();
            loadProfileStats();
        })
        .catch(e => alert(e.message));
}

function fmtBytes(n) {
    if (n < 1024) return n + ' o';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' Ko';
    return (n / 1024 / 1024).toFixed(2) + ' Mo';
}

async function loadStorageInfo() {
    try {
        const data = await statsApiCall('api/stats?action=info');
        if (!data.success) return;

        document.querySelectorAll('#strategySeg .seg-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.strategy === data.strategy);
        });
        const help = document.getElementById('strategyHelp');
        help.dataset.applied = data.strategy;
        help.innerHTML = renderStrategyHelp(data.strategy);

        const info = document.getElementById('storageInfo');
        const esc = (s) => String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
        let html = `<div style="margin-bottom:8px;">
            <strong>${data.fileCount}</strong> fichier${data.fileCount > 1 ? 's' : ''}
            &middot; <strong>${data.totalEvents}</strong> evenement${data.totalEvents > 1 ? 's' : ''}
            &middot; <strong>${fmtBytes(data.totalSize)}</strong> au total
            ${data.migrated ? '' : '<span style="color:var(--error);"> (jamais importe)</span>'}
        </div>`;
        if (data.files.length) {
            html += '<details style="font-size:11px;color:var(--text-muted);"><summary style="cursor:pointer;">Voir les fichiers</summary><div style="margin-top:6px;display:grid;grid-template-columns:auto 1fr 1fr;gap:4px 12px;">';
            html += '<span style="font-weight:600;">Fichier</span><span style="font-weight:600;">Taille</span><span style="font-weight:600;">Events</span>';
            data.files.forEach(f => {
                html += `<span>${esc(f.name)}</span><span>${fmtBytes(f.size)}</span><span>${f.events}</span>`;
            });
            html += '</div></details>';
        } else {
            html += '<div style="color:var(--text-muted);font-size:11px;">Aucun fichier - clique sur "Re-importer" pour creer le stockage initial.</div>';
        }
        info.innerHTML = html;
    } catch (e) {
        const info = document.getElementById('storageInfo');
        if (info) info.innerHTML = `<div style="color:var(--error);font-size:12px;padding:10px;background:var(--bg-hover);border-radius:8px;border:1px solid var(--error);">${e.message}</div>`;
        console.error('loadStorageInfo error', e);
    }
}

function setStatsDesign(d) {
    statsState.design = d;
    localStorage.setItem('yt_stats_design', d);
    document.querySelectorAll('#statsDesignSeg .seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.design === d);
    });
    const cont = document.getElementById('statsContainer');
    if (cont) cont.className = 'profile-container stats-design-' + d;
    if (statsState.cache) renderStatsFromCache();
}

async function loadProfileStats() {
    try {
        if (statsState.year == null) {
            const now = new Date();
            statsState.year = now.getFullYear();
            statsState.month = now.getMonth() + 1;
        }
        const params = new URLSearchParams({ action: 'get', view: statsState.view });
        if (statsState.view === 'month' || statsState.view === 'day') params.set('year', statsState.year);
        if (statsState.view === 'day') params.set('month', statsState.month);

        const [statsResp, topResp] = await Promise.all([
            fetch('api/stats?' + params.toString()),
            fetch('api/stats?' + new URLSearchParams({ action: 'top_artists', view: statsState.view, year: statsState.year || 0, month: statsState.month || 0 }).toString())
        ]);
        const data = await statsResp.json();
        const topData = await topResp.json();
        if (!data.success) return;

        statsState.availableMonths = data.availableMonths || [];
        statsState.cache = { data, top: (topData.success ? topData.top : []) };

        setStatsDesign(statsState.design);
        renderStatsFromCache();
    } catch (e) {
        console.error('loadProfileStats error', e);
    }
}

function renderStatsFromCache() {
    if (!statsState.cache) return;
    renderStats(statsState.cache.data, statsState.cache.top);
}

function setStatsView(view) {
    statsState.view = view;
    statsState.currentBucket = null;
    document.querySelectorAll('#statsViewSeg .seg-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === view);
    });
    closeHourDetails();
    loadProfileStats();
}

function navStatsPeriod(delta) {
    const v = statsState.view;
    if (v === 'month') {
        statsState.year += delta;
    } else if (v === 'day') {
        let m = statsState.month + delta;
        let y = statsState.year;
        if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
        statsState.year = y; statsState.month = m;
    } else { return; }
    closeHourDetails();
    loadProfileStats();
}

function navStatsToday() {
    const now = new Date();
    statsState.year = now.getFullYear();
    statsState.month = now.getMonth() + 1;
    closeHourDetails();
    loadProfileStats();
}

function renderStats(data, topArtists) {
    const buckets = data.buckets || [];
    const v = statsState.view;
    const monthDays = (statsState.view === 'day' && statsState.year && statsState.month)
        ? new Date(statsState.year, statsState.month, 0).getDate() : 0;

    const periodNav = document.getElementById('periodNav');
    const periodLabel = document.getElementById('periodLabel');
    const periodPrev = document.getElementById('periodPrev');
    const periodNext = document.getElementById('periodNext');
    const periodToday = document.getElementById('periodToday');
    if (v === 'global' || v === 'year') {
        periodNav.classList.add('hidden');
    } else {
        periodNav.classList.remove('hidden');
        if (v === 'month') periodLabel.textContent = 'Annee ' + statsState.year;
        else periodLabel.textContent = STATS_MONTH_NAMES[statsState.month - 1] + ' ' + statsState.year;
        periodPrev.disabled = false; periodNext.disabled = false; periodToday.style.display = '';
    }

    const total = data.total || 0;
    document.getElementById('statTotal').textContent = total;
    const scopeText = (v === 'global') ? 'depuis le debut'
        : (v === 'year') ? 'toutes annees'
        : (v === 'month') ? 'en ' + statsState.year
        : 'en ' + STATS_MONTH_NAMES[statsState.month - 1] + ' ' + statsState.year;
    document.getElementById('statTotalSub').textContent = scopeText;

    let peakIdx = -1, peakVal = 0;
    buckets.forEach((b, i) => { if (b.count > peakVal) { peakVal = b.count; peakIdx = i; } });
    const elTop = document.getElementById('statTopHour');
    const elTopLabel = document.getElementById('statTopLabel');
    const elTopSub = document.getElementById('statTopHourSub');
    const labels = { global: 'Heure la plus active', year: 'Annee la plus active', month: 'Mois le plus actif', day: 'Jour le plus actif' };
    elTopLabel.textContent = labels[v];
    if (peakIdx >= 0 && peakVal > 0) {
        const b = buckets[peakIdx];
        elTop.textContent = (v === 'month') ? STATS_MONTH_NAMES[b.key - 1] : (v === 'day') ? (String(b.key).padStart(2,'0') + '/' + String(statsState.month).padStart(2,'0')) : b.label;
        elTopSub.textContent = peakVal + ' evenement' + (peakVal > 1 ? 's' : '');
    } else {
        elTop.textContent = '-'; elTopSub.textContent = 'Aucune donnee';
    }

    const elArt = document.getElementById('statTopArtist');
    const elArtSub = document.getElementById('statTopArtistSub');
    if (topArtists && topArtists.length) {
        const [name, c] = topArtists[0];
        elArt.textContent = name.length > 22 ? name.substring(0, 20) + '...' : name;
        elArt.title = name;
        elArtSub.textContent = c + ' evenement' + (c > 1 ? 's' : '');
    } else {
        elArt.textContent = '-'; elArtSub.textContent = 'Aucune donnee';
    }
    document.getElementById('topArtistScope').textContent = '(' + scopeText + ')';

    const elRange = document.getElementById('statHourRange');
    const elRangeLabel = document.getElementById('statRangeLabel');
    const elRangeSub = document.getElementById('statHourRangeSub');
    const rLabels = { global: 'Plage horaire (80%)', year: 'Periode active', month: 'Mois actifs', day: 'Jours actifs' };
    elRangeLabel.textContent = rLabels[v];
    if (total > 0 && buckets.length) {
        if (v === 'global') {
            const hSorted = buckets.map((b, i) => ({ v: b.count, i })).sort((a,b) => b.v - a.v);
            let acc = 0, kept = [];
            for (const x of hSorted) { if (!x.v) break; acc += x.v; kept.push(x.i); if (acc/total >= 0.8) break; }
            kept.sort((a,b)=>a-b);
            elRange.textContent = String(kept[0]).padStart(2,'0') + 'h - ' + String(kept[kept.length-1]).padStart(2,'0') + 'h';
            const minH = kept[0], maxH = kept[kept.length-1];
            const period = maxH < 12 ? 'matinee' : (minH >= 18 ? 'soiree' : (minH >= 12 ? 'apres-midi' : 'journee'));
            elRangeSub.textContent = 'Surtout en ' + period;
        } else {
            const active = buckets.filter(b => b.count > 0);
            if (!active.length) { elRange.textContent = '-'; elRangeSub.textContent = 'Aucune donnee'; }
            else {
                const fmt = (b) => v === 'month' ? STATS_MONTH_SHORT[b.key - 1] : v === 'year' ? String(b.key) : String(b.key).padStart(2,'0');
                elRange.textContent = fmt(active[0]) + ' - ' + fmt(active[active.length - 1]);
                elRangeSub.textContent = active.length + ' periode' + (active.length > 1 ? 's' : '') + ' avec activite';
            }
        }
    } else {
        elRange.textContent = '-'; elRangeSub.textContent = 'Aucune donnee';
    }

    const titleEl = document.getElementById('chartMainTitle');
    const titles = {
        global: 'Activite par heure (toutes periodes)',
        year: 'Activite par annee',
        month: 'Activite par mois en ' + statsState.year,
        day: 'Activite par jour en ' + STATS_MONTH_NAMES[statsState.month - 1] + ' ' + statsState.year
    };
    titleEl.innerHTML = titles[v] + ' <span style="font-weight:400;color:var(--text-muted);font-size:11px;">(clique sur une barre pour ' + (v === 'day' ? 'voir le detail' : 'zoomer / voir le detail') + ')</span>';

    renderBucketChart(buckets, peakIdx);

    const xAxis = document.getElementById('chartXAxis');
    if (!buckets.length) { xAxis.innerHTML = ''; }
    else if (v === 'global') xAxis.innerHTML = ['00h','06h','12h','18h','23h'].map(s=>`<span>${s}</span>`).join('');
    else if (v === 'year') xAxis.innerHTML = `<span>${buckets[0].label}</span><span>${buckets[buckets.length-1].label}</span>`;
    else if (v === 'month') xAxis.innerHTML = ['Jan','Avr','Juil','Oct','Dec'].map(s=>`<span>${s}</span>`).join('');
    else if (v === 'day') {
        const last = buckets.length;
        xAxis.innerHTML = ['1', String(Math.ceil(last/2)), String(last)].map(s=>`<span>${s}</span>`).join('');
    }

    renderArtistChart((topArtists || []).slice(0, 5));
}

function renderBucketChart(buckets, peakIdx) {
    const d = statsState.design;
    if (d === 'line') return renderChartLine(buckets, peakIdx);
    if (d === 'heatmap') return renderChartHeatmap(buckets, peakIdx);
    if (d === 'minimal') return renderChartMinimal(buckets, peakIdx);
    return renderChartBars(buckets, peakIdx, d);
}

function chartEmptyMsg(svg, W, H) {
    svg.innerHTML = `<text x="${W/2}" y="${H/2}" text-anchor="middle" fill="#888" font-size="13">Aucune donnee</text>`;
}

function renderChartBars(buckets, peakIdx, design) {
    const svg = document.getElementById('chartHours');
    if (!svg) return;
    const W = 480, H = 200, pad = 22, n = Math.max(1, buckets.length);
    const innerW = W - pad * 2, innerH = H - pad * 2;
    const max = Math.max(1, ...buckets.map(b => b.count));
    const barW = innerW / n;
    const gap = Math.min(barW * 0.2, 6);

    let svgHtml = '';
    if (design === 'vibrant') {
        svgHtml += `<defs>
            <linearGradient id="barGradV" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stop-color="#9c27b0"/>
                <stop offset="50%" stop-color="#e91e63"/>
                <stop offset="100%" stop-color="#ff9800"/>
            </linearGradient>
            <linearGradient id="barGradPeak" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stop-color="#ff5722"/>
                <stop offset="100%" stop-color="#ffeb3b"/>
            </linearGradient>
        </defs>`;
    }
    for (let i = 1; i < 4; i++) {
        const y = pad + (innerH * i / 4);
        svgHtml += `<line class="grid-line" x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}"/>`;
    }
    if (!buckets.length) { chartEmptyMsg(svg, W, H); return; }
    buckets.forEach((b, i) => {
        const h = (b.count / max) * innerH;
        const x = pad + i * barW + gap / 2;
        const y = H - pad - h;
        const cls = (i === peakIdx && b.count > 0) ? 'bar peak' : 'bar';
        const w = (barW - gap).toFixed(2);
        const hitX = (pad + i * barW).toFixed(2);
        const tip = `${b.label} : ${b.count} evenement${b.count > 1 ? 's' : ''}`;
        const fill = design === 'vibrant'
            ? ((i === peakIdx && b.count > 0) ? 'url(#barGradPeak)' : 'url(#barGradV)')
            : '';
        const fillAttr = fill ? ` fill="${fill}"` : '';
        svgHtml += `<rect class="${cls}" data-idx="${i}"${fillAttr} x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w}" height="${h.toFixed(2)}" rx="2" onclick="onBucketClick(${i})"><title>${tip}</title></rect>`;
        svgHtml += `<rect class="bar-hit" data-idx="${i}" x="${hitX}" y="${pad}" width="${barW.toFixed(2)}" height="${innerH}" onclick="onBucketClick(${i})"><title>${tip}</title></rect>`;
    });
    svg.innerHTML = svgHtml;
}

function renderChartLine(buckets, peakIdx) {
    const svg = document.getElementById('chartHours');
    if (!svg) return;
    const W = 480, H = 200, pad = 22, n = Math.max(1, buckets.length);
    const innerW = W - pad * 2, innerH = H - pad * 2;
    const max = Math.max(1, ...buckets.map(b => b.count));
    const stepX = n > 1 ? innerW / (n - 1) : 0;
    const pts = buckets.map((b, i) => {
        const x = pad + i * stepX;
        const y = H - pad - (b.count / max) * innerH;
        return [x, y];
    });
    let svgHtml = '<defs><linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--primary)" stop-opacity="0.45"/><stop offset="100%" stop-color="var(--primary)" stop-opacity="0"/></linearGradient></defs>';
    for (let i = 1; i < 4; i++) {
        const y = pad + (innerH * i / 4);
        svgHtml += `<line class="grid-line" x1="${pad}" y1="${y}" x2="${W - pad}" y2="${y}"/>`;
    }
    if (!buckets.length) { chartEmptyMsg(svg, W, H); return; }
    if (pts.length > 1) {
        const area = `M ${pts[0][0]} ${H - pad} ` + pts.map(p => `L ${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ') + ` L ${pts[pts.length-1][0]} ${H - pad} Z`;
        const line = 'M ' + pts.map(p => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' L ');
        svgHtml += `<path d="${area}" fill="url(#areaGrad)"/>`;
        svgHtml += `<path d="${line}" fill="none" stroke="var(--primary)" stroke-width="2.2"/>`;
    }
    pts.forEach((p, i) => {
        const r = (i === peakIdx && buckets[i].count > 0) ? 5 : 3;
        const fill = (i === peakIdx && buckets[i].count > 0) ? '#ff5722' : 'var(--primary)';
        const tip = `${buckets[i].label} : ${buckets[i].count} evenement${buckets[i].count > 1 ? 's' : ''}`;
        svgHtml += `<circle class="bar" data-idx="${i}" cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="${r}" fill="${fill}" stroke="var(--bg-card)" stroke-width="1.5" onclick="onBucketClick(${i})"><title>${tip}</title></circle>`;
        const hitX = pad + (i - 0.5) * stepX;
        svgHtml += `<rect class="bar-hit" data-idx="${i}" x="${hitX.toFixed(2)}" y="${pad}" width="${stepX.toFixed(2)}" height="${innerH}" onclick="onBucketClick(${i})"><title>${tip}</title></rect>`;
    });
    svg.innerHTML = svgHtml;
}

function renderChartHeatmap(buckets, peakIdx) {
    const svg = document.getElementById('chartHours');
    if (!svg) return;
    const W = 480, H = 200, pad = 14, n = Math.max(1, buckets.length);
    const innerW = W - pad * 2, innerH = H - pad * 2;
    const max = Math.max(1, ...buckets.map(b => b.count));
    let cols, rows;
    if (n <= 12) { cols = n; rows = 1; }
    else if (n === 24) { cols = 12; rows = 2; }
    else if (n <= 31) { cols = 7; rows = Math.ceil(n / 7); }
    else { cols = Math.ceil(Math.sqrt(n)); rows = Math.ceil(n / cols); }
    const cellW = innerW / cols, cellH = innerH / rows;
    let svgHtml = '';
    if (!buckets.length) { chartEmptyMsg(svg, W, H); return; }
    buckets.forEach((b, i) => {
        const r = Math.floor(i / cols), c = i % cols;
        const x = pad + c * cellW, y = pad + r * cellH;
        const intensity = b.count / max;
        let color;
        if (b.count === 0) color = 'rgba(255,255,255,0.05)';
        else {
            const hue = 220 - intensity * 220;
            color = `hsl(${hue.toFixed(0)}, 80%, ${(35 + intensity * 30).toFixed(0)}%)`;
        }
        const tip = `${b.label} : ${b.count} evenement${b.count > 1 ? 's' : ''}`;
        const stroke = (i === peakIdx && b.count > 0) ? ' stroke="#fff" stroke-width="2"' : '';
        svgHtml += `<rect class="bar" data-idx="${i}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(cellW - 3).toFixed(2)}" height="${(cellH - 3).toFixed(2)}" rx="4" fill="${color}"${stroke} onclick="onBucketClick(${i})"><title>${tip}</title></rect>`;
        if (cellW > 30) {
            svgHtml += `<text x="${(x + cellW/2 - 1.5).toFixed(2)}" y="${(y + cellH/2 + 3).toFixed(2)}" text-anchor="middle" fill="#fff" font-size="10" pointer-events="none" opacity="${b.count > 0 ? 0.95 : 0.3}">${b.label}</text>`;
        }
    });
    svg.innerHTML = svgHtml;
}

function renderChartMinimal(buckets, peakIdx) {
    const svg = document.getElementById('chartHours');
    if (!svg) return;
    const W = 480, H = 200, pad = 16, n = Math.max(1, buckets.length);
    const innerW = W - pad * 2, innerH = H - pad * 2;
    const max = Math.max(1, ...buckets.map(b => b.count));
    const barW = innerW / n;
    let svgHtml = '';
    if (!buckets.length) { chartEmptyMsg(svg, W, H); return; }
    buckets.forEach((b, i) => {
        const h = (b.count / max) * innerH;
        const x = pad + i * barW + 1;
        const y = H - pad - h;
        const w = Math.max(2, barW - 2);
        const fill = (i === peakIdx && b.count > 0) ? 'var(--text)' : 'var(--text-muted)';
        const tip = `${b.label} : ${b.count} evenement${b.count > 1 ? 's' : ''}`;
        svgHtml += `<rect class="bar" data-idx="${i}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${fill}" onclick="onBucketClick(${i})"><title>${tip}</title></rect>`;
        const hitX = (pad + i * barW).toFixed(2);
        svgHtml += `<rect class="bar-hit" data-idx="${i}" x="${hitX}" y="${pad}" width="${barW.toFixed(2)}" height="${innerH}" onclick="onBucketClick(${i})"><title>${tip}</title></rect>`;
    });
    svgHtml += `<line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="var(--border)" stroke-width="1"/>`;
    svg.innerHTML = svgHtml;
}

async function onBucketClick(idx) {
    if (!statsState.cache) return;
    const buckets = statsState.cache.data.buckets || [];
    if (!buckets[idx]) return;
    const b = buckets[idx];
    const v = statsState.view;
    statsState.currentBucket = { view: v, key: b.key, label: b.label };

    document.querySelectorAll('#chartHours .bar').forEach(el => {
        el.classList.toggle('selected', parseInt(el.dataset.idx, 10) === idx);
    });

    let title;
    if (v === 'global') title = `Detail pour ${b.label} - ${b.label}59`;
    else if (v === 'year') title = `Detail pour l'annee ${b.key}`;
    else if (v === 'month') title = `Detail pour ${STATS_MONTH_NAMES[b.key-1]} ${statsState.year}`;
    else title = `Detail pour le ${String(b.key).padStart(2,'0')}/${String(statsState.month).padStart(2,'0')}/${statsState.year}`;

    const drillBtn = document.getElementById('hourDrillDown');
    if (v === 'year' || v === 'month') {
        drillBtn.style.display = '';
        drillBtn.textContent = (v === 'year') ? 'Voir les mois' : 'Voir les jours';
    } else {
        drillBtn.style.display = 'none';
    }

    const listEl = document.getElementById('hourDetailsList');
    document.getElementById('hourDetailsTitle').textContent = title + '  (chargement...)';
    listEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px;">Chargement...</div>';
    document.getElementById('hourDetailsPanel').style.display = 'block';
    document.getElementById('hourDetailsPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    try {
        const params = new URLSearchParams({ action: 'details', view: v, key: b.key });
        if (statsState.year) params.set('year', statsState.year);
        if (statsState.month) params.set('month', statsState.month);
        const resp = await fetch('api/stats?' + params.toString());
        const data = await resp.json();
        if (!data.success) throw new Error(data.error || 'erreur');
        showBucketDetailsPanel(title + `  (${data.total} evenement${data.total > 1 ? 's' : ''})`, data.items, data.total);
    } catch (e) {
        listEl.innerHTML = `<div style="color:var(--error);font-size:12px;text-align:center;padding:20px;">Erreur : ${e.message}</div>`;
    }
}

function drillDownFromBucket() {
    const cb = statsState.currentBucket;
    if (!cb) return;
    if (cb.view === 'year') { statsState.year = cb.key; setStatsView('month'); }
    else if (cb.view === 'month') { statsState.month = cb.key; setStatsView('day'); }
}

function showBucketDetailsPanel(title, items, totalCount) {
    const panel = document.getElementById('hourDetailsPanel');
    const titleEl = document.getElementById('hourDetailsTitle');
    const listEl = document.getElementById('hourDetailsList');
    if (!panel) return;
    titleEl.textContent = title;

    if (!items.length) {
        listEl.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px;">Aucun evenement.</div>';
    } else {
        const esc = (s) => String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
        const kindLabel = (k) => k === 'play' ? 'Lecture Mon Flow' : k === 'add' ? 'Ajout a Mon Flow' : 'Telechargement';
        let html = items.map(it => {
            const p = statsParseTs(it.ts);
            const dateStr = p ? statsFmtDateEU(p) : '';
            const timeStr = p ? statsFmtTime(p) : '';
            const src = it.src || 'audio';
            const icon = src === 'flow' ? '&#9836;' : (src === 'video' ? '&#9654;' : '&#127925;');
            const meta = (it.format || '').toUpperCase() + (it.format ? ' &middot; ' : '') + kindLabel(it.kind) + (it.artist ? ' &middot; ' + esc(it.artist) : '');
            const link = it.url ? `<a href="${esc(it.url)}" target="_blank" style="color:inherit;text-decoration:none;">${esc(it.title || '(sans titre)')}</a>` : esc(it.title || '(sans titre)');
            return `<div class="hd-row">
                <div class="hd-icon ${src}">${icon}</div>
                <div class="hd-info">
                    <div class="hd-title">${link}</div>
                    <div class="hd-meta">${meta}</div>
                </div>
                <div class="hd-time">${dateStr}<br>${timeStr}</div>
            </div>`;
        }).join('');
        if (totalCount && totalCount > items.length) {
            const rest = totalCount - items.length;
            html += `<div style="color:var(--text-muted);font-size:11px;text-align:center;padding:8px;">${rest} evenement${rest > 1 ? 's' : ''} de plus non affiche${rest > 1 ? 's' : ''}</div>`;
        }
        listEl.innerHTML = html;
    }

    panel.style.display = 'block';
}

function closeHourDetails() {
    const panel = document.getElementById('hourDetailsPanel');
    if (panel) panel.style.display = 'none';
    document.querySelectorAll('#chartHours .bar.selected').forEach(b => b.classList.remove('selected'));
    statsState.currentBucket = null;
}

function renderArtistChart(top) {
    const el = document.getElementById('chartArtists');
    if (!el) return;
    if (!top.length) {
        el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px;">Aucune donnee pour cette periode</div>';
        return;
    }
    const max = top[0][1];
    el.innerHTML = top.map(([name, count]) => {
        const pct = max ? (count / max * 100) : 0;
        const safe = name.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));
        return `<div class="chart-bar-h">
            <div class="bh-label" title="${safe}">${safe}</div>
            <div class="bh-track"><div class="bh-fill" style="width:${pct.toFixed(1)}%"></div></div>
            <div class="bh-val">${count}</div>
        </div>`;
    }).join('');
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
            + '<span class="sr-count" id="srCount">' + data.results.length + ' resultat(s) pour "' + query.replace(/</g, '&lt;') + '"</span>'
            + '<button class="sr-btn-all" onclick="sqAddAll()">&#11015; Tout telecharger (' + data.results.length + ')</button>'
            + '<button class="sr-btn-all" style="background:#9C27B0;" onclick="searchAddAllToFlow()">+ Tout dans Mon Flow</button>'
            + '</div>'
            + '<div class="search-filter-bar">'
            + '<span class="sfb-label">Filtrer :</span>'
            + '<button class="sfb-chip active" data-filter="all" onclick="filterSearchResults(\'all\')">Tous <span class="sfb-count" id="sfbCountAll">0</span></button>'
            + '<button class="sfb-chip sfb-new" data-filter="new" onclick="filterSearchResults(\'new\')">&#10024; Nouveaux <span class="sfb-count" id="sfbCountNew">0</span></button>'
            + '<button class="sfb-chip sfb-dl" data-filter="dl" onclick="filterSearchResults(\'dl\')">&#10003; Telecharges <span class="sfb-count" id="sfbCountDl">0</span></button>'
            + '<button class="sfb-chip sfb-flow" data-filter="flow" onclick="filterSearchResults(\'flow\')">&#10003; Mon Flow <span class="sfb-count" id="sfbCountFlow">0</span></button>'
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
            + '<button class="item-move" style="background:#FF6D00;color:#fff;" onclick="searchPlayAudio(' + i + ')" title="Ecouter audio seul">&#127911; Ecouter</button>'
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
let sqLogTab = 'unread';

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

        const inLib = vid && libVids.has(vid);
        const inFlow = vid && flowVids.has(vid);

        const dlBtn = card.querySelector('.item-dl');
        if (dlBtn) {
            dlBtn.classList.toggle('owned', inLib);
            dlBtn.innerHTML = inLib ? '&#10003; DL' : 'DL';
            dlBtn.title = inLib ? 'Deja telecharge - clique pour re-telecharger' : 'Telecharger';
        }
        const flowBtn = card.querySelector('[onclick*="searchAddToFlow"]');
        if (flowBtn) {
            flowBtn.classList.toggle('owned', inFlow);
            flowBtn.innerHTML = inFlow ? '&#10003; Flow' : '+ Flow';
            flowBtn.style.background = '';
            flowBtn.disabled = false;
            flowBtn.title = inFlow ? 'Deja dans Mon Flow' : 'Ajouter a Mon Flow';
        }

        card.classList.toggle('sq-downloaded', inLib);
        card.classList.toggle('sq-in-flow', inFlow);
        card.dataset.isNew = (!inLib && !inFlow) ? '1' : '0';

        let chips = card.querySelector('.status-chips');
        if (!chips) {
            chips = document.createElement('div');
            chips.className = 'status-chips';
            const body = card.querySelector('.item-body');
            if (body) body.insertBefore(chips, body.firstChild);
        }
        let html = '';
        if (inLib) html += '<span class="sc-chip sc-dl" title="Deja dans ta bibliotheque">&#10003; Telecharge</span>';
        if (inFlow) html += '<span class="sc-chip sc-flow" title="Deja dans Mon Flow">&#10003; Mon Flow</span>';
        if (!inLib && !inFlow) html += '<span class="sc-chip sc-new" title="Nouveau pour toi">Nouveau</span>';
        chips.innerHTML = html;
    }
    updateSearchFilterCounts();
    const cur = (document.querySelector('.sfb-chip.active') || {}).dataset?.filter || 'all';
    filterSearchResults(cur);
}

function updateSearchFilterCounts() {
    const cards = document.querySelectorAll('#searchGrid .item-card');
    let dl = 0, flow = 0, news = 0;
    cards.forEach(c => {
        if (c.classList.contains('sq-downloaded')) dl++;
        if (c.classList.contains('sq-in-flow')) flow++;
        if (c.dataset.isNew === '1') news++;
    });
    const set = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    set('sfbCountAll', cards.length);
    set('sfbCountNew', news);
    set('sfbCountDl', dl);
    set('sfbCountFlow', flow);
}

function filterSearchResults(filter) {
    document.querySelectorAll('.sfb-chip').forEach(b => {
        b.classList.toggle('active', b.dataset.filter === filter);
    });
    const cards = document.querySelectorAll('#searchGrid .item-card');
    let visible = 0;
    cards.forEach(c => {
        let show = true;
        if (filter === 'new') show = c.dataset.isNew === '1';
        else if (filter === 'dl') show = c.classList.contains('sq-downloaded');
        else if (filter === 'flow') show = c.classList.contains('sq-in-flow');
        c.style.display = show ? '' : 'none';
        if (show) visible++;
    });
    const countEl = document.getElementById('srCount');
    if (countEl) {
        const labels = { all: 'tous', new: 'nouveaux', dl: 'deja telecharges', flow: 'dans Mon Flow' };
        const label = labels[filter] || filter;
        countEl.textContent = (filter === 'all')
            ? `${visible} resultat${visible > 1 ? 's' : ''}`
            : `${visible} ${label} sur ${cards.length}`;
    }
}

// --- Ajouter un element ---
let searchPlayIdx = -1;

async function searchPlayAudio(index) {
    const r = lastSearchResults && lastSearchResults[index];
    if (!r || !r.url) return;

    const bar = document.getElementById('playerBar');
    const mainAudio = document.getElementById('audioEl');

    mainAudio.pause();
    mainAudio.src = '';

    searchPlayIdx = index;
    playbackContext = 'search';

    bar.classList.add('active');
    document.body.classList.add('player-open');
    closeVideoPlayer();

    let thumb = r.thumbnail || '';
    if (!thumb) { const m = (r.url || '').match(/[?&]v=([^&]+)/); if (m) thumb = 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg'; }

    document.getElementById('playerThumb').src = thumb;
    document.getElementById('playerTitle').textContent = r.title || 'Chargement...';
    document.getElementById('playerArtist').textContent = (r.channel || '') + ' · Chargement...';
    document.getElementById('btnPlayPause').innerHTML = '&#9654;';
    const nextEl = document.getElementById('playerNext');
    if (nextEl) nextEl.style.display = 'none';

    try {
        const resp = await fetch('api/stream?url=' + encodeURIComponent(r.url) + '&type=audio');
        const data = await resp.json();
        if (!data.success) {
            document.getElementById('playerArtist').textContent = 'Erreur : flux indisponible';
            return;
        }
        mainAudio.src = data.streamUrl;
        mainAudio.volume = document.getElementById('volumeSlider').value / 100;
        mainAudio.play().catch(() => {});
        document.getElementById('playerArtist').textContent = (r.channel || '') + ' · Streaming';
        document.getElementById('btnPlayPause').innerHTML = '&#9646;&#9646;';
        mainAudio.onended = function() { searchPlayNext(); };
        const card = document.querySelector('#searchGrid .item-card:nth-child(' + (index + 1) + ')');
        const owned = card && (card.classList.contains('sq-downloaded') || card.classList.contains('sq-in-flow'));
        if (!owned) recordEphemeralListen(r);
    } catch (e) {
        document.getElementById('playerArtist').textContent = 'Erreur de connexion';
    }
}

function searchPlayNext() {
    if (!lastSearchResults || lastSearchResults.length === 0) return;
    const n = (searchPlayIdx + 1) % lastSearchResults.length;
    searchPlayAudio(n);
}

function searchPlayPrev() {
    if (!lastSearchResults || lastSearchResults.length === 0) return;
    const n = (searchPlayIdx - 1 + lastSearchResults.length) % lastSearchResults.length;
    searchPlayAudio(n);
}

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
        if (data.success) {
            const card = btn.closest('.item-card');
            if (card) {
                card.classList.add('sq-in-flow');
                card.dataset.isNew = '0';
            }
            setTimeout(() => sqMarkDownloaded(), 200);
        }
    } catch (e) { btn.textContent = '!'; }
    setTimeout(() => { btn.disabled = false; sqMarkDownloaded(); }, 2500);
}

async function searchAddAllToFlow() {
    if (!lastSearchResults || lastSearchResults.length === 0) return;
    const items = lastSearchResults.map(r => ({
        url: r.url, title: r.title || '', channel: r.channel || '',
        thumbnail: r.thumbnail || '', duration: r.duration || ''
    }));
    const queryInput = document.getElementById('searchInput');
    const defaultName = queryInput ? (queryInput.value || '').trim() : '';
    openAddBulkToFlow(items, () => sqMarkDownloaded(), defaultName);
}

async function openAddBulkToFlow(items, onDone, defaultName) {
    if (!items || !items.length) return;
    let existing = [];
    try {
        const resp = await fetch('api/flow?action=list');
        const data = await resp.json();
        if (data.success) existing = (data.playlists || []).map(p => p.name).filter(Boolean);
    } catch (e) {}
    aafPendingItems = items;
    aafOnDone = onDone || null;
    showAddAllToFlowModal(existing, items.length, defaultName || '');
}

let aafPendingItems = [];
let aafOnDone = null;

function showAddAllToFlowModal(existingPlaylists, count, defaultName) {
    let modal = document.getElementById('addAllFlowModal');
    if (modal) modal.remove();

    const existingOptions = existingPlaylists.length
        ? existingPlaylists.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n.replace(/</g,'&lt;')}</option>`).join('')
        : '<option disabled>(aucune playlist existante)</option>';

    const safeDefault = (defaultName || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const proposedDefault = defaultName && existingPlaylists.some(n => n.toLowerCase() === defaultName.toLowerCase())
        ? defaultName + ' (2)' : defaultName || '';
    const safeProposed = proposedDefault.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    const newDefaultChecked = defaultName ? 'checked' : '';
    const noneChecked = defaultName ? '' : 'checked';

    const html = `
        <div class="modal-overlay active" id="addAllFlowModal">
            <div class="modal" style="width:420px;">
                <h3>Ajouter ${count} titre${count > 1 ? 's' : ''} a Mon Flow</h3>
                <p style="color:var(--text-muted);font-size:12px;margin-bottom:16px;margin-top:-8px;">Choisis ou se rangent les nouveaux titres.</p>

                <div style="margin-bottom:14px;">
                    <label class="modal-radio"><input type="radio" name="aafDest" value="none" ${noneChecked} onchange="aafUpdateMode()"> <span>Aucune playlist (racine de Mon Flow)</span></label>
                </div>
                <div style="margin-bottom:14px;">
                    <label class="modal-radio"><input type="radio" name="aafDest" value="existing" onchange="aafUpdateMode()" ${existingPlaylists.length ? '' : 'disabled'}> <span>Playlist existante</span></label>
                    <select id="aafExistingSelect" disabled style="margin-top:6px;">${existingOptions}</select>
                </div>
                <div style="margin-bottom:14px;">
                    <label class="modal-radio"><input type="radio" name="aafDest" value="new" ${newDefaultChecked} onchange="aafUpdateMode()"> <span>Nouvelle playlist${defaultName ? ' <span style="color:var(--text-muted);font-size:11px;">(pre-rempli avec ta recherche, modifiable)</span>' : ''}</span></label>
                    <input type="text" id="aafNewName" placeholder="Nom de la nouvelle playlist..." value="${safeProposed}" maxlength="60" oninput="aafValidateNewName()" onkeydown="if(event.key==='Enter')aafSubmit()" style="margin-top:6px;">
                    <div id="aafNameError" style="color:var(--error,#f44336);font-size:11px;margin-top:4px;display:none;"></div>
                </div>

                <div class="modal-btns">
                    <button class="btn-cancel" onclick="aafClose()">Annuler</button>
                    <button id="aafSubmitBtn" onclick="aafSubmit()" style="background:var(--primary);color:#fff;border:none;border-radius:20px;font-weight:600;">Ajouter</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    aafExisting = existingPlaylists.slice();
    setTimeout(() => {
        aafUpdateMode();
        if (defaultName) {
            const inp = document.getElementById('aafNewName');
            if (inp) { inp.focus(); inp.select(); }
        }
    }, 30);
}

let aafExisting = [];

function aafUpdateMode() {
    const mode = document.querySelector('input[name="aafDest"]:checked').value;
    document.getElementById('aafExistingSelect').disabled = mode !== 'existing';
    const newInput = document.getElementById('aafNewName');
    newInput.disabled = mode !== 'new';
    if (mode === 'new') newInput.focus();
    aafValidateNewName();
}

function aafValidateNewName() {
    const mode = document.querySelector('input[name="aafDest"]:checked').value;
    const errEl = document.getElementById('aafNameError');
    const submitBtn = document.getElementById('aafSubmitBtn');
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
    errEl.style.display = 'none';
    errEl.style.color = '';
    submitBtn.textContent = 'Ajouter';
    if (mode !== 'new') return;
    const name = (document.getElementById('aafNewName').value || '').trim();
    if (!name) {
        errEl.textContent = 'Donne un nom a ta playlist.';
        errEl.style.color = 'var(--error,#f44336)';
        errEl.style.display = 'block';
        submitBtn.disabled = true; submitBtn.style.opacity = '0.5';
        return;
    }
    if (name.length > 60) {
        errEl.textContent = '60 caracteres maximum.';
        errEl.style.color = 'var(--error,#f44336)';
        errEl.style.display = 'block';
        submitBtn.disabled = true; submitBtn.style.opacity = '0.5';
        return;
    }
    const exists = aafExisting.some(n => n.toLowerCase() === name.toLowerCase());
    if (exists) {
        errEl.innerHTML = `&#9432; La playlist "<b>${name.replace(/</g,'&lt;')}</b>" existe deja - les titres y seront ajoutes.`;
        errEl.style.color = 'var(--text-muted)';
        errEl.style.display = 'block';
        submitBtn.textContent = 'Ajouter dans la playlist existante';
    }
}

function aafClose() {
    const m = document.getElementById('addAllFlowModal');
    if (m) m.remove();
}

async function aafSubmit() {
    const mode = document.querySelector('input[name="aafDest"]:checked').value;
    let playlist = '';

    if (mode === 'existing') {
        playlist = document.getElementById('aafExistingSelect').value || '';
    } else if (mode === 'new') {
        const name = (document.getElementById('aafNewName').value || '').trim();
        if (!name) return;
        const matched = aafExisting.find(n => n.toLowerCase() === name.toLowerCase());
        if (matched) {
            playlist = matched;
        } else {
            try {
                const resp = await fetch('api/flow', {
                    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'action=create_playlist&name=' + encodeURIComponent(name)
                });
                const data = await resp.json();
                if (!data.success && !/existe/i.test(data.error || '')) {
                    alert('Erreur creation playlist : ' + (data.error || 'inconnue')); return;
                }
                playlist = name;
            } catch (e) { alert('Erreur creation playlist : ' + e.message); return; }
        }
    }

    const items = aafPendingItems.map(r => ({ ...r, playlist }));

    try {
        const resp = await fetch('api/flow', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=add_bulk&items=' + encodeURIComponent(JSON.stringify(items))
        });
        const data = await resp.json();
        aafClose();
        const dest = playlist ? `playlist "${playlist}"` : 'racine de Mon Flow';
        const parts = [];
        if (data.added) parts.push(`${data.added} ajoute${data.added > 1 ? 's' : ''}`);
        if (data.moved) parts.push(`${data.moved} deplace${data.moved > 1 ? 's' : ''}`);
        if (data.alreadyThere) parts.push(`${data.alreadyThere} deja la`);
        showToast(parts.length ? `${parts.join(' + ')} dans ${dest}` : `Aucun changement dans ${dest}`);
        if (typeof aafOnDone === 'function') aafOnDone(data);
        aafPendingItems = []; aafOnDone = null;
    } catch (e) { alert('Erreur : ' + e.message); }
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
    const ts = Date.now();
    sqLog.unshift({
        id: 'local_' + ts + '_' + Math.random().toString(36).slice(2, 8),
        type, title, detail,
        time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        read: false
    });
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

function sqSetLogTab(tab) {
    sqLogTab = tab === 'read' ? 'read' : 'unread';
    document.querySelectorAll('.sq-log-tab').forEach(el => {
        el.classList.toggle('active', el.dataset.tab === sqLogTab);
    });
    sqRenderLog();
}

function sqEscape(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
    ));
}

function sqRenderLog() {
    const body = document.getElementById('sqLogBody');
    const badge = document.getElementById('sqLogBadge');
    if (!body) return;

    const unread = sqLog.filter(e => !e.read);
    const read = sqLog.filter(e => e.read);

    const cU = document.getElementById('sqLogCountUnread');
    const cR = document.getElementById('sqLogCountRead');
    if (cU) cU.textContent = unread.length;
    if (cR) cR.textContent = read.length;

    if (badge) {
        badge.textContent = unread.length > 0 ? unread.length : '';
        badge.style.display = unread.length > 0 ? 'inline-flex' : 'none';
    }

    const list = sqLogTab === 'read' ? read : unread;
    if (list.length === 0) {
        body.innerHTML = '<div class="sq-empty">'
            + (sqLogTab === 'read' ? 'Aucun message lu.' : 'Aucun message non lu.')
            + '</div>';
        return;
    }

    const icons = { skip: '&#9197;', success: '&#10003;', error: '&#10007;' };
    const cls = { skip: 'skip', success: 'ok', error: 'err' };
    body.innerHTML = list.map(e => {
        const id = sqEscape(e.id || '');
        const actionBtn = e.read
            ? '<button class="sq-log-action" title="Marquer comme non lu" onclick="sqMarkUnread(\'' + id + '\')">&#8635;</button>'
            : '<button class="sq-log-action" title="Marquer comme lu" onclick="sqMarkRead(\'' + id + '\')">&#10003;</button>';
        const replyBtn = '<button class="sq-log-action sq-log-reply" title="Repondre a contact@bokonzi.com" onclick="sqReplyMail(\'' + id + '\')">&#9993; Repondre</button>';
        return '<div class="sq-log-item sq-log-' + (cls[e.type] || 'skip') + (e.read ? ' sq-log-read' : '') + '">'
            + '<span class="sq-log-icon">' + (icons[e.type] || '&#8226;') + '</span>'
            + '<div class="sq-log-content">'
            + '<div class="sq-log-title">' + sqEscape(e.title) + '</div>'
            + '<div class="sq-log-detail">' + sqEscape(e.detail) + (e.source === 'extension' ? ' (ext)' : '') + '</div>'
            + '</div>'
            + '<span class="sq-log-time">' + sqEscape(e.time) + '</span>'
            + '<div class="sq-log-actions">' + replyBtn + actionBtn + '</div>'
            + '</div>';
    }).join('');
}

const SQ_CONTACT_EMAIL = 'contact@bokonzi.com';

function sqReplyMail(id) {
    const item = sqLog.find(n => n.id === id);
    if (!item) return;
    const subject = 'Re: ' + (item.title || 'Notification');
    const body = 'Bonjour,\n\n\n\n---\nNotification d\'origine :\n'
        + 'Titre : ' + (item.title || '') + '\n'
        + 'Detail : ' + (item.detail || '') + '\n'
        + 'Heure : ' + (item.time || '') + '\n'
        + 'Type : ' + (item.type || '') + '\n';
    const href = 'mailto:' + SQ_CONTACT_EMAIL
        + '?subject=' + encodeURIComponent(subject)
        + '&body=' + encodeURIComponent(body);
    window.location.href = href;
}

function sqContactMail() {
    const href = 'mailto:' + SQ_CONTACT_EMAIL
        + '?subject=' + encodeURIComponent('Contact - YouTube Downloader')
        + '&body=' + encodeURIComponent('Bonjour,\n\n');
    window.location.href = href;
}

function sqMarkRead(id) {
    const item = sqLog.find(n => n.id === id);
    if (item) item.read = true;
    sqRenderLog();
    fetch('api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=markRead&id=' + encodeURIComponent(id)
    }).catch(() => {});
}

function sqMarkUnread(id) {
    const item = sqLog.find(n => n.id === id);
    if (item) item.read = false;
    sqRenderLog();
    fetch('api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=markUnread&id=' + encodeURIComponent(id)
    }).catch(() => {});
}

function sqMarkAllRead() {
    sqLog.forEach(n => { n.read = true; });
    sqRenderLog();
    fetch('api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'action=markAllRead'
    }).catch(() => {});
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
        sqLog = data.notifications.map((n, i) => ({
            id: n.id || ('legacy_' + (n.timestamp || i) + '_' + i),
            type: n.type, title: n.title, detail: n.detail,
            time: n.time, source: n.source, read: !!n.read
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
    playbackContext = 'history';

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

function getPrevStreamIdx(currentIdx) {
    const items = document.querySelectorAll('.history-item:not([style*="display: none"])');
    let prevIdx = -1;
    for (const item of items) {
        const idx = parseInt(item.dataset.idx);
        if (idx === currentIdx) return prevIdx;
        if (historyCache[idx] && historyCache[idx].url) prevIdx = idx;
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
    playbackContext = 'library';
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
let flowViewMode = ''; // '', 'top', 'recent', 'liked'
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

function flowParseDurationSec(s) {
    if (!s) return 0;
    const str = String(s).trim();
    const m = str.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
    if (m) return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2], 10) * 60) + parseInt(m[3], 10);
    const sec = parseInt(str, 10);
    return isNaN(sec) ? 0 : sec;
}

function flowFormatTotalDuration(tracks) {
    let total = 0, known = 0;
    tracks.forEach(t => {
        const s = flowParseDurationSec(t.duration);
        if (s > 0) { total += s; known++; }
    });
    if (!known) return '';
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    let txt = '';
    if (h > 0) txt = `${h}h ${m.toString().padStart(2, '0')}min`;
    else if (m > 0) txt = `${m}min ${s.toString().padStart(2, '0')}s`;
    else txt = `${s}s`;
    const missing = tracks.length - known;
    const note = missing > 0 ? `<span class="ftc-missing">${missing} sans duree</span>` : '';
    return `<span class="ftc-duration">&#9201; ~${txt}</span>${note}`;
}

function renderFlow() {
    const list = document.getElementById('flowList');
    const countEl = document.getElementById('flowTrackCount');
    const search = (document.getElementById('flowSearch').value || '').toLowerCase().trim();

    // Filtres playlists
    const plDiv = document.getElementById('flowPlaylists');
    const plNames = [...new Set(flowTracks.map(t => t.playlist).filter(Boolean))];
    const likedCountF = flowTracks.filter(t => t.liked).length;
    const playedCountF = flowTracks.filter(t => (t.playCount || 0) > 0).length;
    let plHtml = '<span class="flow-pl-chip' + (!flowCurrentPlaylist && !flowViewMode ? ' active' : '') + '" onclick="flowFilterPlaylist(\'\', this)" ondragover="event.preventDefault()" ondrop="flowDropOnPlaylist(event, \'\')">Tout (' + flowTracks.length + ')</span>';
    // Vues rapides
    if (playedCountF > 0) plHtml += '<span class="flow-pl-chip flow-pl-view' + (flowViewMode === 'top' ? ' active' : '') + '" onclick="flowSetViewMode(\'top\', this)" title="Top 20 les plus ecoutes">&#11088; Plus ecoutes</span>';
    if (flowTracks.length > 0) plHtml += '<span class="flow-pl-chip flow-pl-view' + (flowViewMode === 'recent' ? ' active' : '') + '" onclick="flowSetViewMode(\'recent\', this)" title="20 derniers ajouts">&#128336; Recemment ajoutes</span>';
    plHtml += '<span class="flow-pl-chip flow-pl-liked' + (flowViewMode === 'liked' ? ' active' : '') + '" onclick="flowSetViewMode(\'liked\', this)" title="Titres aim&eacute;s"><span class="chip-heart-big">&#10084;</span> Aim&eacute;s (' + likedCountF + ')</span>';
    const unassigned = flowTracks.filter(t => !t.playlist).length;
    if (plNames.length > 0 && unassigned > 0) {
        plHtml += '<span class="flow-pl-chip' + (flowCurrentPlaylist === '__none__' ? ' active' : '') + '" onclick="flowFilterPlaylist(\'__none__\', this)" ondragover="event.preventDefault(); this.classList.add(\'flow-pl-dragover\')" ondragleave="this.classList.remove(\'flow-pl-dragover\')" ondrop="this.classList.remove(\'flow-pl-dragover\'); flowDropOnPlaylist(event, \'\')">Sans playlist (' + unassigned + ')</span>';
    }
    // Inclure aussi les playlists vides
    const allPlNames = [...new Set([...plNames, ...flowPlaylists.map(p => p.name)])];
    for (const pl of allPlNames) {
        const c = flowTracks.filter(t => t.playlist === pl).length;
        const safePl = pl.replace(/'/g, "\\'");
        const meta = flowPlaylists.find(p => p.name === pl) || {};
        const styleParts = [];
        if (meta.color) styleParts.push('background:' + meta.color);
        if (meta.textColor) styleParts.push('color:' + meta.textColor);
        const styleAttr = styleParts.length ? ' style="' + styleParts.join(';') + '"' : '';
        plHtml += '<span class="flow-pl-chip' + (flowCurrentPlaylist === pl ? ' active' : '') + '"' + styleAttr + ' onclick="flowFilterPlaylist(\'' + safePl + '\', this)" ondragover="event.preventDefault(); this.classList.add(\'flow-pl-dragover\')" ondragleave="this.classList.remove(\'flow-pl-dragover\')" ondrop="this.classList.remove(\'flow-pl-dragover\'); flowDropOnPlaylist(event, \'' + safePl + '\')">'
            + pl + ' (' + c + ')'
            + '<span class="flow-pl-play" onclick="event.stopPropagation(); flowPlayAll(\'' + safePl + '\')" title="Tout lire">&#9654;</span>'
            + '<span class="flow-pl-color" onclick="event.stopPropagation(); flowOpenColorPicker(\'' + safePl + '\', this)" title="Couleur">&#127912;</span>'
            + '<span class="flow-pl-del" onclick="event.stopPropagation(); flowDeletePlaylist(\'' + safePl + '\')" title="Supprimer">&times;</span>'
            + '</span>';
    }
    plDiv.innerHTML = plHtml;

    // Filtrer
    let filtered = flowTracks.filter((t, i) => {
        const matchPl = flowViewMode || !flowCurrentPlaylist || (flowCurrentPlaylist === '__none__' ? !t.playlist : t.playlist === flowCurrentPlaylist);
        const matchSearch = !search || (t.title || '').toLowerCase().includes(search) || (t.channel || '').toLowerCase().includes(search);
        const matchView = !flowViewMode
            || (flowViewMode === 'liked' && t.liked)
            || (flowViewMode === 'top' && (t.playCount || 0) > 0)
            || flowViewMode === 'recent';
        return matchPl && matchSearch && matchView;
    });

    // Vues rapides : tri et limite
    if (flowViewMode === 'top') {
        filtered = [...filtered].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 20);
    } else if (flowViewMode === 'recent') {
        filtered = [...filtered].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')).slice(0, 20);
    }

    countEl.innerHTML = `<span class="ftc-count">${filtered.length} titre${filtered.length > 1 ? 's' : ''}</span>` + flowFormatTotalDuration(filtered);

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
            + '<button class="fl-like' + (t.liked ? ' liked' : '') + '" onclick="flowToggleLike(\'' + t.id + '\', this)" title="' + (t.liked ? 'Retirer des aim&eacute;s' : 'Aimer') + '">' + (t.liked ? '&#10084;' : '&#9825;') + '</button>'
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
    flowViewMode = '';
    document.querySelectorAll('.flow-pl-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
    renderFlow();
}

function flowSetViewMode(mode, el) {
    // Toggle si on reclique le meme chip
    flowViewMode = (flowViewMode === mode) ? '' : mode;
    flowCurrentPlaylist = '';
    document.querySelectorAll('.flow-pl-chip').forEach(c => c.classList.remove('active'));
    if (flowViewMode && el) el.classList.add('active');
    renderFlow();
}

function filterFlow() { renderFlow(); }

async function flowToggleLike(id, btn) {
    console.log('[LIKE FLOW] click id=', id);
    try {
        const resp = await fetch('api/flow', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'action=toggle_like&id=' + encodeURIComponent(id)
        });
        const data = await resp.json();
        console.log('[LIKE FLOW] response', resp.status, data);
        if (!data.success) { alert('Like refuse par le serveur : ' + (data.error || 'inconnu')); return; }
        const track = flowTracks.find(t => t.id === id);
        if (track) track.liked = data.liked;
        if (btn) {
            btn.innerHTML = data.liked ? '&#10084;' : '&#9825;';
            btn.classList.toggle('liked', !!data.liked);
            btn.title = data.liked ? 'Retirer des aimés' : 'Aimer';
        }
        // Rafraichir le chip (compteur) et la liste si on est en vue Aimes
        renderFlow();
    } catch (e) { console.error('[LIKE FLOW] erreur reseau', e); alert('Erreur reseau: ' + e.message); }
}

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
    playbackContext = 'flow';

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
        _streamRetryCount = 0;
        _streamRetrying = false;
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
    playbackContext = 'library';
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

const FLOW_COLOR_PRESETS_BG = [
    '', '#9C27B0', '#673AB7', '#3F51B5', '#2196F3', '#009688',
    '#4CAF50', '#FF9800', '#FF5722', '#E91E63', '#795548', '#607D8B'
];
const FLOW_COLOR_PRESETS_FG = [
    '', '#ffffff', '#000000', '#ffeb3b', '#cddc39', '#80deea', '#f8bbd0', '#bcaaa4'
];

function flowOpenColorPicker(playlistName, anchor) {
    const old = document.getElementById('flowColorPopover');
    if (old) old.remove();
    if (anchor && anchor.dataset.open === '1') { anchor.dataset.open = '0'; return; }

    const meta = flowPlaylists.find(p => p.name === playlistName) || {};
    const curBg = meta.color || '';
    const curFg = meta.textColor || '';

    const swatch = (color, current, kind) => {
        const sel = (color || '') === (current || '') ? ' selected' : '';
        const style = color ? `background:${color}` : 'background:repeating-linear-gradient(45deg,#666 0 4px,#888 4px 8px)';
        return `<button class="fcp-swatch${sel}" style="${style}" data-color="${color}" data-kind="${kind}" title="${color || 'Aucune'}"></button>`;
    };

    const pop = document.createElement('div');
    pop.id = 'flowColorPopover';
    pop.className = 'flow-color-popover';
    pop.innerHTML = `
        <div class="fcp-row">
            <div class="fcp-label">Fond</div>
            <div class="fcp-swatches">${FLOW_COLOR_PRESETS_BG.map(c => swatch(c, curBg, 'bg')).join('')}</div>
            <input type="color" class="fcp-custom" data-kind="bg" value="${curBg || '#9C27B0'}" title="Couleur personnalisee">
        </div>
        <div class="fcp-row">
            <div class="fcp-label">Texte</div>
            <div class="fcp-swatches">${FLOW_COLOR_PRESETS_FG.map(c => swatch(c, curFg, 'fg')).join('')}</div>
            <input type="color" class="fcp-custom" data-kind="fg" value="${curFg || '#ffffff'}" title="Couleur personnalisee">
        </div>
        <div class="fcp-preview-row">
            <span class="fcp-preview" id="fcpPreview" style="${curBg ? 'background:' + curBg + ';' : ''}${curFg ? 'color:' + curFg : ''}">${playlistName.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))}</span>
        </div>
        <div class="fcp-actions">
            <button class="fcp-btn-reset" onclick="flowApplyColor('${playlistName.replace(/'/g, "\\'")}', '', '')">Reinitialiser</button>
            <button class="fcp-btn-save" onclick="flowSaveColorFromPopover('${playlistName.replace(/'/g, "\\'")}')">Enregistrer</button>
            <button class="fcp-btn-cancel" onclick="document.getElementById('flowColorPopover').remove()">Annuler</button>
        </div>
    `;
    document.body.appendChild(pop);
    if (anchor) {
        const r = anchor.getBoundingClientRect();
        const popW = 320;
        let left = r.left + window.scrollX;
        if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
        pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
        pop.style.left = left + 'px';
        anchor.dataset.open = '1';
    }

    pop.querySelectorAll('.fcp-swatch').forEach(b => {
        b.addEventListener('click', () => {
            pop.querySelectorAll(`.fcp-swatch[data-kind="${b.dataset.kind}"]`).forEach(s => s.classList.remove('selected'));
            b.classList.add('selected');
            if (b.dataset.color) {
                const customInput = pop.querySelector(`.fcp-custom[data-kind="${b.dataset.kind}"]`);
                if (customInput) customInput.value = b.dataset.color;
            }
            flowUpdateColorPreview();
        });
    });
    pop.querySelectorAll('.fcp-custom').forEach(input => {
        input.addEventListener('input', () => {
            pop.querySelectorAll(`.fcp-swatch[data-kind="${input.dataset.kind}"]`).forEach(s => s.classList.remove('selected'));
            flowUpdateColorPreview();
        });
    });

    setTimeout(() => {
        document.addEventListener('click', flowColorPopoverDismiss, { once: true });
    }, 50);
}

function flowColorPopoverDismiss(e) {
    const pop = document.getElementById('flowColorPopover');
    if (!pop) return;
    if (pop.contains(e.target)) {
        document.addEventListener('click', flowColorPopoverDismiss, { once: true });
        return;
    }
    if (e.target.closest('.flow-pl-color')) return;
    pop.remove();
    document.querySelectorAll('.flow-pl-color[data-open="1"]').forEach(el => el.dataset.open = '0');
}

function flowUpdateColorPreview() {
    const pop = document.getElementById('flowColorPopover');
    if (!pop) return;
    const sel = (kind) => {
        const swatchSel = pop.querySelector(`.fcp-swatch[data-kind="${kind}"].selected`);
        if (swatchSel) return swatchSel.dataset.color;
        const custom = pop.querySelector(`.fcp-custom[data-kind="${kind}"]`);
        return custom ? custom.value : '';
    };
    const bg = sel('bg'), fg = sel('fg');
    const preview = pop.querySelector('#fcpPreview');
    if (preview) {
        preview.style.background = bg || '';
        preview.style.color = fg || '';
    }
}

function flowSaveColorFromPopover(playlistName) {
    const pop = document.getElementById('flowColorPopover');
    if (!pop) return;
    const sel = (kind) => {
        const swatchSel = pop.querySelector(`.fcp-swatch[data-kind="${kind}"].selected`);
        if (swatchSel) return swatchSel.dataset.color;
        const custom = pop.querySelector(`.fcp-custom[data-kind="${kind}"]`);
        return custom ? custom.value : '';
    };
    flowApplyColor(playlistName, sel('bg'), sel('fg'));
}

async function flowApplyColor(playlistName, bg, fg) {
    try {
        const body = new URLSearchParams({ action: 'set_playlist_color', name: playlistName, bg: bg || '', fg: fg || '' });
        const resp = await fetch('api/flow', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() });
        const data = await resp.json();
        if (!data.success) { alert('Erreur : ' + (data.error || 'inconnue')); return; }
        const pop = document.getElementById('flowColorPopover');
        if (pop) pop.remove();
        loadFlow();
    } catch (e) { alert('Erreur : ' + e.message); }
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
    const track = flowTracks.find(t => t.id === id);
    const title = track ? (track.title || '(sans titre)') : 'ce titre';
    confirmDialog({
        title: 'Retirer ce titre ?',
        message: `<div style="margin-bottom:8px;">Tu vas retirer :</div><div style="background:var(--bg-hover);padding:10px 14px;border-radius:8px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;">${title.replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]))}</div><div style="margin-top:12px;font-size:12px;color:var(--text-muted);">&#9432; Le titre est place dans la <b>corbeille</b> et reste recuperable pendant <b>24h</b>.</div>`,
        confirmText: 'Retirer',
        confirmStyle: 'danger',
        onConfirm: async () => {
            await fetch('api/flow', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=remove&id=' + id });
            showToast('Titre place dans la corbeille (24h pour le restaurer)');
            loadFlow();
        }
    });
}

function confirmDialog(opts) {
    const old = document.getElementById('confirmDialog');
    if (old) old.remove();
    const cfg = Object.assign({
        title: 'Confirmation',
        message: '',
        confirmText: 'Confirmer',
        cancelText: 'Annuler',
        confirmStyle: 'primary',
        onConfirm: () => {},
        onCancel: () => {}
    }, opts || {});

    const confirmBg = cfg.confirmStyle === 'danger' ? 'var(--error,#f44336)' : 'var(--primary)';
    const div = document.createElement('div');
    div.id = 'confirmDialog';
    div.className = 'modal-overlay active';
    div.innerHTML = `
        <div class="modal confirm-modal">
            <h3 style="margin-top:0;margin-bottom:12px;font-size:17px;">${cfg.title}</h3>
            <div style="font-size:13px;color:var(--text);margin-bottom:18px;">${cfg.message}</div>
            <div class="modal-btns">
                <button class="btn-cancel" id="cdlgCancel">${cfg.cancelText}</button>
                <button id="cdlgConfirm" style="background:${confirmBg};color:#fff;border:none;border-radius:20px;font-weight:600;">${cfg.confirmText}</button>
            </div>
        </div>
    `;
    document.body.appendChild(div);
    const close = () => { div.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => {
        if (e.key === 'Escape') { cfg.onCancel(); close(); }
        else if (e.key === 'Enter') { cfg.onConfirm(); close(); }
    };
    div.querySelector('#cdlgCancel').onclick = () => { cfg.onCancel(); close(); };
    div.querySelector('#cdlgConfirm').onclick = () => { cfg.onConfirm(); close(); };
    div.onclick = (e) => { if (e.target === div) { cfg.onCancel(); close(); } };
    document.addEventListener('keydown', onKey);
    setTimeout(() => div.querySelector('#cdlgConfirm').focus(), 30);
}

async function flowOpenTrash() {
    let modal = document.getElementById('flowTrashModal');
    if (modal) modal.remove();

    let items = [];
    try {
        const resp = await fetch('api/flow?action=trash_list');
        const data = await resp.json();
        if (data.success) items = data.items || [];
    } catch (e) { alert('Erreur : ' + e.message); return; }

    const fmtRemaining = (ms) => {
        if (ms <= 0) return 'expire';
        const totalSec = Math.floor(ms / 1000);
        const h = Math.floor(totalSec / 3600);
        const m = Math.floor((totalSec % 3600) / 60);
        const s = totalSec % 60;
        const pad = (n) => String(n).padStart(2, '0');
        if (h > 0) return `${h}h ${pad(m)}min ${pad(s)}s`;
        if (m > 0) return `${m}min ${pad(s)}s`;
        return `${s}s`;
    };
    const esc = (s) => String(s).replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c]));

    const rows = items.length ? items.map(it => {
        const exp = fmtRemaining(it.remainingMs);
        const cls = it.remainingMs < 3600000 ? ' trash-row-warn' : '';
        return `<div class="trash-row${cls}">
            <div class="trash-info">
                <div class="trash-title" title="${esc(it.title || '')}">${esc(it.title || '(sans titre)')}</div>
                <div class="trash-meta">${esc(it.channel || '')} ${it.playlist ? '&middot; <em>' + esc(it.playlist) + '</em>' : ''} &middot; supprime le ${esc(it.deletedAt || '')}</div>
                <div class="trash-countdown">&#9201; ${exp} restant avant suppression definitive</div>
            </div>
            <div class="trash-actions">
                <button onclick="flowTrashRestore('${it.id}')" class="trash-btn trash-btn-restore" title="Restaurer">&#8634; Restaurer</button>
                <button onclick="flowTrashDelete('${it.id}')" class="trash-btn trash-btn-delete" title="Supprimer definitivement">&#128465;</button>
            </div>
        </div>`;
    }).join('') : '<div style="text-align:center;padding:30px;color:var(--text-muted);">La corbeille est vide.</div>';

    const html = `
        <div class="modal-overlay active" id="flowTrashModal">
            <div class="modal" style="width:560px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <h3 style="margin:0;">Corbeille de Mon Flow</h3>
                    <button class="btn-cancel" onclick="document.getElementById('flowTrashModal').remove()" style="padding:6px 14px;font-size:13px;">Fermer</button>
                </div>
                <p style="color:var(--text-muted);font-size:12px;margin-bottom:14px;">Les titres retires sont conserves <b>24h</b> avant suppression definitive. Tu peux les restaurer ou les supprimer manuellement.</p>
                <div style="flex:1;overflow-y:auto;margin-bottom:12px;">${rows}</div>
                ${items.length ? '<button class="btn-cancel" onclick="flowTrashClear()" style="background:var(--error,#f44336);color:#fff;border-color:var(--error,#f44336);">Vider la corbeille</button>' : ''}
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

async function flowTrashRestore(id) {
    await fetch('api/flow', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=trash_restore&id=' + id });
    showToast('Titre restaure');
    document.getElementById('flowTrashModal')?.remove();
    loadFlow();
}

function flowTrashDelete(id) {
    confirmDialog({
        title: 'Supprimer definitivement ?',
        message: 'Ce titre sera retire de la corbeille et <b>ne pourra plus etre restaure</b>.',
        confirmText: 'Supprimer',
        confirmStyle: 'danger',
        onConfirm: async () => {
            await fetch('api/flow', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=trash_delete&id=' + id });
            flowOpenTrash();
        }
    });
}

function flowTrashClear() {
    confirmDialog({
        title: 'Vider la corbeille ?',
        message: 'Tous les titres de la corbeille seront <b>supprimes definitivement</b>. Cette action est irreversible.',
        confirmText: 'Vider la corbeille',
        confirmStyle: 'danger',
        onConfirm: async () => {
            await fetch('api/flow', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'action=trash_clear' });
            showToast('Corbeille videe');
            document.getElementById('flowTrashModal')?.remove();
        }
    });
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
