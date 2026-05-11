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

// ── Layout ────────────────────────────────────────────────────────────────────
const PANEL_ROWS    = N + 3;
const COL_HDR_ROW   = PANEL_ROWS + 1;
const COL_SEP_ROW   = PANEL_ROWS + 2;
const LOG_START_ROW = PANEL_ROWS + 3;

// ── État ──────────────────────────────────────────────────────────────────────
const state = new Map(
  SERVICES.map((s, i) => [s.name, {
    proc:         null,
    restarts:     0,
    status:       'pending',  // pending | running | stopped | failed | error | missing | off
    manualOff:    false,      // true = arrêté volontairement, pas d'auto-restart
    restartTimer: null,       // setTimeout en attente de redémarrage
    color:        SERVICE_COLORS[i],
    logs:         [],
  }])
);

let shuttingDown  = false;
let redrawPending = false;
let autoRestart   = false; // désactivé par défaut

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

// ── Helpers ───────────────────────────────────────────────────────────────────
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

function center(styledText, len) {
  const vis = stripAnsi(styledText).length;
  const pad = Math.max(0, len - vis);
  return ' '.repeat(Math.floor(pad / 2)) + styledText + ' '.repeat(Math.ceil(pad / 2));
}

// ── Dot et couleur selon le statut ────────────────────────────────────────────
function statusDot(entry) {
  if (entry.status === 'running')                             return `${GREEN}●${R}`;
  if (entry.status === 'off')                                 return `${DIM}●${R}`;
  if (entry.status === 'failed' || entry.status === 'error')  return `${RED}●${R}`;
  return `${YELLOW}○${R}`;
}

function statusColor(entry) {
  if (entry.status === 'running')                             return GREEN;
  if (entry.status === 'off')                                 return DIM;
  if (entry.status === 'failed' || entry.status === 'error')  return RED;
  return YELLOW;
}

// ── Panneau statut (haut droite) ──────────────────────────────────────────────
function drawPanel() {
  const w      = W();
  const boxCol = Math.max(1, w - BOX_WIDTH + 1);

  // Ligne 1 : titre + raccourcis
  process.stdout.write(
    at(1, 1) + esc('2K') +
    ` ${BOLD}PraetorCast${R}  ${DIM}[q] quitter  [1-6] on/off  [r] ↺ ${R}` +
    (autoRestart ? `${GREEN}${BOLD}ON ${R}` : `${RED}${BOLD}OFF${R}`) +
    at(1, boxCol) + DIM + '┌' + '─'.repeat(BOX_INNER) + '┐' + R
  );

  // Lignes 2..N+1 : services
  let row = 2;
  let idx = 1;
  for (const [name, entry] of state) {
    const dot     = statusDot(entry);
    const sColor  = statusColor(entry);
    const rstVis  = entry.restarts > 0 ? `↺${entry.restarts}` : '';
    const rstSty  = entry.restarts > 0 ? `${RED}↺${entry.restarts}${R}` : '';

    // Visible : `[N] ● Name    status  ↺X`
    const visRaw = `[${idx}] ● ${name.padEnd(7)} ${entry.status.padEnd(7)} ${rstVis}`;
    const pad    = ' '.repeat(Math.max(0, BOX_INNER - visRaw.length));

    const styled =
      `${DIM}[${idx}]${R} ${dot} ${entry.color}${BOLD}${name.padEnd(7)}${R} ` +
      `${sColor}${entry.status.padEnd(7)}${R} ${rstSty}` + pad;

    process.stdout.write(at(row, boxCol) + DIM + '│' + R + styled + DIM + '│' + R);
    row++;
    idx++;
  }

  process.stdout.write(at(row,     boxCol) + DIM + '└' + '─'.repeat(BOX_INNER) + '┘' + R);
  process.stdout.write(at(row + 1, 1)      + DIM + '─'.repeat(w)               + R);
}

