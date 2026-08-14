# Plan — la régie (`/live`) et les presets de scène

> État : proposition, aucun code écrit.
> Cible : `praetorcast-core`, avec deux appels sortants vers JanusCore / PhonosCore.

---

## 1. Le problème

Onze overlays, huit pages de configuration — et rien pour **piloter le direct**. Pendant un
stream, il faut quatre onglets ouverts (`/timer-config`, `/goal-config`, `/music-config`,
`/text-config`) et `templates/index.html` n'est qu'un annuaire de liens : aucun état affiché,
aucune action.

Il manque aussi un vocabulaire commun. Chaque module sait s'afficher, aucun ne sait ce qu'est
un « moment » du stream. Passer en pause, c'est aujourd'hui six gestes dans quatre onglets.

---

## 2. Trois règles qui tiennent tout le plan

**R1 — La régie ne détient aucun état.** Elle lit par WebSocket, elle écrit par les endpoints
qui existent déjà. Une troisième source de vérité (après les fichiers `data/*.json` et l'état
Twitch en mémoire) serait la seule façon de rendre ce chantier ingérable.

**R2 — Tout ce qui est cliquable reste déclenchable en GET.** C'est déjà la règle du projet
(`main.rs:126-135`, `/api/goal/adjust`, `/api/obs/limiter/*`) : un bouton de Stream Deck ne sait
faire qu'un GET. La régie ne doit pas introduire d'action qui n'existe qu'au clic.

**R3 — Un preset est déclaratif et partiel.** Il décrit l'état voulu, pas une suite de gestes ;
et un module absent du preset **n'est pas touché**. Même philosophie que `models::env_file`, qui
fusionne clé par clé sur une relecture fraîche plutôt que de réécrire tout le fichier.

---

## 3. Inventaire des points d'accroche

| Module | Lecture | Écriture | À créer |
|---|---|---|---|
| Twitch (live, uptime, followers) | `TwitchState` en mémoire | — | rien |
| Timer | `/api/timer_ws` | `/api/timer/{start,pause,toggle,reset,adjust}` | rien |
| Objectifs | `/api/goal_ws` | `/api/goal/{adjust,set}` | rien |
| Limiteur OBS | `/api/obs/limiter_ws` | `/api/obs/limiter/{add,subtract,toggle}` | rien |
| Textes | `/api/text_ws` | `POST /api/text-config` | champ `active` (lot 3) |
| Musique | `:PORT_MUSIC/api/status`, `/api/current_music` | `/api/{pause,resume,next,previous,volume}` | rien |
| Soundboard | `:PORT_SOUNDBOARD/api/soundboard/sounds` | `/api/soundboard/{play,stop}` | rien |
| Bannière | `/api/banner_ws` | `POST /api/banner-config` | pas de champ `enabled` par carte → **hors lot 3** |

Deux faits qui décident de l'architecture :

- **`reqwest` est déjà une dépendance** (`Cargo.toml`) — le serveur peut appeler JanusCore
  lui-même, ce dont le lot 3 a besoin.
- **CORS est ouvert sur les deux serveurs warp** (`JanusCore/src/main.rs:74`,
  `PhonosCore/src/main.rs:64`) — le navigateur peut aussi les appeler directement, ce que
  `templates/music_config.html:312` fait déjà. Les lots 1 et 2 s'en contentent.

---

## 4. Lot 1 — `/live` en lecture seule

**Objectif :** une page utilisable dès le premier soir, sans aucun nouveau modèle de données.

### Routes

```rust
.route("/live",         web::get().to(live_controller::page))
.route("/api/live_ws",  web::get().to(live_controller::live_ws))
```

### Fichiers

| Fichier | Rôle |
|---|---|
| `src/controllers/live_controller.rs` | page + agrégat WS |
| `templates/live.html` | la régie ; réutilise `partials/_header.html` |
| `src/controllers/mod.rs` | déclaration du module |
| `templates/index.html` | une carte « Régie » en tête de la section Affichage |

### Forme de l'agrégat

```jsonc
{
  "twitch":  { "connected": true, "live": true, "startedAt": "2026-08-14T18:02:11Z",
               "followers": 1284, "lastFollower": "…" },
  "timer":   { "title": "Retour dans", "running": true,
               "remainingMs": 300000, "startedAt": 1755194531000 },
  "goals":   [ { "id": "g1", "title": "…", "current": 42, "target": 100, "visible": true } ],
  "texts":   [ { "name": "brb", "label": "Écran de pause" } ],
  "limiter": { "enabled": true, "value": -6.0 }
}
```

