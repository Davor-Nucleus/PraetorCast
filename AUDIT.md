# Audit de code — PraetorCast

**Date :** 2026-07-27 · **Périmètre :** les 4 dépôts (`PraetorCast`, `praetorcast-core`, `janus core`, `line`)
**Volume :** 2 043 lignes Rust (praetorcast-core), 2 376 (janus core), 347 (line), ~900 de Node, 4 706 de templates HTML.

> Deuxième passe. L'audit du 2026-07-25 relevait 19 constats, tous corrigés depuis (correctifs
> non commités, dans l'arbre de travail). Ce rapport **revérifie ces corrections** — dont deux
> défauts qu'elles ont introduits — et couvre les zones que la première passe n'avait pas ouvertes :
> le pont Discord, les gros templates de configuration, la chaîne de métadonnées audio.

---

## 1. Verdict

La faille critique est fermée, et vérifiée : un message de chat piégé ne produit plus aucun
élément exécutable, et le token Twitch a disparu des pages servies. Les trois dépôts Rust
compilent sans un seul avertissement et 40 tests passent (contre 24 et 2 avertissements avant).

Deux points nouveaux ressortent en revanche, dont un que la première passe avait **affirmé à tort**
comme sain : les deux serveurs WebSocket Node écoutent sur toutes les interfaces réseau, là où les
serveurs Rust se limitent à `127.0.0.1`.

| Sévérité | Nombre | Sujets |
|---|---|---|
| Critique | 0 | — |
| Majeur | 2 | Ponts Node exposés sur le réseau ; injection résiduelle via métadonnées audio |
| Mineur / dette | 9 | Encodage PowerShell, cache badges, fragilité de portée JS, échappement inégal |
| **Corrigés depuis la passe 1** | **19** | vérifiés un par un au §5 |

### Méthode

✅ signale ce qui est **vérifié par exécution**. Le reste vient de la lecture du code : aucune
tentative d'exploitation réelle n'a été menée contre les serveurs.

---

## 2. Constats majeurs

### 2.1 — ✅ Les deux ponts Node écoutent sur toutes les interfaces réseau

**Fichiers :** `PraetorCast/ws/ws_chat_youtube.cjs:16`, `PraetorCast/ws/ws_discord_presence.js:50`

```js
const wss = new WebSocket.Server({ port: PORT });        // ws_chat_youtube.cjs
const wss = new WebSocketServer({ port: PORT });         // ws_discord_presence.js
```

Sans option `host`, la bibliothèque `ws` crée un serveur HTTP qui écoute sur **toutes** les
interfaces. **Vérifié** en démarrant le pont et en relevant les sockets en écoute :

| Service | Adresse d'écoute | Port |
|---|---|---|
| `ws_chat_youtube.cjs` (node) | `::` — toutes interfaces | 3003 |
| `praetorcast-core.exe` (Rust) | `127.0.0.1` | 3000 |

Ce que cela expose à quiconque est sur le même réseau (Wi-Fi partagé, box, hotspot) :
les messages du chat YouTube en direct, et surtout la présence Discord — **pseudos, identifiants,
URL d'avatars et état « en train de parler » de toutes les personnes du salon vocal**, donc des
tiers qui n'ont pas consenti à cette diffusion. En lecture seule, sans possibilité d'agir, mais
c'est de la donnée personnelle de tierces parties.

L'audit précédent écrivait « les quatre serveurs écoutent sur `127.0.0.1` » : c'était exact pour
les quatre binaires Rust, mais la pile compte **six** services et les deux ponts Node n'avaient pas
été vérifiés.

**Correction** (une ligne par fichier) :
```js
const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });
```
À faire dans les deux copies de `ws_chat_youtube.cjs` (`PraetorCast/ws/` et `praetorcast-core/`).

### 2.2 — Injection résiduelle dans l'overlay musique via les métadonnées d'un mp3

**Fichiers :** `praetorcast-core/templates/music_current.html:139`, `janus core/JanusCore/src/model.rs:355-359`

C'est le même motif que l'XSS du chat qui vient d'être corrigé, sur un autre chemin de données.
JanusCore construit la pochette depuis les métadonnées embarquées du fichier :

```rust
// model.rs:358 — visual.media_type vient du tag du mp3
meta.cover_art = Some(format!("data:{};base64,{}", visual.media_type, encoded));
```

et l'overlay l'injecte dans une chaîne HTML :

```js
// music_current.html:139
iconWrapper.innerHTML = `<img class="cover-art" src="${coverArt}" alt="">`;
```

