const express = require('express');
const router = express.Router();

// Cache memoire (1h) pour eviter de marteler lrclib.net
const lyricsCache = new Map();
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX = 500;

function cacheKey(artist, title) {
    return ((artist || '').trim().toLowerCase() + '||' + (title || '').trim().toLowerCase());
}

function getCached(key) {
    const entry = lyricsCache.get(key);
    if (entry && Date.now() - entry.t < CACHE_TTL) return entry.data;
    if (entry) lyricsCache.delete(key);
    return null;
}

function setCached(key, data) {
    lyricsCache.set(key, { t: Date.now(), data });
    if (lyricsCache.size > CACHE_MAX) {
        // virer les 10% les plus vieux
        const arr = [...lyricsCache.entries()].sort((a, b) => a[1].t - b[1].t);
        const toDelete = arr.slice(0, Math.ceil(CACHE_MAX / 10));
        for (const [k] of toDelete) lyricsCache.delete(k);
    }
}

async function lrcGet(artist, title, durationSec) {
    if (!artist || !title) return null;
    try {
        let u = 'https://lrclib.net/api/get?artist_name=' + encodeURIComponent(artist) + '&track_name=' + encodeURIComponent(title);
        if (durationSec && durationSec > 10) u += '&duration=' + Math.round(durationSec);
        const r = await fetch(u, { headers: { 'User-Agent': 'youtube-downloader-node/1.0 (https://github.com/local)' } });
        if (r.status === 404) {
            // Si on avait passe duration, retenter sans pour matcher des versions de longueur differente
            if (durationSec) return lrcGet(artist, title, 0);
            return { notFound: true };
        }
        if (!r.ok) return { error: 'HTTP ' + r.status };
        const data = await r.json();
        return data;
    } catch (e) {
        return { error: e.message };
    }
}

