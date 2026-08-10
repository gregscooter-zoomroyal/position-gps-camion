/**
 * Service worker Position · GPS Camion
 * Cache-first pour les assets statiques, network-first pour les navigations.
 */
var CACHE_NAME = 'position-gps-v4';

var STATIC_ASSETS = [
  './',
  './index.html',
  './nav-pro.js',
  './truck-network.js',
  './auth.js',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
  'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // Précharge asset par asset (CDN/fonts peuvent échouer hors HTTPS)
      return Promise.all(STATIC_ASSETS.map(function (url) {
        return cache.add(url).catch(function () { return null; });
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME) return caches.delete(key);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

function isNavigationRequest(request) {
  return request.mode === 'navigate' ||
    (request.method === 'GET' && request.headers.get('accept') &&
      request.headers.get('accept').indexOf('text/html') !== -1);
}

function isStaticAsset(url) {
  var href = url.href;
  if (STATIC_ASSETS.indexOf(url.pathname) !== -1) return true;
  if (STATIC_ASSETS.some(function (a) { return href === a || href.indexOf(a) === 0; })) return true;
  // Chemins locaux connus
  var path = url.pathname;
  if (/\/(index\.html|nav-pro\.js|auth\.js)?$/.test(path)) return true;
  if (href.indexOf('cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/') !== -1) return true;
  if (href.indexOf('fonts.googleapis.com') !== -1) return true;
  if (href.indexOf('fonts.gstatic.com') !== -1) return true;
  return false;
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;

  var url;
  try {
    url = new URL(request.url);
  } catch (e) {
    return;
  }

  // Network-first pour les navigations HTML
  if (isNavigationRequest(request)) {
    event.respondWith(
      fetch(request).then(function (response) {
        var copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(request, copy);
        });
        return response;
      }).catch(function () {
        return caches.match(request).then(function (cached) {
          return cached || caches.match('./index.html') || caches.match('./');
        });
      })
    );
    return;
  }

  // Cache-first pour le statique (app + Leaflet + polices)
  if (isStaticAsset(url) || url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(function (cached) {
        if (cached) return cached;
        return fetch(request).then(function (response) {
          if (response && (response.ok || response.type === 'opaque')) {
            var copy = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(request, copy);
            });
          }
          return response;
        });
      })
    );
  }
});
