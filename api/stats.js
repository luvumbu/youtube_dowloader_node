const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const router = express.Router();

const STATS_DIR = path.join(config.DATA_DIR, 'stats');
const SETTINGS_FILE = path.join(STATS_DIR, '_settings.json');
const MIGRATION_FLAG = path.join(STATS_DIR, '.migrated');
const PROFILE_MIGRATION_FLAG = path.join(STATS_DIR, '.migrated-profiles');

function getDefaultProfileId() {
    try {
        const profiles = JSON.parse(fs.readFileSync(config.PROFILES_FILE, 'utf8'));
        if (Array.isArray(profiles) && profiles.length) return profiles[0].id;
    } catch (e) {}
    return '';
}

// Assigne profileId aux evenements legacy (sans profil) au profil par defaut.
// S'execute une seule fois au demarrage (flag .migrated-profiles).
function migrateProfilesOnce() {
    if (fs.existsSync(PROFILE_MIGRATION_FLAG)) return;
    const defaultId = getDefaultProfileId();
    if (!defaultId) return;
    let touched = 0;
    listPartitionKeys().forEach(k => {
        const f = path.join(STATS_DIR, k + '.json');
        const data = loadPartitionByPath(f);
        if (!data || !data.events) return;
        let changed = false;
        for (const e of data.events) {
            if (!e.profileId) { e.profileId = defaultId; touched++; changed = true; }
        }
        if (changed) fs.writeFileSync(f, JSON.stringify(data));
    });
    fs.writeFileSync(PROFILE_MIGRATION_FLAG, new Date().toISOString());
    if (touched > 0) console.log(`[stats] migration profils : ${touched} evenement(s) assigne(s) au profil par defaut.`);
}

const VALID_STRATEGIES = ['monthly', 'yearly', 'single'];

function ensureDir() {
    if (!fs.existsSync(STATS_DIR)) fs.mkdirSync(STATS_DIR, { recursive: true });
}

function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
            if (VALID_STRATEGIES.includes(s.strategy)) return s;
        }
    } catch (e) {}
    return { strategy: 'monthly' };
}

function saveSettings(s) {
    ensureDir();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2));
}

function getStrategy() { return loadSettings().strategy; }

function partitionKey(strategy, Y, Mo) {
    if (strategy === 'single') return 'all';
    if (strategy === 'yearly') return String(Y);
    return `${Y}-${String(Mo).padStart(2, '0')}`;
}

function fileFor(strategy, key) {
    return path.join(STATS_DIR, `${key}.json`);
}

function isPartitionFile(name) {
    return /^(all|\d{4}|\d{4}-\d{2})\.json$/.test(name);
}

function listPartitionKeys() {
    if (!fs.existsSync(STATS_DIR)) return [];
    return fs.readdirSync(STATS_DIR)
        .filter(isPartitionFile)
        .map(n => n.replace(/\.json$/, ''))
        .sort();
}

function emptyPartition(key) {
    return {
        key,
        summary: {
            total: 0,
            byHour: new Array(24).fill(0),
            byArtist: {},
            byType: { dl: 0, play: 0, add: 0, stream: 0 },
            bySource: { audio: 0, video: 0, flow: 0 }
        },
        events: []
    };
}

function loadPartition(key) {
    const f = fileFor(getStrategy(), key);
    if (!fs.existsSync(f)) return null;
    try {
        const data = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (!data.summary) data.summary = emptyPartition(key).summary;
        if (!data.events) data.events = [];
        if (!data.summary.byHour) data.summary.byHour = new Array(24).fill(0);
        if (!data.summary.byArtist) data.summary.byArtist = {};
        if (!data.summary.byType) data.summary.byType = { dl: 0, play: 0, add: 0, stream: 0 };
        if (data.summary.byType.stream == null) data.summary.byType.stream = 0;
        if (!data.summary.bySource) data.summary.bySource = { audio: 0, video: 0, flow: 0 };
        if (data.summary.total == null) data.summary.total = data.events.length;
        return data;
    } catch (e) {
        console.error('stats: corrupted file', key, e.message);
        return null;
    }
}

function loadPartitionByPath(file) {
    try {
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        return data;
    } catch (e) { return null; }
}

function savePartition(data) {
    ensureDir();
    fs.writeFileSync(fileFor(getStrategy(), data.key), JSON.stringify(data));
}

function parseTs(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return { Y: +m[1], Mo: +m[2], D: +m[3], H: +m[4], Mi: +m[5] };
}

function nowTs() { return new Date().toISOString().replace('T', ' ').substring(0, 19); }

