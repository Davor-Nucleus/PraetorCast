'use strict';

// Compile les binaires Rust de PraetorCast et les depose a la racine du projet.
// Les depots sources sont des dossiers *freres* de PraetorCast (voir TARGETS).
// Apres praetorcast-core, synchronise aussi ses ressources public/ et data/ (voir SYNC).
//  purge avant de compiler : '--clean', '-c'
//
//   node ./compile/build.cjs             -> les 4 cibles
//   node ./compile/build.cjs janus line  -> uniquement ces cibles
//   node ./compile/build.cjs --sync      -> synchro public/ et data/ seule, sans cargo

const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const ROOT = path.resolve(__dirname, '..');
// Dossier parent contenant les depots freres ; surchargeable si la disposition change de machine.
const SRC  = process.env.PRAETORCAST_SRC
  ? path.resolve(process.env.PRAETORCAST_SRC)
  : path.resolve(ROOT, '..');

// ── ANSI ─────────────────────────────────────────────────────────────────────
const R      = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';

const TARGET_COLORS = ['\x1b[96m', '\x1b[93m', '\x1b[95m', '\x1b[94m'];

// ── Config ────────────────────────────────────────────────────────────────────
const MAX_TAIL = 15; // lignes de sortie cargo rappelees sous le resume en cas d'echec

// `pkg` : nom du package cargo a construire (workspace uniquement), sinon null.
const TARGETS = [
  { key: 'core',   name: 'praetorcast-core', dir: 'praetorcast-core', pkg: null,         exe: 'praetorcast-core.exe' },
  { key: 'janus',  name: 'JanusCore',        dir: 'janus core',       pkg: 'JanusCore',  exe: 'JanusCore.exe' },
  { key: 'phonos', name: 'PhonosCore',       dir: 'janus core',       pkg: 'PhonosCore', exe: 'PhonosCore.exe' },
  { key: 'line',   name: 'line',             dir: 'line',             pkg: null,         exe: 'line.exe' },
];

// Tolerance sur les noms saisis : `PhonosCore`, `phonoscore`, `phonoscore.exe`... -> `phonos`.
const ALIASES = {
  'praetorcast-core': 'core',
  'praetorcastcore':  'core',
  'praetorcast':      'core',
  'januscore':        'janus',
  'phonoscore':       'phonos',
  'line.exe':         'line',
};

