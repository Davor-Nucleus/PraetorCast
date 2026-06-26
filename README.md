# PraetorCast

PraetorCast est un outil complet pour les streamers, permettant de faciliter la gestion du stream avec une intégration dans OBS grâce aux sources "navigateur web". Le système est entièrement développé en Rust pour des performances optimales.

## Vue d'ensemble

PraetorCast est composé de cinq applications principales qui fonctionnent ensemble :

1. **praetorcast-core** : Serveur web principal (Rust/Actix-web) - Interface web et gestion des overlays
2. **JanusCore** : Serveur de musique (Rust/Warp) - Lecture de musique avec support multi-format
3. **PhonosCore** : Serveur de soundboard (Rust/Warp) - Gestion des effets sonores avec normalisation EBU R128
4. **ws_chat_youtube** : Relais WebSocket pour le chat YouTube (Node.js)
5. **ws_discord_presence** : Relais WebSocket pour la présence Discord (Node.js)

## Architecture

```
PraetorCast/
├── praetorcast-core/          # Serveur web principal (Rust)
│   ├── src/                    # Code source Rust
│   │   ├── main.rs            # Point d'entrée principal
│   │   ├── clock.rs           # Module horloge
│   │   ├── music_config.rs    # Configuration musique
│   │   ├── music_current.rs   # Affichage musique actuelle
│   │   ├── banner_config.rs   # Configuration bannières
│   │   ├── banner.rs          # Affichage bannières
│   │   ├── scheduler.rs       # Planning hebdomadaire
│   │   ├── followers_info.rs  # Informations followers
│   │   ├── chat_horizontal.rs # Chat horizontal
│   │   ├── chat_vertical.rs   # Chat vertical
│   │   ├── chat_youtube.rs    # Chat YouTube
│   │   └── discord_presence.rs# Présence Discord
│   ├── templates/             # Templates Askama (HTML)
│   ├── public/                # Fichiers statiques
│   │   ├── music/            # Dossiers de musique
│   │   ├── soundboard/       # Sons de la soundboard
│   │   ├── banner/           # Images de bannières
│   │   ├── scheduler/        # Images du planning
│   │   └── font/             # Polices personnalisées
│   ├── data/                  # Données de configuration
│   │   ├── banner.json       # Configuration bannières
│   │   └── scheduler.json    # Configuration planning
│   ├── env.json              # Configuration principale
│   └── Cargo.toml            # Dépendances Rust
│
├── janus core/                # Workspace Rust pour l'audio
│   ├── JanusCore/            # Serveur de musique
│   │   ├── src/              # Code source
│   │   │   ├── main.rs       # Point d'entrée
│   │   │   ├── controller.rs # Contrôleur API
│   │   │   ├── model.rs      # Modèles de données
│   │   │   ├── routes.rs     # Routes API
│   │   │   └── service.rs    # Service de lecture
│   │   ├── public/music/     # Dossiers de musique
│   │   └── env.json          # Configuration JanusCore
│   │
│   ├── PhonosCore/           # Serveur de soundboard
│   │   ├── src/              # Code source
│   │   │   ├── main.rs       # Point d'entrée
│   │   │   ├── controller.rs # Contrôleur API
│   │   │   ├── model.rs      # Modèles de données
│   │   │   ├── routes.rs     # Routes API
│   │   │   └── service.rs    # Service de lecture
│   │   ├── public/soundboard/ # Fichiers audio
│   │   └── env.json          # Configuration PhonosCore
│   │
│   └── janus_nucleus/          # Bibliothèque partagée
│       ├── src/              # Code commun
│       │   ├── config.rs     # Configuration
│       │   ├── logger.rs     # Système de logs
│       │   ├── gui.rs        # Interface graphique Windows
│       │   └── audio.rs      # Utilitaires audio
│       └── Cargo.toml
│
├── ws/                        # Serveurs WebSocket (Node.js)
│   ├── ws_chat_youtube.cjs   # Relais WebSocket chat YouTube
│   └── ws_discord_presence.js# Relais WebSocket présence Discord
│
├── start/                     # Scripts de démarrage
│   └── start.bat             # Script batch pour démarrer tous les services
│
├── praetorcast-core.exe       # Exécutable praetorcast-core compilé
├── JanusCore.exe              # Exécutable JanusCore compilé
├── PhonosCore.exe             # Exécutable PhonosCore compilé
├── line.exe                   # Pont audio
├── env.json                   # Configuration globale (racine)
└── env-model.json            # Modèle de configuration
```

