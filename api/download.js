const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const router = express.Router();

function generateId() {
    return 'yt_' + Date.now().toString(16) + Math.random().toString(16).slice(2, 8);
}

router.post('/', (req, res) => {
    if (!config.YTDLP_AVAILABLE) {
        return res.json({ success: false, error: 'yt-dlp non disponible. Lance start.bat pour installer.' });
    }

    const url = req.body.url || '';
    if (!config.isValidYoutubeUrl(url)) {
        return res.json({ success: false, error: 'URL YouTube invalide.' });
    }

    const params = config.sanitizeDownloadParams(
        req.body.type || 'audio',
        req.body.format || 'mp3',
        req.body.quality || '0'
    );
    const cover = req.body.cover === '1' ? '1' : '0';

    const jobId = generateId();
    const logFile = path.join(config.DOWNLOADS_DIR, `${jobId}.log`);
    fs.writeFileSync(logFile, 'Demarrage...\n');

    // Lancer le worker en arriere-plan
    const worker = spawn('node', [
        path.join(config.ROOT_DIR, 'worker.js'),
        jobId, url, cover, params.type, params.format, params.quality
    ], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
    });
    worker.unref();

    res.json({ success: true, jobId });
});

module.exports = router;
