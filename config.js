const path = require('path');
const { execSync } = require('child_process');

// === Detection automatique des chemins ===
console.log('========================================');
console.log('  YouTube Downloader - Demarrage...');
console.log('========================================');

/**
 * Cherche un executable dans le PATH.
 * Retourne le chemin complet ou null.
 */
function findCommand(name) {
    try {
        const result = execSync(`where ${name}`, {
            encoding: 'utf8',
            timeout: 5000,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim().split('\n')[0].trim();
        return result || null;
    } catch (e) {
        return null;
    }
}

/**
 * Cherche TOUS les chemins d'un executable dans le PATH.
 */
function findAllCommands(name) {
    try {
        const result = execSync(`where ${name}`, {
            encoding: 'utf8',
            timeout: 5000,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
        }).trim();
        return result.split('\n').map(p => p.trim()).filter(Boolean);
    } catch (e) {
        return [];
    }
}

/**
 * Verifie que le python trouve est un vrai Python
 * et pas le stub Microsoft Store.
 */
function findRealPython() {
    const candidates = ['python', 'python3', 'py'];
    for (const cmd of candidates) {
        const allPaths = findAllCommands(cmd);
        if (allPaths.length === 0) continue;

        for (const cmdPath of allPaths) {
            // Exclure le stub Microsoft Store (WindowsApps)
            if (cmdPath.includes('WindowsApps')) continue;

            // Verifier que ca retourne bien une version
            try {
                const version = execSync(`"${cmdPath}" --version`, {
                    encoding: 'utf8',
                    timeout: 5000,
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'ignore']
                }).trim();
                if (version.startsWith('Python')) {
                    return cmdPath;
                }
            } catch (e) {
                continue;
            }
        }
    }
    return null;
}

/**
 * Trouve le chemin reel de ffmpeg (pas le shim winget).
 * Retourne le dossier contenant ffmpeg, ou '' si non trouve.
 */
function findFfmpegDir() {
    // Verifier d'abord le dossier local ffmpeg/bin
    const localFfmpeg = path.join(__dirname, 'ffmpeg', 'bin', 'ffmpeg.exe');
    const fs = require('fs');
    if (fs.existsSync(localFfmpeg)) {
        try {
            execSync('"' + localFfmpeg + '" -version', {
                encoding: 'utf8', timeout: 5000, windowsHide: true,
                stdio: ['ignore', 'pipe', 'ignore']
            });
            return path.join(__dirname, 'ffmpeg', 'bin');
        } catch (e) { /* ffmpeg local non fonctionnel */ }
    }

    const ffmpegExe = findCommand('ffmpeg');
    if (!ffmpegExe) return '';

    // Verifier que ffmpeg fonctionne reellement
    try {
        execSync('"' + ffmpegExe + '" -version', {
            encoding: 'utf8',
            timeout: 5000,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
        });
    } catch (e) {
        return '';
    }

    // Si c'est un shim winget (WinGet\Links), suivre le vrai chemin
    let dir = path.dirname(ffmpegExe);

    // Tester que ffmpeg.exe existe bien dans ce dossier
    // Sinon, le chemin du `where` suffit (le dossier parent est correct)
    try {
        const fs = require('fs');
        if (!fs.existsSync(path.join(dir, 'ffmpeg.exe'))) {
            // Le `where` a retourne le chemin correct, on utilise son dossier
            dir = path.dirname(ffmpegExe);
        }
    } catch (e) { /* on garde dir */ }

    return dir;
}

/**
 * Installe un package via winget.
 * Retourne true si l'installation a reussi.
 */
function installWithWinget(packageId, name) {
    console.log(`  -> Installation de ${name} via winget...`);
    try {
        execSync(`winget install ${packageId} --accept-source-agreements --accept-package-agreements`, {
            encoding: 'utf8',
            timeout: 300000,
            windowsHide: true,
            stdio: 'inherit'
        });
        // Recharger le PATH depuis le registre
        try {
            const sysPath = execSync('reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment" /v Path', {
                encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
            }).match(/REG_\w+\s+(.*)/);
            const usrPath = execSync('reg query "HKCU\\Environment" /v Path', {
                encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
            }).match(/REG_\w+\s+(.*)/);
            if (sysPath || usrPath) {
                process.env.PATH = [
                    sysPath ? sysPath[1].trim() : '',
                    usrPath ? usrPath[1].trim() : '',
                    process.env.LOCALAPPDATA + '\\Microsoft\\WinGet\\Links',
                    process.env.PATH
                ].filter(Boolean).join(';');
            }
        } catch (e) { /* on garde le PATH actuel */ }
        console.log(`  -> ${name} installe avec succes.`);
        return true;
    } catch (e) {
        console.log(`  -> ECHEC : Impossible d'installer ${name} automatiquement.`);
        return false;
    }
}

/**
 * Installe yt-dlp via pip.
 * Retourne true si l'installation a reussi.
 */
function installYtdlp(pythonExe) {
    console.log('  -> Installation de yt-dlp via pip...');
    try {
        execSync(`"${pythonExe}" -m pip install --upgrade pip`, {
            encoding: 'utf8', timeout: 60000, windowsHide: true, stdio: 'inherit'
        });
    } catch (e) { /* pip upgrade optionnel */ }
    try {
        execSync(`"${pythonExe}" -m pip install yt-dlp`, {
            encoding: 'utf8', timeout: 120000, windowsHide: true, stdio: 'inherit'
        });
        console.log('  -> yt-dlp installe avec succes.');
        return true;
    } catch (e) {
        console.log('  -> ECHEC : Impossible d\'installer yt-dlp via pip.');
        return false;
    }
}

// === Detection et installation automatique ===
console.log('[1/3] Recherche de Python...');
let pythonPath = findRealPython() || '';
if (!pythonPath) {
    console.log('  -> Python non trouve. Tentative d\'installation...');
    if (installWithWinget('Python.Python.3.12', 'Python 3.12')) {
        pythonPath = findRealPython() || '';
    }
}
if (pythonPath) {
    console.log(`  -> Python trouve : ${pythonPath}`);
} else {
    console.log('  -> ERREUR : Python non disponible. Les telechargements ne fonctionneront pas.');
    console.log('     Installe Python manuellement depuis https://www.python.org/downloads/');
}

console.log('[2/3] Recherche de ffmpeg...');
let ffmpegPath = findFfmpegDir();
if (!ffmpegPath) {
    console.log('  -> ffmpeg non trouve. Tentative d\'installation...');
    if (installWithWinget('Gyan.FFmpeg', 'ffmpeg')) {
        ffmpegPath = findFfmpegDir();
    }
}
if (ffmpegPath) {
    console.log(`  -> ffmpeg trouve : ${ffmpegPath}`);
} else {
    console.log('  -> ATTENTION : ffmpeg non disponible. La conversion audio/video sera limitee.');
}

console.log('[3/3] Configuration de yt-dlp...');
let ytdlpCmd = '';
let ytdlpAvailable = false;

if (pythonPath) {
    // Tester python -m yt_dlp
    try {
        execSync(`"${pythonPath}" -m yt_dlp --version`, {
            encoding: 'utf8',
            timeout: 10000,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'ignore']
        });
        ytdlpCmd = `"${pythonPath}" -m yt_dlp`;
        ytdlpAvailable = true;
    } catch (e) {
        // yt_dlp pas installe via pip, tenter l'installation
        if (installYtdlp(pythonPath)) {
            try {
                execSync(`"${pythonPath}" -m yt_dlp --version`, {
                    encoding: 'utf8',
                    timeout: 10000,
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'ignore']
                });
                ytdlpCmd = `"${pythonPath}" -m yt_dlp`;
                ytdlpAvailable = true;
            } catch (e2) { /* echec meme apres installation */ }
        }
    }
}

