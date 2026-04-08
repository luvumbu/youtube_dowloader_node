const express = require('express');
const fs = require('fs');
const config = require('../config');
const router = express.Router();

function loadQueue() {
    try { return JSON.parse(fs.readFileSync(config.QUEUE_FILE, 'utf8')); }
    catch (e) { return []; }
}

function saveQueue(queue) {
    fs.writeFileSync(config.QUEUE_FILE, JSON.stringify(queue, null, 2));
}

router.all('/', (req, res) => {
    const action = req.body.action || req.query.action || '';

    switch (action) {
        case 'list':
        case 'poll':
            res.json({ success: true, queue: loadQueue() });
            break;

        case 'add': {
            const url = (req.body.url || '').trim();
            const title = (req.body.title || url).trim();
            if (!url) return res.json({ success: false, error: 'URL vide' });

            const queue = loadQueue();
            if (queue.some(q => q.url === url && ['waiting', 'active'].includes(q.status))) {
                return res.json({ success: true, exists: true });
            }
            queue.push({
                url, title, type: req.body.type || 'audio',
                format: req.body.format || 'mp3', quality: req.body.quality || '0',
                source: req.body.source || 'web', folder: req.body.folder || '',
                status: 'waiting', percent: 0, message: '', jobId: null, added: Date.now()
            });
            saveQueue(queue);
            res.json({ success: true });
            break;
        }

        case 'add_batch': {
            let items = req.body.items;
            if (typeof items === 'string') items = JSON.parse(items);
            if (!Array.isArray(items)) return res.json({ success: false, error: 'Items invalides' });
            const source = req.body.source || 'web';

            const queue = loadQueue();
            const existingUrls = queue.filter(q => ['waiting', 'active'].includes(q.status)).map(q => q.url);
            let added = 0;

            for (const item of items) {
                const url = item.url || '';
                if (!url || existingUrls.includes(url)) continue;
                queue.push({
                    url, title: item.title || url, type: item.type || 'audio',
                    format: item.format || 'mp3', quality: item.quality || '0',
                    source, folder: item.folder || '',
                    status: 'waiting', percent: 0, message: '', jobId: null, added: Date.now()
                });
                existingUrls.push(url);
                added++;
            }
            saveQueue(queue);
            res.json({ success: true, added });
            break;
        }

        case 'update': {
            const url = (req.body.url || '').trim();
            if (!url) return res.json({ success: false, error: 'URL vide' });

            const queue = loadQueue();
            const q = queue.find(q => q.url === url);
            if (q) {
                if (req.body.status !== undefined) q.status = req.body.status;
                if (req.body.percent !== undefined) q.percent = parseInt(req.body.percent);
                if (req.body.message !== undefined) q.message = req.body.message;
                if (req.body.jobId !== undefined) q.jobId = req.body.jobId;
                if (req.body.title !== undefined) q.title = req.body.title;
                saveQueue(queue);
                res.json({ success: true });
            } else {
                res.json({ success: false, error: 'Element non trouve' });
            }
            break;
        }

        case 'remove': {
            const url = (req.body.url || '').trim();
            const queue = loadQueue().filter(q => q.url !== url);
            saveQueue(queue);
            res.json({ success: true });
            break;
        }

        case 'clear': {
            const mode = req.body.mode || 'done';
            let queue = loadQueue();
            if (mode === 'all') {
                queue = [];
            } else {
                queue = queue.filter(q => !['done', 'error', 'skipped'].includes(q.status));
            }
            saveQueue(queue);
            res.json({ success: true });
            break;
        }

        default:
            res.json({ success: false, error: 'Action inconnue' });
    }
});

module.exports = router;
