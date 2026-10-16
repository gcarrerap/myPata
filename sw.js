// Service worker del juego. Para los archivos del propio sitio, pide siempre primero al servidor y obliga a
// confirmar que el archivo sigue igual (cache: "no-cache"), así el navegador nunca se queda con una versión vieja.
// Guarda una copia de cada archivo para usarla solo si no hay conexión (la práctica funciona sin internet).
// Firebase, Google y cualquier otro sitio no pasan por aquí.
const PREFIX = "mypata-";
const CACHE = PREFIX + "v1";

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
  // Borra SOLO cachés viejos de esta app y toma control de las pestañas abiertas. Los cachés son por dominio: en
  // gcarrerap.github.io viven también otras apps (Noli, La Pata, myDomino, Juegos de la Familia), y borrar todo lo
  // que no sea CACHE les quitaba su copia para jugar sin conexión.
  for (const key of await caches.keys()) if (key !== CACHE && key.startsWith(PREFIX)) await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("fetch", (event) => {
  const p = handle(event.request, self.location.origin);
  if (p) event.respondWith(p);
});

// Para las pruebas en Node
if (typeof module !== "undefined") module.exports = { handle, networkFirst, CACHE, PREFIX };
