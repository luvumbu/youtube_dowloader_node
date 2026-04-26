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

// Notif desktop quand un nouveau titre demarre dans Mon Flow
let _lastFlowNotif = null;
function notifyFlowTrack(track) {
    if (!track) return;
    if (localStorage.getItem('yt_flow_notif_on') !== '1') return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    // Eviter les doublons (cas de spam de play() rapide)
    if (_lastFlowNotif && _lastFlowNotif.id === track.id && (Date.now() - _lastFlowNotif.ts) < 1500) return;
    // Pas de notif si la fenetre est focus (l'utilisateur voit deja le player)
    if (document.hasFocus && document.hasFocus()) return;
    _lastFlowNotif = { id: track.id, ts: Date.now() };
    let icon = track.thumbnail || '';
    if (!icon && track.url) {
        const m = track.url.match(/[?&]v=([^&]+)/);
        if (m) icon = 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg';
    }
    try {
        const n = new Notification(track.title || 'Lecture en cours', {
            body: (track.channel || '') + (track.duration ? '  -  ' + track.duration : ''),
            icon: icon || 'youtube.ico',
            tag: 'yt-flow-track',
            silent: true
        });
        setTimeout(() => { try { n.close(); } catch (e) {} }, 6000);
        n.onclick = () => { try { window.focus(); n.close(); } catch (e) {} };
    } catch (e) {}
}

// ===== DESCRIPTION YOUTUBE (chapitres / tracklist / texte / infos) =====
let _descCurrentUrl = null;
let _descData = null;
let _descTab = 'chapters';

function isDescPanelOpen() {
    const p = document.getElementById('descPanel');
    return p && p.style.display !== 'none';
}

function toggleDescriptionPanel() {
    const p = document.getElementById('descPanel');
    const btn = document.getElementById('btnPlayerDesc');
    if (!p) return;
    if (p.style.display === 'none') {
        // Fermer les autres panneaux du player bar
        const lp = document.getElementById('lyricsPanel');
        if (lp && lp.style.display !== 'none') {
            lp.style.display = 'none';
            const lpBtn = document.getElementById('btnPlayerLyrics');
            if (lpBtn) lpBtn.classList.remove('active');
        }
        const queue = document.getElementById('playerQueue');
        if (queue && queue.style.display !== 'none') {
            queue.style.display = 'none';
            const qbtn = document.querySelector('.player-queue-btn:not(#btnPlayerLyrics):not(#btnPlayerDesc)');
            if (qbtn) qbtn.classList.remove('active');
        }
        p.style.display = 'flex';
        if (btn) btn.classList.add('active');
        loadDescriptionForCurrent();
    } else {
        p.style.display = 'none';
        if (btn) btn.classList.remove('active');
    }
}

function getCurrentTrackForDesc() {
    if (typeof getCurrentTrackForLyrics === 'function') return getCurrentTrackForLyrics();
    return null;
}

async function loadDescriptionForCurrent() {
    const t = getCurrentTrackForDesc();
    const body = document.getElementById('dpBody');
    const titleEl = document.getElementById('dpTitle');
    if (!body) return;
    if (!t || !t.url) {
        body.innerHTML = '<div class="dp-empty">Aucun titre en cours</div>';
        if (titleEl) titleEl.textContent = 'Description';
        _descData = null; _descCurrentUrl = null;
        return;
    }
    if (titleEl) titleEl.textContent = t.title || 'Description';
    if (_descCurrentUrl === t.url && _descData) {
        renderDescPanel();
        return;
    }
    // Reset transcript car URL change
    _descTranscript = null;
    _descTranscriptLoaded = false;
    _descTranscriptUrl = null;
    body.innerHTML = '<div class="dp-loading"><div class="dp-spinner"></div><div>Recuperation de la description...</div></div>';
    try {
        const data = await apiCall('api/description?url=' + encodeURIComponent(t.url));
        if (!data || !data.success) {
            body.innerHTML = '<div class="dp-empty">Impossible de recuperer la description : ' + escapeHtml((data && data.error) || 'erreur') + '</div>';
            return;
        }
        _descCurrentUrl = t.url;
        _descData = data;
        // Auto-bascule vers l'onglet le plus utile disponible
        const hasChapters = Array.isArray(data.chapters) && data.chapters.length > 0;
        const tracklistFound = extractTracklist(data.description || '').length >= 2;
        if (!hasChapters) {
            if (tracklistFound) {
                dpSetTab('tracklist');
                return;
            } else {
                // Pas de chapitres ni tracklist : aller direct sur Transcription
                dpSetTab('transcript');
                return;
            }
        }
        renderDescPanel();
    } catch (e) {
        body.innerHTML = '<div class="dp-empty">Erreur reseau : ' + escapeHtml(e.message || '') + '</div>';
    }
}

function dpSetTab(tab) {
    _descTab = tab;
    document.querySelectorAll('.dp-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    if (tab === 'transcript' && !_descTranscriptLoaded) {
        loadDescTranscript();
        return; // renderDescPanel sera appele apres
    }
    renderDescPanel();
}

let _descTranscript = null; // { lang, lines: [{ts, text}] }
let _descTranscriptLoaded = false;
let _descTranscriptUrl = null;

async function loadDescTranscript() {
    const t = getCurrentTrackForDesc();
    const body = document.getElementById('dpBody');
    if (!body || !t || !t.url) return;
    if (_descTranscriptUrl === t.url && _descTranscript) {
        _descTranscriptLoaded = true;
        renderDescPanel();
        return;
    }
    body.innerHTML = '<div class="dp-loading"><div class="dp-spinner"></div><div>Recuperation des sous-titres YouTube (peut prendre 5-10s)...</div></div>';
    try {
        const data = await apiCall('api/description/transcript?url=' + encodeURIComponent(t.url));
        if (!data || !data.success) {
            _descTranscript = null;
            _descTranscriptLoaded = true;
            _descTranscriptUrl = t.url;
            renderDescPanel();
            return;
        }
        _descTranscript = { lang: data.lang || '', lines: data.lines || [] };
        _descTranscriptUrl = t.url;
        _descTranscriptLoaded = true;
        renderDescPanel();
    } catch (e) {
        _descTranscript = null;
        _descTranscriptLoaded = true;
        renderDescPanel();
    }
}

// Detecte les timecodes dans une chaine : 00:00, 0:00, 0:00:00, 00:00:00
function parseTimecode(str) {
    const m = String(str).trim().match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = parseInt(m[1] || '0', 10);
    const mi = parseInt(m[2], 10);
    const s = parseInt(m[3], 10);
    return h * 3600 + mi * 60 + s;
}

// Normalise une chaine pour comparaison (lower + sans ponctuation + espaces uniques)
function _dpNorm(s) {
    return (s || '').toString().toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

// Extrait toutes les lignes "TIMECODE Texte" d'un texte
function extractTracklist(text) {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    const items = [];
    const re = /^[\s​\-\*\.]*((?:\d{1,2}:)?\d{1,2}:\d{2})[\s\.\-\)\]>:]*(.*)$/;
    for (const line of lines) {
        const m = line.match(re);
        if (!m) continue;
        const ts = parseTimecode(m[1]);
        const txt = (m[2] || '').trim();
        if (ts === null) continue;
        if (!txt) continue;
        items.push({ ts, label: txt });
    }
    // Dedup : meme label normalise OU meme timestamp -> on garde une seule occurrence (la 1ere)
    const seenLabel = new Set();
    const seenTs = new Set();
    const dedup = [];
    for (const it of items) {
        const n = _dpNorm(it.label);
        if (!n) continue;
        if (seenLabel.has(n)) continue;
        if (seenTs.has(it.ts)) continue;
        seenLabel.add(n); seenTs.add(it.ts);
        dedup.push(it);
    }
    // Filtrer : il faut au moins 2 entrees pour considerer comme tracklist
    if (dedup.length < 2) return [];
    return dedup;
}

// Dedup des chapitres YouTube (rare mais possible)
function dedupChapters(chapters) {
    if (!Array.isArray(chapters) || !chapters.length) return [];
    const seenTitle = new Set();
    const seenStart = new Set();
    const out = [];
    for (const c of chapters) {
        const start = c.start_time || 0;
        const norm = _dpNorm(c.title || '');
        // Meme timestamp = doublon strict
        if (seenStart.has(start)) continue;
        // Meme titre consecutif = doublon (sinon on garde, ex: "Chorus" peut revenir)
        const last = out[out.length - 1];
        if (last && _dpNorm(last.title || '') === norm && norm) continue;
        seenStart.add(start); seenTitle.add(norm);
        out.push(c);
    }
    return out;
}

// Dedup des lignes consecutives identiques dans un texte
function dedupTextLines(txt) {
    if (!txt) return '';
    const lines = txt.split(/\r?\n/);
    const out = [];
    let prevNorm = null;
    for (const l of lines) {
        const n = _dpNorm(l);
        // Garde les lignes vides telles quelles (separation visuelle)
        if (!n) { out.push(l); prevNorm = null; continue; }
        if (n === prevNorm) continue; // doublon consecutif
        out.push(l);
        prevNorm = n;
    }
    return out.join('\n');
}

function dpSeekTo(seconds) {
    const a = (typeof getActiveAudio === 'function') ? getActiveAudio() : null;
    if (a && a.duration && isFinite(a.duration)) {
        if (typeof cancelCrossfade === 'function' && typeof isCrossfading === 'function' && isCrossfading()) {
            cancelCrossfade('commit');
        }
        a.currentTime = Math.max(0, Math.min(a.duration, seconds));
    }
}

function _dpClipboardWrite(text, okMsg) {
    if (!text || !text.trim()) { showToast('Rien a copier'); return; }
    const done = () => showToast(okMsg);
    const fail = () => showToast('Erreur lors de la copie');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(fail);
    } else {
        const ta = document.createElement('textarea');
        ta.value = text; document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { fail(); }
        document.body.removeChild(ta);
    }
}

function dpCopyTab(kind) {
    if (!_descData) return;
    const d = _descData;
    let text = '', okMsg = 'Copie';
    if (kind === 'chapters') {
        const chapters = dedupChapters(d.chapters);
        if (!chapters.length) { showToast('Aucun chapitre a copier'); return; }
        text = chapters.map((c, i) => '#' + (i + 1) + '  ' + fmtSec(c.start_time || 0) + '  ' + (c.title || '(sans titre)')).join('\n');
        okMsg = chapters.length + ' chapitres copies';
    } else if (kind === 'tracklist') {
        const items = extractTracklist(d.description || '');
        if (!items.length) { showToast('Pas de tracklist a copier'); return; }
        text = items.map((it, i) => (i + 1) + '. ' + fmtSec(it.ts) + ' - ' + it.label).join('\n');
        okMsg = items.length + ' titres copies';
    } else if (kind === 'transcript') {
        if (!_descTranscript || !_descTranscript.lines || !_descTranscript.lines.length) { showToast('Pas de transcription a copier'); return; }
        text = _descTranscript.lines.map(l => '[' + fmtSec(l.ts) + '] ' + l.text).join('\n');
        okMsg = _descTranscript.lines.length + ' segments copies';
    } else if (kind === 'transcript-plain') {
        if (!_descTranscript || !_descTranscript.lines || !_descTranscript.lines.length) { showToast('Pas de transcription a copier'); return; }
        text = _descTranscript.lines.map(l => l.text).join(' ').replace(/\s+/g, ' ').trim();
        okMsg = 'Transcription copiee (texte brut)';
    } else if (kind === 'text') {
        text = dedupTextLines(d.description || '').trim();
        if (!text) { showToast('Description vide'); return; }
        okMsg = 'Description copiee';
    } else if (kind === 'info') {
        const fmtDate = (s) => s && s.length === 8 ? s.slice(6, 8) + '/' + s.slice(4, 6) + '/' + s.slice(0, 4) : (s || '');
        const lines = [];
        lines.push('Titre : ' + (d.title || ''));
        lines.push('Chaine : ' + (d.channel || ''));
        lines.push('Duree : ' + fmtSec(d.duration));
        if (d.view_count) lines.push('Vues : ' + d.view_count);
        if (d.like_count) lines.push("J'aime : " + d.like_count);
        if (d.upload_date) lines.push('Publiee le : ' + fmtDate(d.upload_date));
        if (d.categories && d.categories.length) lines.push('Categorie : ' + d.categories.join(', '));
        if (d.tags && d.tags.length) lines.push('Tags : ' + d.tags.join(', '));
        text = lines.join('\n');
        okMsg = 'Infos copiees';
    }
    _dpClipboardWrite(text, okMsg);
}

// Compat
function dpCopyTracklist() { dpCopyTab('tracklist'); }

function fmtSec(s) {
    s = Math.max(0, Math.floor(s || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
    return m + ':' + String(r).padStart(2, '0');
}

// Linkifie URLs dans un texte
function linkify(text) {
    return escapeHtml(text).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function renderDescPanel() {
    const body = document.getElementById('dpBody');
    if (!body || !_descData) return;
    const d = _descData;

    if (_descTab === 'chapters') {
        const chapters = dedupChapters(d.chapters);
        if (chapters.length) {
            body.innerHTML = '<div class="dp-section">'
                + '<div class="dp-hint dp-hint-row">'
                + '<span>Chapitres detectes par YouTube (' + chapters.length + '). Clic = aller a ce moment.</span>'
                + '<button class="dp-copy-btn" onclick="dpCopyTab(\'chapters\')" title="Copier tous les chapitres">📋 Copier</button>'
                + '</div>'
                + chapters.map((c, i) => {
                    const start = c.start_time || 0;
                    const end = c.end_time || 0;
                    const dur = (end > start) ? ' · ' + fmtSec(end - start) : '';
                    return '<div class="dp-chapter" onclick="dpSeekTo(' + start + ')">'
                        + '<span class="dp-chap-time">' + fmtSec(start) + '</span>'
                        + '<span class="dp-chap-num">#' + (i + 1) + '</span>'
                        + '<span class="dp-chap-title">' + escapeHtml(c.title || '(sans titre)') + '</span>'
                        + (dur ? '<span class="dp-chap-dur">' + dur.replace(' · ', '') + '</span>' : '')
                        + '</div>';
                }).join('') + '</div>';
        } else {
            body.innerHTML = '<div class="dp-empty" style="text-align:center;">'
                + '<div style="font-size:24px;opacity:0.5;margin-bottom:6px;">📑</div>'
                + 'Le createur de la video n\'a pas pose de chapitres.'
                + '<div style="font-size:11px;color:var(--text-muted);margin-top:10px;">Bascule sur l\'onglet <strong>🗨 Transcription</strong> pour avoir le contenu parle de la video (auto-sous-titres YouTube).</div>'
                + '<button onclick="dpSetTab(\'transcript\')" style="margin-top:12px;background:var(--primary);color:#fff;border:none;padding:8px 18px;border-radius:8px;cursor:pointer;font-size:12px;font-weight:600;">🗨 Voir la Transcription</button>'
                + '</div>';
        }
        return;
    }

    if (_descTab === 'tracklist') {
        const items = extractTracklist(d.description || '');
        if (items.length) {
            body.innerHTML = '<div class="dp-section dp-section--tracklist">'
                + '<div class="dp-hint dp-hint-row">'
                + '<span>Tracklist detectee (' + items.length + ' titres). Clic = aller a ce moment.</span>'
                + '<button class="dp-copy-btn" onclick="dpCopyTracklist()" title="Copier toute la tracklist">📋 Copier</button>'
                + '</div>'
                + items.map((it, i) => {
                    return '<div class="dp-track" onclick="dpSeekTo(' + it.ts + ')">'
                        + '<span class="dp-track-num">' + (i + 1) + '</span>'
                        + '<span class="dp-track-main">'
                        + '<span class="dp-track-title">' + escapeHtml(it.label) + '</span>'
                        + '<span class="dp-track-time">' + fmtSec(it.ts) + '</span>'
                        + '</span>'
                        + '</div>';
                }).join('') + '</div>';
        } else {
            body.innerHTML = '<div class="dp-empty">Pas de tracklist detectee dans la description.<br><span style="font-size:11px;color:var(--text-muted);">Pas de lignes de la forme <code>00:00 Titre</code> trouvees.</span></div>';
        }
        return;
    }

    if (_descTab === 'transcript') {
        if (!_descTranscriptLoaded) {
            loadDescTranscript();
            return;
        }
        if (!_descTranscript || !_descTranscript.lines || !_descTranscript.lines.length) {
            body.innerHTML = '<div class="dp-empty">Pas de sous-titres disponibles pour cette video.<br><span style="font-size:11px;color:var(--text-muted);">YouTube ne fournit pas toujours de transcription auto (ex: musique sans paroles, bruit ambiant uniquement).</span></div>';
            return;
        }
        const lines = _descTranscript.lines;
        const langLabel = _descTranscript.lang ? ' (' + _descTranscript.lang + ')' : '';
        body.innerHTML = '<div class="dp-section">'
            + '<div class="dp-hint dp-hint-row">'
            + '<span>Transcription auto YouTube' + langLabel + ' - ' + lines.length + ' segments.</span>'
            + '<span class="dp-copy-group">'
            + '<button class="dp-copy-btn" onclick="dpCopyTab(\'transcript\')" title="Copier avec timecodes">📋 +TC</button>'
            + '<button class="dp-copy-btn" onclick="dpCopyTab(\'transcript-plain\')" title="Copier en texte brut (sans timecodes)">📋 Texte</button>'
            + '</span>'
            + '</div>'
            + lines.map(l =>
                '<div class="dp-tr-line">'
                + '<span class="dp-tc" onclick="dpSeekTo(' + l.ts + ')">' + fmtSec(l.ts) + '</span>'
                + '<span class="dp-tr-text">' + escapeHtml(l.text) + '</span>'
                + '</div>'
            ).join('') + '</div>';
        return;
    }

    if (_descTab === 'text') {
        const txt = dedupTextLines(d.description || '');
        if (!txt.trim()) {
            body.innerHTML = '<div class="dp-empty">Aucune description pour cette video.</div>';
            return;
        }
        // Cliquables : timecodes en debut de ligne + URLs
        const html = txt.split(/\r?\n/).map(line => {
            const m = line.match(/^([\s​\-\*\.]*)((?:\d{1,2}:)?\d{1,2}:\d{2})([\s\.\-\)\]>:]*)(.*)$/);
            if (m) {
                const ts = parseTimecode(m[2]);
                if (ts !== null) {
                    return escapeHtml(m[1])
                        + '<a class="dp-tc" onclick="dpSeekTo(' + ts + ')">' + escapeHtml(m[2]) + '</a>'
                        + escapeHtml(m[3]) + linkify(m[4] || '');
                }
            }
            return linkify(line);
        }).join('<br>');
        body.innerHTML = '<div class="dp-section">'
            + '<div class="dp-hint dp-hint-row">'
            + '<span>Description complete (' + txt.length + ' caracteres).</span>'
            + '<button class="dp-copy-btn" onclick="dpCopyTab(\'text\')" title="Copier la description complete">📋 Copier</button>'
            + '</div>'
            + '<div class="dp-text-content">' + html + '</div>'
            + '</div>';
        return;
    }

    if (_descTab === 'info') {
        const fmtDate = (s) => s && s.length === 8 ? s.slice(6, 8) + '/' + s.slice(4, 6) + '/' + s.slice(0, 4) : (s || '');
        const fmtNum = (n) => (n || 0).toLocaleString('fr-FR');
        body.innerHTML = '<div class="dp-section">'
            + '<div class="dp-hint dp-hint-row">'
            + '<span>Metadonnees de la video.</span>'
            + '<button class="dp-copy-btn" onclick="dpCopyTab(\'info\')" title="Copier toutes les infos">📋 Copier</button>'
            + '</div>'
            + '<div class="dp-info">'
            + '<div class="dp-info-row"><span>Titre</span><strong>' + escapeHtml(d.title) + '</strong></div>'
            + '<div class="dp-info-row"><span>Chaine</span><strong>' + escapeHtml(d.channel) + '</strong></div>'
            + '<div class="dp-info-row"><span>Duree</span><strong>' + fmtSec(d.duration) + '</strong></div>'
            + '<div class="dp-info-row"><span>Vues</span><strong>' + fmtNum(d.view_count) + '</strong></div>'
            + (d.like_count ? '<div class="dp-info-row"><span>J\'aime</span><strong>' + fmtNum(d.like_count) + '</strong></div>' : '')
            + (d.upload_date ? '<div class="dp-info-row"><span>Publiee le</span><strong>' + fmtDate(d.upload_date) + '</strong></div>' : '')
            + (d.categories && d.categories.length ? '<div class="dp-info-row"><span>Categorie</span><strong>' + escapeHtml(d.categories.join(', ')) + '</strong></div>' : '')
            + (d.tags && d.tags.length ? '<div class="dp-info-row dp-info-tags"><span>Tags</span><div class="dp-tags">' + d.tags.map(t => '<span class="dp-tag">' + escapeHtml(t) + '</span>').join('') + '</div></div>' : '')
            + '</div>'
            + '</div>';
    }
}

// ===== LYRICS (lrclib.net) =====
const LYRICS_CACHE_KEY = 'yt_lyrics_cache_v1';
const LYRICS_CACHE_MAX = 60;
let _lyricsState = null; // { url, plain, synced: [{ts, text}], current: idx }
let _lyricsTickerEl = null;

function getLyricsCache() {
    try { return JSON.parse(localStorage.getItem(LYRICS_CACHE_KEY) || '{}'); }
    catch (e) { return {}; }
}
function setLyricsCache(map) {
    const keys = Object.keys(map);
    if (keys.length > LYRICS_CACHE_MAX) {
        // virer les plus anciens
        const sorted = keys.sort((a, b) => (map[a]._ts || 0) - (map[b]._ts || 0));
        sorted.slice(0, keys.length - LYRICS_CACHE_MAX).forEach(k => { delete map[k]; });
    }
    try { localStorage.setItem(LYRICS_CACHE_KEY, JSON.stringify(map)); } catch (e) {}
}

function setLyricsAutoOpen(on) {
    if (on) localStorage.setItem('yt_lyrics_auto', '1');
    else localStorage.removeItem('yt_lyrics_auto');
}

function isLyricsPanelOpen() {
    const p = document.getElementById('lyricsPanel');
    return p && p.style.display !== 'none';
}

function toggleLyricsPanel() {
    const p = document.getElementById('lyricsPanel');
    const btn = document.getElementById('btnPlayerLyrics');
    if (!p) return;
    if (p.style.display === 'none') {
        // Fermer la file de lecture si elle est ouverte
        const queue = document.getElementById('playerQueue');
        if (queue && queue.style.display !== 'none') {
            queue.style.display = 'none';
            const qbtn = document.querySelector('.player-queue-btn:not(#btnPlayerLyrics)');
            if (qbtn) qbtn.classList.remove('active');
        }
        p.style.display = 'flex';
        if (btn) btn.classList.add('active');
        const fc = document.getElementById('lpFollowToggle');
        if (fc) fc.checked = getLyricsAutoFollow();
        const cm = document.getElementById('lpClickMode');
        if (cm) cm.value = getLyricsClickMode();
        loadLyricsForCurrent();
    } else {
        p.style.display = 'none';
        if (btn) btn.classList.remove('active');
    }
}

function getCurrentTrackForLyrics() {
    if (playbackContext === 'flow' && flowCurrentIdx >= 0 && flowTracks[flowCurrentIdx]) {
        const t = flowTracks[flowCurrentIdx];
        return { title: t.title, channel: t.channel, url: t.url, duration: t.duration };
    }
    if (playbackContext === 'library' && typeof playlist !== 'undefined' && playlist[playIndex]) {
        const it = getItemById(playlist[playIndex]);
        if (it) return { title: it.title, channel: it.channel, url: it.url, duration: it.duration };
    }
    if (playbackContext === 'search' && typeof lastSearchResults !== 'undefined' && typeof searchPlayIdx !== 'undefined' && lastSearchResults[searchPlayIdx]) {
        const r = lastSearchResults[searchPlayIdx];
        return { title: r.title, channel: r.channel, url: r.url, duration: r.duration };
    }
    return null;
}

// Nettoie un titre YouTube : enleve [Official Video], (HD), feat. ..., etc.
function cleanTitlePart(rawTitle) {
    let t = (rawTitle || '').trim();
    t = t.replace(/\s*[\[\(](?:official\s*)?(?:music\s*)?(?:lyric[s]?\s*)?(?:video|audio|hd|hq|4k|mv|m\/v|clip|live|remix|edit|version|extended|visualizer|performance|stream)\b[^\]\)]*[\]\)]/gi, '');
    t = t.replace(/\s*[\[\(]\s*(?:official|lyrics?|audio|video|hd|hq|4k)\s*[\]\)]/gi, '');
    t = t.replace(/\s*\(?\s*feat\.?\s+[^)\]]+\)?\]?/gi, '');
    t = t.replace(/\s*\(?\s*ft\.?\s+[^)\]]+\)?\]?/gi, '');
    t = t.replace(/\s*\(?\s*prod\.?\s+by\s+[^)\]]+\)?\]?/gi, '');
    return t.replace(/\s+/g, ' ').trim();
}

