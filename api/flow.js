const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const router = express.Router();

const FLOW_FILE = path.join(config.DATA_DIR, 'flow.json');
const FLOW_BACKUP_FILE = path.join(config.DATA_DIR, 'flow.backup.pre-profiles.json');

let statsRecord = null;
try { statsRecord = require('./stats').recordEvent; } catch (e) { /* stats module optionnel */ }

function loadFlow() {
    try {
        const data = JSON.parse(fs.readFileSync(FLOW_FILE, 'utf8'));
        if (!data.trash) data.trash = [];
        return data;
    } catch (e) { return { tracks: [], playlists: [], trash: [] }; }
}

function getDefaultProfileId() {
    try {
        const profiles = JSON.parse(fs.readFileSync(config.PROFILES_FILE, 'utf8'));
        if (Array.isArray(profiles) && profiles.length) return profiles[0].id;
    } catch (e) {}
    return '';
}

// Migration : assigne profileId aux pistes/playlists/corbeille existantes
function migrateFlowProfiles(flow) {
    const defaultId = getDefaultProfileId();
    if (!defaultId) return false;
    let changed = false;
    for (const t of flow.tracks || []) {
        if (!t.profileId) { t.profileId = defaultId; changed = true; }
    }
    for (const p of flow.playlists || []) {
        if (!p.profileId) { p.profileId = defaultId; changed = true; }
    }
    for (const t of flow.trash || []) {
        if (!t.profileId) { t.profileId = defaultId; changed = true; }
    }
    return changed;
}

function getProfileId(req) {
    return (req.body && req.body.profile) || (req.query && req.query.profile) || '';
}

// Filtre une liste par profileId. Si pas de profileId fourni, on retourne tout
// (compat ascendante - avec un avertissement loggue).
function filterByProfile(arr, profileId) {
    if (!Array.isArray(arr)) return [];
    if (!profileId) return arr;
    return arr.filter(x => (x.profileId || '') === profileId);
}

const TRASH_TTL_MS = 24 * 3600 * 1000;

function trashTsOf(item) {
    if (item == null) return NaN;
    if (typeof item.deletedTs === 'number') return item.deletedTs;
    if (item.deletedAt != null) {
        if (typeof item.deletedAt === 'number') return item.deletedAt;
        const s = String(item.deletedAt);
        const hasZ = /Z$|[+-]\d{2}:?\d{2}$/.test(s);
        const iso = s.replace(' ', 'T') + (hasZ ? '' : 'Z');
        const d = new Date(iso);
        return d.getTime();
    }
    return NaN;
}

function purgeOldTrash(flow) {
    if (!flow.trash || !flow.trash.length) return 0;
    const now = Date.now();
    const before = flow.trash.length;
    flow.trash = flow.trash.filter(t => {
        const ts = trashTsOf(t);
        if (isNaN(ts)) return false;
        return (now - ts) < TRASH_TTL_MS;
    });
    return before - flow.trash.length;
}

(function startupTasks() {
    try {
        if (!fs.existsSync(FLOW_FILE)) {
            console.log('[flow] aucun fichier flow.json - rien a faire.');
            return;
        }
        const flow = loadFlow();
        // 1) Backup AVANT migration (une seule fois)
        const needsMigration = (flow.tracks || []).some(t => !t.profileId)
            || (flow.playlists || []).some(p => !p.profileId)
            || (flow.trash || []).some(t => !t.profileId);
        if (needsMigration && !fs.existsSync(FLOW_BACKUP_FILE)) {
            try {
                fs.copyFileSync(FLOW_FILE, FLOW_BACKUP_FILE);
                console.log(`[flow] backup cree : ${FLOW_BACKUP_FILE}`);
            } catch (e) { console.error('[flow] backup echoue, on annule la migration:', e.message); return; }
        }
        // 2) Migration profileId
        const migrated = migrateFlowProfiles(flow);
        if (migrated) {
            const counts = {
                tracks: (flow.tracks || []).length,
                playlists: (flow.playlists || []).length,
                trash: (flow.trash || []).length
            };
            console.log(`[flow] migration profils : ${counts.tracks} pistes, ${counts.playlists} playlists, ${counts.trash} corbeille -> assignees au profil par defaut.`);
        }
        // 3) Purge corbeille > 24h
        const purged = purgeOldTrash(flow);
        if (migrated || purged > 0) saveFlow(flow);
        if (purged > 0) console.log(`[flow] purge demarrage : ${purged} titre(s) supprime(s) (>24h).`);
        else if (flow.trash && flow.trash.length > 0) console.log(`[flow] corbeille : ${flow.trash.length} titre(s) en attente (< 24h).`);
    } catch (e) { console.error('[flow] startup echoue:', e.message); }
})();

function saveFlow(data) {
    fs.writeFileSync(FLOW_FILE, JSON.stringify(data, null, 2));
}

