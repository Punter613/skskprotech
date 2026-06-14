const VERSION = 'v1.2.0-sksk';
const STATIC_CACHE = `sksk-static-${VERSION}`;
const DATA_CACHE = `sksk-data-${VERSION}`;
const QUEUE_DB = 'sksk-queues-db';
const QUEUE_STORE = 'requests';

const API_BASE = 'https://api.skskprotech.com';

const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico'
];

function openQueueDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function queueRequest(data) {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).add(data);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueued() {
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function clearQueued(ids) {
  if (!ids.length) return;
  const db = await openQueueDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    const store = tx.objectStore(QUEUE_STORE);
    ids.forEach(id => store.delete(id));
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(PRECACHE_ASSETS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => k.startsWith('sksk-') && k !== STATIC_CACHE && k !== DATA_CACHE)
        .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method === 'GET') {
    if (url.origin === self.location.origin) {
      event.respondWith(cacheFirst(req));
      return;
    }
    if (url.origin === API_BASE) {
      event.respondWith(networkFirst(req));
      return;
    }
  }

  if (req.method === 'POST' && url.origin === API_BASE) {
    event.respondWith(handlePost(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaque') cache.put(req, res.clone());
    return res;
  } catch {
    return cached || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(req) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const res = await fetch(req);
    if (res.ok && res.type !== 'opaque') cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req, { ignoreSearch: true });
    return cached || new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handlePost(req) {
  const contentType = req.headers.get('content-type') || '';
  let body = null;

  try {
    if (contentType.includes('application/json')) body = await req.clone().json();
    else body = await req.clone().text();
  } catch {
    body = null;
  }

  try {
    const res = await fetch(req.clone());
    if (res.ok) return res;
  } catch {}

  await queueRequest({
    url: req.url,
    method: req.method,
    headers: [...req.headers.entries()],
    body,
    timestamp: Date.now()
  });

  if (self.registration.sync) {
    try { await self.registration.sync.register('sksk-sync'); } catch {}
  }

  return new Response(JSON.stringify({ queued: true, offline: true }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' }
  });
}

self.addEventListener('sync', event => {
  if (event.tag === 'sksk-sync') event.waitUntil(flushQueue());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data?.type === 'FLUSH_QUEUE') event.waitUntil(flushQueue());
});

async function flushQueue() {
  const queued = await getQueued();
  const done = [];

  for (const item of queued) {
    try {
      const headers = new Headers(item.headers || []);
      const init = { method: item.method, headers };

      if (item.body !== null && item.body !== undefined) {
        init.body = typeof item.body === 'string' ? item.body : JSON.stringify(item.body);
      }

      const res = await fetch(item.url, init);
      if (res.ok) done.push(item.id);
    } catch {}
  }

  if (done.length) await clearQueued(done);
}
