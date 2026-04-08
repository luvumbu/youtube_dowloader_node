const express = require('express');
const { execFile } = require('child_process');
const https = require('https');
const http = require('http');
const config = require('../config');
const router = express.Router();

function getYtdlpExec() {
    const ytdlpCmd = config.YTDLP_CMD;
    const pythonMatch = ytdlpCmd.match(/^"?(.+?)"?\s+-m\s+yt_dlp$/);
    if (pythonMatch) {
        return { cmd: pythonMatch[1], baseArgs: ['-m', 'yt_dlp'] };
    }
    return { cmd: ytdlpCmd.replace(/^"|"$/g, ''), baseArgs: [] };
}

// Cache des URLs de stream (valides ~6h)
const streamCache = new Map();
const CACHE_TTL = 4 * 3600 * 1000;

function getCached(key) {
    const entry = streamCache.get(key);
    if (entry && Date.now() - entry.time < CACHE_TTL) return entry.url;
    streamCache.delete(key);
    return null;
}

function setCache(key, url) {
    streamCache.set(key, { url, time: Date.now() });
    if (streamCache.size > 200) {
        const now = Date.now();
        for (const [k, v] of streamCache) {
            if (now - v.time > CACHE_TTL) streamCache.delete(k);
        }
    }
}

function getStreamUrl(url, type) {
    return new Promise((resolve, reject) => {
        const cacheKey = url + ':' + type;
        const cached = getCached(cacheKey);
        if (cached) return resolve(cached);

        const { cmd, baseArgs } = getYtdlpExec();

        // Forcer un format compatible navigateur
        let formatArg;
        if (type === 'video') {
            formatArg = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[height<=720]';
        } else {
            formatArg = 'bestaudio[ext=m4a]/bestaudio[ext=mp4]/bestaudio';
        }

        const args = [
            ...baseArgs,
            '-f', formatArg,
            '--get-url',
            '--no-playlist',
            '--no-warnings',
            '--remote-components', 'ejs:github',
            url
        ];

        execFile(cmd, args, { timeout: 30000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
            if (err) return reject(new Error('Impossible de recuperer le flux.'));

            const urls = stdout.trim().split('\n').filter(Boolean);
            if (urls.length === 0) return reject(new Error('Aucun flux disponible.'));

            setCache(cacheKey, urls[0]);
            resolve(urls[0]);
        });
    });
}

// GET /api/stream?url=YOUTUBE_URL&type=audio|video
// Retourne l'URL du flux (pour info)
router.get('/', async (req, res) => {
    const url = req.query.url || '';
    const type = req.query.type || 'audio';

    if (!config.isValidYoutubeUrl(url)) {
        return res.json({ success: false, error: 'URL YouTube invalide.' });
    }
    if (!config.YTDLP_AVAILABLE) {
        return res.json({ success: false, error: 'yt-dlp non disponible.' });
    }

    try {
        const streamUrl = await getStreamUrl(url, type);
        // Retourner l'URL du proxy local
        const proxyUrl = '/api/stream/play?url=' + encodeURIComponent(url) + '&type=' + type;
        res.json({ success: true, streamUrl: proxyUrl });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// GET /api/stream/play?url=YOUTUBE_URL&type=audio|video
// Proxy : le navigateur charge cette URL, le serveur redirige le flux YouTube avec les bons headers
router.get('/play', async (req, res) => {
    const url = req.query.url || '';
    const type = req.query.type || 'audio';

    if (!config.isValidYoutubeUrl(url)) {
        return res.status(400).send('URL invalide');
    }

    try {
        const streamUrl = await getStreamUrl(url, type);

        // Proxy le flux YouTube vers le navigateur avec les bons headers
        const client = streamUrl.startsWith('https') ? https : http;

        const rangeHeader = req.headers.range;

        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        };
        if (rangeHeader) headers['Range'] = rangeHeader;

        const proxyReq = client.get(streamUrl, { headers }, (proxyRes) => {
            const contentType = type === 'video' ? 'video/mp4' : 'audio/mp4';

            const resHeaders = {
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache'
            };

            if (proxyRes.headers['content-length']) {
                resHeaders['Content-Length'] = proxyRes.headers['content-length'];
            }
            if (proxyRes.headers['content-range']) {
                resHeaders['Content-Range'] = proxyRes.headers['content-range'];
            }

            res.writeHead(proxyRes.statusCode, resHeaders);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', () => {
            if (!res.headersSent) res.status(502).send('Erreur de flux');
        });

        req.on('close', () => {
            proxyReq.destroy();
        });

    } catch (e) {
        if (!res.headersSent) res.status(500).send('Erreur: ' + e.message);
    }
});

module.exports = router;