## Prérequis


### Node.js (pour les WebSockets YouTube et Discord)
```bash
npm install
```

### FFMPEG (optionnel)
Pour le traitement audio avancé : https://ffmpeg.org/

## Configuration

### Fichier env.json

Créez le fichier `env.json` à partir de `env-model.json` :

1. **env.json** : Configuration globale et WebSockets


#### Variables principales (praetorcast-core/env.json)

```json
{
    "PORT": 3000,
    "PORT_MUSIC": 3001,
    "PORT_SOUNDBOARD": 3002,
    "PORT_WS_YOUTUBE_CHAT": 3003,
    "PORT_WS_DISCORD_PRESENCE": 3004,
    "DISCORD_CLIENT_ID": "DISCORD_CLIENT_ID",
    "DISCORD_CLIENT_SECRET": "DISCORD_CLIENT_SECRET",
    "TWITCH_CLIENT_ID": "TWITCH_CLIENT_ID",
    "TWITCH_OAUTH_TOKEN": "TWITCH_OAUTH_TOKEN",
    "TWITCH_CHANNEL_NAME": "TWITCH_CHANNEL_NAME",
    "YOUTUBE_CHANNEL_ID": "YOUTUBE_CHANNEL_ID",
    "VOLUME": 0.5,
    "SOUNDBOARD_SHORTCUTS": {
        "1": "alt+1",
        "2": "alt+2",
        "3": "alt+3",
        "4": "alt+4",
        "5": "alt+5",
        "6": "alt+6",
        "7": "alt+7",
        "8": "alt+8",
        "9": "alt+9"
    },
    "FRONT_FONT_TITLE": "Arial",
    "OBS_WS_HOST": "localhost",
    "OBS_WS_PORT": 4455,
    "OBS_WS_PASSWORD": "OBS_WS_PASSWORD",
    "OBS_AUDIO_SOURCE": "music",
    "OBS_LIMITER_FILTER": "Limiter"
}
```

> Les clés `OBS_*` sont optionnelles : en leur absence, les valeurs par défaut ci-dessus
> s'appliquent (host `localhost`, port `4455`, mot de passe vide, source `music`,
> filtre `Limiter`).


### Configuration des token

#### 1. Obtenir le Client ID

1. Allez sur https://dev.twitch.tv/console/apps
2. Connectez-vous avec votre compte Twitch
3. Créez une application
4. Récupérez le Client ID

#### 2. Obtenir le Token OAuth

Remplacez `TON_CLIENT_ID` dans cette URL :
```
https://id.twitch.tv/oauth2/authorize?client_id=TON_CLIENT_ID&redirect_uri=http://localhost&response_type=token&scope=user%3Aread%3Aemail%20user%3Aread%3Afollows%20moderator%3Aread%3Afollowers%20chat%3Aread
```

Après autorisation, récupérez le `access_token` dans l'URL.

#### 3. Tester la configuration

```bash
curl -H "Client-ID: TON_CLIENT_ID" -H "Authorization: Bearer TON_OAUTH_TOKEN" https://api.twitch.tv/helix/users
```

### Configuration YouTube

Pour récupérer l'ID de la chaîne YouTube :
1. Allez dans l'onglet "À propos" de votre chaîne
2. Cliquez sur "Partager la chaîne"
3. Sélectionnez "Copier l'ID de la chaîne"
4. Ajoutez `YOUTUBE_CHANNEL_ID` dans `env.json`

### Configuration Discord

Pour la présence Discord (participants en vocal) :
1. Allez sur https://discord.com/developers/applications
2. Créez une application
3. Récupérez le `Client ID` et le `Client Secret`
3. Dans "redirect" y mettre "https://localhost"
4. Ajoutez `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET` dans `env.json`

### Configuration OBS (limiteur audio)

praetorcast-core peut piloter le filtre **Limiter** d'OBS appliqué à une source audio,
directement depuis la page `/music-config`, via obs-websocket v5.

