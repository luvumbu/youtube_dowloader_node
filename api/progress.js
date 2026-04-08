const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const router = express.Router();

router.get('/', (req, res) => {
    const jobId = req.query.id || '';
    if (!config.isValidJobId(jobId)) {
        return res.json({ status: 'error', message: 'ID invalide.' });
    }

    const downloadsDir = config.DOWNLOADS_DIR;
    const logFile = path.join(downloadsDir, `${jobId}.log`);
    const doneFile = path.join(downloadsDir, `${jobId}.done`);

    // 1. Fichier .done existe
    if (fs.existsSync(doneFile)) {
        try {
            const doneData = JSON.parse(fs.readFileSync(doneFile, 'utf8'));
            if (!doneData || !doneData.file) {
                return res.json({ status: 'error', percent: 0, message: 'Fichier .done corrompu' });
            }
            const response = {
                status: 'done',
                file: 'downloads/' + doneData.file,
                percent: 100
            };
            if (doneData.cover) response.cover = 'downloads/' + doneData.cover;
            try { fs.unlinkSync(logFile); } catch (e) {}
            try { fs.unlinkSync(doneFile); } catch (e) {}
            return res.json(response);
        } catch (e) {
            return res.json({ status: 'error', message: 'Erreur lecture .done' });
        }
    }

    // 2. Fichier final encore present
    const exts = ['mp3', 'flac', 'wav', 'aac', 'ogg', 'mp4', 'mkv', 'webm'];
    for (const ext of exts) {
        if (fs.existsSync(path.join(downloadsDir, `${jobId}.${ext}`))) {
            return res.json({ status: 'progress', percent: 98, message: 'Finalisation...' });
        }
    }

    // 3. Pas de log
    if (!fs.existsSync(logFile)) {
        return res.json({ status: 'waiting', percent: 0, message: 'Demarrage...' });
    }

    // Lire les derniers 2Ko du log
    const stat = fs.statSync(logFile);
    const readSize = Math.min(stat.size, 2048);
    const fd = fs.openSync(logFile, 'r');
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, Math.max(0, stat.size - readSize));
    fs.closeSync(fd);
    const log = buf.toString('utf8');

    // 4. Erreurs (seulement les lignes ERROR: de yt-dlp, pas les WARNING contenant "Error")
    const errMatch = log.match(/^ERROR[:\s]+(.+)/m) || log.match(/\nERROR[:\s]+(.+)/);
    if (errMatch) {
        try { fs.unlinkSync(logFile); } catch (e) {}
        return res.json({ status: 'error', message: errMatch[1].trim() });
    }

    // 5. FINISHED sans .done
    if (log.includes('FINISHED') && !fs.existsSync(doneFile)) {
        try { fs.unlinkSync(logFile); } catch (e) {}
        return res.json({ status: 'error', message: 'Le telechargement a echoue.' });
    }

    // 6. Parser la progression
    let percent = 0;
    let message = 'Preparation...';

    if (log.includes('Downloading webpage')) { percent = 5; message = 'Connexion a YouTube...'; }
    if (log.includes('Downloading') && log.includes('format')) { percent = 8; message = 'Telechargement en cours...'; }

    const dlCount = (log.match(/\[download\] Destination:/g) || []).length;
    const isSecondPass = dlCount >= 2;

    const dlMatches = [...log.matchAll(/\[download\]\s+([\d.]+)%\s+of\s+~?\s*([\d.]+\S+)\s+at\s+(\S+)/g)];
    if (dlMatches.length > 0) {
        const last = dlMatches[dlMatches.length - 1];
        const lastPercent = parseFloat(last[1]);
        const totalSize = last[2];
        const speed = last[3];

        if (isSecondPass) {
            percent = 55 + (lastPercent * 0.35);
            message = `Audio : ${Math.round(lastPercent)}% de ${totalSize} a ${speed}`;
        } else if (dlCount <= 1) {
            percent = 10 + (lastPercent * 0.8);
            message = `Telechargement : ${Math.round(lastPercent)}% de ${totalSize} a ${speed}`;
        } else {
            percent = 10 + (lastPercent * 0.45);
            message = `Video : ${Math.round(lastPercent)}% de ${totalSize} a ${speed}`;
        }
    }

    if (log.includes('[ExtractAudio]')) { percent = 92; message = 'Conversion audio...'; }
    if (log.includes('[Merger]')) { percent = 92; message = 'Fusion audio + video...'; }
    if (log.includes('[EmbedThumbnail]')) { percent = 95; message = 'Ajout de la couverture...'; }
    if (log.includes('Deleting original')) { percent = 97; message = 'Finalisation...'; }

    res.json({ status: 'progress', percent: Math.round(percent), message });
});

module.exports = router;