function cleanArtistPart(rawChannel) {
    let a = (rawChannel || '').trim();
    a = a.replace(/\s*-?\s*topic\s*$/i, '').replace(/\s*vevo\s*$/i, '').replace(/\s*-?\s*official\s*$/i, '').trim();
    return a;
}

// Genere plusieurs combinaisons artiste/titre a essayer en cascade
function buildLyricsCandidates(rawTitle, rawChannel) {
    const candidates = [];
    const cleanT = cleanTitlePart(rawTitle);
    const cleanA = cleanArtistPart(rawChannel);

    // Cas 1 : "Artist - Title" dans le titre
    const dashIdx = cleanT.indexOf(' - ');
    if (dashIdx > 0) {
        const left = cleanT.substring(0, dashIdx).trim();
        const right = cleanT.substring(dashIdx + 3).trim();
        // a) gauche = artiste, droite = titre
        candidates.push({ artist: left, title: right });
        // b) si la gauche correspond au canal -> idem mais aussi sans le prefixe
        if (cleanA && left.toLowerCase().includes(cleanA.toLowerCase())) {
            candidates.push({ artist: cleanA, title: right });
        }
    }

    // Cas 2 : canal nettoye + titre brut nettoye (avec eventuellement le prefixe enleve)
    if (cleanA) {
        let titleNoPrefix = cleanT;
        if (cleanT.toLowerCase().startsWith(cleanA.toLowerCase() + ' - ')) {
            titleNoPrefix = cleanT.substring(cleanA.length + 3).trim();
        }
        candidates.push({ artist: cleanA, title: titleNoPrefix });
        if (titleNoPrefix !== cleanT) {
            candidates.push({ artist: cleanA, title: cleanT });
        }
    } else {
        candidates.push({ artist: '', title: cleanT });
    }

    // Deduplication
    const seen = new Set();
    return candidates.filter(c => {
        const k = (c.artist + '|' + c.title).toLowerCase();
        if (!c.title || seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

// Pour compat (toujours utilise dans la cle de cache)
function cleanLyricsQuery(rawTitle, rawChannel) {
    const cands = buildLyricsCandidates(rawTitle, rawChannel);
    return cands[0] || { artist: '', title: cleanTitlePart(rawTitle) };
}

function parseSyncedLyrics(syncedText) {
    if (!syncedText) return null;
    const lines = syncedText.split(/\r?\n/);
    const out = [];
    const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
    for (const line of lines) {
        const stamps = [];
        let m;
        re.lastIndex = 0;
        while ((m = re.exec(line)) !== null) {
            const min = parseInt(m[1], 10);
            const sec = parseFloat(m[2]);
            stamps.push(min * 60 + sec);
        }
        if (!stamps.length) continue;
        const text = line.replace(/\[\d+:\d+(?:\.\d+)?\]/g, '').trim();
        for (const ts of stamps) out.push({ ts, text });
    }
    out.sort((a, b) => a.ts - b.ts);
    return out.length ? out : null;
}

// ===== Versions de paroles (onglets internes) =====
const LYRICS_VERSIONS_MAX = 5;
let _lyricsVersions = []; // [{artist, title, plain, synced, source}]
let _lyricsVersionIdx = -1;

function resetLyricsVersions() {
    _lyricsVersions = [];
    _lyricsVersionIdx = -1;
    renderLyricsVersionsBar();
}

function addLyricsVersion(artist, title, plain, synced, source) {
    // Eviter les doublons exacts (meme artist+title)
    const norm = (s) => (s || '').toLowerCase().trim();
    const existing = _lyricsVersions.findIndex(v => norm(v.artist) === norm(artist) && norm(v.title) === norm(title));
    if (existing >= 0) {
        _lyricsVersionIdx = existing;
    } else {
        _lyricsVersions.push({ artist: artist || '', title: title || '', plain: plain || '', synced: synced || '', source: source || '' });
        if (_lyricsVersions.length > LYRICS_VERSIONS_MAX) _lyricsVersions.shift();
        _lyricsVersionIdx = _lyricsVersions.length - 1;
    }
    renderLyricsVersionsBar();
}

function renderLyricsVersionsBar() {
    const bar = document.getElementById('lpVersions');
    if (!bar) return;
    if (_lyricsVersions.length <= 1) { bar.style.display = 'none'; return; }
    bar.style.display = 'flex';
    bar.innerHTML = '<span class="lp-versions-label">Versions :</span>'
        + _lyricsVersions.map((v, i) => {
            const label = (v.artist ? v.artist + ' · ' : '') + (v.title || '?');
            const safe = escapeHtml(label.length > 32 ? label.slice(0, 30) + '...' : label);
            const fullSafe = escapeHtml(label);
            const isActive = (i === _lyricsVersionIdx) ? ' lpv-active' : '';
            return '<span class="lpv-tab' + isActive + '" onclick="switchLyricsVersion(' + i + ')" title="' + fullSafe + (v.source ? ' (' + escapeHtml(v.source) + ')' : '') + '">'
                + safe
                + '<button class="lpv-close" onclick="event.stopPropagation(); closeLyricsVersion(' + i + ')" title="Retirer cette version">&times;</button>'
                + '</span>';
        }).join('');
}

function switchLyricsVersion(idx) {
    const v = _lyricsVersions[idx];
    if (!v) return;
    _lyricsVersionIdx = idx;
    setLyricsOffset(0);
    const t = getCurrentTrackForLyrics();
    renderLyrics({ plain: v.plain, synced: v.synced }, t ? t.url : '');
    renderLyricsVersionsBar();
}

function closeLyricsVersion(idx) {
    if (!_lyricsVersions[idx]) return;
    _lyricsVersions.splice(idx, 1);
    if (_lyricsVersionIdx === idx) {
        _lyricsVersionIdx = Math.min(idx, _lyricsVersions.length - 1);
        if (_lyricsVersionIdx >= 0) {
            switchLyricsVersion(_lyricsVersionIdx);
            return;
        }
    } else if (_lyricsVersionIdx > idx) {
        _lyricsVersionIdx--;
    }
    renderLyricsVersionsBar();
}

function getLyricsExtraAlways() {
    return localStorage.getItem('yt_lyrics_extra_always') === '1';
}
function setLyricsExtraAlways(on) {
    if (on) localStorage.setItem('yt_lyrics_extra_always', '1');
    else localStorage.removeItem('yt_lyrics_extra_always');
}

async function loadLyricsForCurrent() {
    const t = getCurrentTrackForLyrics();
    const body = document.getElementById('lpBody');
    const titleEl = document.getElementById('lpTitle');
    const sourceEl = document.getElementById('lpSource');
    if (!body) return;
    if (!t || !t.title) {
        body.innerHTML = '<div class="lp-empty">Aucun titre en cours</div>';
        if (titleEl) titleEl.textContent = 'Paroles';
        if (sourceEl) sourceEl.textContent = '';
        _lyricsState = null;
        return;
    }
    if (titleEl) titleEl.textContent = t.title;
    if (sourceEl) sourceEl.textContent = t.channel || '';
    body.innerHTML = renderLyricsSpinner('Recherche des paroles...');
    setLyricsOffset(0);
    resetLyricsVersions(); // nouveau morceau -> reset des onglets
    // Mettre a jour le statut apres ~1.5s pour montrer qu'on cherche dans plusieurs sources
    const statusTimer = setTimeout(() => {
        if (body && body.querySelector('.lp-spinner')) {
            body.innerHTML = renderLyricsSpinner('Premiere source vide, exploration des autres sources...');
        }
    }, 1500);
    // Si le panneau Description est ouvert, recharger
    if (isDescPanelOpen()) {
        _descCurrentUrl = null; // force reload
        loadDescriptionForCurrent();
    }
    // Si le karaoke est ouvert, mettre a jour le titre/artiste
    if (_karaokeOpen) {
        const kt = document.getElementById('koTitle');
        const ka = document.getElementById('koArtist');
        if (kt) kt.textContent = t.title;
        if (ka) ka.textContent = t.channel || '';
        const stage = document.getElementById('koStage');
        if (stage) stage.innerHTML = '<div class="ko-empty">Recherche des paroles...</div>';
        _karaokeLastIdx = -2;
    }
    // Fermer le panneau de correction manuelle si ouvert
    const ov = document.getElementById('lpManualOverlay');
    if (ov) ov.style.display = 'none';
    const fixBtn = document.getElementById('lpFixBtn');
    if (fixBtn) fixBtn.classList.remove('active');

    // Auto-extra : on tente toujours toutes les sources d'office (lrclib + ovh)
    const durSuffix = t.duration ? '&durationStr=' + encodeURIComponent(t.duration) : '';

    try {
        const url = 'api/lyrics?title=' + encodeURIComponent(t.title) + '&channel=' + encodeURIComponent(t.channel || '') + durSuffix + '&extra=1';
        const data = await apiCall(url);
        clearTimeout(statusTimer);
        if (data && data.success && (data.plain || data.synced)) {
            const m = data.matched || cleanLyricsQuery(t.title, t.channel);
            addLyricsVersion(m.artist || '', m.title || t.title, data.plain, data.synced, data.source || 'lrclib.net');
            renderLyrics({ plain: data.plain, synced: data.synced }, t.url);
        } else {
            const cleaned = cleanLyricsQuery(t.title, t.channel);
            const triedTexts = (data && Array.isArray(data.tried))
                ? data.tried.map(x => x.kind === 'cache' ? 'cache (' + x.key + ')' : (x.kind + ': "' + (x.artist || '') + '" / "' + (x.title || x.q || '') + '"'))
                : [];
            renderLyrics({ notFound: true }, t.url, { tried: triedTexts, candidate: cleaned, hasExtra: false, externalLinks: (data && data.externalLinks) || [] });
        }
    } catch (e) {
        clearTimeout(statusTimer);
        body.innerHTML = '<div class="lp-empty">Impossible de charger les paroles (' + (e.message || 'erreur reseau') + ')</div>';
    }
}

// Spinner CSS-only pour la phase de recherche
function renderLyricsSpinner(text) {
    return '<div class="lp-loading">'
        + '<div class="lp-spinner"></div>'
        + '<div class="lp-loading-text">' + escapeHtml(text || 'Recherche...') + '</div>'
        + '</div>';
}

async function searchLyricsExtra(rememberAlways) {
    if (rememberAlways) setLyricsExtraAlways(true);
    const t = getCurrentTrackForLyrics();
    if (!t) return;
    const body = document.getElementById('lpBody');
    if (body) body.innerHTML = '<div class="lp-empty">Recherche sur d\'autres sources...</div>';
    try {
        const url = 'api/lyrics?title=' + encodeURIComponent(t.title) + '&channel=' + encodeURIComponent(t.channel || '') + '&extra=1';
        const data = await apiCall(url);
        if (data && data.success && (data.plain || data.synced)) {
            const m = data.matched || cleanLyricsQuery(t.title, t.channel);
            addLyricsVersion(m.artist || '', m.title || t.title, data.plain, data.synced, data.source || 'lrclib.net');
            renderLyrics({ plain: data.plain, synced: data.synced }, t.url);
            if (rememberAlways) showToast('Sources secondaires activees pour les prochains titres');
        } else {
            const cleaned = cleanLyricsQuery(t.title, t.channel);
            const triedTexts = (data && Array.isArray(data.tried))
                ? data.tried.map(x => x.kind === 'cache' ? 'cache (' + x.key + ')' : (x.kind + ': "' + (x.artist || '') + '" / "' + (x.title || x.q || '') + '"'))
                : [];
            renderLyrics({ notFound: true }, t.url, { tried: triedTexts, candidate: cleaned, hasExtra: false });
        }
    } catch (e) {
        if (body) body.innerHTML = '<div class="lp-empty">Erreur recherche secondaire: ' + (e.message || 'reseau') + '</div>';
    }
}

function toggleManualLyricsSearch() {
    const ov = document.getElementById('lpManualOverlay');
    if (!ov) return;
    if (ov.style.display === 'none') {
        // Pre-remplir avec le titre/artiste actuel devine
        const t = getCurrentTrackForLyrics();
        if (t) {
            const cleaned = cleanLyricsQuery(t.title, t.channel);
            const ai = document.getElementById('lpFixArtist');
            const ti = document.getElementById('lpFixTitle');
            if (ai) ai.value = cleaned.artist || '';
            if (ti) ti.value = cleaned.title || t.title || '';
        }
        ov.style.display = 'block';
        const btn = document.getElementById('lpFixBtn');
        if (btn) btn.classList.add('active');
    } else {
        ov.style.display = 'none';
        const btn = document.getElementById('lpFixBtn');
        if (btn) btn.classList.remove('active');
    }
}

async function manualLyricsSearchFromFix(useExtra) {
    const ai = document.getElementById('lpFixArtist');
    const ti = document.getElementById('lpFixTitle');
    if (!ai || !ti) return;
    const artist = ai.value.trim();
    const title = ti.value.trim();
    if (!title) { ti.focus(); return; }
    const body = document.getElementById('lpBody');
    if (body) body.innerHTML = renderLyricsSpinner('Recherche : "' + artist + ' - ' + title + '"...');
    setLyricsOffset(0);
    try {
        let url = 'api/lyrics?title=' + encodeURIComponent(title) + '&artist=' + encodeURIComponent(artist) + '&titleExact=' + encodeURIComponent(title) + '&extra=1';
        const data = await apiCall(url);
        const t = getCurrentTrackForLyrics();
        if (data && data.success && (data.plain || data.synced)) {
            addLyricsVersion(artist, title, data.plain, data.synced, data.source || 'lrclib.net');
            renderLyrics({ plain: data.plain, synced: data.synced }, t ? t.url : '');
            // Fermer le panneau de correction apres succes
            const ov = document.getElementById('lpManualOverlay');
            if (ov) ov.style.display = 'none';
            const btn = document.getElementById('lpFixBtn');
            if (btn) btn.classList.remove('active');
            showToast('Paroles mises a jour');
        } else {
            const triedTexts = (data && Array.isArray(data.tried))
                ? data.tried.map(x => x.kind === 'cache' ? 'cache (' + x.key + ')' : (x.kind + ': "' + (x.artist || '') + '" / "' + (x.title || x.q || '') + '"'))
                : ['manual: "' + artist + '" / "' + title + '"'];
            renderLyrics({ notFound: true }, '', { tried: triedTexts, candidate: { artist, title }, hasExtra: !useExtra, externalLinks: (data && data.externalLinks) || [] });
        }
    } catch (e) {
        if (body) body.innerHTML = '<div class="lp-empty">Erreur: ' + (e.message || 'reseau') + '</div>';
    }
}

async function manualLyricsSearch() {
    const ai = document.getElementById('lpManualArtist');
    const ti = document.getElementById('lpManualTitle');
    if (!ai || !ti) return;
    const artist = ai.value.trim();
    const title = ti.value.trim();
    if (!title) { ti.focus(); return; }
    const body = document.getElementById('lpBody');
    if (body) body.innerHTML = renderLyricsSpinner('Recherche manuelle...');
    try {
        const url = 'api/lyrics?title=' + encodeURIComponent(title) + '&artist=' + encodeURIComponent(artist) + '&titleExact=' + encodeURIComponent(title) + '&extra=1';
        const data = await apiCall(url);
        const t = getCurrentTrackForLyrics();
        if (data && data.success && (data.plain || data.synced)) {
            addLyricsVersion(artist, title, data.plain, data.synced, data.source || 'lrclib.net');
            renderLyrics({ plain: data.plain, synced: data.synced }, t ? t.url : '');
        } else {
            const triedTexts = (data && Array.isArray(data.tried))
                ? data.tried.map(x => x.kind === 'cache' ? 'cache (' + x.key + ')' : (x.kind + ': "' + (x.artist || '') + '" / "' + (x.title || x.q || '') + '"'))
                : ['manual: "' + artist + '" / "' + title + '"'];
            renderLyrics({ notFound: true }, '', { tried: triedTexts, candidate: { artist, title }, externalLinks: (data && data.externalLinks) || [] });
        }
    } catch (e) {
        if (body) body.innerHTML = '<div class="lp-empty">Erreur: ' + (e.message || 'reseau') + '</div>';
    }
}

function renderLyrics(entry, urlForState, debug) {
    const body = document.getElementById('lpBody');
    if (!body) return;
    if (entry.notFound || (!entry.plain && !entry.synced)) {
        const cand = (debug && debug.candidate) ? debug.candidate : { artist: '', title: '' };
        const triedHtml = (debug && debug.tried && debug.tried.length)
            ? '<details style="margin-top:8px;font-size:11px;color:var(--text-muted);"><summary style="cursor:pointer;">Voir les recherches tentees (' + debug.tried.length + ')</summary><ul style="margin:6px 0 0;padding-left:18px;">' + debug.tried.map(s => '<li>' + escapeHtml(s) + '</li>').join('') + '</ul></details>'
            : '';
        // Plus de prompt extra : la recherche secondaire est faite automatiquement
        const extraBlock = '';
        const links = (debug && Array.isArray(debug.externalLinks) && debug.externalLinks.length)
            ? debug.externalLinks
            : [];
        const linksBlock = links.length
            ? '<div class="lp-extlinks">'
                + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">&#128279; Ouvre la recherche sur un autre site :</div>'
                + '<div style="display:flex;flex-wrap:wrap;gap:6px;">'
                + links.map(l => '<a href="' + Dom.attr(l.url) + '" target="_blank" rel="noopener" class="lp-extlink">' + escapeHtml(l.name) + '</a>').join('')
                + '</div></div>'
            : '';
        body.innerHTML = '<div class="lp-empty" style="text-align:center;">'
            + '<div style="font-size:24px;opacity:0.5;margin-bottom:6px;">&#128220;</div>'
            + 'Pas de paroles trouvees sur lrclib.net.'
            + '<div style="font-size:11px;margin-top:6px;">Verifie ou corrige l\'artiste et le titre :</div>'
            + '</div>'
            + '<div class="lp-manual">'
            + '<input type="text" id="lpManualArtist" placeholder="Artiste" value="' + escapeHtml(cand.artist || '') + '">'
            + '<input type="text" id="lpManualTitle" placeholder="Titre" value="' + escapeHtml(cand.title || '') + '">'
            + '<button onclick="manualLyricsSearch()">Chercher</button>'
            + '</div>'
            + extraBlock
            + linksBlock
            + triedHtml;
        _lyricsState = null;
        return;
    }
    const synced = parseSyncedLyrics(entry.synced);
    if (synced && synced.length) {
        body.innerHTML = synced.map((l, i) => '<div class="lp-line" data-idx="' + i + '" onclick="onLyricsLineClick(' + i + ')" title="Click selon le mode (seeker / synchro)">' + escapeHtml(l.text || ' ') + '</div>').join('');
        _lyricsState = { url: urlForState, synced, current: -1, synthetic: false };
    } else if (entry.plain) {
        // Synthese de timing approximatif : on repartit les lignes uniformement sur la duree du morceau
        const lines = entry.plain.split(/\r?\n/);
        const a = getActiveAudio();
        const dur = (a && a.duration && isFinite(a.duration)) ? a.duration : 200;
        // Reserver 5% au debut et 5% a la fin (souvent intro/outro instrumentaux)
        const startOff = Math.min(15, dur * 0.05);
        const usable = Math.max(30, dur - startOff - dur * 0.05);
        const nonEmpty = lines.filter(l => l.trim().length > 0).length || 1;
        let nonEmptyIdx = 0;
        const synthSynced = lines.map((text, i) => {
            const trimmed = (text || '').trim();
            if (!trimmed) {
                return { ts: startOff + (nonEmptyIdx / nonEmpty) * usable, text: '' };
            }
            const ts = startOff + (nonEmptyIdx / nonEmpty) * usable;
            nonEmptyIdx++;
            return { ts, text: trimmed };
        });
        body.innerHTML = '<div class="lp-synth-notice">&#9201; Synchro approximative (paroles non timecodees)</div>'
            + synthSynced.map((l, i) => '<div class="lp-line" data-idx="' + i + '" onclick="onLyricsLineClick(' + i + ')" title="Click selon le mode (seeker / synchro)">' + escapeHtml(l.text || ' ') + '</div>').join('');
        _lyricsState = { url: urlForState, synced: synthSynced, current: -1, synthetic: true };
    } else {
        const plain = (entry.plain || '').split(/\r?\n/).map(s => '<div class="lp-line lp-line-plain">' + escapeHtml(s) + '</div>').join('');
        body.innerHTML = plain || '<div class="lp-empty">Pas de paroles.</div>';
        _lyricsState = { url: urlForState, synced: null, current: -1 };
    }
}

function getLyricsAutoFollow() {
    // Defaut : ON (true). On stocke '0' uniquement si l'utilisateur a desactive.
    return localStorage.getItem('yt_lyrics_auto_follow') !== '0';
}

function setLyricsAutoFollow(on) {
    localStorage.setItem('yt_lyrics_auto_follow', on ? '1' : '0');
    const cb = document.getElementById('lpFollowToggle');
    if (cb && cb.checked !== !!on) cb.checked = !!on;
    if (on) lyricsScrollToCurrent();
}

// === Decalage manuel des paroles (offset) ===
let _lyricsOffset = 0; // secondes, ajoute aux timestamps de chaque ligne

function setLyricsOffset(sec) {
    _lyricsOffset = sec || 0;
    const badge = document.getElementById('lpOffsetBadge');
    if (badge) {
        if (Math.abs(_lyricsOffset) < 0.05) {
            badge.style.display = 'none';
        } else {
            const sign = _lyricsOffset > 0 ? '+' : '';
            badge.textContent = sign + _lyricsOffset.toFixed(1) + 's  &times;';
            badge.style.display = 'inline-flex';
            badge.innerHTML = sign + _lyricsOffset.toFixed(1) + 's <span class="lp-offset-x">&times;</span>';
        }
    }
    // Force un refresh immediat de la ligne courante
    if (_lyricsState) _lyricsState.current = -1;
}

function resetLyricsOffset() {
    setLyricsOffset(0);
}

// === Mode de clic sur une ligne ===
function getLyricsClickMode() {
    const v = localStorage.getItem('yt_lyrics_click_mode');
    return (v === 'sync' || v === 'none') ? v : 'seek';
}

function setLyricsClickMode(mode) {
    if (mode !== 'seek' && mode !== 'sync' && mode !== 'none') mode = 'seek';
    localStorage.setItem('yt_lyrics_click_mode', mode);
    const sel = document.getElementById('lpClickMode');
    if (sel && sel.value !== mode) sel.value = mode;
}

function onLyricsLineClick(idx) {
    if (!_lyricsState || !_lyricsState.synced) return;
    const line = _lyricsState.synced[idx];
    if (!line) return;
    const mode = getLyricsClickMode();
    const a = getActiveAudio();
    if (mode === 'seek') {
        if (a && a.duration) {
            // On retire l'offset eventuel pour seeker au "vrai" timestamp de la ligne
            a.currentTime = Math.max(0, Math.min(a.duration, line.ts - _lyricsOffset));
            // Et on synchronise aussi mainAudio en cas de crossfade
        }
    } else if (mode === 'sync') {
        if (a && a.duration) {
            // L'offset est ajuste pour que la ligne cliquee corresponde a "maintenant"
            const newOffset = a.currentTime - line.ts;
            setLyricsOffset(newOffset);
        }
    }
    // mode 'none' : rien
}

function lyricsScrollToCurrent() {
    if (!_lyricsState || !_lyricsState.synced) return;
    const idx = _lyricsState.current;
    if (idx < 0) return;
    const body = document.getElementById('lpBody');
    if (!body) return;
    const lineEl = body.querySelector('.lp-line[data-idx="' + idx + '"]');
    if (!lineEl) return;
    const offset = lineEl.offsetTop - body.clientHeight / 2 + lineEl.clientHeight / 2;
    body.scrollTo({ top: offset, behavior: 'smooth' });
}

// ===== Mode karaoke (plein ecran) =====
let _karaokeOpen = false;
let _karaokeLastIdx = -2;

const KARAOKE_DEFAULTS = {
    effect: 'glow',
    color: 'pink',
    context: 2,
    size: 'md',
    font: 'sans',
    bg: 'dark',
    uppercase: false
};

function getKaraokeSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('yt_karaoke_settings') || '{}');
        return Object.assign({}, KARAOKE_DEFAULTS, saved);
    } catch (e) { return Object.assign({}, KARAOKE_DEFAULTS); }
}

function saveKaraokeSettings(s) {
    try { localStorage.setItem('yt_karaoke_settings', JSON.stringify(s)); } catch (e) {}
}

function updateKaraokeSetting(key, value) {
    const s = getKaraokeSettings();
    s[key] = value;
    saveKaraokeSettings(s);
    applyKaraokeSettings();
    if (key === 'context') { _karaokeLastIdx = -2; karaokeRender(); }
}

function resetKaraokeSettings() {
    saveKaraokeSettings({});
    syncKaraokeSettingsUI();
    applyKaraokeSettings();
    _karaokeLastIdx = -2;
    karaokeRender();
}

function syncKaraokeSettingsUI() {
    const s = getKaraokeSettings();
    const el = (id) => document.getElementById(id);
    if (el('koSetEffect')) el('koSetEffect').value = s.effect;
    if (el('koSetColor')) el('koSetColor').value = s.color;
    if (el('koSetContext')) el('koSetContext').value = String(s.context);
    if (el('koSetSize')) el('koSetSize').value = s.size;
    if (el('koSetFont')) el('koSetFont').value = s.font;
    if (el('koSetBg')) el('koSetBg').value = s.bg;
    if (el('koSetUppercase')) el('koSetUppercase').checked = !!s.uppercase;
}

function applyKaraokeSettings() {
    const ov = document.getElementById('karaokeOverlay');
    if (!ov) return;
    const s = getKaraokeSettings();
    // Reset toutes les classes ko-eff-/ko-col-/ko-sz-/ko-fn-/ko-bg-/ko-uc
    ov.className = ov.className.split(' ').filter(c => !/^ko-(eff|col|sz|fn|bg|uc)-/.test(c)).join(' ');
    if (!ov.classList.contains('karaoke-overlay')) ov.classList.add('karaoke-overlay');
    ov.classList.add('ko-eff-' + s.effect);
    ov.classList.add('ko-col-' + s.color);
    ov.classList.add('ko-sz-' + s.size);
    ov.classList.add('ko-fn-' + s.font);
    ov.classList.add('ko-bg-' + s.bg);
    if (s.uppercase) ov.classList.add('ko-uc-on');
}

function toggleKaraokeSettings() {
    const p = document.getElementById('koSettingsPanel');
    if (!p) return;
    if (p.style.display === 'none') {
        syncKaraokeSettingsUI();
        p.style.display = 'block';
    } else {
        p.style.display = 'none';
    }
}

function enterKaraokeMode() {
    const ov = document.getElementById('karaokeOverlay');
    if (!ov) return;
    if (!_lyricsState || !_lyricsState.synced || !_lyricsState.synced.length) {
        showToast('Pas de paroles disponibles pour ce titre');
        return;
    }
    const t = getCurrentTrackForLyrics();
    document.getElementById('koTitle').textContent = (t && t.title) || '';
    const artistEl = document.getElementById('koArtist');
    artistEl.textContent = (t && t.channel) || '';
    if (_lyricsState.synthetic) {
        artistEl.textContent += '  ·  Synchro approximative';
    }
    ov.style.display = 'flex';
    _karaokeOpen = true;
    _karaokeLastIdx = -2;
    applyKaraokeSettings();
    karaokeRender();
}

function exitKaraokeMode() {
    const ov = document.getElementById('karaokeOverlay');
    if (!ov) return;
    ov.style.display = 'none';
    _karaokeOpen = false;
}

function karaokeRender() {
    if (!_karaokeOpen || !_lyricsState || !_lyricsState.synced) return;
    const stage = document.getElementById('koStage');
    if (!stage) return;
    const arr = _lyricsState.synced;
    const cur = _lyricsState.current;

    // Construire toutes les lignes UNE SEULE FOIS (signature pour detecter changement de track)
    const sig = (arr.length || 0) + ':' + (arr[0] && arr[0].text ? arr[0].text.slice(0, 20) : '');
    if (stage.dataset.sig !== sig) {
        stage.dataset.sig = sig;
        stage.innerHTML = arr.map((l, i) =>
            '<div class="ko-line" data-idx="' + i + '" onclick="onLyricsLineClick(' + i + ')">' +
            escapeHtml(l.text || ' ') +
            '</div>'
        ).join('');
        _karaokeLastIdx = -2;
    }
    if (cur === _karaokeLastIdx) return;
    _karaokeLastIdx = cur;

    const ctxN = getKaraokeSettings().context;
    // Mettre a jour les classes selon la distance a la ligne courante
    const lines = stage.querySelectorAll('.ko-line');
    lines.forEach((el, i) => {
        const off = i - cur;
        const absOff = Math.abs(off);
        // Reset
        el.classList.remove('ko-line-current', 'ko-line-context', 'ko-line-off1', 'ko-line-off2', 'ko-line-off3', 'ko-line-far');
        if (off === 0) {
            el.classList.add('ko-line-current');
        } else if (absOff <= ctxN) {
            el.classList.add('ko-line-context', 'ko-line-off' + absOff);
        } else {
            el.classList.add('ko-line-far');
        }
    });

    // Translater le stage pour centrer la ligne courante
    if (cur >= 0) {
        const lineEl = stage.querySelector('.ko-line[data-idx="' + cur + '"]');
        if (lineEl) {
            const containerH = stage.parentElement ? stage.parentElement.clientHeight : window.innerHeight;
            // Centre du conteneur - centre de la ligne dans le stage
            const lineCenter = lineEl.offsetTop + lineEl.offsetHeight / 2;
            const targetY = (containerH / 2) - lineCenter;
            stage.style.transform = 'translateY(' + targetY + 'px)';
        }
    }
}

// Echap pour quitter
document.addEventListener('keydown', function(e) {
    if (_karaokeOpen && (e.key === 'Escape' || e.key === 'Esc')) {
        e.preventDefault();
        exitKaraokeMode();
    }
});

function lyricsTick() {
    if (!_lyricsState || !_lyricsState.synced) return;
    if (!isLyricsPanelOpen() && !_karaokeOpen) return;
    const a = getActiveAudio();
    if (!a || a.paused) return;
    // On compare au timestamp + offset utilisateur (decalage manuel)
    const t = a.currentTime - _lyricsOffset;
    const arr = _lyricsState.synced;
    let idx = -1;
    for (let i = 0; i < arr.length; i++) {
        if (arr[i].ts <= t + 0.05) idx = i; else break;
    }
    if (idx === _lyricsState.current) return;
    _lyricsState.current = idx;
    const body = document.getElementById('lpBody');
    if (!body) return;
    body.querySelectorAll('.lp-line.lp-line-active').forEach(el => el.classList.remove('lp-line-active'));
    if (idx >= 0) {
        const lineEl = body.querySelector('.lp-line[data-idx="' + idx + '"]');
        if (lineEl) {
            lineEl.classList.add('lp-line-active');
            // Scroll seulement si suivi auto active
            if (getLyricsAutoFollow()) {
                const offsetPx = lineEl.offsetTop - body.clientHeight / 2 + lineEl.clientHeight / 2;
                body.scrollTo({ top: offsetPx, behavior: 'smooth' });
            }
        }
    }
    if (_karaokeOpen) karaokeRender();
}
setInterval(lyricsTick, 250);

// Auto-ouverture quand un nouveau titre demarre, si l'utilisateur l'a active
function maybeAutoOpenLyrics() {
    if (localStorage.getItem('yt_lyrics_auto') === '1' && !isLyricsPanelOpen()) {
        toggleLyricsPanel();
    } else if (isLyricsPanelOpen()) {
        loadLyricsForCurrent();
    }
}

function setFlowNotifEnabled(on) {
    if (on) {
        if ('Notification' in window) {
            if (Notification.permission === 'granted') {
                localStorage.setItem('yt_flow_notif_on', '1');
            } else if (Notification.permission === 'default') {
                Notification.requestPermission().then(p => {
                    if (p === 'granted') {
                        localStorage.setItem('yt_flow_notif_on', '1');
                    } else {
                        localStorage.removeItem('yt_flow_notif_on');
                        const cb = document.getElementById('prefFlowNotif');
                        if (cb) cb.checked = false;
                    }
                });
            } else {
                showToast('Les notifications ont ete bloquees par le navigateur. Active-les dans les parametres du site.');
                const cb = document.getElementById('prefFlowNotif');
                if (cb) cb.checked = false;
            }
        }
    } else {
        localStorage.removeItem('yt_flow_notif_on');
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
        const tabMap = { 'Telecharger': 'download', 'Recherche': 'search', 'Bibliotheque': 'library', 'Mon Flow': 'flow', 'Stats': 'stats', 'Profil': 'profile', 'Aide': 'help' };
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
    if (tab === 'search') {
        if (typeof renderInitialSearchHistory === 'function') renderInitialSearchHistory();
    }
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
    showDismissFeedbackBtn();
}

function showDismissFeedbackBtn() {
    const b = document.getElementById('btnDismissFeedback');
    if (b) b.style.display = '';
}

(function setupMessageDismiss() {
    const result = document.getElementById('result');
    if (!result) return;
    function decorate(msg) {
        if (!msg || msg.dataset.dismissable === '1') return;
        msg.dataset.dismissable = '1';
        msg.classList.add('message-dismissable');
        const close = document.createElement('button');
        close.className = 'msg-close';
        close.type = 'button';
        close.title = 'Effacer ce message';
        close.innerHTML = '&times;';
        close.addEventListener('click', function(e) {
            e.stopPropagation();
            msg.remove();
        });
        msg.appendChild(close);
    }
    function scan(root) {
        if (!root || root.nodeType !== 1) return;
        if (root.classList && root.classList.contains('message')) decorate(root);
        if (root.querySelectorAll) root.querySelectorAll('.message').forEach(decorate);
    }
    new MutationObserver(muts => {
        muts.forEach(m => m.addedNodes.forEach(scan));
    }).observe(result, { childList: true, subtree: true });
    scan(result);
})();

function dismissDownloadFeedback() {
    const result = document.getElementById('result');
    if (result) result.innerHTML = '';
    const progressZone = document.getElementById('progressZone');
    if (progressZone) progressZone.classList.remove('active');
    const progressBar = document.getElementById('progressBar');
    if (progressBar) progressBar.style.width = '0%';
    const progressText = document.getElementById('progressText');
    if (progressText) progressText.textContent = 'Demarrage...';
    const btnCancel = document.getElementById('btnCancel');
    if (btnCancel) btnCancel.style.display = 'none';
    const btnDismiss = document.getElementById('btnDismissFeedback');
    if (btnDismiss) btnDismiss.style.display = 'none';
    const videoCard = document.getElementById('videoCard');
    if (videoCard) videoCard.classList.remove('active');
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
    document.getElementById('btnDismissFeedback').style.display = 'none';
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
        const info = await apiPost('api/info', { url });
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
            const dlData = await apiPost('api/download', { url, type, format, quality, cover: saveCover });
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
                const data = await apiCall('api/progress?id=' + jobId);

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

                    await apiPost('api/library', {
                        action: 'add_item', file: data.file, title: info.title,
                        type, format, folder, thumbnail: info.thumbnail,
                        channel: info.channel, duration: info.duration,
                        cover: data.cover || '', url
                    });

                    notifyDone(info.title);
                    addHistory(info.title, 'success', format, type, url, info);
                    incrementDownloadCount();
                    loadSystemInfo();
                    if (!data.cover) {
                        apiPost('api/library', { action: 'fix_covers' }).catch(() => {});
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

    function reset() { btn.disabled = false; btn.textContent = 'Telecharger'; document.getElementById('btnCancel').style.display = 'none'; currentDlInterval = null; showDismissFeedbackBtn(); }
});

// ========== LIBRARY ==========
async function loadLibrary() {
    libraryData = await apiCall('api/library?action=list');
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
        const data = await apiPost('api/library', { action: 'toggle_like', item_id: itemId });
        console.log('[LIKE LIB] response', data);
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
    await apiPost('api/library', { action: 'create_folder', name });
    closeModal('modalFolder');
    loadLibrary();
}

function deleteFolder(id) {
    showConfirm('Supprimer le dossier', 'Les elements du dossier retourneront a la racine.', 'Supprimer', 'var(--error)', async () => {
        await apiPost('api/library', { action: 'delete_folder', folder_id: id });
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
        const data = await apiCall('api/convert', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: item.file, format: format.toLowerCase(), quality: '0' })
        });
        if (!data.success) { alert('Erreur : ' + data.error); return; }

        const outputFile = data.outputFile;
        const pollConvert = setInterval(async () => {
            try {
                const status = await apiCall('api/convert?file=' + encodeURIComponent(outputFile));
                if (status.done) {
                    clearInterval(pollConvert);
                    await apiPost('api/library', {
                        action: 'add_item', file: outputFile, title: item.title,
                        type: 'audio', format: format.toLowerCase(),
                        folder: item.folder || '', thumbnail: item.thumbnail || '',
                        channel: item.channel || '', duration: item.duration || '',
                        cover: item.cover || '', url: item.url || ''
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
        await apiPost('api/library', { action: 'delete_item', item_id: id });
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
    await apiPost('api/library', { action: 'move_item', item_id: moveItemId, folder_id: folderId });
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
            await apiPost('api/library', { action: 'delete_item', item_id: id });
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
let playbackContext = 'library'; // 'library', 'flow', 'history', 'search'

function setPlayerSource(ctx) {
    playbackContext = ctx || 'library';
    const el = document.getElementById('playerSource');
    const txt = document.getElementById('playerSourceText');
    if (el && txt) {
        const messages = {
            flow: { cls: 'src-flow', text: '♫ Lecture depuis Mon Flow — streaming sans telecharger · ajout aux compteurs Mon Flow' },
            library: { cls: 'src-library', text: '♫ Lecture depuis ta Bibliotheque — fichier local sur ton disque' },
            history: { cls: 'src-history', text: '♫ Lecture depuis l\'Historique — streaming si non telecharge' },
            search: { cls: 'src-search', text: '♫ Lecture depuis la Recherche — ecoute ephemere (apparait dans Stats > Ephemeres si non sauve)' }
        };
        const m = messages[ctx] || messages.library;
        el.className = 'p-source ' + m.cls;
        txt.textContent = m.text;
        el.style.display = 'inline-block';
    }
    setTimeout(playerSyncLikeBtn, 50);
    setTimeout(updatePlayerBackground, 100);
}

function updatePlayerBackground() {
    const bar = document.getElementById('playerBar');
    const thumb = document.getElementById('playerThumb');
    if (!bar || !thumb) return;
    const src = thumb.src && !thumb.src.endsWith('/') ? thumb.src : '';
    if (src && src !== 'about:blank') {
        bar.style.setProperty('--player-bg-image', `url("${src}")`);
    } else {
        bar.style.removeProperty('--player-bg-image');
    }
}

(function watchPlayerThumb() {
    const t = document.getElementById('playerThumb');
    if (!t) { setTimeout(watchPlayerThumb, 200); return; }
    new MutationObserver(updatePlayerBackground).observe(t, { attributes: true, attributeFilter: ['src'] });
    updatePlayerBackground();
})();

// ===== Audio spectrum visualizer =====
let _vizCtx = null, _vizAnalyser = null, _vizSource = null, _vizSourceB = null, _vizRaf = null, _vizFakeMode = false;

function initVisualizer() {
    const canvas = document.getElementById('playerVisualizer');
    if (!canvas || !audioEl) return;
    canvas.onclick = () => canvas.classList.toggle('hidden');

    if (_vizSource) return;
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) { _vizFakeMode = true; startVisualizerLoop(); return; }
        _vizCtx = new Ctx();
        _vizSource = _vizCtx.createMediaElementSource(audioEl);
        _vizSourceB = _vizCtx.createMediaElementSource(audioElB);
        _vizAnalyser = _vizCtx.createAnalyser();
        _vizAnalyser.fftSize = 64;
        _vizSource.connect(_vizAnalyser);
        _vizSourceB.connect(_vizAnalyser);
        _vizAnalyser.connect(_vizCtx.destination);
    } catch (e) {
        _vizFakeMode = true;
    }
    startVisualizerLoop();
}

function startVisualizerLoop() {
    const canvas = document.getElementById('playerVisualizer');
    const bgCanvas = document.getElementById('bgVisualizer');
    if (!canvas && !bgCanvas) return;
    const ctx = canvas ? canvas.getContext('2d') : null;
    const bgCtx = bgCanvas ? bgCanvas.getContext('2d') : null;
    const bars = 24;
    let fakePhase = 0;

    function resizeBg() {
        if (!bgCanvas) return;
        const w = window.innerWidth;
        if (bgCanvas.width !== w) bgCanvas.width = w;
        if (bgCanvas.height !== 200) bgCanvas.height = 200;
    }
    if (bgCanvas) {
        resizeBg();
        window.addEventListener('resize', resizeBg);
    }

    function draw() {
        const ae = getActiveAudio();
        const playing = ae && !ae.paused && !ae.ended;
        let data;
        if (_vizAnalyser && !_vizFakeMode) {
            data = new Uint8Array(_vizAnalyser.frequencyBinCount);
            _vizAnalyser.getByteFrequencyData(data);
        } else {
            data = new Uint8Array(bars);
            fakePhase += playing ? 0.15 : 0;
            for (let i = 0; i < bars; i++) {
                const intensity = playing ? (0.4 + 0.5 * Math.abs(Math.sin(fakePhase * 0.5 + i * 0.4) + Math.sin(fakePhase + i * 0.7) * 0.5)) : 0;
                data[i] = Math.floor(intensity * 200);
            }
        }

        if (ctx) {
            const W = canvas.width, H = canvas.height;
            ctx.clearRect(0, 0, W, H);
            const barW = W / bars - 1;
            for (let i = 0; i < bars; i++) {
                const v = (data[i] || 0) / 255;
                const h = Math.max(2, v * H * 0.95);
                const x = i * (barW + 1);
                const y = (H - h) / 2;
                const hue = 240 - v * 180;
                ctx.fillStyle = playing ? `hsl(${hue.toFixed(0)}, 80%, 60%)` : 'rgba(255,255,255,0.15)';
                ctx.fillRect(x, y, barW, h);
            }
        }

        if (bgCtx) {
            const W = bgCanvas.width, H = bgCanvas.height;
            bgCtx.clearRect(0, 0, W, H);
            if (!playing) {
                bgCanvas.classList.add('idle');
            } else {
                bgCanvas.classList.remove('idle');
                const settings = _vizCurrentSettings || VIZ_DEFAULTS;
                const bgBars = settings.bars || 48;
                const bgBarW = W / bgBars;
                const sens = (settings.sens || 100) / 100;
                const smoothFactor = (settings.smooth || 0) / 100;

                if (!_vizSmoothBuffer || _vizSmoothBuffer.length !== bgBars) {
                    _vizSmoothBuffer = new Float32Array(bgBars);
                }
                const vals = new Float32Array(bgBars);
                for (let i = 0; i < bgBars; i++) {
                    const srcIdx = Math.floor((i / bgBars) * bars);
                    let raw = ((data[srcIdx] || 0) / 255) * sens;
                    if (raw > 1) raw = 1;
                    const prev = _vizSmoothBuffer[i] || 0;
                    const v = prev * smoothFactor + raw * (1 - smoothFactor);
                    _vizSmoothBuffer[i] = v;
                    vals[i] = v;
                }

                const colorAt = (i, v) => {
                    const t = settings.theme;
                    const baseHue = settings.hue || 280;
                    const sat = '90%', light = '55%';
                    if (t === 'rainbow') return `hsl(${(i / bgBars * 360).toFixed(0)}, ${sat}, ${light})`;
                    if (t === 'warm') return `hsl(${(40 - v * 40).toFixed(0)}, ${sat}, ${light})`;
                    if (t === 'cool') return `hsl(${(180 + v * 80).toFixed(0)}, ${sat}, ${light})`;
                    if (t === 'green') return `hsl(${(120 + v * 60).toFixed(0)}, ${sat}, ${light})`;
                    if (t === 'mono') return `hsl(${baseHue}, ${sat}, ${(40 + v * 30).toFixed(0)}%)`;
                    if (t === 'custom') return `hsl(${baseHue}, ${sat}, ${(45 + v * 25).toFixed(0)}%)`;
                    return `hsl(${(240 - v * 200).toFixed(0)}, 90%, 55%)`;
                };

                if (settings.glow) {
                    bgCtx.shadowBlur = 12;
                    bgCtx.shadowColor = colorAt(0, 0.5);
                } else {
                    bgCtx.shadowBlur = 0;
                }

                const drawBar = (i, v) => {
                    const h = Math.max(2, v * H * 0.95);
                    const x = i * bgBarW;
                    const y = settings.reverse ? 0 : (H - h);
                    bgCtx.fillStyle = colorAt(i, v);
                    bgCtx.fillRect(x, y, bgBarW * 0.85, h);
                };

                if (settings.style === 'bars') {
                    for (let i = 0; i < bgBars; i++) drawBar(i, vals[i]);
                } else if (settings.style === 'mirror') {
                    for (let i = 0; i < bgBars; i++) {
                        const v = vals[i];
                        const h = Math.max(2, v * H * 0.5);
                        const x = i * bgBarW;
                        bgCtx.fillStyle = colorAt(i, v);
                        bgCtx.fillRect(x, H/2 - h, bgBarW * 0.85, h * 2);
                    }
                } else if (settings.style === 'wave' || settings.style === 'line') {
                    bgCtx.beginPath();
                    bgCtx.lineWidth = settings.style === 'line' ? 2 : 4;
                    for (let i = 0; i < bgBars; i++) {
                        const v = vals[i];
                        const x = i * bgBarW + bgBarW / 2;
                        const y = settings.reverse ? (v * H * 0.95) : (H - v * H * 0.95);
                        if (i === 0) bgCtx.moveTo(x, y);
                        else {
                            const prevX = (i - 1) * bgBarW + bgBarW / 2;
                            const prevY = settings.reverse ? (vals[i-1] * H * 0.95) : (H - vals[i-1] * H * 0.95);
                            const cx = (prevX + x) / 2;
                            bgCtx.quadraticCurveTo(cx, prevY, x, y);
                        }
                    }
                    bgCtx.strokeStyle = colorAt(bgBars / 2, 0.7);
                    bgCtx.stroke();
                } else if (settings.style === 'filled') {
                    bgCtx.beginPath();
                    bgCtx.moveTo(0, settings.reverse ? 0 : H);
                    for (let i = 0; i < bgBars; i++) {
                        const v = vals[i];
                        const x = i * bgBarW + bgBarW / 2;
                        const y = settings.reverse ? (v * H * 0.95) : (H - v * H * 0.95);
                        bgCtx.lineTo(x, y);
                    }
                    bgCtx.lineTo(W, settings.reverse ? 0 : H);
                    bgCtx.closePath();
                    const grad = bgCtx.createLinearGradient(0, 0, W, 0);
                    grad.addColorStop(0, colorAt(0, 0.3));
                    grad.addColorStop(0.5, colorAt(bgBars / 2, 0.7));
                    grad.addColorStop(1, colorAt(bgBars - 1, 0.3));
                    bgCtx.fillStyle = grad;
                    bgCtx.fill();
                } else if (settings.style === 'dots') {
                    for (let i = 0; i < bgBars; i++) {
                        const v = vals[i];
                        const r = Math.max(2, v * Math.min(bgBarW, H) * 0.4);
                        const x = i * bgBarW + bgBarW / 2;
                        const y = settings.reverse ? (v * H * 0.95) : (H - v * H * 0.95);
                        bgCtx.fillStyle = colorAt(i, v);
                        bgCtx.beginPath();
                        bgCtx.arc(x, y, r, 0, Math.PI * 2);
                        bgCtx.fill();
                    }
                }
            }
        }

        _vizRaf = requestAnimationFrame(draw);
    }
    cancelAnimationFrame(_vizRaf);
    draw();
}

setTimeout(function setupVisualizer() {
    const ae = document.getElementById('audioEl');
    if (!ae) { setTimeout(setupVisualizer, 200); return; }
    ae.addEventListener('play', () => {
        if (_vizCtx && _vizCtx.state === 'suspended') _vizCtx.resume();
        if (!_vizSource && !_vizFakeMode) initVisualizer();
        else if (!_vizRaf) startVisualizerLoop();
    });
    initVisualizer();
    loadVizSettings();
}, 0);

// ===== Reglages spectre visuel =====
const VIZ_DEFAULTS = {
    enabled: true, opacity: 32, blur: 14, sat: 150, height: 200, blend: 'screen', pos: 'top',
    theme: 'auto', hue: 280, style: 'bars', bars: 48, sens: 100, smooth: 30, glow: false, reverse: false
};
const VIZ_KEY = 'yt_viz_settings';
let _vizCurrentSettings = Object.assign({}, VIZ_DEFAULTS);
let _vizSmoothBuffer = null;

function loadVizSettings() {
    let s;
    try { s = JSON.parse(localStorage.getItem(VIZ_KEY) || '{}'); } catch (e) { s = {}; }
    s = Object.assign({}, VIZ_DEFAULTS, s);
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setCheck = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };
    setCheck('vizEnabled', s.enabled !== false);
    setVal('vizOpacity', s.opacity);
    setVal('vizBlur', s.blur);
    setVal('vizSat', s.sat);
    setVal('vizHeight', s.height);
    setVal('vizBlend', s.blend);
    setVal('vizPos', s.pos);
    setVal('vizTheme', s.theme);
    setVal('vizHue', s.hue);
    setVal('vizStyle', s.style);
    setVal('vizBars', s.bars);
    setVal('vizSens', s.sens);
    setVal('vizSmooth', s.smooth);
    setCheck('vizGlow', s.glow);
    setCheck('vizReverse', s.reverse);
    applyVizSettings(s);
}

function updateVizSettings() {
    const get = (id) => document.getElementById(id);
    const s = {
        enabled: get('vizEnabled').checked,
        opacity: +get('vizOpacity').value,
        blur: +get('vizBlur').value,
        sat: +get('vizSat').value,
        height: +get('vizHeight').value,
        blend: get('vizBlend').value,
        pos: get('vizPos').value,
        theme: get('vizTheme').value,
        hue: +get('vizHue').value,
        style: get('vizStyle').value,
        bars: +get('vizBars').value,
        sens: +get('vizSens').value,
        smooth: +get('vizSmooth').value,
        glow: get('vizGlow').checked,
        reverse: get('vizReverse').checked
    };
    localStorage.setItem(VIZ_KEY, JSON.stringify(s));
    applyVizSettings(s);
}

function applyVizSettings(s) {
    _vizCurrentSettings = s;
    _vizSmoothBuffer = null;
    const canvas = document.getElementById('bgVisualizer');
    if (!canvas) return;
    const labels = {
        vizOpacityVal: s.opacity + '%',
        vizBlurVal: s.blur + 'px',
        vizSatVal: (s.sat / 100).toFixed(2),
        vizHeightVal: s.height + 'px',
        vizHueVal: s.hue + '°',
        vizBarsVal: s.bars,
        vizSensVal: (s.sens / 100).toFixed(2),
        vizSmoothVal: s.smooth + '%'
    };
    for (const id in labels) { const el = document.getElementById(id); if (el) el.textContent = labels[id]; }
    const customRow = document.getElementById('vizCustomHueRow');
    if (customRow) customRow.style.display = (s.theme === 'custom' || s.theme === 'mono') ? 'block' : 'none';

    if (!s.enabled) {
        canvas.style.display = 'none';
        return;
    }
    canvas.style.display = '';
    canvas.style.opacity = (s.opacity / 100).toString();
    canvas.style.filter = `blur(${s.blur}px) saturate(${s.sat / 100})`;
    canvas.style.mixBlendMode = s.blend;
    canvas.style.height = s.height + 'px';

    if (s.pos === 'top') {
        canvas.style.top = '0'; canvas.style.bottom = ''; canvas.style.transform = '';
        canvas.style.maskImage = 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0) 100%)';
    } else if (s.pos === 'bottom') {
        canvas.style.top = ''; canvas.style.bottom = '90px'; canvas.style.transform = '';
        canvas.style.maskImage = 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 65%, rgba(0,0,0,0) 100%)';
    } else if (s.pos === 'middle') {
        canvas.style.top = '50%'; canvas.style.bottom = ''; canvas.style.transform = 'translateY(-50%)';
        canvas.style.maskImage = 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,1) 50%, rgba(0,0,0,0) 100%)';
    } else if (s.pos === 'full') {
        canvas.style.top = '0'; canvas.style.bottom = '0'; canvas.style.transform = '';
        canvas.style.height = '100vh';
        canvas.style.maskImage = 'none';
    }
    canvas.style.webkitMaskImage = canvas.style.maskImage;

    if (typeof startVisualizerLoop === 'function') {
        cancelAnimationFrame(_vizRaf);
        startVisualizerLoop();
    }
}

