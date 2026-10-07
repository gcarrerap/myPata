// Consejo: qué haría cada nivel de la compu en tu lugar, paso a paso, y por qué.
// Al robar solo se aconseja la decisión de robar (lo que sigue depende de cartas que todavía no se ven).
// Después de robar se simula el resto del turno de cada nivel: lo que bajaría, lo que agregaría y qué descartaría.
import { apply, cardName, meldLabel, teamOf } from "../engine/index.js";
import { botMove } from "./bots.js";

// Texto corto de una acción, para mostrarla
export function describeAction(st, seat, a) {
  const names = (cs) => cs.map(cardName).join(" ");
  switch (a.type) {
    case "draw": return "Robar 2 del mazo";
    case "pickup": return `Levantar el pozo con ${names(a.pair)}` + (a.open ? ` (te bajas con ${a.open.map(names).join(" · ")})` : "");
    case "meld": return a.groups.length === 1 ? `Bajar ${names(a.groups[0])}` : `Bajarte con ${a.groups.map(names).join(" · ")}`;
    case "add": {
      const m = st.hand.melds[teamOf(st, seat)].find((x) => x.id === a.meld);
      return `Agregar ${names(a.cards)} a la pata de ${m ? meldLabel(m) : "?"}`;
    }
    case "discard": return `Descartar ${cardName(a.card)}`;
    default: return "";
  }
}

function planFor(st, seat, level) {
  const steps = [];
  let s = st;
  for (let guard = 0; guard < 40 && s.status === "playing" && s.hand.turn === seat; guard++) {
    const a = botMove(s, seat, level, { random: false });
    if (!a) break;
    steps.push({ action: stripWhy(a), text: describeAction(s, seat, a), why: a.why, first: steps.length === 0 });
    if (a.type === "draw" || a.type === "pickup" || a.type === "discard") break;
    const pile = s.hand.pileNo[seat];
    try { s = apply(s, seat, stripWhy(a), { now: 0 }); } catch { break; }
    // Si con eso se queda sin cartas abre su siguiente montón: lo que sigue depende de cartas que todavía no ve
    if (s.status === "playing" && s.hand.pileNo[seat] !== pile) { steps.push({ action: null, text: "Abres tu siguiente montón", why: "Te quedaste sin cartas antes de descartar: sigues tu turno con el montón nuevo.", first: false }); break; }
  }
  return steps;
}
const stripWhy = ({ why, ...a }) => a;

// { phase, levels: [{ level, steps: [{ action, text, why }] }] }
export function advise(st, seat) {
  if (!st || st.status !== "playing" || st.hand.turn !== seat) return { phase: null, levels: [] };
  return { phase: st.hand.phase, levels: [1, 2, 3].map((level) => ({ level, steps: planFor(st, seat, level) })) };
}
