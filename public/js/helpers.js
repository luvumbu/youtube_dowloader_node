// =====================================================
// helpers.js - Outils transverses utilises par app.js
// Charge AVANT app.js. Tout est expose globalement.
// =====================================================

// ----- escapeHtml(s) -----
// Echappe les caracteres dangereux pour insertion dans du HTML.
window.escapeHtml = function (s) {
    return String(s ?? '').replace(/[<>&"']/g, c => ({
        '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
    }[c]));
};

// Injecte automatiquement profile=<currentUser.id> sur les appels api/flow,
// api/library, api/stats et api/history (cloisonnement par profil cote client,
// sans toucher chaque call site).
function _injectProfile(url, opts) {
    const isProfileScoped = /(^|\/)api\/(flow|library|stats|history)(\?|\/|$)/.test(url);
    if (!isProfileScoped) return { url, opts };
    const profileId = (window.currentUser && window.currentUser.id) || '';
    if (!profileId) return { url, opts };
    if (opts && opts.method === 'POST' && typeof opts.body === 'string') {
        const params = new URLSearchParams(opts.body);
        if (!params.has('profile')) {
            params.set('profile', profileId);
            opts = { ...opts, body: params.toString() };
        }
    } else {
        if (!/[?&]profile=/.test(url)) {
            url += (url.includes('?') ? '&' : '?') + 'profile=' + encodeURIComponent(profileId);
        }
    }
    return { url, opts };
}

// ----- apiCall(url, opts) -----
// Wrapper fetch unifie : detecte si le serveur ne renvoie pas de JSON
// (cas typique : le backend n'a pas ete redemarre apres modif d'API).
window.apiCall = async function (url, opts = {}) {
    ({ url, opts } = _injectProfile(url, opts));
    let resp;
    try {
        resp = await fetch(url, opts);
    } catch (e) {
        throw new Error('Connexion serveur impossible : ' + e.message);
    }
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
        throw new Error('Le serveur ne repond pas en JSON. Redemarre le serveur Node (Ctrl+C puis start.bat) pour charger la nouvelle route.');
    }
    return resp.json();
};

// Wrapper POST form-urlencoded (raccourci tres frequent)
window.apiPost = function (url, params) {
    const body = (params instanceof URLSearchParams) ? params : new URLSearchParams(params || {});
    return apiCall(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
    });
};

// ----- Format -----
// Helpers de mise en forme reutilisables.
window.Format = {
    // 86399999 ms -> "23h 59min 59s" (Math.floor pour decompte naturel)
    duration(ms) {
        if (ms == null || ms <= 0) return '0s';
        const total = Math.floor(ms / 1000);
        const h = Math.floor(total / 3600);
        const m = Math.floor((total % 3600) / 60);
        const s = total % 60;
        const pad = n => String(n).padStart(2, '0');
        if (h > 0) return `${h}h ${pad(m)}min ${pad(s)}s`;
        if (m > 0) return `${m}min ${pad(s)}s`;
        return `${s}s`;
    },

    // Variante compacte sans secondes : "12h 34min" / "45min" / "30s"
    durationShort(seconds) {
        if (!seconds) return '';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`;
        if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`;
        return `${s}s`;
    },

    // "3:45" ou "1:23:45" -> nombre de secondes
    parseClock(str) {
        if (!str) return 0;
        const s = String(str).trim();
        const m = s.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})$/);
        if (m) return (parseInt(m[1] || '0', 10) * 3600) + (parseInt(m[2], 10) * 60) + parseInt(m[3], 10);
        const n = parseInt(s, 10);
        return isNaN(n) ? 0 : n;
    },

    // "2026-04-25" ou "2026-04-25 14:30:00" -> "25/04/2026"
    dateEU(s) {
        if (!s) return '';
        const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s);
    },

    // "2026-04-25 14:30:00" -> "14:30"
    timeEU(s) {
        if (!s) return '';
        const m = String(s).match(/(\d{1,2}):(\d{2})/);
        return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
    },

    // 1536 -> "1.5 Ko"
    bytes(n) {
        if (n == null) return '0 o';
        if (n < 1024) return n + ' o';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' Ko';
        return (n / 1024 / 1024).toFixed(2) + ' Mo';
    }
};

// ----- Dom -----
// Securite pour les insertions dans des contextes specifiques.
window.Dom = {
    // Pour insertion dans un attribut HTML (alt="...", title="...")
    attr(s) {
        return String(s ?? '').replace(/[<>&"']/g, c => ({
            '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;'
        }[c]));
    },

    // Pour insertion dans un onclick="fn('...')" - echappe quotes JS
    jsStr(s) {
        return String(s ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;').replace(/\n/g, '\\n');
    }
};

