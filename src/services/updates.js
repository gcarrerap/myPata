// Versiones nuevas del juego: registrar el service worker y consultar qué versión está publicada.

// Registra sw.js (en la raíz del sitio). Si el navegador no lo soporta o falla, el juego funciona igual.
export async function registerServiceWorker() {
  try {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
    await navigator.serviceWorker.register(new URL("../../sw.js", import.meta.url), { updateViaCache: "none" });
    return true;
  } catch (e) { console.warn("No se pudo activar la carga de versiones nuevas:", e); return false; }
}

// Lee la versión publicada directo del servidor (sin caché). Devuelve null si no se pudo saber.
export async function fetchPublishedVersion(url = new URL("../version.js", import.meta.url)) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    const m = (await res.text()).match(/VERSION\s*=\s*["']([^"']+)["']/);
    return m ? m[1] : null;
  } catch { return null; }
}
