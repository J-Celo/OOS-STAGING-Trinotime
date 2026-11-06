'use strict';

/*
 * TrinoTime Version 3 service worker policy
 * ----------------------------------------
 * Authentication and attendance require live Firebase verification, so the worker no longer
 * precaches or serves old executable application shells. Navigation is network-only and marked
 * no-store. Versioned JS/CSS/image requests are left to the browser/HTTP cache using their v=
 * query strings. Activation removes only legacy TrinoTime Cache Storage generations.
 */
const TRINOTIME_SW_VERSION = '3.0.4';
const TRINOTIME_BUILD_FINGERPRINT = 'TT-3.0.4-RC2-STAGING-UX18P46-TRACKER-2.2.63-20261106';
const LEGACY_CACHE_PREFIXES = [
  'trinotime-navigation-',
  'trinotime-static-',
  'trinotime-shell-',
  'trinotime-runtime-',
  'trinotime-assets-',
  'trinotime-precache-',
  'trinotime-app-'
];
const SCOPE_URL = new URL(self.registration.scope);
const VERSION_PATH = new URL('./version.json', SCOPE_URL).pathname;

function isTrinoTimeCache(name) {
  name = String(name || '');
  return LEGACY_CACHE_PREFIXES.some(prefix => name.startsWith(prefix));
}

async function purgeLegacyCaches() {
  const keys = await caches.keys();
  const stale = keys.filter(isTrinoTimeCache);
  await Promise.all(stale.map(key => caches.delete(key)));
  return stale.length;
}

async function broadcastActivation() {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach(client => {
    try {
      client.postMessage({
        type: 'TRINOTIME_SW_ACTIVATED',
        version: TRINOTIME_SW_VERSION,
        fingerprint: TRINOTIME_BUILD_FINGERPRINT
      });
    } catch (_) {}
  });
}

self.addEventListener('install', event => {
  // Do not wait behind an older TrinoTime worker. This is critical for remote PCs that cannot
  // reasonably be expected to clear browser storage manually.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await purgeLegacyCaches();
    await self.clients.claim();
    await broadcastActivation();
  })());
});

self.addEventListener('message', event => {
  const data = event && event.data;
  if (!data || !data.type) return;

  if (data.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (data.type === 'TRINOTIME_PURGE_APP_CACHES') {
    event.waitUntil((async () => {
      const removed = await purgeLegacyCaches();
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ ok: true, removed });
      }
    })());
    return;
  }

  if (data.type === 'TRINOTIME_GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({
      version: TRINOTIME_SW_VERSION,
      fingerprint: TRINOTIME_BUILD_FINGERPRINT,
      cachePolicy: 'network-only-app-shell'
    });
  }
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== SCOPE_URL.origin) return;

  // Never allow an old cached HTML/login shell to control authentication.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })));
    return;
  }

  // The tiny server-build marker must always bypass HTTP cache as well.
  if (url.pathname === VERSION_PATH) {
    event.respondWith(fetch(new Request(request, { cache: 'no-store' })));
  }

  // All other assets intentionally bypass Service Worker Cache Storage. Their ?v= build query
  // controls normal browser caching while preventing cross-release executable reuse.
});
