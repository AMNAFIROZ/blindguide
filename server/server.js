// ════════════════════════════════════════════════════
// BLINDGUIDE — server.js  (Real Modules Edition)
// ════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['POST', 'GET', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Anon-User'],
}));
app.use(express.raw({ type: 'application/octet-stream' }));
app.use(express.json());

const SECRET_KEY = 'BG_SECRET_2024';

// ── RICH MODULE STORE ──────────────────────────────
const MODULES_FILE = path.join(__dirname, 'modules.json');
let MODULE_STORE = {};
try {
  MODULE_STORE = JSON.parse(fs.readFileSync(MODULES_FILE, 'utf-8'));
} catch (err) {
  console.log('No modules.json found, starting empty.');
}

function saveModules() {
  fs.writeFileSync(MODULES_FILE, JSON.stringify(MODULE_STORE, null, 2));
}

// ── ADMIN AUTHENTICATION ───────────────────────────
const ADMIN_PASSWORD_HASH = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
let currentAdminToken = null;

function requireAdmin(req, res, next) {
  const token = req.headers['authorization'];
  if (!token || token !== currentAdminToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/admin/login', (req, res) => {
  const { passwordHash } = req.body;
  if (passwordHash === ADMIN_PASSWORD_HASH) {
    currentAdminToken = crypto.randomBytes(32).toString('hex');
    res.json({ token: currentAdminToken });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/admin/module', requireAdmin, (req, res) => {
  const { module } = req.body;
  if (!module || !module.id) return res.status(400).json({ error: 'Invalid module' });
  MODULE_STORE[module.id] = module;
  saveModules();
  res.json({ success: true, module });
});

app.put('/admin/module/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!MODULE_STORE[id]) return res.status(404).json({ error: 'Not found' });
  MODULE_STORE[id] = { ...MODULE_STORE[id], ...req.body.module, id };
  saveModules();
  res.json({ success: true, module: MODULE_STORE[id] });
});

app.delete('/admin/module/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!MODULE_STORE[id]) return res.status(404).json({ error: 'Not found' });
  delete MODULE_STORE[id];
  saveModules();
  res.json({ success: true });
});

// ── TOKEN GENERATOR ────────────────────────────────
function generateToken(moduleId, date) {
  return crypto
    .createHmac('sha256', SECRET_KEY)
    .update(`MOD${moduleId}:${date}`)
    .digest('hex')
    .substring(0, 6)
    .toUpperCase();
}

// ── REQUEST LOGGER ─────────────────────────────────
function logRequest(type, details) {
  const stamp = new Date().toTimeString().split(' ')[0];
  console.log(`[${stamp}] ${type} — ${details}`);
}

// ══════════════════════════════════════════════════
// ENDPOINT 1: POST /bundle
// ══════════════════════════════════════════════════
app.post('/bundle', (req, res) => {
  const bytes = req.body;

  if (!bytes || bytes.length !== 12) {
    logRequest('BUNDLE', `REJECTED — wrong size: ${bytes?.length ?? 0} bytes`);
    return res.status(400).json({ error: 'Request must be exactly 12 bytes' });
  }

  let xor = 0;
  for (let i = 0; i < 11; i++) xor ^= bytes[i];
  if (xor !== bytes[11]) {
    logRequest('BUNDLE', 'REJECTED — checksum failed');
    return res.status(400).json({ error: 'Checksum failed — request corrupted' });
  }

  const token1 = bytes.slice(2, 5).toString('hex').toUpperCase();
  const token2 = bytes.slice(5, 8).toString('hex').toUpperCase();
  const token3 = bytes.slice(8, 11).toString('hex').toUpperCase();
  const receivedTokens = [token1, token2, token3];
  const today = new Date().toISOString().split('T')[0];
  const isGhostSync = bytes[1] === 0x01;

  const foundModules = [];
  for (const token of receivedTokens) {
    for (const moduleId of Object.keys(MODULE_STORE)) {
      if (generateToken(moduleId, today) === token) {
        const m = MODULE_STORE[moduleId];
        foundModules.push({ id: m.id, topic: m.topic });
        break;
      }
    }
  }

  if (foundModules.length === 0) {
    logRequest('BUNDLE', 'No modules matched — possible date mismatch');
    return res.status(404).json({ error: 'No modules matched' });
  }

  const prefix = isGhostSync ? '[GHOST SYNC] ' : '';
  logRequest('BUNDLE', `${prefix}12 bytes → ${foundModules.length} modules matched`);
  logRequest('BUNDLE', `Modules: ${foundModules.map(m => m.id).join(', ')} — server cannot identify which is real`);
  logRequest('BUNDLE', `Student identity: UNKNOWN | Score: UNKNOWN | Weakness: UNKNOWN`);
  console.log('─'.repeat(60));

  res.json({ modules: foundModules });
});

// ══════════════════════════════════════════════════
// ENDPOINT 2: GET /module/:id
// ══════════════════════════════════════════════════
app.get('/module/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const module = MODULE_STORE[id];

  if (!module) {
    logRequest('MODULE', `GET /module/${id} — NOT FOUND`);
    return res.status(404).json({ error: `Module ${id} not found` });
  }

  res.set('Cache-Control', 'public, max-age=86400');
  logRequest('MODULE', `GET /module/${id} — ${module.topic}`);
  res.json(module);
});

// ══════════════════════════════════════════════════
// ENDPOINT 3: GET /modules/manifest
// ══════════════════════════════════════════════════
app.get('/modules/manifest', (req, res) => {
  const manifest = Object.values(MODULE_STORE).map(m => ({
    id: m.id,
    topic: m.topic,
  }));
  logRequest('MANIFEST', `Returning ${manifest.length} module entries`);
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(manifest);
});

// ══════════════════════════════════════════════════
// ENDPOINT 4: GET / (health check)
// ══════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'BlindGuide — zero knowledge mode active',
    modulesLoaded: Object.keys(MODULE_STORE).length,
    endpoints: ['POST /bundle', 'GET /module/:id', 'GET /modules/manifest'],
  });
});

// ══════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('════════════════════════════════════════');
  console.log('  🔒 BlindGuide Server — Zero Knowledge');
  console.log(`  https://blindguide-server.onrender.com`);
  console.log(`  Modules loaded: ${Object.keys(MODULE_STORE).length}`);
  console.log('  Endpoints:');
  console.log('    POST /bundle          ← ZK 12-byte request');
  console.log('    GET  /module/:id      ← rich module download');
  console.log('    GET  /modules/manifest ← module index');
  console.log('  Waiting for requests...');
  console.log('════════════════════════════════════════');
});
