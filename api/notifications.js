const express = require('express');
const fs = require('fs');
const config = require('../config');
const router = express.Router();

function loadNotifs() {
    try { return JSON.parse(fs.readFileSync(config.NOTIFICATIONS_FILE, 'utf8')); }
    catch (e) { return []; }
}

function saveNotifs(notifs) {
    fs.writeFileSync(config.NOTIFICATIONS_FILE, JSON.stringify(notifs));
}

router.all('/', (req, res) => {
    const action = req.body.action || req.query.action || '';

    switch (action) {
        case 'list':
            res.json({ success: true, notifications: loadNotifs() });
            break;

        case 'add': {
            const type = req.body.type || 'info';
            const title = (req.body.title || '').trim();
            const detail = (req.body.detail || '').trim();
            const source = req.body.source || 'web';
            if (!title) return res.json({ success: false, error: 'Titre vide' });

            const notifs = loadNotifs();
            notifs.unshift({
                type, title, detail, source,
                time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                timestamp: Date.now()
            });
            saveNotifs(notifs.slice(0, 100));
            res.json({ success: true });
            break;
        }

        case 'clear':
            saveNotifs([]);
            res.json({ success: true });
            break;

        default:
            res.json({ success: false, error: 'Action inconnue' });
    }
});

module.exports = router;
