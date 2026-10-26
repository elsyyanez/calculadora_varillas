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

const CACHE_VERSION = 'v3.3.1';
const CACHE_NAME = `calc-varillas-${CACHE_VERSION}`;

/* Widget (panel Win+W): la página guarda aquí el último resultado.
   El nombre NO empieza con "calc-varillas-" para que `activate` no lo borre. */
const CACHE_WIDGET = 'varillas-widget-datos';
const TAG_WIDGET = 'ultimo-calculo';
const MIN_INTERVALO_WIDGET = 60 * 60 * 1000; // 1 hora
const URL_DATOS = new URL('widgets/varillas-datos.json', self.registration.scope).href;
const URL_PLANTILLA = new URL('widgets/varillas-plantilla.json', self.registration.scope).href;

const ARCHIVOS_APP = [
  './widgets/varillas-plantilla.json',
  './widgets/varillas-datos.json',
  './',
  './index.html',
  './style.css',
  './app.js',
  './exportar.js',
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
      .then(() => actualizarWidgets())
  );
});

/* ---------------------------------------------------------
   Widget de Windows 11 (Win+W)
   --------------------------------------------------------- */

/** Datos del widget: el último resultado guardado por la página o, si no hay, los de fábrica. */
async function leerDatosWidget() {
  const cache = await caches.open(CACHE_WIDGET);
  const guardado = await cache.match(URL_DATOS);
  if (guardado) return guardado.text();
  return (await fetch(URL_DATOS)).text();
}

/** Actualiza todos los widgets instalados (si el navegador soporta widgets). */
async function actualizarWidgets(widgetEvento) {
  if (!self.widgets) return;
  try {
    const instalados = await self.widgets.matchAll();
    // En widgetinstall/widgetresume la instancia nueva puede no estar aún en matchAll(): se usa la del evento.
    const tags = [...new Set([
      ...instalados.map((w) => w.definition.tag),
      ...(widgetEvento ? [widgetEvento.definition.tag] : []),
    ])];
    if (!tags.length) return;
    const [template, data] = await Promise.all([
      fetch(URL_PLANTILLA).then((r) => r.text()),
      leerDatosWidget(),
    ]);
    await Promise.all(tags.map((tag) => self.widgets.updateByTag(tag, { template, data })));
  } catch (err) {
    console.warn('No se pudo actualizar el widget:', err);
  }
}

self.addEventListener('widgetinstall', (event) => {
  event.waitUntil((async () => {
    await actualizarWidgets(event.widget);
    try {
      await self.registration.periodicSync.register(TAG_WIDGET, { minInterval: MIN_INTERVALO_WIDGET });
    } catch (err) {
      console.warn('Sin sincronización periódica:', err); // el widget sigue funcionando con los avisos de la página
    }
  })());
});

self.addEventListener('widgetresume', (event) => {
  event.waitUntil(actualizarWidgets(event.widget));
});

self.addEventListener('widgetuninstall', (event) => {
  // Solo se quita la sincronización si era la última instancia del widget.
  if (event.widget.instances.length <= 1) {
    event.waitUntil(
      self.registration.periodicSync.unregister(event.widget.definition.tag).catch(() => {})
    );
  }
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === TAG_WIDGET) event.waitUntil(actualizarWidgets());
});

self.addEventListener('widgetclick', (event) => {
  const destino = event.action === 'nuevo' ? 'index.html?nuevo=1' : 'index.html';
  event.waitUntil(self.clients.openWindow(new URL(destino, self.registration.scope).href));
});

/* La página avisa cuando cambia el dato que muestra el widget. */
self.addEventListener('message', (event) => {
  if (event.data && event.data.tipo === 'widget-actualizar') {
    event.waitUntil(actualizarWidgets());
  }
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
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match('./index.html'));
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
