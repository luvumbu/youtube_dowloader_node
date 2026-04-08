const express = require('express');
const { execFile } = require('child_process');
const config = require('../config');
const { getCache } = require('./cache');
const router = express.Router();

const searchCache = getCache('search', 5 * 60 * 1000); // 5 min

function getYtdlpExec() {
    const ytdlpCmd = config.YTDLP_CMD;
    const pythonMatch = ytdlpCmd.match(/^"?(.+?)"?\s+-m\s+yt_dlp$/);
    if (pythonMatch) {
        return { cmd: pythonMatch[1], baseArgs: ['-m', 'yt_dlp'] };
    }
    return { cmd: ytdlpCmd.replace(/^"|"$/g, ''), baseArgs: [] };
}

router.get('/', (req, res) => {
    const query = (req.query.q || '').trim();
    const max = Math.min(parseInt(req.query.max) || 10, 50);

    if (!query) return res.json({ success: false, error: 'Requete vide.' });

    if (!config.YTDLP_AVAILABLE) {
        return res.json({ success: false, error: 'yt-dlp non disponible. Lance start.bat pour installer.' });
    }

    const cacheKey = query + ':' + max;
    const cached = searchCache.get(cacheKey);
    if (cached) return res.json(cached);

    const { cmd, baseArgs } = getYtdlpExec();
    const args = [...baseArgs, '--flat-playlist', '--dump-json', '--no-warnings', '--remote-components', 'ejs:github', '--default-search', `ytsearch${max}`, query];

    execFile(cmd, args, { timeout: 30000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) {
            return res.json({ success: true, results: [] });
        }

        const results = [];
        for (const line of stdout.trim().split('\n')) {
            try {
                const data = JSON.parse(line);
                if (data && data.title) {
                    results.push({
                        url: 'https://www.youtube.com/watch?v=' + (data.id || ''),
                        title: data.title,
                        thumbnail: (data.thumbnails && data.thumbnails[0] ? data.thumbnails[0].url : '') || data.thumbnail || '',
                        duration: data.duration_string || (data.duration ? new Date(data.duration * 1000).toISOString().substr(14, 5) : ''),
                        channel: data.channel || data.uploader || ''
                    });
                }
            } catch (e) {}
        }

        const result = { success: true, results };
        searchCache.set(cacheKey, result);
        res.json(result);
    });
});

module.exports = router;
