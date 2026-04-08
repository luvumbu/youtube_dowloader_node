const express = require('express');
const { execFile } = require('child_process');
const config = require('../config');
const router = express.Router();

/**
 * Decompose config.YTDLP_CMD en { cmd, baseArgs }
 * pour utiliser execFile (pas de shell = pas d'injection).
 */
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
    if (!config.isValidYoutubeUrl(url)) {
        return res.json({ success: false, error: 'URL YouTube invalide.' });
    }

    if (!config.YTDLP_AVAILABLE) {
        return res.json({ success: false, error: 'yt-dlp non disponible. Lance start.bat pour installer.' });
    }

    const { cmd, baseArgs } = getYtdlpExec();
    const args = [...baseArgs, '--dump-json', '--no-playlist', '--no-warnings', '--remote-components', 'ejs:github', url];

    execFile(cmd, args, { timeout: 30000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
        if (err) {
            return res.json({ success: false, error: 'Impossible de recuperer la video.' });
        }

        try {
            const data = JSON.parse(stdout);
            if (!data || !data.title) {
                return res.json({ success: false, error: 'Impossible de recuperer la video.' });
            }

            const views = data.view_count || 0;
            let viewsDisplay;
            if (views >= 1e9) viewsDisplay = (views / 1e9).toFixed(1) + ' Md';
            else if (views >= 1e6) viewsDisplay = (views / 1e6).toFixed(1) + ' M';
            else if (views >= 1e3) viewsDisplay = (views / 1e3).toFixed(1) + ' k';
            else viewsDisplay = String(views);

            const uploadDate = data.upload_date || '';
            const year = uploadDate ? uploadDate.substring(0, 4) : '';

            res.json({
                success: true,
                title: data.title,
                thumbnail: data.thumbnail || '',
                duration: data.duration_string || '',
                channel: data.channel || '',
                views,
                views_display: viewsDisplay + ' vues',
                year,
                likes: data.like_count || 0,
                dislikes: data.dislike_count || 0
            });
        } catch (e) {
            res.json({ success: false, error: 'Impossible de recuperer la video.' });
        }
    });
});

module.exports = router;
