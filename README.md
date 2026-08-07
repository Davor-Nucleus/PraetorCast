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

## ✨ Fonctionnalités principales

- **Overlays OBS clés en main** — horloge, bannière tournante, planning hebdomadaire, musique en cours, emote corner, infos followers.
- **Chat multi-plateformes** — Twitch (horizontal / vertical) et YouTube, affichés côte à côte dans OBS.
- **Channel Points Twitch** — alertes personnalisées avec image et son propres à chaque récompense.
- **Barres d'objectif** — plusieurs barres empilables (followers, abonnés, compteur libre),
  éditables depuis `/goal-config`.
- **Objectifs dans la bannière** — depuis `/banner-config`, une carte de la rotation peut
  afficher un objectif au lieu d'un texte, et des barres peuvent rester fixées sur un bord
  pendant que les cartes tournent.
- **Présence Discord** — affichage en direct des membres connectés en vocal.
- **Lecteur de musique (JanusCore)** — MP3/FLAC/WAV/AAC/MP4, playlists par dossier, normalisation EBU R128.
- **Soundboard (PhonosCore)** — effets sonores qui mettent automatiquement la musique en pause le temps de jouer.
- **Pilotage OBS** — contrôle du filtre Limiter via obs-websocket v5, sans quitter la page de configuration.
- **Routage audio Windows (line)** — capture loopback WASAPI et redirection vers un autre périphérique.
- **Pages de configuration web** — bannière, planning, musique / soundboard et channel points, éditables depuis le navigateur.
- **Paramètres dans le navigateur (`/settings`)** — `env.json` éditable sans quitter l'interface : ports, réglages OBS, raccourcis, secrets masqués.
- **Jeton Twitch en un clic** — un bouton remplace l'URL d'autorisation à construire à la main et le copier-coller depuis la barre d'adresse.
- **Thème global des overlays** — accent, police, rayons et ombres pilotés depuis `/settings`, appliqués en direct aux sources OBS.
- **Temps réel** — WebSockets pour rafraîchir les overlays sans recharger les sources OBS.
- **Lancement et compilation automatisés** — manager de démarrage (`start.bat`) et script de build unifié (`build.cjs`).

## 📋 Sommaire