if (!ytdlpAvailable) {
    // Tester yt-dlp direct (PATH ou executable local)
    const candidates = [findCommand('yt-dlp'), path.join(__dirname, 'yt-dlp.exe')].filter(Boolean);
    for (const candidate of candidates) {
        if (!require('fs').existsSync(candidate)) continue;
        try {
            execSync(`"${candidate}" --version`, {
                encoding: 'utf8',
                timeout: 10000,
                windowsHide: true,
                stdio: ['ignore', 'pipe', 'ignore']
            });
            ytdlpCmd = `"${candidate}"`;
            ytdlpAvailable = true;
            break;
        } catch (e) { /* non fonctionnel */ }
    }
}

if (ytdlpAvailable) {
    console.log(`  -> Commande yt-dlp : ${ytdlpCmd}`);
} else {
    ytdlpCmd = 'yt-dlp'; // fallback, echouera avec un message clair
    console.log('  -> ERREUR : yt-dlp non disponible.');
    if (pythonPath) {
        console.log('     Essaie manuellement : pip install yt-dlp');
    } else {
        console.log('     Installe d\'abord Python, puis : pip install yt-dlp');
    }
}
console.log('----------------------------------------');

const config = {
    YTDLP_CMD: ytdlpCmd,
    YTDLP_AVAILABLE: ytdlpAvailable,
    FFMPEG_PATH: ffmpegPath,
    FFMPEG_AVAILABLE: ffmpegPath !== '',
    PYTHON_PATH: pythonPath,
    PYTHON_AVAILABLE: pythonPath !== '',

    PORT: 3000,

    ROOT_DIR: __dirname,
    DOWNLOADS_DIR: path.join(__dirname, 'downloads'),
    DATA_DIR: path.join(__dirname, 'data'),

    LIBRARY_FILE: path.join(__dirname, 'data', 'library.json'),
    PROFILES_FILE: path.join(__dirname, 'data', 'profiles.json'),
    HISTORY_FILE: path.join(__dirname, 'data', 'history.json'),
    QUEUE_FILE: path.join(__dirname, 'data', 'queue.json'),
    NOTIFICATIONS_FILE: path.join(__dirname, 'data', 'notifications.json'),

    TEMP_FILE_LIFETIME: 3600,

    AUDIO_FORMATS: ['mp3', 'flac', 'wav', 'aac', 'ogg'],
    VIDEO_FORMATS: ['mp4', 'mkv', 'webm'],
    AUDIO_QUALITIES: ['0', '5', '9'],
    VIDEO_QUALITIES: ['best', '1080', '720', '480', '360'],

    YOUTUBE_URL_PATTERN: /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/|youtube\.com\/playlist\?list=)[\w\-]+/,
    JOB_ID_PATTERN: /^yt_[a-f0-9]+$/,

    isValidYoutubeUrl(url) {
        if (typeof url !== 'string') return false;
        return this.YOUTUBE_URL_PATTERN.test(url);
    },

    isValidJobId(jobId) {
        if (typeof jobId !== 'string') return false;
        return this.JOB_ID_PATTERN.test(jobId);
    },

    sanitizeDownloadParams(type, format, quality) {
        if (type === 'audio') {
            format = this.AUDIO_FORMATS.includes(format) ? format : 'mp3';
            quality = this.AUDIO_QUALITIES.includes(quality) ? quality : '0';
        } else {
            type = 'video';
            format = this.VIDEO_FORMATS.includes(format) ? format : 'mp4';
            quality = this.VIDEO_QUALITIES.includes(quality) ? quality : 'best';
        }
        return { type, format, quality };
    },

    /**
     * Verifie que les outils sont disponibles.
     * Retourne { ok: boolean, missing: string[] }
     */
    checkDependencies() {
        const missing = [];
        if (!this.PYTHON_AVAILABLE) missing.push('Python');
        if (!this.YTDLP_AVAILABLE) missing.push('yt-dlp');
        if (!this.FFMPEG_AVAILABLE) missing.push('ffmpeg');
        return { ok: missing.length === 0, missing };
    }
};

module.exports = config;
