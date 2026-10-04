// Lo que cualquier jugador puede saber de los demás: las cartas que cada quien levantó del pozo (se vieron al
// levantarlas) y que todavía no ha bajado ni descartado, cuántas cartas tiene y cuántos montones le quedan.
// Cada carta tiene un id único, así que se puede seguir exacta.
import { teamOf, isRed3, rankOf } from "../engine/index.js";

// known[s] = cartas que el asiento s levantó del pozo y siguen en su mano
export function knownCards(st) {
  const h = st.hand, known = st.seats.map(() => []);
  if (!h) return known;
  for (const e of h.history) {
    const k = known[e.s];
    if (e.a === "pickup") { k.push(...e.taken); }
    const out = e.a === "meld" ? e.groups.flat() : e.a === "add" ? e.cards : e.a === "discard" ? [e.card] : e.a === "pickup" ? (e.open || []).flat() : [];
    for (const c of out) { const i = k.indexOf(c); if (i >= 0) k.splice(i, 1); }
  }
  return known;
}

// Registro de un jugador visto por viewer: cuántas cartas tiene, montones, si su equipo ya se bajó, lo que se sabe
// que tiene y lo que ha descartado en esta ronda
export function tracker(st, viewer, target) {
  const h = st.hand, known = knownCards(st)[target];
  const discarded = h.history.filter((e) => e.s === target && e.a === "discard").map((e) => e.card);
  const pickups = h.history.filter((e) => e.s === target && e.a === "pickup").length;
  const byRank = {};
  for (const c of known) byRank[rankOf(c)] = (byRank[rankOf(c)] || 0) + 1;
  return {
    count: h.hands[target].length, pilesLeft: h.piles[target].length, pileNo: h.pileNo[target],
    down: h.down[teamOf(st, target)], known, byRank, discarded, pickups,
    red3Known: known.filter(isRed3).length,
  };
}
