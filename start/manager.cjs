'use strict';

const { spawn } = require('child_process');
const path = require('path');
const fs   = require('fs');

const ROOT     = path.resolve(__dirname, '..');
const LOGS_DIR = path.join(ROOT, 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

// ── ANSI ─────────────────────────────────────────────────────────────────────
const R      = '\x1b[0m';
const BOLD   = '\x1b[1m';
const DIM    = '\x1b[2m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';

const SERVICE_COLORS = ['\x1b[96m', '\x1b[93m', '\x1b[95m', '\x1b[94m', '\x1b[92m', '\x1b[91m'];

function esc(s)   { return `\x1b[${s}`; }
function at(r, c) { return esc(`${r};${c}H`); }

const CUR_SAVE    = '\x1b[s';
const CUR_RESTORE = '\x1b[u';
const CUR_HIDE    = esc('?25l');
const CUR_SHOW    = esc('?25h');
const CLR_LINE    = esc('2K');

// ── Layout ────────────────────────────────────────────────────────────────────
// Box flottante en haut à droite :
//   Row 1       : title (gauche)  +  ┌──────────┐ (droite)
//   Rows 2..N+1 : vide (gauche)   +  │ service  │ (droite)
//   Row N+2     : vide (gauche)   +  └──────────┘ (droite)
//   Row N+3     : séparateur pleine largeur
//   Row N+4...  : zone de scroll (logs)
const BOX_INNER  = 26;                     // largeur intérieure de la box
const BOX_WIDTH  = BOX_INNER + 2;          // avec les bordures │
const PANEL_ROWS = SERVICES_LENGTH() + 3;  // top + services + bottom + separator

function SERVICES_LENGTH() { return 6; }   // nb de services (doit rester sync avec SERVICES)

// ── Config ────────────────────────────────────────────────────────────────────
const MAX_RESTARTS  = 5;
const BASE_DELAY_MS = 3000;

const SERVICES = [
  { name: 'Core',    cmd: 'praetorcast-core.exe', args: [],                                startDelay: 0    },
  { name: 'Janus',   cmd: 'JanusCore.exe',         args: [],                                startDelay: 500  },
  { name: 'Phonos',  cmd: 'PhonosCore.exe',         args: [],                                startDelay: 2000 },
  { name: 'Line',    cmd: 'line.exe',               args: [],                                startDelay: 1000 },
  { name: 'YT-Chat', cmd: 'node',                   args: ['./ws/ws_chat_youtube.cjs'],     startDelay: 1500 },
  { name: 'Discord', cmd: 'node',                   args: ['./ws/ws_discord_presence.js'],  startDelay: 1500 },
];

// PANEL_ROWS calculé dynamiquement (top border + services + bottom border + separator)
const PANEL_ROWS_ACTUAL = SERVICES.length + 3;

const state = new Map(
  SERVICES.map((s, i) => [s.name, { proc: null, restarts: 0, status: 'pending', color: SERVICE_COLORS[i] }])
);
let shuttingDown = false;

// ── Terminal ──────────────────────────────────────────────────────────────────
function W() { return process.stdout.columns || 100; }
function H() { return process.stdout.rows    || 30;  }

// ── Helpers ───────────────────────────────────────────────────────────────────
function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

// Supprime le HTML brut (balises, attributs orphelins, entités) des logs YT-Chat
function sanitize(s) {
  return s
    .replace(/<[^>]*>/g, '')           // balises complètes
    .replace(/\w[\w-]*="[^"]*"/g, '')  // attributs orphelins  key="value"
    .replace(/\/>/g, '')               // /> orphelins
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function truncate(s, maxLen) {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + '…' : s;
}

// ── Box de statut (haut droite) ───────────────────────────────────────────────
function drawPanel() {
  const w      = W();
  const boxCol = Math.max(1, w - BOX_WIDTH + 1);

  // Ligne 1 : titre à gauche + bordure haute de la box à droite
  process.stdout.write(
    at(1, 1)    + CLR_LINE +
    ` ${BOLD}PraetorCast${R}  ${DIM}[q] quitter${R}` +
    at(1, boxCol) + DIM + '┌' + '─'.repeat(BOX_INNER) + '┐' + R
  );

  // Lignes 2 … (1 + nb services) : une ligne par service
  let row = 2;
  for (const [name, entry] of state) {
    const dot =
      entry.status === 'running'                            ? `${GREEN}●${R}` :
      entry.status === 'failed' || entry.status === 'error' ? `${RED}●${R}`   :
                                                              `${YELLOW}○${R}`;
    const statusColor =
      entry.status === 'running'                            ? GREEN  :
      entry.status === 'failed' || entry.status === 'error' ? RED    : YELLOW;

    const nameP   = name.padEnd(7);
    const statusP = entry.status.padEnd(7);

    // Longueur visible de la ligne intérieure
    const visible = ` ● ${nameP}  ${statusP}`;
    const pad     = ' '.repeat(Math.max(0, BOX_INNER - visible.length));

    const styled =
      ` ${dot} ${entry.color}${BOLD}${nameP}${R}  ` +
      `${statusColor}${statusP}${R} ` +
       pad;

    // On n'écrit que la partie droite (box) — la partie gauche reste vide/logs
    process.stdout.write(at(row, boxCol) + DIM + '│' + R + styled + DIM + '│' + R);
    row++;
  }

  // Bordure basse de la box
  process.stdout.write(at(row, boxCol) + DIM + '└' + '─'.repeat(BOX_INNER) + '┘' + R);

  // Séparateur pleine largeur sous la box
  process.stdout.write(at(row + 1, 1) + DIM + '─'.repeat(w) + R);
}

function refreshPanel() {
  process.stdout.write(CUR_SAVE);
  drawPanel();
  process.stdout.write(CUR_RESTORE);
}

// ── Logging ───────────────────────────────────────────────────────────────────
function writeLog(name, color, rawText, isError = false) {
  const text   = truncate(sanitize(rawText), W() - 22);
  const ts     = new Date().toTimeString().slice(0, 8);
  const h      = H();
  const prefix = `${DIM}${ts}${R} ${color}${BOLD}[${name.padEnd(9)}]${R} `;
  const styled  = isError ? `${RED}${text}${R}` : text;

  // Scroll la région d'un cran vers le haut, écrit en bas
  process.stdout.write(
    CUR_SAVE +
    at(h, 1) + '\n' +
    at(h, 1) + CLR_LINE +
    prefix + styled +
    CUR_RESTORE
  );

  // Fichier de log individuel (texte brut)
  const logFile = path.join(LOGS_DIR, `${name.toLowerCase()}.log`);
  try { fs.appendFileSync(logFile, `${ts} [${name.padEnd(9)}] ${stripAnsi(text)}\n`); }
  catch { /* ignore */ }
}

// ── Gestion des services ──────────────────────────────────────────────────────
function exeExists(cmd) {
  if (cmd === 'node') return true;
  return fs.existsSync(path.join(ROOT, cmd));
}

function startService(service, index, restartCount = 0) {
  if (shuttingDown) return;
  const color = SERVICE_COLORS[index];
  const entry = state.get(service.name);

  if (!exeExists(service.cmd)) {
    entry.status = 'missing';
    writeLog(service.name, color, `Exécutable introuvable : ${service.cmd}`, true);
    refreshPanel();
    return;
  }

  writeLog(service.name, color,
    restartCount === 0
      ? `Démarrage → ${[service.cmd, ...service.args].join(' ')}`
      : `Redémarrage #${restartCount}...`
  );

  const proc = spawn(service.cmd, service.args, {
    cwd: ROOT, shell: false, windowsHide: true,
  });

  entry.proc     = proc;
  entry.status   = 'running';
  entry.restarts = restartCount;
  refreshPanel();

  proc.stdout?.on('data', (data) =>
    data.toString().trimEnd().split('\n').filter(Boolean)
      .forEach(line => writeLog(service.name, color, line))
  );
  proc.stderr?.on('data', (data) =>
    data.toString().trimEnd().split('\n').filter(Boolean)
      .forEach(line => writeLog(service.name, color, line, true))
  );

  proc.on('exit', (code, signal) => {
    if (shuttingDown) return;
    entry.status = 'stopped';
    writeLog(service.name, color, `Arrêté (${signal ?? `code ${code}`})`, true);
    refreshPanel();

    if (restartCount < MAX_RESTARTS) {
      const delay = BASE_DELAY_MS * Math.pow(1.5, restartCount);
      writeLog(service.name, color, `Redémarrage dans ${(delay / 1000).toFixed(1)}s...`);
      setTimeout(() => startService(service, index, restartCount + 1), delay);
    } else {
      entry.status = 'failed';
      writeLog(service.name, color, `Abandon après ${MAX_RESTARTS} tentatives.`, true);
      refreshPanel();
    }
  });

  proc.on('error', (err) => {
    entry.status = 'error';
    writeLog(service.name, color, `Erreur spawn : ${err.message}`, true);
    refreshPanel();
  });
}

// ── Arrêt ─────────────────────────────────────────────────────────────────────
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  writeLog('Manager', YELLOW, 'Arrêt de tous les services...');
  for (const [, e] of state) { try { e.proc?.kill(); } catch { /* ignore */ } }
  setTimeout(() => { process.stdout.write(esc('r') + CUR_SHOW + '\n'); process.exit(0); }, 1500);
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initTUI() {
  process.stdout.write(CUR_HIDE + esc('2J') + esc('H'));
  drawPanel();
  process.stdout.write(esc(`${PANEL_ROWS_ACTUAL + 1};${H()}r`)); // zone de scroll
  process.stdout.write(at(H(), 1));                               // curseur en bas
}

process.stdout.on('resize', () => {
  process.stdout.write(esc('2J') + esc('H') + esc(`${PANEL_ROWS_ACTUAL + 1};${H()}r`) + at(H(), 1));
  refreshPanel();
});

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (key) => {
    if (key === 'q' || key === '') shutdown();
  });
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

initTUI();
SERVICES.forEach((svc, i) => setTimeout(() => startService(svc, i), svc.startDelay));
setInterval(refreshPanel, 2000);