// Normalisation : minuscules + accents retires + ponctuation simplifiee
function normalize(s) {
    return (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/['']/g, "'")
        .replace(/[^a-z0-9'\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Chevauchement de mots entre 2 chaines (Jaccard simplifie)
function wordOverlap(a, b) {
    const wa = new Set(a.split(/\s+/).filter(w => w.length >= 2));
    const wb = new Set(b.split(/\s+/).filter(w => w.length >= 2));
    if (!wa.size || !wb.size) return 0;
    let inter = 0;
    for (const w of wa) if (wb.has(w)) inter++;
    return inter / Math.max(wa.size, wb.size); // 0..1
}

// Score 0..100 entre un resultat lrclib et la requete (artist + title attendus)
function scoreMatch(result, wantArtist, wantTitle, wantDuration) {
    const ra = normalize(result.artistName || '');
    const rt = normalize(result.trackName || '');
    const wa = normalize(wantArtist || '');
    const wt = normalize(wantTitle || '');
    let score = 0;
    // Score titre
    if (rt === wt) score += 60;
    else if (rt && wt && (rt.includes(wt) || wt.includes(rt))) score += 35;
    else if (rt && wt) score += Math.round(wordOverlap(rt, wt) * 40);
    // Score artiste
    if (wa) {
        if (ra === wa) score += 40;
        else if (ra && (ra.includes(wa) || wa.includes(ra))) score += 25;
        else if (ra) score += Math.round(wordOverlap(ra, wa) * 20);
    }
    // Bonus si paroles synchronisees disponibles
    if (result.syncedLyrics) score += 10;
    // Bonus de duree (si la duree YouTube et lrclib se rapprochent)
    if (wantDuration && result.duration && wantDuration > 10) {
        const diff = Math.abs(result.duration - wantDuration);
        if (diff <= 2) score += 15;
        else if (diff <= 5) score += 8;
        else if (diff > 30) score -= 15; // probablement pas la meme version
    }
    return score;
}

async function lrcSearch(query, wantArtist, wantTitle, wantDuration) {
    if (!query) return null;
    try {
        const u = 'https://lrclib.net/api/search?q=' + encodeURIComponent(query);
        const r = await fetch(u, { headers: { 'User-Agent': 'youtube-downloader-node/1.0 (https://github.com/local)' } });
        if (!r.ok) return { error: 'HTTP ' + r.status };
        const arr = await r.json();
        if (!Array.isArray(arr) || !arr.length) return { notFound: true };
        // Score les top 12 (au lieu de 8 pour plus de tolerance) et pique le meilleur
        const top = arr.slice(0, 12);
        const ranked = top.map(x => ({ x, s: scoreMatch(x, wantArtist || '', wantTitle || query, wantDuration || 0) }))
                          .sort((a, b) => b.s - a.s);
        const best = ranked[0];
        if (best && best.s >= 30) return best.x; // seuil minimum de pertinence
        return null; // on ne renvoie pas un mauvais match
    } catch (e) {
        return { error: e.message };
    }
}

// Variante /api/search dediee a juste recuperer LE meilleur match parmi top N (plus de marge)
async function lrcSearchBest(query, wantArtist, wantTitle, wantDuration, threshold) {
    const r = await lrcSearch(query, wantArtist, wantTitle, wantDuration);
    if (r && (r.plainLyrics || r.syncedLyrics)) return r;
    return null;
}

// Source tertiaire : Genius (recherche + scraping page).
// Pas d'API key requise pour le endpoint /search (genius.com l'expose en JSON).
async function geniusFind(artist, title) {
    if (!title) return null;
    try {
        const q = ((artist || '') + ' ' + title).trim();
        const sUrl = 'https://genius.com/api/search/multi?q=' + encodeURIComponent(q);
        const sResp = await fetch(sUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
                'Accept': 'application/json'
            }
        });
        if (!sResp.ok) return { error: 'genius search HTTP ' + sResp.status };
        const sJson = await sResp.json();
        const sections = (sJson && sJson.response && sJson.response.sections) || [];
        let songUrl = null;
        let matchedArtist = '', matchedTitle = '';
        for (const sec of sections) {
            for (const hit of (sec.hits || [])) {
                if (hit.type === 'song' && hit.result && hit.result.url) {
                    songUrl = hit.result.url;
                    matchedArtist = hit.result.primary_artist && hit.result.primary_artist.name;
                    matchedTitle = hit.result.title;
                    break;
                }
            }
            if (songUrl) break;
        }
        if (!songUrl) return { notFound: true };

        // Scraping de la page Genius pour extraire les paroles
        const pResp = await fetch(songUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
                'Accept': 'text/html'
            }
        });
        if (!pResp.ok) return { error: 'genius page HTTP ' + pResp.status };
        const html = await pResp.text();

        // Extraction : Genius utilise <div data-lyrics-container="true">...</div> (peut y en avoir plusieurs)
        const containerRe = /<div[^>]+data-lyrics-container[^>]*>([\s\S]*?)<\/div>/g;
        let combined = '';
        let m;
        while ((m = containerRe.exec(html)) !== null) {
            let chunk = m[1];
            // <br> -> newlines
            chunk = chunk.replace(/<br\s*\/?>/gi, '\n');
            // retirer les balises HTML restantes
            chunk = chunk.replace(/<[^>]+>/g, '');
            // decoder les entites HTML basiques
            chunk = chunk.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#x27;/g, "'");
            combined += chunk + '\n';
        }
        // Nettoyage du bruit Genius (preambule "N ContributorsXxx Lyrics" + "Embed" en fin)
        combined = combined.replace(/^\s*\d+\s*Contributors?[\s\S]*?Lyrics\s*/i, '');
        combined = combined.replace(/\s*\d*\s*Embed\s*$/i, '');
        combined = combined.replace(/\s*You might also like\s*/gi, '\n');
        combined = combined.replace(/\n{3,}/g, '\n\n').trim();
        if (combined.length < 30) return { notFound: true };
        return {
            plainLyrics: combined,
            syncedLyrics: '',
            source: 'genius.com',
            artistName: matchedArtist,
            trackName: matchedTitle
        };
    } catch (e) {
        return { error: e.message };
    }
}

