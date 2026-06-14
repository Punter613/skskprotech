const CACHE_VERSION = 'sksk-v1.2.0';
const CACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event - cache essential files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => {
        console.log('[SW] Caching app shell');
        return cache.addAll(CACHE_URLS).catch(err => {
          console.warn('[SW] Cache addAll error:', err);
        });
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_VERSION)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.origin !== location.origin) return;

  // API requests - network first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const cache_copy = response.clone();
            caches.open(CACHE_VERSION).then(cache => {
              cache.put(request, cache_copy);
            });
          }
          return response;
        })
        .catch(err => {
          console.warn('[SW] API offline:', err);
          return caches.match(request)
            .then(cached => cached || new Response(
              JSON.stringify({ success: false, error: 'Offline' }),
              { status: 503, headers: new Headers({ 'Content-Type': 'application/json' }) }
            ));
        })
    );
    return;
  }

  // Static assets - cache first
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;
        return fetch(request)
          .then(response => {
            if (response.ok) {
              caches.open(CACHE_VERSION).then(cache => {
                cache.put(request, response.clone());
              });
            }
            return response;
          })
          .catch(() => new Response('Offline', { status: 503 }));
      })
  );
});
