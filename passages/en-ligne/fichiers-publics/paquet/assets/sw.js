// Service worker : l'application s'ouvre hors connexion, avec les articles et les fiches consultés récemment.
const VERSION = 'biblio-v14';
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const PDFS = `${VERSION}-pdf`;
const MAX_PDFS = 40;
const MAX_DATA = 400;

// bibliothèque, puis atelier (absent de l'édition bibliothèque seule : ces fichiers sont simplement ignorés)
const SHELL_FILES = [
  '/', '/static/style.css', '/static/app.js', '/static/core.js', '/static/reader.js', '/static/notes.js',
  '/static/dashboard.js', '/static/ocr.js', '/static/demarrage.js', '/static/envoi.js', '/favicon.svg', '/manifest.webmanifest',
  '/static/atelier/atelier.css', '/static/atelier/extension.js', '/static/atelier/common.js', '/static/atelier/tables.js',
  '/static/atelier/record.js', '/static/atelier/home.js', '/static/atelier/palette.js', '/static/atelier/vendor/editor.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.all(SHELL_FILES.map((u) => c.add(new Request(u, { credentials: 'same-origin' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (!k.startsWith(VERSION)) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, cacheName, max) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaqueredirect' && !res.redirected) {
      c.put(req, res.clone()).then(() => trim(cacheName, max)).catch(() => {});
    }
    return res;
  } catch (err) {
    const hit = await c.match(req, { ignoreVary: true });
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const c = await caches.open(cacheName);
  const hit = await c.match(req);
  const net = fetch(req).then((res) => {
    if (res.ok || res.type === 'opaque') c.put(req, res.clone()).catch(() => {});
    return res;
  }).catch(() => null);
  return hit || (await net) || new Response('Hors connexion', { status: 503 });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // bibliothèques externes (pdf.js, polices, OCR) : gardées en cache
  if (url.origin !== location.origin) {
    if (/cdn\.jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(url.host)) e.respondWith(staleWhileRevalidate(req, SHELL));
    return;
  }
  if (url.pathname.startsWith('/mcp') || url.pathname === '/login' || url.pathname.startsWith('/api/export') || url.pathname.startsWith('/api/login')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(async () => (await caches.match('/', { cacheName: SHELL })) || Response.error()));
    return;
  }
  if (/^\/api\/items\/[a-z0-9]+\/pdf$/.test(url.pathname) && !url.searchParams.has('download')) {
    e.respondWith(networkFirst(req, PDFS, MAX_PDFS));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(networkFirst(req, DATA, MAX_DATA));
    return;
  }
  // code de l'application : réseau d'abord (jamais de mélange d'anciennes et de nouvelles versions), cache hors connexion
  if (url.pathname.startsWith('/static/') || url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    e.respondWith(networkFirst(req, SHELL, 300));
  }
});