Un mp3 dont le `media_type` de l'image embarquée contient un guillemet sort de l'attribut et
exécute du script dans l'overlay. Le déclencheur suppose d'ajouter à la bibliothèque un fichier
d'origine douteuse — bien moins probable qu'un message de chat, mais le fichier musical est
précisément le genre de contenu qu'on récupère sans le fabriquer soi-même.

**Correction :** construire l'élément au lieu de la chaîne, comme dans `chat-common.js` :
```js
const img = document.createElement('img');
img.className = 'cover-art';
img.src = coverArt;          // par propriété : aucune sortie d'attribut possible
iconWrapper.replaceChildren(img);
```
Côté Rust, valider `visual.media_type` contre une liste (`image/png`, `image/jpeg`, `image/webp`)
serait une seconde barrière utile.

---

## 3. Constats mineurs et dette

**3.1 — ✅ `scripts/deploy.ps1` ne s'analysait pas.** Défaut introduit par la passe de correction et
corrigé pendant cet audit. Le fichier était de l'UTF-8 valide **sans BOM** ; Windows PowerShell 5.1
décode alors un `.ps1` en Windows-1252, les accents corrompaient les littéraux de chaîne et
l'analyse échouait sur tout le fichier (« Le terminateur " est manquant »). **Vérifié** : le même
contenu lu en UTF-8 s'analysait sans erreur, lu en CP1252 produisait 2 erreurs. Le script est
désormais en ASCII pur pour ses chaînes **et** doté d'un BOM — ceinture et bretelles, l'ASCII le
gardant valide si un outil retire le BOM. Leçon transposable : tout nouveau `.ps1` du dépôt doit
respecter la même règle.