// Ressources de praetorcast-core lues sur le disque au lancement. Askama compile les
// templates dans l'exe, mais public/ et data/ sont lus relativement au dossier de
// lancement (la racine de PraetorCast) : recopier le seul exe laissait des ressources
// perimees ou absentes -- overlays en 404, fonctionnalite qui demarre vide.
// `overwrite` : le code (public/js) suit la source ; le contenu utilisateur (uploads)
// et l'etat en cours (data/) ne sont que completes. Rien n'est jamais supprime.
const SYNC = [
  { from: 'public/js',           overwrite: true  },
  { from: 'public/banner',       overwrite: false },
  { from: 'public/scheduler',    overwrite: false },
  { from: 'public/channelpoint', overwrite: false },
  { from: 'public/font',         overwrite: false },
  // Fichiers a la racine de public/ (favicons) : les sous-dossiers sont ignores.
  { from: 'public',              overwrite: false, label: 'public/ (racine)' },
  { from: 'data',                overwrite: false, label: 'data/*.json', filter: (name) => name.endsWith('.json') },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function srcDir(t)  { return path.join(SRC, t.dir); }
function artifact(t) { return path.join(srcDir(t), 'target', 'release', t.exe); }
function dest(t)     { return path.join(ROOT, t.exe); }

function fmtSize(bytes) { return `${(bytes / 1024 / 1024).toFixed(1)} Mo`; }
function fmtDur(ms)     { return ms >= 60000 ? `${Math.floor(ms / 60000)}m${String(Math.round(ms % 60000 / 1000)).padStart(2, '0')}s` : `${(ms / 1000).toFixed(1)}s`; }

function usage() {
  const keys = TARGETS.map(t => t.key).join(' | ');
  console.log(`
 ${BOLD}PraetorCast — compilation${R}

 ${DIM}Usage :${R} node ./compile/build.cjs [--clean] [cible...]

 Cibles disponibles :`);
  for (const t of TARGETS) {
    const pkg = t.pkg ? ` -p ${t.pkg}` : '';
    console.log(`   ${BOLD}${t.key.padEnd(7)}${R} ${t.exe.padEnd(22)} ${DIM}${t.dir}${pkg}${R}`);
  }
  console.log(`
 Options :
   ${BOLD}--clean${R}, ${BOLD}-c${R}   vide entierement le target/ des depots concernes avant de compiler
                ${DIM}(rebuild complet, dependances comprises : plusieurs minutes)${R}
   ${BOLD}--sync${R}, ${BOLD}-s${R}    synchronise seulement public/ et data/ depuis praetorcast-core, sans compiler
   ${BOLD}--help${R}, ${BOLD}-h${R}    cette aide

 Sans argument, les ${TARGETS.length} cibles sont compilees (${keys}).
 Les .exe sont copies a la racine de PraetorCast. Apres ${BOLD}core${R}, ses ressources suivent :
   public/js                  aligne sur la source
   public/<uploads>, favicons ajoutes s'ils manquent, jamais ecrases
   data/*.json                crees s'ils manquent, jamais ecrases
 Rien n'est supprime, et env.json n'est jamais touche.

 ${DIM}PRAETORCAST_SRC${R} : dossier parent des depots sources (defaut : ${SRC})
`);
}

// ── Arguments ─────────────────────────────────────────────────────────────────
const FLAGS_CLEAN = ['--clean', '-c'];
const FLAGS_SYNC  = ['--sync', '-s'];
const FLAGS_HELP  = ['--help', '-h', '/?'];

function parseFlags(argv) {
  const flags   = argv.filter(a => a.startsWith('-') || a === '/?');
  const unknown = flags.filter(f => ![...FLAGS_CLEAN, ...FLAGS_SYNC, ...FLAGS_HELP].includes(f));

  if (unknown.length > 0) {
    console.error(`${RED}Option inconnue : ${BOLD}${unknown.join(' ')}${R}`);
    console.error(`${DIM}Options valides : --clean, --sync, --help${R}`);
    process.exit(2);
  }
  const opts = {
    help:  flags.some(f => FLAGS_HELP.includes(f)),
    clean: flags.some(f => FLAGS_CLEAN.includes(f)),
    sync:  flags.some(f => FLAGS_SYNC.includes(f)),
    keys:  argv.filter(a => !flags.includes(a)),
  };
  // --sync ne compile rien : des cibles ou --clean a cote n'auraient aucun effet.
  if (opts.sync && (opts.clean || opts.keys.length > 0)) {
    console.error(`${RED}--sync s'utilise seul${R} ${DIM}(la synchro suit deja chaque build de core)${R}`);
    process.exit(2);
  }
  return opts;
}

function selectTargets(argv) {
  if (argv.length === 0) return TARGETS.slice();

  const selected = [];
  for (const arg of argv) {
    const raw = arg.toLowerCase();
    const key = ALIASES[raw] || raw;
    const t   = TARGETS.find(x => x.key === key);

    if (!t) {
      console.error(`${RED}Cible inconnue : ${BOLD}${arg}${R}`);
      console.error(`${DIM}Cibles valides : ${TARGETS.map(x => x.key).join(', ')}${R}`);
      console.error(`${DIM}Aide : node ./compile/build.cjs --help${R}`);
      process.exit(2);
    }
    if (!selected.includes(t)) selected.push(t);
  }
  // On conserve l'ordre de TARGETS : janus et phonos partagent le meme target/,
  // les enchainer evite de reconstruire les dependances communes deux fois.
  return TARGETS.filter(t => selected.includes(t));
}

// ── Pre-vol ───────────────────────────────────────────────────────────────────
function checkCargo() {
  try {
    const out = execFileSync('cargo', ['--version'], { encoding: 'utf8', windowsHide: true });
    console.log(`${DIM}  toolchain : ${out.trim()}${R}`);
  } catch {
    console.error(`${RED}cargo introuvable dans le PATH.${R}`);
    console.error(`${DIM}Installez Rust : https://rustup.rs — puis rouvrez le terminal.${R}`);
    process.exit(2);
  }
}

function checkSources(targets) {
  const missing = targets.filter(t => !fs.existsSync(path.join(srcDir(t), 'Cargo.toml')));
  if (missing.length === 0) return;

  console.error(`${RED}Depot source introuvable :${R}`);
  for (const t of missing) console.error(`  ${t.key.padEnd(7)} -> ${srcDir(t)}`);
  console.error(`${DIM}Si vos depots sont ailleurs : set PRAETORCAST_SRC=<dossier parent>${R}`);
  process.exit(2);
}

// PID du process qui tient l'exe, uniquement pour l'afficher dans le message d'erreur.
function findPid(exe) {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${exe}`, '/NH', '/FO', 'CSV'],
      { encoding: 'utf8', windowsHide: true });
    const m = out.match(/^"[^"]+","(\d+)"/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// Test qui fait autorite : sous Windows l'image d'un process en cours est mappee en
// memoire, l'ouvrir en ecriture echoue en EBUSY/EPERM.
function isLocked(file) {
  if (!fs.existsSync(file)) return false;
  let fd;
  try {
    fd = fs.openSync(file, 'r+');
    return false;
  } catch (err) {
    return err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES';
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ignore */ } }
  }
}

function checkLocks(targets) {
  const locked = targets.filter(t => isLocked(dest(t)));
  if (locked.length === 0) return;

  console.error(`${RED}${BOLD}Executable verrouille — compilation annulee.${R}`);
  for (const t of locked) {
    const pid = findPid(t.exe);
    console.error(`  ${t.exe}${pid ? ` ${DIM}(PID ${pid})${R}` : ''} est en cours d'execution`);
  }
  console.error(`${DIM}Fermez PraetorCast ([q] dans le manager) puis relancez.${R}`);
  process.exit(2);
}