1. Dans OBS : **Outils → Paramètres du serveur WebSocket** → activer le serveur, noter le
   port et le mot de passe.
2. Renseignez dans `env.json` :
   - `OBS_WS_HOST` / `OBS_WS_PORT` : adresse du serveur obs-websocket (défaut `localhost:4455`)
   - `OBS_WS_PASSWORD` : mot de passe (laisser vide `""` si l'authentification est désactivée)
   - `OBS_AUDIO_SOURCE` : nom **exact** de la source audio à limiter (défaut `music`)
   - `OBS_LIMITER_FILTER` : nom du filtre Limiter (défaut `Limiter`)
3. La source audio doit déjà exister dans OBS. Le filtre Limiter, lui, est **créé
   automatiquement** s'il est absent à la première utilisation.

> La configuration est relue à chaque requête : modifier `OBS_AUDIO_SOURCE` /
> `OBS_LIMITER_FILTER` ne nécessite pas de redémarrer praetorcast-core.


## Démarrage

### Démarrage automatique (recommandé)

Utilisez le script batch pour démarrer tous les services :

```bash
start/start.bat
```

Ce script démarre :
1. `praetorcast-core.exe` (serveur web principal)
2. `JanusCore.exe` (serveur de musique)
3. `PhonosCore.exe` (serveur de soundboard)
4. `line.exe` (pont audio)
5. `node ./ws/ws_chat_youtube.cjs` (WebSocket chat YouTube)
6. `node ./ws/ws_discord_presence.js` (WebSocket présence Discord)

### Démarrage manuel

#### 1. Démarrer praetorcast-core

```bash
cd praetorcast-core
cargo run
# ou directement
praetorcast-core.exe
```

Le serveur sera accessible sur `http://127.0.0.1:3000` (ou le port configuré)

#### 2. Démarrer JanusCore (Musique)

```bash
cd "janus core/JanusCore"
cargo run
# ou directement
JanusCore.exe
```

API disponible sur `http://127.0.0.1:3001`

#### 3. Démarrer PhonosCore (Soundboard)

```bash
cd "janus core/PhonosCore"
cargo run
# ou directement
PhonosCore.exe
```

API disponible sur `http://127.0.0.1:3002`

#### 4. Démarrer le chat YouTube (optionnel)

```bash
node ./ws/ws_chat_youtube.cjs
```

#### 5. Démarrer la présence Discord (optionnel)

```bash
node ./ws/ws_discord_presence.js
```

## Fonctionnalités

### praetorcast-core - Serveur Web Principal

#### Pages d'affichage (pour OBS)

- **`GET /`** : Page d'accueil avec vue d'ensemble
- **`GET /clock`** : Horloge en temps réel
- **`GET /music-current`** : Affichage de la musique en cours
- **`GET /banner`** : Bannières rotatives pour réseaux sociaux
- **`GET /scheduler`** : Planning hebdomadaire des streams
- **`GET /chat-horizontal`** : Chat Twitch/YouTube horizontal
- **`GET /chat-vertical`** : Chat Twitch/YouTube vertical
- **`GET /chat-youtube`** : Chat YouTube intégré
- **`GET /followers-info`** : Informations sur les followers Twitch
- **`GET /discord-presence`** : Présence Discord (participants en vocal)

#### Pages de configuration

- **`GET /music-config`** : Interface de configuration de la musique
- **`GET /banner-config`** : Interface de configuration des bannières
- **`GET /scheduler`** : Éditeur de planning

#### API REST

- **`GET /api/banner-config`** : Récupère la configuration des bannières
- **`POST /api/banner-config`** : Sauvegarde la configuration des bannières
- **`POST /api/banner-upload`** : Upload d'image de bannière
- **`GET /api/scheduler-config`** : Récupère la configuration du planning
- **`POST /api/scheduler-config`** : Sauvegarde la configuration du planning
- **`POST /api/scheduler-upload`** : Upload d'image pour le planning
- **`POST /api/scheduler-background-upload`** : Upload d'image de fond

#### API OBS (limiteur audio)

Pilote le filtre **Limiter** d'OBS sur la source audio configurée (`OBS_AUDIO_SOURCE`,
défaut `music`) via obs-websocket v5. Le filtre est **créé automatiquement** s'il n'existe
pas encore. Toutes les routes renvoient l'état `{ "enabled": bool, "threshold": float }`.