- [Fonctionnalités principales](#-fonctionnalités-principales)
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
2.  **JanusCore** : Serveur de musique (Rust/Warp) - Lecture de musique avec support multi-format et normalization EBU R128.
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
├── compile/                   # Scripts de compilation
│   ├── build.cjs              # Compile les binaires Rust et les copie à la racine
│   └── build.bat              # Lanceur (double-clic)
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
- **Rust / cargo** *(uniquement pour recompiler)* - Les quatre services sont des binaires Rust. [Installer Rust](https://rustup.rs)
- **FFMPEG** *(Optionnel)* - Recommandé pour le traitement audio avancé. [Télécharger FFMPEG](https://ffmpeg.org/)

### Compilation

Les dépôts sources (`praetorcast-core/`, `janus core/`, `line/`) sont des dossiers **frères** de `PraetorCast/`. Le script `compile/build.cjs` les compile en release et dépose les `.exe` à la racine :

```bash
node ./compile/build.cjs             # les 4 cibles (incrémental)
node ./compile/build.cjs janus line  # cibles au choix : core | janus | phonos | line
node ./compile/build.cjs --clean     # vide les target/ puis recompile tout à neuf
node ./compile/build.cjs --help
```

`--clean` lance un `cargo clean` complet sur les dépôts concernés (dépendances comprises) avant de compiler : utile pour repartir d'une base saine ou libérer de l'espace disque, mais compter plusieurs minutes de recompilation.

> [!NOTE]
> Le script refuse de démarrer si un `.exe` est verrouillé par un service en cours : quittez PraetorCast (`[q]` dans le manager) avant de recompiler. Il ne touche jamais à `public/`, `data/` ni `env.json`.
> Si vos dépôts ne sont pas dans le dossier parent, définissez `PRAETORCAST_SRC`.

---

## ⚙️ Configuration

> [!TIP]
> La page **`/settings`** édite `env.json` depuis le navigateur : ports, identifiants Twitch, réglages OBS, raccourcis soundboard et thème des overlays. Les secrets y sont masqués, les ports validés, et chaque champ indique le service à redémarrer le cas échéant. Le fichier reste éditable à la main pour une première installation.

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
    "TWITCH_OAUTH_TOKEN": "",
    "TWITCH_TOKEN_EXPIRES_AT": 0,
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

Il n'y a que **deux valeurs à saisir** : le nom de chaîne et le Client ID. Le
`TWITCH_OAUTH_TOKEN` est généré par un bouton — plus d'URL à construire ni de jeton
à recopier depuis la barre d'adresse.

#### 1. Créer l'application Twitch

1. Allez sur https://dev.twitch.tv/console/apps
2. Connectez-vous avec votre compte Twitch et créez une application
3. Dans **URL de redirection OAuth**, ajoutez **exactement** :
   ```text
   http://localhost:3000/auth/callback
   ```
4. Récupérez le **Client ID**


#### 2. Générer le jeton en un clic

1. Ouvrez `http://localhost:3000/settings`
2. Renseignez **Nom de la chaîne** et **Client ID**, puis **Enregistrer**
3. Cliquez sur **Connecter Twitch** et acceptez l'autorisation

Twitch renvoie sur PraetorCast, qui enregistre `TWITCH_OAUTH_TOKEN` et son échéance dans
`env.json`, puis reconnecte la session EventSub — sans redémarrer le serveur. Le panneau
affiche le compte connecté, le temps restant et les droits éventuellement manquants.

**Pour refaire le jeton**, il suffit de **recliquer sur « Connecter Twitch »** : l'écran de
consentement est réaffiché et le jeton est remplacé. Un jeton Twitch vit une soixantaine de
jours ; `/settings` passe l'échéance en orange la dernière semaine.

Scopes demandés :

| Scope | Utilisé par |
|---|---|
| `user:read:email`, `user:read:follows` | Identification du compte |
| `moderator:read:followers` | Compteur de followers, alertes de follow |
| `chat:read` | Overlays de chat |
| `channel:read:redemptions` | Points de chaîne |
| `channel:read:subscriptions` | Barre d'objectif en mode « abonnés » |

#### 3. Vérifier la configuration

Le bouton **Vérifier le jeton** de `/settings` interroge `id.twitch.tv/oauth2/validate` et
affiche le compte, l'expiration et les scopes manquants. En ligne de commande :

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
| **Compte à rebours** | `http://127.0.0.1:3000/timer` | Selon vos scènes |
| **Planning des streams** | `http://127.0.0.1:3000/scheduler` | `1920x1080` |
| **Infos Followers** | `http://127.0.0.1:3000/followers-info` | Selon vos scènes |
| **Présence Discord** | `http://127.0.0.1:3000/discord-presence`| Selon vos scènes |
| **Points de chaîne** | `http://127.0.0.1:3000/channel-points` | Selon vos scènes |
| **Barres d'objectif** | `http://127.0.0.1:3000/goal` | ~`800x160` par barre |

> [!TIP]
> **Options OBS recommandées :** Cochez l'option _"Actualiser le navigateur quand la scène devient active"_ et désactivez _"Contrôles"_ pour éviter les interactions parasites.

### Thème commun

Tous les overlays chargent la même feuille générée, `http://127.0.0.1:3000/theme.css`, et n'utilisent plus que ses variables. La section **Thème des overlays** de `/settings` pilote donc en un seul endroit :

| Variable | Rôle |
|---|---|
| `--pc-accent`, `--pc-accent-2` | Couleur principale et second ton des dégradés |
| `--pc-font`, `--pc-font-scale` | Police (issue de `FRONT_FONT_TITLE`) et échelle globale du texte |
| `--pc-text`, `--pc-text-muted` | Texte principal et secondaire |
| `--pc-bg`, `--pc-panel` | Fond des overlays transparents, fond des bulles et pastilles |
| `--pc-radius`, `--pc-radius-sm`, `--pc-shadow` | Rayons de bordure et ombre portée |

Une modification est poussée aux sources OBS ouvertes par le WebSocket `/api/theme_ws` : **inutile d'actualiser les sources**. Les valeurs sont stockées dans `data/theme.json`.

> [!NOTE]
> `/clock`, `/music-current`, `/banner` et `/followers-info` gardent volontairement leur fond opaque : ce sont des affichages plein écran, pas des incrustations. `--pc-bg` ne s'applique qu'aux overlays transparents.

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
      "kind": "text",
      "text": "Bienvenue sur le stream",
      "imagePath": "/public/banner/image.png",
      "transition": "fade",
      "order": 0,
      "durationMs": 6000
    },
    {
      "id": "uuid",
      "kind": "goal",
      "goalId": "uuid-de-l-objectif",
      "transition": "zoom",
      "order": 1,
      "durationMs": 8000
    }
  ],
  "dock": {
    "enabled": true,
    "position": "bottom",
    "scale": 1
  }
}
```

| Champ d'une carte | Rôle |
|---|---|
| `kind` | `text` (défaut) : texte et/ou image. `goal` : une barre d'objectif |
| `text`, `imagePath` | Contenu d'une carte `text` |
| `goalId` | Cible d'une carte `goal`, par son `id` dans `goal.json`. **Absent = tous les objectifs** |
| `transition` | `fade`, `slide`, `zoom` ou `flip` |
| `durationMs` | Temps d'affichage avant rotation. Absent = 6 000 ms |
| `order` | Position dans le cycle, réindexée à l'enregistrement |

Le bloc `dock` décrit les **barres fixes** : des objectifs affichés en permanence sur un
bord, pendant que les cartes tournent au-dessus. Ce n'est pas un élément de la rotation.

| Champ du dock | Rôle |
|---|---|
| `enabled` | À `false` (défaut), aucune barre fixe |
| `position` | `bottom` (défaut) ou `top`. Les cartes s'arrêtent à la limite des barres |
| `goalId` | Comme pour une carte : absent = tous les objectifs |
| `scale` | Ajustement de taille. `1` (défaut) est la taille prévue, qui se calibre seule sur la largeur de la source ; ce réglage ne sert qu'à s'en écarter |

> [!NOTE]
> Un `banner.json` antérieur reste lisible tel quel : une carte sans `kind` reste une
> carte texte, et le bloc `dock` absent vaut « désactivé ». Rien ne change tant que
> vous n'ajoutez pas de carte objectif dans `/banner-config`.

> [!TIP]
> Dans la bannière, les barres reprennent l'habillage des cartes texte : titre et
> chiffres au **dégradé animé** du thème, tailles proportionnelles à la source, rayons
> de `--pc-radius`. Le remplissage garde en revanche l'`accentColor` de chaque objectif,
> pour que deux barres restent distinguables. L'overlay `/goal`, lui, conserve son
> aspect d'incrustation.

> [!TIP]
> Une carte `goal` dont la cible a été supprimée depuis `/goal-config` est simplement
> ignorée dans la rotation, plutôt que d'imposer une carte vide à chaque tour.

</details>

<details>
<summary><b>Format: goal.json</b></summary>

Plusieurs barres peuvent coexister : elles s'empilent dans l'ordre du tableau.

```json
{
  "goals": [
    {
      "source": "followers",
      "title": "Objectif followers",
      "target": 200,
      "manualCurrent": 0,
      "baseline": 0,
      "accentColor": "#9146FF",
      "showNumbers": true,
      "showPercent": true,
      "visible": true
    },
    {
      "source": "manual",
      "title": "Objectif dons",
      "target": 250,
      "manualCurrent": 80,
      "baseline": 0,
      "accentColor": "#ef4444",
      "showNumbers": true,
      "showPercent": true,
      "visible": true
    }
  ]
}
```

| Champ | Rôle |
|---|---|
| `source` | `followers` (relevé par EventSub), `subs` (Helix, voir ci-dessous) ou `manual` |
| `title` | Libellé affiché à gauche de la barre |
| `target` | Cible. À 0, la barre est considérée comme atteinte |
| `manualCurrent` | Valeur courante — **uniquement** si `source` vaut `manual` |
| `baseline` | Retranchée du total mesuré : mettez votre total actuel pour un objectif « +50 ce stream » plutôt qu'un total absolu |
| `accentColor` | Couleur de remplissage de la barre |
| `showNumbers`, `showPercent` | Masquent les chiffres ou le pourcentage |
| `visible` | À `false`, la barre disparaît de l'overlay `/goal` sans être supprimée |

> [!TIP]
> Deux barres peuvent partager la même source — par exemple un total absolu
> (`baseline: 0`) et une progression du jour (`baseline` = votre total actuel).
> La valeur n'est relevée qu'une fois par cycle, quel que soit le nombre de barres
> qui l'utilisent.

> [!NOTE]
> Ce fichier ne décrit **que** les objectifs. Leur présence dans la bannière se
> règle dans `/banner-config` (cf. `banner.json`) : `/goal-config` définit les
> objectifs, `/banner-config` décide de ce que la bannière affiche.

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
