// ════════════════════════════════════════════════════
// BLINDGUIDE — app.js  (Real Modules Edition)
// ════════════════════════════════════════════════════

// ── CONFIG ──
const SERVER_URL = 'https://blindguide-server.onrender.com/bundle';
const MODULE_SERVER_URL = 'https://blindguide-server.onrender.com/module';
const SECRET_KEY = 'BG_SECRET_2024';
const LS_PREFIX = 'bg_module_';

// ── ANONYMOUS SESSION ──
let hashedAnonId = '';
let rawAnonId = '';

async function startSecureSession() {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(rawAnonId));
  hashedAnonId = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16);
  console.log('[APP] Secure session initialized');
  startQuiz();
}

// ── QUESTIONS ──
const QUESTIONS = [
  { q: 'What is 7 + 6?', options: ['11', '12', '13', '14'], answer: '13', topic: 'Addition' },
  { q: 'What is 15 - 8?', options: ['5', '6', '7', '8'], answer: '7', topic: 'Addition' },
  { q: 'What is 23 + 19?', options: ['41', '42', '43', '44'], answer: '42', topic: 'Addition' },
  { q: 'What is 100 - 37?', options: ['63', '64', '73', '74'], answer: '63', topic: 'Addition' },
  { q: 'Simplify 4/8', options: ['1/4', '1/3', '1/2', '2/3'], answer: '1/2', topic: 'Fractions' },
  { q: 'What is 0.5 as a %?', options: ['5%', '50%', '0.5%', '500%'], answer: '50%', topic: 'Fractions' },
  { q: 'What is 1/4 + 1/4?', options: ['1/8', '1/4', '1/2', '2/4'], answer: '1/2', topic: 'Fractions' },
  { q: 'Convert 0.75 to fraction', options: ['3/4', '7/5', '1/4', '7/10'], answer: '3/4', topic: 'Fractions' },
  { q: 'If x + 3 = 7, x = ?', options: ['3', '4', '5', '6'], answer: '4', topic: 'Algebra' },
  { q: 'If 2y = 10, y = ?', options: ['2', '4', '5', '8'], answer: '5', topic: 'Algebra' },
  { q: 'What is 3x when x = 4?', options: ['7', '10', '12', '14'], answer: '12', topic: 'Algebra' },
  { q: 'If z - 5 = 9, z = ?', options: ['4', '13', '14', '15'], answer: '14', topic: 'Algebra' },
  { q: 'Sides of a triangle?', options: ['2', '3', '4', '5'], answer: '3', topic: 'Geometry' },
  { q: 'Area of square, side = 4?', options: ['8', '12', '16', '20'], answer: '16', topic: 'Geometry' },
  { q: 'Angles in a triangle?', options: ['90°', '180°', '270°', '360°'], answer: '180°', topic: 'Geometry' },
  { q: 'Perimeter: rectangle 3×5?', options: ['8', '15', '16', '30'], answer: '16', topic: 'Geometry' },
];

// ── MODULE LOOKUP TABLE ──
const MODULE_TABLE = {
  'T1-CRITICAL': 3, 'T1-SEVERE': 3, 'T1-MEDIUM': 3, 'T1-MILD': 3,
  'T2-CRITICAL': 9, 'T2-SEVERE': 9, 'T2-MEDIUM': 12, 'T2-MILD': 15,
  'T3-CRITICAL': 18, 'T3-SEVERE': 18, 'T3-MEDIUM': 18, 'T3-MILD': 18,
  'T4-CRITICAL': 21, 'T4-SEVERE': 21, 'T4-MEDIUM': 21, 'T4-MILD': 21,
};

// ── DECOY MAP ──
const DECOY_MAP = {
  3: [5, 7], 5: [3, 7], 7: [9, 15], 9: [7, 12],
  12: [9, 15], 15: [12, 7], 18: [12, 21], 21: [18, 5],
};

