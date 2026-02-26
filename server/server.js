// ════════════════════════════════════════════════════
// BLINDGUIDE — server.js  (Real Modules Edition)
// Endpoints:
//   POST /bundle         ← zero-knowledge 12-byte request
//   GET  /module/:id     ← download a single rich module
//   GET  /modules/manifest ← list of all modules (id + topic)
// ════════════════════════════════════════════════════

const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['POST', 'GET'],
}));
app.use(express.raw({ type: 'application/octet-stream' }));
app.use(express.json());

const SECRET_KEY = 'BG_SECRET_2024';

// ── RICH MODULE STORE ──────────────────────────────
// Each module: { id, topic, concept, examples[], practice[] }
const MODULE_STORE = {

  3: {
    id: 3,
    topic: 'Addition & Subtraction',
    concept: `Addition means combining two or more numbers to get a total. Subtraction means finding the difference between two numbers. These are the building blocks of all maths.\n\nKey rules:\n• Adding 0 to any number leaves it unchanged: 5 + 0 = 5\n• Order does not matter for addition: 3 + 7 = 7 + 3\n• To subtract, count backwards from the larger number`,
    examples: [
      { problem: '23 + 19 = ?', solution: 'Add the ones: 3 + 9 = 12, write 2 carry 1. Add the tens: 2 + 1 + 1(carry) = 4. Answer: 42' },
      { problem: '100 − 37 = ?', solution: 'Work right to left: 0 − 7? Borrow → 10 − 7 = 3. 9 − 3 = 6. 0 − 0 = 0. Answer: 63' },
    ],
    practice: [
      { question: 'What is 46 + 58?', answer: '104', hint: 'Add the ones first (6+8=14), carry the 1, then add the tens.' },
      { question: 'What is 200 − 73?', answer: '127', hint: 'Borrow from hundreds. 10−3=7, 9−7=2 (after borrow), 1 left.' },
    ],
  },

  5: {
    id: 5,
    topic: 'Multiplication',
    concept: `Multiplication is repeated addition. 3 × 4 means "three groups of four" = 4 + 4 + 4 = 12.\n\nKey rules:\n• Any number × 0 = 0\n• Any number × 1 = itself\n• Order does not matter: 6 × 7 = 7 × 6\n• To multiply by 10, add a zero to the end: 8 × 10 = 80`,
    examples: [
      { problem: '6 × 7 = ?', solution: '7 × 6 = 42. You can also think of it as 6 × 7 = (6 × 5) + (6 × 2) = 30 + 12 = 42.' },
      { problem: '12 × 4 = ?', solution: 'Split: (10 × 4) + (2 × 4) = 40 + 8 = 48.' },
    ],
    practice: [
      { question: 'What is 8 × 9?', answer: '72', hint: '8 × 10 = 80, subtract one 8: 80 − 8 = 72.' },
      { question: 'What is 15 × 3?', answer: '45', hint: '(10 × 3) + (5 × 3) = 30 + 15 = 45.' },
    ],
  },

  7: {
    id: 7,
    topic: 'Decimals',
    concept: `A decimal number has two parts separated by a dot: the whole-number part and the fractional part.\n\nPosition values:\n• 0.1  = one tenth\n• 0.01 = one hundredth\n• 0.5  = five tenths = half\n\nWhen adding or subtracting decimals, always line up the decimal points first.`,
    examples: [
      { problem: '0.5 + 0.5 = ?', solution: 'Line up decimals: 0.5 + 0.5. Ones: 0+0=0. Tenths: 5+5=10, write 0 carry 1 to ones. Result: 1.0 = 1' },
      { problem: '1.75 − 0.4 = ?', solution: 'Write as 1.75 − 0.40. Hundredths: 5−0=5. Tenths: 7−4=3. Ones: 1−0=1. Answer: 1.35' },
    ],
    practice: [
      { question: 'What is 0.3 + 0.8?', answer: '1.1', hint: 'Tenths: 3+8=11, write 1 carry 1 to ones.' },
      { question: 'What is 2.5 − 0.7?', answer: '1.8', hint: 'Borrow from ones: 15−7=8 tenths, 1 one left.' },
    ],
  },

  9: {
    id: 9,
    topic: 'Fractions — Introduction',
    concept: `A fraction represents a part of a whole. It is written as: numerator / denominator.\n\n• Numerator = how many parts you have\n• Denominator = how many equal parts the whole is split into\n\nExamples: 1/2 = half, 1/4 = quarter, 3/4 = three quarters\n\nSimplifying: Divide both top and bottom by their greatest common factor. 4/8 → divide both by 4 → 1/2`,
    examples: [
      { problem: 'Simplify 6/9', solution: 'Greatest common factor of 6 and 9 is 3. 6÷3=2, 9÷3=3. Answer: 2/3' },
      { problem: 'Which is bigger: 1/3 or 1/4?', solution: '1/3 = 4/12, 1/4 = 3/12. Since 4 > 3, 1/3 is bigger.' },
    ],
    practice: [
      { question: 'Simplify 8/12', answer: '2/3', hint: 'GCF of 8 and 12 is 4. Divide both by 4.' },
      { question: 'Which is larger: 2/5 or 3/8?', answer: '2/5', hint: 'Common denominator 40: 2/5=16/40, 3/8=15/40.' },
    ],
  },

  12: {
    id: 12,
    topic: 'Fractions — Adding & Subtracting',
    concept: `To add or subtract fractions:\n1. Make the denominators the same (find the LCD)\n2. Convert each fraction to the new denominator\n3. Add or subtract the numerators only\n4. Keep the denominator the same\n5. Simplify if possible\n\nSame denominator: 2/7 + 3/7 = 5/7 (just add tops)\nDifferent denominators: 1/3 + 1/4 → LCD=12 → 4/12 + 3/12 = 7/12`,
    examples: [
      { problem: '1/4 + 3/4 = ?', solution: 'Same denominator: 1+3=4, over 4. 4/4 = 1. Answer: 1' },
      { problem: '1/2 + 1/3 = ?', solution: 'LCD of 2 and 3 = 6. 1/2 = 3/6, 1/3 = 2/6. 3/6 + 2/6 = 5/6.' },
    ],
    practice: [
      { question: 'What is 2/5 + 1/5?', answer: '3/5', hint: 'Same denominator — just add the numerators.' },
      { question: 'What is 3/4 − 1/3?', answer: '5/12', hint: 'LCD=12. 3/4=9/12, 1/3=4/12. 9−4=5.' },
    ],
  },

  15: {
    id: 15,
    topic: 'Percentages',
    concept: `Percent means "out of 100". The symbol is %.\n\nKey conversions:\n• 50% = 50/100 = 0.5 = half\n• 25% = 0.25 = quarter\n• 10% = 0.1\n\nTo find X% of a number: multiply by X then divide by 100.\nExample: 30% of 200 = (30 × 200) / 100 = 60\n\nShortcut for 10%: just move the decimal point one place left.`,
    examples: [
      { problem: 'What is 10% of 350?', solution: 'Move decimal one left: 350 → 35.0. Answer: 35' },
      { problem: 'What is 25% of 80?', solution: '25% = 1/4. 80 ÷ 4 = 20. Answer: 20' },
    ],
    practice: [
      { question: 'What is 20% of 150?', answer: '30', hint: '10% of 150 = 15. Double it for 20%.' },
      { question: 'What is 35% of 200?', answer: '70', hint: '10%=20, 30%=60, 5%=10. 60+10=70.' },
    ],
  },

  18: {
    id: 18,
    topic: 'Algebra — Introduction',
    concept: `Algebra uses letters (variables) to represent unknown numbers. Your job is to find what the letter equals.\n\nGolden rule: Whatever you do to one side of the equation, do the same to the other side.\n\nSolving x + 5 = 12:\n→ Subtract 5 from both sides\n→ x = 12 − 5 = 7\n\nSolving 3x = 15:\n→ Divide both sides by 3\n→ x = 5`,
    examples: [
      { problem: 'If y + 4 = 10, find y', solution: 'Subtract 4 from both sides: y = 10 − 4 = 6' },
      { problem: 'If 2z = 14, find z', solution: 'Divide both sides by 2: z = 14 ÷ 2 = 7' },
    ],
    practice: [
      { question: 'If x − 3 = 9, what is x?', answer: '12', hint: 'Add 3 to both sides: x = 9 + 3.' },
      { question: 'If 4m = 28, what is m?', answer: '7', hint: 'Divide both sides by 4.' },
    ],
  },

  21: {
    id: 21,
    topic: 'Geometry Basics',
    concept: `Geometry is the study of shapes, sizes, and spaces.\n\nKey shapes:\n• Triangle — 3 sides, 3 angles. Angles always add up to 180°\n• Rectangle — 4 sides (opposite sides equal), 4 right angles (90° each)\n• Square — 4 equal sides, 4 right angles\n• Circle — perfectly round. Distance from centre to edge = radius\n\nFormulas:\n• Area of rectangle = length × width\n• Perimeter = sum of all sides\n• Area of triangle = ½ × base × height`,
    examples: [
      { problem: 'Perimeter of rectangle 5 × 3?', solution: 'Perimeter = 2 × (length + width) = 2 × (5 + 3) = 2 × 8 = 16' },
      { problem: 'Area of triangle: base=6, height=4?', solution: 'Area = ½ × 6 × 4 = ½ × 24 = 12 sq units' },
    ],
    practice: [
      { question: 'Area of a square with side 7?', answer: '49', hint: 'Area = side × side = 7 × 7.' },
      { question: 'Sum of angles in a triangle?', answer: '180°', hint: 'This is always true for any triangle.' },
    ],
  },
};

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

  // Verify XOR checksum
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

  // Match tokens → modules
  const foundModules = [];
  for (const token of receivedTokens) {
    for (const moduleId of Object.keys(MODULE_STORE)) {
      if (generateToken(moduleId, today) === token) {
        // Return lightweight bundle summary (not the full rich content)
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
// ENDPOINT 2: GET /module/:id  (rich module download)
// ══════════════════════════════════════════════════
app.get('/module/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const module = MODULE_STORE[id];

  if (!module) {
    logRequest('MODULE', `GET /module/${id} — NOT FOUND`);
    return res.status(404).json({ error: `Module ${id} not found` });
  }

  // Set cache headers — modules are static, cache for 24h in browser/SW
  res.set('Cache-Control', 'public, max-age=86400');
  logRequest('MODULE', `GET /module/${id} — ${module.topic}`);
  res.json(module);
});

// ══════════════════════════════════════════════════
// ENDPOINT 3: GET /modules/manifest  (lightweight index)
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
  console.log('  http://localhost:3000');
  console.log(`  Modules loaded: ${Object.keys(MODULE_STORE).length}`);
  console.log('  Endpoints:');
  console.log('    POST /bundle          ← ZK 12-byte request');
  console.log('    GET  /module/:id      ← rich module download');
  console.log('    GET  /modules/manifest ← module index');
  console.log('  Waiting for requests...');
  console.log('════════════════════════════════════════');
});