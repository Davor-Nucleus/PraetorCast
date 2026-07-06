<div align="center">
  <!-- TODO: Insérer le logo du projet ici si vous en avez un -->
  <!-- <img src="public/logo.png" alt="PraetorCast Logo" width="200"/> -->

  # PraetorCast

  **L'outil ultime pour les streamers, gérant overlays, musique, soundboard et chat via OBS.**

  [![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)](#)
  [![Node.js](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)](#)
  [![OBS Studio](https://img.shields.io/badge/OBS_Studio-302E31?style=for-the-badge&logo=obs-studio&logoColor=white)](#)
</div>

---

PraetorCast est un outil complet pour les streamers, permettant de faciliter la gestion du stream avec une intégration native dans OBS grâce aux sources "navigateur web". Développé majoritairement en **Rust**, il garantit des performances optimales avec une très faible latence et une consommation mémoire minimale.

## 📋 Sommaire

- [Vue d'ensemble](#-vue-densemble)
- [Architecture](#-architecture)
- [Prérequis](#-prérequis)
- [Configuration](#-configuration)
- [Démarrage](#-démarrage)
- [Fonctionnalités](#-fonctionnalités)
- [Intégration OBS](#-intégration-obs)
- [Structure des Données](#-structure-des-données)
- [Dépannage](#-dépannage)

---

## 🔭 Vue d'ensemble

PraetorCast est composé de cinq applications principales qui fonctionnent en synergie :

1.  **praetorcast-core** : Serveur web principal (Rust/Actix-web) - Interface web et gestion des overlays.
2.  **JanusCore** : Serveur de musique (Rust/Warp) - Lecture de musique avec support multi-format.
3.  **PhonosCore** : Serveur de soundboard (Rust/Warp) - Gestion des effets sonores synchronisée avec la musique.
4.  **ws_chat_youtube** : Relais WebSocket pour le chat YouTube (Node.js).
5.  **ws_discord_presence** : Relais WebSocket pour la présence Discord (Node.js).

---

## 🏗️ Architecture

<details>
<summary><b>Cliquez pour dérouler l'arborescence du projet</b></summary>

```text
PraetorCast/
├── praetorcast-core/          # Serveur web principal (Rust)
│   ├── src/                   # Code source Rust (main, routes, etc.)
│   ├── templates/             # Templates Askama (HTML)
│   ├── public/                # Fichiers statiques (musique, images, polices)
│   ├── data/                  # Données de config (banner.json, etc.)
│   └── env.json               # Configuration principale
│
├── janus core/                # Workspace Rust pour l'audio
│   ├── JanusCore/             # Serveur de musique
│   ├── PhonosCore/            # Serveur de soundboard
│   └── janus_nucleus/         # Bibliothèque partagée (GUI, Config)
│
├── ws/                        # Serveurs WebSocket (Node.js)
│   ├── ws_chat_youtube.cjs
│   └── ws_discord_presence.js
│
├── start/                     # Scripts de démarrage
│   └── start.bat              # Script batch pour lancer tous les services
│
├── praetorcast-core.exe       # Exécutables compilés
├── JanusCore.exe              
├── PhonosCore.exe             
├── line.exe                   # Pont audio
└── env.json                   # Configuration globale
```
</details>

---

## ⚡ Prérequis

> [!IMPORTANT]
> Assurez-vous d'avoir les éléments suivants installés avant de démarrer.

- **Node.js** (requis pour les WebSockets YouTube et Discord)
  ```bash
  npm install
  ```
- **FFMPEG** *(Optionnel)* - Recommandé pour le traitement audio avancé. [Télécharger FFMPEG](https://ffmpeg.org/)

---

## ⚙️ Configuration

### 1. Fichier `env.json`

Créez le fichier `env.json` à la racine à partir du modèle `env-model.json`. Ce fichier contient les ports, clés d'API et paramètres de vos scènes.

<details>
<summary><b>Voir un exemple de configuration (env.json)</b></summary>

```json
{
    "PORT": 3000,
    "PORT_MUSIC": 3001,
    "PORT_SOUNDBOARD": 3002,
    "PORT_WS_YOUTUBE_CHAT": 3003,
    "PORT_WS_DISCORD_PRESENCE": 3004,
    "DISCORD_CLIENT_ID": "votre_id",
    "TWITCH_CLIENT_ID": "votre_id",
    "TWITCH_OAUTH_TOKEN": "votre_token",
    "YOUTUBE_CHANNEL_ID": "votre_id",
    "VOLUME": 0.5,
    "OBS_WS_HOST": "localhost",
    "OBS_WS_PORT": 4455,
    "OBS_AUDIO_SOURCE": "music",
    "OBS_LIMITER_FILTER": "Limiter"
}
```
</details>

> [!NOTE]
> Les clés `OBS_*` sont optionnelles. En leur absence, les valeurs par défaut s'appliquent (`localhost:4455`, source `music`, filtre `Limiter`).

### 2. Configuration des tokens (Twitch)

#### 1. Obtenir le Client ID

1. Allez sur https://dev.twitch.tv/console/apps
2. Connectez-vous avec votre compte Twitch
3. Créez une application
4. Récupérez le Client ID

#### 2. Obtenir le Token OAuth

Remplacez `TON_CLIENT_ID` dans cette URL :
```text
https://id.twitch.tv/oauth2/authorize?client_id=TON_CLIENT_ID&redirect_uri=http://localhost&response_type=token&scope=user%3Aread%3Aemail%20user%3Aread%3Afollows%20moderator%3Aread%3Afollowers%20chat%3Aread
```

Après autorisation, récupérez le `access_token` dans l'URL.

#### 3. Tester la configuration

```bash
curl -H "Client-ID: TON_CLIENT_ID" -H "Authorization: Bearer TON_OAUTH_TOKEN" https://api.twitch.tv/helix/users
```

### 3. Configuration YouTube

Pour récupérer l'ID de la chaîne YouTube :
1. Allez dans l'onglet "À propos" de votre chaîne
2. Cliquez sur "Partager la chaîne"
3. Sélectionnez "Copier l'ID de la chaîne"
4. Ajoutez `YOUTUBE_CHANNEL_ID` dans `env.json`

### 4. Configuration Discord

Pour la présence Discord (participants en vocal) :
1. Allez sur https://discord.com/developers/applications
2. Créez une application
3. Récupérez le `Client ID` et le `Client Secret`
4. Dans "redirect" y mettre "https://localhost"
5. Ajoutez `DISCORD_CLIENT_ID` et `DISCORD_CLIENT_SECRET` dans `env.json`

### 5. Configuration OBS (limiteur audio)

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

> [!NOTE]
> La configuration est relue à chaque requête : modifier `OBS_AUDIO_SOURCE` / `OBS_LIMITER_FILTER` ne nécessite pas de redémarrer praetorcast-core.

---

## 🚀 Démarrage

### Démarrage Automatique (Recommandé)

Le plus simple est d'utiliser le script de démarrage fourni qui lancera l'ensemble des services (serveurs Rust et WebSockets) en une fois :

```bash
start/start.bat
```

### Démarrage Manuel

Si vous préférez lancer les services indépendamment (idéal pour le debug ou le développement) :

```bash
# 1. Serveur Principal (Port 3000)
cd praetorcast-core && cargo run

# 2. Serveur Musique (Port 3001)
cd "janus core/JanusCore" && cargo run

# 3. Serveur Soundboard (Port 3002)
cd "janus core/PhonosCore" && cargo run

# 4. WebSockets (Node.js)
node ./ws/ws_chat_youtube.cjs
node ./ws/ws_discord_presence.js
```

---

## 🌟 Fonctionnalités

### 🎛️ PraetorCast-Core (Serveur Web)
Le cerveau du système. Il fournit l'API REST, les pages de configuration web et les overlays prêts à être intégrés dans OBS. Il pilote également automatiquement les filtres **Limiter** d'OBS via `obs-websocket`.

### 🎵 JanusCore (Musique) & 🔊 PhonosCore (Soundboard)
Gèrent la lecture audio indépendante. **JanusCore** s'occupe de la musique de fond avec une normalisation intelligente de type EBU R128. **PhonosCore** joue des effets sonores (SFX) et a la capacité de **mettre en pause automatiquement la musique de JanusCore** le temps de jouer l'effet.

### 🔌 WebSockets (Temps Réel)
Mise à jour ultra-rapide des overlays :
- Affichage de la musique en cours
- Synchronisation du chat multiplateforme (Twitch & YouTube)
- Affichage interactif des membres actifs en vocal sur Discord (Discord Presence)

---

## 🎬 Intégration OBS

Dans OBS Studio, ajoutez une **Source Navigateur** pour chaque overlay souhaité. Voici les URLs par défaut :

| Module | URL | Taille recommandée |
|---|---|---|
| **Page d'accueil / Dashboard** | `http://127.0.0.1:3000/` | Libre |
| **Horloge** | `http://127.0.0.1:3000/clock` | Selon vos scènes |
| **Musique actuelle** | `http://127.0.0.1:3000/music-current` | Selon vos scènes |
| **Chat Horizontal** | `http://127.0.0.1:3000/chat-horizontal` | Pleine largeur (ex: 1920px) |
| **Chat Vertical** | `http://127.0.0.1:3000/chat-vertical` | Colonne latérale |
| **Chat YouTube** | `http://127.0.0.1:3000/chat-youtube` | Colonne latérale |
| **Bannières rotatives** | `http://127.0.0.1:3000/banner` | `1920x1080` |
| **Planning des streams** | `http://127.0.0.1:3000/scheduler` | `1920x1080` |
| **Infos Followers** | `http://127.0.0.1:3000/followers-info` | Selon vos scènes |
| **Présence Discord** | `http://127.0.0.1:3000/discord-presence`| Selon vos scènes |

> [!TIP]
> **Options OBS recommandées :** Cochez l'option _"Actualiser le navigateur quand la scène devient active"_ et désactivez _"Contrôles"_ pour éviter les interactions parasites.

---

## 💾 Structure des Données

Les données des overlays sont sauvegardées en format JSON dans le dossier `data/`.

<details>
<summary><b>Format: banner.json</b></summary>

```json
{
  "cards": [
    {
      "id": "uuid",
      "title": "Titre de la carte",
      "subtitle": "Sous-titre",
      "imagePath": "/public/banner/image.png",
      "link": "https://..."
    }
  ],
  "rotationInterval": 5000,
  "transitionDuration": 1000
}
```
</details>

<details>
<summary><b>Format: scheduler.json</b></summary>

```json
{
  "schedule": [
    {
      "dayIndex": 0,
      "day": "Lundi",
      "date": "2024-01-01",
      "title": "Nom du stream",
      "coverPath": "/public/scheduler/image.png"
    }
  ],
  "backgroundImage": "/public/scheduler/bg.png"
}
```
</details>

---

## 🛠️ Dépannage

- **Le serveur ne démarre pas ?**
  Vérifiez que les ports (3000 à 3004) ne sont pas déjà utilisés par une autre application et que votre fichier `env.json` est correctement formaté.
- **La musique ne se lance pas ?**
  Assurez-vous que les fichiers audios sont bien placés dans `public/music/` et que *JanusCore* est en cours d'exécution.
- **Le chat / Discord ne s'affiche pas ?**
  Vérifiez que les scripts Node.js respectifs (`ws_chat_youtube.cjs`, `ws_discord_presence.js`) sont lancés et que vos tokens/IDs dans `env.json` sont valides.

---

<div align="center">
  <i>Développé avec ❤️ en Rust</i>
</div>
