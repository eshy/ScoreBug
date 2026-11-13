import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { isSea } from 'node:sea';
import { defaultState, reduce, msUntilExpiry, STATE_VERSION } from './state.js';

// Packaged as a single executable (see scripts/build-release.mjs), the
// public/, shared/ and graphics/ folders sit next to the executable.
const packaged = isSea();
const root = packaged
  ? path.dirname(process.execPath)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = process.env.SCOREBUG_DATA || path.join(root, 'data');
const uploadDir = path.join(dataDir, 'uploads');
const stateFile = path.join(dataDir, 'state.json');
const graphicsDir = path.join(root, 'graphics');
const PORT = Number(process.env.PORT) || 4747;
const HOST = process.argv.includes('--lan') ? '0.0.0.0' : '127.0.0.1';

fs.mkdirSync(uploadDir, { recursive: true });

// ---- state -----------------------------------------------------------------

function loadState() {
  try {
    const saved = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    // Defaults fill in anything a state saved by an older build does not have.
    if (saved.version === STATE_VERSION) return reduce({ ...defaultState(), ...saved }, { type: 'tick' });
  } catch {
    // no saved state yet, or unreadable: start fresh
  }
  return defaultState();
}

let state = loadState();
let saveTimer = null;
let expiryTimer = null;

function dispatch(cmd) {
  const next = reduce(state, cmd);
  if (next === state) return;
  state = next;
  broadcast();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => fs.writeFile(stateFile, JSON.stringify(state), () => {}), 250);
  scheduleExpiry();
}

function scheduleExpiry() {
  clearTimeout(expiryTimer);
  const ms = msUntilExpiry(state, Date.now());
  if (ms !== null) expiryTimer = setTimeout(() => dispatch({ type: 'tick' }), ms + 5);
}

// ---- http ------------------------------------------------------------------

const app = express();
const noCache = { etag: true, maxAge: 0 };

app.get('/', (req, res) => res.redirect('/control/'));
app.use('/control', express.static(path.join(root, 'public/control'), noCache));
app.use('/render', express.static(path.join(root, 'public/render'), noCache));
app.use('/icons', express.static(path.join(root, 'public/icons'), noCache));
app.use('/shared', express.static(path.join(root, 'shared'), noCache));
app.use('/graphics', express.static(graphicsDir, noCache));
app.use('/uploads', express.static(uploadDir));

// Every folder in graphics/ holding a *.ograf.json manifest is an OGraf package.
app.get('/api/graphics', (req, res) => {
  const list = [];
  for (const dir of fs.readdirSync(graphicsDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = fs.readdirSync(path.join(graphicsDir, dir.name)).find((f) => f.endsWith('.ograf.json'));
    if (!file) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(graphicsDir, dir.name, file), 'utf8'));
      list.push({
        id: manifest.id,
        name: manifest.name,
        description: manifest.description ?? '',
        hasPosition: !!manifest.schema?.properties?.position,
        manifestUrl: `/graphics/${dir.name}/${file}`,
        mainUrl: `/graphics/${dir.name}/${manifest.main}`,
      });
    } catch (err) {
      console.warn(`Skipping graphics/${dir.name}: ${err.message}`);
    }
  }
  res.json(list);
});

const LOGO_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };

const imageBody = express.raw({ type: Object.keys(LOGO_TYPES), limit: '4mb' });

/** Saves an uploaded image and returns its URL, or null if it is not an image. */
function saveImage(req, prefix) {
  const ext = LOGO_TYPES[req.headers['content-type']?.split(';')[0]];
  if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) return null;
  const name = `${prefix}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, name), req.body);
  return `/uploads/${name}`;
}

app.put('/api/logo/:team', imageBody, (req, res) => {
  const { team } = req.params;
  const logo = ['home', 'away'].includes(team) ? saveImage(req, team) : null;
  if (!logo) return res.status(400).json({ error: 'Send a PNG, JPEG, WebP or SVG image for team home or away.' });
  dispatch({ type: 'team.update', team, logo });
  res.json({ logo });
});

app.put('/api/possession-icon', imageBody, (req, res) => {
  const possessionIcon = saveImage(req, 'possession');
  if (!possessionIcon) return res.status(400).json({ error: 'Send a PNG, JPEG, WebP or SVG image.' });
  dispatch({ type: 'settings.set', possessionIcon });
  res.json({ possessionIcon });
});

// ---- websocket -------------------------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
// ws re-emits the http server's errors; they are handled on `server` below.
wss.on('error', () => {});

function broadcast() {
  const msg = JSON.stringify({ type: 'state', state });
  for (const client of wss.clients) if (client.readyState === 1) client.send(msg);
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'state', state }));
  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.type === 'ping') ws.send(JSON.stringify({ type: 'pong', t0: msg.t0, now: Date.now() }));
    else if (msg?.type === 'cmd' && msg.cmd && typeof msg.cmd.type === 'string') dispatch(msg.cmd);
  });
});

// ---- start -----------------------------------------------------------------

const controlUrl = `http://localhost:${PORT}/control/`;
// The packaged app opens the control panel itself; from source, pass --open.
const openOnStart = (packaged || process.argv.includes('--open')) && !process.argv.includes('--no-open');

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
  } catch {
    // no browser to open: the URL is printed below
  }
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. ScoreBug is probably running already.`);
    console.error(`  Control panel:  ${controlUrl}`);
    if (openOnStart) openBrowser(controlUrl);
  } else {
    console.error(err.message);
  }
  // Keep a double-clicked console window open long enough to read the message.
  setTimeout(() => process.exit(1), packaged ? 15_000 : 0);
});

scheduleExpiry();
server.listen(PORT, HOST, () => {
  console.log('ScoreBug is running. Keep this window open while you stream; close it to stop.');
  console.log('');
  console.log(`  Control panel:  ${controlUrl}`);
  console.log(`  OBS source:     http://localhost:${PORT}/render/?graphic=scorebar`);
  if (HOST === '0.0.0.0') console.log('  Reachable from other devices on your network (--lan).');
  if (openOnStart) openBrowser(controlUrl);
});