function resetVizSettings() {
    localStorage.removeItem(VIZ_KEY);
    loadVizSettings();
    showToast('Reglages spectre reinitialises');
}

function getCurrentPlayingTrack() {
    if (playbackContext === 'flow' && typeof flowCurrentIdx !== 'undefined' && flowTracks && flowTracks[flowCurrentIdx]) {
        return { kind: 'flow', track: flowTracks[flowCurrentIdx] };
    }
    if (playbackContext === 'library' && typeof playlist !== 'undefined' && playlist && playlist[playIndex]) {
        return { kind: 'library', track: playlist[playIndex] };
    }
    if (playbackContext === 'history' && typeof historyCache !== 'undefined' && typeof currentStreamIdx !== 'undefined' && historyCache[currentStreamIdx]) {
        return { kind: 'history', track: historyCache[currentStreamIdx] };
    }
    if (playbackContext === 'search' && typeof lastSearchResults !== 'undefined' && typeof searchPlayIdx !== 'undefined' && lastSearchResults[searchPlayIdx]) {
        return { kind: 'search', track: lastSearchResults[searchPlayIdx] };
    }
    return null;
}

function playerSyncLikeBtn() {
    const btn = document.getElementById('btnPlayerLike');
    if (!btn) return;
    const cur = getCurrentPlayingTrack();
    if (!cur) { btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    btn.classList.remove('liked', 'add-to-flow', 'added');

    if (cur.kind === 'flow') {
        const liked = !!cur.track.liked;
        btn.classList.toggle('liked', liked);
        btn.innerHTML = liked ? '&#10084;' : '&#9825;';
        btn.title = liked ? 'Retirer des aimes' : 'Aimer ce titre';
        btn.dataset.action = 'flowLike';
    } else if (cur.kind === 'library') {
        const liked = !!cur.track.liked;
        btn.classList.toggle('liked', liked);
        btn.innerHTML = liked ? '&#10084;' : '&#9825;';
        btn.title = liked ? 'Retirer des aimes' : 'Aimer ce titre';
        btn.dataset.action = 'libLike';
    } else {
        const url = cur.track.url || '';
        const vid = (url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?&]+)/) || [])[1] || '';
        const inFlow = vid && flowTracks && flowTracks.some(t => t.url && t.url.includes(vid));
        if (inFlow) {
            btn.classList.add('added');
            btn.innerHTML = '&#10003;';
            btn.title = 'Deja dans Mon Flow';
            btn.dataset.action = 'noop';
        } else {
            btn.classList.add('add-to-flow');
            btn.innerHTML = '+';
            btn.title = 'Ajouter a Mon Flow';
            btn.dataset.action = 'addFlow';
        }
    }
}

