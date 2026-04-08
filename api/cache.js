/**
 * Cache en memoire avec TTL.
 * Partage entre toutes les routes API.
 */
const caches = {};

function getCache(name, ttlMs) {
    if (!caches[name]) {
        caches[name] = { data: new Map(), ttl: ttlMs || 600000 }; // 10 min par defaut
    }
    return {
        get(key) {
            const cache = caches[name];
            const entry = cache.data.get(key);
            if (entry && Date.now() - entry.time < cache.ttl) return entry.value;
            cache.data.delete(key);
            return null;
        },
        set(key, value) {
            const cache = caches[name];
            cache.data.set(key, { value, time: Date.now() });
            // Nettoyer si trop gros
            if (cache.data.size > 500) {
                const now = Date.now();
                for (const [k, v] of cache.data) {
                    if (now - v.time > cache.ttl) cache.data.delete(k);
                }
            }
        },
        size() { return caches[name].data.size; }
    };
}

function clearAll() {
    for (const name in caches) {
        caches[name].data.clear();
    }
}

function stats() {
    const result = {};
    for (const name in caches) {
        result[name] = { entries: caches[name].data.size, ttl: caches[name].ttl };
    }
    return result;
}

module.exports = { getCache, clearAll, stats };
