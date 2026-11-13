import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultState, reduce, msUntilExpiry, STATE_VERSION } from './state.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
    if (saved.version === STATE_VERSION) return reduce(saved, { type: 'tick' });
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

app.put('/api/logo/:team', express.raw({ type: Object.keys(LOGO_TYPES), limit: '4mb' }), (req, res) => {
  const { team } = req.params;
  const ext = LOGO_TYPES[req.headers['content-type']?.split(';')[0]];
  if (!['home', 'away'].includes(team) || !ext || !Buffer.isBuffer(req.body) || !req.body.length) {
    return res.status(400).json({ error: 'Send a PNG, JPEG, WebP or SVG image for team home or away.' });
  }
  const name = `${team}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(uploadDir, name), req.body);
  dispatch({ type: 'team.update', team, logo: `/uploads/${name}` });
  res.json({ logo: `/uploads/${name}` });
});

// ---- websocket -------------------------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

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

scheduleExpiry();
server.listen(PORT, HOST, () => {
  console.log(`ScoreBug running`);
  console.log(`  Control panel:  http://localhost:${PORT}/control/`);
  console.log(`  OBS source:     http://localhost:${PORT}/render/?graphic=scorebar`);
  if (HOST === '0.0.0.0') console.log('  Reachable from other devices on your network (--lan).');
});
