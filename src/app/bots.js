// La compu: decide y juega una acción a la vez, con un pequeño retraso, como una persona. En práctica, todos los
// asientos menos el tuyo; en una mesa en línea, los asientos marcados como compu (seat.bot).
// En línea no hay servidor: mueve a la compu el teléfono del jugador humano sentado en el asiento más bajo; los demás
// humanos sentados son respaldo y esperan BACKUP_MS más por si ese teléfono no está. Cada acción se guarda con una
// transacción que solo aplica si la mesa sigue igual (turnKey), así nunca cuenta dos veces la misma jugada.
import { apply } from "../engine/index.js";
import { SKIP, updateTable } from "../services/index.js";
import { state, notify, turnKey, mySeat } from "./store.js";
import { runAI } from "./ai-client.js";

export const BOT_NAMES = ["Lupe", "Toño", "Chuy"];
export const BACKUP_MS = 4000;
// Pausa antes de cada acción de la compu (ms): robar, bajar o agregar, descartar
export const BOT_DELAY = { draw: 700, lay: 550, discard: 650 };

// ¿Ese asiento lo juega la compu?
export function isBotSeat(st, s) {
  if (state.view.practice) return s !== 0;
  return !!(st.seats[s] && st.seats[s].bot);
}
// Qué papel tiene este teléfono para mover a la compu: "primary", "backup" o null (no la mueve)
export function botRole(st) {
  if (state.view.practice) return "primary";
  const me = mySeat(st); if (me < 0) return null; // solo mirando: no mueve
  const humans = st.seats.map((s, i) => (s && !s.bot ? i : -1)).filter((i) => i >= 0);
  return humans[0] === me ? "primary" : "backup";
}
export function botActor(st) {
  if (!st || st.status !== "playing") return null;
  return isBotSeat(st, st.hand.turn) ? { seat: st.hand.turn } : null;
}

// Programa la siguiente acción de la compu, si le toca. Se llama cada vez que se dibuja la mesa.
// Se calcula en un hilo aparte (ai-client.js). Mientras piensa, state.botTimer sigue ocupado para que no se programe
// otra; si sales de la mesa (leave lo limpia) o la mesa cambia mientras tanto, el resultado se descarta.
export function scheduleBot() {
  const st0 = state.tableState;
  if (!st0 || state.botTimer) return;
  if (!state.view.practice && !(st0.seats && st0.seats.some((s) => s && s.bot))) return;
  const role = botRole(st0); if (!role) return;
  const act = botActor(st0); if (!act) return;
  const key = turnKey(st0);
  const wait = st0.hand.phase === "draw" ? BOT_DELAY.draw : BOT_DELAY.lay;
  const id = setTimeout(async () => {
    if (state.botTimer !== id) return; // se canceló
    const st = state.tableState;
    if (turnKey(st) !== key) { state.botTimer = null; scheduleBot(); return; } // cambió la mesa mientras esperaba
    const a = botActor(st); if (!a || !botRole(st)) { state.botTimer = null; return; }
    let m;
    try { m = await runAI("botMove", st, a.seat, (st.seats[a.seat] && st.seats[a.seat].level) || 2); }
    catch (e) { console.warn("La compu no pudo decidir:", e); m = null; }
    if (state.botTimer !== id) return; // saliste de la mesa mientras pensaba
    if (!m) { state.botTimer = null; return; }
    const { why, ...action } = m;
    const decide = (s) => apply(s, a.seat, action);
    if (state.view.practice) {
      if (state.tableState !== st) { state.botTimer = null; scheduleBot(); return; } // la mesa cambió mientras pensaba
      state.botTimer = null;
      try { state.tableState = decide(st); } catch (e) { console.warn("Jugada inválida de la compu:", e); }
      notify();
      return;
    }
    // En línea: se guarda solo si la mesa sigue igual (otro teléfono pudo adelantarse)
    try { await updateTable(state.db, state.view.code, (s) => (turnKey(s) === key ? decide(s) : SKIP)); }
    catch (e) { console.warn("No se pudo guardar la jugada de la compu:", e); }
    if (state.botTimer === id) { state.botTimer = null; scheduleBot(); }
  }, role === "backup" ? wait + BACKUP_MS : wait);
  state.botTimer = id;
}
