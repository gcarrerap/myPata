// Aviso de versión nueva: mientras el juego está abierto, revisa cada rato si se publicó otra versión.
// Si sí, marca state.updateAvailable para que la interfaz muestre "Hay una versión nueva · Actualizar".
// No recarga sola: así no interrumpe a nadie a media partida.
import { VERSION } from "../version.js";
import { fetchPublishedVersion, registerServiceWorker } from "../services/index.js";
import { state, notify } from "./store.js";

export const UPDATE_CHECK_EVERY_MS = 5 * 60 * 1000;

export async function checkForUpdate(fetchVersion = fetchPublishedVersion) {
  if (state.updateAvailable) return true;
  const published = await fetchVersion();
  if (published && published !== VERSION) { state.updateAvailable = published; notify(); return true; }
  return false;
}

let timer = null;
// Activa el service worker y revisa cada 5 minutos y cada vez que la pestaña vuelve a estar a la vista
export function startUpdateChecks() {
  if (timer) return;
  registerServiceWorker();
  timer = setInterval(() => checkForUpdate(), UPDATE_CHECK_EVERY_MS);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") checkForUpdate(); });
}

// Carga la versión nueva completa (el service worker se encarga de que no quede nada viejo)
export function applyUpdate() { location.reload(); }