// Source secondaire : api.lyrics.ovh (paroles plain uniquement, pas de timestamps)
async function ovhGet(artist, title) {
    if (!artist || !title) return null;
    try {
        const u = 'https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title);
        const r = await fetch(u, { headers: { 'User-Agent': 'youtube-downloader-node/1.0' } });
        if (r.status === 404) return { notFound: true };
        if (!r.ok) return { error: 'HTTP ' + r.status };
        const data = await r.json();
        if (data && data.lyrics) return { plainLyrics: data.lyrics, syncedLyrics: '', source: 'lyrics.ovh' };
        return { notFound: true };
    } catch (e) {
        return { error: e.message };
    }
}

// Decensure : "f**k" -> "fuck", "Motherf****r" -> "Motherfucker", etc.
const CENSOR_DICT = [
    // Patterns avec * pre-determines (matchers tres specifiques d'abord)
    { re: /\b([Mm])otherf\*+r?\b/g, rep: '$1otherfucker' },
    { re: /\bmf\*+r?\b/gi, rep: 'motherfucker' },
    { re: /\bf\*+k(in[g']?)?\b/gi, rep: (m, g) => 'fuck' + (g ? g : '') },
    { re: /\bf\*+r\b/gi, rep: 'fucker' },
    { re: /\bs\*+t\b/gi, rep: 'shit' },
    { re: /\bb\*+ch\b/gi, rep: 'bitch' },
    { re: /\bb\*+h\b/gi, rep: 'bitch' },
    { re: /\bn\*+a\b/gi, rep: 'nigga' },
    { re: /\bn\*+r\b/gi, rep: 'nigger' },
    { re: /\ba\*+hole\b/gi, rep: 'asshole' },
    { re: /\ba\*+s\b/gi, rep: 'ass' },
    { re: /\bd\*+k\b/gi, rep: 'dick' },
    { re: /\bp\*+y\b/gi, rep: 'pussy' },
    { re: /\bc\*+t\b/gi, rep: 'cunt' },
    { re: /\bd\*+n\b/gi, rep: 'damn' },
    { re: /\bh\*+l\b/gi, rep: 'hell' },
    // Au cas par cas plus generique : enleve juste les etoiles
    { re: /\*+/g, rep: '' }
];

function uncensor(s) {
    if (!s || s.indexOf('*') === -1) return s;
    let out = s;
    for (const { re, rep } of CENSOR_DICT) {
        out = out.replace(re, rep);
    }
    return out.replace(/\s+/g, ' ').trim();
}

function cleanTitlePart(rawTitle) {
    let t = (rawTitle || '').trim();
    // Crochets/parentheses contenant des tags video courants
    t = t.replace(/\s*[\[\(](?:official\s*)?(?:music\s*)?(?:lyric[s]?\s*)?(?:video|audio|hd|hq|4k|mv|m\/v|clip|live|remix|edit|version|extended|visualizer|performance|stream|explicit|clean|radio\s*edit|album\s*version|single\s*version|directors?\s*cut|uncut)\b[^\]\)]*[\]\)]/gi, '');
    t = t.replace(/\s*[\[\(]\s*(?:official|lyrics?|audio|video|hd|hq|4k|explicit|clean)\s*[\]\)]/gi, '');
    // Suffixes hors parentheses (avec separateur)
    t = t.replace(/\s+[-–—]\s+(?:official|lyric[s]?|audio|video|hd|hq|4k|explicit|clean)(?:\s+\w+)?\s*$/gi, '');
    // Tags isoles a la fin SANS parens : "... HD", "... 4K", "... Lyrics", "... Audio"
    t = t.replace(/\s+(?:hd|hq|4k|2k|mv|official|lyrics?|audio|video|live|remix|clip|visualizer|extended|explicit|clean)(?:\s+(?:hd|hq|4k|version|video|audio|edit|mix))?\s*$/gi, '');
    // Annee a la fin
    t = t.replace(/\s*\(?(?:19|20)\d{2}\)?\s*$/gi, '');
    // feat, ft, with, prod by
    t = t.replace(/\s*\(?\s*(?:feat|featuring|ft|w\/|with)\.?\s+[^)\]]+\)?\]?/gi, '');
    t = t.replace(/\s*\(?\s*prod\.?\s+by\s+[^)\]]+\)?\]?/gi, '');
    return t.replace(/\s+/g, ' ').trim();
}

