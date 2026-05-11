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
const CLR_EOL  = esc('0K'); // efface du curseur à la fin de ligne
const CUR_HIDE = esc('?25l');
const CUR_SHOW = esc('?25h');

// ── Config ────────────────────────────────────────────────────────────────────
const MAX_RESTARTS  = 5;
const BASE_DELAY_MS = 3000;
const MAX_LOG_BUF   = 500;
const BOX_INNER     = 26;
const BOX_WIDTH     = BOX_INNER + 2;

const SERVICES = [
  { name: 'Core',    cmd: 'praetorcast-core.exe', args: [],                                startDelay: 0    },
  { name: 'Janus',   cmd: 'JanusCore.exe',         args: [],                                startDelay: 500  },
  { name: 'Phonos',  cmd: 'PhonosCore.exe',         args: [],                                startDelay: 2000 },
  { name: 'Line',    cmd: 'line.exe',               args: [],                                startDelay: 1000 },
  { name: 'YT-Chat', cmd: 'node',                   args: ['./ws/ws_chat_youtube.cjs'],     startDelay: 1500 },
  { name: 'Discord', cmd: 'node',                   args: ['./ws/ws_discord_presence.js'],  startDelay: 1500 },
];

const N = SERVICES.length;

// ── Layout (lignes) ──────────────────────────────────────────────────────────
// Rows 1..N+2     : panneau statut (box droite + titre gauche + séparateur)
// Row  N+3        : en-têtes colonnes
// Row  N+4        : séparateur colonnes  (─┼─)
// Rows N+5..H     : logs en colonnes
const PANEL_ROWS    = N + 3;   // 1 titre + N services + 1 bordure basse + 1 séparateur
const COL_HDR_ROW   = PANEL_ROWS + 1;
const COL_SEP_ROW   = PANEL_ROWS + 2;
const LOG_START_ROW = PANEL_ROWS + 3;

// ── État ──────────────────────────────────────────────────────────────────────
const state = new Map(
  SERVICES.map((s, i) => [s.name, {
    proc: null, restarts: 0, status: 'pending',
    color: SERVICE_COLORS[i],
    logs: [],   // { ts: 'HH:MM', text: string, isError: bool }
  }])
);

let shuttingDown  = false;
let redrawPending = false;

// ── Terminal ──────────────────────────────────────────────────────────────────
function W() { return process.stdout.columns || 120; }
function H() { return process.stdout.rows    || 30;  }

// ── Géométrie des colonnes ────────────────────────────────────────────────────
function colW(i) {
  const base = Math.floor(W() / N);
  return i === N - 1 ? W() - base * (N - 1) : base;
}
function colX(i) { return Math.floor(W() / N) * i + 1; }
function logRows() { return Math.max(0, H() - LOG_START_ROW + 1); }