// ── En-têtes des colonnes ─────────────────────────────────────────────────────
function drawColHeaders() {
  let header = '';
  let sep    = '';

  for (let i = 0; i < N; i++) {
    const entry  = state.get(SERVICES[i].name);
    const cw     = colW(i);
    const isLast = i === N - 1;
    const inner  = isLast ? cw : cw - 1;

    const label = `${DIM}[${i + 1}]${R} ${entry.color}${BOLD}${SERVICES[i].name}${R}`;
    header += center(label, inner) + (isLast ? '' : DIM + '│' + R);
    sep    += DIM + '─'.repeat(inner) + (isLast ? '' : '┼') + R;
  }

  process.stdout.write(at(COL_HDR_ROW, 1) + esc('2K') + header);
  process.stdout.write(at(COL_SEP_ROW, 1) + esc('2K') + sep);
}

// ── Colonnes de logs ──────────────────────────────────────────────────────────
function drawLogCols() {
  const rows = logRows();
  if (rows <= 0) return;

  for (let i = 0; i < N; i++) {
    const entry  = state.get(SERVICES[i].name);
    const cw     = colW(i);
    const cx     = colX(i);
    const isLast = i === N - 1;
    const inner  = isLast ? cw : cw - 1;
    const msgW   = Math.max(1, inner - 6);
    const lines  = entry.logs.slice(-rows);

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

// ── Redraw ────────────────────────────────────────────────────────────────────
function refreshAll() {
  drawPanel();
  drawColHeaders();
  drawLogCols();
  process.stdout.write(at(H(), 1));
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
  try { fs.appendFileSync(logFile, `${new Date().toTimeString().slice(0, 8)} ${text}\n`); }
  catch { /* ignore */ }

  scheduleRedraw();
}

// ── Start / Stop manuel ───────────────────────────────────────────────────────
function stopService(index) {
  const svc   = SERVICES[index];
  const entry = state.get(svc.name);

  // Annule le redémarrage automatique en attente
  if (entry.restartTimer) {
    clearTimeout(entry.restartTimer);
    entry.restartTimer = null;
  }

  entry.manualOff = true;
  entry.status    = 'off';
  entry.restarts  = 0;

  if (entry.proc) {
    try { entry.proc.kill(); } catch { /* ignore */ }
  }

  writeLog(svc.name, 'Arrêté manuellement.');
}

function startManual(index) {
  const svc   = SERVICES[index];
  const entry = state.get(svc.name);

  if (entry.status === 'running') return; // déjà actif

  entry.manualOff = false;
  entry.restarts  = 0;
  startService(svc, index, 0);
}

function toggleService(index) {
  const entry = state.get(SERVICES[index].name);
  if (entry.status === 'running') stopService(index);
  else                            startManual(index);
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
    if (shuttingDown)    return;
    if (entry.manualOff) return; // arrêt volontaire → pas d'auto-restart

    entry.status = 'stopped';
    writeLog(service.name, `Arrêté (${signal ?? `code ${code}`})`, true);

    if (autoRestart && restartCount < MAX_RESTARTS) {
      const delay = BASE_DELAY_MS * Math.pow(1.5, restartCount);
      writeLog(service.name, `Redémarrage dans ${(delay / 1000).toFixed(1)}s...`);
      entry.restartTimer = setTimeout(() => {
        entry.restartTimer = null;
        startService(service, index, restartCount + 1);
      }, delay);
    } else if (autoRestart) {
      entry.status = 'failed';
      writeLog(service.name, `Abandon après ${MAX_RESTARTS} tentatives.`, true);
    } else {
      writeLog(service.name, `Auto-restart OFF — appuyez sur [${index + 1}] pour relancer.`);
    }
  });

  proc.on('error', (err) => {
    entry.status = 'error';
    writeLog(service.name, `Erreur spawn : ${err.message}`, true);
  });
}

// ── Arrêt global ──────────────────────────────────────────────────────────────
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const [name, entry] of state) {
    writeLog(name, 'Arrêt en cours...', true);
    if (entry.restartTimer) clearTimeout(entry.restartTimer);
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
    if (key === 'q' || key === '') { shutdown(); return; }

    // r : toggle auto-restart global
    if (key === 'r') { autoRestart = !autoRestart; refreshAll(); return; }

    // 1–6 : toggle start/stop d'un service
    const num = parseInt(key, 10);
    if (num >= 1 && num <= N) toggleService(num - 1);
  });
}

process.on('SIGINT',  shutdown);
process.on('SIGTERM', shutdown);

initTUI();
SERVICES.forEach((svc, i) => setTimeout(() => startService(svc, i), svc.startDelay));
setInterval(refreshAll, 2000);