// Extrait le contenu entre delimiteurs d'emphase (*...*, "...", «...», '...')
// dans le titre brut (avant tout autre nettoyage). Renvoie le contenu et ce qui l'entoure.
function extractEmphasized(rawTitle) {
    if (!rawTitle) return null;
    // Tester dans l'ordre : asterisks, guillemets francais, doubles, simples
    const patterns = [
        /\*([^*]{2,80})\*/,
        /«\s*([^»]{2,80})\s*»/,
        /"([^"]{2,80})"/,
        /“([^”]{2,80})”/, // " "
        /'([^']{2,80})'/
    ];
    for (const re of patterns) {
        const m = rawTitle.match(re);
        if (m) {
            const inner = m[1].trim();
            const outer = (rawTitle.substring(0, m.index) + rawTitle.substring(m.index + m[0].length)).trim();
            return { inner, outer };
        }
    }
    return null;
}

// Decoupe une chaine d'artistes "X, Y & Z feat. W" en artistes individuels
function splitArtistList(s) {
    if (!s) return [];
    const cleaned = s
        .replace(/\s*\b(?:feat|featuring|ft|with|w\/)\b\.?\s+/gi, ',')
        .replace(/\s+&\s+/g, ',')
        .replace(/\s+x\s+/gi, ',')
        .replace(/\s+vs\.?\s+/gi, ',');
    return cleaned.split(',').map(s => s.trim()).filter(Boolean);
}

function cleanArtistPart(rawChannel) {
    let a = (rawChannel || '').trim();
    a = a.replace(/\s*-?\s*topic\s*$/i, '').replace(/\s*vevo\s*$/i, '').replace(/\s*-?\s*official\s*$/i, '').trim();
    return a;
}

// Genere des liens directs vers des sites de paroles populaires (toujours dispo)
function buildExternalLinks(artist, title) {
    const a = (artist || '').trim();
    const t = (title || '').trim();
    const q = (a + ' ' + t).trim();
    const qe = encodeURIComponent(q);
    const ae = encodeURIComponent(a);
    const te = encodeURIComponent(t);
    return [
        { name: 'Genius', url: 'https://genius.com/search?q=' + qe },
        { name: 'AZLyrics', url: 'https://search.azlyrics.com/search.php?q=' + qe },
        { name: 'Musixmatch', url: 'https://www.musixmatch.com/search/' + qe },
        { name: 'Paroles.net (FR)', url: 'https://www.paroles.net/recherche/' + qe },
        { name: 'Lyrics.com', url: 'https://www.lyrics.com/lyrics/' + qe },
        { name: 'Google "lyrics"', url: 'https://www.google.com/search?q=' + qe + '+lyrics' },
        { name: 'YouTube "+ lyrics"', url: 'https://www.youtube.com/results?search_query=' + qe + '+lyrics' }
    ];
}