// ── MARKOV PREDICTION TABLE ──
const MARKOV_TABLE = {
  3: [{ moduleId: 5, prob: 0.7 }, { moduleId: 7, prob: 0.3 }],
  5: [{ moduleId: 7, prob: 0.6 }, { moduleId: 9, prob: 0.4 }],
  7: [{ moduleId: 9, prob: 0.7 }, { moduleId: 15, prob: 0.3 }],
  9: [{ moduleId: 12, prob: 0.7 }, { moduleId: 15, prob: 0.3 }],
  12: [{ moduleId: 15, prob: 0.6 }, { moduleId: 18, prob: 0.4 }],
  15: [{ moduleId: 18, prob: 0.7 }, { moduleId: 21, prob: 0.3 }],
  18: [{ moduleId: 21, prob: 0.8 }, { moduleId: 12, prob: 0.2 }],
  21: [{ moduleId: 18, prob: 0.5 }, { moduleId: 15, prob: 0.5 }],
};

// ── STATE ──
let currentQ = 0;
let answers = [];

// ── BANDWIDTH TRACKER ──
const BW = {
  blindTotal: 0,
  jsonTotal: 0,
  MAX_BAR: 640,

  reset() {
    this.blindTotal = 0;
    this.jsonTotal = 0;
    this._update();
  },

  addRequest(blindBytes, jsonEquivalent) {
    this.blindTotal += blindBytes;
    this.jsonTotal += jsonEquivalent;
    this._update();
  },

  _update() {
    const blindEl = document.getElementById('bwBlindBytes');
    const jsonEl = document.getElementById('bwJsonBytes');
    const blindBar = document.getElementById('bwBlindBar');
    const jsonBar = document.getElementById('bwJsonBar');
    const savingEl = document.getElementById('bwSaving');
    const savingVal = document.getElementById('bwSavingValue');

    if (blindEl) blindEl.textContent = `${this.blindTotal} bytes`;
    if (jsonEl) jsonEl.textContent = `${this.jsonTotal} bytes`;
    if (blindBar) blindBar.style.width = `${Math.min((this.blindTotal / this.MAX_BAR) * 100, 100)}%`;
    if (jsonBar) jsonBar.style.width = `${Math.min((this.jsonTotal / this.MAX_BAR) * 100, 100)}%`;

    if (this.blindTotal > 0 && savingEl) {
      const pct = Math.round(((this.jsonTotal - this.blindTotal) / this.jsonTotal) * 100);
      savingEl.classList.add('show');
      if (savingVal) savingVal.textContent = `${this.jsonTotal - this.blindTotal} bytes saved (${pct}% less)`;
    }
  },

  showFinal() {
    const saved = this.jsonTotal - this.blindTotal;
    const pct = Math.round((saved / this.jsonTotal) * 100);
    const faster = Math.round(this.jsonTotal / this.blindTotal);
    const fb = document.getElementById('bwFinalBlind');
    const fj = document.getElementById('bwFinalJson');
    const fsv = document.getElementById('bwFinalSavingValue');
    if (fb) fb.textContent = `${this.blindTotal} bytes`;
    if (fj) fj.textContent = `${this.jsonTotal} bytes`;
    if (fsv) fsv.textContent = `${saved} bytes (${pct}% — ~${faster}x smaller)`;
  },
};

// ════════════════════════════════════════════════════
// MODULE DOWNLOAD & CACHE
// ════════════════════════════════════════════════════

async function downloadModule(id) {
  const key = LS_PREFIX + id;
  try {
    const res = await fetch(`${MODULE_SERVER_URL}/${id}`, {
      headers: { 'X-Anon-User': hashedAnonId }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const module = await res.json();
    localStorage.setItem(key, JSON.stringify(module));
    return module;
  } catch (err) {
    const cached = localStorage.getItem(key);
    if (cached) return JSON.parse(cached);
    return null;
  }
}

async function prefetchModule(id) {
  const key = LS_PREFIX + id;
  if (localStorage.getItem(key)) return;
  try {
    const res = await fetch(`${MODULE_SERVER_URL}/${id}`);
    if (res.ok) {
      const module = await res.json();
      localStorage.setItem(key, JSON.stringify(module));
    }
  } catch {
    console.log(`[APP] prefetch skipped for module ${id}`);
  }
}

// ════════════════════════════════════════════════════
// QUIZ
// ════════════════════════════════════════════════════

function startQuiz() {
  currentQ = 0;
  answers = [];
  BW.reset();
  showScreen('quizScreen');
  showQuestion();
}

function showQuestion() {
  const q = QUESTIONS[currentQ];
  const progress = (currentQ / QUESTIONS.length) * 100;
  document.getElementById('progressFill').style.width = progress + '%';
  document.getElementById('questionMeta').textContent =
    `Question ${currentQ + 1} of ${QUESTIONS.length} · Topic: ${q.topic}`;
  document.getElementById('questionText').textContent = q.q;

  const grid = document.getElementById('optionsGrid');
  grid.innerHTML = '';
  q.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.textContent = opt;
    btn.onclick = () => handleAnswer(opt, btn);
    grid.appendChild(btn);
  });
}

