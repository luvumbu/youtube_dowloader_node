const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
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

function formatSize(bytes) {
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(1) + ' Go';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' Mo';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' Ko';
    return bytes + ' o';
}

router.all('/', (req, res) => {
    const action = req.body.action || req.query.action || 'info';

    switch (action) {
        case 'info': {
            const { cmd, baseArgs } = getYtdlpExec();

            // Version yt-dlp (non-bloquant)
            execFile(cmd, [...baseArgs, '--version'], { timeout: 10000, windowsHide: true }, (err, stdout) => {
                const version = err ? 'inconnue' : stdout.trim();

                let totalSize = 0;
                try {
                    const files = fs.readdirSync(config.DOWNLOADS_DIR);
                    for (const f of files) {
                        try {
                            const stat = fs.statSync(path.join(config.DOWNLOADS_DIR, f));
                            if (stat.isFile()) totalSize += stat.size;
                        } catch (e) {}
                    }
                } catch (e) {}

                // Verifier les dependances
                const deps = config.checkDependencies();

                res.json({
                    success: true,
                    ytdlp_version: version,
                    disk_usage: totalSize,
                    disk_display: formatSize(totalSize),
                    dependencies: deps
                });
            });
            break;
        }

        case 'update': {
            if (!config.YTDLP_AVAILABLE) {
                return res.json({ success: false, output: 'yt-dlp non disponible.' });
            }

            // Toujours utiliser pip pour la mise a jour (plus fiable)
            if (config.PYTHON_AVAILABLE && config.PYTHON_PATH) {
                execFile(config.PYTHON_PATH, ['-m', 'pip', 'install', '-U', 'yt-dlp'], {
                    timeout: 60000,
                    windowsHide: true
                }, (err, stdout, stderr) => {
                    const output = stdout || stderr || '';
                    const success = !err && (output.includes('Successfully') || output.includes('already satisfied'));

                    // Recuperer la nouvelle version
                    const { cmd, baseArgs } = getYtdlpExec();
                    execFile(cmd, [...baseArgs, '--version'], { timeout: 10000, windowsHide: true }, (err2, vOut) => {
                        res.json({
                            success,
                            output: output.substring(0, 500),
                            version: err2 ? '' : vOut.trim()
                        });
                    });
                });
            } else {
                // Fallback: yt-dlp --update
                const { cmd, baseArgs } = getYtdlpExec();
                execFile(cmd, [...baseArgs, '--update'], { timeout: 60000, windowsHide: true }, (err, stdout) => {
                    const output = stdout || '';
                    const success = !err && (output.includes('Updated') || output.includes('up to date') || output.includes('is up-to-date'));

                    execFile(cmd, [...baseArgs, '--version'], { timeout: 10000, windowsHide: true }, (err2, vOut) => {
                        res.json({
                            success,
                            output: output.substring(0, 500),
                            version: err2 ? '' : vOut.trim()
                        });
                    });
                });
            }
            break;
        }

        case 'check': {
            // Endpoint pour verifier l'etat des dependances
            const deps = config.checkDependencies();
            res.json({
                success: true,
                dependencies: deps,
                python: config.PYTHON_AVAILABLE,
                ffmpeg: config.FFMPEG_AVAILABLE,
                ytdlp: config.YTDLP_AVAILABLE
            });
            break;
        }

        default:
            res.json({ success: false, error: 'Action inconnue.' });
    }
});

module.exports = router;
