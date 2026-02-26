// ════════════════════════════════════════════════════
// BLINDGUIDE — server.js  (Gemini Edition)
// Endpoints:
//   POST /bundle              ← zero-knowledge 12-byte request
//   GET  /module/:id          ← download a single rich module
//   GET  /modules/manifest    ← list of all modules (id + topic)
//   POST /admin/login         ← admin authentication
//   POST /admin/module        ← add new module
//   PUT  /admin/module/:id    ← update existing module
//   DELETE /admin/module/:id  ← delete module
//   POST /admin/generate-module ← AI module generator (Gemini)
// ════════════════════════════════════════════════════

const express = require('express');
require('dotenv').config();
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const app = express();

// ── CORS ──
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Key'],
}));

app.use(express.raw({ type: 'application/octet-stream' }));
app.use(express.json());

const SECRET_KEY = 'BG_SECRET_2024';

// ── RICH MODULE STORE ──────────────────────────────
const MODULES_FILE = path.join(__dirname, 'modules.json');
let MODULE_STORE = {};
try {
  MODULE_STORE = JSON.parse(fs.readFileSync(MODULES_FILE, 'utf-8'));
  console.log(`Loaded ${Object.keys(MODULE_STORE).length} modules from modules.json`);
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

// ── GEMINI API CALL ────────────────────────────────
async function callGemini(prompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY environment variable is not set on this server.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2000,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

// ══════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════

// POST /admin/login
app.post('/admin/login', (req, res) => {
  const { passwordHash } = req.body;
  if (passwordHash === ADMIN_PASSWORD_HASH) {
    currentAdminToken = crypto.randomBytes(32).toString('hex');
    console.log('[ADMIN] Login successful');
    res.json({ token: currentAdminToken });
  } else {
    console.log('[ADMIN] Login failed — wrong password');
    res.status(401).json({ error: 'Invalid password' });
  }
});

// POST /admin/module — Add a new module
app.post('/admin/module', requireAdmin, (req, res) => {
  const { module } = req.body;
  if (!module || !module.id) {
    return res.status(400).json({ error: 'Invalid module — id is required' });
  }
  MODULE_STORE[module.id] = module;
  saveModules();
  console.log(`[ADMIN] Module ${module.id} added: ${module.topic}`);
  res.json({ success: true, module });
});

// PUT /admin/module/:id — Update an existing module
app.put('/admin/module/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!MODULE_STORE[id]) {
    return res.status(404).json({ error: `Module ${id} not found` });
  }
  const updatedModule = { ...MODULE_STORE[id], ...req.body.module, id };
  MODULE_STORE[id] = updatedModule;
  saveModules();
  console.log(`[ADMIN] Module ${id} updated`);
  res.json({ success: true, module: MODULE_STORE[id] });
});

// DELETE /admin/module/:id — Delete a module
app.delete('/admin/module/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!MODULE_STORE[id]) {
    return res.status(404).json({ error: `Module ${id} not found` });
  }
  const deletedTopic = MODULE_STORE[id].topic;
  delete MODULE_STORE[id];
  saveModules();
  console.log(`[ADMIN] Module ${id} (${deletedTopic}) deleted`);
  res.json({ success: true });
});

