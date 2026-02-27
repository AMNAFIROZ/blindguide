// ════════════════════════════════════════════════════
// BLINDGUIDE — sw.js  (Service Worker v2)
// Handles: app shell cache, module download cache, Ghost Sync
// ════════════════════════════════════════════════════

const CACHE_NAME = 'blindguide-v2';
const MODULE_CACHE = 'blindguide-modules-v2';
const SERVER = 'https://blindguide-server.onrender.com';

const APP_SHELL = ['/index.html', '/app.js', '/manifest.json'];

// ── INSTALL ─────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// ── ACTIVATE ────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== MODULE_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ── FETCH INTERCEPT ──────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // /bundle → network-first, cache on success
  if (url.pathname === '/bundle') {
    event.respondWith(networkFirstBundle(event.request));
    return;
  }

  // /module/:id → cache-first (modules are static for 24h)
  if (url.pathname.startsWith('/module/')) {
    event.respondWith(cacheFirstModule(event.request));
    return;
  }

  // /modules/manifest → network-first
  if (url.pathname === '/modules/manifest') {
    event.respondWith(networkFirstGeneric(event.request));
    return;
  }

  // App shell (HTML, JS, CSS) → cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

async function networkFirstBundle(request) {
  try {
    const response = await fetch(request.clone());
    const cache = await caches.open(MODULE_CACHE);
    await cache.put(request, response.clone());
    return response;
  } catch {
    console.log('[SW] Offline — serving /bundle from cache');
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ modules: [], offline: true }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function cacheFirstModule(request) {
  const cached = await caches.match(request);
  if (cached) {
    console.log('[SW] Module served from cache:', request.url);
    return cached;
  }
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(MODULE_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Offline and module not cached yet' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

async function networkFirstGeneric(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
    return response;
  } catch {
    return caches.match(request);
  }
}

// ── GHOST SYNC MESSAGE HANDLER ───────────────────────
// app.js sends: { type: 'GHOST_SYNC', tokens, label, moduleIds }
self.addEventListener('message', async event => {
  if (event.data.type !== 'GHOST_SYNC') return;

  const { tokens, label, moduleIds } = event.data;
  console.log(`[SW] Ghost Sync started — "${label}", predicting: ${moduleIds?.join(', ')}`);

  let bundleCached = 0;
  let moduleCached = 0;

  // ── Part A: Cache the bundle response (12-byte ZK request) ──
  try {
    const bytes = buildGhostBytes(tokens);
    const bundleRes = await fetch(`${SERVER}/bundle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes.buffer,
    });
    if (bundleRes.ok) {
      const cache = await caches.open(MODULE_CACHE);
      await cache.put(new Request(`${SERVER}/bundle`), bundleRes.clone());
      bundleCached = 1;
    }
  } catch {
    console.log('[SW] Ghost Sync bundle fetch failed (offline?)');
  }

  // ── Part B: Download each predicted module individually ──
  if (moduleIds && moduleIds.length > 0) {
    const cache = await caches.open(MODULE_CACHE);
    for (const id of moduleIds) {
      try {
        const modReq = new Request(`${SERVER}/module/${id}`, { cache: 'reload' });
        // Still log if skipping actual storage, but we want the fetch to happen for visibility
        const existing = await cache.match(modReq);
        if (existing) {
          console.log(`[SW] Module ${id} already in cache — re-fetching for sync visibility`);
        }
        const modRes = await fetch(modReq);
        if (modRes.ok) {
          await cache.put(modReq, modRes.clone());
          moduleCached++;
          console.log(`[SW] Ghost Sync cached Module ${id}`);
        }
      } catch {
        console.log(`[SW] Ghost Sync failed for module ${id}`);
      }
    }
  }

  const total = bundleCached + moduleCached;
  console.log(`[SW] Ghost Sync done — ${moduleCached}/3 modules fetched for "${label}"`);

  // Notify all app clients
  const clients = await self.clients.matchAll();
  clients.forEach(client =>
    client.postMessage({
      type: 'GHOST_SYNC_DONE',
      label,
      moduleCached,
      moduleIds,
    })
  );
});

// ── HELPERS ──────────────────────────────────────────
function buildGhostBytes(tokens) {
  const bytes = new Uint8Array(12);
  bytes[0] = 0x01; // version
  bytes[1] = 0x01; // ghost sync flag

  function hexToBytes(hex, target, offset) {
    for (let i = 0; i < 3; i++) {
      target[offset + i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16) || i;
    }
  }

  if (tokens[0]) hexToBytes(tokens[0], bytes, 2);
  if (tokens[1]) hexToBytes(tokens[1], bytes, 5);
  if (tokens[2]) hexToBytes(tokens[2], bytes, 8);

  let xor = 0;
  for (let i = 0; i < 11; i++) xor ^= bytes[i];
  bytes[11] = xor;
  return bytes;
}