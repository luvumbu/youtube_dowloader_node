const express = require('express');
const { execFile } = require('child_process');
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

router.post('/', (req, res) => {
    const url = req.body.url || '';
    if (!url || !url.includes('list=')) {
        return res.json({ success: false, error: 'URL de playlist invalide.' });
    }

    if (!config.isValidYoutubeUrl(url)) {
        return res.json({ success: false, error: 'URL YouTube invalide.' });
    }

    if (!config.YTDLP_AVAILABLE) {
        return res.json({ success: false, error: 'yt-dlp non disponible. Lance start.bat pour installer.' });
    }

    const { cmd, baseArgs } = getYtdlpExec();
    const args = [...baseArgs, '--flat-playlist', '--dump-json', '--no-warnings', '--remote-components', 'ejs:github', url];

    execFile(cmd, args, { timeout: 60000, windowsHide: true, maxBuffer: 50 * 1024 * 1024 }, (err, stdout) => {
        if (err) {
            return res.json({ success: false, error: 'Impossible de lire la playlist.' });
        }

        const videos = [];
        for (const line of stdout.trim().split('\n')) {
            try {
                const data = JSON.parse(line);
                if (data && data.title) {
                    videos.push({
                        url: 'https://www.youtube.com/watch?v=' + (data.id || ''),
                        title: data.title,
                        thumbnail: (data.thumbnails && data.thumbnails[0] ? data.thumbnails[0].url : '') || data.thumbnail || '',
                        duration: data.duration_string || (data.duration ? new Date(data.duration * 1000).toISOString().substr(14, 5) : ''),
                        channel: data.channel || data.uploader || ''
                    });
                }
            } catch (e) {}
        }

        if (videos.length === 0) {
            return res.json({ success: false, error: 'Impossible de lire la playlist.' });
        }

        res.json({
            success: true,
            title: `Playlist (${videos.length} videos)`,
            videos
        });
    });
});

module.exports = router;
