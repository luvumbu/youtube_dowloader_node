const express = require('express');
const fs = require('fs');
const config = require('../config');
const router = express.Router();

function loadHistory() {
    try { return JSON.parse(fs.readFileSync(config.HISTORY_FILE, 'utf8')); }
    catch (e) { return []; }
}

function saveHistory(data) {
    fs.writeFileSync(config.HISTORY_FILE, JSON.stringify(data, null, 2));
}

router.all('/', (req, res) => {
    const action = req.body.action || req.query.action || 'list';

    switch (action) {
        case 'list':
            res.json({ success: true, history: loadHistory().slice(0, 100) });
            break;

        case 'add': {
            const history = loadHistory();
            history.unshift({
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
                date: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });
            saveHistory(history.slice(0, 200));
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
