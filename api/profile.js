const express = require('express');
const fs = require('fs');
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

        default:
            res.json({ success: false, error: 'Action inconnue.' });
    }
});

module.exports = router;
