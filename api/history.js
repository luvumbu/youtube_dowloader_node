const express = require('express');
const fs = require('fs');
const config = require('../config');
const router = express.Router();

let statsRecord = null;
try { statsRecord = require('./stats').recordEvent; } catch (e) { /* stats module optionnel */ }

function loadHistory() {
    try { return JSON.parse(fs.readFileSync(config.HISTORY_FILE, 'utf8')); }
    catch (e) { return []; }
}

function saveHistory(data) {
    fs.writeFileSync(config.HISTORY_FILE, JSON.stringify(data, null, 2));
}

router.all('/', (req, res) => {
    const action = req.body.action || req.query.action || 'list';
    const profileId = req.body.profile || req.query.profile || '';

    switch (action) {
        case 'list':
            res.json({ success: true, history: loadHistory().slice(0, 100) });
            break;

        case 'add': {
            const history = loadHistory();
            const entry = {
                title: req.body.title || '',
                status: req.body.status || 'success',
                format: req.body.format || '',
                type: req.body.type || '',
                url: req.body.url || '',
                channel: req.body.channel || '',
                views: req.body.views || '',
                year: req.body.year || '',
                likes: req.body.likes || '',
                dislikes: req.body.dislikes || '',
                thumbnail: req.body.thumbnail || '',
                source: req.body.source || 'local',
                date: new Date().toISOString().replace('T', ' ').substring(0, 19)
            };
            history.unshift(entry);
            saveHistory(history.slice(0, 200));
            if (statsRecord && entry.status === 'success') {
                try {
                    statsRecord({
                        ts: entry.date, kind: 'dl',
                        source: entry.type === 'video' ? 'video' : 'audio',
                        title: entry.title, channel: entry.channel,
                        url: entry.url, format: entry.format,
                        profileId
                    });
                } catch (e) { /* stats best-effort */ }
            }
            res.json({ success: true });
            break;
        }

        case 'clear':
            saveHistory([]);
            res.json({ success: true });
            break;

        default:
            res.json({ success: false, error: 'Action inconnue.' });
    }
});

module.exports = router;