function extractArtist(title, channel) {
    const t = (title || '').trim();
    const dash = t.search(/\s[-–—]\s/);
    if (dash > 0) return t.substring(0, dash).trim();
    if (channel) return channel.trim();
    return '';
}

function recordEvent(ev) {
    const ts = ev.ts || nowTs();
    const p = parseTs(ts);
    if (!p) return false;
    const key = partitionKey(getStrategy(), p.Y, p.Mo);
    let data = loadPartition(key) || emptyPartition(key);

    const compact = {
        ts,
        profileId: ev.profileId || '',
        kind: ev.kind || 'dl', src: ev.source || 'audio',
        title: ev.title || '', artist: ev.artist || extractArtist(ev.title, ev.channel),
        url: ev.url || '', format: ev.format || ''
    };
    data.events.push(compact);
    data.summary.total++;
    if (p.H >= 0 && p.H <= 23) data.summary.byHour[p.H]++;
    const k = compact.kind;
    if (data.summary.byType[k] != null) data.summary.byType[k]++;
    const s = compact.src;
    if (data.summary.bySource[s] != null) data.summary.bySource[s]++;
    if (compact.artist) data.summary.byArtist[compact.artist] = (data.summary.byArtist[compact.artist] || 0) + 1;

    savePartition(data);
    return true;
}

function readAllEvents() {
    const all = [];
    listPartitionKeys().forEach(k => {
        const f = path.join(STATS_DIR, k + '.json');
        const data = loadPartitionByPath(f);
        if (data && data.events) all.push(...data.events);
    });
    return all;
}

function clearPartitions() {
    if (!fs.existsSync(STATS_DIR)) return;
    fs.readdirSync(STATS_DIR).forEach(n => {
        if (isPartitionFile(n)) fs.unlinkSync(path.join(STATS_DIR, n));
    });
}

function rewriteAll(events) {
    clearPartitions();
    events.forEach(e => recordEvent(e));
}

function migrateOnce(force) {
    ensureDir();
    if (!force && fs.existsSync(MIGRATION_FLAG)) return { migrated: false, count: 0 };

    if (force) {
        clearPartitions();
        try { if (fs.existsSync(MIGRATION_FLAG)) fs.unlinkSync(MIGRATION_FLAG); } catch (e) {}
    }

    let count = 0;
    try {
        const histRaw = fs.existsSync(config.HISTORY_FILE) ? fs.readFileSync(config.HISTORY_FILE, 'utf8') : '[]';
        const history = JSON.parse(histRaw);
        history.forEach(h => {
            if (h.status && h.status !== 'success') return;
            if (recordEvent({
                ts: h.date, kind: 'dl',
                source: h.type === 'video' ? 'video' : 'audio',
                title: h.title, channel: h.channel, url: h.url, format: h.format
            })) count++;
        });
    } catch (e) { console.error('stats migrate history:', e.message); }

    try {
        const flowFile = path.join(config.DATA_DIR, 'flow.json');
        const flowRaw = fs.existsSync(flowFile) ? fs.readFileSync(flowFile, 'utf8') : '{"tracks":[]}';
        const flow = JSON.parse(flowRaw);
        (flow.tracks || []).forEach(t => {
            if (t.addedAt && recordEvent({ ts: t.addedAt, kind: 'add', source: 'flow',
                title: t.title, channel: t.channel, url: t.url, format: t.format })) count++;
            if (t.lastPlayed && recordEvent({ ts: t.lastPlayed, kind: 'play', source: 'flow',
                title: t.title, channel: t.channel, url: t.url, format: t.format })) count++;
        });
    } catch (e) { console.error('stats migrate flow:', e.message); }

    fs.writeFileSync(MIGRATION_FLAG, new Date().toISOString());
    console.log(`[stats] import : ${count} evenements importes (strategie ${getStrategy()}).`);
    return { migrated: true, count };
}

function changeStrategy(newStrategy) {
    if (!VALID_STRATEGIES.includes(newStrategy)) throw new Error('Strategie inconnue');
    const cur = getStrategy();
    if (cur === newStrategy) return { changed: false, count: 0 };
    const allEvents = readAllEvents();
    saveSettings({ strategy: newStrategy });
    rewriteAll(allEvents);
    return { changed: true, count: allEvents.length, strategy: newStrategy };
}