- **`GET /api/obs/limiter`** : État courant du filtre
- **`GET` / `POST` `/api/obs/limiter/add`** : Augmente le seuil de 1 dB
- **`GET` / `POST` `/api/obs/limiter/subtract`** : Diminue le seuil de 1 dB
- **`GET /api/obs/limiter/toggle`** : Active/désactive le filtre

### JanusCore - Serveur de Musique

#### Gestion des dossiers

- **`GET /api/folderlist`** : Liste tous les dossiers de musique disponibles
- **`GET /api/folder?folder=NomDossier`** : Lance la lecture d'un dossier

#### Contrôle de lecture

- **`GET /api/pause`** : Met en pause
- **`GET /api/resume`** : Reprend la lecture
- **`GET /api/stop`** : Arrête la lecture
- **`GET /api/next`** : Piste suivante
- **`GET /api/previous`** : Piste précédente
- **`GET /api/has_next`** : Vérifie s'il y a une piste suivante
- **`GET /api/has_previous`** : Vérifie s'il y a une piste précédente

#### Volume

- **`GET /api/volume`** : Récupère le volume actuel (0.0 à 1.0)
- **`POST /api/volume`** : Définit le volume (corps: `{"volume": 0.5}`)
- **`GET /api/volume/add`** : Augmente le volume
- **`GET /api/volume/subtract`** : Diminue le volume

#### Normalisation EBU R128

- **`GET /api/normalization`** : État de la normalisation (`{ "normalization_enabled": bool }`)
- **`POST /api/normalization`** : Active/désactive (corps: `{"enabled": true}`)
- **`GET /api/normalization/toggle`** : Bascule l'état de la normalisation

#### État et informations

- **`GET /api/status`** : État complet (pause, volume, titre, etc.)
- **`GET /api/current_music`** : Informations sur la piste en cours
- **`WS /api/current_music_ws`** : WebSocket pour les mises à jour en temps réel

#### Formats audio supportés

- MP3
- FLAC
- WAV
- AAC
- MP4 (ISOM4)

### PhonosCore - Serveur de Soundboard

#### Gestion des sons

- **`GET /api/soundboard/sounds`** : Liste tous les sons disponibles
- **`GET /api/soundboard/play?sound=nom_fichier`** : Joue un son
  - Met automatiquement la musique en pause
  - Reprend la musique à la fin du son
- **`GET /api/soundboard/stop`** : Arrête le son en cours et reprend la musique

#### Normalisation EBU R128

PhonosCore utilise la normalisation **EBU R128** (norme utilisée par Spotify, YouTube, TV) :
- Analyse automatique du niveau sonore (Loudness)
- Calcul du gain nécessaire pour uniformiser le volume
- Application automatique à la volée
- Résultat : tous les sons ont le même volume sans intervention manuelle

### ws_discord_presence - Présence Discord

Le serveur WebSocket Discord écoute sur `PORT_WS_DISCORD_PRESENCE` (3004) et fournit :
- Affichage des participants en vocal Discord en temps réel
- Indicateur de qui parle
- Suivi des changements de canal
- L'overlay `/discord-presence` de praetorcast-core se connecte automatiquement à ce WebSocket

## Intégration OBS

Pour intégrer les différentes fonctionnalités dans OBS Studio :

1. Ajoutez une source "Navigateur web" dans OBS
2. Entrez l'URL correspondante à la fonctionnalité souhaitée
3. Ajustez la taille et la position selon vos besoins

### URLs recommandées pour OBS

- **Page d'accueil** : `http://127.0.0.1:3000/`
- **Horloge** : `http://127.0.0.1:3000/clock`
- **Musique en cours** : `http://127.0.0.1:3000/music-current`
- **Chat horizontal** : `http://127.0.0.1:3000/chat-horizontal`
- **Chat vertical** : `http://127.0.0.1:3000/chat-vertical`
- **Chat YouTube** : `http://127.0.0.1:3000/chat-youtube`
- **Bannières** : `http://127.0.0.1:3000/banner`
- **Planning** : `http://127.0.0.1:3000/scheduler`
- **Informations followers** : `http://127.0.0.1:3000/followers-info`
- **Présence Discord** : `http://127.0.0.1:3000/discord-presence`