**3.2 — `/api/twitch/badges` n'a pas de cache.** `twitch_controller::badges` refait trois appels
Helix (`users`, `badges/global`, `badges`) à chaque chargement d'overlay. Le coût est identique à
l'ancien code côté navigateur, donc ce n'est pas une régression, mais la boucle de reconnexion de
`chat-common.js` rappelle `loadBadges()` toutes les 3 secondes si la WebSocket Twitch tombe en
boucle — de quoi frôler la limitation de débit Helix. Les badges globaux changent quelques fois par
an : un `OnceLock` avec expiration horaire suffirait. **Mesuré :** 455 badges globaux renvoyés,
0 badge de chaîne (la chaîne n'en a pas de personnalisé).

**3.3 — `emote_corner.html` repose sur l'ordre des balises `<script>`.** Le template charge
`chat-common.js` entier pour n'en réutiliser que `parseTags`, puis redéfinit `parseTwitchMessage` et
`connectTwitch` — c'est la déclaration la plus tardive qui gagne. Vérifié : le comportement actuel
est correct. Mais si l'on intervertit les deux balises, l'overlay se met silencieusement à utiliser
le rendu du chat et échoue sur `ReferenceError: messages is not defined`. Extraire `parseTags` dans
un module partagé, ou renommer les fonctions propres à ce template, supprimerait le piège.

**3.4 — Échappement inégal dans les templates restants.** Inventaire des pages qui utilisent
`innerHTML` et de la présence d'un utilitaire d'échappement :

| Template | `innerHTML` | Échappement | Source des données |
|---|---|---|---|
| `banner.html`, `banner_config.html`, `channel_point_config.html` | oui | ✔ présent | configuration locale |
| `discord_presence.html` | oui | partiel — `esc()` sur le pseudo, **pas** sur `avatarUrl` | API Discord |
| `music_current.html` | oui | ✘ absent | métadonnées mp3 → §2.2 |
| `scheduler.html` | oui | ✘ absent | configuration locale |
| `music_config.html` | oui | ✘ absent | noms de fichiers du disque |

`scheduler.html:587` interpole `day.title`, `day.day`, `day.date` et injecte `day.coverPath` dans un
`style="background-image: url('...')"`. Les données viennent du configurateur, donc de
l'utilisateur lui-même : auto-injection au pire, pas une vulnérabilité. Reste que le projet applique
maintenant trois politiques différentes selon le fichier ; homogénéiser sur la construction DOM
éviterait qu'un futur chemin de données tierces atterrisse dans un template sans protection.

**3.5 — Ping OBS déclenche une lecture superflue.** `obs_controller::limiter_ws` place l'attente
d'une seconde et la lecture du flux entrant dans le même `select!`. Un `Ping` client relance donc
immédiatement le tour de boucle, avec un aller-retour obs-websocket supplémentaire. Sans
conséquence à la fréquence de ping des navigateurs, mais un `Instant` de dernière lecture rendrait
la cadence indépendante du trafic entrant.

**3.6 — `janus_nucleus` reste en edition 2021** alors que `JanusCore` et `PhonosCore` sont en 2024.
L'obstacle qui bloquait la migration (les `static mut`) est levé ; la bascule est désormais possible
et éviterait de raisonner sur deux éditions dans un même workspace. Le `resolver = "2"` du
`Cargo.toml` racine mérite le même alignement.

**3.7 — Aucun test sur les nouveaux chemins critiques côté serveur.** Le garde-fou de chemins est
couvert (5 tests), mais ni `upload::save_upload` (liste blanche d'extensions, plafond de taille) ni
`twitch_controller::badges` (aplatissement de la réponse Helix) n'ont de test. Le premier est
testable sans réseau et garde une valeur de non-régression évidente : c'est lui qui empêche
d'écrire un `.exe` dans `public/`.

**3.8 — Les harnais JavaScript vivent hors du dépôt.** Les trois harnais Node qui valident le rendu
du chat (16 assertions) et l'overlay des points de chaîne (11 + 7) sont dans un dossier temporaire
de session. Ce sont eux qui prouvent l'absence de régression XSS ; les déplacer dans
`praetorcast-core/tests/js/` avec un `npm test` les rendrait rejouables.

**3.9 — `line` : redémarrage de capture concurrent.** Après « Arrêter », `stop_flag` est posé mais le
thread audio peut encore tourner jusqu'à 200 ms (attente d'événement). Un clic immédiat sur
« Démarrer » lance un second thread pendant que le premier se termine — deux clients WASAPI en
parallèle le temps du recouvrement. Attendre la fin effective du thread (`JoinHandle`) supprimerait
la fenêtre.

---

## 4. Ce qui est solide

- **Rendu du chat** : plus une seule balise construite par concaténation. `parseBadges` et
  `parseEmotes` renvoient des données, `buildMessageElement` bâtit l'arbre DOM, `renderMessages`
  fait `replaceChildren`. ✅ 16 assertions, dont le pseudo piégé, la couleur injectée en attribut
  de style et la charge utile `<img onerror>`.
- **Surface réseau des serveurs Rust** : les quatre écoutent bien sur `127.0.0.1` (✅ relevé sur les
  sockets). Le CORS de JanusCore et PhonosCore est restreint aux origines de praetorcast-core.
- **Confinement des chemins** : `janus_nucleus::paths::resolve_within` canonicalise les deux côtés
  avant comparaison, avec ✅ 5 tests couvrant explicitement le chemin absolu et la remontée par `..`.
- **Tests non destructeurs** : ✅ empreintes md5 de `data/` identiques avant et après `cargo test`.
- **Écritures de configuration** : `update_config_key` refuse d'écrire sur un JSON illisible et passe
  par un fichier temporaire renommé.
- **Uploads** : un seul helper, liste blanche d'extensions, plafond de 64 Mo, fichier partiel
  supprimé en cas de dépassement.
- **WebSocket** : les quatre endpoints consomment leur flux entrant, répondent aux pings et
  détectent les fermetures ; les redemptions de points de chaîne sont diffusées à tous les clients.
- **Le manager TUI** reste le morceau le plus abouti : redémarrage exponentiel plafonné, bascule par
  service, logs en colonnes et sur disque, et désormais extinction complète de l'arbre de processus.

---

## 5. Les 19 constats de la passe 1 — état

| # | Constat | État | Vérification |
|---|---|---|---|
| 3.1 | XSS des overlays de chat | **corrigé** | ✅ 16/16 assertions ; `.innerHTML =` absent du fichier servi |
| 3.2 | Token Twitch dans le HTML | **corrigé** | ✅ token et client_id absents des 3 pages servies ; IRC anonyme ; badges côté serveur |
| 4.1 | `cargo test` détruit `banner.json` | **corrigé** | ✅ empreintes `data/` inchangées ; `reorder()` pure, 3 tests réels |
| 4.2 | Traversion de chemin + CORS | **corrigé** | ✅ 5 tests du garde-fou ; origines restreintes ; réponses « hors base » et « inexistant » rendues identiques |
| 4.3 | `env.json` écrasé par `{}` | **corrigé** | lecture du code : `Err` sans écriture, écriture atomique |
| 4.4 | Processus orphelins du manager | **corrigé** | `killTree` via `taskkill /T /F` — reste à confirmer en usage réel |
| 4.5 | `PORT_MUSIC` fantôme | **corrigé** | lu depuis `env.json` via `read_config()` |
| 5.1 | `env.json` relu à chaque requête | **corrigé** | `OnceLock`, aucune signature de handler touchée |
| 5.2 | `static mut` non synchronisés | **corrigé** | `AtomicPtr` + `AtomicBool` ; commentaires contradictoires remplacés |
| 5.3 | 3 WebSocket ignorent le flux entrant | **corrigé** | `select!` + `actix_web::rt::spawn` sur les trois |
| 5.4 | Pastille de statut Twitch | **corrigé** | test sur `typeof data.connected === 'boolean'` |
| 5.5 | Uploads sans validation | **corrigé** | `controllers/upload.rs`, 5 handlers ramenés à une ligne |
| 5.6 | `channel_point.rs` sans test | **corrigé** | ✅ 8 tests ajoutés (35 au total contre 24) |
| 5.7 | Règle `.gitignore` inopérante | **corrigé** | règle retirée, intention documentée sur sa propre ligne |
| 5.8 | `line` : 2 avertissements + angles morts | **corrigé** | ✅ 0 avertissement ; tampon plafonné à ~2 s ; erreurs remontées dans l'UI |
| 5.9 | Ctrl+C ne quitte pas le manager | **corrigé** | `''` explicite au lieu du caractère littéral ; `sanitize` ne mutile plus les logs |
| 5.10 | `env-model.json` incomplet | **corrigé** | ✅ JSON valide, plus aucune clé d'`env.json` absente |
| 5.11 | Duplication source/runtime | **partiel** | `deploy.ps1` livré (✅ analysé, **jamais exécuté**) ; extraction d'un `overlay-common.js` volontairement écartée |
| 5.12 | Config des récompenses figée | **corrigé** | relecture périodique et repoussée sur changement |

Deux réserves sur ce tableau. `deploy.ps1` n'a jamais été **exécuté** : son analyse syntaxique
passe, son comportement de copie n'est pas prouvé. Et cinq correctifs (4.2, 4.3, 4.5, 5.2, 5.8)
touchent `janus core` et `line`, dont les binaires n'ont pas été reconstruits sur ta décision : le
code est correct et compile, mais **`JanusCore.exe`, `PhonosCore.exe` et `line.exe` en place
contiennent toujours l'ancien comportement**, traversion de chemin comprise.

---

## 6. Plan d'action

| # | Action | Sévérité | Effort |
|---|---|---|---|
| 1 | `host: '127.0.0.1'` sur les deux serveurs WebSocket Node | Majeur | 5 min |
| 2 | Recompiler `janus core` et `line`, remplacer les 3 `.exe` | Majeur — les correctifs sont inertes sans ça | ~15 min |
| 3 | Pochette musicale par API DOM + validation du `media_type` | Majeur | ~30 min |
| 4 | Exécuter `deploy.ps1` une fois et vérifier son résultat | Mineur mais bloque la confiance | 10 min |
| 5 | Cache horaire sur `/api/twitch/badges` | Mineur | ~30 min |
| 6 | Rapatrier les harnais JS dans le dépôt + tests de `save_upload` | Mineur | ~1 h |
| 7 | Homogénéiser l'échappement des templates restants | Dette | ~1 h |
| 8 | `janus_nucleus` en edition 2024 | Dette | ~30 min |

Les points 1 et 2 sont les seuls à effet sécurité immédiat. Le 2 mérite d'être souligné : tant qu'il
n'est pas fait, la traversion de chemin du §4.2 de la passe précédente reste **exploitable en
production** malgré un code source corrigé.

---

## Annexe — mesures de cette passe

| Vérification | Résultat |
|---|---|
| `cargo build --release` (praetorcast-core, après `touch`) | 0 avertissement |
| `cargo check --workspace` (`janus core`, après `clean` des 3 crates) | 0 avertissement |
| `cargo check` (`line`, après `clean`) | 0 avertissement (2 avant) |
| `cargo test` (praetorcast-core) | 35/35 (24 avant) |
| `cargo test -p janus_nucleus` | 5/5 (nouveau) |
| `data/*.json` avant / après `cargo test` | empreintes md5 identiques |
| Harnais XSS du chat sous Node | 16/16 |
| Harnais overlay points de chaîne (son, file d'attente) | 11/11 et 7/7 |
| Token dans `/chat-horizontal`, `/chat-vertical`, `/emote-corner` | absent des trois |
| `/api/twitch/badges` | HTTP 200, 455 badges globaux, aucune fuite de jeton |
| Adresse d'écoute du pont Node (port 3003) | `::` — toutes interfaces |
| Adresse d'écoute de praetorcast-core (port 3000) | `127.0.0.1` |
| `scripts/deploy.ps1` | analyse syntaxique OK, 3 paramètres reconnus, **non exécuté** |
| `env-model.json` | JSON valide, aucune clé manquante vs `env.json` |

Ce qui **n'a pas** été fait : aucune exploitation réelle des points 2.1 et 2.2 (constats de lecture),
aucun test de charge, aucun test du chat Twitch contre l'IRC de production, et
`JanusCore.exe` / `PhonosCore.exe` / `line.exe` n'ont pas été reconstruits.
