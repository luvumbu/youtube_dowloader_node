/**
 * Worker - Processus de telechargement en arriere-plan
 *
 * Lance par le serveur via child_process.spawn()
 * node worker.js <jobId> <url> <cover> <type> <format> <quality>
 */
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const config = require('./config');

const jobId = process.argv[2] || '';
const url = process.argv[3] || '';
const saveCover = process.argv[4] === '1';
const type = process.argv[5] || 'audio';
const format = process.argv[6] || 'mp3';
const quality = process.argv[7] || '0';

if (!jobId || !url) {
    console.error('Usage: node worker.js <jobId> <url> <cover> <type> <format> <quality>');
    process.exit(1);
}

// Valider le jobId et l'URL
if (!config.isValidJobId(jobId)) {
    console.error('Job ID invalide');
    process.exit(1);
}

if (!config.isValidYoutubeUrl(url)) {
    console.error('URL YouTube invalide');
    process.exit(1);
}

const downloadsDir = config.DOWNLOADS_DIR;
const logFile = path.join(downloadsDir, `${jobId}.log`);
const doneFile = path.join(downloadsDir, `${jobId}.done`);

fs.writeFileSync(logFile, 'Demarrage...\n');

// === Construction de la commande yt-dlp ===
function buildArgs() {
    const outputTemplate = path.join(downloadsDir, `${jobId}.%(ext)s`);
    const args = [];

    // ffmpeg-location seulement si disponible
    if (config.FFMPEG_AVAILABLE && config.FFMPEG_PATH) {
        args.push('--ffmpeg-location', config.FFMPEG_PATH);
    }

    args.push('--newline', '--progress-delta', '1');
    args.push('-o', outputTemplate);
    args.push('--no-playlist');
    args.push('--remote-components', 'ejs:github');

    if (type === 'audio') {
        args.push('-x', '--audio-format', format);
        args.push('--audio-quality', quality);
        args.push('--embed-thumbnail', '--write-thumbnail', '--convert-thumbnails', 'jpg');
    } else {
        let formatSpec;
        if (quality === 'best') {
            formatSpec = 'bestvideo+bestaudio/best';
        } else {
            formatSpec = `bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]`;
        }
        args.push('-f', formatSpec);
        args.push('--merge-output-format', format);
        if (format === 'mp4') {
            args.push('--postprocessor-args', 'Merger+ffmpeg_o:-c:v copy -c:a aac');
        }
        args.push('--embed-thumbnail', '--convert-thumbnails', 'jpg');
    }

    args.push(url);
    return args;
}

/**
 * Determiner la commande et les args pour spawn.
 * Si YTDLP_CMD est "python -m yt_dlp", on spawn python avec ["-m", "yt_dlp", ...args]
 * Sinon on spawn yt-dlp directement.
 */
function getSpawnCommand(args) {
    const ytdlpCmd = config.YTDLP_CMD;

    // Cas: "chemin/python" -m yt_dlp
    const pythonMatch = ytdlpCmd.match(/^"?(.+?)"?\s+-m\s+yt_dlp$/);
    if (pythonMatch) {
        return {
            cmd: pythonMatch[1],
            args: ['-m', 'yt_dlp', ...args]
        };
    }

    // Cas: chemin direct vers yt-dlp
    const cleanCmd = ytdlpCmd.replace(/^"|"$/g, '');
    return {
        cmd: cleanCmd,
        args: args
    };
}