async function playerToggleLike() {
    const btn = document.getElementById('btnPlayerLike');
    const cur = getCurrentPlayingTrack();
    if (!cur || !btn) return;
    const action = btn.dataset.action;

    if (action === 'flowLike') {
        await flowToggleLike(cur.track.id, null);
        const updated = flowTracks.find(t => t.id === cur.track.id);
        if (updated) {
            cur.track.liked = updated.liked;
            showToast(updated.liked ? 'Aime' : 'J\'aime plus');
        }
        playerSyncLikeBtn();
    } else if (action === 'libLike') {
        await libToggleLike(cur.track.id, null);
        const lib = (libraryData && libraryData.items) ? libraryData.items.find(i => i.id === cur.track.id) : null;
        if (lib) {
            cur.track.liked = lib.liked;
            showToast(lib.liked ? 'Aime' : 'J\'aime plus');
        }
        playerSyncLikeBtn();
    } else if (action === 'addFlow') {
        try {
            const t = cur.track;
            const data = await apiPost('api/flow', {
                action: 'add', url: t.url || '',
                title: t.title || '', channel: t.channel || '',
                thumbnail: t.thumbnail || '', duration: t.duration || '',
                type: 'audio', format: 'mp3'
            });
            if (data.success) {
                showToast(data.duplicate ? 'Deja dans Mon Flow' : 'Ajoute a Mon Flow');
                if (typeof loadFlow === 'function') await loadFlow();
                playerSyncLikeBtn();
            }
        } catch (e) { showToast('Erreur : ' + e.message); }
    }
}
const audioEl = document.getElementById('audioEl');
const audioElB = document.getElementById('audioElB');
const videoEl = document.getElementById('videoEl');

// ===== Crossfade : deux elements audio en bascule =====
let _activeAudio = audioEl;
function getActiveAudio() { return _activeAudio; }
function getInactiveAudio() { return _activeAudio === audioEl ? audioElB : audioEl; }
function setActiveAudio(el) { _activeAudio = el; }

const CROSSFADE_KEY = 'yt_crossfade_seconds';
const CROSSFADE_MAX = 8;
function getCrossfadeSeconds() {
    const v = parseInt(localStorage.getItem(CROSSFADE_KEY) || '0', 10);
    if (isNaN(v) || v < 0) return 0;
    return Math.min(CROSSFADE_MAX, v);
}
function setCrossfadeSeconds(n) {
    const v = Math.max(0, Math.min(CROSSFADE_MAX, parseInt(n, 10) || 0));
    localStorage.setItem(CROSSFADE_KEY, String(v));
    const lbl = document.getElementById('prefCrossfadeVal');
    if (lbl) lbl.textContent = v === 0 ? 'desactive' : (v + 's');
    const sli = document.getElementById('prefCrossfadeSlider');
    if (sli && parseInt(sli.value, 10) !== v) sli.value = String(v);
}

// Etat du crossfade en cours
let _xfState = null; // { fromEl, toEl, startVol, intervalId, nextIdx, nextTrack, finalize }
function isCrossfading() { return _xfState !== null; }
function cancelCrossfade(snap) {
    if (!_xfState) return;
    const xf = _xfState;
    clearInterval(xf.intervalId);
    if (snap === 'commit' && xf.finalize) {
        // Force la fin du crossfade : le toEl prend le relais a fond
        xf.finalize();
    } else {
        // Annulation : on garde le fromEl, on coupe le toEl
        try { xf.toEl.pause(); xf.toEl.src = ''; } catch (e) {}
        xf.fromEl.volume = xf.startVol;
        _xfState = null;
    }
}

// Bind les listeners essentiels sur les DEUX elements
function _bindAudioListenersOn(el) {
    el.addEventListener('error', () => {
        if (el !== getActiveAudio()) return;
        if (playbackContext === 'flow' && flowCurrentIdx >= 0) {
            console.warn('[Flow] Audio error, attempting retry...');
            _streamRetry();
        }
    });
    el.addEventListener('stalled', () => {
        if (el !== getActiveAudio()) return;
        if (playbackContext !== 'flow' || _streamRetrying) return;
        setTimeout(() => {
            if (el.paused || _streamRetrying) return;
            if (el.readyState < 3) {
                console.warn('[Flow] Stream stalled for too long, retrying...');
                _streamRetry();
            }
        }, 8000);
    });
    el.addEventListener('waiting', () => {
        if (el !== getActiveAudio()) return;
        if (playbackContext !== 'flow' || _streamRetrying) return;
        setTimeout(() => {
            if (el.paused || _streamRetrying) return;
            if (el.readyState < 3) {
                console.warn('[Flow] Buffering too long, retrying...');
                _streamRetry();
            }
        }, 15000);
    });
}
_bindAudioListenersOn(audioElB);

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
    const ae = getActiveAudio();
    const savedTime = ae.currentTime || 0;
    console.log('[Flow] Stream retry #' + _streamRetryCount + ' from ' + savedTime.toFixed(1) + 's');

    try {
        const t = flowTracks[flowCurrentIdx];
        if (!t || !t.url) { _streamRetrying = false; return; }
        const data = await apiCall('api/stream?url=' + encodeURIComponent(t.url) + '&type=' + (flowCurrentType || 'audio'));
        if (!data.success) { _streamRetrying = false; flowNext('audio'); return; }

        ae.src = data.streamUrl;
        ae.volume = document.getElementById('volumeSlider').value / 100;

        ae.addEventListener('loadedmetadata', function _seekAfterRetry() {
            ae.removeEventListener('loadedmetadata', _seekAfterRetry);
            if (savedTime > 0 && savedTime < ae.duration) {
                ae.currentTime = savedTime;
            }
            ae.play().catch(() => {});
            _streamRetrying = false;
        }, { once: true });

        // Fallback si loadedmetadata ne fire pas
        setTimeout(() => {
            if (_streamRetrying) {
                ae.play().catch(() => {});
                _streamRetrying = false;
            }
        }, 5000);
    } catch (e) {
        console.error('[Flow] Retry failed:', e);
        _streamRetrying = false;
        flowNext('audio');
    }
}

_bindAudioListenersOn(audioEl);

