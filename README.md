# YouTube Downloader Node

Application locale de telechargement YouTube construite avec Node.js, Express et yt-dlp.

## Architecture

```
youtube_dowloader_node/
├── server.js            # Serveur Express (port 3000)
├── config.js            # Configuration auto-detectee (Python, ffmpeg, yt-dlp)
├── worker.js            # Processus de telechargement en arriere-plan
├── start.bat            # Script d'installation et lancement Windows
├── api/                 # Routes API REST
│   ├── download.js      # Lancer un telechargement
│   ├── info.js          # Metadata d'une video (titre, duree, vues...)
│   ├── search.js        # Recherche YouTube (jusqu'a 20 resultats)
│   ├── playlist.js      # Extraction des videos d'une playlist
│   ├── progress.js      # Suivi de progression des telechargements
│   ├── library.js       # Bibliotheque persistante (dossiers, items)
│   ├── queue.js         # File d'attente de telechargements
│   ├── notifications.js # Systeme de notifications (max 100)
│   ├── profile.js       # Profils utilisateur et preferences
│   ├── history.js       # Historique des telechargements (max 200)
│   └── system.js        # Info systeme et mise a jour yt-dlp
├── public/              # Interface web
│   ├── index.html       # Page principale multi-onglets
│   ├── js/app.js        # Logique frontend (~31 000 lignes)
│   └── css/style.css    # Styles dark/light theme (~17 000 lignes)
├── extension/           # Extension Chrome
│   ├── manifest.json    # Config extension (permissions YouTube + localhost)
│   ├── popup.html/js    # Popup de l'extension
│   ├── content.js/css   # Script injecte dans les pages YouTube
│   └── icon48/128.png   # Icones
├── data/                # Donnees persistantes (JSON)
│   ├── library.json
│   ├── profiles.json
│   ├── history.json
│   ├── queue.json
│   └── notifications.json
└── downloads/           # Fichiers telecharges
```

## Fonctionnalites

### Telechargement
- **Audio** : MP3, FLAC, WAV, AAC, OGG (qualites : best/medium/low)
- **Video** : MP4, MKV, WEBM (qualites : best/1080p/720p/480p/360p)
- Telechargement de la couverture (thumbnail) en option
- Renommage automatique avec le titre YouTube
- Worker en processus separe (`child_process.spawn`)

### Interface Web (port 3000)
- 4 onglets : Telechargement, Recherche, Bibliotheque, Profil
- Lecteur multimedia integre avec playlist
- Gestion de bibliotheque avec dossiers
- Statistiques (nombre de fichiers, espace disque, duree totale)
- Theme sombre/clair
- Notifications navigateur a la fin des telechargements
- Historique des telechargements

### Extension Chrome
- Bouton flottant sur les pages YouTube
- Telechargement rapide depuis la page video
- Panneau de selection format/qualite
- Support des playlists (telechargement par lot)
- File d'attente avec suivi de progression
- Panneau de logs et notifications
- Sauvegarde des preferences via Chrome Storage

### Recherche et Playlists
- Recherche YouTube directe depuis l'app
- Extraction et telechargement de playlists entieres
- Ajout en masse a la file d'attente

## Dependances

| Package | Role |
|---------|------|
| `express` | Serveur HTTP |
| `cors` | Cross-Origin (extension -> serveur) |

Outils externes (installes automatiquement par `start.bat`) :
- **Node.js** - Runtime
- **Python 3** - Requis pour yt-dlp
- **yt-dlp** - Moteur de telechargement (`python -m yt_dlp`)
- **ffmpeg** - Conversion audio/video, thumbnails

## Lancement

### Methode rapide (Windows)
```
start.bat
```
Installe automatiquement toutes les dependances manquantes (Node.js, Python, yt-dlp, ffmpeg) puis ouvre le navigateur sur `http://localhost:3000`.

### Methode manuelle
```bash
npm install
node server.js
```
Pre-requis : Node.js, Python, yt-dlp et ffmpeg dans le PATH.

## API REST

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/api/download` | Lancer un telechargement |
| GET | `/api/info?url=` | Infos d'une video |
| GET | `/api/progress/:jobId` | Progression d'un telechargement |
| GET | `/api/search?q=` | Recherche YouTube |
| GET | `/api/playlist?url=` | Videos d'une playlist |
| GET/POST | `/api/library` | Gestion bibliotheque |
| GET/POST | `/api/queue` | File d'attente |
| GET/POST | `/api/notifications` | Notifications |
| GET/POST | `/api/profile` | Profils utilisateur |
| GET/POST | `/api/history` | Historique |
| GET/POST | `/api/system` | Info systeme / MAJ yt-dlp |

## Donnees

Toutes les donnees sont stockees localement en fichiers JSON dans le dossier `data/`. Aucune base de donnees externe requise.

## Extension Chrome

Pour installer l'extension :
1. Ouvrir `chrome://extensions/`
2. Activer le "Mode developpeur"
3. Cliquer "Charger l'extension non empaquetee"
4. Selectionner le dossier `extension/`

L'extension communique avec le serveur local sur `http://127.0.0.1:3000`.
