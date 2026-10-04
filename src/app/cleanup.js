// Limpieza de mesas abandonadas: las mesas en línea se borran después de un rato sin ningún cambio
// (nadie se sienta, nadie juega). El límite depende del estado de la mesa. No hay servidor: lo hace cualquier
// jugador que tenga el lobby abierto.
import { isEmptyTable } from "../engine/index.js";
import { SKIP, updateTable } from "../services/index.js";
import { state } from "./store.js";

const MIN = 60 * 1000;
// Sin personas y sin repartir: margen corto para que no desaparezca mientras alguien se cambia de asiento
export const EMPTY_TABLE_GRACE_MS = 5 * MIN;
// Con personas sentadas pero sin repartir: quien se sentó y cerró la app sin levantarse
export const WAITING_TABLE_IDLE_MS = 60 * MIN;
// Partida empezada o terminada sin jugadas: largo para no borrar una partida que se pausó un rato
export const STARTED_TABLE_IDLE_MS = 6 * 60 * MIN;
export const CLEANUP_EVERY_MS = 60 * 1000;

// Cuánto tiempo sin cambios aguanta una mesa antes de borrarse, según su estado
export function idleLimitMs(st) {
  if (isEmptyTable(st)) return EMPTY_TABLE_GRACE_MS;
  if (st.status === "lobby") return WAITING_TABLE_IDLE_MS;
  return STARTED_TABLE_IDLE_MS;
}

const inFlight = new Set(); // mesas que ya se están borrando (para no pedirlo dos veces)

// Revisa la lista del lobby y borra las mesas que llevan más de su límite sin cambios. Antes de borrar vuelve a
// leer la mesa dentro de una transacción: si cambió desde entonces (otra versión, o pasó a otro estado, por
// ejemplo alguien se sentó), no se borra.
// Devuelve una promesa con los códigos borrados, que termina cuando acabaron los borrados que se pidieron.
export function cleanupInactiveTables(now = Date.now()) {
  if (!state.db) return Promise.resolve([]);
  const jobs = [];
  for (const st of state.listCache) {
    if (inFlight.has(st.code)) continue;
    const updated = state.listUpdated[st.code];
    const limit = idleLimitMs(st);
    if (typeof updated !== "number" || now - updated < limit) continue;
    inFlight.add(st.code);
    jobs.push(updateTable(state.db, st.code, (cur) => (cur.v === st.v && idleLimitMs(cur) === limit ? null : SKIP))
      .then((skipped) => (skipped ? null : st.code))
      .catch(() => null) // ya no existe, o las reglas de Firestore no lo permiten: no pasa nada
      .finally(() => inFlight.delete(st.code)));
  }
  return Promise.all(jobs).then((codes) => codes.filter(Boolean));
}