function aggregateForView(view, year, month, profileId) {
    const allKeys = listPartitionKeys();
    const events = [];
    allKeys.forEach(k => {
        const data = loadPartitionByPath(path.join(STATS_DIR, k + '.json'));
        if (data && data.events) data.events.forEach(e => events.push(e));
    });

    const filtered = events.filter(e => {
        if (profileId && (e.profileId || '') !== profileId) return false;
        const p = parseTs(e.ts); if (!p) return false;
        if (view === 'global' || view === 'year') return true;
        if (view === 'month') return p.Y === year;
        if (view === 'day') return p.Y === year && p.Mo === month;
        return false;
    });

    const byArtist = {};
    filtered.forEach(e => { if (e.artist) byArtist[e.artist] = (byArtist[e.artist] || 0) + 1; });

    let buckets = [];
    if (view === 'global') {
        const byH = new Array(24).fill(0);
        filtered.forEach(e => { const p = parseTs(e.ts); if (p) byH[p.H]++; });
        buckets = byH.map((v, i) => ({ key: i, label: String(i).padStart(2, '0') + 'h', count: v }));
    } else if (view === 'year') {
        const map = new Map();
        filtered.forEach(e => { const p = parseTs(e.ts); if (p) map.set(p.Y, (map.get(p.Y) || 0) + 1); });
        if (map.size) {
            const years = [...map.keys()].sort((a, b) => a - b);
            const minY = years[0], maxY = years[years.length - 1];
            for (let y = minY; y <= maxY; y++) buckets.push({ key: y, label: String(y), count: map.get(y) || 0 });
        }
    } else if (view === 'month') {
        buckets = new Array(12).fill(0).map((_, i) => ({ key: i + 1, label: String(i + 1).padStart(2, '0'), count: 0 }));
        filtered.forEach(e => { const p = parseTs(e.ts); if (p) buckets[p.Mo - 1].count++; });
    } else if (view === 'day') {
        const dim = new Date(year, month, 0).getDate();
        buckets = new Array(dim).fill(0).map((_, i) => ({ key: i + 1, label: String(i + 1), count: 0 }));
        filtered.forEach(e => { const p = parseTs(e.ts); if (p && p.D >= 1 && p.D <= dim) buckets[p.D - 1].count++; });
    }

    return { total: filtered.length, buckets, byArtist };
}

function detailsForBucket(view, key, year, month, profileId) {
    const allKeys = listPartitionKeys();
    const items = [];
    allKeys.forEach(k => {
        const data = loadPartitionByPath(path.join(STATS_DIR, k + '.json'));
        if (!data || !data.events) return;
        data.events.forEach(e => {
            if (profileId && (e.profileId || '') !== profileId) return;
            const p = parseTs(e.ts); if (!p) return;
            let match = false;
            if (view === 'global') match = p.H === key;
            else if (view === 'year') match = p.Y === key;
            else if (view === 'month') match = p.Y === year && p.Mo === key;
            else if (view === 'day') match = p.Y === year && p.Mo === month && p.D === key;
            if (match) items.push(e);
        });
    });
    return items;
}

function storageInfo() {
    ensureDir();
    const strategy = getStrategy();
    const files = fs.readdirSync(STATS_DIR).filter(isPartitionFile);
    let totalSize = 0, totalEvents = 0;
    const fileList = files.map(n => {
        const full = path.join(STATS_DIR, n);
        const stat = fs.statSync(full);
        totalSize += stat.size;
        let evCount = 0;
        try {
            const d = JSON.parse(fs.readFileSync(full, 'utf8'));
            evCount = (d.events || []).length;
        } catch (e) {}
        totalEvents += evCount;
        return { name: n, size: stat.size, events: evCount };
    }).sort((a, b) => a.name.localeCompare(b.name));
    return {
        strategy, dir: STATS_DIR, fileCount: files.length, totalSize, totalEvents,
        files: fileList, migrated: fs.existsSync(MIGRATION_FLAG)
    };
}

