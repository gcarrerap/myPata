// Reloj de turno. Cada teléfono mide el tiempo desde que VIO el turno nuevo (así no importa si los relojes no coinciden).
import { limitMs, autoMove } from "../engine/index.js";
import { SKIP } from "../services/index.js";
import { state, timerOn, mySeat, clockKey } from "./store.js";
import { mutate } from "./actions.js";
import { isBotSeat } from "./bots.js";

// Avanza el reloj. Devuelve null si no hay reloj que mostrar, o { secs, pct, fire }:
// secs = segundos que quedan, pct = barra (0-100), fire = función que resuelve el turno vencido (o null).
// La interfaz pinta secs y pct y luego llama a fire, en ese orden.
export function tickClock(now = Date.now()) {
  const st = state.tableState; if (state.view.screen !== "table") return null;
  const key = clockKey(st);
  if (!key) { state.clock = { key: null, start: 0, fired: false }; return null; }
  if (key !== state.clock.key) state.clock = { key, start: now, fired: false };
  if (!timerOn(st)) return null;
  const limit = limitMs(), left = limit - (now - state.clock.start);
  const secs = Math.max(0, Math.ceil(left / 1000));
  const pct = Math.max(0, Math.min(100, (left / limit) * 100));
  let fire = null;
  if (!state.clock.fired && !isBotSeat(st, st.hand.turn)) {
    // Quien tiene el turno lo resuelve al llegar a 0; los demás esperan 3 s más por si su teléfono no responde
    const seat = mySeat(st), mine = st.hand.turn === seat;
    const grace = state.view.practice || mine ? 0 : 3000;
    if (left <= -grace && (state.view.practice || seat >= 0)) {
      state.clock.fired = true;
      const expect = key;
      fire = () => mutate((s2) => (clockKey(s2) === expect ? autoMove(s2) : SKIP));
    }
  }
  return { secs, pct, fire };
}