// ── Nettoyage (--clean) ───────────────────────────────────────────────────────
// `cargo clean` vide tout le target/ du depot, dependances comprises. janus et phonos
// partageant le meme workspace, on dedoublonne par dossier et on nettoie tout AVANT la
// premiere compilation : nettoyer phonos apres coup effacerait ce que janus vient de batir.
function cleanAll(targets) {
  const dirs = [...new Set(targets.map(srcDir))];
  console.log(`\n${YELLOW}${BOLD}Nettoyage${R} ${DIM}${dirs.length} depot(s) — cargo clean${R}`);

  for (const dir of dirs) {
    const started = Date.now();
    try {
      execFileSync('cargo', ['clean'], { cwd: dir, stdio: 'pipe', windowsHide: true });
      console.log(`  ${GREEN}vide${R}   ${DIM}${path.join(dir, 'target')} (${fmtDur(Date.now() - started)})${R}`);
    } catch (err) {
      console.error(`  ${RED}echec du nettoyage de ${dir} : ${err.message}${R}`);
      console.error(`${DIM}Un fichier du target/ est peut-etre ouvert ailleurs (IDE, rust-analyzer).${R}`);
      process.exit(2);
    }
  }
}

// ── Compilation ───────────────────────────────────────────────────────────────
function build(target, color, position) {
  return new Promise((resolve) => {
    const args = ['build', '--release', '--color', 'always'];
    if (target.pkg) args.push('-p', target.pkg);

    const started = Date.now();
    const tail    = [];
    const prefix  = `${color}${target.key.padEnd(7)}${R} ${DIM}|${R} `;

    console.log(`\n${color}${BOLD}${position} ${target.name}${R} ${DIM}${srcDir(target)}${R}`);
    console.log(`${DIM}  cargo ${args.join(' ')}${R}`);

    // shell:false : le chemin "janus core" contient un espace, passer par cmd
    // obligerait a le quoter a la main (meme piege que dans start/manager.cjs).
    const proc = spawn('cargo', args, { cwd: srcDir(target), shell: false, windowsHide: true });

    const relay = (data) => {
      for (const line of data.toString().split('\n')) {
        const text = line.replace(/\r$/, '');
        if (!text.trim()) continue;
        tail.push(text);
        if (tail.length > MAX_TAIL) tail.shift();
        console.log(prefix + text);
      }
    };
    proc.stdout?.on('data', relay);
    proc.stderr?.on('data', relay);

    proc.on('error', (err) => {
      resolve({ ok: false, ms: Date.now() - started, reason: `spawn : ${err.message}`, tail });
    });

    proc.on('close', (code) => {
      const ms = Date.now() - started;
      if (code === 0) resolve({ ok: true, ms, tail });
      else            resolve({ ok: false, ms, reason: `cargo a echoue (code ${code})`, tail });
    });
  });
}