router.all('/', (req, res) => {
    try {
        migrateOnce(false);
        migrateProfilesOnce();
        const action = req.body.action || req.query.action || 'get';
        const profileId = req.body.profile || req.query.profile || '';

        if (action === 'get') {
            const view = req.query.view || req.body.view || 'global';
            const year = parseInt(req.query.year || req.body.year || '0', 10) || null;
            const month = parseInt(req.query.month || req.body.month || '0', 10) || null;
            const result = aggregateForView(view, year, month, profileId);
            return res.json({ success: true, view, ...result, availableMonths: listPartitionKeys() });
        }

        if (action === 'details') {
            const view = req.query.view || req.body.view || 'global';
            const key = parseInt(req.query.key || req.body.key || '0', 10);
            const year = parseInt(req.query.year || req.body.year || '0', 10) || null;
            const month = parseInt(req.query.month || req.body.month || '0', 10) || null;
            const items = detailsForBucket(view, key, year, month, profileId);
            items.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
            const limit = parseInt(req.query.limit || '500', 10);
            return res.json({ success: true, total: items.length, items: items.slice(0, limit) });
        }

        if (action === 'top_artists') {
            const view = req.query.view || req.body.view || 'global';
            const year = parseInt(req.query.year || req.body.year || '0', 10) || null;
            const month = parseInt(req.query.month || req.body.month || '0', 10) || null;
            const result = aggregateForView(view, year, month, profileId);
            const sorted = Object.entries(result.byArtist).sort((a, b) => b[1] - a[1]).slice(0, 10);
            return res.json({ success: true, top: sorted });
        }

        if (action === 'record') {
            const ok = recordEvent({
                ts: req.body.ts, kind: req.body.kind, source: req.body.source,
                title: req.body.title, channel: req.body.channel, artist: req.body.artist,
                url: req.body.url, format: req.body.format,
                profileId
            });
            return res.json({ success: ok });
        }

        if (action === 'reimport') {
            const r = migrateOnce(true);
            return res.json({ success: true, ...r });
        }

        if (action === 'set_strategy') {
            const s = (req.body.strategy || req.query.strategy || '').trim();
            const r = changeStrategy(s);
            return res.json({ success: true, ...r });
        }

        if (action === 'info') {
            return res.json({ success: true, ...storageInfo() });
        }

        if (action === 'forget_ephemeral') {
            const urls = (() => {
                try { return JSON.parse(req.body.urls || req.query.urls || '[]'); }
                catch (e) { return []; }
            })();
            const all = req.body.all === '1' || req.query.all === '1';
            let removed = 0;
            listPartitionKeys().forEach(k => {
                const f = path.join(STATS_DIR, k + '.json');
                const data = loadPartitionByPath(f);
                if (!data || !data.events) return;
                const before = data.events.length;
                data.events = data.events.filter(e => {
                    if (e.kind !== 'stream') return true;
                    if (all) return false;
                    return urls.indexOf(e.url) === -1;
                });
                const diff = before - data.events.length;
                if (diff > 0) {
                    removed += diff;
                    data.summary = emptyPartition(k).summary;
                    data.events.forEach(ev => {
                        const p = parseTs(ev.ts); if (!p) return;
                        data.summary.total++;
                        if (p.H >= 0 && p.H <= 23) data.summary.byHour[p.H]++;
                        if (data.summary.byType[ev.kind] != null) data.summary.byType[ev.kind]++;
                        if (data.summary.bySource[ev.src] != null) data.summary.bySource[ev.src]++;
                        if (ev.artist) data.summary.byArtist[ev.artist] = (data.summary.byArtist[ev.artist] || 0) + 1;
                    });
                    fs.writeFileSync(f, JSON.stringify(data));
                }
            });
            return res.json({ success: true, removed });
        }

        if (action === 'ephemeral') {
            const allKeys = listPartitionKeys();
            const savedUrls = new Set();
            const streamMap = new Map();
            allKeys.forEach(k => {
                const data = loadPartitionByPath(path.join(STATS_DIR, k + '.json'));
                if (!data || !data.events) return;
                data.events.forEach(e => {
                    const url = e.url || '';
                    if (!url) return;
                    if (e.kind === 'dl' || e.kind === 'add') savedUrls.add(url);
                    if (e.kind === 'stream') {
                        const cur = streamMap.get(url) || { url, title: e.title, artist: e.artist || '', count: 0, lastTs: '' };
                        cur.count++;
                        if (!cur.title && e.title) cur.title = e.title;
                        if (!cur.artist && e.artist) cur.artist = e.artist;
                        if (e.ts > cur.lastTs) cur.lastTs = e.ts;
                        streamMap.set(url, cur);
                    }
                });
            });
            const items = [];
            streamMap.forEach((v, url) => { if (!savedUrls.has(url)) items.push(v); });
            items.sort((a, b) => String(b.lastTs).localeCompare(String(a.lastTs)));
            const totalStreams = items.reduce((s, x) => s + x.count, 0);
            return res.json({ success: true, total: items.length, totalStreams, items });
        }

        res.json({ success: false, error: 'Action inconnue.' });
    } catch (e) {
        console.error('stats error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.recordEvent = recordEvent;
module.exports.migrateOnce = migrateOnce;