Le contrôleur reprend la boucle de `text_controller::text_ws` : `tokio::select!` sur le flux
entrant (sinon une fermeture d'onglet passe inaperçue) et un `sleep(1s)` qui **n'émet que sur
changement**.

### Le piège : ne pas pousser chaque seconde

Un compte à rebours qui tourne change de valeur à chaque tick. Si l'agrégat contenait le temps
restant *calculé*, la comparaison « snapshot != last » serait toujours vraie et le WebSocket
émettrait en continu.

**On pousse l'état, pas la valeur :** `running`, `remainingMs`, `startedAt` — et la page fait son
propre tick local, exactement comme `timer.html`. Tant que personne ne touche à rien, le socket
est silencieux.

### La santé des services, gratuitement

Musique et soundboard sont interrogés **par la page**, pas par le serveur. Un `fetch` qui échoue
sur `:PORT_MUSIC/api/status` = JanusCore éteint, badge rouge. Aucun code de diagnostic à écrire :
la page qui affiche l'état est celle qui constate la panne. Même chose pour
`/api/twitch/auth-status` (jeton) et le WS du limiteur (obs-websocket).

C'est la page `/status` évoquée séparément — elle devient une bande de badges en haut de la régie
plutôt qu'une neuvième page.

---

## 5. Lot 2 — les actions

**Aucun nouvel endpoint côté Rust.** Le lot est presque entièrement du front.

| Bouton | Appel |
|---|---|
| Timer ▶ / ⏸ / ⟲ / ±5 min | `/api/timer/{toggle,reset,adjust}` |
| Objectif ±1, valeur | `/api/goal/{adjust,set}` |
| Limiteur ± / on-off | `/api/obs/limiter/{add,subtract,toggle}` |
| Musique ⏯ ⏭ ⏮ volume | `:PORT_MUSIC/api/{pause,resume,next,previous,volume}` |
| Soundboard | `:PORT_SOUNDBOARD/api/soundboard/{play,stop}` |

Les ports viennent du template, comme dans `music_controller` : `PORT_MUSIC` et
`PORT_SOUNDBOARD` sont injectés par Askama, jamais écrits en dur.

**Une seule décision de conception :** le bouton n'attend pas la réponse pour se mettre à jour,
mais il ne décide pas non plus de l'état. Il envoie, et c'est le prochain push du WS qui fait
foi — la régie reste un miroir (R1). Un clic sans effet se voit alors tout seul : l'affichage
revient à sa valeur d'avant.

---

## 6. Lot 3 — les presets

C'est le cœur. Le reste n'était que du câblage.

### 6.1 Le champ qui manque : `TextSection.active`

Aujourd'hui une section de texte est affichée en permanence dans sa source OBS ; pour la masquer,
on masque la source dans OBS. Un preset ne peut donc rien décider.

```rust
/// Section affichée ou non. Un preset bascule ce champ ; l'overlay le respecte
/// sans qu'on touche à la visibilité de la source dans OBS.
#[serde(default = "default_true")]
pub active: bool,
```

`default = "default_true"` : un `data/text.json` écrit avant ce champ garde l'affichage qu'il
avait — même choix que `Timer::show_progress`.

**Attention à ne pas confondre deux « vides » dans `text.html` :** une section **inconnue**
affiche l'`empty-state` (c'est un diagnostic — « aucune section nommée brb », avec la liste des
noms disponibles). Une section **inactive** ne doit afficher **rien du tout** : c'est un état
normal, pas une panne. Deux chemins distincts dans `applyAll()`.

`Goal.visible` existe déjà — rien à ajouter côté objectifs. Les cartes de bannière n'ont pas
d'équivalent (`BannerDock.enabled` concerne les barres fixes, pas les cartes) : **la bannière
reste hors du lot 3**, sauf à lui ajouter le même champ, ce qui doublerait le chantier.

### 6.2 `data/presets.json`

```jsonc
{
  "presets": [
    {
      "id": "1755194531-1",
      "name": "pause",              // clé d'URL, slugifiée comme les sections de texte
      "label": "Pause",
      "texts":   { "active": ["brb"] },        // les autres sections passent à false
      "goals":   { "visible": ["g1"] },
      "timer":   { "durationMs": 300000, "action": "restart" },
      "music":   { "volume": 40, "action": "resume" },
      "limiter": { "enabled": true }
    }
  ]
}
```