// POST /admin/generate-module — AI Module Generator using Gemini
app.post('/admin/generate-module', requireAdmin, async (req, res) => {
  const { method, input, moduleId } = req.body;

  if (!moduleId) return res.status(400).json({ error: 'Module ID is required' });
  if (!input) return res.status(400).json({ error: 'Input is required' });

  let textToProcess = '';

  try {
    // ── Step 1: Get raw content ──
    if (method === 'url') {
      const response = await fetch(input);
      if (!response.ok) throw new Error(`Failed to fetch URL: ${response.status}`);
      const html = await response.text();
      const $ = cheerio.load(html);
      $('script, style, noscript, nav, footer, header').remove();
      textToProcess = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 15000);
      if (!textToProcess) throw new Error('Could not extract text from URL');

    } else if (method === 'text') {
      textToProcess = input.substring(0, 15000);

    } else if (method === 'topic') {
      textToProcess = `Generate a complete educational lesson about: ${input}`;

    } else {
      return res.status(400).json({ error: 'Invalid method — use url, text, or topic' });
    }

    // ── Step 2: Build prompt ──
    const prompt = `You are an expert curriculum designer for a math learning app.

Based on the following ${method === 'topic' ? 'topic request' : 'content'}, create a structured educational module.

CRITICAL: Respond with ONLY valid JSON. No markdown, no backticks, no explanation. Just raw JSON.

The JSON must follow this exact structure:
{
  "id": ${parseInt(moduleId, 10)},
  "topic": "<short descriptive topic name>",
  "concept": "<clear explanation in 3-5 sentences suitable for students>",
  "examples": [
    { "problem": "<a worked example problem>", "solution": "<step by step solution>" },
    { "problem": "<another worked example>", "solution": "<step by step solution>" }
  ],
  "practice": [
    { "question": "<practice question 1>", "answer": "<correct answer>", "hint": "<helpful hint>" },
    { "question": "<practice question 2>", "answer": "<correct answer>", "hint": "<helpful hint>" },
    { "question": "<practice question 3>", "answer": "<correct answer>", "hint": "<helpful hint>" }
  ]
}

Content/Request:
${textToProcess}`;

    // ── Step 3: Call Gemini ──
    console.log(`[ADMIN] Calling Gemini for module ${moduleId} via method: ${method}`);
    const aiText = await callGemini(prompt);

    // ── Step 4: Clean and parse response ──
    const cleaned = aiText.replace(/^```(?:json)?|```$/gm, '').trim();
    const generatedModule = JSON.parse(cleaned);

    // ── Step 5: Validate fields ──
    const required = ['id', 'topic', 'concept', 'examples', 'practice'];
    for (const field of required) {
      if (!generatedModule[field]) throw new Error(`Missing required field: ${field}`);
    }
    if (!Array.isArray(generatedModule.examples) || generatedModule.examples.length === 0) {
      throw new Error('examples must be a non-empty array');
    }
    if (!Array.isArray(generatedModule.practice) || generatedModule.practice.length === 0) {
      throw new Error('practice must be a non-empty array');
    }

    generatedModule.id = parseInt(moduleId, 10);

    console.log(`[ADMIN] Gemini generated Module ${generatedModule.id}: ${generatedModule.topic}`);
    res.json({ success: true, module: generatedModule });

  } catch (err) {
    console.error('[ADMIN] Generation error:', err.message);
    res.status(500).json({ error: `Generation failed: ${err.message}` });
  }
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
// ENDPOINT 1: POST /bundle  (zero-knowledge path)
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
// ENDPOINT 4: GET /  (health check)
// ══════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'BlindGuide — zero knowledge mode active',
    modulesLoaded: Object.keys(MODULE_STORE).length,
    aiProvider: 'Google Gemini (free tier)',
    endpoints: [
      'POST   /bundle',
      'GET    /module/:id',
      'GET    /modules/manifest',
      'POST   /admin/login',
      'POST   /admin/module',
      'PUT    /admin/module/:id',
      'DELETE /admin/module/:id',
      'POST   /admin/generate-module',
    ],
  });
});

// ══════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('════════════════════════════════════════');
  console.log('  🔒 BlindGuide Server — Zero Knowledge');
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Modules loaded: ${Object.keys(MODULE_STORE).length}`);
  console.log('  AI Provider: Google Gemini (free)');
  console.log('  Endpoints:');
  console.log('    POST   /bundle               ← ZK 12-byte request');
  console.log('    GET    /module/:id            ← rich module download');
  console.log('    GET    /modules/manifest      ← module index');
  console.log('    POST   /admin/login           ← admin auth');
  console.log('    POST   /admin/module          ← add module');
  console.log('    PUT    /admin/module/:id      ← update module');
  console.log('    DELETE /admin/module/:id      ← delete module');
  console.log('    POST   /admin/generate-module ← Gemini AI generator');
  console.log('  Waiting for requests...');
  console.log('════════════════════════════════════════');
});