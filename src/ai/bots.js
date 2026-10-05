// La compu: decide la siguiente acción de su turno (una a la vez, igual que una persona). Cada acción trae `why`,
// el motivo en palabras, que también usa el consejo. Solo usa la vista pública (view.js): su mano, la mesa, el pozo
// y lo que los demás levantaron. Antes de proponer una acción la revisa con las reglas del motor.
import { RULES, check, pickupPairs, discardOptions, removeCards, rankOf, rankName, isNatural, isWild, isJoker, isTwo, isRed3,
  cardName, isClosed, meldClass, meetsGoOut } from "../engine/index.js";
import { publicView } from "./view.js";
import { tuneFor } from "./tune.js";
import { byRank, wildsOf, needs, findOpening, chooseDiscard, visibleCount } from "./heuristics.js";

const names = (cards) => cards.map(cardName).join(" ");
const ok = (st, seat, a) => !check(st, seat, a);

// ---------- Robar ----------
function drawDecision(st, seat, v, t, level) {
  const pairs = pickupPairs(st, seat);
  const ranked = pairs.slice().sort((a, b) => kindRank(a) - kindRank(b));
  for (const pair of ranked) {
    if (isRed3(pair[0]) && !wantRed3Meld(v, t)) continue;
    if (isWild(pair[0]) && !(t.specials && v.hand.filter(isWild).length >= 5 && needs(v.melds).dirty === 0)) continue;
    const a = { type: "pickup", pair };
    let why = `Con tu par de ${pairLabel(pair)} te llevas ${Math.min(RULES.pickupN, v.discard.length)} cartas en lugar de 2.`;
    if (v.needsMin) {
      const open = findOpening(removeCards(v.hand, pair), v.minimum, t);
      if (!open) continue;
      a.open = open;
      why += ` Para levantar te bajas antes con ${open.map((g) => names(g)).join(", ")} (sin contar el par ni el pozo).`;
    }
    if (ok(st, seat, a)) return { ...a, why };
  }
  const why = !v.top ? "El pozo está vacío." : v.top[0] === "3" && !isRed3(v.top) ? "Hay un 3 negro en el pozo: no se puede levantar."
    : pairs.length ? (v.needsMin ? `Tienes el par, pero sin él no llegas a los ${v.minimum} puntos para bajarte.` : "No te conviene levantar con ese par.")
    : "No tienes un par para el tope del pozo.";
  return { type: "draw", why };
}
const kindRank = (p) => (isNatural(p[0]) ? 0 : isWild(p[0]) ? 2 : 1);
const pairLabel = (p) => (isRed3(p[0]) ? "3 rojos" : isWild(p[0]) ? "comodines" : rankName(rankOf(p[0])));

// ¿Vale la pena empezar (o levantar para) la pata de 3 rojos? Solo el avanzado, y solo si puede completarla
function wantRed3Meld(v, t) {
  if (!t.specials) return false;
  const mine = v.hand.filter(isRed3).length, onTable = v.melds.filter((m) => m.kind === "red3").reduce((s, m) => s + m.cards.length, 0);
  const unseen = 2 * v.decks - visibleCount(v, "R3");
  return mine + onTable >= 4 && mine + onTable + unseen >= RULES.closeAt + 1;
}

