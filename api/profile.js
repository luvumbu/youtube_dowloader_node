const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const router = express.Router();

function loadProfiles() {
    try { return JSON.parse(fs.readFileSync(config.PROFILES_FILE, 'utf8')); }
    catch (e) { return []; }
}

function saveProfiles(profiles) {
    fs.writeFileSync(config.PROFILES_FILE, JSON.stringify(profiles, null, 2));
}

router.all('/', (req, res) => {
    const action = req.body.action || req.query.action || '';
    const profiles = loadProfiles();

    switch (action) {
        case 'list': {
            const list = profiles.map(p => ({
                id: p.id, username: p.username,
                download_count: p.download_count || 0,
                created: p.created || ''
            }));
            res.json({ success: true, profiles: list });
            break;
        }

        case 'save': {
            const username = (req.body.username || '').trim();
            if (!username) return res.json({ success: false, error: 'Nom d\'utilisateur vide.' });

            const updatableFields = ['pref_type', 'pref_format_audio', 'pref_format_video',
                'pref_quality_audio', 'pref_quality_video', 'pref_cover'];

            let profile = profiles.find(p => p.username === username);
            if (profile) {
                for (const field of updatableFields) {
                    if (req.body[field] !== undefined) profile[field] = req.body[field];
                }
                profile.last_seen = new Date().toISOString().replace('T', ' ').substring(0, 19);
            } else {
                profile = {
                    id: 'user_' + Date.now().toString(36),
                    username,
                    pref_type: req.body.pref_type || 'audio',
                    pref_format_audio: req.body.pref_format_audio || 'mp3',
                    pref_format_video: req.body.pref_format_video || 'mp4',
                    pref_quality_audio: req.body.pref_quality_audio || '0',
                    pref_quality_video: req.body.pref_quality_video || 'best',
                    pref_cover: req.body.pref_cover || '0',
                    download_count: 0,
                    created: new Date().toISOString().replace('T', ' ').substring(0, 19),
                    last_seen: new Date().toISOString().replace('T', ' ').substring(0, 19)
                };
                profiles.push(profile);
            }
            saveProfiles(profiles);
            res.json({ success: true, profile });
            break;
        }

        case 'load': {
            const username = req.query.username || req.body.username || '';
            const profile = profiles.find(p => p.username === username);
            if (profile) {
                profile.last_seen = new Date().toISOString().replace('T', ' ').substring(0, 19);
                saveProfiles(profiles);
                res.json({ success: true, profile });
            } else {
                res.json({ success: false, error: 'Profil introuvable.' });
            }
            break;
        }

        case 'increment': {
            const username = req.body.username || '';
            const profile = profiles.find(p => p.username === username);
            if (profile) {
                profile.download_count = (profile.download_count || 0) + 1;
                profile.last_seen = new Date().toISOString().replace('T', ' ').substring(0, 19);
                saveProfiles(profiles);
            }
            res.json({ success: true });
            break;
        }

        case 'logout':
            res.json({ success: true });
            break;

        case 'delete': {
            const username = (req.body.username || req.query.username || '').trim();
            if (!username) return res.json({ success: false, error: 'Nom requis.' });
            const idx = profiles.findIndex(p => p.username === username);
            if (idx < 0) return res.json({ success: false, error: 'Profil introuvable.' });
            const profile = profiles[idx];
            const profileId = profile.id;

            // Cascade dans flow.json (pistes / playlists / corbeille du profil)
            let flowTracks = 0, flowPlaylists = 0, flowTrash = 0;
            try {
                const flowFile = path.join(config.DATA_DIR, 'flow.json');
                if (fs.existsSync(flowFile)) {
                    const flow = JSON.parse(fs.readFileSync(flowFile, 'utf8'));
                    flowTracks = (flow.tracks || []).filter(t => (t.profileId || '') === profileId).length;
                    flowPlaylists = (flow.playlists || []).filter(p => (p.profileId || '') === profileId).length;
                    flowTrash = (flow.trash || []).filter(t => (t.profileId || '') === profileId).length;
                    flow.tracks = (flow.tracks || []).filter(t => (t.profileId || '') !== profileId);
                    flow.playlists = (flow.playlists || []).filter(p => (p.profileId || '') !== profileId);
                    flow.trash = (flow.trash || []).filter(t => (t.profileId || '') !== profileId);
                    fs.writeFileSync(flowFile, JSON.stringify(flow, null, 2));
                }
            } catch (e) { console.error('[profile] cascade flow:', e.message); }

            // Cascade dans les partitions stats
            let statsDeleted = 0;
            try {
                const statsDir = path.join(config.DATA_DIR, 'stats');
                if (fs.existsSync(statsDir)) {
                    const files = fs.readdirSync(statsDir).filter(n => /^(all|\d{4}|\d{4}-\d{2})\.json$/.test(n));
                    for (const f of files) {
                        const fp = path.join(statsDir, f);
                        try {
                            const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
                            if (!data.events) continue;
                            const before = data.events.length;
                            data.events = data.events.filter(e => (e.profileId || '') !== profileId);
                            const removed = before - data.events.length;
                            if (removed > 0) {
                                statsDeleted += removed;
                                fs.writeFileSync(fp, JSON.stringify(data));
                            }
                        } catch (e) {}
                    }
                }
            } catch (e) { console.error('[profile] cascade stats:', e.message); }

            // Supprimer le profil de profiles.json
            profiles.splice(idx, 1);
            saveProfiles(profiles);
            console.log(`[profile] supprime : ${username} (${profileId}) - flow: ${flowTracks} pistes, ${flowPlaylists} playlists, ${flowTrash} corbeille / stats: ${statsDeleted} events`);
            res.json({
                success: true,
                profileId,
                flowTracks, flowPlaylists, flowTrash,
                statsDeleted,
                remaining: profiles.length
            });
            break;
        }

        default:
            res.json({ success: false, error: 'Action inconnue.' });
    }
});

module.exports = router;
