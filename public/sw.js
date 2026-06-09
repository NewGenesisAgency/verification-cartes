/*
 * Service worker minimal — stratégie « réseau d'abord, cache en repli ».
 * En ligne : toujours frais. Hors-ligne : sert la dernière version mise en cache.
 * (Activé uniquement en production, voir ServiceWorkerRegister.)
 */
const CACHE = 'mdl-runtime-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET' || !req.url.startsWith('http')) return;

    event.respondWith(
        fetch(req)
            .then((res) => {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
                return res;
            })
            .catch(() => caches.match(req)),
    );
});
