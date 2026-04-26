const express = require('express');
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('../config');
const router = express.Router();

function getYtdlpExec() {
    const ytdlpCmd = config.YTDLP_CMD;
    const pythonMatch = ytdlpCmd.match(/^"?(.+?)"?\s+-m\s+yt_dlp$/);
    if (pythonMatch) return { cmd: pythonMatch[1], baseArgs: ['-m', 'yt_dlp'] };
    return { cmd: ytdlpCmd.replace(/^"|"$/g, ''), baseArgs: [] };
}

// Cache en RAM (1h)
const descCache = new Map();
const TTL = 60 * 60 * 1000;
const MAX = 200;

function getCached(url) {
    const e = descCache.get(url);
    if (e && Date.now() - e.t < TTL) return e.data;
    if (e) descCache.delete(url);
    return null;
}
function setCached(url, data) {
    descCache.set(url, { t: Date.now(), data });
    if (descCache.size > MAX) {
        const arr = [...descCache.entries()].sort((a, b) => a[1].t - b[1].t);
        for (const [k] of arr.slice(0, Math.ceil(MAX / 10))) descCache.delete(k);
    }
}

function fetchDescription(url) {
    return new Promise((resolve, reject) => {
        const cached = getCached(url);
        if (cached) return resolve(cached);
        const { cmd, baseArgs } = getYtdlpExec();
        const args = [
            ...baseArgs,
            '--dump-json',
            '--no-playlist',
            '--no-warnings',
            '--remote-components', 'ejs:github',
            '--skip-download',
            url
        ];
        execFile(cmd, args, { timeout: 25000, windowsHide: true, maxBuffer: 20 * 1024 * 1024 }, (err, stdout) => {
            if (err) return reject(new Error('yt-dlp a echoue'));
            try {
                const data = JSON.parse(stdout);
                const out = {
                    title: data.title || '',
                    channel: data.channel || data.uploader || '',
                    duration: data.duration || 0,
                    description: data.description || '',
                    chapters: Array.isArray(data.chapters) ? data.chapters : [],
                    upload_date: data.upload_date || '',
                    view_count: data.view_count || 0,
                    like_count: data.like_count || 0,
                    tags: Array.isArray(data.tags) ? data.tags.slice(0, 15) : [],
                    categories: Array.isArray(data.categories) ? data.categories : []
                };
                setCached(url, out);
                resolve(out);
            } catch (e) {
                reject(new Error('Reponse yt-dlp invalide'));
            }
        });
    });
}