async function run() {
    if (!config.YTDLP_AVAILABLE) {
        fs.appendFileSync(logFile, '\nERROR: yt-dlp non disponible. Lance start.bat pour installer.\n');
        fs.appendFileSync(logFile, '\nFINISHED\n');
        process.exit(1);
    }

    const dlArgs = buildArgs();
    const { cmd, args } = getSpawnCommand(dlArgs);

    // Executer via spawn (pas de shell = pas d'injection)
    const proc = spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    });

    proc.stdout.on('data', (data) => {
        fs.appendFileSync(logFile, data.toString());
    });

    proc.stderr.on('data', (data) => {
        fs.appendFileSync(logFile, data.toString());
    });

    const exitCode = await new Promise(resolve => {
        proc.on('close', resolve);
        proc.on('error', (err) => {
            fs.appendFileSync(logFile, `\nERROR: Impossible de lancer yt-dlp: ${err.message}\n`);
            resolve(1);
        });
    });

    // Si yt-dlp a echoue
    if (exitCode !== 0) {
        const logContent = fs.readFileSync(logFile, 'utf8');
        if (!logContent.includes('ERROR')) {
            fs.appendFileSync(logFile, `\nERROR: yt-dlp a echoue (code ${exitCode})\n`);
        }
        fs.appendFileSync(logFile, '\nFINISHED\n');
        process.exit(1);
    }

    // === Trouver le fichier final ===
    let finalExt = format;
    let outputFile = path.join(downloadsDir, `${jobId}.${finalExt}`);

    if (!fs.existsSync(outputFile)) {
        const files = fs.readdirSync(downloadsDir);

        // jobId.f399.mp4 etc
        const candidates = files
            .filter(f => f.startsWith(jobId) && f.endsWith(`.${finalExt}`) && f !== `${jobId}.log`)
            .map(f => path.join(downloadsDir, f))
            .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);

        if (candidates.length > 0) {
            fs.renameSync(candidates[0], outputFile);
        } else {
            // Chercher n'importe quel fichier media
            const mediaExts = ['mp4', 'mkv', 'webm', 'mp3', 'flac', 'wav', 'aac', 'ogg'];
            const allMedia = files
                .filter(f => f.startsWith(jobId) && mediaExts.some(e => f.endsWith(`.${e}`)) && !f.includes('.part'))
                .map(f => path.join(downloadsDir, f))
                .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);

            if (allMedia.length > 0) {
                finalExt = path.extname(allMedia[0]).slice(1);
                outputFile = path.join(downloadsDir, `${jobId}.${finalExt}`);
                fs.renameSync(allMedia[0], outputFile);
            }
        }
    }

    // === Gerer la couverture ===
    let coverFile = null;
    if (saveCover) {
        // 1. Chercher le thumbnail ecrit par yt-dlp
        const images = fs.readdirSync(downloadsDir)
            .filter(f => f.startsWith(jobId) && /\.(jpg|jpeg|png|webp)$/i.test(f))
            .map(f => path.join(downloadsDir, f));

        if (images.length > 0) {
            const img = images[0];
            coverFile = path.join(downloadsDir, `${jobId}_cover.jpg`);
            const ext = path.extname(img).toLowerCase();
            if (ext === '.jpg' || ext === '.jpeg') {
                fs.renameSync(img, coverFile);
            } else if (config.FFMPEG_AVAILABLE) {
                // Convertir avec ffmpeg
                try {
                    const ffmpegExe = findFfmpegExe();
                    if (ffmpegExe) {
                        execSync(`"${ffmpegExe}" -i "${img}" "${coverFile}" -y`, {
                            stdio: 'ignore',
                            windowsHide: true,
                            timeout: 15000
                        });
                        fs.unlinkSync(img);
                    } else {
                        // Pas de ffmpeg executable, garder l'image originale
                        fs.renameSync(img, coverFile);
                    }
                } catch (e) {
                    // En cas d'erreur, garder l'image originale comme cover
                    try { fs.renameSync(img, coverFile); } catch (e2) { coverFile = null; }
                }
            } else {
                // Pas de ffmpeg, garder l'image telle quelle
                fs.renameSync(img, coverFile);
            }
        }

        // 2. Fallback : telecharger depuis YouTube
        if (!coverFile || !fs.existsSync(coverFile)) {
            const videoId = extractVideoId(url);
            if (videoId) {
                const thumbUrls = [
                    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
                    `https://i.ytimg.com/vi/${videoId}/sddefault.jpg`,
                    `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
                    `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
                ];
                for (const tryUrl of thumbUrls) {
                    try {
                        const https = require('https');
                        const imgData = await new Promise((resolve, reject) => {
                            const req = https.get(tryUrl, { timeout: 8000 }, (res) => {
                                const chunks = [];
                                res.on('data', c => chunks.push(c));
                                res.on('end', () => resolve(Buffer.concat(chunks)));
                            });
                            req.on('error', reject);
                            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
                        });
                        if (imgData.length > 1000) {
                            coverFile = path.join(downloadsDir, `${jobId}_cover.jpg`);
                            fs.writeFileSync(coverFile, imgData);
                            break;
                        }
                    } catch (e) { /* next */ }
                }
            }
        }
    }

    // === Nettoyer les fichiers temporaires ===
    fs.readdirSync(downloadsDir)
        .filter(f => f.startsWith(jobId))
        .forEach(f => {
            const ext = path.extname(f).slice(1);
            const fullPath = path.join(downloadsDir, f);
            if (ext === finalExt || ext === 'log') return;
            if (coverFile && fullPath === coverFile) return;
            try { fs.unlinkSync(fullPath); } catch (e) {}
        });

    // === Renommer avec le titre YouTube ===
    let finalFile = outputFile;
    let finalCover = coverFile;

    if (fs.existsSync(outputFile)) {
        try {
            const { cmd: titleCmd, args: titleArgs } = getSpawnCommand([
                '--get-title', '--no-playlist', '--no-warnings', '--remote-components', 'ejs:github', url
            ]);
            const title = execSync(
                `"${titleCmd}" ${titleArgs.map(a => `"${a}"`).join(' ')}`,
                { encoding: 'utf8', timeout: 30000, windowsHide: true }
            ).trim();

            if (title) {
                const safeTitle = title.replace(/[<>:"\/\\|?*]/g, '').substring(0, 200).trim();
                if (safeTitle) {
                    const newFile = path.join(downloadsDir, `${safeTitle}.${finalExt}`);
                    if (!fs.existsSync(newFile)) {
                        fs.renameSync(outputFile, newFile);
                        finalFile = newFile;
                    }
                    if (coverFile && fs.existsSync(coverFile)) {
                        const newCover = path.join(downloadsDir, `${safeTitle}.jpg`);
                        if (!fs.existsSync(newCover)) {
                            fs.renameSync(coverFile, newCover);
                            finalCover = newCover;
                        }
                    }
                }
            }
        } catch (e) { /* titre non recupere, garder le nom original */ }
    }

    // === Ecrire le fichier .done ===
    if (fs.existsSync(finalFile)) {
        fs.writeFileSync(doneFile, JSON.stringify({
            file: path.basename(finalFile),
            cover: finalCover ? path.basename(finalCover) : null
        }));
    } else {
        fs.appendFileSync(logFile, '\nERROR: Fichier de sortie introuvable\n');
    }

    fs.appendFileSync(logFile, '\nFINISHED\n');
}

/**
 * Extrait l'ID video depuis une URL YouTube (tous formats).
 */
function extractVideoId(videoUrl) {
    // youtu.be/VIDEO_ID
    const shortMatch = videoUrl.match(/youtu\.be\/([\w-]+)/);
    if (shortMatch) return shortMatch[1];

    // youtube.com/shorts/VIDEO_ID
    const shortsMatch = videoUrl.match(/\/shorts\/([\w-]+)/);
    if (shortsMatch) return shortsMatch[1];

    // youtube.com/watch?v=VIDEO_ID
    const watchMatch = videoUrl.match(/[?&]v=([\w-]+)/);
    if (watchMatch) return watchMatch[1];

    return null;
}

/**
 * Trouve l'executable ffmpeg.
 */
function findFfmpegExe() {
    if (!config.FFMPEG_PATH) return null;

    // Tester dans le dossier FFMPEG_PATH
    const inDir = path.join(config.FFMPEG_PATH, 'ffmpeg.exe');
    if (fs.existsSync(inDir)) return inDir;

    // Tester ffmpeg directement (dans le PATH)
    try {
        const result = execSync('where ffmpeg', {
            encoding: 'utf8',
            timeout: 5000,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim().split('\n')[0].trim();
        if (result && fs.existsSync(result)) return result;
    } catch (e) { /* pas dans le PATH */ }

    return null;
}

run().catch(err => {
    fs.appendFileSync(logFile, `\nERROR: ${err.message}\n`);
    fs.appendFileSync(logFile, '\nFINISHED\n');
    process.exit(1);
});
