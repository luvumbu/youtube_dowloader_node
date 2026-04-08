const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const router = express.Router();

const FLOW_FILE = path.join(config.DATA_DIR, 'flow.json');

function loadFlow() {
    try { return JSON.parse(fs.readFileSync(FLOW_FILE, 'utf8')); }
    catch (e) { return { tracks: [], playlists: [] }; }
}

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
            flow.tracks.push({
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
            });
            saveFlow(flow);
            res.json({ success: true });
            break;
        }

        case 'add_bulk': {
            const flow = loadFlow();
            let items;
            try { items = JSON.parse(req.body.items || '[]'); } catch (e) { items = []; }
            let added = 0;
            for (const item of items) {
                const url = item.url || '';
                const vMatch = url.match(/[?&]v=([^&]+)/);
                const vid = vMatch ? vMatch[1] : '';
                if (vid && flow.tracks.some(t => t.url && t.url.includes(vid))) continue;
                flow.tracks.push({
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
                    playlist: item.playlist || '',
                    addedAt: new Date().toISOString().replace('T', ' ').substring(0, 19)
                });
                added++;
            }
            saveFlow(flow);
            res.json({ success: true, added });
            break;
        }

        case 'remove': {
            const flow = loadFlow();
            const id = req.body.id || '';
            flow.tracks = flow.tracks.filter(t => t.id !== id);
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
            }
            res.json({ success: true });
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