// ── Copie ─────────────────────────────────────────────────────────────────────
function deploy(target) {
  const src = artifact(target);
  if (!fs.existsSync(src)) {
    return { ok: false, reason: `artefact introuvable : ${src}` };
  }
  try {
    fs.copyFileSync(src, dest(target));
    return { ok: true, size: fs.statSync(dest(target)).size };
  } catch (err) {
    // Un process a pu demarrer entre le pre-vol et maintenant.
    if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
      const pid = findPid(target.exe);
      return { ok: false, reason: `${target.exe} verrouille${pid ? ` (PID ${pid})` : ''}` };
    }
    return { ok: false, reason: `copie impossible : ${err.message}` };
  }
}

// ── Synchro des ressources de core ────────────────────────────────────────────
// Copie les fichiers (non recursif) de `from` vers `to`. Un fichier absent est ajoute ;
// un fichier present n'est remplace que si `overwrite` et que son contenu differe --
// comparer les octets evite de reecrire (et de faire apparaitre dans git) un fichier
// deja identique.
function syncDir(from, to, overwrite, filter = () => true) {
  const counts = { added: 0, updated: 0 };
  if (!fs.existsSync(from)) return counts;
  fs.mkdirSync(to, { recursive: true });

  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (!entry.isFile() || !filter(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);

    if (!fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
      counts.added++;
    } else if (overwrite && !fs.readFileSync(src).equals(fs.readFileSync(dst))) {
      fs.copyFileSync(src, dst);
      counts.updated++;
    }
  }
  return counts;
}

function syncCore() {
  const core = TARGETS.find(t => t.key === 'core');
  console.log(`\n${BOLD}Synchro des ressources${R} ${DIM}${srcDir(core)} -> ${ROOT}${R}`);

  try {
    for (const step of SYNC) {
      const { added, updated } = syncDir(
        path.join(srcDir(core), step.from),
        path.join(ROOT, step.from),
        step.overwrite,
        step.filter,
      );
      const parts = [];
      if (added)   parts.push(`${added} ajoute(s)`);
      if (updated) parts.push(`${updated} mis a jour`);
      const label = step.label || step.from;
      console.log(`  ${label.padEnd(20)} ${parts.length ? GREEN + parts.join(', ') + R : DIM + 'a jour' + R}`);
    }
    return { ok: true };
  } catch (err) {
    console.error(`  ${RED}synchro interrompue : ${err.message}${R}`);
    return { ok: false, reason: `synchro public/data : ${err.message}` };
  }
}