function buildCandidates(rawTitle, rawChannel) {
    const candidates = [];
    const cleanT = cleanTitlePart(rawTitle);
    const cleanA = cleanArtistPart(rawChannel);
    // Versions decensurees (si rawTitle contient des *)
    const uncensoredT = uncensor(cleanT);
    const uncensoredA = uncensor(cleanA);

    // 1bis) Si le titre brut contient une emphase (*X*, "X", 'X', «X»),
    //       X est tres probablement le vrai titre, le reste est l'album/film/serie
    const emph = extractEmphasized(rawTitle);
    if (emph) {
        const innerClean = cleanTitlePart(emph.inner);
        const outerClean = cleanTitlePart(emph.outer);
        if (innerClean) {
            // a) inner = titre, outer = artiste possible (ex: "Le Roi Lion *L'histoire de la vie*")
            if (outerClean) {
                candidates.push({ artist: outerClean, title: innerClean });
                // sub-artistes du outer
                for (const oa of splitArtistList(outerClean)) {
                    if (oa !== outerClean) candidates.push({ artist: oa, title: innerClean });
                }
            }
            // b) channel + inner
            if (cleanA) candidates.push({ artist: cleanA, title: innerClean });
            // c) inner seul
            candidates.push({ artist: '', title: innerClean });
        }
    }

    // Differents separateurs possibles : " - ", " — ", " – ", " · ", " | ", " // "
    const sepRegex = /\s+[-–—|·]\s+|\s+\/\/\s+/;
    const sepMatch = cleanT.match(sepRegex);
    if (sepMatch) {
        const idx = sepMatch.index;
        const left = cleanT.substring(0, idx).trim();
        const right = cleanT.substring(idx + sepMatch[0].length).trim();
        // a) gauche = artiste(s), droite = titre
        const leftArtists = splitArtistList(left);
        for (const la of leftArtists) {
            candidates.push({ artist: la, title: right });
        }
        candidates.push({ artist: left, title: right });
        // b) inverse (parfois c'est "Title - Artist")
        candidates.push({ artist: right, title: left });
    }

    // Avec le canal nettoye
    if (cleanA) {
        let titleNoPrefix = cleanT;
        // Retirer "Artist - " si en tete
        const lcA = cleanA.toLowerCase();
        const lcT = cleanT.toLowerCase();
        if (lcT.startsWith(lcA + ' - ') || lcT.startsWith(lcA + ' – ') || lcT.startsWith(lcA + ' — ')) {
            titleNoPrefix = cleanT.substring(cleanA.length + 3).trim();
        }
        candidates.push({ artist: cleanA, title: titleNoPrefix });
        if (titleNoPrefix !== cleanT) candidates.push({ artist: cleanA, title: cleanT });
        // Avec chaque artiste split du canal
        const channelArtists = splitArtistList(cleanA);
        for (const ca of channelArtists) {
            if (ca !== cleanA) candidates.push({ artist: ca, title: titleNoPrefix });
        }
    }

    // Toujours ajouter une variante sans artiste (titre seul) en dernier recours
    candidates.push({ artist: '', title: cleanT });

    // Variante sans contenu apres tiret final dans le titre (ex: "Title - Movie OST" -> "Title")
    const lastDashIdx = cleanT.lastIndexOf(' - ');
    if (lastDashIdx > 0) {
        const titleStripped = cleanT.substring(0, lastDashIdx).trim();
        if (cleanA) candidates.push({ artist: cleanA, title: titleStripped });
        candidates.push({ artist: '', title: titleStripped });
    }

    // Versions decensurees : on ajoute les memes candidats avec * remplaces
    if (uncensoredT !== cleanT || uncensoredA !== cleanA) {
        // Re-extract dash split sur la version decensuree
        const sepRegex = /\s+[-–—|·]\s+|\s+\/\/\s+/;
        const sm = uncensoredT.match(sepRegex);
        if (sm) {
            const left = uncensoredT.substring(0, sm.index).trim();
            const right = uncensoredT.substring(sm.index + sm[0].length).trim();
            for (const la of splitArtistList(left)) candidates.push({ artist: la, title: right });
            candidates.push({ artist: left, title: right });
        }
        if (uncensoredA) {
            candidates.push({ artist: uncensoredA, title: uncensoredT });
        } else {
            candidates.push({ artist: '', title: uncensoredT });
        }
    }

    // Deduplication
    const seen = new Set();
    return candidates.filter(c => {
        const k = (c.artist + '|' + c.title).toLowerCase();
        if (!c.title || seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

// GET /api/lyrics?title=...&channel=...
// Tente plusieurs combinaisons et renvoie les paroles si trouvees.
router.get('/', async (req, res) => {
    const title = (req.query.title || '').trim();
    const channel = (req.query.channel || '').trim();
    const artistOverride = (req.query.artist || '').trim();
    const titleOverride = (req.query.titleExact || '').trim();
    // Duree optionnelle (en secondes) pour scoring/filtrage
    let durationSec = 0;
    if (req.query.duration) {
        const d = parseInt(req.query.duration, 10);
        if (!isNaN(d) && d > 10) durationSec = d;
    } else if (req.query.durationStr) {
        // "3:45" ou "1:23:45" -> secondes
        const parts = String(req.query.durationStr).trim().split(':').map(p => parseInt(p, 10));
        if (parts.every(n => !isNaN(n))) {
            if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
            else if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];
        }
    }

    if (!title && !titleOverride) {
        return res.json({ success: false, error: 'title requis', tried: [] });
    }

    const tried = [];

    // Mode override (recherche manuelle) : on essaie strictement ce que l'utilisateur a saisi
    if (artistOverride || titleOverride) {
        const a = artistOverride;
        const t = titleOverride || title;
        const ck = cacheKey(a, t);
        const cached = getCached(ck);
        if (cached && (cached.plain || cached.synced)) {
            return res.json({ success: true, ...cached, fromCache: true, tried: [{ kind: 'cache', key: ck }] });
        }
        tried.push({ kind: 'get', artist: a, title: t });
        let data = a ? await lrcGet(a, t) : null;
        if (!data || data.notFound || data.error || (!data.plainLyrics && !data.syncedLyrics)) {
            tried.push({ kind: 'search', q: (a + ' ' + t).trim() });
            data = await lrcSearch((a + ' ' + t).trim());
        }
        // Sources secondaires si extra=1
        if ((req.query.extra === '1' || req.query.extra === 'true') && (!data || data.notFound || data.error || (!data.plainLyrics && !data.syncedLyrics))) {
            tried.push({ kind: 'ovh', artist: a, title: t });
            data = await ovhGet(a, t);
            if (!data || data.notFound || data.error || (!data.plainLyrics && !data.syncedLyrics)) {
                tried.push({ kind: 'genius', artist: a, title: t });
                data = await geniusFind(a, t);
            }
        }
        if (data && (data.plainLyrics || data.syncedLyrics)) {
            const out = { plain: data.plainLyrics || '', synced: data.syncedLyrics || '', source: data.source || 'lrclib.net' };
            setCached(ck, out);
            return res.json({ success: true, ...out, tried });
        }
        return res.json({
            success: false,
            notFound: true,
            tried,
            hasExtra: !(req.query.extra === '1' || req.query.extra === 'true'),
            externalLinks: buildExternalLinks(a, t)
        });
    }

    // Mode auto : on essaie les candidats generes depuis title + channel
    const candidates = buildCandidates(title, channel);
    if (!candidates.length) {
        return res.json({ success: false, error: 'Aucun candidat genere', tried: [] });
    }

    // Cache check sur le 1er candidat
    const primaryKey = cacheKey(candidates[0].artist, candidates[0].title);
    const cached = getCached(primaryKey);
    const wantExtra = (req.query.extra === '1' || req.query.extra === 'true');
    if (cached && (cached.plain || cached.synced)) {
        return res.json({ success: true, ...cached, fromCache: true, tried: [{ kind: 'cache', key: primaryKey }] });
    }
    if (cached && cached.notFound && !wantExtra) {
        const best = candidates[0] || { artist: '', title: '' };
        return res.json({
            success: false,
            notFound: true,
            fromCache: true,
            tried: [{ kind: 'cache', key: primaryKey }],
            hasExtra: true,
            externalLinks: buildExternalLinks(best.artist, best.title)
        });
    }
    // Si extra demande et cache notFound : on bypass et on retente direct lrclib + ovh

    // 1) /get strict pour chaque candidat (avec duration si fournie)
    for (const c of candidates) {
        tried.push({ kind: 'get', artist: c.artist, title: c.title, dur: durationSec || undefined });
        const data = await lrcGet(c.artist, c.title, durationSec);
        if (data && (data.plainLyrics || data.syncedLyrics)) {
            const out = { plain: data.plainLyrics || '', synced: data.syncedLyrics || '', source: 'lrclib.net' };
            setCached(primaryKey, out);
            return res.json({ success: true, ...out, matched: c, tried });
        }
    }

    // 2) /search avec les meilleures combinaisons (avec scoring du meilleur resultat)
    const queries = [];
    for (const c of candidates) {
        const q = ((c.artist || '') + ' ' + c.title).trim();
        if (q && !queries.includes(q)) queries.push({ q, want: c });
    }
    const rawClean = cleanTitlePart(title);
    if (rawClean && !queries.find(x => x.q === rawClean)) queries.push({ q: rawClean, want: { artist: '', title: rawClean } });

    for (const { q, want } of queries) {
        tried.push({ kind: 'search', q });
        const data = await lrcSearch(q, want.artist, want.title, durationSec);
        if (data && (data.plainLyrics || data.syncedLyrics)) {
            const out = { plain: data.plainLyrics || '', synced: data.syncedLyrics || '', source: 'lrclib.net (search)' };
            setCached(primaryKey, out);
            return res.json({ success: true, ...out, matched: { artist: data.artistName, title: data.trackName }, tried });
        }
    }

    // 3) Sources secondaires si extra=1 (auto desormais cote client)
    if (req.query.extra === '1' || req.query.extra === 'true') {
        // 3a) ovh
        for (const c of candidates) {
            tried.push({ kind: 'ovh', artist: c.artist, title: c.title });
            const data = await ovhGet(c.artist, c.title);
            if (data && data.plainLyrics) {
                const out = { plain: data.plainLyrics, synced: '', source: 'api.lyrics.ovh' };
                setCached(primaryKey, out);
                return res.json({ success: true, ...out, matched: c, tried });
            }
        }
        // 3b) Genius (plus complet, scraping)
        // On essaie au max les 2 premiers candidats (Genius search est plus generique)
        for (const c of candidates.slice(0, 2)) {
            tried.push({ kind: 'genius', artist: c.artist, title: c.title });
            const data = await geniusFind(c.artist, c.title);
            if (data && data.plainLyrics) {
                const out = { plain: data.plainLyrics, synced: '', source: 'genius.com' };
                setCached(primaryKey, out);
                return res.json({
                    success: true,
                    ...out,
                    matched: { artist: data.artistName, title: data.trackName },
                    tried
                });
            }
        }
    }

    // Pas de cache "notFound" pour les recherches extra (on veut pouvoir retenter)
    if (req.query.extra !== '1' && req.query.extra !== 'true') {
        setCached(primaryKey, { plain: '', synced: '', notFound: true });
    }
    const best = candidates[0] || { artist: '', title: cleanTitlePart(title) };
    return res.json({
        success: false,
        notFound: true,
        tried,
        candidates,
        hasExtra: !(req.query.extra === '1' || req.query.extra === 'true'),
        externalLinks: buildExternalLinks(best.artist, best.title)
    });
});

module.exports = router;
