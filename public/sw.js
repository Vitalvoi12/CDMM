// Service worker: keeps the app shell cached so CDMM opens without internet
// (data already lives in localStorage and syncs when the server is reachable),
// receives Web Push messages for event reminders, lets the page show
// notifications via registration.showNotification (required on Android) and
// brings the app forward on tap.

const SHELL_CACHE = 'cdmm-shell-v1';
const STATIC_FILES = ['/manifest.json', '/logo.png', '/favicon.svg'];
const ASSET_RE = /\/assets\/[^"'\s>)]+/g;

/**
 * Fetch index.html, store it, and store the hashed bundles it references plus
 * the fonts those stylesheets reference (every subset, so text in a script
 * first seen offline still renders).
 */
async function cacheShell() {
  const cache = await caches.open(SHELL_CACHE);
  const res = await fetch('/', { cache: 'no-cache' });
  if (!res.ok) return;
  const html = await res.clone().text();
  const assets = new Set(html.match(ASSET_RE) || []);
  for (const css of [...assets].filter((u) => u.endsWith('.css'))) {
    const text = await (await fetch(css)).text();
    for (const u of text.match(ASSET_RE) || []) assets.add(u);
  }
  await Promise.all([...assets].map(async (url) => {
    if (!(await cache.match(url))) await cache.add(url);
  }));
  await cache.put('/', res);
  // Bundles from older builds are no longer referenced; drop them.
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    if (path.startsWith('/assets/') && !assets.has(path)) await cache.delete(req);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(STATIC_FILES).catch(() => {});
    await cacheShell().catch(() => {});
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== SHELL_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (req.mode === 'navigate') {
    // Network first so a new build shows up at once; the cached shell when
    // offline or when the server is too slow to answer.
    event.respondWith((async () => {
      try {
        const res = await withTimeout(fetch(req), 4000);
        if (res.ok) event.waitUntil(cacheShell().catch(() => {}));
        return res;
      } catch {
        const cached = await caches.match('/', { cacheName: SHELL_CACHE });
        return cached || Response.error();
      }
    })());
    return;
  }
  if (url.pathname.startsWith('/assets/') || STATIC_FILES.includes(url.pathname)) {
    event.respondWith(cacheFirst(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

self.addEventListener('push', (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data ? event.data.text() : '' };
  }
  // iOS revokes the subscription if a push ends without a visible notification.
  event.waitUntil(
    self.registration.showNotification(msg.title || 'CDMM', {
      body: msg.body || '',
      tag: msg.tag,
      icon: '/logo.png',
      badge: '/logo.png',
      data: { url: msg.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ('focus' in w) return w.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
