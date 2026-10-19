/* =========================================================
   Service Worker — Calculadora de Varillas
   ---------------------------------------------------------
   • Precarga los archivos principales para uso sin conexión.
   • HTML: "network first" (siempre intenta la versión más nueva).
   • Resto (CSS, JS, imágenes): "stale-while-revalidate"
     (responde rápido desde caché y actualiza en segundo plano).
   • Para publicar una nueva versión, cambia CACHE_VERSION:
     el SW nuevo se instala, borra la caché anterior y toma
     el control; la página se recarga sola (ver app.js).
   ========================================================= */

const CACHE_VERSION = 'v3.1.1';
const CACHE_NAME = `calc-varillas-${CACHE_VERSION}`;

const ARCHIVOS_APP = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './assets/logo.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

/* Instalación: precarga y activa de inmediato la nueva versión. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ARCHIVOS_APP.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

/* Activación: elimina cachés de versiones anteriores y toma el control. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(
        claves
          .filter((c) => c.startsWith('calc-varillas-') && c !== CACHE_NAME)
          .map((c) => caches.delete(c))
      ))
      .then(() => self.clients.claim())
  );
});

/* Peticiones */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // solo archivos propios

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(staleWhileRevalidate(request, event));
  }
});

/** Red primero; si falla, caché; si no hay nada, index.html. */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const respuesta = await fetch(request);
    if (respuesta.ok) cache.put(request, respuesta.clone());
    return respuesta;
  } catch {
    return (await cache.match(request)) || (await cache.match('./index.html'));
  }
}

/** Responde desde caché y actualiza la copia en segundo plano. */
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const enCache = await cache.match(request);

  const actualizacion = fetch(request)
    .then((respuesta) => {
      if (respuesta.ok) cache.put(request, respuesta.clone());
      return respuesta;
    })
    .catch(() => undefined);

  if (enCache) {
    event.waitUntil(actualizacion);
    return enCache;
  }
  return (await actualizacion) || new Response('Sin conexión', { status: 503, statusText: 'Offline' });
}
