// Daily Droplet service worker
const CACHE_NAME = 'droplet-daily-v1';
const ASSETS = [
  '/daily/',
  '/daily/daily_droplet.html',
  '/daily/manifest-daily.json',
  '/daily/icon-192.png',
  '/daily/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never cache Firestore/auth/network calls
  if (url.hostname.includes('firebaseio') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic')) return;
  e.respondWith(
    caches.match(e.request).then(cached =>
      cached || fetch(e.request).then(resp => {
        if (e.request.method === 'GET' && resp.ok && url.origin === location.origin) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return resp;
      }).catch(() => cached)
    )
  );
});
