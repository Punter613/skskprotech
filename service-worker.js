const CACHE_VERSION = 'v1.2.0';
const CACHE_NAME = `sksk-protech-${CACHE_VERSION}`;
const API_CACHE = `sksk-api-${CACHE_VERSION}`;

// Files to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/service-worker.js'
];

// API routes to cache (read-only, no data mutations)
const CACHEABLE_APIS = [
  'GET:/api/health',
  'GET:/api/config'
];

self.addEventListener('install', event => {
  console.log('[SW] Installing', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Install error:', err))
  );
});

self.addEventListener('activate', event => {
  console.log('[SW] Activating', CACHE_NAME);
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (cacheName !== CACHE_NAME && cacheName !== API_CACHE) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const { method, url } = request;

  // Skip non-GET requests and API mutations
  if (method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }

  // HTML: Network-first, fallback to cache
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
          }
          return response;
        })
        .catch(() => caches.match(request).then(r => r || createOfflineHTML()))
    );
    return;
  }

  // API GET requests: Cache-first with network fallback
  if (url.includes('/api/')) {
    event.respondWith(
      caches.match(request)
        .then(cached => {
          if (cached) return cached;
          return fetch(request).then(response => {
            if (response.ok && response.status === 200) {
              caches.open(API_CACHE).then(cache => cache.put(request, response.clone()));
            }
            return response;
          });
        })
        .catch(() => {
          console.warn('[SW] API request failed:', url);
          return createErrorResponse('API unavailable. Check your connection.');
        })
    );
    return;
  }

  // Static assets: Cache-first
  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request))
      .catch(err => {
        console.error('[SW] Fetch error:', err);
        return createErrorResponse('Resource not available');
      })
  );
});

self.addEventListener('message', event => {
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function createOfflineHTML() {
  return new Response(
    `<!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>SKSK ProTech — Offline</title>
      <style>
        body { margin: 0; padding: 2rem; background: #050505; color: #ff2a2a; font-family: Arial, sans-serif; }
        .container { max-width: 560px; margin: 0 auto; }
        h1 { font-size: 1.8rem; margin-bottom: 1rem; }
        p { color: #b85a5a; line-height: 1.6; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>⚠️ Offline</h1>
        <p>You're currently offline. Some features may not be available.</p>
        <p>Previously cached data is still available. Try refreshing or check your connection.</p>
      </div>
    </body>
    </html>`,
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    }
  );
}

function createErrorResponse(message) {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status: 500,
      statusText: 'Internal Server Error',
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

// Background sync for queued requests
self.addEventListener('sync', event => {
  if (event.tag === 'sync-estimates') {
    event.waitUntil(syncEstimates());
  }
});

async function syncEstimates() {
  try {
    const db = await openIndexedDB();
    const pending = await getPendingEstimates(db);
    
    for (const estimate of pending) {
      try {
        await fetch('/api/estimate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(estimate.data)
        });
        
        await deleteEstimate(db, estimate.id);
      } catch (err) {
        console.error('[SW] Sync error for estimate:', err);
      }
    }
  } catch (err) {
    console.error('[SW] Background sync failed:', err);
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('sksk-protech', 1);
    
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    
    req.onupgradeneeded = event => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('estimates')) {
        const store = db.createObjectStore('estimates', { keyPath: 'id', autoIncrement: true });
        store.createIndex('synced', 'synced', { unique: false });
      }
    };
  });
}

function getPendingEstimates(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('estimates', 'readonly');
    const store = tx.objectStore('estimates');
    const index = store.index('synced');
    const req = index.getAll(false);

    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function deleteEstimate(db, id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('estimates', 'readwrite');
    const req = tx.objectStore('estimates').delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
