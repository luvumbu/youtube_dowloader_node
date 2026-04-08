# YouTube Downloader Node

Application locale de telechargement et streaming YouTube construite avec Node.js, Express et yt-dlp.
Aucune API YouTube officielle n'est utilisee - yt-dlp simule un navigateur pour acceder aux donnees.

## Architecture

```
youtube_dowloader_node/
├── server.js            # Serveur Express (port 3000, ecoute sur 0.0.0.0)
├── config.js            # Detection auto des outils (Python, ffmpeg, yt-dlp)
│                        # Detecte aussi les installations locales (ffmpeg/, python_local/, node_local/)
├── worker.js            # Processus de telechargement en arriere-plan (spawn)
│                        # Utilise --remote-components ejs:github pour contourner l'anti-bot YouTube
├── start.bat            # Script d'installation et lancement Windows
│                        # 3 methodes d'installation : winget, telechargement direct, installation locale
│                        # Aucune condition bloquante sauf Node.js absent
├── api/
│   ├── download.js      # POST /api/download - lance un worker de telechargement
│   ├── info.js          # POST /api/info - metadata video via yt-dlp --dump-json
│   ├── search.js        # GET /api/search?q=&max= - recherche via ytsearchN (jusqu'a 50 resultats)
│   ├── playlist.js      # POST /api/playlist - extraction playlist via --flat-playlist
│   ├── progress.js      # GET /api/progress?id= - lecture du fichier .log du worker
│   │                    # Detection d'erreur corrigee : ne matche que ^ERROR, pas les WARNING
│   ├── library.js       # GET/POST /api/library - CRUD bibliotheque + taille fichiers (fs.statSync)
│   │                    # Anti-doublon par videoId + format
│   ├── queue.js         # GET/POST /api/queue - file d'attente persistante
│   ├── notifications.js # GET/POST /api/notifications - max 100
│   ├── profile.js       # GET/POST /api/profile - profils utilisateur
│   ├── history.js       # GET/POST /api/history - max 200, avec source (local/importe) et thumbnail
│   ├── convert.js       # POST /api/convert - conversion entre formats via ffmpeg
│   ├── stream.js        # GET /api/stream?url=&type= - recupere l'URL directe via yt-dlp --get-url
│   │                    # GET /api/stream/play?url=&type= - proxy le flux YouTube vers le navigateur
│   │                    # Force Content-Type audio/mp4 ou video/mp4 pour eviter le telechargement
│   │                    # Cache des URLs 4h, supporte les requetes Range (seek)
│   │                    # Format force : bestaudio[ext=m4a] pour compatibilite navigateur
│   ├── flow.js          # GET/POST /api/flow - Mon Flow : tracks, playlists, compteur d'ecoutes
│   │                    # Actions : list, add, add_bulk, remove, play, top, create_playlist,
│   │                    # delete_playlist, move, clear
│   │                    # Chaque track a : playCount, lastPlayed, playlist
│   └── system.js        # GET/POST /api/system - version yt-dlp, espace disque, mise a jour
├── public/
│   ├── index.html       # Page principale - 5 onglets + player bar fixe en bas
│   │                    # Onglets : Telecharger, Recherche, Bibliotheque, Mon Flow, Profil
│   │                    # Video overlay global avec iframe YouTube + video locale
│   │                    # Panneau de logs techniques (bouton engrenage)
│   ├── js/app.js        # Frontend complet :
│   │                    # - Systeme de logs techniques (logTech, copyLogs, panneau)
│   │                    # - Telechargement avec retry, detection 429, progression temps reel
│   │                    # - Bibliotheque avec tri (date/titre/type/taille), filtres, recherche
│   │                    # - Historique avec source local/importe, filtres present/absent,
│   │                    #   re-telechargement par lot avec choix du format, barre de progression,
│   │                    #   detection doublons, streaming audio, iframe video YouTube
│   │                    # - Mon Flow : streaming audio proxy, iframe video YouTube,
│   │                    #   playlists, drag&drop, pre-chargement, compteur d'ecoutes,
│   │                    #   recherche YouTube integree avec pagination, tri,
│   │                    #   detection DL/Flow dans les resultats, telechargement depuis Flow,
│   │                    #   sauvegarde/restauration d'etat au refresh
│   │                    # - Recherche YouTube avec pagination, boutons DL/+File/+Flow/Video,
│   │                    #   detection elements deja telecharges ou dans Mon Flow
│   │                    # - Player bar global : utilise par bibliotheque ET Mon Flow,
│   │                    #   boutons suivant/precedent detectent si c'est Mon Flow ou local
│   │                    # - playYoutubeVideo() : fonction globale iframe YouTube utilisee partout
│   └── css/style.css    # Styles dark/light theme, badges DL/Flow, drag&drop feedback
├── extension/           # Extension Chrome v1 (telechargement uniquement)
├── extension_v2/        # Extension Chrome v2 (telechargement + Mon Flow)
│   ├── manifest.json    # v2.0 - "YouTube Downloader + Mon Flow"
│   ├── popup.html       # Popup avec 2 sections : Telecharger (rouge) + Mon Flow (violet)
│   ├── popup.js         # Gestion popup : telechargement, ajout Flow, creation playlist
│   ├── content.js       # Injecte sur YouTube :
│   │                    # - Bouton flottant DL (gris) : telechargement rapide
│   │                    # - Bouton flottant +F (violet) : ajout rapide a Mon Flow
│   │                    # - Bouton flottant Options : panneau complet avec section Mon Flow
│   │                    # - Banniere playlist : "Tout telecharger" + "+ Mon Flow" (cree la playlist auto)
│   │                    # - loadFlowPlaylistsPanel() : charge les playlists depuis l'API
│   ├── content.css      # Styles boutons flottants (.ytdl-fab-flow violet)
│   ├── background.js    # Service worker pour proxy fetch (CORS Manifest V3)
│   └── icon48/128.png   # Icones
├── data/                # Donnees persistantes (JSON, crees automatiquement)
│   ├── library.json     # { folders: [], items: [] }
│   ├── profiles.json    # []
│   ├── history.json     # [ { title, url, format, type, source, thumbnail, date, ... } ]
│   ├── queue.json       # []
│   ├── notifications.json # []
│   └── flow.json        # { tracks: [ { id, title, url, channel, thumbnail, playlist,
│                        #     playCount, lastPlayed, addedAt, ... } ], playlists: [ { name } ] }
└── downloads/           # Fichiers telecharges (mp3, mp4, jpg, etc.)
```

