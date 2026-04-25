# YouTube Downloader Node v3 - Guide Utilisateur

> Application web locale qui te permet de telecharger, streamer, organiser et analyser ta consommation YouTube. Tout reste sur ta machine, aucun service tiers.

---

## Table des matieres

1. [Conditions d'utilisation](#1-conditions-dutilisation)
2. [Comment l'application fonctionne](#2-comment-lapplication-fonctionne)
3. [Installation et lancement](#3-installation-et-lancement)
4. [Onglet Telecharger](#4-onglet-telecharger)
5. [Onglet Recherche](#5-onglet-recherche)
6. [Onglet Bibliotheque](#6-onglet-bibliotheque)
7. [Onglet Mon Flow](#7-onglet-mon-flow)
8. [Onglet Stats](#8-onglet-stats)
9. [Onglet Profil](#9-onglet-profil)
10. [Lecteur audio/video](#10-lecteur-audiovideo)
11. [Extension Chrome](#11-extension-chrome)
12. [Stockage local des donnees](#12-stockage-local-des-donnees)
13. [Raccourcis et astuces](#13-raccourcis-et-astuces)

---

## 1. Conditions d'utilisation

Lis ce qui suit avant d'utiliser l'application.

### Cadre legal

- L'application est un **outil personnel et local**. Elle n'envoie aucune donnee a un serveur tiers.
- Le telechargement et le streaming utilisent **yt-dlp**, un outil open-source qui acceder aux flux YouTube **sans cle API officielle**.
- **Le telechargement de contenu protege par des droits d'auteur sans autorisation peut etre illegal selon ton pays.** L'application ne te donne aucun droit que tu n'as pas deja.
- Tu es **seul responsable** des contenus que tu telecharges. Limite-toi a :
  - Tes propres creations
  - Du contenu sous licence libre (Creative Commons, domaine public)
  - Du contenu pour lequel tu as obtenu une autorisation
  - L'usage prive (selon les exceptions de ton droit national, par ex. copie privee en France)
- L'auteur de l'application **ne stocke ni n'analyse aucune de tes donnees**. Tout est ecrit sur ton disque dur uniquement.

### Donnees collectees (toutes sur ton disque)

L'application enregistre, **localement uniquement**, dans le dossier `data/` :
- L'historique de tes telechargements (titres, dates, formats)
- Ta bibliotheque (fichiers, dossiers)
- Ta playlist Mon Flow et le nombre d'ecoutes
- Tes profils et preferences
- Tes statistiques d'usage agregees (heures d'ecoute, top artistes, etc.)

Tu peux a tout moment supprimer ces fichiers ou utiliser les boutons "Vider le cache" / "Vider la corbeille" / "Tout oublier" dans l'app.

### Aucune garantie

L'application est fournie "telle quelle", sans garantie de fonctionnement permanent. YouTube peut changer son fonctionnement et casser le telechargement a tout moment. Tu utilises l'app a tes propres risques.

---

## 2. Comment l'application fonctionne

### Vue d'ensemble technique

```
   Toi (navigateur localhost:3000)
              |
              v
   +---------------------+
   |   Express.js        |   <-- Serveur Node sur ton PC
   |   server.js         |
   +---------+-----------+
             |
             v
        +----+-----+
        |  yt-dlp  |   <-- Telecharge / streame depuis YouTube
        +----+-----+
             |
             v
        downloads/      <-- Tes fichiers
        data/           <-- Tes metadonnees JSON
```

### Principe

1. Tu lances `start.bat` qui demarre un **serveur Node local** sur le port 3000.
2. Tu ouvres `http://localhost:3000` dans ton navigateur.
3. Le frontend (HTML/CSS/JS dans `public/`) parle aux **API REST** internes (`/api/...`).
4. Pour chaque telechargement, un **worker Node** independant est lance qui appelle `yt-dlp` (un script Python).
5. Les fichiers sont sauvegardes dans `downloads/`, les metadonnees dans `data/*.json`.

### Architecture en 5 onglets + 1 sous-systeme

| Onglet | Role |
|--------|------|
| **Telecharger** | Coller une URL YouTube et la sauver en MP3/MP4/etc. |
| **Recherche** | Chercher sur YouTube, ecouter en streaming, ajouter en masse |
| **Bibliotheque** | Gerer tes fichiers locaux (lire, convertir, organiser en dossiers) |
| **Mon Flow** | Ton "Spotify personnel" : streaming sans telecharger, playlists colorees, corbeille |
| **Stats** | Analyser ton ecoute (heures, artistes, etc.) avec 4 sous-vues |
| **Profil** | Choisir un utilisateur, configurer tes preferences par defaut |

### Sous-systeme stats (nouveau)

L'application enregistre chaque evenement (telechargement, lecture Flow, ajout, ecoute streaming) dans des fichiers `data/stats/YYYY-MM.json` (un par mois). Tu peux changer cette strategie de stockage (mensuel / annuel / fichier unique) depuis l'onglet Stats > Stockage.

---

## 3. Installation et lancement

### Prerequis

- **Windows 10 ou 11**
- **Node.js 18+** (installation manuelle requise depuis https://nodejs.org)
- Connexion Internet (uniquement au premier lancement pour installer Python, ffmpeg, yt-dlp)

### Lancement rapide

Double-clique sur **`start.bat`**. Le script :

1. Verifie que Node.js est installe (sinon erreur)
2. Detecte ou installe automatiquement Python, ffmpeg et yt-dlp via `winget` ou pip
3. Lance le serveur Node sur **http://localhost:3000**
4. Ouvre ton navigateur par defaut sur la page

> Au premier lancement la console Node affiche `[stats] migration : N evenements importes` si tu as deja un historique : tes anciennes donnees sont automatiquement converties au nouveau format.

### Barre superieure

| Element | Position | Fonction |
|---------|----------|----------|
| Soleil/lune | Haut gauche | Theme clair / sombre |
| Cloche | Haut droite | Active/desactive les notifications navigateur |
| Pseudo | Sous les onglets | Profil connecte |

---

## 4. Onglet Telecharger

C'est l'ecran principal. Il convertit une URL YouTube en fichier sur ton disque.

### Etape 1 : Coller l'URL

URLs acceptees :
- `https://www.youtube.com/watch?v=...`
- `https://youtu.be/...`
- `https://www.youtube.com/shorts/...`
- Playlists `https://www.youtube.com/playlist?list=...`

### Etape 2 : Choisir les options

Clique sur la barre d'options pour la deployer :

```
+------------------------------------------------------+
|  ( ) Audio    ( ) Video                              |
|  Format: [MP3 v]    Qualite: [Meilleure qualite v]   |
|  Dossier: [Aucun dossier v]                          |
|  [ ] Telecharger aussi la couverture                 |
+------------------------------------------------------+
```

- **Audio** : MP3, FLAC, WAV, AAC, OGG (Meilleure / Moyenne / Basse)
- **Video** : MP4, MKV, WEBM (Meilleure / 1080p / 720p / 480p / 360p)

### Etape 3 : Lancer

Le bouton **"Telecharger"** :
1. Recupere les infos (titre, miniature, chaine, vues)
2. Affiche une carte avec l'aperçu
3. Lance le worker en arriere-plan
4. Affiche une barre de progression en temps reel
5. Ajoute le fichier a ta bibliotheque + a l'historique

### File d'attente

Le bouton **"+ Ajouter a la file d'attente"** empile les telechargements pour les lancer un par un.

---

## 5. Onglet Recherche

### Recherche

1. Tape un terme dans la barre, presse Entree ou clique "Rechercher"
2. Jusqu'a 50 resultats sont affiches sous forme de cartes

### Barre de filtres (NOUVEAU)

Au-dessus des resultats, une barre te permet de filtrer en un clic :

```
Filtrer :  [ Tous (50) ]  [ Nouveaux (32) ]  [ Telecharges (12) ]  [ Mon Flow (6) ]
```

- **Tous** : tout afficher
- **Nouveaux** (bleu) : titres jamais telecharges ET jamais dans Mon Flow
- **Telecharges** (vert) : deja dans ta bibliotheque
- **Mon Flow** (violet) : deja dans Mon Flow

Chaque chip affiche un compteur en temps reel.

### Status chips sur chaque carte (NOUVEAU)

Chaque resultat affiche en haut une pastille de statut :
- **TELECHARGE** (vert) : deja dans ta bibliotheque
- **MON FLOW** (violet) : deja dans Mon Flow
- **NOUVEAU** (bleu) : jamais vu

Les boutons d'action changent aussi de couleur :
- **DL** -> vert avec une coche si deja telecharge
- **+ Flow** -> vert avec une coche si deja dans Mon Flow

### Boutons d'action

| Bouton | Action |
|--------|--------|
| **DL** | Telecharge directement |
| **+ File** | Ajoute a la file d'attente locale |
| **+ Flow** | Ajoute a Mon Flow (sans telecharger) |
| **Ecouter** | Streaming audio uniquement (lecteur en bas) |
| **Video** | Apercu video YouTube en overlay |

### Bouton "+ Tout dans Mon Flow" (AMELIORE)

En haut des resultats. Au clic, une **modale centree** apparait :

```
+--- Ajouter 50 titres a Mon Flow ---+
| ( ) Aucune playlist (racine)        |
| ( ) Playlist existante              |
|     [ Mes Faves            v ]      |
| (o) Nouvelle playlist               |
|     [ Stromae                  ]    |
|     <-- pre-rempli avec ta recherche|
+-------------------------------------+
```

- Si une playlist du meme nom existe deja, l'app **les ajoute dedans** au lieu d'erreur
- Les titres deja dans Mon Flow sont **deplaces** vers la nouvelle playlist (pas de doublon)
- Le toast final detaille : `15 ajoutes + 4 deplaces + 1 deja la dans playlist "Stromae"`

---

## 6. Onglet Bibliotheque

### Statistiques

5 cartes en haut : Total / Audio / Video / Espace disque / Duree totale.

### Recherche, tri, filtres

- **Recherche** par titre ou chaine
- **Tri** : date / titre / type / taille
- **Filtres chips** dynamiques par type et format
- **Dossiers** : creer, deplacer, filtrer
- **Filtre Aimes** (rose) : voir uniquement les fichiers cœur

### Actions par fichier

| Action | Description |
|--------|-------------|
| Telecharger | Recuperer le fichier sur ton PC |
| Lecture | Lance dans le lecteur |
| Convertir | Video -> audio (MP3/FLAC/etc.) sans re-telecharger |
| Aimer (cœur) | Marquer / demarquer |
| Deplacer | Vers un autre dossier |
| Supprimer | Avec confirmation |

### Selection multiple

Cliquer sur une carte la coche. Boutons globaux : tout selectionner, lire la selection, supprimer la selection.

### Historique des telechargements

Bouton **"Historique"** en haut de la bibliotheque :
- 200 dernieres entrees conservees
- Filtres : Recherche / Tri / Presence (Tous / Presents / Absents) / Source
- **Re-telechargement par lot** : coche, choisis un format, clique "Re-telecharger" (delai 3s entre chaque pour eviter le rate limit)
- **Export / Import** JSON

---

## 7. Onglet Mon Flow

Ton lecteur de streaming personnel. Lit la musique directement depuis YouTube **sans telecharger**.

### Compteur de duree (NOUVEAU)

Au-dessus de la liste, une **carte bien visible** affiche :

```
| 15 titres   [ ⏱ ~58min 23s ]   2 sans duree |
```

- Le total se met a jour automatiquement selon ce qui est filtre
- Format adaptatif : `Xh YYmin` / `Xmin YYs` / `XXs`
- Mention `(N sans duree)` si certains titres n'ont pas d'info

### Ajouter des titres (8 methodes)

| Methode | Description |
|---------|-------------|
| **+ Depuis l'historique** | Importe tous tes telechargements |
| **Rechercher sur YouTube** | Recherche integree dans Mon Flow |
| **+ Ajouter par URL** | Coller une URL |
| **Drag & drop** | Depuis l'historique ou la recherche |
| **+ Flow** | Bouton dans Recherche |
| **Extension Chrome** | Bouton +F sur YouTube |
| **Importer** | Fichier JSON |
| **Stats > Ephemeres** | Convertir des ecoutes streaming en ajout permanent |

### Vues rapides

3 chips en haut :
- ⭐ **Plus ecoutes** : top 20 (par playCount)
- 🕐 **Recemment ajoutes** : 20 derniers
- ❤ **Aimes (n)** : titres marques cœur

### Playlists

- **+ Nouvelle playlist** : creer
- Chaque playlist apparait comme un chip avec compteur
- Clic = filtrer
- ▶ sur le chip = tout lire

### Couleurs personnalisees pour playlists (NOUVEAU)

Chaque chip de playlist a une icone **🎨** au survol. Clic ouvre un popover :

- **Fond** : 12 pastilles preset + color picker custom
- **Texte** : 8 pastilles preset + color picker custom
- **Apercu en temps reel**
- **Reinitialiser** / Enregistrer / Annuler

Les couleurs sont sauvegardees dans `data/flow.json` au niveau de chaque playlist.

### Corbeille (NOUVEAU)

Quand tu cliques **×** sur un titre :

1. **Modale centree custom** te demande confirmation (avec le titre en gros)
2. Au confirme, le titre est place dans la **corbeille** (pas supprime)
3. Conservation : exactement **24 heures** depuis le retrait
4. Bouton **"🗑 Corbeille"** en haut de Mon Flow ouvre la corbeille avec :
   - Liste des titres retires + temps restant en compte a rebours (`23h 59min 59s`)
   - **Bordure rouge** si moins d'1h restante
   - **Restaurer** (vert) : remet le titre **a sa position d'origine** dans Mon Flow, avec sa playlist, ses compteurs et son cœur
   - **🗑** : supprimer definitivement maintenant
   - **Vider la corbeille** : tout supprimer

A chaque demarrage du serveur, la corbeille est purgee automatiquement (titres > 24h supprimes).

### Lecteur Mon Flow

Quand tu lis un titre, un mini lecteur apparait en haut avec :
- Miniature, titre
- Precedent / Suivant / Aleatoire / Stop
- Lecteur audio HTML5

### Tri et filtres

- **Recherche** dans Mon Flow
- **Format de telechargement par defaut** (audio/video selectionne)
- **Tri** : Ajout, Titre, Artiste, Plus/moins ecoutes, Recemment ecoute, Type

---

## 8. Onglet Stats

Cet onglet est divise en **4 sous-onglets** :

```
[ Mes stats ]  [ Ephemeres ]  [ Stockage ]  [ Comparatif ]
```

### Sous-onglet "Mes stats"

#### Selecteur de vue (4 niveaux)

```
[ Global ]  [ Annee ]  [ Mois ]  [ Jour ]
```

- **Global** : 24h sur tous tes evenements (heure la plus active)
- **Annee** : 1 barre par annee
- **Mois** : 12 barres pour l'annee selectionnee
- **Jour** : 28-31 barres pour le mois selectionne

Navigation par fleche `< >` pour changer de mois/annee + bouton "Aujourd'hui" pour revenir au present.

#### 4 cartes stats qui s'adaptent

- **Total evenements** + scope ("en Avril 2026")
- **Plus actif** (heure / annee / mois / jour selon la vue)
- **Artiste #1** pour la periode
- **Plage / periode active**

#### 5 designs au choix

```
[ Classique ]  [ Vibrant ]  [ Ligne ]  [ Heatmap ]  [ Minimal ]
```

- **Classique** : barres bleues
- **Vibrant** : gradients colores, glow
- **Ligne** : courbe + zone
- **Heatmap** : grille de cellules colorees (intensite = activite)
- **Minimal** : monochrome noir/blanc

Le choix est sauvegarde entre les sessions.

#### Click sur une barre = drill-down

- Ouvre un panneau de details listant les evenements
- Bouton **"Zoomer"** pour passer a la vue inferieure (Annee -> Mois -> Jour)

#### Top 5 artistes

Barre horizontale en bas, recalculee selon la periode.

### Sous-onglet "Ephemeres"

Liste tous les titres que tu as **ecoutes en streaming depuis la Recherche** mais **jamais telecharges ni ajoutes a Mon Flow**.

C'est une **boite de tri** : ces titres sont en attente de decision.

#### 3 cartes en haut

- Titres uniques
- Total ecoutes
- Plus ecoute (titre + nombre)

#### Boutons globaux

- **+ Tout dans Mon Flow** : ajoute tous les ephemeres + ouvre la modale playlist
- **🗑 Tout oublier** : supprime de l'historique stats

#### Par titre

- Miniature YouTube
- Titre / artiste / nombre d'ecoutes / date de derniere ecoute
- **+ Flow** / **DL** / **YT** (ouvre YouTube) / **×** (oublier)

### Sous-onglet "Stockage"

Configure comment les donnees stats sont organisees sur disque.

#### 3 strategies

| Strategie | Layout | Quand |
|-----------|--------|-------|
| **Mensuel** (recommande) | `data/stats/2026-04.json` | Long terme, vues Jour/Mois rapides |
| **Annuel** | `data/stats/2026.json` | Compromis, peu de fichiers |
| **Fichier unique** | `data/stats/all.json` | Petits volumes, simplicite |

#### Panneau d'explication detaille

Pour la strategie selectionnee, affiche :
- Description en clair
- Liste des fichiers crees
- Avantages / Inconvenients
- Tableau de performance par cas d'usage

Cliquer sur une autre strategie l'apercoit. Un bouton "Appliquer" apparait pour confirmer la migration (les fichiers existants sont reecrits dans le nouveau format, sans perte de donnees).

#### Info stockage

Affiche le nombre de fichiers, evenements totaux, taille disque, et liste de chaque fichier.

#### Bouton "Re-importer"

Efface le stockage stats et reimporte depuis `history.json` + `flow.json`. Utile si tu as importe un historique manuellement.

### Sous-onglet "Comparatif"

Outil interactif pour choisir la strategie de stockage selon tes priorites.

#### Criteres a cocher (8 cases)

```
☑ Vitesse vue Jour     ☑ Vitesse vue Mois     ☑ Vitesse vue Annee
☑ Vitesse vue Global   ☑ Vitesse d'ecriture   ☑ Espace disque
☑ Robustesse           ☑ Scalabilite long terme
```

#### Resultat dynamique

- **Carte gagnante** 🏆 avec le nom de la strategie + classement (🥇🥈🥉) avec scores /100
- **Tableau par critere** : 3 colonnes (Mensuel / Annuel / Fichier unique), barres colorees vert/orange/rouge
- **Cartes Avantages/Inconvenients** par strategie (la gagnante a une bordure verte)
- **Score global pondere** en barres horizontales

Coche / decoche les criteres -> tout se recalcule en temps reel.

---

## 9. Onglet Profil

### Connexion

Au premier lancement, choisi un profil existant ou cree-en un nouveau (champ "Pseudo").

### Preferences par defaut

- Type prefere : Audio ou Video
- Format audio par defaut : MP3 / FLAC / WAV / AAC / OGG
- Qualite audio par defaut : Meilleure / Moyenne / Basse
- Format video par defaut : MP4 / MKV / WEBM
- Qualite video par defaut : Meilleure / 1080p / 720p / 480p / 360p
- Couverture toujours telechargee (oui/non)

Ces preferences sont appliquees automatiquement dans Telecharger.

### Cache

Section affichant les statistiques du cache yt-dlp.
- **Vider le cache** : supprime les donnees mises en cache
- **Rafraichir** : met a jour les stats

### Deconnexion

Bouton en bas pour se deconnecter du profil.

---

## 10. Lecteur audio/video

Un **lecteur persistant** est fixe en bas de l'ecran quand un fichier est en lecture.

```
+------------------------------------------------------------------+
| [====barre de progression==============================]          |
| [img] Titre                  0:45 / 3:22   |<< >/|| >>|   Vol [==] |
|       Artiste                              Shuf Loop      [Queue] X |
+------------------------------------------------------------------+
```

### Controles

| Bouton | Fonction |
|--------|----------|
| Lecture/Pause | Bascule |
| Precedent / Suivant | Morceau dans la file |
| Aleatoire (Shuf) | Lecture aleatoire |
| Boucle / Boucle 1 | File ou morceau en boucle |
| Volume | Curseur 0-100% |
| Queue | Affiche la file de lecture |
| × | Arrete et ferme |

### Contexte de lecture intelligent

Les boutons Suivant / Precedent **respectent ta source** :

| Contexte | Comportement |
|----------|--------------|
| Bibliotheque | Navigue dans tes fichiers locaux selectionnes |
| Mon Flow | Navigue dans les titres visibles de Mon Flow |
| Historique | Navigue dans les elements visibles de l'historique |

L'etat est sauvegarde automatiquement au refresh de la page.

---

## 11. Extension Chrome

L'extension `extension_v2/` permet d'agir depuis YouTube.

### Installation

1. `chrome://extensions/` -> Mode developpeur (haut droit)
2. **"Charger l'extension non empaquetee"**
3. Selectionner le dossier `extension_v2/`

### Popup

Clic sur l'icone -> 2 sections :
- **Telecharger** (rouge) : selecteur audio/video, format, qualite, bouton Telecharger
- **Mon Flow** (violet) : selecteur playlist, bouton creer playlist, bouton Ajouter

### Boutons flottants sur YouTube

3 boutons en bas a droite :
| Bouton | Action |
|--------|--------|
| DL (gris) | Telecharger la video en cours |
| +F (violet) | Ajouter rapidement a Mon Flow |
| Menu | Panneau d'options complet |

### Bouton "DL" inline

A cote du bouton "J'aime" sous chaque video.

### Support des playlists

Sur une page playlist YouTube, banniere speciale :
- **"Download all"**
- **"+ Mon Flow"**

---

## 12. Stockage local des donnees

Toutes les donnees sont dans le dossier `data/` de l'app, en JSON :

| Fichier | Contenu |
|---------|---------|
| `library.json` | Bibliotheque (dossiers + fichiers) |
| `history.json` | 200 derniers telechargements |
| `flow.json` | Mon Flow : tracks, playlists, corbeille |
| `profiles.json` | Profils + preferences |
| `queue.json` | File d'attente |
| `notifications.json` | Notifications |
| `stats/_settings.json` | Strategie de stockage stats |
| `stats/2026-04.json` | Stats du mois (un fichier par mois en mode "Mensuel") |
| `stats/.migrated` | Marqueur indiquant que la migration initiale a ete faite |

Les fichiers stats peuvent etre dans un format different selon ta strategie (un fichier par annee, ou un seul fichier `all.json`).

---

## 13. Raccourcis et astuces

### Themes

Cliquer sur l'icone soleil/lune (haut gauche) bascule entre theme sombre et clair. Le choix est sauvegarde.

### Notifications

Cliquer sur la cloche (haut droite) active les notifications navigateur. Elles s'affichent a chaque fin de telechargement.

### Drag & drop

- Glisser un titre depuis la Recherche ou l'Historique vers Mon Flow
- Glisser des fichiers entre dossiers dans la bibliotheque
- Glisser un titre sur un chip de playlist Mon Flow pour l'ajouter directement

### Overlay video

Dans Recherche, Historique ou Mon Flow, cliquer **Video** ouvre un lecteur YouTube en overlay sans quitter l'app.

### Logs techniques

Bouton engrenage en bas a droite : panneau de logs pour le debug. Boutons **Rafraichir** / **Copier** / **Fermer**.

### Conversion rapide

Dans la bibliotheque, chaque video a un bouton **Convertir** qui extrait l'audio (MP3/FLAC/etc.) sans re-telecharger.

### Modales custom

L'app utilise des **modales centrees personnalisees** au lieu des `confirm()` natifs. Tu peux :
- Echap : fermer
- Entree : confirmer
- Clic en dehors : fermer

### Favicon animee

L'onglet du navigateur affiche une favicon qui transite en douceur entre 5 couleurs (cycle de ~5s, 100 frames pre-calculees).

---

## Schema de navigation

```
                       +------------------------+
                       |    localhost:3000      |
                       +------------------------+
                                  |
   +----------+-----------+--------+--------+----------+
   |          |           |        |        |          |
Telecharger Recherche Bibliotheque Mon Flow Stats   Profil
   |          |           |        |        |          |
URL input  Search      Stats grid Playlists +sous   Login/Prefs
Options    Filters     Folders   Couleurs  onglets Cache
Progress   Status      Files     Corbeille          yt-dlp info
Queue      DL/Queue    History   Player    Mes stats
           +Flow       Player    Search    Ephemeres
           Video       Convert   Import/   Stockage
                                 Export    Comparatif
```

---

> **Capture d'ecran** : pour generer les screenshots du guide, lance l'app, navigue dans chaque section et utilise `Win + Shift + S`. Enregistre les images dans `docs/screenshots/`.

---

## Support et contributions

L'application est open-source. Pour signaler un probleme ou proposer une amelioration, ouvre une issue sur le depot Git.

**Versions** : ce guide correspond a la v3 avec systeme de stats integre, corbeille Mon Flow, couleurs de playlists, et modales custom.
