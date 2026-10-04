// Grabación de partidas. Cada ronda que termina se guarda en el servidor, para poder estudiar partidas reales y
// mejorar a la compu. No se ve en la interfaz: no hay botones ni avisos, y si algo falla no se muestra ningún error.
//
// - Cola local: la ronda se guarda primero en localStorage y se sube cuando hay conexión (la práctica funciona sin
//   internet). Si la cola crece demasiado, se descartan las más viejas.
// - En línea graban todos los teléfonos con persona sentada; el id fijo de cada ronda y las reglas de Firestore
//   (solo crear) hacen que solo cuente la primera. A los demás Firestore les responde "permission-denied" y la
//   descartan. Por eso las reglas (firestore.rules) deben publicarse antes que esta versión del juego.
import { roundRecordId, buildRoundRecord } from "../engine/index.js";
import { ls } from "../services/index.js";

export const QUEUE_KEY = "pata.rec";
export const SEEN_KEY = "pata.recSeen";
export const MAX_QUEUE = 60; // rondas (~15-30 KB cada una)
export const MAX_SEEN = 300;

const readJson = (store, k, dflt) => { try { const v = JSON.parse(store.get(k) || "null"); return Array.isArray(v) ? v : dflt; } catch { return dflt; } };

// store: { get, set } (localStorage); getDb: () => adaptador de Firestore o null; save(db, rec): Promise
export function createRecorder({ store = ls, getDb, save }) {
  let queue = readJson(store, QUEUE_KEY, []).filter((x) => x && x.id); // registros por subir, en orden
  let seenList = readJson(store, SEEN_KEY, []);
  const seen = new Set(seenList);
  let flushing = null, again = false;
  const persist = () => { store.set(QUEUE_KEY, JSON.stringify(queue)); store.set(SEEN_KEY, JSON.stringify(seenList)); };

  // Si st es una ronda terminada que todavía no se grabó en este teléfono, la pone en la cola y trata de subirla.
  function capture(st, ctx) {
    try {
      const id = roundRecordId(st);
      if (!id || seen.has(id)) return false;
      const rec = buildRoundRecord(st, ctx);
      if (!rec) return false;
      seen.add(id); seenList = [...seenList, id].slice(-MAX_SEEN);
      queue = [...queue, rec].slice(-MAX_QUEUE);
      persist();
      flush();
      return true;
    } catch { return false; }
  }

  // Sube lo que haya en la cola, en orden. Si falla la conexión, se queda para la próxima vez.
  function flush() {
    if (flushing) { again = true; return flushing; } // llegó otra ronda mientras se subían: se sube al terminar
    const db = getDb && getDb();
    if (!db || !queue.length) return Promise.resolve();
    flushing = (async () => {
      let ok = true;
      try {
        for (const item of queue.slice()) {
          try {
            await save(db, item);
            queue = queue.filter((x) => x !== item);
          } catch (e) {
            // Ya la grabó otro teléfono de la mesa (las reglas solo dejan crear): se descarta
            if (e && (e.code === "permission-denied" || e.code === "already-exists")) { queue = queue.filter((x) => x !== item); continue; }
            ok = false; break; // sin conexión u otro error pasajero: se reintenta después
          }
        }
        persist();
      } catch {} finally {
        flushing = null;
        if (again) { again = false; if (ok) flush(); }
      }
    })();
    return flushing;
  }

  return { capture, flush, pending: () => queue.slice() };
}
