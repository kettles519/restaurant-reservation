const CACHE_NAME = 'forest-no9-v1.0.1';
const urlsToCache = [
  '/hq/',
  '/hq/index.html',
  '/hq/vip.html',
  '/hq/owner.html',
  '/hq/manifest.json',
  '/hq/icon.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
  );
});