// ── Helpers texte ─────────────────────────────────────────────────────────────
function stripAnsi(s) { return s.replace(/\x1b\[[0-9;]*m/g, ''); }

function sanitize(s) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/\w[\w-]*="[^"]*"/g, '')
    .replace(/\/>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

// Centre une chaîne (avec ANSI) dans `len` colonnes visibles
function center(styledText, len) {
  const vis  = stripAnsi(styledText).length;
  const pad  = Math.max(0, len - vis);
  return ' '.repeat(Math.floor(pad / 2)) + styledText + ' '.repeat(Math.ceil(pad / 2));
}

// Écrit exactement `len` caractères visibles (tronque et padde)
function fixed(styledText, len) {
  const vis = stripAnsi(styledText);
  if (vis.length > len) return vis.slice(0, len);          // tronque (perte ANSI intentionnelle)
  return styledText + ' '.repeat(len - vis.length);
}

// ── Dessin du panneau statut (haut droite) ────────────────────────────────────
function drawPanel() {
  const w      = W();
  const boxCol = Math.max(1, w - BOX_WIDTH + 1);

  // Ligne 1 : titre gauche + bordure haute box droite
  process.stdout.write(
    at(1, 1) + esc('2K') +
    ` ${BOLD}PraetorCast${R}  ${DIM}[q] quitter${R}` +
    at(1, boxCol) + DIM + '┌' + '─'.repeat(BOX_INNER) + '┐' + R
  );

  // Lignes 2..N+1 : une ligne par service dans la box
  let row = 2;
  for (const [name, entry] of state) {
    const dot =
      entry.status === 'running'                            ? `${GREEN}●${R}` :
      entry.status === 'failed' || entry.status === 'error' ? `${RED}●${R}`   :
                                                              `${YELLOW}○${R}`;
    const statusColor =
      entry.status === 'running'                            ? GREEN  :
      entry.status === 'failed' || entry.status === 'error' ? RED    : YELLOW;
    const rstVis  = entry.restarts > 0 ? `↺${entry.restarts}` : '';
    const rstStyled = entry.restarts > 0 ? `${RED}↺${entry.restarts}${R}` : '';

    const visible = ` ● ${name.padEnd(7)}  ${entry.status.padEnd(7)} ${rstVis} `;
    const pad     = ' '.repeat(Math.max(0, BOX_INNER - visible.length));
    const styled  =
      ` ${dot} ${entry.color}${BOLD}${name.padEnd(7)}${R}  ` +
      `${statusColor}${entry.status.padEnd(7)}${R} ${rstStyled}` + pad;

    process.stdout.write(at(row, boxCol) + DIM + '│' + R + styled + DIM + '│' + R);
    row++;
  }

  // Bordure basse + séparateur pleine largeur
  process.stdout.write(at(row,     boxCol) + DIM + '└' + '─'.repeat(BOX_INNER) + '┘' + R);
  process.stdout.write(at(row + 1, 1)      + DIM + '─'.repeat(w)               + R);
}

// ── Dessin des en-têtes de colonnes ───────────────────────────────────────────
function drawColHeaders() {
  let header = '';
  let sep    = '';

  for (let i = 0; i < N; i++) {
    const entry   = state.get(SERVICES[i].name);
    const cw      = colW(i);
    const isLast  = i === N - 1;
    const inner   = isLast ? cw : cw - 1;

    const nameStyled = `${entry.color}${BOLD}${SERVICES[i].name}${R}`;
    header += center(nameStyled, inner) + (isLast ? '' : DIM + '│' + R);
    sep    += DIM + '─'.repeat(inner) + (isLast ? '' : '┼') + R;
  }

  process.stdout.write(at(COL_HDR_ROW, 1) + esc('2K') + header);
  process.stdout.write(at(COL_SEP_ROW, 1) + esc('2K') + sep);
}

// ── Dessin des colonnes de logs ───────────────────────────────────────────────
function drawLogCols() {
  const rows = logRows();
  if (rows <= 0) return;

  for (let i = 0; i < N; i++) {
    const entry   = state.get(SERVICES[i].name);
    const cw      = colW(i);
    const cx      = colX(i);
    const isLast  = i === N - 1;
    const inner   = isLast ? cw : cw - 1;  // largeur contenu sans séparateur
    const msgW    = Math.max(1, inner - 6); // HH:MM(5) + espace(1)
    const lines   = entry.logs.slice(-rows);

    for (let r = 0; r < rows; r++) {
      const log = lines[r];
      process.stdout.write(at(LOG_START_ROW + r, cx));

      if (log) {
        const msg    = log.text.slice(0, msgW);
        const msgOut = log.isError ? `${RED}${msg}${R}` : msg;
        const visLen = 5 + 1 + msg.length;
        process.stdout.write(
          `${DIM}${log.ts}${R} ${msgOut}` +
          ' '.repeat(Math.max(0, inner - visLen))
        );
      } else {
        process.stdout.write(' '.repeat(inner));
      }

      if (!isLast) process.stdout.write(DIM + '│' + R);
    }
  }
}

// ── Redraw complet ────────────────────────────────────────────────────────────
function refreshAll() {
  drawPanel();
  drawColHeaders();
  drawLogCols();
  process.stdout.write(at(H(), 1)); // gare le curseur en bas
}

function scheduleRedraw() {
  if (redrawPending) return;
  redrawPending = true;
  setTimeout(() => { redrawPending = false; refreshAll(); }, 50);
}

// ── Logging ───────────────────────────────────────────────────────────────────
function writeLog(name, rawText, isError = false) {
  const text  = sanitize(rawText);
  const ts    = new Date().toTimeString().slice(0, 5);
  const entry = state.get(name);
  if (!entry) return;

  entry.logs.push({ ts, text, isError });
  if (entry.logs.length > MAX_LOG_BUF) entry.logs.shift();

  const logFile = path.join(LOGS_DIR, `${name.toLowerCase()}.log`);
  try {
    const full = new Date().toTimeString().slice(0, 8);
    fs.appendFileSync(logFile, `${full} ${text}\n`);
  } catch { /* ignore */ }

  scheduleRedraw();
}

// ── Gestion des services ──────────────────────────────────────────────────────
function exeExists(cmd) {
  if (cmd === 'node') return true;
  return fs.existsSync(path.join(ROOT, cmd));
}

function startService(service, index, restartCount = 0) {
  if (shuttingDown) return;
  const entry = state.get(service.name);

  if (!exeExists(service.cmd)) {
    entry.status = 'missing';
    writeLog(service.name, `Exécutable introuvable : ${service.cmd}`, true);
    return;
  }

  writeLog(service.name,
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

  proc.stdout?.on('data', (data) =>
    data.toString().trimEnd().split('\n').filter(Boolean)
      .forEach(line => writeLog(service.name, line))
  );
  proc.stderr?.on('data', (data) =>
    data.toString().trimEnd().split('\n').filter(Boolean)
      .forEach(line => writeLog(service.name, line, true))
  );

  proc.on('exit', (code, signal) => {
    if (shuttingDown) return;
    entry.status = 'stopped';
    writeLog(service.name, `Arrêté (${signal ?? `code ${code}`})`, true);

    if (restartCount < MAX_RESTARTS) {
      const delay = BASE_DELAY_MS * Math.pow(1.5, restartCount);
      writeLog(service.name, `Redémarrage dans ${(delay / 1000).toFixed(1)}s...`);
      setTimeout(() => startService(service, index, restartCount + 1), delay);
    } else {
      entry.status = 'failed';
      writeLog(service.name, `Abandon après ${MAX_RESTARTS} tentatives.`, true);
    }
  });

  proc.on('error', (err) => {
    entry.status = 'error';
    writeLog(service.name, `Erreur spawn : ${err.message}`, true);
  });
}

// ── Arrêt ─────────────────────────────────────────────────────────────────────
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const [name, entry] of state) {
    writeLog(name, 'Arrêt en cours...', true);
    try { entry.proc?.kill(); } catch { /* ignore */ }
  }
  setTimeout(() => {
    process.stdout.write(esc('r') + CUR_SHOW + esc('2J') + esc('H'));
    process.exit(0);
  }, 1500);
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initTUI() {
  process.stdout.write(CUR_HIDE + esc('2J') + esc('H'));
  refreshAll();
}

process.stdout.on('resize', () => {
  process.stdout.write(esc('2J') + esc('H'));
  refreshAll();
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
setInterval(refreshAll, 2000);