// GET /api/description?url=YOUTUBE_URL
router.get('/', async (req, res) => {
    const url = req.query.url || '';
    if (!config.isValidYoutubeUrl(url)) return res.json({ success: false, error: 'URL invalide' });
    if (!config.YTDLP_AVAILABLE) return res.json({ success: false, error: 'yt-dlp non disponible' });
    try {
        const data = await fetchDescription(url);
        res.json({ success: true, ...data });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

// === Transcription / sous-titres ===
const subsCache = new Map();

// "hello world hello world" -> "hello world"
function collapseInternalRepeats(s) {
    const words = s.split(/\s+/).filter(Boolean);
    const n = words.length;
    if (n < 4) return s;
    for (let len = Math.floor(n / 2); len >= 2; len--) {
        let match = true;
        for (let k = 0; k < len; k++) {
            if (words[n - len + k].toLowerCase() !== words[n - 2 * len + k].toLowerCase()) {
                match = false; break;
            }
        }
        if (match) return words.slice(0, n - len).join(' ');
    }
    return s;
}

function normText(s) {
    return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
}

// Tokenisation simple : mots normalises (sans casse/ponct) avec leur position dans la chaine d'origine
function tokens(s) {
    const norm = normText(s).split(/\s+/).filter(Boolean);
    const orig = s.split(/\s+/).filter(Boolean);
    // Si decoupage different (ponctuation isolee), aligner sur la version normalisee
    return { norm, orig: orig.length === norm.length ? orig : norm };
}

// Nombre de mots en chevauchement entre la fin de a et le debut de b
function suffixPrefixOverlap(aNorm, bNorm) {
    const max = Math.min(aNorm.length, bNorm.length);
    for (let n = max; n > 0; n--) {
        let ok = true;
        for (let k = 0; k < n; k++) {
            if (aNorm[aNorm.length - n + k] !== bNorm[k]) { ok = false; break; }
        }
        if (ok) return n;
    }
    return 0;
}

// Fusionne les voisins (passes multiples jusqu'a stabilite) :
// - meme timestamp    -> on garde le plus long
// - identiques        -> on garde un seul
// - inclus            -> on garde le plus long
// - chevauchement     -> on fusionne en supprimant la repetition au milieu
function mergeAdjacentLines(items) {
    let arr = items.slice();
    let pass = 0;
    while (pass < 8) {
        pass++;
        let changed = false;
        const out = [];
        for (const cur of arr) {
            const prev = out[out.length - 1];
            if (!prev) { out.push(cur); continue; }
            const a = normText(prev.text);
            const b = normText(cur.text);
            if (!b) { changed = true; continue; }
            // Meme timestamp -> on garde la plus longue
            if (cur.ts === prev.ts) {
                if (cur.text.length > prev.text.length) { prev.text = cur.text; }
                changed = true;
                continue;
            }
            if (a === b) { changed = true; continue; }
            if (a.includes(b)) { changed = true; continue; }
            if (b.includes(a)) { prev.text = cur.text; prev.ts = cur.ts; changed = true; continue; }
            // Chevauchement suffixe/prefixe (sur tokens normalises) : >= 2 mots
            const aTok = tokens(prev.text);
            const bTok = tokens(cur.text);
            const overlap = suffixPrefixOverlap(aTok.norm, bTok.norm);
            if (overlap >= 2) {
                prev.text = aTok.orig.concat(bTok.orig.slice(overlap)).join(' ');
                changed = true;
                continue;
            }
            out.push(cur);
        }
        arr = out;
        if (!changed) break;
    }
    return arr;
}

function parseVTT(content) {
    // VTT format: lignes "HH:MM:SS.mmm --> HH:MM:SS.mmm" puis lignes texte
    const raw = [];
    const lines = content.split(/\r?\n/);
    const tsRe = /^(\d{1,2}):(\d{2}):(\d{2})[\.,](\d{1,3})\s+-->\s+(\d{1,2}):(\d{2}):(\d{2})/;
    const inlineTsRe = /<\d{2}:\d{2}:\d{2}\.\d{3}>/;
    let i = 0;
    while (i < lines.length) {
        const m = lines[i].match(tsRe);
        if (!m) { i++; continue; }
        const start = parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
        i++;
        const rawLines = [];
        while (i < lines.length && lines[i].trim() && !lines[i].match(tsRe)) {
            rawLines.push(lines[i]);
            i++;
        }
        if (!rawLines.length) continue;
        // YouTube auto-sub : ne garder que les lignes avec timestamps inline (= contenu nouveau)
        const withInline = rawLines.filter(l => inlineTsRe.test(l));
        const kept = withInline.length ? withInline : rawLines;
        let text = kept
            .map(l => l.replace(/<[^>]+>/g, '').trim())
            .filter(Boolean)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
        if (!text) continue;
        // Effondrer les repetitions internes ("X Y X Y" -> "X Y")
        text = collapseInternalRepeats(text);
        raw.push({ ts: start, text });
    }
    // Etape 1 : fusionner les voisins (inclusion + chevauchement)
    const merged = mergeAdjacentLines(raw);
    // Etape 2 : dedup global (toute ligne deja vue ailleurs)
    const seen = new Set();
    const out = [];
    for (const item of merged) {
        const norm = normText(item.text);
        if (!norm || seen.has(norm)) continue;
        seen.add(norm);
        out.push(item);
    }
    return out;
}

async function fetchTranscript(url, lang) {
    const ck = url + '|' + (lang || 'auto');
    const cached = subsCache.get(ck);
    if (cached && Date.now() - cached.t < TTL) return cached.data;

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytsub-'));
    const tmpl = path.join(tmpDir, 'sub.%(ext)s');

    return new Promise((resolve, reject) => {
        const { cmd, baseArgs } = getYtdlpExec();
        const subLangs = lang ? [lang] : ['fr', 'en', 'en-US', 'en-GB'];
        const args = [
            ...baseArgs,
            '--skip-download',
            '--write-subs',
            '--write-auto-subs',
            '--sub-langs', subLangs.join(','),
            '--sub-format', 'vtt',
            '--no-warnings',
            '--remote-components', 'ejs:github',
            '-o', tmpl,
            url
        ];
        execFile(cmd, args, { timeout: 30000, windowsHide: true, maxBuffer: 30 * 1024 * 1024 }, (err) => {
            try {
                // Trouver un fichier .vtt genere
                const files = fs.readdirSync(tmpDir).filter(f => f.endsWith('.vtt'));
                if (!files.length) {
                    fs.rmSync(tmpDir, { recursive: true, force: true });
                    return reject(new Error('Aucun sous-titre disponible pour cette video'));
                }
                // Preferer francais s'il existe
                files.sort((a, b) => {
                    const sa = a.includes('.fr') ? 0 : 1;
                    const sb = b.includes('.fr') ? 0 : 1;
                    return sa - sb;
                });
                const chosen = files[0];
                const detectedLang = (chosen.match(/\.([a-z]{2}(?:-[A-Z]{2})?)\.vtt$/) || [, ''])[1];
                const content = fs.readFileSync(path.join(tmpDir, chosen), 'utf8');
                fs.rmSync(tmpDir, { recursive: true, force: true });
                const lines = parseVTT(content);
                const data = { lang: detectedLang, lines };
                subsCache.set(ck, { t: Date.now(), data });
                if (subsCache.size > MAX) {
                    const arr = [...subsCache.entries()].sort((a, b) => a[1].t - b[1].t);
                    for (const [k] of arr.slice(0, Math.ceil(MAX / 10))) subsCache.delete(k);
                }
                resolve(data);
            } catch (e) {
                try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
                reject(new Error(e.message || 'Echec extraction sous-titres'));
            }
        });
    });
}

// GET /api/description/transcript?url=YOUTUBE_URL&lang=fr
router.get('/transcript', async (req, res) => {
    const url = req.query.url || '';
    const lang = req.query.lang || '';
    if (!config.isValidYoutubeUrl(url)) return res.json({ success: false, error: 'URL invalide' });
    if (!config.YTDLP_AVAILABLE) return res.json({ success: false, error: 'yt-dlp non disponible' });
    try {
        const data = await fetchTranscript(url, lang);
        res.json({ success: true, ...data });
    } catch (e) {
        res.json({ success: false, error: e.message });
    }
});

module.exports = router;