**Chaque bloc est optionnel — absent veut dire « ne touche pas ».** Un preset « Fin de stream »
qui ne mentionne pas la musique doit laisser la musique où elle est. C'est la règle R3, et c'est
ce qui rend les presets composables au lieu d'être des états globaux rigides.

Le module réutilise tel quel ce qui a déjà été écrit pour les textes : `slugify` (le `name` est
une clé d'URL), le dédoublonnage en `-2` / `-3`, et la création du fichier vide au premier
`read()`. Autant en extraire une petite fonction partagée que la recopier — mais pas avant que
le troisième appelant existe.

### 6.3 Routes

```rust
.route("/presets",             web::get().to(preset_controller::page))
.route("/api/presets-config",  web::get().to(preset_controller::get))
.route("/api/presets-config",  web::post().to(preset_controller::save))
// GET *et* POST, comme le timer : un Stream Deck ne sait faire qu'un GET.
.route("/api/preset/apply",    web::get().to(preset_controller::apply))
.route("/api/preset/apply",    web::post().to(preset_controller::apply))
```

`/api/preset/apply?name=pause` répond `{ "applied": ["texts","timer"], "skipped": ["music"] }` —
`skipped` porte ce qui a échoué (JanusCore éteint) sans faire échouer le reste. Un preset
appliqué à moitié vaut mieux qu'une pause qui ne part pas parce que le lecteur de musique
n'était pas lancé.

### 6.4 Propagation

Rien à inventer : les overlays relisent leur JSON toutes les secondes via leur WS. **Écrire le
fichier suffit**, avec au pire 1 s de latence. Deux exceptions déjà outillées :

- le compte à rebours a `TimerNotify` — un preset qui démarre le timer le réveille comme le fait
  déjà un clic sur « Start » ;
- la musique est un autre processus : c'est ici que `reqwest` sert, côté serveur, puisqu'un
  déclenchement Stream Deck n'a pas de navigateur pour relayer.

---

## 7. Tests

Le dépôt teste les modèles en Rust et le comportement des templates en JS
(`tests/js/run.cjs` ramasse tout `*.test.cjs` automatiquement). On garde le partage.

**Rust — `src/models/preset.rs`**

- `apply()` est une **fonction pure** : elle prend l'état lu et le preset, elle rend le nouvel
  état. Aucun accès disque, donc testable — c'est la leçon déjà tirée pour `slugify_names` et
  `reorder`, dont les tests écrasaient la vraie configuration quand ils passaient par `write`.
- un bloc absent ne modifie pas le module correspondant (R3) ;
- un preset qui active `brb` désactive les autres sections, et **seulement** les sections ;
- slug, dédoublonnage, `data/presets.json` absent → créé vide ;
- `TextSection::active` vaut `true` sur un JSON écrit avant le champ.

**JS**

- `live.test.cjs` — l'agrégat rendu en badges, un service injoignable vire au rouge, le tick du
  timer est local (le rendu avance sans nouveau message WS) ;
- `presets-config.test.cjs` — mêmes conventions que `text-config.test.cjs` : échappement des
  libellés, parité du `slugify` avec le Rust, et une liste vide affiche une invite ;
- une vérification qui a déjà prouvé sa valeur sur les textes : **tout module cité dans un preset
  doit exister côté Rust**, sinon il sera ignoré en silence.

---

## 8. À trancher avant d'écrire

1. **Le preset touche-t-il OBS ?** `obws` est déjà là et pilote le limiteur. Changer de *scène*
   OBS depuis un preset serait l'aboutissement logique — mais ça déplace la source de vérité
   vers OBS. Je le laisserais dehors au premier tour.
2. **Un preset actif, ça existe ?** Afficher « preset courant : Pause » demande de stocker le
   dernier appliqué. Simple, mais faux dès qu'on touche un réglage à la main derrière.
   Proposition : on l'affiche comme « dernier appliqué », pas comme « état courant ».
3. **La régie doit-elle éditer, ou seulement piloter ?** Je propose piloter uniquement : les
   pages de configuration existent, les dupliquer serait le début de la fin.

---

## 9. Ordre de travail

| Lot | Contenu | Livrable seul ? |
|---|---|---|
| 1 | `/live` en lecture + badges de santé | oui — utile dès le premier soir |
| 2 | les boutons, branchés sur l'existant | oui |
| 3 | `active`, `presets.json`, `/api/preset/apply` | oui |

Les lots 1 et 2 ne créent aucun modèle et ne modifient aucun fichier de données : ils sont sans
risque de régression sur les overlays. Le lot 3 est le seul à toucher `data/text.json`, et
uniquement par ajout d'un champ à défaut compatible.
