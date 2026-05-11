/**
 * WebSocket server relaying Discord voice channel participant state to clients.
 * Reads configuration from `env.json`.
 * The HTML page is served by praetorcast-core at /discord-presence.
 */
const RPC = require('discord-rpc');
const { WebSocketServer } = require('ws');
const fs = require('fs');

const env = JSON.parse(fs.readFileSync('./env.json', 'utf-8'));

const CLIENT_ID     = env.DISCORD_CLIENT_ID;
const CLIENT_SECRET = env.DISCORD_CLIENT_SECRET;
const REDIRECT_URI  = 'http://localhost';
const PORT          = env.PORT_WS_DISCORD_PRESENCE;

if (!CLIENT_ID) {
  console.error('\n[ERREUR] Remplis DISCORD_CLIENT_ID dans env.json.\n');
  process.exit(1);
}

RPC.register(CLIENT_ID);
const rpc = new RPC.Client({ transport: 'ipc' });

let currentChannelId = null;
let selfUserId       = null;
const participants   = new Map();
const speaking       = new Set();
let switchQueue      = Promise.resolve();

function avatarUrl(id, hash, discriminator) {
  if (hash) return `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=128`;
  if (!discriminator || discriminator === '0') {
    const index = Number(BigInt(id) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }
  return `https://cdn.discordapp.com/embed/avatars/${parseInt(discriminator) % 5}.png`;
}

function buildPayload() {
  return JSON.stringify({
    type: 'update',
    channelId: currentChannelId,
    participants: Array.from(participants.values())
      .filter(p => p.id !== selfUserId)
      .map(p => ({ ...p, speaking: speaking.has(p.id) })),
  });
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', ws => {
  ws.send(buildPayload());
});

function broadcast() {
  const payload = buildPayload();
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(payload);
  }
}

async function refreshChannel(expectedChannelId) {
  const cid = expectedChannelId || currentChannelId;
  if (!cid || cid !== currentChannelId) return;
  try {
    const channel = await rpc.getChannel(cid);
    if (cid !== currentChannelId) return;
    participants.clear();
    for (const vs of channel.voice_states || []) {
      const u = vs.user;
      participants.set(u.id, {
        id: u.id,
        username: u.username,
        globalName: u.global_name || u.username,
        avatar: u.avatar,
        discriminator: u.discriminator,
        avatarUrl: avatarUrl(u.id, u.avatar, u.discriminator),
        mute: vs.voice_state?.mute || false,
        deaf: vs.voice_state?.deaf || false,
        selfMute: vs.voice_state?.self_mute || false,
        selfDeaf: vs.voice_state?.self_deaf || false,
      });
    }
  } catch (err) {
    console.error('Erreur refresh canal:', err.message);
  }
  broadcast();
}

async function subscribeChannelEvents(channelId) {
  const events = [
    'VOICE_STATE_CREATE', 'VOICE_STATE_UPDATE', 'VOICE_STATE_DELETE',
    'SPEAKING_START', 'SPEAKING_STOP',
  ];
  for (const evt of events) {
    try {
      await rpc.request('SUBSCRIBE', { channel_id: channelId }, evt);
      console.log(`[subscribe] ${evt} ✓`);
    } catch (err) {
      console.log(`[subscribe] ${evt} ✗ ${err.message}`);
    }
  }
}

async function setChannel(channelId) {
  currentChannelId = channelId || null;
  participants.clear();
  speaking.clear();
  broadcast();

  if (!currentChannelId) return;

  await subscribeChannelEvents(currentChannelId);
  await refreshChannel(currentChannelId);
}

function queueChannelSwitch(channelId) {
  switchQueue = switchQueue
    .then(() => setChannel(channelId))
    .catch(err => console.error('Erreur changement de canal:', err.message));
}

async function pollChannel() {
  try {
    const sel = await rpc.request('GET_SELECTED_VOICE_CHANNEL');
    const newId = sel?.id || null;
    if (newId !== currentChannelId) {
      console.log(`[Poll] ${currentChannelId ?? 'aucun'} → ${newId ?? 'aucun'}`);
      queueChannelSwitch(newId);
    }
  } catch {}
}

rpc.on('ready', async () => {
  selfUserId = rpc.user.id;
  console.log(`Connecté à Discord en tant que ${rpc.user.username}`);

  for (const evt of ['VOICE_STATE_CREATE', 'VOICE_STATE_UPDATE', 'VOICE_STATE_DELETE']) {
    rpc.on(evt, () => {
      if (currentChannelId) refreshChannel(currentChannelId);
    });
  }

  rpc.on('SPEAKING_START', (data) => {
    const userId = String(data?.user_id ?? data?.userId ?? '');
    if (userId && currentChannelId) {
      speaking.add(userId);
      broadcast();
    }
  });

  rpc.on('SPEAKING_STOP', (data) => {
    const userId = String(data?.user_id ?? data?.userId ?? '');
    if (userId && currentChannelId) {
      speaking.delete(userId);
      broadcast();
    }
  });

  await pollChannel();

  try {
    await rpc.subscribe('VOICE_CHANNEL_SELECT', ({ channel_id }) => {
      const newId = channel_id || null;
      if (newId !== currentChannelId) {
        console.log(`[Event] → ${newId ?? 'aucun'}`);
        queueChannelSwitch(newId);
      }
    });
  } catch {
    console.warn('VOICE_CHANNEL_SELECT indisponible, le poll seul sera utilisé.');
  }

  setInterval(pollChannel, 2000);
});

console.log(`WebSocket Discord Presence démarré sur ws://localhost:${PORT}`);

rpc.login({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  scopes: ['rpc', 'rpc.voice.read'],
  redirectUri: REDIRECT_URI,
}).catch(err => {
  console.error('Impossible de se connecter à Discord :', err.message);
  console.error('Assure-toi que Discord est ouvert et que DISCORD_CLIENT_ID/SECRET sont dans env.json.');
  process.exit(1);
});
