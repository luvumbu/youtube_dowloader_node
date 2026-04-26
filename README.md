# YouTube Downloader Node

Application locale de telechargement et de streaming YouTube.
Tourne sur ton PC, accessible depuis n'importe quel navigateur (PC, telephone, tablette) du meme reseau Wi-Fi.

---

## Sommaire

1. [Doc super debutant](#1-doc-super-debutant) - Tu lances pour la premiere fois
2. [Doc d'utilisation](#2-doc-dutilisation) - Comment se servir de chaque onglet
3. [Doc de fonctionnement](#3-doc-de-fonctionnement) - Comment ca marche en interne
4. [Doc technologie](#4-doc-technologie) - Stack technique et choix d'archi
5. [Changelog](#5-changelog)

---

## 1. Doc super debutant

> Pour ceux qui n'ont jamais touche a Node.js, a Python ou a la console.

### A quoi sert cette app ?
Telecharger des musiques et des videos YouTube **sans publicite**, les organiser dans une bibliotheque, et les ecouter en streaming via un onglet "Mon Flow" qui ressemble a un Spotify perso.

### Premier lancement (Windows)

1. **Telecharge** le dossier complet du projet sur ton PC.
2. Ouvre le dossier dans l'explorateur Windows.
3. Double-clique sur **`start.bat`**.
4. Une fenetre noire s'ouvre. Laisse-la tourner. Au premier lancement elle installe automatiquement :
   - Node.js (si manquant)
   - Python (si manquant)
   - yt-dlp (le moteur qui parle a YouTube)
   - ffmpeg (le moteur qui convertit l'audio/video)
   - Les dependances npm (express, cors)
5. Ton navigateur s'ouvre tout seul sur **http://localhost:3000**.
6. Tu cliques sur **Profil** > **Creer un profil** > tu mets ton prenom > c'est parti.

> Si la fenetre noire affiche une erreur (par ex. "winget non trouve"), installe Python manuellement depuis https://www.python.org/downloads/ (en cochant "Add to PATH") puis relance `start.bat`.

### Telecharger ta premiere musique

1. Va sur YouTube, copie l'URL d'une video.
2. Reviens dans l'app, onglet **Telecharger**.
3. Colle l'URL dans le champ.
4. Choisis **Audio** > **MP3** > **Meilleure qualite**.
5. Clique **Telecharger**.
6. Le fichier apparait dans le dossier `downloads/` (et dans l'onglet **Bibliotheque**).

### Ecouter sans telecharger (Mon Flow)

1. Onglet **Recherche**.
2. Tape un titre, clique **Rechercher**.
3. Sur le resultat qui te plait, clique **+ Flow**.
4. Va dans l'onglet **Mon Flow**.
5. Clique **Ecouter** sur le titre. La musique demarre dans la barre du bas.

> Pas besoin de telecharger : Mon Flow streame directement depuis YouTube en passant par ton PC. Aucune pub, et si tu rajoutes le titre 100x dans Flow ca prend 0 octet sur ton disque.

### Acceder depuis ton telephone

1. Sur le PC, ouvre une console et tape :
   ```
   ipconfig
   ```
   Note l'**Adresse IPv4** (genre `192.168.1.42`).
2. Sur le telephone (meme Wi-Fi que le PC) ouvre le navigateur a l'adresse :
   ```
   http://192.168.1.42:3000
   ```
3. Tu vois la meme app. Tout ce que tu fais sur le tel apparait sur le PC instantanement.

> Si Windows demande l'autorisation pare-feu pour Node.js au 1er lancement, coche **Reseaux prives** et **Autoriser**. Sans ca le tel ne verra pas le PC.

### Eteindre proprement

Ferme l'onglet du navigateur, puis dans la fenetre noire fais **Ctrl + C** > **O** (oui).
Tu peux aussi simplement la fermer.

---

## 2. Doc d'utilisation

L'app est decoupee en 8 onglets en haut + une **player bar** en bas (qui reste visible partout).

### Onglet Telecharger
Champ URL + options + bouton. Le fichier apparait dans `downloads/` et dans la bibliotheque.

- **Audio** : MP3, FLAC, WAV, AAC, OGG (qualites : meilleure / moyenne / basse)
- **Video** : MP4, MKV, WEBM (best / 1080p / 720p / 480p / 360p)
- **Couverture** (thumbnail JPG) optionnelle, integree au fichier audio via ffmpeg
- File d'attente persistante : ajoute plusieurs URLs, ils se traitent dans l'ordre
- Drag & drop d'URLs depuis ton navigateur directement sur l'app
- **Croix** pour effacer un message du panneau de progression, bouton **Tout vider** pour la file

### Onglet Recherche
Recherche YouTube sans quitter l'app. Resultats avec miniatures, duree, vues.

- Jusqu'a 50 resultats par page (pagination)
- Boutons par resultat : **DL** / **+ File** / **+ Flow** / **🎧 Ecouter** (streaming) / **+ Video**
- Filtres : Tous / Nouveaux / Telecharges / Mon Flow + filtre par duree
- **Historique des recherches** (10/20/50/100 affichables, 100 max stockees)
- **Bloc Ecoutes ephemeres** sous l'historique : tout ce que tu as ecoute en streaming sans rien sauver. Re-ecoute / + Flow / DL / Oublier.
- Suggestions sur le cote (variantes "best of", "live", "feat", "remix"...)

### Onglet Bibliotheque
Tous tes fichiers physiquement presents sur le disque.

- Statistiques en haut : total, audio, video, espace disque, duree totale
- Dossiers : creer, supprimer, deplacer des fichiers dedans
- Tri (date, titre, type, taille), filtres (type/format), recherche textuelle
- Selection multiple : tout selectionner / lire / supprimer
- **Sous-section Historique** :
  - Filtres presence (tous / presents / absents) + source (local / imports)
  - Re-telechargement par lot
  - Export/Import JSON avec dedoublonnage par URL
  - Drag & drop vers Mon Flow

### Onglet Mon Flow
Le coeur de l'app. Streaming personnel sans telechargement.

**Ajouter** : depuis recherche, URL, historique, drag & drop, extension Chrome, import JSON.

**Top N en haut** : top 3 / 5 / 10 / 20 plus ecoutes en grandes cartes, avec rangs or/argent/bronze.

**Tri par defaut : "Plus ecoutes"** (modifiable). Tris enrichis :
- Date (annee de sortie recent/ancien)
- Popularite YouTube (vues + / -)
- Local (Aimes d'abord, Duree long/court)

**Vues rapides (chips)** :
- ⭐ Plus ecoutes  ·  🕐 Recemment ajoutes  ·  ❤ Aimes
- ☀ Aujourd'hui  ·  📅 Cette semaine  ·  🗓 Ce mois
- 📷 Decouvertes (ajoutes <30j et ecoutes ≥3x)
- 🔗 A redecouvrir (ecoutes ≥5x mais pas joues depuis >90j)
- 🕑 Coups d'un soir (joues 1 seule fois il y a >90j)
- ❓ Jamais ecoutes

**Lecture** : deux boutons par titre :
- **▶ Ecouter** : lit + desactive l'aleatoire pour la suite
- **🔀 Aleatoire** : lit + active l'aleatoire pour la suite

**Modes synchronises sur la player bar** :
- 🔀 Aleatoire (enchainement aleatoire)
- 🔁 Repeter selection (reboucle au premier titre)
- 🔂 Repeter ce titre (boucle infinie sur le titre)

**Crossfade** 0-8 s configurable. Fondu equal-power entre titres consecutifs via deux elements audio en bascule.

**Notifications desktop** au demarrage d'un titre quand la fenetre est en arriere-plan.

**Playlists** : creer, ajouter des pistes, couleurs personnalisees, **corbeille** pour recuperer des pistes supprimees par erreur.

### Panneau Paroles (bouton 📜 sur la player bar)
3 sources en cascade :
1. **lrclib.net** - paroles synchronisees (LRC) avec scoring intelligent
2. **api.lyrics.ovh** - paroles plain en fallback
3. **Genius.com** - scraping en dernier recours (le plus complet)

Recherche tres tolerante :
- Decensure auto : `f****r` -> `fucker`, `s**t` -> `shit` (14 patterns)
- Split multi-artistes (`feat`, `ft`, `&`, `x`, `,`)
- Differents separateurs (`-`, `–`, `—`, `·`, `|`, `//`)
- Extraction d'emphase : `*X*`, `"X"`, `«X»` -> X traite comme titre probable

**Affichage** :
- Lignes synchro avec ligne courante en rouge gras
- Auto-scroll vers la ligne courante (toggleable)
- Onglets de versions (5 max) : si plusieurs sources trouvent des paroles, tu peux switcher
- ✏️ **Corriger** : formulaire pour saisir manuellement artiste/titre si le match auto est mauvais
- 🎤 **Karaoke** plein ecran avec defilement analogique fluide
- 7 liens externes en derniere chance (Genius, AZLyrics, Musixmatch, etc.)

### Mode Karaoke
Bouton 🎤 dans le panneau Paroles. Plein ecran, defilement fluide via `transform: translateY`.

**Reglages personnalisables** (icone ⚙️ en haut a gauche, sauves dans localStorage) :
- Effet ligne courante : Glow / Pulse / Bounce / Zoom / Slide / Statique
- Couleur degrade : Rose-orange / Bleu / Vert / Violet / Or / Blanc
- Nombre de lignes voisines visibles (1 / 2 / 3 avant/apres)
- Taille de police, police, background (Sombre / Aurora / Noir pur)
- Majuscules on/off

### Onglet Stats
4 sous-onglets :
- **Mes stats** : total ecoutes, top heure, top artiste, plage active. Vues Global / Annee / Mois / Jour.
- **Ephemeres** : titres ecoutes en streaming jamais sauves, avec bouton ▶ Ecouter pour les relancer.
- **Stockage** : explique la strategie de partitionnement (mensuel / annuel / fichier unique).
- **Comparatif** : evalue les strategies de stockage selon plusieurs criteres ponderes.

5 designs de chart : Classique / Vibrant / Ligne / Heatmap / Minimal.

### Onglet Profil
- Liste des profils. Bouton **×** sur chaque carte pour supprimer (cascade : pistes, playlists, corbeille, stats).
- Preferences par defaut (type, format, qualite, couverture).
- **Spectre visuel musical** en arriere-plan (opacite, flou, theme couleur, style de barres, sensibilite).
- **Recherche** : nombre de recherches recentes affichees (10/20/50/100).
- **Lecture** : duree du crossfade (0-8 s).
- **Mon Flow** : notifier au demarrage d'un titre, ouvrir auto le panneau Paroles.
- **Cache** : voir l'occupation memoire serveur, vider les caches.

### Player bar (en bas, toujours visible)
- ⏮ Precedent · ▶/⏸ · ⏭ Suivant
- 🔀 Aleatoire / 🔁 Repeter / 🔂 Repeter ce titre (etat actif tres visible : fond plein + glow + petit point)
- 🔊 Volume + slider
- ⏳ Sleep timer (5 / 15 / 30 / 45 / 60 / 90 min ou custom + fade out 5 s)
- 📜 Paroles · ☰ File de lecture · ✕ Fermer
- ♥ Aimer (orange + dot quand aime)

L'etat de lecture est sauvegarde en localStorage : si tu rafraichis la page, ca reprend au bon timestamp.

### Raccourcis clavier
- **Espace / K** : play/pause
- **←/→** : -10 s / +10 s
- **↑/↓** : volume +5 / -5
- **M** : mute · **N** : suivant · **P** : precedent · **F** : aimer
- **S** : shuffle · **L** : loop · **?** : aide
- **Echap** : quitter le karaoke

### Extension Chrome (dossiers `extension/` et `extension_v2/`)

**Boutons flottants sur YouTube** :
- **DL** (gris) : telechargement rapide
- **+F** (violet) : ajout a Mon Flow
- **Options** : panneau complet

**Panneau Options** sur la page YouTube : info video, choix format/qualite/couverture, section Mon Flow avec selecteur de playlist + creation.

**Popup de l'extension** : 2 sections separees, telechargement (rouge) et Mon Flow (violet).

**Playlists YouTube** : banniere automatique avec **Tout telecharger** + **+ Mon Flow** (cree la playlist auto).

---

## 3. Doc de fonctionnement

> Comment l'app fonctionne en interne. Pour comprendre ce qui se passe quand tu cliques.

### Architecture generale

```
[Navigateur]                        [Serveur Node]                 [YouTube]
                  HTTP localhost                       HTTPS
   public/   <------------------>    server.js     <----------->    youtube.com
   index.html  fetch('/api/...')    + 17 routes    via yt-dlp
   app.js                            api/*.js
   style.css                          |
                                      v
                                    [Disque]
                                    data/*.json
                                    downloads/*.mp3
```

Tout est local. Le navigateur appelle `localhost:3000`, le serveur Node tourne yt-dlp en sous-processus, yt-dlp parle a YouTube. Aucune cle d'API, aucun compte requis.

### Flux : telecharger une video

1. Le frontend (`public/js/app.js`) envoie `POST /api/download` avec `{ url, type, format, quality, cover }`.
2. `api/download.js` valide, genere un `jobId` (`yt_<hex>`), spawn `worker.js` en sous-processus detache.
3. `worker.js` execute `yt-dlp -x --audio-format mp3 ...` et redirige stdout/stderr vers `data/jobs/<jobId>.log`.
4. Le frontend poll `GET /api/progress?id=<jobId>` toutes les 500 ms : la route lit le fichier log, parse les `[download] xx%`, retourne l'avancement.
5. A la fin, le worker ajoute le fichier dans `library.json` et marque le job termine.

> Pourquoi un sous-processus ? yt-dlp peut prendre plusieurs minutes. Si on le mettait dans le main thread Express, les autres requetes seraient bloquees.

### Flux : ecouter en streaming (Mon Flow)

1. Click sur **Ecouter** -> frontend appelle `GET /api/stream?url=...&type=audio`.
2. `api/stream.js` execute `yt-dlp --get-url -f bestaudio[ext=m4a] <url>`, recupere une URL CDN YouTube directe.
3. Le serveur garde cette URL en cache (4 h) et retourne au frontend une URL **du proxy local** : `/api/stream/play?url=<urlEncoded>`.
4. Le frontend met cette URL dans l'element `<audio>`.
5. Quand le navigateur lit l'audio, il appelle `/api/stream/play`. Le serveur Node fait un `fetch` sur l'URL CDN YouTube et **pipe** le flux vers le navigateur, en forcant le Content-Type a `audio/mp4`.

> Pourquoi le proxy ? Si on donnait l'URL CDN directement, deux problemes : (1) le navigateur ne sait pas que c'est de l'audio (Content-Type manquant) et veut la telecharger ; (2) certaines URLs CDN sont liees a l'IP du demandeur, donc inaccessibles depuis le navigateur.

### Flux : crossfade entre 2 titres

Le player utilise **deux elements `<audio>`** (`audioEl` et `audioElB`). A tout moment, l'un est l'**actif** (audible), l'autre **pret en coulisses**.

1. A 8 s de la fin du titre A, on prepare le titre B sur l'element inactif (preload, volume = 0).
2. On lance les deux en meme temps : volume A descend, volume B monte (courbe equal-power).
3. A la fin du fondu, l'inactif devient l'actif. On charge le titre suivant en coulisses.

Tous les controles (play / pause / seek / volume / mute / currentTime) passent par les wrappers `getActiveAudio()` / `getInactiveAudio()` pour rester transparent. Le visualizer Web Audio est connecte aux deux pour ne pas couper pendant le fondu.

### Flux : recherche de paroles

1. Frontend envoie `GET /api/lyrics?title=...&channel=...&durationStr=...`.
2. `api/lyrics.js` genere des **candidats** : decensure, split multi-artistes, differents separateurs, extraction d'emphase.
3. Pour chaque candidat, cascade :
   - **lrclib.net** `/get` strict (artiste + titre + duree exactes), puis `/search` avec scoring Jaccard sur les mots.
   - **api.lyrics.ovh** plain text.
   - **Genius.com** scraping HTML.
4. Le scoring filtre les top 12 resultats : **chevauchement de mots + bonus syncro + bonus duree**.
5. Cache 1 h en RAM (max 500 entrees).

### Donnees persistantes

Tout est stocke en JSON sur le disque, dans `data/`.

| Fichier | Contenu | Limite |
|---|---|---|
| `library.json` | `{ folders: [], items: [] }` - fichiers telecharges | Illimite |
| `history.json` | Historique avec source/thumbnail | 200 max |
| `flow.json` | Tracks Mon Flow + playlists + corbeille | Illimite |
| `stats/*.json` | Evenements d'ecoute partitionnes (mois/annee/single) | Illimite |
| `profiles.json` | Profils utilisateur | - |
| `queue.json` | File d'attente | - |
| `notifications.json` | Notifications | 100 max |

### Cloisonnement par profil

Chaque piste / playlist / event de stats porte un `profileId`. Le frontend (`public/js/helpers.js`) **injecte automatiquement** `profile=<currentUser.id>` dans toutes les requetes vers `api/flow`, `api/library`, `api/stats`, `api/history`. Aucun call site a modifier.

Avantages :
- Kendrick Lamar peut etre dans le profil A et dans le profil B sans collision (anti-doublon par profil).
- Statistiques cloisonnees : la page Stats montre uniquement l'activite du profil connecte.
- Suppression d'un profil = cascade complete (pistes, playlists, corbeille, events stats).

Migration auto au demarrage avec backup `flow.backup.pre-profiles.json`.

### Stockage cote navigateur (localStorage)
- `yt_search_history` (max 100), `yt_search_history_display` (10/20/50/100)
- `yt_flow_top_cover_count` (3/5/10/20)
- `yt_crossfade_seconds` (0-8)
- `yt_flow_notif_on`, `yt_lyrics_auto`, `yt_lyrics_auto_follow`, `yt_lyrics_click_mode`, `yt_lyrics_extra_always`
- `yt_karaoke_settings` (objet complet : effet, couleur, taille, police, bg, etc.)
- `flow_state` ou `player_state` (reprise de lecture au refresh)

### Cache cote serveur

| Cache | TTL | Contenu |
|---|---|---|
| info | 10 min | Metadonnees video |
| search | 5 min | Resultats de recherche |
| stream | 4 h | URLs directes YouTube |
| lyrics | 1 h | Paroles trouvees (max 500 entrees) |

Tout en RAM, vide au redemarrage du serveur. Boutons **Vider le cache** dans Profil.

---

## 4. Doc technologie

### Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Serveur HTTP | **Node.js + Express 4** | Async natif, parfait pour orchestrer des sous-processus longs (yt-dlp). |
| Front | **HTML/CSS/JS vanilla** (pas de framework) | App locale mono-utilisateur : React/Vue ajouterait de la complexite pour zero benefice. Hot-reload via simple F5. |
| Telechargement YouTube | **yt-dlp** (fork de youtube-dl) | Le seul outil qui suit le rythme des changements YouTube. Aucune API officielle utilisee. |
| Conversion audio/video | **ffmpeg** | Standard de fait. Convertit, integre les couvertures, decoupe. |
| Persistance | **JSON sur disque** | Mono-utilisateur, faible volume (< 100 Mo de metadata). SQLite ajouterait de la complexite sans gain. |
| Streaming player | **Web Audio API + 2x `<audio>`** | Le double element permet le crossfade equal-power. L'AudioContext alimente le visualizer + futur EQ. |
| Paroles | **lrclib + lyrics.ovh + Genius scraping** | Cascade de 3 sources gratuites. lrclib pour le synchro LRC, Genius pour la couverture maximale. |

### Detection automatique des dependances

`config.js` au demarrage :
1. Cherche `python` / `python3` / `py` dans le PATH (en excluant le **stub Microsoft Store** WindowsApps).
2. Si absent, tente `winget install Python.Python.3.12`.
3. Cherche `ffmpeg` (PATH ou local `./ffmpeg/bin/`). Si absent, tente `winget install Gyan.FFmpeg`.
4. Tente `python -m yt_dlp --version`. Si KO, tente `pip install yt-dlp`.

Au demarrage du serveur, `checkDependencies()` affiche ce qui manque encore.

### API REST complete

| Methode | Route | Description |
|---|---|---|
| POST | `/api/download` | Lance un worker de telechargement |
| POST | `/api/info` | Metadata video via `yt-dlp --dump-json` |
| GET | `/api/progress?id=` | Progression (lecture du fichier `.log` du worker) |
| GET | `/api/search?q=&max=` | Recherche YouTube via `ytsearchN` (max 50) |
| POST | `/api/playlist` | Videos d'une playlist via `--flat-playlist` |
| GET/POST | `/api/library` | Bibliotheque (list, add_item, create_folder, delete...) |
| GET/POST | `/api/queue` | File d'attente persistante |
| GET/POST | `/api/notifications` | Notifications (100 max) |
| GET/POST | `/api/profile` | Profils (list, save, load, delete avec cascade, increment) |
| GET/POST | `/api/history` | Historique (list, add, clear, max 200) |
| GET/POST | `/api/flow` | Mon Flow (list, add, add_bulk, remove, play, top, create_playlist, trash...) |
| GET | `/api/stream?url=&type=` | Recupere l'URL CDN YouTube et retourne l'URL du proxy local |
| GET | `/api/stream/play?url=&type=` | Proxy streaming : pipe YouTube -> navigateur avec bon Content-Type |
| GET/POST | `/api/system` | Info systeme, mise a jour yt-dlp, taille des caches |
| POST | `/api/convert` | Conversion entre formats via ffmpeg |
| GET/POST | `/api/stats` | Stats (record, ephemeral, top_artists, ranges, strategy) |
| GET | `/api/lyrics?title=&channel=&extra=&durationStr=` | Recherche multi-sources de paroles |
| GET | `/api/description?url=` | Description, chapitres, tracklist, transcription |

### Structure du repo

```
youtube_dowloader_node/
├── server.js            # Serveur Express (port 3000, ecoute 0.0.0.0)
├── config.js            # Detection auto Python/ffmpeg/yt-dlp + constantes
├── worker.js            # Sous-processus de telechargement (spawn detache)
├── package.json         # express + cors uniquement
├── start.bat            # Installation + lancement Windows
├── create-icon.js       # Genere icon.ico (logo violet YouTube + play)
├── create-shortcut.ps1  # Cree le raccourci sur tous les bureaux detectes
├── api/                 # 17 routes Express
│   ├── download.js  info.js  search.js  playlist.js  progress.js
│   ├── library.js   queue.js  notifications.js  profile.js  history.js
│   ├── convert.js   stream.js  flow.js  stats.js  system.js
│   └── lyrics.js    description.js
├── public/
│   ├── index.html       # Page principale (8 onglets + player bar)
│   ├── js/app.js        # Frontend complet (~8600 lignes)
│   ├── js/helpers.js    # apiCall, apiPost, Format, Dom, Modal, escapeHtml + injection profile auto
│   └── css/style.css    # Theme dark/light
├── extension/           # Extension Chrome v1 (telechargement)
├── extension_v2/        # Extension Chrome v2 (telechargement + Mon Flow)
├── data/                # Donnees persistantes (cree au 1er lancement)
└── downloads/           # Fichiers telecharges (cree au 1er lancement)
```

### Mon Flow vs YouTube web - perfs

| | YouTube (navigateur) | Mon Flow (audio seul) | Economie |
|---|---|---|---|
| Donnees par morceau | 100-500 Mo | 5-10 Mo | 10-50x moins |
| Publicites | Oui | Aucune | 100% |
| RAM | 300-500 Mo | ~50 Mo | 6-10x moins |
| CPU | Decodage video + JS | Audio seul | 5x moins |
| Bande passante | Video + audio + pubs | Audio seul | 10-20x moins |
| Batterie mobile | Forte | Faible | 3-5x moins |

### Comment yt-dlp accede aux donnees YouTube

Aucune API officielle. yt-dlp simule un navigateur :

| Fonctionnalite | Commande | Donnees |
|---|---|---|
| Infos video | `--dump-json URL` | Titre, artiste, vues, likes, thumbnail, duree |
| Recherche | `ytsearchN:"query"` | Resultats (titre, URL, thumbnail, duree) |
| Playlists | `--flat-playlist --dump-json URL` | Liste des videos |
| Streaming | `--get-url -f bestaudio[ext=m4a] URL` | URL directe du flux audio |
| Telechargement | `-x --audio-format mp3 URL` | Telecharge et convertit |

**Anti-bot** : flag `--remote-components ejs:github` ajoute automatiquement pour contourner les challenges JS YouTube ("Sign in to confirm you're not a bot").

**Limitation** : YouTube peut renvoyer **HTTP 429** si trop de requetes. Le cache et l'absence d'API officielle limitent ce risque mais ne l'eliminent pas. En cas de 429, attendre 15-30 min.

### Securite et limitations

- **Aucune authentification** : l'app n'a pas de mot de passe. N'expose **jamais** le port 3000 directement sur internet.
- **Validation d'entree** : `config.isValidYoutubeUrl` regex stricte sur les URLs, `config.isValidJobId` pour les IDs de job, `config.sanitizeDownloadParams` whiteliste les formats/qualites.
- **Gestion d'erreur** : `process.on('uncaughtException')` et `unhandledRejection` capturent tout pour eviter le crash du serveur.
- **CORS** : actif sur toutes les routes (necessaire pour l'extension Chrome).

### Acces depuis l'exterieur

#### Sur le meme Wi-Fi (maison)
Aucune config. `http://<IP-locale-PC>:3000` depuis n'importe quel appareil. Autoriser Node dans le pare-feu Windows au 1er lancement.

#### Hors de chez toi
**Surtout pas** d'ouverture de port. Recommandation : **Tailscale** (gratuit, 5 min, contourne le CGNAT des box 4G). Le PC et le telephone se connectent au meme compte Tailscale, l'app est accessible via une IP `100.x.x.x` partout dans le monde.

### Transferer sur un autre PC

1. Copier le dossier (sans `node_modules/`, `downloads/`, `data/`)
2. Lancer `start.bat`
3. Recuperer sa collection :
   - **Historique** : Exporter > Importer > Re-telecharger (fichiers physiques)
   - **Mon Flow** : Exporter > Importer > Ecouter en streaming

### Depannage

| Probleme | Cause | Solution |
|---|---|---|
| Erreur 429 | Trop de requetes YouTube | Attendre 15-30 min |
| "Sign in to confirm" | Challenge JS YouTube | `--remote-components ejs:github` (auto) |
| "Action inconnue" sur une route | Serveur Node pas redemarre apres modif | Ctrl+C dans la console, relancer `start.bat` |
| ffmpeg non trouve | winget absent ou bloque | Telecharger manuellement depuis gyan.dev, mettre dans `./ffmpeg/bin/` |
| Audio propose de telecharger | Content-Type manquant | Proxy serveur force `audio/mp4` (deja gere) |
| Musique coupee au refresh | Etat non sauvegarde | localStorage + restauration auto (deja gere) |
| Paroles introuvables | Match flou rate | Bouton ✏️ pour saisie manuelle, 7 liens externes |
| Karaoke saute d'une ligne | Rendu non analogique | Defilement fluide via translateY (deja gere) |
| Telephone ne voit pas le PC | Pare-feu Windows | Autoriser Node sur reseaux prives |

### Logs techniques
Bouton **engrenage** en bas a droite > Panneau de logs > **Copier les logs** pour diagnostic.

---

## 5. Changelog

### v5 (en cours)

**Onglet Description du player**
- Tracklist refonte CSS : titres sur plusieurs lignes (plus de troncature), numero en pastille ronde, badge timecode sous le titre, bord gauche violet au survol.
- Bouton **Copier** sur chaque onglet :
  - Chapitres : `#1  0:00  Intro` (un par ligne)
  - Tracklist : `1. 0:00 - Artiste - Titre`
  - Transcription : 2 boutons - **+TC** (avec timecodes `[0:00] phrase`) / **Texte** (sans)
  - Texte : description complete
  - Infos : metadonnees formatees `Titre : ... / Chaine : ... / Vues : ...`
- Onglets resserres : padding reduit, scrollbar masquee (5 onglets dans 420 px sans deborder).

**Deduplication des transcriptions auto YouTube**
Refonte de `parseVTT` (`api/description.js`) :
1. Filtre carry-over : ne garde que les lignes avec timestamps inline
2. `collapseInternalRepeats` : "X Y X Y" -> "X Y"
3. Fusion des voisins (passes multiples jusqu'a stabilite)
4. Dedup global final (normalise casse + ponctuation)

Dedup aussi sur `dedupChapters`, `extractTracklist`, `dedupTextLines`.

**Mon Flow : tris enrichis**
Menu trie par groupes : Date / Popularite YouTube / Local. Parsing intelligent de "91.0 M vues", "2.1 Md vues", "1,234,567 views".

**Mon Flow : cloisonnement par profil**
- Chaque piste / playlist / corbeille porte un `profileId`
- Migration auto au demarrage avec backup `flow.backup.pre-profiles.json`
- Anti-doublon par profil
- Injection auto cote client (helpers.js) sur api/flow, api/library, api/stats, api/history
- Reload auto de Mon Flow au switch de profil

**Suppression de profil avec cascade**
- Bouton **×** sur chaque carte profil
- Confirmation explicite
- Cascade serveur : pistes, playlists, corbeille, events stats
- Si on supprime son propre profil : deconnexion auto + reload

**Statistiques d'ecoute par profil**
- Chaque event `recordEvent` (download / play / add / stream) stocke `profileId`
- Migration auto avec flag `.migrated-profiles`
- `aggregateForView` et `detailsForBucket` filtrent par profil
- Top artistes par profil

**Icone et raccourci bureau**
- Logo violet (#9C27B0) : rectangle arrondi YouTube + triangle play blanc (suppression de l'ancienne tete de mort)
- `create-icon.js` : helper `fillPlayTriangle(cx, cy, halfHeight, length, ...)`
- `start.bat` : regenere `icon.ico` automatiquement si `create-icon.js` plus recent
- `create-shortcut.ps1` : detecte tous les bureaux (`Desktop`, `OneDrive\Desktop`, `OneDrive\Bureau`)

### v4
Systeme de stats, corbeille Mon Flow, couleurs playlists, UX Recherche.

### v3
Mon Flow (streaming), extension v2, cache, historique avance.
