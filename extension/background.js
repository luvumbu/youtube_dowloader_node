/**
 * Service Worker (background) - Relais API pour les content scripts.
 *
 * Les content scripts sur youtube.com ne peuvent pas faire de fetch
 * vers localhost (bloque par CORS / Manifest V3).
 * Ce service worker a acces aux host_permissions et sert de proxy.
 */

let API = 'http://127.0.0.1:3000/api';

// Detecter le bon endpoint au demarrage
async function detectApi() {
    try {
        const r = await fetch('http://127.0.0.1:3000/api/system?action=info', { signal: AbortSignal.timeout(3000) });
        if (r.ok) { API = 'http://127.0.0.1:3000/api'; return; }
    } catch (e) {}
    try {
        const r = await fetch('http://localhost:3000/api/system?action=info', { signal: AbortSignal.timeout(3000) });
        if (r.ok) { API = 'http://localhost:3000/api'; return; }
    } catch (e) {}
}
detectApi();

// Ecouter les messages des content scripts et du popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === 'api') {
        handleApiRequest(msg).then(sendResponse).catch(err => {
            sendResponse({ success: false, error: err.message || 'Serveur inaccessible' });
        });
        return true; // garder le canal ouvert pour la reponse async
    }
});

async function handleApiRequest(msg) {
    const { method, endpoint, body, params, contentType } = msg;

    let url = API + endpoint;
    if (params) {
        const qs = new URLSearchParams(params).toString();
        if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }

    const opts = {
        method: method || 'GET',
        headers: {}
    };

    if (body && (method === 'POST' || method === 'PUT')) {
        // Utiliser le content-type transmis par le content script
        if (contentType) {
            opts.headers['Content-Type'] = contentType;
        } else if (typeof body === 'string' && !body.startsWith('{') && !body.startsWith('[')) {
            opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
        } else {
            opts.headers['Content-Type'] = 'application/json';
        }
        opts.body = body;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    opts.signal = controller.signal;

    try {
        const resp = await fetch(url, opts);
        clearTimeout(timer);
        return await resp.json();
    } catch (err) {
        clearTimeout(timer);
        // Re-essayer la detection d'API au cas ou le serveur a redemarre
        await detectApi();
        throw err;
    }
}
