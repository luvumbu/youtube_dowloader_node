const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const router = express.Router();

/**
 * POST /api/convert
 * Convertir un fichier video en audio (MP3, FLAC, WAV, AAC, OGG)
 *
 * Body: { file: "downloads/video.mp4", format: "mp3", quality: "0" }
 */
router.post('/', (req, res) => {
    const file = req.body.file || '';
    const format = req.body.format || 'mp3';
    const quality = req.body.quality || '0';

    // Valider le format
    if (!config.AUDIO_FORMATS.includes(format)) {
        return res.json({ success: false, error: 'Format audio invalide.' });
    }

    // Valider le fichier
    const filePath = path.join(config.ROOT_DIR, file);
    if (!fs.existsSync(filePath)) {
        return res.json({ success: false, error: 'Fichier introuvable.' });
    }

    // Verifier que c'est bien un fichier dans le dossier downloads
    const realPath = path.resolve(filePath);
    if (!realPath.startsWith(path.resolve(config.DOWNLOADS_DIR))) {
        return res.json({ success: false, error: 'Chemin non autorise.' });
    }

    // Verifier que c'est un fichier video
    const ext = path.extname(filePath).toLowerCase().slice(1);
    if (!config.VIDEO_FORMATS.includes(ext)) {
        return res.json({ success: false, error: 'Ce fichier n\'est pas une video.' });
    }

    if (!config.FFMPEG_AVAILABLE) {
        return res.json({ success: false, error: 'ffmpeg non disponible.' });
    }

    // Trouver ffmpeg
    let ffmpegExe = 'ffmpeg';
    if (config.FFMPEG_PATH) {
        const inDir = path.join(config.FFMPEG_PATH, 'ffmpeg.exe');
        if (fs.existsSync(inDir)) ffmpegExe = inDir;
    }

    // Construire le chemin de sortie
    const baseName = path.parse(filePath).name;
    let outputPath = path.join(config.DOWNLOADS_DIR, `${baseName}.${format}`);

    // Eviter d'ecraser un fichier existant
    if (fs.existsSync(outputPath)) {
        outputPath = path.join(config.DOWNLOADS_DIR, `${baseName}_audio.${format}`);
    }

    // Construire les arguments ffmpeg
    const args = ['-i', filePath, '-vn']; // -vn = pas de video

    if (format === 'mp3') {
        const qMap = { '0': '0', '5': '5', '9': '9' };
        args.push('-codec:a', 'libmp3lame', '-q:a', qMap[quality] || '0');
    } else if (format === 'flac') {
        args.push('-codec:a', 'flac');
    } else if (format === 'wav') {
        args.push('-codec:a', 'pcm_s16le');
    } else if (format === 'aac') {
        const brMap = { '0': '256k', '5': '128k', '9': '64k' };
        args.push('-codec:a', 'aac', '-b:a', brMap[quality] || '256k');
    } else if (format === 'ogg') {
        const qMap = { '0': '8', '5': '5', '9': '2' };
        args.push('-codec:a', 'libvorbis', '-q:a', qMap[quality] || '8');
    }

    args.push('-y', outputPath);

    res.json({ success: true, message: 'Conversion en cours...', outputFile: 'downloads/' + path.basename(outputPath) });

    // Lancer la conversion en arriere-plan
    execFile(ffmpegExe, args, { timeout: 300000, windowsHide: true }, (err) => {
        if (err) {
            try { fs.unlinkSync(outputPath); } catch (e) {}
        }
    });
});

/**
 * GET /api/convert?file=downloads/video.mp4
 * Verifier si la conversion est terminee
 */
router.get('/', (req, res) => {
    const file = req.query.file || '';
    const filePath = path.join(config.ROOT_DIR, file);

    if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.size > 0) {
            return res.json({ success: true, done: true, file, size: stat.size });
        }
    }

    res.json({ success: true, done: false });
});

module.exports = router;