// ----- Modal -----
// API unifiee pour confirmer / prompt / contenu personnalise.
window.Modal = {
    // Modal.confirm({ title, message, confirmText, cancelText, danger }) -> Promise<bool>
    confirm(opts = {}) {
        return new Promise(resolve => {
            const { title = 'Confirmation', message = '', confirmText = 'Confirmer', cancelText = 'Annuler', danger = false } = opts;
            const bg = danger ? 'var(--error,#f44336)' : 'var(--primary)';
            this._show(`
                <h3 style="margin-top:0;margin-bottom:12px;font-size:17px;">${title}</h3>
                <div style="font-size:13px;color:var(--text);margin-bottom:18px;">${message}</div>
                <div class="modal-btns">
                    <button class="btn-cancel" data-act="cancel">${escapeHtml(cancelText)}</button>
                    <button data-act="ok" style="background:${bg};color:#fff;border:none;border-radius:20px;font-weight:600;">${escapeHtml(confirmText)}</button>
                </div>
            `, (act) => resolve(act === 'ok'));
        });
    },

    // Modal.prompt({ title, message, defaultValue, placeholder, validator }) -> Promise<string|null>
    prompt(opts = {}) {
        return new Promise(resolve => {
            const { title = 'Saisie', message = '', defaultValue = '', placeholder = '', confirmText = 'OK', cancelText = 'Annuler', validator = null } = opts;
            this._show(`
                <h3 style="margin-top:0;margin-bottom:12px;font-size:17px;">${title}</h3>
                ${message ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">${message}</div>` : ''}
                <input type="text" id="modalPromptInput" value="${Dom.attr(defaultValue)}" placeholder="${Dom.attr(placeholder)}" style="width:100%;padding:8px 12px;border-radius:8px;border:1px solid var(--border);background:var(--bg-card);color:var(--text);font-size:14px;margin-bottom:6px;">
                <div id="modalPromptError" style="color:var(--error,#f44336);font-size:11px;margin-bottom:10px;display:none;"></div>
                <div class="modal-btns">
                    <button class="btn-cancel" data-act="cancel">${escapeHtml(cancelText)}</button>
                    <button data-act="ok" style="background:var(--primary);color:#fff;border:none;border-radius:20px;font-weight:600;">${escapeHtml(confirmText)}</button>
                </div>
            `, (act, root) => {
                if (act !== 'ok') return resolve(null);
                const val = root.querySelector('#modalPromptInput').value.trim();
                if (validator) {
                    const err = validator(val);
                    if (err) {
                        const e = root.querySelector('#modalPromptError');
                        e.textContent = err; e.style.display = 'block';
                        return false; // empeche la fermeture
                    }
                }
                resolve(val);
            }, (root) => {
                const inp = root.querySelector('#modalPromptInput');
                if (inp) { inp.focus(); inp.select(); }
            });
        });
    },

    // Modal.custom({ title, html, width, onMount }) -> { close(), root }
    // L'utilisateur gere ses propres boutons dans html.
    custom(opts = {}) {
        const { title = '', html = '', width = 420, onMount = null } = opts;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.innerHTML = `<div class="modal confirm-modal" style="width:${width}px;max-width:95vw;">
            ${title ? `<h3 style="margin-top:0;margin-bottom:12px;font-size:17px;">${title}</h3>` : ''}
            ${html}
        </div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        if (onMount) onMount(overlay, close);
        return { root: overlay, close };
    },

    // Helper interne : monte un overlay avec callbacks data-act
    _show(html, onClose, onMount) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.innerHTML = `<div class="modal confirm-modal">${html}</div>`;
        document.body.appendChild(overlay);
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
        const handle = (act) => {
            const result = onClose(act, overlay);
            if (result !== false) close();
        };
        const onKey = e => {
            if (e.key === 'Escape') handle('cancel');
            else if (e.key === 'Enter' && !(e.target.tagName === 'TEXTAREA')) handle('ok');
        };
        overlay.addEventListener('click', e => { if (e.target === overlay) handle('cancel'); });
        overlay.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => handle(b.dataset.act)));
        document.addEventListener('keydown', onKey);
        if (onMount) setTimeout(() => onMount(overlay), 30);
        else setTimeout(() => { const ok = overlay.querySelector('[data-act="ok"]'); if (ok) ok.focus(); }, 30);
    }
};