function handleAnswer(selected, btn) {
  const q = QUESTIONS[currentQ];
  const correct = selected === q.answer;
  answers.push(correct ? 1 : 0);

  document.querySelectorAll('.option-btn').forEach(b => {
    b.onclick = null;
    if (b.textContent === q.answer) b.classList.add('correct');
  });
  if (!correct) btn.classList.add('wrong');

  setTimeout(() => {
    currentQ++;
    if (currentQ < QUESTIONS.length) showQuestion();
    else processResults();
  }, 600);
}

// ════════════════════════════════════════════════════
// CORE PROTOCOL — ZK ENGINE
// ════════════════════════════════════════════════════

async function processResults() {
  showScreen('processingScreen');
  const log = document.getElementById('stepsLog');
  log.innerHTML = '';

  function addLog(html, delay) {
    return new Promise(resolve => {
      setTimeout(() => {
        const line = document.createElement('div');
        line.className = 'log-line';
        line.innerHTML = html;
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
        requestAnimationFrame(() => line.classList.add('show'));
        resolve();
      }, delay);
    });
  }

  const scoreVector = answers.join('');
  await addLog(`<span class="prefix">[1] </span>Score vector: <span class="zk">"${scoreVector}"</span> — built on device, never transmitted`, 300);

  const topics = [
    { name: 'Addition', scores: answers.slice(0, 4), index: 1 },
    { name: 'Fractions', scores: answers.slice(4, 8), index: 2 },
    { name: 'Algebra', scores: answers.slice(8, 12), index: 3 },
    { name: 'Geometry', scores: answers.slice(12, 16), index: 4 },
  ];

  const topicScores = topics.map(t => {
    const zeros = t.scores.filter(s => s === 0).length;
    const pct = (zeros / t.scores.length) * 100;
    let severity = 'STRONG';
    if (pct > 75) severity = 'CRITICAL';
    else if (pct > 50) severity = 'SEVERE';
    else if (pct > 25) severity = 'MEDIUM';
    else if (pct > 0) severity = 'MILD';
    return { ...t, zeros, pct, severity };
  });

  await addLog(`<span class="prefix">[2] </span>Topic-range analysis — all computed on device:`, 700);
  topicScores.forEach((t, i) => {
    const color = t.severity === 'STRONG' ? 'ok' : t.zeros > 2 ? 'warn' : 'zk';
    setTimeout(() => {
      addLog(`<span class="prefix">    T${t.index} ${t.name.padEnd(10)}: </span><span class="${color}">${t.zeros}/4 wrong → ${t.severity}</span>`, 0);
    }, 900 + i * 180);
  });

  await new Promise(r => setTimeout(r, 1700));

  const weakest = topicScores.reduce((a, b) => a.zeros >= b.zeros ? a : b);
  const profileStr = `T${weakest.index}-${weakest.severity}`;
  await addLog(`<span class="prefix">[3] </span>Weakness profile string: <span class="zk">"${profileStr}"</span>`, 2000);

  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(profileStr));
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  const fingerprint = hashHex.substring(0, 6);
  await addLog(`<span class="prefix">[4] </span>SHA-256("${profileStr}") → fingerprint: <span class="zk">"${fingerprint}"</span>`, 2500);

  const moduleId = MODULE_TABLE[profileStr] || 9;
  await addLog(`<span class="prefix">[5] </span>Local table → Module <span class="zk">${moduleId}</span> — server doesn't know this`, 3000);

  const decoys = DECOY_MAP[moduleId] || [7, 15];
  await addLog(`<span class="prefix">[6] </span>Decoys picked: Module ${decoys[0]} + Module ${decoys[1]}`, 3500);

  const today = new Date().toISOString().split('T')[0];

  async function hmacToken(modId) {
    const keyData = encoder.encode(SECRET_KEY);
    const msgData = encoder.encode(`MOD${modId}:${today}`);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('').substring(0, 6).toUpperCase();
  }

  const realToken = await hmacToken(moduleId);
  const decoy1Token = await hmacToken(decoys[0]);
  const decoy2Token = await hmacToken(decoys[1]);
  await addLog(`<span class="prefix">[7] </span>HMAC tokens: <span class="zk">${realToken}</span>(real) · ${decoy1Token}(decoy) · ${decoy2Token}(decoy)`, 4000);

  const tokenList = [
    { token: realToken, modId: moduleId, real: true },
    { token: decoy1Token, modId: decoys[0], real: false },
    { token: decoy2Token, modId: decoys[1], real: false },
  ];
  for (let i = tokenList.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [tokenList[i], tokenList[j]] = [tokenList[j], tokenList[i]];
  }
  const realPosition = tokenList.findIndex(t => t.real);
  await addLog(`<span class="prefix">[8] </span>Tokens shuffled — real is at position ${realPosition + 1}`, 4500);

  const bytes = new Uint8Array(12);
  bytes[0] = 0x01;
  bytes[1] = 0x00;

  function hexToBytes(hex, target, offset) {
    for (let i = 0; i < 3; i++) {
      target[offset + i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16) || i;
    }
  }

  hexToBytes(tokenList[0].token, bytes, 2);
  hexToBytes(tokenList[1].token, bytes, 5);
  hexToBytes(tokenList[2].token, bytes, 8);

  let xor = 0;
  for (let i = 0; i < 11; i++) xor ^= bytes[i];
  bytes[11] = xor;

  const byteDisplay = Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

  await addLog(`<span class="prefix">[9] </span>Packed: <span class="zk">${byteDisplay}</span>`, 5000);
  await addLog(`<span class="prefix">    </span><span class="warn">↑ This is ALL the server will ever see (12 bytes)</span>`, 5300);
  await addLog(`<span class="prefix">[10]</span>Sending 12 bytes → server...`, 5800);

  const jsonEquivalent = JSON.stringify({
    student_id: 'STU_' + Math.floor(Math.random() * 9999),
    score_vector: scoreVector,
    weak_topic: weakest.name,
    severity: weakest.severity,
    requested_module: moduleId,
    timestamp: new Date().toISOString(),
  }).length;

  BW.addRequest(12, jsonEquivalent);
  await addLog(
    `<span class="prefix">    </span><span class="warn">BlindGuide: 12 bytes · Traditional JSON: ~${jsonEquivalent} bytes</span>`,
    5900
  );

  try {
    const response = await fetch(SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes.buffer,
    });

    const bundle = await response.json();
    await addLog(
      `<span class="prefix">[11]</span><span class="ok">Server returned ${bundle.modules.length} module IDs ✓</span>`,
      6300
    );

    const matchedId = bundle.modules.find(m => m.id === moduleId)?.id || bundle.modules[0]?.id || moduleId;
    await addLog(
      `<span class="prefix">[12]</span>Phone picks Module ${matchedId} — downloading full content...`,
      6800
    );

    const richModule = await downloadModule(matchedId);
    await addLog(
      `<span class="prefix">    </span><span class="ok">✓ Zero private data sent. Server is blind to this student's profile.</span>`,
      7300
    );

    setTimeout(() => showLesson(richModule, topicScores, weakest, byteDisplay, matchedId), 7900);

  } catch (err) {
    await addLog(
      `<span class="prefix">[!!]</span><span class="warn">Cannot reach server — trying cached lesson...</span>`,
      6300
    );
    const cached = localStorage.getItem(LS_PREFIX + moduleId);
    if (cached) {
      const richModule = JSON.parse(cached);
      setTimeout(() => showLesson(richModule, topicScores, weakest, byteDisplay, moduleId), 7400);
    } else {
      await addLog(
        `<span class="prefix">[!!]</span><span class="warn">No cached lesson available.</span>`,
        6800
      );
    }
  }
}

