const CACHE_NAME = 'elite-coaching-v2.0.10';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/client/client.html',
  '/trainer/index.html',
  '/shared/style.css',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(ASSETS_TO_CACHE);
      })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignorar peticiones que no sean GET o que sean para la API
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  // ESTRATEGIA: Network First (Red primero), con fallback a Caché.
  // Esto asegura compatibilidad y estabilidad total con los nuevos cambios 
  // (y desarrollo futuro), garantizando que los usuarios siempre descarguen
  // los archivos más recientes, pero aún tengan acceso offline rápido si la red falla.
  event.respondWith(
    fetch(event.request).then((networkResponse) => {
      return caches.open(CACHE_NAME).then((cache) => {
        cache.put(event.request, networkResponse.clone());
        return networkResponse;
      });
    }).catch(() => {
      // Si la red falla, intentamos usar la caché
      return caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Fallback básico para páginas si se está offline y no hay caché de la página exacta
        if (event.request.url.includes('.html')) {
          return caches.match('/');
        }
      });
    })
  );
});