// ---------- Bajar y agregar ----------
function* layCandidates(st, seat, v, t) {
  const melds = v.melds, hand = v.hand, nd = needs(melds);
  if (!v.down[v.team]) {
    const open = findOpening(hand, v.minimum, t);
    if (open) yield { type: "meld", groups: open, why: `Te bajas con ${open.reduce((s, g) => s + g.length, 0)} cartas y llegas a los ${v.minimum} puntos de la ronda ${v.round}.` };
    return;
  }
  // 3 rojos a su pata especial (si quedara incompleta resta 5000)
  const red3s = hand.filter(isRed3), r3 = melds.find((m) => m.kind === "red3");
  if (red3s.length && r3) yield { type: "add", meld: r3.id, cards: red3s, why: "Completa la pata de 3 rojos: incompleta resta 5000." };
  // Comodines a la pata especial de comodines que esté abierta
  for (const m of melds.filter((x) => x.kind === "wild" && !isClosed(x))) {
    const cls = meldClass(m), fit = hand.filter((c) => (cls === "twos" ? isTwo(c) : cls === "jokers" ? isJoker(c) : isWild(c)));
    if (fit.length) yield { type: "add", meld: m.id, cards: fit, why: "Avanza la pata especial de comodines: incompleta resta su valor." };
  }
  // Naturales a la pata abierta de su número
  const nat = byRank(hand);
  for (const [r, cs] of nat) {
    const target = melds.find((m) => m.kind === "natural" && m.rank === r && !isClosed(m));
    if (!target) continue;
    const why = target.cards.length + cs.length >= RULES.closeAt ? `Cierras la pata de ${rankName(r)}.` : `Avanza la pata de ${rankName(r)} (${target.cards.length + cs.length} de 7).`;
    yield { type: "add", meld: target.id, cards: cs, why };
    if (cs.length > 1) yield { type: "add", meld: target.id, cards: cs.slice(0, -1), why };
  }
  // Patas nuevas con tres o más naturales
  for (const [r, cs] of nat) {
    if (cs.length < 3 || melds.some((m) => m.kind === "natural" && m.rank === r && !isClosed(m))) continue;
    yield { type: "meld", groups: [cs], why: `Tienes ${cs.length} de ${rankName(r)}: empieza otra pata.` };
    if (cs.length > 3) yield { type: "meld", groups: [cs.slice(0, -1)], why: `Tienes ${cs.length} de ${rankName(r)}: empieza otra pata.` };
  }
  // Naturales sueltas a una pata cerrada de su número: solo para llegar al siguiente montón o para irse
  // (sin montones y sin poder irse, conviene juntarlas para armar patas nuevas)
  if (v.myPilesLeft > 0 || meetsGoOut(melds)) {
    for (const [r, cs] of nat) {
      if (melds.some((m) => m.kind === "natural" && m.rank === r && !isClosed(m))) continue;
      const target = melds.find((m) => m.kind === "natural" && m.rank === r);
      if (!target) continue;
      const why = v.myPilesLeft > 0 ? `Tu equipo ya cerró la pata de ${rankName(r)}: te deshaces de cartas para llegar a tu siguiente montón.` : `Tu equipo ya puede irse: te deshaces de cartas en la pata de ${rankName(r)}.`;
      yield { type: "add", meld: target.id, cards: cs, why };
      if (cs.length > 1) yield { type: "add", meld: target.id, cards: cs.slice(0, -1), why };
    }
  }
  // Comodines para cerrar patas que ya están cerca
  const wilds = wildsOf(hand);
  const openClean = melds.filter((m) => m.kind === "natural" && !isClosed(m) && meldClass(m) === "clean").length;
  for (const m of melds.filter((x) => x.kind === "natural" && !isClosed(x) && x.cards.length >= t.closeAt)) {
    const need = RULES.closeAt - m.cards.length, natN = m.cards.filter(isNatural).length, wN = m.cards.length - natN;
    if (need > wilds.length || wN + need > natN) continue;
    const dirtyNow = wN > 0;
    if (t.needAware && !dirtyNow && !(nd.dirty > 0 && (nd.clean === 0 || openClean > nd.clean))) continue;
    yield { type: "add", meld: m.id, cards: wilds.slice(0, need), why: `Cierras la pata de ${rankName(m.rank)} con comodín: ${nd.dirty > 0 ? `a tu equipo le faltan ${nd.dirty} sucias` : "ya no hace falta que sea limpia"}.` };
  }
  // Par + comodín para empezar una sucia cuando hacen falta
  if (t.pairWild && (nd.dirty > 0 || t.extraDirty) && wilds.length) {
    const openDirty = melds.filter((m) => m.kind === "natural" && !isClosed(m) && meldClass(m) === "dirty").length;
    if (openDirty < nd.dirty + (t.extraDirty || 0)) {
      for (const [r, cs] of nat) {
        if (cs.length !== 2 || melds.some((m) => m.kind === "natural" && m.rank === r && !isClosed(m))) continue;
        yield { type: "meld", groups: [[...cs, wilds[0]]], why: `A tu equipo le faltan ${nd.dirty} sucias: empiezas una de ${rankName(r)} con un par y un comodín.` };
        break;
      }
    }
  }
  // Para irse: comodines a las patas sucias (sin pasar de un comodín por natural)
  if (meetsGoOut(melds) && (!v.myPilesLeft || t.rush)) {
    for (const w of wilds) for (const m of melds.filter((x) => x.kind === "natural" && meldClass(x) === "dirty")) {
      const natN = m.cards.filter(isNatural).length;
      if (m.cards.length - natN + 1 <= natN) { yield { type: "add", meld: m.id, cards: [w], why: v.myPilesLeft ? "Tu equipo ya puede irse: te deshaces de comodines para llegar antes a tu último montón." : "Tu equipo ya puede irse: te deshaces de los comodines para quedarte sin cartas." }; break; }
    }
  }
  // Patas especiales (solo el avanzado, cuando los comodines ya no hacen falta para las sucias)
  if (t.specials && nd.dirty === 0) {
    const twos = hand.filter(isTwo), jokers = hand.filter(isJoker);
    if (!melds.some((m) => m.kind === "wild" && !isClosed(m))) {
      if (jokers.length >= 5) yield { type: "meld", groups: [jokers], why: "Empiezas la pata de jokers (+3000 completa)." };
      else if (twos.length >= 5) yield { type: "meld", groups: [twos], why: "Empiezas la pata de 2 (+2000 completa)." };
    }
  }
  if (t.specials && RULES.red3FromHand && red3s.length >= 3 && !r3 && wantRed3Meld(v, t)) {
    yield { type: "meld", groups: [red3s], why: "Empiezas la pata de 3 rojos: hay suficientes sin salir para completarla (+5000)." };
  }
}

// Siguiente acción de la compu en su turno: { type, …, why }
export function botMove(st, seat, level = 2) {
  const t = tuneFor(level), v = publicView(st, seat);
  if (st.status !== "playing" || st.hand.turn !== seat) return null;
  if (v.phase === "draw") return drawDecision(st, seat, v, t, level);
  for (const a of layCandidates(st, seat, v, t)) if (ok(st, seat, a)) return a;
  const d = chooseDiscard(v, discardOptions(st, seat), t);
  if (!d) return null;
  const goesOut = v.hand.length === 1 && !v.myPilesLeft;
  return { type: "discard", card: d.card, why: goesOut ? "Con este descarte te vas." : d.why };
}