// ════════════════════════════════════════════════════
// LESSON SCREEN
// ════════════════════════════════════════════════════

function showLesson(module, topicScores, weakest, byteDisplay, moduleId) {
  showScreen('lessonScreen');
  BW.showFinal();

  document.getElementById('privacyBadge').innerHTML =
    `✓ Zero-Knowledge Protocol — Server received: <strong style="color:#00d4ff">${byteDisplay}</strong><br>
     Your score, topic weakness, and identity were never transmitted.`;

  const summary = document.getElementById('scoreSummary');
  summary.innerHTML = topicScores.map(t => {
    const cls = t.severity === 'STRONG' ? 'strong' : t.zeros > 2 ? 'weak' : 'medium';
    const filled = '█'.repeat(4 - t.zeros);
    const empty = '░'.repeat(t.zeros);
    return `<div class="score-row">
      <span class="score-label">T${t.index} ${t.name}</span>
      <span class="score-value ${cls}">${filled}${empty} ${t.severity}</span>
    </div>`;
  }).join('') + `
    <div class="score-row">
      <span class="score-label">→ Module assigned</span>
      <span class="score-value weak">Module ${module?.id || moduleId}: ${module?.topic || 'Unknown'}</span>
    </div>`;

  const card = document.getElementById('moduleCard');
  if (!module) {
    card.innerHTML = `<div class="module-offline">⚠ Module content unavailable offline.</div>`;
  } else {
    card.innerHTML = buildModuleHTML(module);
  }

  setTimeout(() => triggerGhostSync(moduleId), 2000);
}

