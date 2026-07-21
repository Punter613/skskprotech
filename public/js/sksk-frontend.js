// SKSK ProTech service worker
// Bump this on every deploy that changes cached files, or old clients keep
// serving a stale shell indefinitely.
const CACHE_VERSION = 'sksk-shell-v1';
const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache API calls — an estimate or diagnosis served from cache
  // instead of the live backend is a correctness bug, not a convenience.
  if (url.pathname.startsWith('/api/') || url.hostname.includes('onrender.com')) {
    event.respondWith(fetch(request));
    return;
  }

  // App shell: cache-first, falling back to network, so it loads instantly
  // and still works with a weak signal in a driveway or shop bay.
  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request))
  );
});