// --- Persistance du lecteur ---
function savePlayerState() {
    try {
        const _ae = getActiveAudio();
        // Sauvegarder aussi l'etat Mon Flow
        if (flowCurrentIdx >= 0 && flowTracks[flowCurrentIdx]) {
            const t = flowTracks[flowCurrentIdx];
            localStorage.setItem('flow_state', JSON.stringify({
                trackId: t.id,
                trackIdx: flowCurrentIdx,
                type: flowCurrentType || 'audio',
                currentTime: _ae.currentTime || 0,
                volume: _ae.volume,
                playing: !_ae.paused,
                shuffle: flowShuffle,
                playbackContext: 'flow'
            }));
            localStorage.removeItem('player_state');
            return;
        }
        localStorage.removeItem('flow_state');
        localStorage.setItem('player_state', JSON.stringify({
            playlist, playIndex, playMode, playbackContext,
            currentTime: _ae.currentTime || 0,
            volume: _ae.volume,
            playing: !_ae.paused
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
        if (typeof playerSyncModeButtons === 'function') playerSyncModeButtons();

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
        const data = await apiCall('api/flow?action=list');
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
    setPlayerSource('flow');

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
        const data = await apiCall('api/stream?url=' + encodeURIComponent(t.url) + '&type=' + flowCurrentType);
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

        // L'auto-next est gere globalement via _onAudioEnded
        audioEl.onended = null;

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
    setPlayerSource('library');

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

    // Library : on n'utilise jamais le crossfade -> assurer que audioEl est l'actif et nettoyer audioElB
    if (isCrossfading()) cancelCrossfade('cancel');
    try { audioElB.pause(); audioElB.src = ''; } catch (e) {}
    setActiveAudio(audioEl);

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
    if (isCrossfading()) cancelCrossfade('commit');
    const a = getActiveAudio();
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
    if (isCrossfading()) cancelCrossfade('commit');
    const aN = getActiveAudio();
    if (playMode === 'loopOne') {
        aN.currentTime = 0; aN.play(); return;
    }
    playIndex++;
    if (playIndex >= playlist.length) {
        if (playMode === 'loop' || playMode === 'shuffle') {
            playIndex = 0;
            if (playMode === 'shuffle') shufflePlaylist();
        } else {
            playIndex = playlist.length - 1;
            aN.pause();
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
    if (isCrossfading()) cancelCrossfade('commit');
    const aP = getActiveAudio();
    // If more than 3s in, restart current track
    if (aP.currentTime > 3) {
        aP.currentTime = 0; return;
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

function playerSyncModeButtons() {
    const map = { btnLoop: 'loop', btnLoopOne: 'loopOne', btnShuffle: 'shuffle' };
    for (const id in map) {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active-mode', playMode === map[id]);
    }
}

function playerSetMode(mode) {
    if (playMode === mode) {
        playMode = 'normal';
    } else {
        playMode = mode;
    }
    playerSyncModeButtons();
    // Sync flowShuffle si on est dans le contexte Mon Flow
    if (playbackContext === 'flow') {
        const wantShuffle = (playMode === 'shuffle');
        if (flowShuffle !== wantShuffle) {
            flowShuffle = wantShuffle;
            const fb = document.getElementById('flowShuffleBtn');
            if (fb) fb.classList.toggle('active', flowShuffle);
            flowPreloaded = null;
        }
    }
}

function playerSetVolume(val) {
    const v = val / 100;
    if (isCrossfading()) {
        // Pendant un crossfade, on conserve la proportion entre les 2 elements
        const xf = _xfState;
        const ratioFrom = xf.fromEl.volume / Math.max(0.0001, xf.startVol);
        const ratioTo = xf.toEl.volume / Math.max(0.0001, xf.startVol);
        xf.startVol = v;
        xf.fromEl.volume = Math.max(0, Math.min(1, v * ratioFrom));
        xf.toEl.volume = Math.max(0, Math.min(1, v * ratioTo));
    } else {
        getActiveAudio().volume = v;
    }
    videoEl.volume = v;
    savePlayerState();
}

function playerMute() {
    const slider = document.getElementById('volumeSlider');
    const a = getActiveAudio();
    if (a.volume > 0) {
        slider.dataset.prev = slider.value;
        slider.value = 0;
        playerSetVolume(0);
    } else {
        slider.value = slider.dataset.prev || 80;
        playerSetVolume(slider.value);
    }
}

function seekPlayer(e) {
    const a = getActiveAudio();
    if (!a.duration) return;
    if (isCrossfading()) cancelCrossfade('commit');
    const rect = e.target.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    a.currentTime = pct * a.duration;
    savePlayerState();
}

// ===== Raccourcis clavier =====
document.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const playerActive = document.getElementById('playerBar').classList.contains('active');
    if (!playerActive && e.key !== '?') return;

    let handled = true;
    switch (e.key) {
        case ' ':
        case 'k':
            playerToggle(); break;
        case 'ArrowRight': {
            const a = getActiveAudio();
            if (a.duration) { if (isCrossfading()) cancelCrossfade('commit'); a.currentTime = Math.min(a.duration, a.currentTime + 10); savePlayerState(); showShortcutHint('+10s'); }
            break;
        }
        case 'ArrowLeft': {
            const a = getActiveAudio();
            if (a.duration) { if (isCrossfading()) cancelCrossfade('commit'); a.currentTime = Math.max(0, a.currentTime - 10); savePlayerState(); showShortcutHint('-10s'); }
            break;
        }
        case 'ArrowUp': {
            const slider = document.getElementById('volumeSlider');
            const v = Math.min(100, parseInt(slider.value, 10) + 5);
            slider.value = v; playerSetVolume(v); showShortcutHint('Volume ' + v + '%');
            break;
        }
        case 'ArrowDown': {
            const slider = document.getElementById('volumeSlider');
            const v = Math.max(0, parseInt(slider.value, 10) - 5);
            slider.value = v; playerSetVolume(v); showShortcutHint('Volume ' + v + '%');
            break;
        }
        case 'm':
            playerMute(); showShortcutHint('Mute'); break;
        case 'n':
            playerNext(); showShortcutHint('Suivant'); break;
        case 'p':
            playerPrev(); showShortcutHint('Precedent'); break;
        case 'f':
        case 'F':
            playerToggleLike(); break;
        case 's':
            playerSetMode('shuffle'); showShortcutHint('Aleatoire'); break;
        case 'l':
            playerSetMode('loop'); showShortcutHint('Boucle'); break;
        case '?':
            showShortcutsHelp(); break;
        default:
            handled = false;
    }
    if (handled) e.preventDefault();
});

let _shortcutHintTimer = null;
function showShortcutHint(text) {
    let el = document.getElementById('shortcutHint');
    if (!el) {
        el = document.createElement('div');
        el.id = 'shortcutHint';
        el.style.cssText = 'position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:8px 18px;border-radius:20px;font-size:13px;font-weight:600;z-index:9999;pointer-events:none;transition:opacity 0.3s;';
        document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    clearTimeout(_shortcutHintTimer);
    _shortcutHintTimer = setTimeout(() => { el.style.opacity = '0'; }, 1000);
}

// ===== Sleep timer =====
let sleepTimerEnd = 0;
let sleepTimerInterval = null;
let sleepTimerEndOfTrack = false;

function showSleepTimer() {
    if (sleepTimerEnd || sleepTimerEndOfTrack) {
        const remaining = sleepTimerEnd ? Format.duration(sleepTimerEnd - Date.now()) : 'fin du titre en cours';
        Modal.confirm({
            title: 'Sleep timer actif',
            message: `Lecture stoppera dans <b>${remaining}</b>.<br><br>Annuler le timer ?`,
            confirmText: 'Annuler le timer',
            cancelText: 'Garder',
            danger: true
        }).then(ok => { if (ok) cancelSleepTimer(); });
        return;
    }
    Modal.custom({
        title: 'Sleep timer',
        width: 380,
        html: `
            <p style="color:var(--text-muted);font-size:12px;margin-bottom:14px;">Stoppe la lecture apres un delai (fade-out 5s a la fin).</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:12px;">
                <button class="sleep-preset" data-min="5">5 min</button>
                <button class="sleep-preset" data-min="15">15 min</button>
                <button class="sleep-preset" data-min="30">30 min</button>
                <button class="sleep-preset" data-min="45">45 min</button>
                <button class="sleep-preset" data-min="60">1 h</button>
                <button class="sleep-preset" data-min="90">1 h 30</button>
            </div>
            <div style="display:flex;gap:6px;align-items:center;margin-bottom:12px;">
                <input type="number" id="sleepCustom" min="1" max="600" placeholder="Custom (min)" style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-size:13px;">
                <button class="sleep-preset" data-act="custom">OK</button>
            </div>
            <button class="sleep-preset" data-act="endoftrack" style="width:100%;background:var(--bg-hover);">&#9836; Stopper a la fin du titre en cours</button>
            <div class="modal-btns" style="margin-top:14px;">
                <button class="btn-cancel" data-act="cancel">Annuler</button>
            </div>
        `,
        onMount: (root, close) => {
            root.querySelectorAll('[data-min]').forEach(b => {
                b.onclick = () => { startSleepTimer(parseInt(b.dataset.min, 10)); close(); };
            });
            root.querySelector('[data-act="custom"]').onclick = () => {
                const v = parseInt(root.querySelector('#sleepCustom').value, 10);
                if (v > 0 && v <= 600) { startSleepTimer(v); close(); }
            };
            root.querySelector('[data-act="endoftrack"]').onclick = () => {
                startSleepEndOfTrack(); close();
            };
            root.querySelector('[data-act="cancel"]').onclick = close;
        }
    });
}

function startSleepTimer(minutes) {
    cancelSleepTimer();
    sleepTimerEnd = Date.now() + minutes * 60000;
    sleepTimerInterval = setInterval(updateSleepBadge, 1000);
    updateSleepBadge();
    showToast(`Sleep timer : ${minutes} min`);
}

function startSleepEndOfTrack() {
    cancelSleepTimer();
    sleepTimerEndOfTrack = true;
    const audio = audioEl;
    const onceEnded = () => {
        cancelSleepTimer();
        audio.removeEventListener('ended', onceEnded);
    };
    audio.addEventListener('ended', onceEnded);
    const btn = document.getElementById('btnSleepTimer');
    const badge = document.getElementById('sleepTimerBadge');
    btn.classList.add('active');
    badge.style.display = 'inline';
    badge.textContent = ' fin';
    showToast('Sleep timer : fin du titre en cours');
}

function cancelSleepTimer() {
    sleepTimerEnd = 0;
    sleepTimerEndOfTrack = false;
    if (sleepTimerInterval) { clearInterval(sleepTimerInterval); sleepTimerInterval = null; }
    const btn = document.getElementById('btnSleepTimer');
    const badge = document.getElementById('sleepTimerBadge');
    if (btn) btn.classList.remove('active');
    if (badge) { badge.style.display = 'none'; badge.textContent = ''; }
}

function updateSleepBadge() {
    const remaining = sleepTimerEnd - Date.now();
    const btn = document.getElementById('btnSleepTimer');
    const badge = document.getElementById('sleepTimerBadge');
    if (!btn || !badge) return;
    if (remaining <= 0) {
        cancelSleepTimer();
        sleepFadeOutAndStop();
        return;
    }
    btn.classList.add('active');
    badge.style.display = 'inline';
    const totalSec = Math.ceil(remaining / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    badge.textContent = ' ' + (m > 0 ? `${m}:${String(s).padStart(2,'0')}` : `${s}s`);
}

function sleepFadeOutAndStop() {
    if (isCrossfading()) cancelCrossfade('cancel');
    const a = getActiveAudio();
    if (!a || a.paused) return;
    const startVol = a.volume;
    const steps = 20, duration = 5000;
    let i = 0;
    const fade = setInterval(() => {
        i++;
        a.volume = startVol * (1 - i / steps);
        if (i >= steps) {
            clearInterval(fade);
            a.pause();
            a.volume = startVol;
            showToast('Sleep timer atteint - lecture stoppee');
        }
    }, duration / steps);
}

function showShortcutsHelp() {
    Modal.custom({
        title: 'Raccourcis clavier',
        width: 380,
        html: `
            <div style="display:grid;grid-template-columns:auto 1fr;gap:8px 14px;font-size:13px;align-items:center;">
                <kbd>Espace</kbd><span>Lecture / Pause</span>
                <kbd>K</kbd><span>Lecture / Pause (alternative)</span>
                <kbd>&larr; / &rarr;</kbd><span>Reculer / Avancer 10s</span>
                <kbd>&uarr; / &darr;</kbd><span>Volume + / -</span>
                <kbd>M</kbd><span>Couper le son</span>
                <kbd>N / P</kbd><span>Suivant / Precedent</span>
                <kbd>F</kbd><span>Aimer / Retirer (ou ajout Mon Flow)</span>
                <kbd>S</kbd><span>Aleatoire</span>
                <kbd>L</kbd><span>Boucle</span>
                <kbd>?</kbd><span>Afficher cette aide</span>
            </div>
            <div class="modal-btns" style="margin-top:18px;">
                <button class="btn-cancel" data-act="cancel">Fermer</button>
            </div>
        `,
        onMount: (root, close) => {
            root.querySelector('[data-act="cancel"]').onclick = close;
        }
    });
}

function playerClose() {
    if (isCrossfading()) cancelCrossfade('cancel');
    audioEl.pause(); audioEl.src = ''; audioEl.onended = null;
    audioElB.pause(); audioElB.src = ''; audioElB.onended = null;
    setActiveAudio(audioEl);
    document.getElementById('playerBar').classList.remove('active');
    document.body.classList.remove('player-open');
    document.getElementById('playerQueue').style.display = 'none';
    playlist = [];
    flowCurrentIdx = -1;
    flowPreloaded = null;
    setPlayerSource('library');
    document.querySelectorAll('.flow-track').forEach(el => el.classList.remove('fl-playing'));
    localStorage.removeItem('player_state');
    localStorage.removeItem('flow_state');
}

function togglePlayerQueue() {
    const panel = document.getElementById('playerQueue');
    const btn = document.querySelector('.player-queue-btn:not(#btnPlayerLyrics)');
    if (panel.style.display === 'none') {
        // Fermer le panneau Paroles s'il est ouvert
        const lp = document.getElementById('lyricsPanel');
        if (lp && lp.style.display !== 'none') {
            lp.style.display = 'none';
            const lbtn = document.getElementById('btnPlayerLyrics');
            if (lbtn) lbtn.classList.remove('active');
        }
        panel.style.display = 'flex';
        if (btn) btn.classList.add('active');
        renderPlayerQueue();
    } else {
        panel.style.display = 'none';
        if (btn) btn.classList.remove('active');
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
function _onActiveTimeUpdate(ev) {
    const el = ev.target;
    if (el !== getActiveAudio()) return;
    if (!el.duration) return;
    const pct = (el.currentTime / el.duration) * 100;
    document.getElementById('playerSeekFill').style.width = pct + '%';
    document.getElementById('playerTime').textContent = formatTime(el.currentTime) + ' / ' + formatTime(el.duration);
    // Sauvegarder la position toutes les 3 secondes
    const now = Date.now();
    if (now - _lastPlayerSave > 3000) { _lastPlayerSave = now; savePlayerState(); }
    // Declencher le crossfade si on s'approche de la fin
    maybeStartCrossfade(el);
}
function _onAudioEnded(ev) {
    if (ev.target !== getActiveAudio()) return;
    if (isCrossfading()) return; // le crossfade gere lui-meme la transition
    playerNext();
}
audioEl.addEventListener('timeupdate', _onActiveTimeUpdate);
audioElB.addEventListener('timeupdate', _onActiveTimeUpdate);
audioEl.addEventListener('ended', _onAudioEnded);
audioElB.addEventListener('ended', _onAudioEnded);

// Video ended -> next
videoEl.addEventListener('ended', () => {
    closeVideoPlayer();
    playerNext();
});

// ========== PROFILE ==========
// var (et non let) pour exposer sur window -> helpers.js peut injecter
// automatiquement profile=<currentUser.id> sur les appels api/flow et api/library.
var currentUser = null;

function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
}

async function loadProfilesList() {
    const data = await apiCall('api/profile?action=list');
    const container = document.getElementById('profilesList');
    if (!data.success || data.profiles.length === 0) {
        container.innerHTML = '<p style="color:#555; font-size:13px;">Aucun profil pour le moment.</p>';
        return;
    }
    container.innerHTML = data.profiles.map(p => {
        const initial = p.username.charAt(0).toUpperCase();
        const safeName = p.username.replace(/'/g, "\\'");
        return '<div class="profile-option">'
            + '<div class="po-clickzone" onclick="selectProfile(\'' + safeName + '\')">'
            + '<div class="po-avatar">' + initial + '</div>'
            + '<div class="po-info">'
            + '<div class="po-name">' + escapeHtml(p.username) + '</div>'
            + '<div class="po-meta">' + (p.download_count || 0) + ' telechargements</div>'
            + '</div>'
            + '</div>'
            + '<button class="po-delete" onclick="event.stopPropagation(); deleteProfile(\'' + safeName + '\')" title="Supprimer ce profil">&times;</button>'
            + '</div>';
    }).join('');
}

async function deleteProfile(username) {
    if (!confirm('Supprimer le profil "' + username + '" ?\n\nCela effacera aussi toutes ses pistes Mon Flow, ses playlists, sa corbeille et ses statistiques d\'ecoute.\n\nLes fichiers telecharges sur le disque ne sont PAS effaces.\n\nCette action est irreversible.')) return;
    try {
        const data = await apiPost('api/profile', { action: 'delete', username });
        if (!data.success) { alert('Erreur : ' + (data.error || 'inconnue')); return; }
        const summary = 'Profil supprime.\n\n'
            + 'Mon Flow : ' + data.flowTracks + ' pistes, ' + data.flowPlaylists + ' playlists, ' + data.flowTrash + ' corbeille\n'
            + 'Stats : ' + data.statsDeleted + ' evenements supprimes';
        alert(summary);
        // Si on a supprime son propre profil, deconnecter
        if (currentUser && currentUser.id === data.profileId) {
            currentUser = null; window.currentUser = null;
            document.cookie = 'yt_user=;max-age=0;path=/';
            localStorage.removeItem('yt_user');
            location.reload();
            return;
        }
        loadProfilesList();
    } catch (e) {
        alert('Erreur reseau : ' + e.message);
    }
}

async function selectProfile(username) {
    const data = await apiCall('api/profile?action=load&username=' + encodeURIComponent(username));
    if (data.success) {
        currentUser = data.profile;
        document.cookie = 'yt_user=' + encodeURIComponent(username) + ';max-age=' + (86400*3650) + ';path=/';
        localStorage.setItem('yt_user', username);
        showProfile();
        applyPrefs();
        if (typeof loadFlow === 'function') { try { await loadFlow(); } catch (e) {} }
    }
}

async function loginUser() {
    const name = document.getElementById('loginName').value.trim();
    if (!name) return;

    const data = await apiPost('api/profile', { action: 'save', username: name });
    if (data.success) {
        currentUser = data.profile;
        document.cookie = 'yt_user=' + encodeURIComponent(name) + ';max-age=' + (86400*3650) + ';path=/';
        localStorage.setItem('yt_user', name);
        showProfile();
        applyPrefs();
        if (typeof loadFlow === 'function') { try { await loadFlow(); } catch (e) {} }
    }
}

async function loadProfile(username) {
    const data = await apiCall('api/profile?action=load&username=' + encodeURIComponent(username));
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
    const prefSearchSel = document.getElementById('prefSearchHistoryLimit');
    if (prefSearchSel) prefSearchSel.value = String(getSearchHistoryDisplayLimit());
    const xfSec = getCrossfadeSeconds();
    const xfSli = document.getElementById('prefCrossfadeSlider');
    const xfLbl = document.getElementById('prefCrossfadeVal');
    if (xfSli) xfSli.value = String(xfSec);
    if (xfLbl) xfLbl.textContent = xfSec === 0 ? 'desactive' : (xfSec + 's');
    const fnotif = document.getElementById('prefFlowNotif');
    if (fnotif) fnotif.checked = (localStorage.getItem('yt_flow_notif_on') === '1');
    const lyrAuto = document.getElementById('prefLyricsAuto');
    if (lyrAuto) lyrAuto.checked = (localStorage.getItem('yt_lyrics_auto') === '1');

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
    apiPost('api/stats?action=record', {
        kind: 'stream', source: 'audio',
        title: r.title || '', channel: r.channel || '',
        url: r.url, format: 'stream'
    }).catch(() => {});
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
    const esc = escapeHtml;
    const fmtDate = (ts) => {
        const d = Format.dateEU(ts), t = Format.timeEU(ts);
        return d && t ? `${d} a ${t}` : '';
    };
    const vidFromUrl = (u) => { const m = (u || '').match(/[?&]v=([^&]+)|youtu\.be\/([^?&]+)/); return m ? (m[1] || m[2]) : ''; };

    list.innerHTML = items.map((it, i) => {
        const vid = vidFromUrl(it.url);
        const thumb = vid ? `https://i.ytimg.com/vi/${vid}/mqdefault.jpg` : '';
        const safeTitle = esc(it.title || '(sans titre)');
        const safeArtist = it.artist ? esc(it.artist) : '';
        return `<div class="ephem-row">
            <div class="ephem-thumb" style="cursor:pointer" onclick="ephemPlay(${i})" title="Ecouter">${thumb ? `<img src="${esc(thumb)}" alt="" onerror="this.style.display='none'">` : '&#9654;'}</div>
            <div class="ephem-info">
                <div class="ephem-title" title="${safeTitle}">${safeTitle}</div>
                <div class="ephem-meta">${safeArtist ? safeArtist + ' &middot; ' : ''}<strong>${it.count}</strong> ecoute${it.count > 1 ? 's' : ''} &middot; dernier ${fmtDate(it.lastTs)}</div>
            </div>
            <div class="ephem-actions">
                <button onclick="ephemPlay(${i})" title="Ecouter en streaming" class="ephem-btn ephem-btn-play">&#9654;</button>
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
        await apiPost('api/stats?action=forget_ephemeral', { urls: JSON.stringify(ephemeralCache.map(it => it.url)) }).catch(() => {});
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

function ephemPlay(idx) {
    const sorted = currentFilteredEphemeral();
    const it = sorted[idx];
    if (!it || !it.url) return;
    // Injecter en tete de lastSearchResults pour pouvoir reutiliser searchPlayAudio
    if (!Array.isArray(lastSearchResults)) lastSearchResults = [];
    lastSearchResults = [{
        title: it.title || '',
        channel: it.artist || '',
        url: it.url,
        thumbnail: ''
    }];
    if (typeof searchPlayAudio === 'function') {
        searchPlayAudio(0);
    }
}

async function ephemForget(idx) {
    const sorted = currentFilteredEphemeral();
    const it = sorted[idx];
    if (!it) return;
    try {
        const data = await apiPost('api/stats?action=forget_ephemeral', { urls: JSON.stringify([it.url]) });
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
        const data = await apiPost('api/flow', {
            action: 'add', url: it.url || '', title: it.title || '',
            channel: it.artist || '', type: 'audio', format: 'mp3'
        });
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

const statsApiCall = apiCall;

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

const fmtBytes = Format.bytes;

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
        const esc = escapeHtml;
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

        const [data, topData] = await Promise.all([
            apiCall('api/stats?' + params.toString()),
            apiCall('api/stats?' + new URLSearchParams({ action: 'top_artists', view: statsState.view, year: statsState.year || 0, month: statsState.month || 0 }).toString())
        ]);
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
        const data = await apiCall('api/stats?' + params.toString());
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
        const esc = escapeHtml;
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
        const safe = escapeHtml(name);
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

    const data = await apiPost('api/profile', {
        action: 'save', username: currentUser.username,
        pref_type: document.querySelector('input[name="prefType"]:checked').value,
        pref_format_audio: document.getElementById('prefFormatAudio').value,
        pref_format_video: document.getElementById('prefFormatVideo').value,
        pref_quality_audio: document.getElementById('prefQualityAudio').value,
        pref_quality_video: document.getElementById('prefQualityVideo').value,
        pref_cover: document.getElementById('prefCover').checked ? '1' : '0'
    });
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
    await apiPost('api/profile', { action: 'logout' });
    loadProfilesList();
}

// Incrementer le compteur apres un telechargement reussi
async function incrementDownloadCount() {
    if (!currentUser) return;
    currentUser.download_count = (currentUser.download_count || 0) + 1;
    await apiPost('api/profile', { action: 'increment', username: currentUser.username });
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
        const data = await apiCall('api/search?q=' + encodeURIComponent(query) + '&max=' + max);

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
            + '<span style="margin-left:8px;font-size:12px;color:var(--text-muted);">&middot; Duree :</span>'
            + '<select id="durationFilter" onchange="filterSearchResults(document.querySelector(\'.sfb-chip.active\').dataset.filter)" class="sort-select" style="padding:5px 10px;font-size:12px;">'
            + '<option value="all">Toutes</option>'
            + '<option value="short">< 5 min</option>'
            + '<option value="medium">5-10 min</option>'
            + '<option value="long">10-30 min</option>'
            + '<option value="xlong">&gt; 30 min</option>'
            + '</select>'
            + '</div>';
        container.innerHTML = bar + '<div class="items-grid" id="searchGrid">' + data.results.map((r, i) => {
            var videoId = r.url.match(/[?&]v=([\w-]+)/);
            videoId = videoId ? videoId[1] : '';
            var safeTitle = r.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            var thumbHtml = r.thumbnail
                ? '<img src="' + r.thumbnail + '" alt="" onclick="previewYouTube(\'' + videoId + '\', \'' + safeTitle + '\')" style="cursor:pointer">'
                : '<div class="no-thumb">&#9654;</div>';
            const durSec = Format.parseClock(r.duration);
            return '<div class="item-card" data-duration="' + durSec + '">'
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
        renderSearchSuggestions(query);
        rememberSearchQuery(query);
    } catch (err) {
        container.innerHTML = '<div class="search-loading">Erreur de recherche.</div>';
    }
}

const SEARCH_HISTORY_KEY = 'yt_search_history';
const SEARCH_HISTORY_MAX = 100;
const SEARCH_HISTORY_DISPLAY_KEY = 'yt_search_history_display';
const SEARCH_HISTORY_DISPLAY_DEFAULT = 20;
const SEARCH_HISTORY_DISPLAY_OPTIONS = [10, 20, 50, 100];

function getSearchHistoryDisplayLimit() {
    const raw = parseInt(localStorage.getItem(SEARCH_HISTORY_DISPLAY_KEY), 10);
    return SEARCH_HISTORY_DISPLAY_OPTIONS.includes(raw) ? raw : SEARCH_HISTORY_DISPLAY_DEFAULT;
}

function setSearchHistoryDisplayLimit(n) {
    const v = parseInt(n, 10);
    if (!SEARCH_HISTORY_DISPLAY_OPTIONS.includes(v)) return;
    localStorage.setItem(SEARCH_HISTORY_DISPLAY_KEY, String(v));
    const profSel = document.getElementById('prefSearchHistoryLimit');
    if (profSel && parseInt(profSel.value, 10) !== v) profSel.value = String(v);
    const inSel = document.getElementById('shbDisplayLimit');
    if (inSel && parseInt(inSel.value, 10) !== v) inSel.value = String(v);
    renderInitialSearchHistory();
}

function rememberSearchQuery(q) {
    if (!q) return;
    try {
        const list = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
        const norm = q.toLowerCase().trim();
        const filtered = list.filter(x => (x || '').toLowerCase() !== norm);
        filtered.unshift(q);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filtered.slice(0, SEARCH_HISTORY_MAX)));
    } catch (e) {}
}

function getSearchHistory() {
    try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]'); }
    catch (e) { return []; }
}

function removeSearchHistoryItem(q) {
    try {
        const list = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || '[]');
        const filtered = list.filter(x => x !== q);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(filtered));
    } catch (e) {}
    renderInitialSearchHistory();
}

function clearSearchHistory() {
    if (!confirm('Effacer toutes les recherches recentes ?')) return;
    localStorage.removeItem(SEARCH_HISTORY_KEY);
    renderInitialSearchHistory();
}

function renderInitialSearchHistory() {
    const container = document.getElementById('searchResults');
    if (!container) return;
    const input = document.getElementById('searchInput');
    if (input && input.value.trim()) return;

    const sugg = document.getElementById('searchSuggestions');
    if (sugg) sugg.style.display = 'none';

    const fullHistory = getSearchHistory();
    if (!fullHistory.length) {
        container.innerHTML = '<div class="search-history-empty">'
            + '<div class="she-icon">&#128269;</div>'
            + '<div class="she-title">Aucune recherche recente</div>'
            + '<div class="she-sub">Tape un mot-cle ci-dessus pour commencer.</div>'
            + '</div>'
            + '<div id="searchInitialEphemPlaceholder"></div>';
        loadSearchEphem();
        return;
    }

    const limit = getSearchHistoryDisplayLimit();
    const history = fullHistory.slice(0, limit);
    const optsHtml = SEARCH_HISTORY_DISPLAY_OPTIONS
        .map(n => '<option value="' + n + '"' + (n === limit ? ' selected' : '') + '>' + n + '</option>')
        .join('');
    const countLabel = fullHistory.length > limit
        ? history.length + ' / ' + fullHistory.length
        : String(fullHistory.length);

    container.innerHTML = '<div class="search-history-block">'
        + '<div class="shb-header">'
        + '<span class="shb-title"><span class="shb-header-icon">&#128336;</span> Recherches recentes <span class="shb-count">' + countLabel + '</span></span>'
        + '<div class="shb-header-actions">'
        + '<label class="shb-limit-label">Afficher <select id="shbDisplayLimit" class="shb-limit-select" onchange="setSearchHistoryDisplayLimit(this.value)">' + optsHtml + '</select></label>'
        + '<button class="shb-clear" onclick="clearSearchHistory()" title="Tout effacer">&#10005; Tout effacer</button>'
        + '</div>'
        + '</div>'
        + '<div class="shb-list">'
        + history.map(q => {
            const safe = escapeHtml(q);
            const safeAttr = Dom.attr(q);
            const safeJs = Dom.jsStr(q);
            return '<div class="shb-item">'
                + '<button class="shb-item-main" onclick="suggestSearch(\'' + safeJs + '\')" title="' + safeAttr + '">'
                + '<span class="shb-icon">&#128269;</span>'
                + '<span class="shb-label">' + safe + '</span>'
                + '<span class="shb-arrow">&rarr;</span>'
                + '</button>'
                + '<button class="shb-item-remove" onclick="removeSearchHistoryItem(\'' + safeJs + '\')" title="Retirer de l\'historique">&times;</button>'
                + '</div>';
        }).join('')
        + '</div></div>'
        + '<div id="searchInitialEphemPlaceholder"></div>';
    loadSearchEphem();
}

// === Ecoutes ephemeres affichees dans l'onglet Recherche ===
let searchEphemCache = [];

async function loadSearchEphem() {
    const ph = document.getElementById('searchInitialEphemPlaceholder');
    if (!ph) return;
    try {
        const data = await statsApiCall('api/stats?action=ephemeral');
        if (!data || !data.success || !Array.isArray(data.items) || !data.items.length) {
            searchEphemCache = [];
            ph.innerHTML = '<div class="search-history-block" style="margin-top:14px;">'
                + '<div class="shb-header">'
                + '<span class="shb-title"><span class="shb-header-icon">&#127911;</span> Ecoutes ephemeres <span class="shb-count">0</span></span>'
                + '</div>'
                + '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">'
                + 'Aucune ecoute pour le moment. Lance un titre via le bouton <strong style="color:#FF6D00;">&#127911; Ecouter</strong> sur un resultat de recherche '
                + 'qui n\'est ni dans ta bibliotheque ni dans Mon Flow, et il apparaitra ici.'
                + '</div>'
                + '</div>';
            return;
        }
        searchEphemCache = [...data.items].sort((a, b) => (b.lastTs || '').localeCompare(a.lastTs || ''));
        renderSearchEphem();
    } catch (e) {
        ph.innerHTML = '';
    }
}

function renderSearchEphem() {
    const ph = document.getElementById('searchInitialEphemPlaceholder');
    if (!ph) return;
    if (!searchEphemCache.length) { ph.innerHTML = ''; return; }
    const vidFromUrl = (u) => { const m = (u || '').match(/[?&]v=([^&]+)|youtu\.be\/([^?&]+)/); return m ? (m[1] || m[2]) : ''; };
    const items = searchEphemCache.slice(0, 12);
    ph.innerHTML = '<div class="search-history-block" style="margin-top:14px;">'
        + '<div class="shb-header">'
        + '<span class="shb-title"><span class="shb-header-icon">&#127911;</span> Ecoutes ephemeres <span class="shb-count">' + searchEphemCache.length + '</span></span>'
        + '<div class="shb-header-actions">'
        + '<button class="shb-clear" onclick="setStatsSubtab(\'ephemeral\'); switchTab(\'stats\');" title="Voir tout dans Stats">Voir tout</button>'
        + '</div>'
        + '</div>'
        + '<div style="font-size:11px;color:var(--text-muted);margin:-4px 0 10px;">Titres ecoutes en streaming, jamais ajoutes a Mon Flow ni telecharges.</div>'
        + items.map((it, i) => {
            const vid = vidFromUrl(it.url);
            const thumb = vid ? 'https://i.ytimg.com/vi/' + vid + '/mqdefault.jpg' : '';
            const safeTitle = escapeHtml(it.title || '(sans titre)');
            const safeArtist = escapeHtml(it.artist || '');
            return '<div class="ephem-row">'
                + '<div class="ephem-thumb">' + (thumb ? '<img src="' + thumb + '" alt="" onerror="this.style.display=\'none\'">' : '&#127925;') + '</div>'
                + '<div class="ephem-info">'
                + '<div class="ephem-title" title="' + safeTitle + '">' + safeTitle + '</div>'
                + '<div class="ephem-meta">' + (safeArtist ? safeArtist + ' &middot; ' : '') + '<strong>' + it.count + '</strong> ecoute' + (it.count > 1 ? 's' : '') + '</div>'
                + '</div>'
                + '<div class="ephem-actions">'
                + '<button onclick="searchEphemPlay(' + i + ')" title="Re-ecouter" class="ephem-btn" style="background:var(--primary);color:#fff;">&#9654;</button>'
                + '<button onclick="searchEphemAddToFlow(' + i + ')" title="Ajouter a Mon Flow" class="ephem-btn ephem-btn-flow">+ Flow</button>'
                + '<button onclick="searchEphemDownload(' + i + ')" title="Telecharger" class="ephem-btn ephem-btn-dl">DL</button>'
                + '<button onclick="searchEphemForget(' + i + ')" title="Oublier ce titre" class="ephem-btn ephem-btn-forget">&times;</button>'
                + '</div>'
                + '</div>';
        }).join('')
        + '</div>';
}

function searchEphemPlay(idx) {
    const it = searchEphemCache[idx];
    if (!it || !it.url) return;
    if (!Array.isArray(lastSearchResults)) lastSearchResults = [];
    lastSearchResults = [{
        title: it.title || '',
        channel: it.artist || '',
        url: it.url,
        thumbnail: ''
    }];
    searchPlayAudio(0);
}

async function searchEphemAddToFlow(idx) {
    const it = searchEphemCache[idx];
    if (!it || !it.url) return;
    try {
        const data = await apiPost('api/flow', {
            action: 'add', url: it.url, title: it.title || '',
            channel: it.artist || '', type: 'audio', format: 'mp3'
        });
        if (data.success) {
            showToast(data.duplicate ? 'Deja dans Mon Flow' : 'Ajoute a Mon Flow');
            // Une fois ajoute, le titre sort de la liste ephemere
            loadSearchEphem();
        }
    } catch (e) { alert('Erreur : ' + e.message); }
}

function searchEphemDownload(idx) {
    const it = searchEphemCache[idx];
    if (!it || !it.url) return;
    document.getElementById('url').value = it.url;
    switchTab('download');
    showToast('URL collee dans Telecharger');
}

async function searchEphemForget(idx) {
    const it = searchEphemCache[idx];
    if (!it) return;
    try {
        const data = await apiPost('api/stats?action=forget_ephemeral', { urls: JSON.stringify([it.url]) });
        if (data && data.success) {
            searchEphemCache.splice(idx, 1);
            renderSearchEphem();
            showToast('Titre oublie');
        }
    } catch (e) { alert('Erreur : ' + e.message); }
}

function suggestionVariants(q) {
    const variants = [
        { label: 'best of ' + q, suffix: 'best of', meta: 'compilation' },
        { label: q + ' live', suffix: 'live', meta: 'concert' },
        { label: q + ' feat', suffix: 'feat', meta: 'collabos' },
        { label: q + ' 2024', suffix: '2024', meta: 'recent' },
        { label: q + ' remix', suffix: 'remix', meta: 'remixes' },
        { label: q + ' acoustic', suffix: 'acoustic', meta: 'version intime' }
    ];
    return variants.map(v => ({
        query: v.suffix.startsWith('best') ? `best of ${q}` : `${q} ${v.suffix}`,
        label: v.label,
        meta: v.meta
    }));
}

function renderSearchSuggestions(query) {
    const panel = document.getElementById('searchSuggestions');
    if (!panel) return;
    const q = (query || '').trim();
    if (!q) { panel.style.display = 'none'; return; }

    const variants = suggestionVariants(q);
    const recents = getSearchHistory().filter(x => (x || '').toLowerCase() !== q.toLowerCase()).slice(0, 6);
    const flowMatches = (typeof flowTracks !== 'undefined' && flowTracks)
        ? [...new Set(flowTracks
            .map(t => {
                const title = (t.title || '').trim();
                const dash = title.search(/\s[-–—]\s/);
                return dash > 0 ? title.substring(0, dash).trim() : (t.channel || '');
            })
            .filter(a => a && a.toLowerCase().includes(q.toLowerCase()) && a.toLowerCase() !== q.toLowerCase())
          )].slice(0, 5)
        : [];

    const renderItem = (label, meta, query) =>
        `<button class="ssp-item" onclick="suggestSearch('${Dom.jsStr(query)}')" title="${Dom.attr(query)}">
            <span>${escapeHtml(label)}</span>
            ${meta ? `<span class="ssp-meta">(${escapeHtml(meta)})</span>` : ''}
            <span class="ssp-arrow">&rarr;</span>
        </button>`;

    let html = `
        <div class="ssp-section">
            <div class="ssp-title"><span class="ssp-icon">&#128269;</span> Recherches liees</div>
            <div class="ssp-list">${variants.map(v => renderItem(v.label, v.meta, v.query)).join('')}</div>
        </div>`;

    if (flowMatches.length) {
        html += `
        <div class="ssp-section">
            <div class="ssp-title"><span class="ssp-icon">&#127925;</span> Dans ton Mon Flow</div>
            <div class="ssp-list">${flowMatches.map(a => renderItem(a, 'artiste connu', a)).join('')}</div>
        </div>`;
    }

    if (recents.length) {
        html += `
        <div class="ssp-section">
            <div class="ssp-title"><span class="ssp-icon">&#128336;</span> Tes recherches recentes</div>
            <div class="ssp-list">${recents.map(r => renderItem(r, '', r)).join('')}</div>
        </div>`;
    }

    panel.innerHTML = html;
    panel.style.display = '';
}

function suggestSearch(q) {
    const input = document.getElementById('searchInput');
    if (input) input.value = q;
    searchPage = 1;
    searchYouTube();
}

function useSearchResult(url) {
    document.getElementById('url').value = url;
    switchTab('download');
}

document.getElementById('searchInput').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); searchYouTube(); }
});

document.getElementById('searchInput').addEventListener('input', function(e) {
    if (!e.target.value.trim()) {
        searchQuery = '';
        lastSearchResults = [];
        renderInitialSearchHistory();
    }
});

(function syncSearchHistoryLimitUI() {
    const v = String(getSearchHistoryDisplayLimit());
    const profSel = document.getElementById('prefSearchHistoryLimit');
    if (profSel) profSel.value = v;
})();
(function syncCrossfadeUI() {
    const v = getCrossfadeSeconds();
    const sli = document.getElementById('prefCrossfadeSlider');
    const lbl = document.getElementById('prefCrossfadeVal');
    if (sli) sli.value = String(v);
    if (lbl) lbl.textContent = v === 0 ? 'desactive' : (v + 's');
})();
renderInitialSearchHistory();

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
        const [libData, flowData] = await Promise.all([
            apiPost('api/library', { action: 'list' }),
            apiCall('api/flow?action=list')
        ]);
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
    const durSel = document.getElementById('durationFilter');
    const durFilter = durSel ? durSel.value : 'all';
    const inDurRange = (sec) => {
        if (durFilter === 'all') return true;
        if (durFilter === 'short') return sec > 0 && sec < 300;
        if (durFilter === 'medium') return sec >= 300 && sec < 600;
        if (durFilter === 'long') return sec >= 600 && sec < 1800;
        if (durFilter === 'xlong') return sec >= 1800;
        return true;
    };
    const cards = document.querySelectorAll('#searchGrid .item-card');
    let visible = 0;
    cards.forEach(c => {
        let show = true;
        if (filter === 'new') show = c.dataset.isNew === '1';
        else if (filter === 'dl') show = c.classList.contains('sq-downloaded');
        else if (filter === 'flow') show = c.classList.contains('sq-in-flow');
        if (show) show = inDurRange(parseInt(c.dataset.duration || '0', 10));
        c.style.display = show ? '' : 'none';
        if (show) visible++;
    });
    const countEl = document.getElementById('srCount');
    if (countEl) {
        const labels = { all: 'tous', new: 'nouveaux', dl: 'deja telecharges', flow: 'dans Mon Flow' };
        const durLabels = { all: '', short: ' < 5min', medium: ' 5-10min', long: ' 10-30min', xlong: ' > 30min' };
        const label = labels[filter] || filter;
        const durSuffix = durLabels[durFilter] || '';
        countEl.textContent = (filter === 'all' && durFilter === 'all')
            ? `${visible} resultat${visible > 1 ? 's' : ''}`
            : `${visible} ${label}${durSuffix} sur ${cards.length}`;
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
    setPlayerSource('search');

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
        const data = await apiCall('api/stream?url=' + encodeURIComponent(r.url) + '&type=audio');
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
        const data = await apiPost('api/flow', {
            action: 'add', url: r.url, title: r.title || '', channel: r.channel || '',
            thumbnail: r.thumbnail || '', duration: r.duration || ''
        });
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
        const data = await apiCall('api/flow?action=list');
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
                const data = await apiPost('api/flow', { action: 'create_playlist', name });
                if (!data.success && !/existe/i.test(data.error || '')) {
                    alert('Erreur creation playlist : ' + (data.error || 'inconnue')); return;
                }
                playlist = name;
            } catch (e) { alert('Erreur creation playlist : ' + e.message); return; }
        }
    }

    const items = aafPendingItems.map(r => ({ ...r, playlist }));

    try {
        const data = await apiPost('api/flow', { action: 'add_bulk', items: JSON.stringify(items) });
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

    apiPost('api/queue', { action: 'add', url: r.url, title: r.title, type, format, quality, source: 'web' }).catch(() => {});

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
        apiPost('api/queue', { action: 'add_batch', source: 'web', items: JSON.stringify(batch) }).catch(() => {});
    }

    sqRender();
    sqShowPanel();
    if (!sqRunning) sqProcess();
}

// --- Serveur = source de verite unique ---
// sqSave met a jour le statut de chaque element sur le serveur
function sqSave() {
    sqQueue.forEach(q => {
        apiPost('api/queue', {
            action: 'update', url: q.url, status: q.status,
            percent: q.percent || 0, message: q.message || '',
            jobId: q.jobId || '', title: q.title || ''
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
        const data = await apiCall('api/queue?action=list');
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
    apiPost('api/library', { action: 'fix_covers' }).catch(() => {});
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
    apiPost('api/queue', { action: 'remove', url }).catch(() => {});
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
    apiPost('api/queue', { action: 'clear', mode: 'done' }).catch(() => {});
    sqRender();
}

function sqClearAll() {
    sqQueue.forEach(q => { if (q.status === 'active') q._skipped = true; });
    sqQueue = [];
    sqRunning = false;
    apiPost('api/queue', { action: 'clear', mode: 'all' }).catch(() => {});
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
    apiPost('api/notifications', { action: 'add', type, title, detail, source: 'web' }).catch(() => {});
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
    apiPost('api/notifications', { action: 'markRead', id }).catch(() => {});
}

function sqMarkUnread(id) {
    const item = sqLog.find(n => n.id === id);
    if (item) item.read = false;
    sqRenderLog();
    apiPost('api/notifications', { action: 'markUnread', id }).catch(() => {});
}

function sqMarkAllRead() {
    sqLog.forEach(n => { n.read = true; });
    sqRenderLog();
    apiPost('api/notifications', { action: 'markAllRead' }).catch(() => {});
}

function sqClearLog() {
    sqLog = [];
    sqRenderLog();
    apiPost('api/notifications', { action: 'clear' }).catch(() => {});
}

async function sqPollNotifications() {
    try {
        const data = await apiCall('api/notifications?action=list');
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
                const checkData = await apiCall('api/queue?action=list');
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
                            const listData = await apiCall('api/library?action=list');
                            if (listData.items) {
                                const videoId = item.url.match(/[?&]v=([^&]+)/)?.[1] || '';
                                const existing = listData.items.find(i => i.url && videoId && i.url.includes(videoId) && (i.format || '') === item.format);
                                if (existing && existing.folder !== item.folder) {
                                    await apiPost('api/library', { action: 'move_item', item_id: existing.id, folder_id: item.folder });
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
                const info = await apiPost('api/info', { url: item.url });
                if (info.success) item.title = info.title;
                sqRender();

                item.message = 'Lancement...';
                sqRender();
                const dlData = await apiPost('api/download', { url: item.url, type: item.type, format: item.format, quality: item.quality, cover: '1' });

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
                            const data = await apiCall('api/progress?id=' + dlData.jobId);
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

                                await apiPost('api/library', {
                                    action: 'add_item', file: data.file, title: item.title,
                                    type: item.type, format: item.format,
                                    thumbnail: item.thumbnail || '', channel: item.channel || '',
                                    duration: item.duration || '', cover: data.cover || '',
                                    folder: item.folder || '', url: item.url
                                });
                                if (!data.cover) {
                                    apiPost('api/library', { action: 'fix_covers' }).catch(() => {});
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
                const data = await apiCall('api/progress?id=' + q.jobId);
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
            const data = await apiCall('api/progress?id=' + item.jobId);
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
        const data = await apiPost('api/playlist', { url });

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
            const data = await apiCall('api/progress?id=' + item.jobId);
            if (data.status === 'done') {
                clearInterval(interval);
                item.status = 'done';
                notifyDone(item.title);
                addHistory(item.title, 'success', item.format, item.type, item.url, item.info);
                await apiPost('api/library', {
                    action: 'add_item', file: data.file,
                    title: (item.info && item.info.title) || item.title,
                    type: item.type, format: item.format,
                    folder: item.folder || '',
                    thumbnail: (item.info && item.info.thumbnail) || '',
                    channel: (item.info && item.info.channel) || '',
                    duration: (item.info && item.info.duration) || '',
                    cover: data.cover || '', url: item.url
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
    apiPost('api/info', { url }).then(info => {
        if (info.success && downloadQueue[idx]) {
            downloadQueue[idx].title = info.title;
            downloadQueue[idx].info = info;
            renderQueue();
        }
    }).catch(() => {});

    if (!queueProcessing) processQueue();
}

function removeFromQueue(idx) {
    const item = downloadQueue[idx];
    if (!item) return;
    if (item.status === 'active' && !confirm('Ce telechargement est en cours. Le retirer de la liste (le fichier en cours continuera cote serveur) ?')) return;
    downloadQueue.splice(idx, 1);
    renderQueue();
    saveQueue();
}

function renderQueue() {
    const section = document.getElementById('queueSection');
    const list = document.getElementById('queueList');

    if (downloadQueue.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    document.getElementById('queueCount').textContent = downloadQueue.length;

    list.innerHTML = downloadQueue.map((q, i) => {
        const statusClass = q.status === 'active' ? 'active' : (q.status === 'done' ? 'done' : (q.status === 'error' ? 'error' : ''));
        const statusText = q.status === 'active' ? 'En cours...'
            : q.status === 'error' ? 'Erreur'
            : q.status === 'done' ? 'Termine'
            : 'En attente';
        return '<div class="queue-item">'
            + '<span class="qi-title">' + q.title + '</span>'
            + '<span class="qi-status ' + statusClass + '">' + statusText + '</span>'
            + '<button class="qi-remove" onclick="removeFromQueue(' + i + ')" title="Retirer">&times;</button>'
            + '</div>';
    }).join('');
}

function clearQueueAll() {
    if (!downloadQueue.length) return;
    if (!confirm('Vider toute la file d\'attente ? Les telechargements en cours seront marques comme retires de la liste mais le fichier en cours continuera cote serveur.')) return;
    downloadQueue = [];
    saveQueue();
    renderQueue();
}

function clearQueueDone() {
    const before = downloadQueue.length;
    downloadQueue = downloadQueue.filter(q => q.status !== 'done' && q.status !== 'error');
    if (downloadQueue.length === before) return;
    saveQueue();
    renderQueue();
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
                item.info = await apiPost('api/info', { url: item.url });
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
    apiPost('api/download', { url: item.url, type: item.type, format: item.format, quality: item.quality, cover: item.saveCover }).then(dlData => {
        if (!dlData.success) { item.status = 'error'; renderQueue(); saveQueue(); resolve(); return; }

        item.jobId = dlData.jobId;
        saveQueue();

        const interval = setInterval(async () => {
            try {
                const data = await apiCall('api/progress?id=' + dlData.jobId);
                if (data.status === 'done') {
                    clearInterval(interval);
                    item.status = 'done';
                    notifyDone(item.title);
                    addHistory(item.title, 'success', item.format, item.type, item.url, item.info);
                    await apiPost('api/library', {
                        action: 'add_item', file: data.file, title: item.info.title,
                        type: item.type, format: item.format, folder: item.folder,
                        thumbnail: item.info.thumbnail, channel: item.info.channel,
                        duration: item.info.duration, cover: data.cover || '', url: item.url
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
    apiPost('api/history', {
        action: 'add', title, status, format, type, url: url || '',
        channel: extra.channel || '', views: extra.views_display || '',
        year: extra.year || '', likes: extra.likes || '0', dislikes: extra.dislikes || '0',
        thumbnail: extra.thumbnail || ''
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
        const data = await apiCall('api/history?action=list');
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
            const libData = await apiPost('api/library', { action: 'list' });
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
        const libData = await apiPost('api/library', { action: 'list' });
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

            const dlData = await apiPost('api/download', { url: h.url, type, format, quality, cover: '1' });

            if (dlData.success) {
                logTech('INFO', 'Re-telechargement lance', { title: h.title, jobId: dlData.jobId });

                // Suivre la progression
                await new Promise((resolve) => {
                    const poll = setInterval(async () => {
                        try {
                            const pData = await apiCall('api/progress?id=' + dlData.jobId);

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
                                apiPost('api/library', {
                                    action: 'add_item', file: pData.file || '', title: h.title || '',
                                    type: h.type || 'audio', format: h.format || 'mp3',
                                    folder: '', thumbnail: '', channel: h.channel || '',
                                    duration: '', cover: pData.cover || '', url: h.url || ''
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
                await apiPost('api/history', {
                    action: 'add',
                    title: h.title || '', status: h.status || 'success',
                    format: h.format || '', type: h.type || '', url: h.url || '',
                    channel: h.channel || '', views: h.views || '', year: h.year || '',
                    likes: h.likes || '0', dislikes: h.dislikes || '0',
                    thumbnail: h.thumbnail || '',
                    source: h.source === 'local' ? sourceName : (h.source || sourceName)
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
    setPlayerSource('history');

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
            const libData = await apiPost('api/library', { action: 'list' });
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
            const data = await apiCall('api/stream?url=' + encodeURIComponent(h.url) + '&type=' + type);
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

    apiCall('api/stream?url=' + encodeURIComponent(h.url) + '&type=' + type)
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
    setPlayerSource('library');
}

async function addToFlowFromHistory(idx, btn) {
    const h = historyCache[idx];
    if (!h || !h.url) return;
    btn.textContent = '...';
    btn.disabled = true;
    try {
        const data = await apiPost('api/flow', {
            action: 'add', url: h.url,
            title: h.title || '', channel: h.channel || '',
            thumbnail: h.thumbnail || '', views: h.views || '',
            year: h.year || '', format: h.format || '', type: h.type || 'audio'
        });
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

const FLOW_TOP_COVER_KEY = 'yt_flow_top_cover_count';
const FLOW_TOP_COVER_DEFAULT = 3;
const FLOW_TOP_COVER_OPTIONS = [3, 5, 10, 20];

function getFlowTopCoverLimit() {
    const raw = parseInt(localStorage.getItem(FLOW_TOP_COVER_KEY), 10);
    return FLOW_TOP_COVER_OPTIONS.includes(raw) ? raw : FLOW_TOP_COVER_DEFAULT;
}

function setFlowTopCoverLimit(n) {
    const v = parseInt(n, 10);
    if (!FLOW_TOP_COVER_OPTIONS.includes(v)) return;
    localStorage.setItem(FLOW_TOP_COVER_KEY, String(v));
    renderFlow();
}

async function loadFlow() {
    try {
        const data = await apiCall('api/flow?action=list');
        if (!data.success) return;
        flowTracks = data.tracks || [];
        flowPlaylists = data.playlists || [];

        try {
            const libData = await apiPost('api/library', { action: 'list' });
            if (libData.success) flowLibItems = libData.items || [];
        } catch (e) {}

        // Appliquer le tri actuel (par defaut : plus ecoutes en premier)
        if (document.getElementById('flowSortBy')) {
            sortFlow(); // sortFlow appelle deja renderFlow
        } else {
            renderFlow();
        }
    } catch (e) {}
}

const flowParseDurationSec = Format.parseClock;

function flowFormatTotalDuration(tracks) {
    let total = 0, known = 0;
    tracks.forEach(t => {
        const s = Format.parseClock(t.duration);
        if (s > 0) { total += s; known++; }
    });
    if (!known) return '';
    const txt = Format.durationShort(total);
    let daysHtml = '';
    if (total >= 86400) {
        const days = Math.floor(total / 86400);
        const remH = Math.floor((total % 86400) / 3600);
        const dLabel = days > 1 ? 'jours' : 'jour';
        const txtDays = remH > 0 ? `${days} ${dLabel} ${remH}h` : `${days} ${dLabel}`;
        daysHtml = `<span class="ftc-duration-days">&#8776; ${txtDays}</span>`;
    }
    const missing = tracks.length - known;
    const note = missing > 0 ? `<span class="ftc-missing">${missing} sans duree</span>` : '';
    return `<span class="ftc-duration">&#9201; ~${txt}</span>${daysHtml}${note}`;
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
    // Compteurs des fenetres de temps
    const _now = Date.now();
    const _dayMs = 86400000;
    const flowInWindow = (track, days) => {
        if (!track.lastPlayed) return false;
        const ts = Date.parse(track.lastPlayed);
        if (isNaN(ts)) return false;
        return (_now - ts) <= days * _dayMs;
    };
    const todayCountF = flowTracks.filter(t => flowInWindow(t, 1)).length;
    const weekCountF = flowTracks.filter(t => flowInWindow(t, 7)).length;
    const monthCountF = flowTracks.filter(t => flowInWindow(t, 30)).length;

    let plHtml = '<span class="flow-pl-chip' + (!flowCurrentPlaylist && !flowViewMode ? ' active' : '') + '" onclick="flowFilterPlaylist(\'\', this)" ondragover="event.preventDefault()" ondrop="flowDropOnPlaylist(event, \'\')">Tout (' + flowTracks.length + ')</span>';
    // Vues rapides
    if (playedCountF > 0) plHtml += '<span class="flow-pl-chip flow-pl-view' + (flowViewMode === 'top' ? ' active' : '') + '" onclick="flowSetViewMode(\'top\', this)" title="Top 20 les plus ecoutes">&#11088; Plus ecoutes</span>';
    if (flowTracks.length > 0) plHtml += '<span class="flow-pl-chip flow-pl-view' + (flowViewMode === 'recent' ? ' active' : '') + '" onclick="flowSetViewMode(\'recent\', this)" title="20 derniers ajouts">&#128336; Recemment ajoutes</span>';
    if (todayCountF > 0) plHtml += '<span class="flow-pl-chip flow-pl-view' + (flowViewMode === 'today' ? ' active' : '') + '" onclick="flowSetViewMode(\'today\', this)" title="Ecoutes aujourd\'hui">&#9728; Aujourd\'hui (' + todayCountF + ')</span>';
    if (weekCountF > 0) plHtml += '<span class="flow-pl-chip flow-pl-view' + (flowViewMode === 'week' ? ' active' : '') + '" onclick="flowSetViewMode(\'week\', this)" title="Ecoutes ces 7 derniers jours">&#128197; Cette semaine (' + weekCountF + ')</span>';
    if (monthCountF > 0) plHtml += '<span class="flow-pl-chip flow-pl-view' + (flowViewMode === 'month' ? ' active' : '') + '" onclick="flowSetViewMode(\'month\', this)" title="Ecoutes ces 30 derniers jours">&#128467; Ce mois (' + monthCountF + ')</span>';

    // === Smart playlists auto-calculees ===
    const inDays = (track, days) => {
        if (!track.lastPlayed) return false;
        const ts = Date.parse(track.lastPlayed);
        if (isNaN(ts)) return false;
        return (_now - ts) <= days * _dayMs;
    };
    const addedInDays = (track, days) => {
        if (!track.addedAt) return false;
        const ts = Date.parse(track.addedAt);
        if (isNaN(ts)) return false;
        return (_now - ts) <= days * _dayMs;
    };
    const olderThanDays = (track, days) => {
        if (!track.lastPlayed) return false;
        const ts = Date.parse(track.lastPlayed);
        if (isNaN(ts)) return false;
        return (_now - ts) > days * _dayMs;
    };
    const discoveriesCount = flowTracks.filter(t => addedInDays(t, 30) && (t.playCount || 0) >= 3).length;
    const rediscoverCount = flowTracks.filter(t => (t.playCount || 0) >= 5 && olderThanDays(t, 90) && t.lastPlayed).length;
    const oneShotCount = flowTracks.filter(t => (t.playCount || 0) === 1 && olderThanDays(t, 90)).length;
    const neverCount = flowTracks.filter(t => !(t.playCount > 0)).length;
    if (discoveriesCount > 0) plHtml += '<span class="flow-pl-chip flow-pl-view' + (flowViewMode === 'discoveries' ? ' active' : '') + '" onclick="flowSetViewMode(\'discoveries\', this)" title="Ajoutes ce mois et deja ecoutes 3 fois ou +">&#128247; Decouvertes (' + discoveriesCount + ')</span>';
    if (rediscoverCount > 0) plHtml += '<span class="flow-pl-chip flow-pl-view' + (flowViewMode === 'rediscover' ? ' active' : '') + '" onclick="flowSetViewMode(\'rediscover\', this)" title="Hits oublies : 5+ ecoutes mais pas joues depuis 3 mois">&#128279; A redecouvrir (' + rediscoverCount + ')</span>';
    if (oneShotCount > 0) plHtml += '<span class="flow-pl-chip flow-pl-view' + (flowViewMode === 'oneshot' ? ' active' : '') + '" onclick="flowSetViewMode(\'oneshot\', this)" title="Joues une seule fois il y a longtemps">&#128340; Coups d\'un soir (' + oneShotCount + ')</span>';
    if (neverCount > 0) plHtml += '<span class="flow-pl-chip flow-pl-view' + (flowViewMode === 'never' ? ' active' : '') + '" onclick="flowSetViewMode(\'never\', this)" title="Jamais ecoutes">&#10067; Jamais ecoutes (' + neverCount + ')</span>';
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
        const isAddedInDays = (track, days) => {
            if (!track.addedAt) return false;
            const ts = Date.parse(track.addedAt);
            if (isNaN(ts)) return false;
            return (_now - ts) <= days * _dayMs;
        };
        const isOlderThanDays = (track, days) => {
            if (!track.lastPlayed) return false;
            const ts = Date.parse(track.lastPlayed);
            if (isNaN(ts)) return false;
            return (_now - ts) > days * _dayMs;
        };
        const matchView = !flowViewMode
            || (flowViewMode === 'liked' && t.liked)
            || (flowViewMode === 'top' && (t.playCount || 0) > 0)
            || flowViewMode === 'recent'
            || (flowViewMode === 'today' && flowInWindow(t, 1))
            || (flowViewMode === 'week' && flowInWindow(t, 7))
            || (flowViewMode === 'month' && flowInWindow(t, 30))
            || (flowViewMode === 'discoveries' && isAddedInDays(t, 30) && (t.playCount || 0) >= 3)
            || (flowViewMode === 'rediscover' && (t.playCount || 0) >= 5 && isOlderThanDays(t, 90) && t.lastPlayed)
            || (flowViewMode === 'oneshot' && (t.playCount || 0) === 1 && isOlderThanDays(t, 90))
            || (flowViewMode === 'never' && !(t.playCount > 0));
        return matchPl && matchSearch && matchView;
    });

    // Vues rapides : tri et limite
    if (flowViewMode === 'top') {
        filtered = [...filtered].sort((a, b) => (b.playCount || 0) - (a.playCount || 0)).slice(0, 20);
    } else if (flowViewMode === 'recent') {
        filtered = [...filtered].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')).slice(0, 20);
    } else if (flowViewMode === 'today' || flowViewMode === 'week' || flowViewMode === 'month') {
        filtered = [...filtered].sort((a, b) => (b.lastPlayed || '').localeCompare(a.lastPlayed || ''));
    } else if (flowViewMode === 'discoveries') {
        filtered = [...filtered].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    } else if (flowViewMode === 'rediscover' || flowViewMode === 'oneshot') {
        filtered = [...filtered].sort((a, b) => (a.lastPlayed || '').localeCompare(b.lastPlayed || ''));
    } else if (flowViewMode === 'never') {
        filtered = [...filtered].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    }

    countEl.innerHTML = `<span class="ftc-count">${filtered.length} titre${filtered.length > 1 ? 's' : ''}</span>` + flowFormatTotalDuration(filtered);

    if (filtered.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:30px;">Aucun titre. Ajoute des morceaux depuis l\'historique ou importe une liste.</p>';
        return;
    }

    // ---- Cover Top N (uniquement sur la vue "Tout", sans filtre ni recherche) ----
    let coverHtml = '';
    const showCover = !flowCurrentPlaylist && !flowViewMode && !search;
    if (showCover) {
        const topLimit = getFlowTopCoverLimit();
        const topTracks = [...flowTracks]
            .filter(t => (t.playCount || 0) > 0)
            .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
            .slice(0, topLimit);
        if (topTracks.length > 0) {
            const dlFormatSel = document.getElementById('flowDlFormat') ? document.getElementById('flowDlFormat').value : 'audio:mp3';
            const dlFormat = dlFormatSel.split(':')[1];
            const limitOpts = FLOW_TOP_COVER_OPTIONS
                .map(n => '<option value="' + n + '"' + (n === topLimit ? ' selected' : '') + '>Top ' + n + '</option>')
                .join('');
            coverHtml = '<div class="flow-top-cover ftc-cols-' + topLimit + '">'
                + '<div class="ftc-header">'
                + '<span class="ftc-header-text"><span class="ftc-trophy">&#127942;</span> Top ' + topTracks.length + ' du moment <span class="ftc-sub">les plus ecoutes</span></span>'
                + '<label class="ftc-limit-label">Afficher <select class="ftc-limit-select" onchange="setFlowTopCoverLimit(this.value)">' + limitOpts + '</select></label>'
                + '</div>'
                + '<div class="ftc-grid">'
                + topTracks.map((t, i) => {
                    const realIdx = flowTracks.indexOf(t);
                    let thumb = t.thumbnail || '';
                    if (!thumb && t.url) { const m = t.url.match(/[?&]v=([^&]+)/); if (m) thumb = 'https://i.ytimg.com/vi/' + m[1] + '/hqdefault.jpg'; }
                    const playing = realIdx === flowCurrentIdx;
                    const vMatch = (t.url || '').match(/[?&]v=([^&]+)/);
                    const vid = vMatch ? vMatch[1] : '';
                    const inLib = vid && flowLibItems.some(item => item.url && item.url.includes(vid) && (item.format || '') === dlFormat);
                    const plTag = t.playlist ? '<span class="fl-playlist-tag">' + t.playlist + '</span>' : '';
                    const safeTitle = (t.title || 'Sans titre').replace(/"/g, '&quot;');
                    return '<div class="ftc-card rank-' + (i + 1) + (playing ? ' fl-playing' : '') + (inLib ? ' fl-downloaded' : '') + '" data-idx="' + realIdx + '">'
                        + '<div class="ftc-thumb-wrap" onclick="flowPlaySequential(' + realIdx + ',\'audio\')">'
                        + (thumb ? '<img class="ftc-thumb" src="' + thumb + '" loading="lazy" alt="">' : '<div class="ftc-thumb ftc-no-thumb">&#9654;</div>')
                        + '<span class="ftc-rank">#' + (i + 1) + '</span>'
                        + '<span class="ftc-plays">&#9654; ' + (t.playCount || 0) + 'x</span>'
                        + '<button class="ftc-play-overlay" onclick="event.stopPropagation(); flowPlaySequential(' + realIdx + ',\'audio\')" title="Lire">&#9654;</button>'
                        + '</div>'
                        + '<div class="ftc-body">'
                        + '<div class="ftc-title-text" title="' + safeTitle + '">' + (t.title || 'Sans titre') + ' ' + plTag + (inLib ? ' <span class="fl-dl-badge">DL</span>' : '') + '</div>'
                        + '<div class="ftc-meta">' + [t.channel, t.duration, t.year].filter(Boolean).join(' &middot; ') + '</div>'
                        + '<div class="ftc-actions">'
                        + '<button class="fl-like' + (t.liked ? ' liked' : '') + '" onclick="flowToggleLike(\'' + t.id + '\', this)" title="' + (t.liked ? 'Retirer des aim&eacute;s' : 'Aimer') + '">' + (t.liked ? '&#10084;' : '&#9825;') + '</button>'
                        + '<button class="fl-play" onclick="flowPlaySequential(' + realIdx + ',\'audio\')" title="Lecture normale (suite dans l\'ordre)">&#9654; Ecouter</button>'
                        + '<button class="fl-play fl-play-shuf" onclick="flowPlayShuffle(' + realIdx + ',\'audio\')" title="Lire puis enchainer aleatoirement">&#128256; Aleatoire</button>'
                        + '<button class="fl-play fl-play-vid" onclick="flowPlaySequential(' + realIdx + ',\'video\')">&#9654; Video</button>'
                        + (inLib
                            ? '<span class="fl-play fl-play-already" title="Deja telecharge">&#10003; DL</span>'
                            : '<button class="fl-play fl-play-dl" onclick="flowDownload(' + realIdx + ', this)">&#11015; DL</button>')
                        + '<button class="fl-remove" onclick="flowRemove(\'' + t.id + '\')" title="Retirer">&#10005;</button>'
                        + '</div>'
                        + '</div>'
                        + '</div>';
                }).join('')
                + '</div></div>';
        }
    }

    list.innerHTML = coverHtml + filtered.map(t => {
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
            + (thumb ? '<img class="fl-thumb" src="' + thumb + '" loading="lazy" onclick="flowPlaySequential(' + realIdx + ',\'audio\')">' : '')
            + '<div class="fl-body">'
            + '<span class="fl-title">' + (t.title || 'Sans titre') + ' ' + plTag + (inLib ? ' <span class="fl-dl-badge">DL</span>' : '') + '</span>'
            + '<span class="fl-info">' + [t.channel, t.duration, t.year].filter(Boolean).join(' · ') + '</span>'
            + ((t.playCount || 0) > 0 ? '<span class="fl-plays-badge">' + t.playCount + 'x</span>' : '')
            + '</div>'
            + (flowPlaylists.length > 0 ? '<select class="fl-move-select" onchange="flowMoveTrack(\'' + t.id + '\', this.value); this.selectedIndex=0;">' + plOptions + '</select>' : '')
            + '<button class="fl-like' + (t.liked ? ' liked' : '') + '" onclick="flowToggleLike(\'' + t.id + '\', this)" title="' + (t.liked ? 'Retirer des aim&eacute;s' : 'Aimer') + '">' + (t.liked ? '&#10084;' : '&#9825;') + '</button>'
            + '<button class="fl-play" onclick="flowPlaySequential(' + realIdx + ',\'audio\')" title="Lecture normale (suite dans l\'ordre)">&#9654; Ecouter</button>'
            + '<button class="fl-play fl-play-shuf" onclick="flowPlayShuffle(' + realIdx + ',\'audio\')" title="Lire puis enchainer aleatoirement">&#128256; Aleatoire</button>'
            + '<button class="fl-play fl-play-vid" onclick="flowPlaySequential(' + realIdx + ',\'video\')">&#9654; Video</button>'
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
        await apiPost('api/flow', { action: 'move', id: data.id, playlist });
        loadFlow();
    } else if (data.type === 'history') {
        const h = historyCache[data.idx];
        if (!h || !h.url) return;
        await apiPost('api/flow', {
            action: 'add', url: h.url,
            title: h.title || '', channel: h.channel || '',
            thumbnail: h.thumbnail || '', views: h.views || '',
            year: h.year || '', format: h.format || '',
            type: h.type || 'audio', playlist
        });
        loadFlow();
    }
}

// Convertit une chaine de vues YouTube en nombre.
// Exemples : "91.0 M vues" -> 91_000_000 / "2.1 Md vues" -> 2_100_000_000 / "1,234,567 views" -> 1234567
function parseFlowViews(s) {
    if (!s) return 0;
    const txt = String(s).toLowerCase().replace(/\s+/g, ' ').trim();
    const m = txt.match(/([\d.,]+)\s*(md|mrd|b|m|k)?/i);
    if (!m) return 0;
    let n = parseFloat(m[1].replace(/\s/g, '').replace(',', '.'));
    if (isNaN(n)) {
        // Cas "1,234,567" : virgules = separateurs de milliers
        n = parseInt(m[1].replace(/[.,\s]/g, ''), 10) || 0;
    }
    const suf = (m[2] || '').toLowerCase();
    if (suf === 'k') n *= 1e3;
    else if (suf === 'm') n *= 1e6;
    else if (suf === 'md' || suf === 'mrd' || suf === 'b') n *= 1e9;
    return Math.round(n);
}

// "3:45" -> 225, "1:23:45" -> 5025, "" -> 0
function parseFlowDuration(s) {
    if (!s) return 0;
    const parts = String(s).split(':').map(p => parseInt(p, 10));
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
}

function sortFlow() {
    const sort = document.getElementById('flowSortBy').value;
    // En cas d'egalite, on tranche par playCount desc puis date d'ajout desc -> ordre stable
    const tieBreak = (a, b) => ((b.playCount || 0) - (a.playCount || 0))
        || (b.addedAt || '').localeCompare(a.addedAt || '');
    flowTracks.sort((a, b) => {
        let cmp = 0;
        switch (sort) {
            case 'added-desc': cmp = (b.addedAt || '').localeCompare(a.addedAt || ''); break;
            case 'added-asc': cmp = (a.addedAt || '').localeCompare(b.addedAt || ''); break;
            case 'year-desc': cmp = (parseInt(b.year, 10) || 0) - (parseInt(a.year, 10) || 0); break;
            case 'year-asc': cmp = (parseInt(a.year, 10) || 0) - (parseInt(b.year, 10) || 0); break;
            case 'views-desc': cmp = parseFlowViews(b.views) - parseFlowViews(a.views); break;
            case 'views-asc': cmp = parseFlowViews(a.views) - parseFlowViews(b.views); break;
            case 'liked-first': cmp = (b.liked ? 1 : 0) - (a.liked ? 1 : 0); break;
            case 'duration-desc': cmp = parseFlowDuration(b.duration) - parseFlowDuration(a.duration); break;
            case 'duration-asc': cmp = parseFlowDuration(a.duration) - parseFlowDuration(b.duration); break;
            case 'title-asc': cmp = (a.title || '').localeCompare(b.title || '', 'fr'); break;
            case 'title-desc': cmp = (b.title || '').localeCompare(a.title || '', 'fr'); break;
            case 'channel-asc': cmp = (a.channel || '').localeCompare(b.channel || '', 'fr'); break;
            case 'plays-desc': cmp = (b.playCount || 0) - (a.playCount || 0); break;
            case 'plays-asc': cmp = (a.playCount || 0) - (b.playCount || 0); break;
            case 'recent-play': cmp = (b.lastPlayed || '').localeCompare(a.lastPlayed || ''); break;
            case 'type-audio': cmp = (a.type === 'audio' ? 0 : 1) - (b.type === 'audio' ? 0 : 1); break;
            case 'type-video': cmp = (a.type === 'video' ? 0 : 1) - (b.type === 'video' ? 0 : 1); break;
        }
        return cmp !== 0 ? cmp : tieBreak(a, b);
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
        const data = await apiPost('api/flow', { action: 'toggle_like', id });
        console.log('[LIKE FLOW] response', data);
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

    // Si un crossfade est en cours, on le commit (lecture demandee = on snap au nouveau titre)
    if (isCrossfading()) cancelCrossfade('cancel');

    const bar = document.getElementById('playerBar');
    const mainAudio = getActiveAudio();
    const videoOverlay = document.getElementById('videoOverlay');

    // Arreter la lecture en cours sur les DEUX elements (au cas ou)
    mainAudio.pause();
    mainAudio.src = '';
    const otherA = getInactiveAudio();
    try { otherA.pause(); otherA.src = ''; } catch (e) {}

    flowCurrentIdx = idx;
    flowCurrentType = type || 'audio';
    setPlayerSource('flow');

    // Sync l'etat des boutons mode du lecteur global avec le contexte flow
    if (flowShuffle && playMode !== 'shuffle') playMode = 'shuffle';
    if (typeof playerSyncModeButtons === 'function') playerSyncModeButtons();

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
    apiPost('api/flow', { action: 'play', id: t.id }).catch(() => {});
    notifyFlowTrack(t);
    if (typeof maybeAutoOpenLyrics === 'function') maybeAutoOpenLyrics();

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
            const data = await apiCall('api/stream?url=' + encodeURIComponent(t.url) + '&type=' + type);
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

        // L'auto-next est gere globalement via _onAudioEnded -> playerNext() -> flowNext()
        mainAudio.onended = null;

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
    // Repeat one : on rejoue le titre courant
    if (typeof playMode !== 'undefined' && playMode === 'loopOne' && flowCurrentIdx >= 0) {
        flowPlay(flowCurrentIdx, type);
        return;
    }
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
            // Repeat all : on reboucle au debut de la selection
            if (typeof playMode !== 'undefined' && playMode === 'loop' && visible.length > 0) {
                nextIdx = visible[0];
            } else {
                document.getElementById('flowMeta').textContent = 'Fin de la liste';
                return;
            }
        } else {
            nextIdx = visible[curPos + 1];
        }
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
    flowSetShuffle(!flowShuffle);
}

function flowSetShuffle(on) {
    if (flowShuffle === !!on) return;
    flowShuffle = !!on;
    const btn = document.getElementById('flowShuffleBtn');
    if (btn) btn.classList.toggle('active', flowShuffle);
    flowPreloaded = null;
    // Sync avec le mode du lecteur global
    if (typeof playMode !== 'undefined') {
        if (flowShuffle) {
            playMode = 'shuffle';
        } else if (playMode === 'shuffle') {
            playMode = 'normal';
        }
        if (typeof playerSyncModeButtons === 'function') playerSyncModeButtons();
    }
}

function flowPlaySequential(idx, type) {
    flowSetShuffle(false);
    flowPlay(idx, type || 'audio');
}

function flowPlayShuffle(idx, type) {
    flowSetShuffle(true);
    flowPlay(idx, type || 'audio');
}

function flowStop() {
    if (isCrossfading()) cancelCrossfade('cancel');
    audioEl.pause(); audioEl.src = ''; audioEl.onended = null;
    audioElB.pause(); audioElB.src = ''; audioElB.onended = null;
    setActiveAudio(audioEl);
    document.getElementById('playerBar').classList.remove('active');
    document.body.classList.remove('player-open');
    document.querySelectorAll('.flow-track').forEach(el => el.classList.remove('fl-playing'));
    flowCurrentIdx = -1;
    flowPreloaded = null;
    setPlayerSource('library');
}

function flowPreloadNext(currentIdx, type) {
    // Repeat one : on rejouera la meme piste donc pas besoin de precharger
    if (typeof playMode !== 'undefined' && playMode === 'loopOne') { flowPreloaded = null; return; }
    const visible = flowGetVisibleTracks();
    const curPos = visible.indexOf(currentIdx);
    let nextIdx;
    if (flowShuffle) {
        const others = visible.filter(i => i !== currentIdx);
        nextIdx = others.length > 0 ? others[Math.floor(Math.random() * others.length)] : -1;
    } else if (curPos >= 0 && curPos < visible.length - 1) {
        nextIdx = visible[curPos + 1];
    } else if (typeof playMode !== 'undefined' && playMode === 'loop' && visible.length > 0) {
        nextIdx = visible[0];
    } else {
        nextIdx = -1;
    }
    if (nextIdx === -1) { flowPreloaded = null; return; }

    const t = flowTracks[nextIdx];
    apiCall('api/stream?url=' + encodeURIComponent(t.url) + '&type=' + type)
        .then(data => {
            if (data.success && flowCurrentIdx === currentIdx) {
                flowPreloaded = { idx: nextIdx, type, streamUrl: data.streamUrl };
            }
        })
        .catch(() => { flowPreloaded = null; });
}

// Calcule l'index de la prochaine piste sans declencher la lecture
function flowComputeNextIdx() {
    if (typeof playMode !== 'undefined' && playMode === 'loopOne') return -1; // pas de crossfade en loopOne
    const visible = flowGetVisibleTracks();
    if (visible.length === 0) return -1;
    if (flowShuffle) {
        const others = visible.filter(i => i !== flowCurrentIdx);
        return others.length > 0 ? others[Math.floor(Math.random() * others.length)] : -1;
    }
    const curPos = visible.indexOf(flowCurrentIdx);
    if (curPos === -1 || curPos >= visible.length - 1) {
        return (typeof playMode !== 'undefined' && playMode === 'loop' && visible.length > 0) ? visible[0] : -1;
    }
    return visible[curPos + 1];
}

// Appele depuis le timeupdate du element actif : declenche le crossfade au bon moment
async function maybeStartCrossfade(currentEl) {
    if (isCrossfading()) return;
    if (playbackContext !== 'flow') return;          // crossfade en flow uniquement
    if (flowCurrentType !== 'audio') return;        // pas de crossfade en video
    const xfade = getCrossfadeSeconds();
    if (xfade <= 0) return;
    const dur = currentEl.duration;
    if (!dur || !isFinite(dur)) return;
    const remain = dur - currentEl.currentTime;
    // On declenche un peu avant le marqueur, pour avoir le temps de charger
    if (remain > xfade + 0.4) return;
    if (remain < 0.3) return; // trop tard pour overlap utile -> laisser ended faire le boulot
    const nextIdx = flowComputeNextIdx();
    if (nextIdx < 0) return;
    const nextTrack = flowTracks[nextIdx];
    if (!nextTrack || !nextTrack.url) return;
    // Marquer immediatement pour eviter ple multiples declenchements pendant la fenetre
    _xfState = { fromEl: currentEl, toEl: getInactiveAudio(), startVol: currentEl.volume, intervalId: null, doneCb: null };
    try {
        let streamUrl;
        if (flowPreloaded && flowPreloaded.idx === nextIdx && flowPreloaded.type === 'audio') {
            streamUrl = flowPreloaded.streamUrl;
        } else {
            const data = await apiCall('api/stream?url=' + encodeURIComponent(nextTrack.url) + '&type=audio');
            if (!data.success) { _xfState = null; return; }
            streamUrl = data.streamUrl;
        }
        if (!_xfState) return; // annule entre temps
        startCrossfade(streamUrl, nextIdx, nextTrack);
    } catch (e) {
        _xfState = null;
    }
}

function startCrossfade(nextStreamUrl, nextIdx, nextTrack) {
    if (!_xfState) return;
    const { fromEl, toEl, startVol } = _xfState;
    const xfade = getCrossfadeSeconds();
    toEl.src = nextStreamUrl;
    toEl.volume = 0;
    toEl.play().catch(() => {});
    _xfState.nextIdx = nextIdx;
    _xfState.nextTrack = nextTrack;
    _xfState.finalize = function finalize() {
        if (!_xfState) return;
        clearInterval(_xfState.intervalId);
        try { fromEl.pause(); fromEl.src = ''; } catch (e) {}
        toEl.volume = startVol;
        setActiveAudio(toEl);
        _xfState = null;
        flowCurrentIdx = nextIdx;
        let thumb = nextTrack.thumbnail || '';
        if (!thumb && nextTrack.url) { const m = nextTrack.url.match(/[?&]v=([^&]+)/); if (m) thumb = 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg'; }
        document.getElementById('playerThumb').src = thumb;
        document.getElementById('playerTitle').textContent = nextTrack.title || '';
        document.getElementById('playerArtist').textContent = (nextTrack.channel || '') + ' · Streaming';
        document.getElementById('btnPlayPause').innerHTML = '&#9646;&#9646;';
        document.querySelectorAll('.flow-track').forEach(el => el.classList.remove('fl-playing'));
        const trackEl = document.querySelector('.flow-track[data-idx="' + nextIdx + '"]');
        if (trackEl) trackEl.classList.add('fl-playing');
        apiPost('api/flow', { action: 'play', id: nextTrack.id }).catch(() => {});
        notifyFlowTrack(nextTrack);
        if (typeof maybeAutoOpenLyrics === 'function') maybeAutoOpenLyrics();
        const nextNextIdx = getNextFlowIdx(nextIdx);
        const nextEl = document.getElementById('playerNext');
        if (nextNextIdx !== -1 && flowTracks[nextNextIdx]) {
            const nt = flowTracks[nextNextIdx];
            let nThumb = nt.thumbnail || '';
            if (!nThumb && nt.url) { const m = nt.url.match(/[?&]v=([^&]+)/); if (m) nThumb = 'https://i.ytimg.com/vi/' + m[1] + '/mqdefault.jpg'; }
            document.getElementById('playerNextTitle').textContent = nt.title || '';
            document.getElementById('playerNextThumb').src = nThumb;
            document.getElementById('playerNextThumb').style.display = nThumb ? '' : 'none';
            if (nextEl) nextEl.style.display = 'flex';
        } else {
            if (nextEl) nextEl.style.display = 'none';
        }
        flowPreloaded = null;
        flowPreloadNext(nextIdx, 'audio');
    };
    const startTs = Date.now();
    const totalMs = xfade * 1000;
    _xfState.intervalId = setInterval(() => {
        if (!_xfState) return;
        const elapsed = Date.now() - startTs;
        const p = Math.min(1, elapsed / totalMs);
        // courbe equal-power simple
        const fadeOut = Math.cos(p * Math.PI / 2);
        const fadeIn = Math.sin(p * Math.PI / 2);
        try { fromEl.volume = Math.max(0, startVol * fadeOut); } catch (e) {}
        try { toEl.volume = Math.max(0, startVol * fadeIn); } catch (e) {}
        if (p >= 1) _xfState.finalize();
    }, 50);
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
            <span class="fcp-preview" id="fcpPreview" style="${curBg ? 'background:' + curBg + ';' : ''}${curFg ? 'color:' + curFg : ''}">${escapeHtml(playlistName)}</span>
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
        const data = await apiPost('api/flow', { action: 'set_playlist_color', name: playlistName, bg: bg || '', fg: fg || '' });
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
    const data = await apiPost('api/flow', { action: 'create_playlist', name });
    if (!data.success) { alert(data.error || 'Erreur'); return; }
    document.getElementById('flowNewPlName').value = '';
    document.getElementById('flowCreatePl').style.display = 'none';
    loadFlow();
}

async function flowDeletePlaylist(name) {
    if (!confirm('Supprimer la playlist "' + name + '" ?\nLes morceaux ne seront pas supprimes.')) return;
    await apiPost('api/flow', { action: 'delete_playlist', name });
    if (flowCurrentPlaylist === name) flowCurrentPlaylist = '';
    loadFlow();
}

async function flowMoveTrack(id, playlist) {
    if (playlist === '__none__') playlist = '';
    await apiPost('api/flow', { action: 'move', id, playlist });
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
        const data = await apiCall('api/search?q=' + encodeURIComponent(query) + '&max=' + total);
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
        const info = await apiPost('api/info', { url: r.url });
        await apiPost('api/flow', {
            action: 'add', url: r.url,
            title: info.success ? info.title : (r.title || ''),
            channel: info.success ? info.channel : (r.channel || ''),
            thumbnail: info.success ? info.thumbnail : (r.thumbnail || ''),
            duration: info.success ? info.duration : (r.duration || ''),
            views: info.success ? info.views_display : '',
            year: info.success ? info.year : ''
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
        const data = await apiCall('api/stream?url=' + encodeURIComponent(url) + '&type=audio');
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
        const info = await apiPost('api/info', { url });
        if (!info.success) { alert('Impossible de recuperer les infos.'); return; }

        await apiPost('api/flow', {
            action: 'add', url,
            title: info.title || '', channel: info.channel || '',
            thumbnail: info.thumbnail || '', duration: info.duration || '',
            views: info.views_display || '', year: info.year || ''
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

        const dlData = await apiPost('api/download', { url: t.url, type, format, quality, cover: '1' });

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
                const pData = await apiCall('api/progress?id=' + dlData.jobId);

                if (pData.status === 'done') {
                    clearInterval(poll);
                    btn.textContent = 'OK!';
                    btn.style.background = 'var(--success)';

                    apiPost('api/library', {
                        action: 'add_item', file: pData.file || '', title: t.title || '',
                        type, format, folder: '', thumbnail: t.thumbnail || '',
                        channel: t.channel || '', duration: t.duration || '',
                        cover: pData.cover || '', url: t.url || ''
                    }).catch(() => {});

                    apiPost('api/history', {
                        action: 'add', title: t.title || '', status: 'success',
                        format, type: t.type || 'audio', url: t.url || '',
                        channel: t.channel || '', thumbnail: t.thumbnail || ''
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
        message: `<div style="margin-bottom:8px;">Tu vas retirer :</div><div style="background:var(--bg-hover);padding:10px 14px;border-radius:8px;font-weight:600;color:var(--text);overflow:hidden;text-overflow:ellipsis;">${escapeHtml(title)}</div><div style="margin-top:12px;font-size:12px;color:var(--text-muted);">&#9432; Le titre est place dans la <b>corbeille</b> et reste recuperable pendant <b>24h</b>.</div>`,
        confirmText: 'Retirer',
        confirmStyle: 'danger',
        onConfirm: async () => {
            await apiPost('api/flow', { action: 'remove', id });
            showToast('Titre place dans la corbeille (24h pour le restaurer)');
            loadFlow();
        }
    });
}

function confirmDialog(opts) {
    const cfg = Object.assign({ confirmText: 'Confirmer', cancelText: 'Annuler', confirmStyle: 'primary', onConfirm: () => {}, onCancel: () => {} }, opts || {});
    Modal.confirm({
        title: cfg.title || 'Confirmation',
        message: cfg.message || '',
        confirmText: cfg.confirmText,
        cancelText: cfg.cancelText,
        danger: cfg.confirmStyle === 'danger'
    }).then(ok => ok ? cfg.onConfirm() : cfg.onCancel());
}

async function flowOpenTrash() {
    let items = [];
    try {
        const data = await apiCall('api/flow?action=trash_list');
        if (data.success) items = data.items || [];
    } catch (e) { alert('Erreur : ' + e.message); return; }

    const rows = items.length ? items.map(it => {
        const cls = it.remainingMs < 3600000 ? ' trash-row-warn' : '';
        const exp = it.remainingMs <= 0 ? 'expire' : Format.duration(it.remainingMs);
        return `<div class="trash-row${cls}">
            <div class="trash-info">
                <div class="trash-title" title="${escapeHtml(it.title || '')}">${escapeHtml(it.title || '(sans titre)')}</div>
                <div class="trash-meta">${escapeHtml(it.channel || '')} ${it.playlist ? '&middot; <em>' + escapeHtml(it.playlist) + '</em>' : ''} &middot; supprime le ${escapeHtml(it.deletedAt || '')}</div>
                <div class="trash-countdown">&#9201; ${exp} restant avant suppression definitive</div>
            </div>
            <div class="trash-actions">
                <button onclick="flowTrashRestore('${it.id}')" class="trash-btn trash-btn-restore">&#8634; Restaurer</button>
                <button onclick="flowTrashDelete('${it.id}')" class="trash-btn trash-btn-delete">&#128465;</button>
            </div>
        </div>`;
    }).join('') : '<div style="text-align:center;padding:30px;color:var(--text-muted);">La corbeille est vide.</div>';

    const m = Modal.custom({
        title: 'Corbeille de Mon Flow',
        width: 560,
        html: `<p style="color:var(--text-muted);font-size:12px;margin-bottom:14px;">Les titres retires sont conserves <b>24h</b> avant suppression definitive.</p>
            <div style="max-height:50vh;overflow-y:auto;margin-bottom:12px;">${rows}</div>
            <div class="modal-btns">
                ${items.length ? '<button class="btn-cancel" id="trashClearBtn" style="background:var(--error,#f44336);color:#fff;border-color:var(--error,#f44336);">Vider la corbeille</button>' : ''}
                <button class="btn-cancel" id="trashCloseBtn">Fermer</button>
            </div>`,
        onMount: (root, close) => {
            root.id = 'flowTrashModal';
            root.querySelector('#trashCloseBtn').onclick = close;
            const clr = root.querySelector('#trashClearBtn');
            if (clr) clr.onclick = () => { close(); flowTrashClear(); };
        }
    });
}

async function flowTrashRestore(id) {
    await apiPost('api/flow', { action: 'trash_restore', id });
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
            await apiPost('api/flow', { action: 'trash_delete', id });
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
            await apiPost('api/flow', { action: 'trash_clear' });
            showToast('Corbeille videe');
            document.getElementById('flowTrashModal')?.remove();
        }
    });
}

async function flowAddFromHistory() {
    // Ajouter tous les elements de l'historique qui ont une URL
    try {
        const data = await apiCall('api/history?action=list');
        if (!data.success || !data.history) return;

        const items = data.history.filter(h => h.url && h.status === 'success');
        if (items.length === 0) { alert('Aucun element dans l\'historique.'); return; }

        const addData = await apiPost('api/flow', { action: 'add_bulk', items: JSON.stringify(items) });
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
            const data = await apiPost('api/flow', { action: 'add_bulk', items: JSON.stringify(items) });
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
        const data = await apiCall('api/system?action=cache_stats');
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
        await apiCall('api/system?action=cache_clear');
        loadCacheStats();
    } catch (e) {}
}

async function loadSystemInfo() {
    try {
        const data = await apiCall('api/system?action=info');
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
        const data = await apiPost('api/system', { action: 'update' });
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

                await apiPost('api/library', { action: 'move_item', item_id: dragItemId, folder_id: folderId });

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