### Paramètres recommandés pour OBS

- **Largeur** : 1920px (ou selon vos besoins)
- **Hauteur** : 1080px (ou selon vos besoins)
- **Actualiser le navigateur quand la scène devient active** : Activé
- **Contrôles** : Désactivé (pour éviter les interactions)

## Technologies utilisées

### praetorcast-core

- **Actix-web** : Framework web asynchrone haute performance
- **Askama** : Moteur de templates type-safe
- **Tokio** : Runtime asynchrone
- **Serde/Serde JSON** : Sérialisation/désérialisation
- **UUID** : Génération d'identifiants uniques

### JanusCore & PhonosCore

- **Warp** : Framework HTTP asynchrone
- **Rodio** : Bibliothèque audio pour la lecture
- **Symphonia** : Décodage audio multi-format
- **EBUR128** : Normalisation audio EBU R128 (PhonosCore uniquement)
- **Tokio** : Runtime asynchrone
- **Serde/Serde JSON** : Sérialisation/désérialisation

### janus_nucleus

- **winapi** : Interface Windows native pour la GUI
- **Serde** : Configuration JSON

### WebSockets (Node.js)

- **ws** : Bibliothèque WebSocket
- **youtube-chat** : Intégration chat YouTube live
- **discord-rpc** : Intégration Discord Rich Presence

## Structure des données

### banner.json

```json
{
  "cards": [
    {
      "id": "uuid",
      "title": "Titre",
      "subtitle": "Sous-titre",
      "imagePath": "/public/banner/image.png",
      "link": "https://..."
    }
  ],
  "rotationInterval": 5000,
  "transitionDuration": 1000
}
```

### scheduler.json

```json
{
  "schedule": [
    {
      "dayIndex": 0,
      "day": "Lundi",
      "date": "2024-01-01",
      "title": "Titre du stream",
      "coverPath": "/public/scheduler/image.png"
    }
  ],
  "backgroundImage": "/public/scheduler/bg.png"
}
```

## Fonctionnalités avancées

### WebSocket en temps réel

- **Musique actuelle** : Mise à jour automatique via WebSocket (`/api/current_music_ws`)
- **Chat** : Synchronisation en temps réel via WebSocket
- **Présence Discord** : Participants en vocal mis à jour en temps réel

### Gestion des polices personnalisées

- Support des polices TTF/OTF
- Configuration via `env.json`
- Polices par défaut : Cinzel Decorative (titres), Lato (corps)

### Système de fichiers

- Upload automatique d'images avec UUID
- Organisation automatique des dossiers
- Sauvegarde automatique des configurations JSON

### Interface graphique Windows

JanusCore et PhonosCore peuvent afficher une fenêtre de logs native Windows (configurable via `env.json`)

## Dépannage

### Le serveur ne démarre pas

1. Vérifiez que les ports ne sont pas déjà utilisés
2. Vérifiez que `env.json` existe et est valide
3. Vérifiez les logs dans la console ou la fenêtre GUI

### La musique ne joue pas

1. Vérifiez que JanusCore est démarré
2. Vérifiez que les fichiers audio sont dans `public/music/`
3. Vérifiez les permissions de lecture des fichiers

### Le chat ne s'affiche pas

1. Vérifiez les credentials Twitch dans `env.json`
2. Vérifiez que le token OAuth est valide
3. Vérifiez que `node ./ws/ws_chat_youtube.cjs` est démarré pour YouTube

### La présence Discord ne s'affiche pas

1. Vérifiez les credentials Discord dans `env.json`
2. Vérifiez que `node ./ws/ws_discord_presence.js` est démarré
3. Vérifiez que Discord est ouvert et que vous êtes dans un canal vocal

### Les sons de la soundboard ne jouent pas

1. Vérifiez que PhonosCore est démarré
2. Vérifiez que JanusCore est démarré (pour la pause automatique)
3. Vérifiez que les fichiers audio sont dans `public/soundboard/`

## Support

Pour toute question ou problème :
- Consultez les logs dans les fenêtres GUI ou la console
- Vérifiez la configuration dans `env.json`
- Ouvrez une issue sur le repository