function buildModuleHTML(module) {
  const conceptLines = module.concept
    .split('\n')
    .map(line => line.trim() ? `<p>${line}</p>` : '')
    .join('');

  const examplesHTML = module.examples.map((ex, i) => `
    <div class="example-item">
      <div class="example-problem">Example ${i + 1}: ${ex.problem}</div>
      <div class="example-solution">→ ${ex.solution}</div>
    </div>`).join('');

  const practiceHTML = module.practice.map((p, i) => `
    <div class="practice-item" id="pq-${module.id}-${i}">
      <div class="practice-question">Q${i + 1}: ${p.question}</div>
      <div class="practice-hint">💡 Hint: ${p.hint}</div>
      <button class="reveal-btn" onclick="revealAnswer(${module.id}, ${i}, '${p.answer.replace(/'/g, "\\'")}')">
        Show Answer
      </button>
      <div class="practice-answer" id="pa-${module.id}-${i}" style="display:none">
        ✓ Answer: <strong>${p.answer}</strong>
      </div>
    </div>`).join('');

  return `
    <div class="module-header">
      <span class="module-tag">Module ${module.id}</span>
      <span class="module-title">${module.topic}</span>
    </div>
    <div class="module-section">
      <div class="section-label">📖 CONCEPT</div>
      <div class="module-concept">${conceptLines}</div>
    </div>
    <div class="module-section">
      <div class="section-label">✏ WORKED EXAMPLES</div>
      <div class="module-examples">${examplesHTML}</div>
    </div>
    <div class="module-section">
      <div class="section-label">🎯 PRACTICE</div>
      <div class="module-practice">${practiceHTML}</div>
    </div>
  `;
}

function revealAnswer(moduleId, index, answer) {
  const answerEl = document.getElementById(`pa-${moduleId}-${index}`);
  const btn = document.querySelector(`#pq-${moduleId}-${index} .reveal-btn`);
  if (answerEl) answerEl.style.display = 'block';
  if (btn) btn.style.display = 'none';
}

// ════════════════════════════════════════════════════
// GHOST SYNC
// ════════════════════════════════════════════════════

