// Service worker del juego. Para los archivos del propio sitio, pide siempre primero al servidor y obliga a
// confirmar que el archivo sigue igual (cache: "no-cache"), así el navegador nunca se queda con una versión vieja.
// Guarda una copia de cada archivo para usarla solo si no hay conexión (la práctica funciona sin internet).
// Firebase, Google y cualquier otro sitio no pasan por aquí.
const CACHE = "mypata-v1";

// Decide qué hacer con una petición; devuelve una promesa de respuesta, o null para no intervenir
function handle(request, origin) {
  if (request.method !== "GET") return null;
  if (new URL(request.url).origin !== origin) return null;
  return networkFirst(request);
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request, { cache: "no-cache" });
    if (response && response.ok) await cache.put(request, response.clone());
    return response;
  } catch (e) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    throw e;
  }
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  // Borra cachés de versiones anteriores de este archivo y toma control de las pestañas abiertas
  for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (event) => {
  const p = handle(event.request, self.location.origin);
  if (p) event.respondWith(p);
});

// Para las pruebas en Node
if (typeof module !== "undefined") module.exports = { handle, networkFirst, CACHE };