## Fonctionnalites detaillees

### 1. Telechargement
- **Formats audio** : MP3, FLAC, WAV, AAC, OGG (qualites : meilleure/moyenne/basse)
- **Formats video** : MP4, MKV, WEBM (qualites : best/1080p/720p/480p/360p)
- Telechargement de la **couverture** (thumbnail) en option, convertie en JPG via ffmpeg
- **Renommage automatique** avec le titre YouTube (caracteres speciaux nettoyes)
- Worker en **processus separe** (`child_process.spawn`, detached, pas de shell = pas d'injection)
- **Anti-bot YouTube** : `--remote-components ejs:github` resout les challenges JavaScript
- **Progression temps reel** : le worker ecrit dans un fichier `.log`, l'API `/api/progress` le lit
- **Detection d'erreur corrigee** : le regex ne matche que les lignes `^ERROR:` de yt-dlp, pas les WARNING contenant "Error" (ex: "HTTP Error 429" dans un WARNING)
- **Encodage URL des fichiers** : les noms avec espaces/accents sont encodes avec `encodeURIComponent`
- **Anti-429** : pas de retry automatique sur erreur 429, message explicite a l'utilisateur

### 2. Interface Web (5 onglets)

#### Onglet Telecharger
- Coller une URL YouTube, choisir format/qualite
- Carte video avec thumbnail, titre, artiste, vues, annee, likes
- Barre de progression en temps reel
- Detection automatique des playlists (redirection vers telechargement par lot)
- File d'attente de telechargements

#### Onglet Recherche
- Recherche YouTube via `yt-dlp ytsearchN`
- **Pagination** : bouton "Charger plus de resultats" (20 par page, jusqu'a 50)
- Pour chaque resultat :
  - **DL** : telecharger directement
  - **+ File** : ajouter a la file d'attente
  - **+ Flow** (violet) : ajouter a Mon Flow sans telecharger
  - **Video** (bleu) : regarder en iframe YouTube
- **"+ Tout dans Mon Flow"** : ajouter tous les resultats d'un coup
- **Detection automatique** : badge "DL" si deja telecharge, "Flow" grise si deja dans Mon Flow
- Bordure verte (DL) ou violette (Flow) sur les cartes

#### Onglet Bibliotheque
- **Statistiques** : total, audio, video, espace disque, duree totale
- **Dossiers** : creer, supprimer, deplacer des fichiers entre dossiers
- **Tri** : date (recent/ancien), titre A-Z/Z-A, type audio/video, taille (gros/petit)
- **Filtres** : par type (audio/video), par format (MP3/MP4/etc.)
- **Recherche** textuelle par titre
- **Selection multiple** : tout selectionner, lire la selection, supprimer la selection
- **Lecteur multimedia** : player bar en bas avec seek, volume, shuffle, loop
- **Taille des fichiers** : calculee via `fs.statSync` dans l'API library

##### Sous-section Historique (dans Bibliotheque)
- Acces via le bouton **"Historique"** (cache la bibliotheque, affiche l'historique seul)
- **Recherche** textuelle par titre ou artiste
- **Filtres** :
  - **Presence** : Tous / Presents (dans la biblio) / Absents
  - **Source** : Local / nom du fichier importe (quand plusieurs sources)
- **Tri** : date, titre, type
- **Pour chaque element** :
  - Thumbnail YouTube (ou fallback via videoId)
  - Badge **"Local"** (bleu) ou **nom de l'import** (orange)
  - Badge **"Dans la biblio"** (vert) + bordure verte si fichier present
  - Case a cocher pour selection
  - **Ecouter** (rouge) : streaming audio (local si present, YouTube sinon)
  - **Video** (bleu) : iframe YouTube
  - **+ Flow** (violet) : ajouter a Mon Flow
  - Draggable vers l'onglet Mon Flow ou une playlist
- **Re-telechargement par lot** :
  - Selecteur de format (MP3/FLAC/MP4/etc. ou format d'origine)
  - File visuelle avec thumbnail, barre de progression, pourcentage, statut
  - Elements deja presents affiches en grise ("Deja dans la bibliotheque") et sautes
  - Delai de 3s entre chaque telechargement (anti-429)
  - Ajout automatique a la bibliotheque apres telechargement
- **Export/Import** :
  - Exporter en fichier JSON (selection ou tout)
  - Importer un JSON (dedoublonnage automatique par URL)
  - Source marquee avec le nom du fichier importe

#### Onglet Mon Flow (Streaming)
Systeme de streaming integre - un **Spotify personnel** sans telechargement.

##### Ajouter des morceaux (7 methodes)
1. **"+ Depuis l'historique"** : importe tous les telechargements passes
2. **"Rechercher sur YouTube"** (violet) : recherche avec apercu, pagination, ajout
3. **"+ Ajouter par URL"** : coller une URL YouTube
4. **Bouton "+ Flow"** dans l'historique : ajout individuel
5. **Drag & drop** depuis l'historique vers Mon Flow
6. **Extension Chrome** : bouton +F sur YouTube ou panneau Mon Flow
7. **Import** : charger un fichier JSON

##### Playlists
- **"+ Nouvelle playlist"** : creer (ex: "Rap FR", "Chill", "Workout")
- **Menu deroulant** sur chaque morceau pour deplacer vers une playlist
- **Drag & drop** : glisser un morceau sur un chip de playlist
- **Chips de filtres** : "Tout", "Sans playlist", et chaque playlist avec compteur
- **Bouton play** sur un chip : lire toute la playlist
- **Bouton supprimer** sur un chip : supprime la playlist (morceaux restent)
- **Tag violet** sur chaque morceau indiquant sa playlist

##### Lecture audio
- **"Ecouter"** (rouge) : lance le streaming dans le **player bar global en bas**
- Player bar identique a la bibliotheque : thumbnail, titre, artiste, seek, volume
- **Boutons precedent/suivant** du player bar detectent si Mon Flow est actif
- **Pre-chargement** : le morceau suivant est prepare en avance (0 coupure)
- **Lecture locale automatique** : si le fichier existe en local, pas de streaming
- **Mode aleatoire** (shuffle)
- **Sauvegarde d'etat** : au refresh de la page, le morceau reprend a la meme position

##### Lecture video
- **"Video"** (bleu) : ouvre un **iframe YouTube** en overlay
- Autoplay, plein ecran disponible
- Bouton fermer pour revenir a la liste
- Meme systeme utilise partout (recherche, historique, Mon Flow)

##### Compteur d'ecoutes
- Chaque lecture incremente **playCount** et enregistre **lastPlayed**
- Badge rouge **"3x"** sur chaque morceau indiquant le nombre d'ecoutes
- **Tri "Plus ecoutes"** : voir ses morceaux preferes en premier
- **Tri "Ecoute recemment"** : voir ses dernieres ecoutes

##### Telechargement depuis Mon Flow
- **Selecteur de format** en haut (MP3/FLAC/MP4/etc.)
- Bouton **"DL"** (vert) sur chaque morceau
- Progression en % affichee sur le bouton
- **Detection automatique** : badge "DL" vert + "check DL" gris si deja telecharge dans le format choisi
- Changement de format = mise a jour automatique des badges
- Ajout automatique a la bibliotheque et a l'historique

##### Tri et filtres
- **Recherche** textuelle par titre ou artiste
- **Tri** : ajout recent/ancien, titre A-Z/Z-A, artiste, plus/moins ecoutes, ecoute recemment, type
- **Filtres playlist** : chips cliquables en haut

##### Export/Import
- **Exporter** : sauvegarde la collection en JSON
- **Importer** : charge un JSON (doublons ignores)
- Transferer entre PC et ecouter en streaming sans re-telecharger

#### Onglet Profil
- Gestion des profils utilisateur
- Preferences par defaut (type, format, qualite)

### 3. Extension Chrome v2

#### Installation
1. `chrome://extensions/` > Mode developpeur > Charger l'extension non empaquetee > `extension_v2/`

#### Boutons flottants (en bas a droite de chaque page YouTube)
- **DL** (gris) : telechargement rapide avec preferences sauvegardees
- **+F** (violet) : ajouter a Mon Flow en un clic (recupere les infos via /api/info)
- **Options** : ouvre le panneau complet

#### Panneau Options (sur la page YouTube)
- Info video : thumbnail, titre, artiste
- Type audio/video, format, qualite
- Couverture optionnelle
- Bouton "Telecharger" + "+ File d'attente"
- **Section Mon Flow** (encadre violet) :
  - Selecteur de playlist (charge depuis /api/flow)
  - Bouton "+" pour creer une playlist
  - Bouton "Ajouter a Mon Flow"

#### Popup de l'extension (clic sur l'icone)
- Memes fonctionnalites que le panneau
- Deux sections separees : Telecharger (rouge) et Mon Flow (violet)

#### Playlists YouTube
- Banniere automatique quand une playlist est detectee
- **"Tout telecharger"** (rouge) : telecharge tous les elements
- **"+ Mon Flow"** (violet) :
  - Cree automatiquement la playlist dans Mon Flow avec le nom YouTube
  - Ajoute tous les morceaux dans cette playlist
  - Anti-doublon automatique

### 4. Systeme technique

#### Detection et installation automatique (start.bat)
Pour chaque outil (Node.js, Python, ffmpeg, yt-dlp) :
1. Verifie si present dans le PATH
2. Verifie si present en installation locale (node_local/, python_local/, ffmpeg/)
3. Tente winget si disponible
4. Telechargement direct via PowerShell si winget absent :
   - Node.js depuis nodejs.org (dans node_local/)
   - Python embeddable depuis python.org (dans python_local/, avec pip)
   - ffmpeg depuis gyan.dev (dans ffmpeg/)
   - yt-dlp via pip ou en standalone (yt-dlp.exe)
5. Aucune etape ne bloque l'avancement (sauf Node.js = obligatoire)
6. RefreshPath recharge le PATH depuis le registre + outils locaux

#### Proxy streaming (stream.js)
- `yt-dlp --get-url -f bestaudio[ext=m4a]` : recupere l'URL directe YouTube
- Le serveur proxy le flux vers le navigateur avec `Content-Type: audio/mp4`
- Supporte les requetes Range (seek dans le morceau)
- Cache des URLs 4h (Map en memoire, nettoyage automatique > 200 entrees)
- Sans le proxy, le navigateur proposerait de telecharger au lieu de lire

#### Player bar global
- Un seul element `<audio id="audioEl">` utilise par la bibliotheque ET Mon Flow
- `savePlayerState()` sauvegarde dans localStorage : position, volume, playing, playlist ou flowState
- `restorePlayerState()` au chargement : detecte si c'etait Mon Flow ou local, restaure l'etat
- Pour Mon Flow : re-fetche l'URL de streaming puis reprend a la bonne position
- `playerNext()`/`playerPrev()` detectent `flowCurrentIdx >= 0` pour deleguer a Mon Flow

#### Iframe video YouTube
- Fonction globale `playYoutubeVideo(url, title)` utilisee partout
- Extrait le videoId depuis l'URL (watch, youtu.be, shorts)
- Ouvre l'overlay avec `<iframe>` YouTube embed en autoplay
- `closeVideoPlayer()` nettoie iframe + video locale
- Remplace l'ancien systeme de streaming video (qui ne marchait pas a cause des headers YouTube)

#### Logs techniques
- `logTech(level, msg, data)` : enregistre dans un tableau en memoire (max 200)
- Panneau accessible via bouton engrenage en bas a droite
- Bouton "Copier les logs" pour diagnostic
- Enregistre : infos video, telechargements, streaming, erreurs, pre-chargement

## API REST complete

| Methode | Route | Description |
|---------|-------|-------------|
| POST | `/api/download` | Lance un worker de telechargement |
| POST | `/api/info` | Infos video via yt-dlp --dump-json |
| GET | `/api/progress?id=` | Progression (lecture du .log) |
| GET | `/api/search?q=&max=` | Recherche YouTube (ytsearchN, max 50) |
| POST | `/api/playlist` | Videos d'une playlist (--flat-playlist) |
| GET/POST | `/api/library` | Bibliotheque : list (avec taille), add_item, create_folder, delete, etc. |
| GET/POST | `/api/queue` | File d'attente |
| GET/POST | `/api/notifications` | Notifications |
| GET/POST | `/api/profile` | Profils utilisateur |
| GET/POST | `/api/history` | Historique : list, add (avec source/thumbnail), clear |
| GET/POST | `/api/flow` | Mon Flow : list, add, add_bulk, remove, play, top, create_playlist, delete_playlist, move, clear |
| GET | `/api/stream?url=&type=` | Recupere l'URL de streaming (retourne URL du proxy) |
| GET | `/api/stream/play?url=&type=` | Proxy streaming (pipe YouTube -> navigateur avec bons headers) |
| GET/POST | `/api/system` | Info systeme, mise a jour yt-dlp |
| POST | `/api/convert` | Conversion entre formats |

## Donnees persistantes

Toutes stockees en JSON dans `data/` (cree automatiquement) :

| Fichier | Contenu | Limite |
|---------|---------|--------|
| library.json | Fichiers telecharges, dossiers | Illimite |
| history.json | Historique telechargements avec source/thumbnail | 200 max |
| flow.json | Tracks Mon Flow avec playlists, playCount, lastPlayed | Illimite |
| profiles.json | Profils utilisateur | - |
| queue.json | File d'attente | - |
| notifications.json | Notifications | 100 max |

## Installation

### Methode rapide (Windows)
```
start.bat
```
Tout est automatique. Ouvre le navigateur sur `http://localhost:3000`.

### Methode manuelle
```bash
npm install
node server.js
```

## Transferer sur un autre PC

1. Copier le dossier (sans `node_modules/`, `downloads/`, `data/`)
2. Lancer `start.bat`
3. Recuperer sa collection :
   - **Historique** : Exporter > Importer > Re-telecharger (fichiers physiques)
   - **Mon Flow** : Exporter > Importer > Ecouter en streaming (pas besoin de re-telecharger)

## Performances et consommation

### Mon Flow vs YouTube : comparaison

| | YouTube (navigateur) | Mon Flow (streaming audio) | Economie |
|--|--|--|--|
| **Donnees par morceau** | 100-500 Mo (video HD) | 5-10 Mo (audio m4a) | **10-50x moins** |
| **Publicites** | Oui (chargement + lecture) | Aucune | **100%** |
| **RAM utilisee** | 300-500 Mo par onglet | ~50 Mo | **6-10x moins** |
| **CPU** | Decodage video + JS YouTube | Decodage audio seul | **5x moins** |
| **Bande passante** | Video + audio + pubs + tracking + suggestions | Audio seul | **10-20x moins** |
| **Batterie (mobile)** | Forte consommation (ecran + video + reseau) | Faible (audio seul) | **3-5x moins** |
| **Temps de chargement** | 2-5s (page YouTube complete) | <1s (flux audio direct) | **Instantane** |

### Pourquoi c'est plus leger

1. **Audio seul** : Mon Flow ne charge que le flux audio (format m4a), jamais la video
2. **Pas de pub** : zero requete publicitaire, zero tracking Google
3. **Pas d'interface YouTube** : pas de suggestions, commentaires, sidebar, JS lourd
4. **Proxy local** : le serveur fait le relais, le navigateur recoit un flux propre
5. **Pre-chargement** : le morceau suivant est prepare pendant la lecture, pas de temps mort
6. **Cache** : les infos et recherches sont cachees, pas de re-appel a YouTube

### Systeme de cache

Le cache reduit drastiquement les appels a YouTube en gardant les resultats en memoire.

| Cache | TTL | Contenu | Effet |
|-------|-----|---------|-------|
| **info** | 10 min | Metadonnees video (titre, artiste, vues...) | Evite de re-appeler yt-dlp --dump-json pour la meme video |
| **search** | 5 min | Resultats de recherche | Meme recherche = reponse instantanee |
| **stream** | 4h | URLs directes YouTube | Le flux est reutilise sans re-demander a YouTube |

#### Gestion du cache
- **Onglet Profil** > section "Cache" : voir les stats (nombre d'entrees, TTL)
- **Bouton "Vider le cache"** : force le rechargement depuis YouTube
- **API** : `GET /api/system?action=cache_stats` et `GET /api/system?action=cache_clear`
- Nettoyage automatique au-dela de 500 entrees par type
- Le cache est en memoire (RAM), il se vide au redemarrage du serveur

### Comment yt-dlp accede aux donnees YouTube

Aucune API officielle YouTube n'est utilisee. yt-dlp fonctionne en simulant un navigateur :

| Fonctionnalite | Commande yt-dlp | Donnees recuperees |
|--|--|--|
| **Infos video** | `--dump-json URL` | Titre, artiste, vues, likes, thumbnail, duree, date |
| **Recherche** | `ytsearchN:"query"` | Resultats de recherche (titre, URL, thumbnail, duree) |
| **Playlists** | `--flat-playlist --dump-json URL` | Liste des videos d'une playlist |
| **Streaming** | `--get-url -f bestaudio[ext=m4a] URL` | URL directe du flux audio YouTube |
| **Telechargement** | `-x --audio-format mp3 URL` | Telecharge et convertit le fichier |

yt-dlp peut aussi acceder aux commentaires, sous-titres, chapitres, descriptions completes et videos d'une chaine, mais ces fonctionnalites ne sont pas utilisees dans l'application.

**Limitation** : YouTube peut bloquer temporairement les requetes (erreur 429) si trop de requetes sont envoyees en peu de temps. Le cache et les delais entre telechargements limitent ce risque.

## Depannage

| Probleme | Cause | Solution |
|----------|-------|----------|
| Erreur 429 | Trop de requetes YouTube | Attendre 15-30 min |
| "Sign in to confirm" | Challenge JS YouTube | `--remote-components ejs:github` (automatique) |
| ffmpeg non trouve | winget absent | Telechargement auto depuis gyan.dev |
| Interface dit "Erreur" mais fichier OK | Regex matchait WARNING | Corrige : `^ERROR` uniquement |
| Lien telecharger ne marche pas | Espaces/accents dans URL | `encodeURIComponent` (corrige) |
| Video stream ne marche pas | Headers YouTube bloquent | Iframe YouTube embed (corrige) |
| Audio propose de telecharger | Content-Type manquant | Proxy serveur avec `audio/mp4` (corrige) |
| Musique coupe au refresh | Etat non sauvegarde | localStorage + restauration auto (corrige) |
| Element audio demande en video | Fichier local = audio | Detecte et bascule sur streaming YouTube |

## Extensions Chrome

| Version | Dossier | Fonctionnalites |
|---------|---------|-----------------|
| v1 | `extension/` | Telechargement uniquement |
| v2 | `extension_v2/` | Telechargement + Mon Flow + playlists |

Installation : `chrome://extensions/` > Mode developpeur > Charger l'extension non empaquetee

## Logs techniques

Bouton **engrenage** en bas a droite > Panneau de logs > **Copier les logs** pour diagnostic.