// ── Resume ────────────────────────────────────────────────────────────────────
function summary(results) {
  const width = Math.max(...results.map(r => r.target.key.length), 6);

  console.log(`\n${BOLD}Resume${R}`);
  console.log(`${DIM}${'─'.repeat(width + 40)}${R}`);

  for (const { target, status, ms, size, reason } of results) {
    const label = target.key.padEnd(width);
    const dur   = ms !== undefined ? fmtDur(ms).padStart(7) : '      -';
    const info  = size !== undefined ? fmtSize(size).padStart(9) : '        -';

    if (status === 'ok') {
      console.log(`  ${GREEN}OK    ${R} ${label} ${DIM}${dur}${R} ${info}  ${DIM}-> ${target.exe}${R}`);
    } else {
      const tag = status === 'failed' ? `${RED}ECHEC ${R}` : `${YELLOW}COPIE ${R}`;
      console.log(`  ${tag} ${label} ${DIM}${dur}${R} ${info}  ${RED}${reason}${R}`);
    }
  }
  console.log(`${DIM}${'─'.repeat(width + 40)}${R}`);

  // Sur un build multi-cibles, la vraie erreur a pu defiler loin au-dessus : on la rappelle ici.
  for (const { target, status, tail } of results) {
    if (status === 'ok' || !tail || tail.length === 0) continue;
    console.log(`\n${RED}${BOLD}${target.name}${R} ${DIM}— ${tail.length} dernieres lignes :${R}`);
    for (const line of tail) console.log(`  ${line}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseFlags(process.argv.slice(2));

  if (opts.help) {
    usage();
    process.exit(0);
  }

  if (opts.sync) {
    checkSources(TARGETS.filter(t => t.key === 'core'));
    const synced = syncCore();
    console.log(synced.ok ? `\n${GREEN}Ressources a jour.${R}\n` : `\n${RED}${synced.reason}${R}\n`);
    process.exit(synced.ok ? 0 : 1);
  }

  const targets = selectTargets(opts.keys);

  console.log(`\n${BOLD}PraetorCast${R} — compilation de ${targets.length} cible(s) : ${targets.map(t => t.key).join(', ')}${opts.clean ? ` ${YELLOW}[--clean]${R}` : ''}`);
  checkCargo();
  checkSources(targets);
  checkLocks(targets);
  if (opts.clean) cleanAll(targets);

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    const color  = TARGET_COLORS[i % TARGET_COLORS.length];
    const built  = await build(target, color, `[${i + 1}/${targets.length}]`);

    if (!built.ok) {
      // Un echec sur une cible ne doit pas empecher de deployer les autres.
      console.log(`${RED}  ${target.name} : ${built.reason}${R}`);
      results.push({ target, status: 'failed', ms: built.ms, reason: built.reason, tail: built.tail });
      continue;
    }

    const copied = deploy(target);
    if (copied.ok) {
      console.log(`${GREEN}  ${target.exe} deploye${R} ${DIM}(${fmtSize(copied.size)}, ${fmtDur(built.ms)})${R}`);
      // Un exe de core sans ses ressources a jour, c'est des overlays en 404.
      const synced = target.key === 'core' ? syncCore() : { ok: true };
      if (synced.ok) {
        results.push({ target, status: 'ok', ms: built.ms, size: copied.size });
      } else {
        results.push({ target, status: 'not-deployed', ms: built.ms, size: copied.size, reason: synced.reason });
      }
    } else {
      console.log(`${RED}  ${copied.reason}${R}`);
      results.push({ target, status: 'not-deployed', ms: built.ms, reason: copied.reason });
    }
  }

  summary(results);

  const failed = results.filter(r => r.status !== 'ok');
  if (failed.length > 0) {
    console.log(`${RED}${failed.length} cible(s) en echec.${R}\n`);
    process.exit(1);
  }
  console.log(`${GREEN}Tout est a jour.${R}\n`);
}

main().catch((err) => {
  console.error(`${RED}Erreur inattendue : ${err.stack || err.message}${R}`);
  process.exit(1);
});
