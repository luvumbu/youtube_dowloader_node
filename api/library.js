const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const config = require('../config');
const router = express.Router();

function loadLib() {
    try {
        return JSON.parse(fs.readFileSync(config.LIBRARY_FILE, 'utf8'));
    } catch (e) {
        return { folders: [], items: [] };
    }
}

function saveLib(data) {
    fs.writeFileSync(config.LIBRARY_FILE, JSON.stringify(data, null, 2));
}

function downloadImage(url) {
    return new Promise((resolve) => {
        const mod = url.startsWith('https') ? require('https') : require('http');
        mod.get(url, { rejectUnauthorized: false, timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', () => resolve(null));
    });
}

// GET et POST sur meme route
router.all('/', async (req, res) => {
    const action = req.body.action || req.query.action || '';
    const lib = loadLib();

    switch (action) {
        case 'list': {
            // Supprimer items dont le fichier n'existe plus
            lib.items = lib.items.filter(item => {
                const filePath = path.join(config.ROOT_DIR, item.file);
                return fs.existsSync(filePath);
            });
            saveLib(lib);

            const items = lib.items;
            res.json({
                success: true,
                folders: lib.folders,
                items,
                stats: {
                    total: items.length,
                    audio: items.filter(i => i.type === 'audio').length,
                    video: items.filter(i => i.type === 'video').length
                }
            });
            break;
        }

        case 'add_item': {
            const p = req.body;
            const url = p.url || '';
            const format = p.format || 'mp3';

            // Anti-doublon
            if (url) {
                const m = url.match(/[?&]v=([^&]+)/);
                const videoId = m ? m[1] : '';
                if (videoId) {
                    for (const existing of lib.items) {
                        if (existing.url && existing.url.includes(videoId) && (existing.format || '') === format) {
                            const folder = p.folder || '';
                            if (folder && (existing.folder || '') !== folder) {
                                existing.folder = folder;
                                saveLib(lib);
                            }
                            return res.json({ success: true, item: existing, duplicate: true });
                        }
                    }
                }
            }

            const item = {
                id: 'item_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                file: p.file || '',
                title: p.title || '',
                type: p.type || 'audio',
                format,
                folder: p.folder || '',
                thumbnail: p.thumbnail || '',
                channel: p.channel || '',
                duration: p.duration || '',
                date: new Date().toISOString().replace('T', ' ').substring(0, 19),
                cover: p.cover || '',
                url
            };

            lib.items.push(item);
            saveLib(lib);
            res.json({ success: true, item });
            break;
        }

        case 'move_item': {
            const itemId = req.body.item_id || '';
            const folderId = req.body.folder_id || '';
            const item = lib.items.find(i => i.id === itemId);
            if (item) { item.folder = folderId; saveLib(lib); }
            res.json({ success: true });
            break;
        }

        case 'delete_item': {
            const itemId = req.body.item_id || '';
            const item = lib.items.find(i => i.id === itemId);
            if (item) {
                const filePath = path.join(config.ROOT_DIR, item.file);
                try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
                if (item.cover) {
                    const coverPath = path.join(config.ROOT_DIR, item.cover);
                    try { if (fs.existsSync(coverPath)) fs.unlinkSync(coverPath); } catch (e) {}
                }
            }
            lib.items = lib.items.filter(i => i.id !== itemId);
            saveLib(lib);
            res.json({ success: true });
            break;
        }

        case 'create_folder': {
            const name = (req.body.name || '').trim();
            if (!name) return res.json({ success: false, error: 'Nom de dossier vide.' });
            const existing = lib.folders.find(f => f.name.toLowerCase() === name.toLowerCase());
            if (existing) return res.json({ success: true, folder: existing });

            const folder = {
                id: 'folder_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                name,
                date: new Date().toISOString().replace('T', ' ').substring(0, 19)
            };
            lib.folders.push(folder);
            saveLib(lib);
            res.json({ success: true, folder });
            break;
        }

        case 'rename_folder': {
            const folderId = req.body.folder_id || '';
            const newName = (req.body.name || '').trim();
            if (!newName) return res.json({ success: false, error: 'Nom vide.' });
            const f = lib.folders.find(f => f.id === folderId);
            if (f) { f.name = newName; saveLib(lib); }
            res.json({ success: true });
            break;
        }

        case 'delete_folder': {
            const folderId = req.body.folder_id || '';
            lib.folders = lib.folders.filter(f => f.id !== folderId);
            lib.items.forEach(item => { if (item.folder === folderId) item.folder = ''; });
            saveLib(lib);
            res.json({ success: true });
            break;
        }

        case 'check_url': {
            const url = req.query.url || '';
            const checkFormat = req.query.format || '';
            let found = false;
            if (url) {
                const m = url.match(/[?&]v=([^&]+)/);
                const videoId = m ? m[1] : '';
                if (videoId) {
                    for (const item of lib.items) {
                        if (item.url && item.url.includes(videoId)) {
                            if (checkFormat) {
                                if ((item.format || '') === checkFormat) { found = true; break; }
                            } else {
                                found = true; break;
                            }
                        }
                    }
                }
            }
            res.json({ success: true, exists: found });
            break;
        }

        case 'fix_covers': {
            let fixed = 0;
            for (const item of lib.items) {
                if (item.cover && fs.existsSync(path.join(config.DOWNLOADS_DIR, path.basename(item.cover)))) continue;

                const baseName = path.parse(item.file || '').name;
                if (!baseName) continue;
                const coverPath = path.join(config.DOWNLOADS_DIR, baseName + '.jpg');

                if (fs.existsSync(coverPath)) {
                    item.cover = 'downloads/' + baseName + '.jpg';
                    fixed++;
                    continue;
                }

                // Telecharger depuis thumbnail ou YouTube
                const thumbUrl = item.thumbnail || '';
                let done = false;

                if (thumbUrl) {
                    const imgData = await downloadImage(thumbUrl);
                    if (imgData && imgData.length > 1000) {
                        fs.writeFileSync(coverPath, imgData);
                        item.cover = 'downloads/' + baseName + '.jpg';
                        fixed++;
                        done = true;
                    }
                }

                if (!done) {
                    const m = (item.url || '').match(/[?&]v=([\w-]+)/);
                    if (m) {
                        const tryUrls = [
                            `https://i.ytimg.com/vi/${m[1]}/maxresdefault.jpg`,
                            `https://i.ytimg.com/vi/${m[1]}/sddefault.jpg`,
                            `https://i.ytimg.com/vi/${m[1]}/hqdefault.jpg`,
                            `https://i.ytimg.com/vi/${m[1]}/mqdefault.jpg`
                        ];
                        for (const tryUrl of tryUrls) {
                            const imgData = await downloadImage(tryUrl);
                            if (imgData && imgData.length > 1000) {
                                fs.writeFileSync(coverPath, imgData);
                                item.cover = 'downloads/' + baseName + '.jpg';
                                item.thumbnail = tryUrl;
                                fixed++;
                                break;
                            }
                        }
                    }
                }
            }
            if (fixed > 0) saveLib(lib);
            res.json({ success: true, fixed });
            break;
        }

        case 'clean_duplicates': {
            const seen = {};
            let removed = 0;
            const cleaned = [];
            for (const item of lib.items) {
                const m = (item.url || '').match(/[?&]v=([^&]+)/);
                const videoId = m ? m[1] : '';
                const key = videoId + '|' + (item.format || '');
                if (videoId && seen[key]) { removed++; continue; }
                if (videoId) seen[key] = true;
                cleaned.push(item);
            }
            if (removed > 0) {
                lib.items = cleaned;
                saveLib(lib);
            }
            res.json({ success: true, removed });
            break;
        }

        default:
            res.json({ success: false, error: 'Action inconnue.' });
    }
});

module.exports = router;
