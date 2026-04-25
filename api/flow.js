const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const router = express.Router();

const FLOW_FILE = path.join(config.DATA_DIR, 'flow.json');

let statsRecord = null;
try { statsRecord = require('./stats').recordEvent; } catch (e) { /* stats module optionnel */ }

function loadFlow() {
    try {
        const data = JSON.parse(fs.readFileSync(FLOW_FILE, 'utf8'));
        if (!data.trash) data.trash = [];
        return data;
    } catch (e) { return { tracks: [], playlists: [], trash: [] }; }
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

(function purgeAtStartup() {
    try {
        if (!fs.existsSync(FLOW_FILE)) {
            console.log('[flow] aucun fichier flow.json - rien a purger.');
            return;
        }
        const flow = loadFlow();
        const purged = purgeOldTrash(flow);
        if (purged > 0) {
            saveFlow(flow);
            console.log(`[flow] purge demarrage : ${purged} titre(s) supprime(s) definitivement de la corbeille (> 24h).`);
        } else if (flow.trash && flow.trash.length > 0) {
            console.log(`[flow] corbeille : ${flow.trash.length} titre(s) en attente (< 24h).`);
        }
    } catch (e) { console.error('[flow] purge demarrage echouee:', e.message); }
})();

function saveFlow(data) {
    fs.writeFileSync(FLOW_FILE, JSON.stringify(data, null, 2));
}

router.all('/', (req, res) => {
    const action = req.body.action || req.query.action || 'list';

    switch (action) {
        case 'list': {
            const flow = loadFlow();
            res.json({ success: true, tracks: flow.tracks || [], playlists: flow.playlists || [] });
            break;
        }

        case 'add': {
            const flow = loadFlow();
            const url = req.body.url || '';
            // Anti-doublon par URL
            if (url) {
                const vMatch = url.match(/[?&]v=([^&]+)/);
                const vid = vMatch ? vMatch[1] : '';
                if (vid && flow.tracks.some(t => t.url && t.url.includes(vid))) {
                    return res.json({ success: true, duplicate: true });
                }
            }
            const newTrack = {
                id: 'fl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
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
                statsRecord({ ts: newTrack.addedAt, kind: 'add', source: 'flow',
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
                const existing = vid ? flow.tracks.find(t => t.url && t.url.includes(vid)) : null;
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
                    statsRecord({ ts: bulkTrack.addedAt, kind: 'add', source: 'flow',
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
            const idx = flow.tracks.findIndex(t => t.id === id);
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
            const items = (flow.trash || []).map(t => {
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
            const item = (flow.trash || []).find(t => t.id === id);
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
            flow.trash = (flow.trash || []).filter(t => t.id !== id);
            saveFlow(flow);
            res.json({ success: true });
            break;
        }

        case 'trash_clear': {
            const flow = loadFlow();
            flow.trash = [];
            saveFlow(flow);
            res.json({ success: true });
            break;
        }

        case 'create_playlist': {
            const flow = loadFlow();
            const name = (req.body.name || '').trim();
            if (!name) return res.json({ success: false, error: 'Nom requis.' });
            if (flow.playlists.some(p => p.name === name)) return res.json({ success: false, error: 'Existe deja.' });
            flow.playlists.push({ name, createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19) });
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
            let pl = flow.playlists.find(p => p.name === name);
            if (!pl) {
                pl = { name, createdAt: new Date().toISOString().replace('T', ' ').substring(0, 19) };
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
            flow.playlists = flow.playlists.filter(p => p.name !== name);
            flow.tracks.forEach(t => { if (t.playlist === name) t.playlist = ''; });
            saveFlow(flow);
            res.json({ success: true });
            break;
        }

        case 'move': {
            const flow = loadFlow();
            const id = req.body.id || '';
            const playlist = req.body.playlist || '';
            const track = flow.tracks.find(t => t.id === id);
            if (track) { track.playlist = playlist; saveFlow(flow); }
            res.json({ success: true });
            break;
        }

        case 'play': {
            const flow = loadFlow();
            const id = req.body.id || '';
            const track = flow.tracks.find(t => t.id === id);
            if (track) {
                track.playCount = (track.playCount || 0) + 1;
                track.lastPlayed = new Date().toISOString().replace('T', ' ').substring(0, 19);
                saveFlow(flow);
                if (statsRecord) try {
                    statsRecord({ ts: track.lastPlayed, kind: 'play', source: 'flow',
                        title: track.title, channel: track.channel, url: track.url, format: track.format });
                } catch (e) {}
            }
            res.json({ success: true });
            break;
        }

        case 'toggle_like': {
            const flow = loadFlow();
            const id = req.body.id || '';
            const track = flow.tracks.find(t => t.id === id);
            if (!track) return res.json({ success: false });
            track.liked = !track.liked;
            saveFlow(flow);
            res.json({ success: true, liked: track.liked });
            break;
        }

        case 'top': {
            const flow = loadFlow();
            const top = [...flow.tracks]
                .filter(t => (t.playCount || 0) > 0)
                .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
                .slice(0, 50);
            res.json({ success: true, top });
            break;
        }

        case 'clear':
            saveFlow({ tracks: [], playlists: [] });
            res.json({ success: true });
            break;

        default:
            res.json({ success: false, error: 'Action inconnue.' });
    }
});

module.exports = router;
