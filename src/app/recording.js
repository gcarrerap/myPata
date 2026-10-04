// Conecta la grabación de partidas con la app: cada vez que cambia el estado se revisa si acaba de terminar una
// ronda; no hace falta llamarla desde las acciones ni desde la interfaz.
import { saveRoundRecord } from "../services/index.js";
import { VERSION } from "../version.js";
import { state, subscribe, mySeat } from "./store.js";
import { createRecorder } from "./recorder.js";

export const recorder = createRecorder({ getDb: () => state.db, save: saveRoundRecord });

let hadDb = false;
export function onStateChange() {
  try {
    if (state.db && !hadDb) recorder.flush(); // se acaba de conectar: sube lo que quedó pendiente
    hadDb = !!state.db;
    const st = state.tableState, view = state.view;
    if (!st || view.screen !== "table") return;
    const practice = !!view.practice;
    if (!practice && mySeat(st) < 0) return; // solo mirando: no graba
    recorder.capture(st, {
      mode: practice ? "practice" : "online", app: VERSION,
      isBot: (s) => (practice ? s !== 0 : !!(st.seats[s] && st.seats[s].bot)),
    });
  } catch {}
}
subscribe(onStateChange);