router.all('/', (req, res) => {
    const action = req.body.action || req.query.action || 'list';
    const profileId = getProfileId(req);

    switch (action) {
        case 'list': {
            const flow = loadFlow();
            res.json({
                success: true,
                tracks: filterByProfile(flow.tracks, profileId),
                playlists: filterByProfile(flow.playlists, profileId)
            });
            break;
        }

        case 'add': {
            const flow = loadFlow();
            const url = req.body.url || '';
            // Anti-doublon par URL DANS LE PROFIL COURANT
            if (url) {
                const vMatch = url.match(/[?&]v=([^&]+)/);
                const vid = vMatch ? vMatch[1] : '';
                if (vid && flow.tracks.some(t => (t.profileId || '') === profileId && t.url && t.url.includes(vid))) {
                    return res.json({ success: true, duplicate: true });
                }
            }
            const newTrack = {
                id: 'fl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                profileId,
                title: req.body.title || '',
                url: url,
                channel: req.body.channel || '',
                thumbnail: req.body.thumbnail || '',
                duration: req.body.duration || '',
                views: req.body.views || '',
                year: req.body.year || '',
                format: req.body.format || '',
                type: req.body.type || 'audio',
                playlist: req.body.playlist || '',
                addedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
            };
            flow.tracks.push(newTrack);
            saveFlow(flow);
            if (statsRecord) try {
                statsRecord({ ts: newTrack.addedAt, kind: 'add', source: 'flow', profileId,
                    title: newTrack.title, channel: newTrack.channel, url: newTrack.url, format: newTrack.format });
            } catch (e) {}
            res.json({ success: true });
            break;
        }

        case 'add_bulk': {
            const flow = loadFlow();
            let items;
            try { items = JSON.parse(req.body.items || '[]'); } catch (e) { items = []; }
            let added = 0, moved = 0, alreadyThere = 0;
            for (const item of items) {
                const url = item.url || '';
                const vMatch = url.match(/[?&]v=([^&]+)/);
                const vid = vMatch ? vMatch[1] : '';
                const targetPl = item.playlist || '';
                // Cherche un doublon DANS LE PROFIL COURANT uniquement
                const existing = vid ? flow.tracks.find(t => (t.profileId || '') === profileId && t.url && t.url.includes(vid)) : null;
                if (existing) {
                    if (targetPl && existing.playlist !== targetPl) {
                        existing.playlist = targetPl;
                        moved++;
                    } else {
                        alreadyThere++;
                    }
                    continue;
                }
                const bulkTrack = {
                    id: 'fl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    profileId,
                    title: item.title || '',
                    url: url,
                    channel: item.channel || '',
                    thumbnail: item.thumbnail || '',
                    duration: item.duration || '',
                    views: item.views || '',
                    year: item.year || '',
                    format: item.format || '',
                    type: item.type || 'audio',
                    playlist: targetPl,
                    addedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
                };
                flow.tracks.push(bulkTrack);
                if (statsRecord) try {
                    statsRecord({ ts: bulkTrack.addedAt, kind: 'add', source: 'flow', profileId,
                        title: bulkTrack.title, channel: bulkTrack.channel, url: bulkTrack.url, format: bulkTrack.format });
                } catch (e) {}
                added++;
            }
            saveFlow(flow);
            res.json({ success: true, added, moved, alreadyThere });
            break;
        }

        case 'remove': {
            const flow = loadFlow();
            purgeOldTrash(flow);
            const id = req.body.id || '';
            const idx = flow.tracks.findIndex(t => t.id === id && (t.profileId || '') === profileId);
            if (idx >= 0) {
                const track = flow.tracks[idx];
                flow.trash = flow.trash || [];
                const now = Date.now();
                flow.trash.unshift({
                    ...track,
                    deletedTs: now,
                    deletedAt: new Date(now).toLocaleString('fr-FR', { hour12: false }).replace(',', ''),
                    originalIndex: idx
                });
                flow.tracks.splice(idx, 1);
            }
            saveFlow(flow);
            res.json({ success: true });
            break;
        }

        case 'trash_list': {
            const flow = loadFlow();
            const purged = purgeOldTrash(flow);
            if (purged > 0) saveFlow(flow);
            const now = Date.now();
            const items = filterByProfile(flow.trash, profileId).map(t => {
                const ts = trashTsOf(t);
                const remainingMs = isNaN(ts) ? 0 : Math.max(0, TRASH_TTL_MS - (now - ts));
                return { ...t, remainingMs };
            });
            res.json({ success: true, items, purged });
            break;
        }

        case 'trash_restore': {
            const flow = loadFlow();
            purgeOldTrash(flow);
            const id = req.body.id || '';
            const item = (flow.trash || []).find(t => t.id === id && (t.profileId || '') === profileId);
            if (item) {
                const { deletedAt, deletedTs, originalIndex, ...rest } = item;
                let insertAt = (typeof originalIndex === 'number') ? originalIndex : flow.tracks.length;
                if (insertAt > flow.tracks.length) insertAt = flow.tracks.length;
                if (insertAt < 0) insertAt = 0;
                flow.tracks.splice(insertAt, 0, rest);
                flow.trash = flow.trash.filter(t => t.id !== id);
                saveFlow(flow);
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Element introuvable.' });
            }
            break;
        }

        case 'trash_delete': {
            const flow = loadFlow();
            const id = req.body.id || '';
            flow.trash = (flow.trash || []).filter(t => !(t.id === id && (t.profileId || '') === profileId));
            saveFlow(flow);
            res.json({ success: true });
            break;
        }

        case 'trash_clear': {
            const flow = loadFlow();
            // Vide UNIQUEMENT la corbeille du profil courant
            flow.trash = (flow.trash || []).filter(t => (t.profileId || '') !== profileId);
            saveFlow(flow);
            res.json({ success: true });
            break;
        }

        case 'create_playlist': {
            const flow = loadFlow();
            const name = (req.body.name || '').trim();
            if (!name) return res.json({ success: false, error: 'Nom requis.' });
            if (flow.playlists.some(p => p.name === name && (p.profileId || '') === profileId)) {
                return res.json({ success: false, error: 'Existe deja.' });
            }
            flow.playlists.push({
                name, profileId,
                createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });
            saveFlow(flow);
            res.json({ success: true });
            break;
        }

        case 'set_playlist_color': {
            const flow = loadFlow();
            const name = (req.body.name || '').trim();
            const bg = (req.body.bg || '').trim();
            const fg = (req.body.fg || '').trim();
            const isHex = (s) => /^#[0-9a-fA-F]{6}$/.test(s) || s === '';
            if (!name) return res.json({ success: false, error: 'Nom requis.' });
            if (!isHex(bg) || !isHex(fg)) return res.json({ success: false, error: 'Couleur invalide.' });
            let pl = flow.playlists.find(p => p.name === name && (p.profileId || '') === profileId);
            if (!pl) {
                pl = { name, profileId, createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19) };
                flow.playlists.push(pl);
            }
            if (bg) pl.color = bg; else delete pl.color;
            if (fg) pl.textColor = fg; else delete pl.textColor;
            saveFlow(flow);
            res.json({ success: true });
            break;
        }

        case 'delete_playlist': {
            const flow = loadFlow();
            const name = req.body.name || '';
            flow.playlists = flow.playlists.filter(p => !(p.name === name && (p.profileId || '') === profileId));
            // Detache les pistes du profil courant qui pointaient sur cette playlist
            flow.tracks.forEach(t => {
                if (t.playlist === name && (t.profileId || '') === profileId) t.playlist = '';
            });
            saveFlow(flow);
            res.json({ success: true });
            break;
        }

        case 'move': {
            const flow = loadFlow();
            const id = req.body.id || '';
            const playlist = req.body.playlist || '';
            const track = flow.tracks.find(t => t.id === id && (t.profileId || '') === profileId);
            if (track) { track.playlist = playlist; saveFlow(flow); }
            res.json({ success: true });
            break;
        }

        case 'play': {
            const flow = loadFlow();
            const id = req.body.id || '';
            const track = flow.tracks.find(t => t.id === id && (t.profileId || '') === profileId);
            if (track) {
                track.playCount = (track.playCount || 0) + 1;
                track.lastPlayed = new Date().toISOString().replace('T', ' ').substring(0, 19);
                saveFlow(flow);
                if (statsRecord) try {
                    statsRecord({ ts: track.lastPlayed, kind: 'play', source: 'flow', profileId,
                        title: track.title, channel: track.channel, url: track.url, format: track.format });
                } catch (e) {}
            }
            res.json({ success: true });
            break;
        }

        case 'toggle_like': {
            const flow = loadFlow();
            const id = req.body.id || '';
            const track = flow.tracks.find(t => t.id === id && (t.profileId || '') === profileId);
            if (!track) return res.json({ success: false });
            track.liked = !track.liked;
            saveFlow(flow);
            res.json({ success: true, liked: track.liked });
            break;
        }

        case 'top': {
            const flow = loadFlow();
            const top = filterByProfile(flow.tracks, profileId)
                .filter(t => (t.playCount || 0) > 0)
                .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
                .slice(0, 50);
            res.json({ success: true, top });
            break;
        }

        case 'clear': {
            // Vide UNIQUEMENT le profil courant (pistes + playlists + corbeille)
            const flow = loadFlow();
            flow.tracks = (flow.tracks || []).filter(t => (t.profileId || '') !== profileId);
            flow.playlists = (flow.playlists || []).filter(p => (p.profileId || '') !== profileId);
            flow.trash = (flow.trash || []).filter(t => (t.profileId || '') !== profileId);
            saveFlow(flow);
            res.json({ success: true });
            break;
        }

        default:
            res.json({ success: false, error: 'Action inconnue.' });
    }
});

module.exports = router;