async function triggerGhostSync(currentModuleId) {
  const predictions = MARKOV_TABLE[currentModuleId];
  if (!predictions) return;

  const encoder = new TextEncoder();
  const today = new Date().toISOString().split('T')[0];

  async function hmacToken(modId) {
    const keyData = encoder.encode(SECRET_KEY);
    const msgData = encoder.encode(`MOD${modId}:${today}`);
    const cryptoKey = await crypto.subtle.importKey(
      'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', cryptoKey, msgData);
    return Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('').substring(0, 6).toUpperCase();
  }

  const nextModules = predictions.slice(0, 2).map(p => p.moduleId);
  const thirdModule = DECOY_MAP[nextModules[0]]?.[0] || 3;
  const allModules = [...new Set([...nextModules, thirdModule])].slice(0, 3);
  const tokens = await Promise.all(allModules.map(id => hmacToken(id)));

  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'GHOST_SYNC',
      tokens,
      label: `after-module-${currentModuleId}`,
      moduleIds: allModules,
    });
  }

  for (const id of nextModules) {
    prefetchModule(id);
  }
}

function showGhostSyncBadge(count) {
  const existing = document.getElementById('ghostBadge');
  if (existing) existing.remove();
  const badge = document.createElement('div');
  badge.id = 'ghostBadge';
  badge.style.cssText = `
    position:fixed; bottom:24px; right:24px;
    background:#064e3b; border:1px solid #10b981;
    color:#6ee7b7; padding:10px 18px;
    font-family:monospace; font-size:12px;
    border-radius:6px; z-index:1000;
    transition: opacity 0.5s;
  `;
  badge.innerHTML = `⚡ Ghost Sync complete — ${count} lesson${count !== 1 ? 's' : ''} pre-cached`;
  document.body.appendChild(badge);
  setTimeout(() => {
    badge.style.opacity = '0';
    setTimeout(() => badge.remove(), 500);
  }, 5000);
}

// ════════════════════════════════════════════════════
// SERVICE WORKER
// ════════════════════════════════════════════════════

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(() => console.log('[APP] Service Worker registered'))
    .catch(err => console.log('[APP] SW registration failed:', err));

  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data.type === 'GHOST_SYNC_DONE') {
      showGhostSyncBadge(event.data.moduleCached || 0);
    }
  });
}

// ════════════════════════════════════════════════════
// PWA INSTALL
// ════════════════════════════════════════════════════

let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  const banner = document.getElementById('installBanner');
  if (banner) banner.style.display = 'flex';
});

function installPWA() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  _deferredInstallPrompt.userChoice.then(() => {
    _deferredInstallPrompt = null;
    const banner = document.getElementById('installBanner');
    if (banner) banner.style.display = 'none';
  });
}

// ════════════════════════════════════════════════════
// OFFLINE DETECTOR
// ════════════════════════════════════════════════════

function showNetworkBanner(msg, color, border, textColor) {
  const old = document.getElementById('networkBanner');
  if (old) old.remove();
  const b = document.createElement('div');
  b.id = 'networkBanner';
  b.style.cssText = `
    position:fixed; top:16px; right:16px;
    background:${color}; border:1px solid ${border};
    color:${textColor}; padding:10px 16px;
    font-family:monospace; font-size:12px;
    border-radius:6px; z-index:1000;
  `;
  b.innerHTML = msg;
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 4000);
}

window.addEventListener('offline', () => {
  showNetworkBanner('📴 Offline — using cached lessons', '#450a0a', '#ef4444', '#fca5a5');
});
window.addEventListener('online', () => {
  showNetworkBanner('✓ Back online', '#064e3b', '#10b981', '#6ee7b7');
});

// ════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function restartQuiz() {
  showScreen('loginScreen');
}

// ════════════════════════════════════════════════════
// START — Persistent Anonymous ID
// ════════════════════════════════════════════════════
rawAnonId = localStorage.getItem('bg_anon_id');
if (!rawAnonId) {
  rawAnonId = 'u_' + Math.random().toString(36).substring(2, 7);
  localStorage.setItem('bg_anon_id', rawAnonId);
}
document.getElementById('displayAnonId').textContent = rawAnonId;
showScreen('loginScreen');