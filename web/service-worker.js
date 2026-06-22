// SISTEMA DE CACHÉ DESHABILITADO TEMPORALMENTE (Para pruebas/desarrollo)
// Este script purgará todas las cachés anteriores y forzará la actualización directa desde la red.

self.addEventListener('install', (event) => {
  // Fuerza al nuevo service worker a tomar control inmediatamente
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Eliminar TODAS las cachés existentes
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => caches.delete(key)));
    }).then(() => {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Bypass total de caché: siempre ir a la red
  event.respondWith(fetch(event.request));
});

// Desregistrar este service worker para evitar futuras intercepciones
self.registration.unregister().then(function() {
  console.log("Service Worker temporalmente deshabilitado y cachés purgadas.");
});
