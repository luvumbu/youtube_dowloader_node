const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Fichiers statiques
app.use(express.static(path.join(__dirname, 'public')));
app.use('/downloads', express.static(config.DOWNLOADS_DIR));

// Creer les dossiers manquants
[config.DOWNLOADS_DIR, config.DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialiser les fichiers JSON manquants
const defaults = {
    [config.LIBRARY_FILE]: JSON.stringify({ folders: [], items: [] }),
    [config.PROFILES_FILE]: JSON.stringify([]),
    [config.HISTORY_FILE]: JSON.stringify([]),
    [config.QUEUE_FILE]: JSON.stringify([]),
    [config.NOTIFICATIONS_FILE]: JSON.stringify([])
};
for (const [file, content] of Object.entries(defaults)) {
    if (!fs.existsSync(file)) fs.writeFileSync(file, content);
}

// Routes API - chargement securise
function loadRoute(routePath, modulePath) {
    try {
        app.use(routePath, require(modulePath));
    } catch (err) {
        console.error(`ERREUR: Impossible de charger ${routePath} (${modulePath}): ${err.message}`);
        app.use(routePath, (req, res) => {
            res.status(500).json({ success: false, error: `Module ${routePath} non disponible.` });
        });
    }
}

loadRoute('/api/info', './api/info');
loadRoute('/api/download', './api/download');
loadRoute('/api/progress', './api/progress');
loadRoute('/api/library', './api/library');
loadRoute('/api/queue', './api/queue');
loadRoute('/api/notifications', './api/notifications');
loadRoute('/api/profile', './api/profile');
loadRoute('/api/search', './api/search');
loadRoute('/api/playlist', './api/playlist');
loadRoute('/api/history', './api/history');
loadRoute('/api/system', './api/system');
loadRoute('/api/convert', './api/convert');

// Page principale
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Gestion globale des erreurs (empeche le crash du serveur)
app.use((err, req, res, next) => {
    console.error('=== ERREUR sur', req.method, req.url, '===');
    console.error(err.stack || err.message || err);
    res.status(500).json({ success: false, error: err.message || 'Erreur interne du serveur.' });
});

// Capturer les erreurs non gerees pour eviter le crash
process.on('uncaughtException', (err) => {
    console.error('Exception non capturee:', err.message);
});

process.on('unhandledRejection', (reason) => {
    console.error('Promesse rejetee non geree:', reason);
});

// Demarrer le serveur
const server = app.listen(config.PORT, () => {
    console.log(`YouTube Downloader demarre sur http://localhost:${config.PORT}`);

    // Afficher l'etat des dependances
    const deps = config.checkDependencies();
    if (!deps.ok) {
        console.log('');
        console.log('ATTENTION - Dependances manquantes : ' + deps.missing.join(', '));
        console.log('Lance start.bat pour installer automatiquement.');
        console.log('');
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`ERREUR: Le port ${config.PORT} est deja utilise.`);
        console.error('Ferme l\'autre instance ou change le port dans config.js');
    } else {
        console.error('Erreur serveur:', err.message);
    }
    process.exit(1);
});
