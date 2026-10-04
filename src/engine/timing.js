// Tiempo por turno y jugada automática cuando se acaba. Funciones puras.
import { RULES, teamOf } from "./config.js";
import { isBlack3, isRed3, isWild, cardValue, rankOf } from "./cards.js";
import { meetsGoOut } from "./melds.js";
import { apply, discardOptions } from "./moves.js";
import { pushLog, nameOf } from "./table.js";

export const limitMs = () => RULES.turnMs;

// Carta que se descarta sola: un 3 negro (tapa el pozo), luego un 3 rojo (no resta si no lo tienes), luego la
// natural más suelta y de menos valor. Nunca un comodín si hay otra cosa.
export function autoDiscard(st, seat) {
  const opts = discardOptions(st, seat); if (!opts.length) return null;
  const hand = st.hand.hands[seat];
  const count = (r) => hand.filter((c) => rankOf(c) === r).length;
  const score = (c) => (isBlack3(c) ? 0 : isRed3(c) ? 1 : isWild(c) ? 1000 + cardValue(c) : 10 + count(rankOf(c)) * 20 + cardValue(c));
  return opts.slice().sort((a, b) => score(a) - score(b))[0];
}

// Se acabó el tiempo: si no ha robado, roba del mazo; luego descarta (lo que bajó antes se queda en la mesa)
export function autoMove(st, env = {}) {
  if (!st || st.status !== "playing") return st;
  const seat = st.hand.turn, n0 = st.hand.history.length;
  let s = st;
  if (s.hand.phase === "draw") s = apply(s, seat, { type: "draw" }, env);
  if (s.status === "playing" && s.hand.turn === seat && s.hand.phase === "play") {
    const c = autoDiscard(s, seat);
    if (c) s = apply(s, seat, { type: "discard", card: c }, env);
  }
  if (s === st) return st;
  // Marca como automáticas las acciones que hizo el reloj
  const h = s.hand;
  for (let i = n0; i < h.history.length; i++) h.history[i].auto = true;
  s.log = pushLog(s.log, `Se acabó el tiempo de ${nameOf(st, seat)}`);
  return s;
}

export const canGoOut = (st, seat) => meetsGoOut(st.hand.melds[teamOf(st, seat)]);
