const express = require('express');
const fs = require('fs');
const config = require('../config');
const router = express.Router();

function loadNotifs() {
    try {
        const data = JSON.parse(fs.readFileSync(config.NOTIFICATIONS_FILE, 'utf8'));
        return data.map(n => ({ read: false, ...n }));
    }
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
            const ts = Date.now();
            notifs.unshift({
                id: 'n_' + ts + '_' + Math.random().toString(36).slice(2, 8),
                type, title, detail, source,
                time: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
                timestamp: ts,
                read: false
            });
            saveNotifs(notifs.slice(0, 100));
            res.json({ success: true });
            break;
        }

        case 'markRead': {
            const id = req.body.id || req.query.id;
            if (!id) return res.json({ success: false, error: 'id requis' });
            const notifs = loadNotifs();
            const item = notifs.find(n => n.id === id);
            if (item) item.read = true;
            saveNotifs(notifs);
            res.json({ success: true });
            break;
        }

        case 'markUnread': {
            const id = req.body.id || req.query.id;
            if (!id) return res.json({ success: false, error: 'id requis' });
            const notifs = loadNotifs();
            const item = notifs.find(n => n.id === id);
            if (item) item.read = false;
            saveNotifs(notifs);
            res.json({ success: true });
            break;
        }

        case 'markAllRead': {
            const notifs = loadNotifs();
            notifs.forEach(n => { n.read = true; });
            saveNotifs(notifs);
            res.json({ success: true });
            break;
        }

        case 'clearRead': {
            const notifs = loadNotifs().filter(n => !n.read);
            saveNotifs(notifs);
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
