// Patas en la mesa: validar, limpia o sucia, cerrada, especiales y agregar cartas. Funciones puras.
//
// Una pata es { id, kind, rank, cards }:
//   kind "natural": cartas del mismo número (4 al A) con comodines; nunca más comodines que naturales
//   kind "wild":    pata especial de comodines (solo 2 y jokers); rank "W"
//   kind "red3":    pata especial de 3 rojos; rank "3"
// Se cierra al llegar a 7 cartas y puede seguir creciendo, pero ya no puede cambiar de clase: una limpia cerrada no
// acepta comodines, una de puros 2 no acepta jokers y una de puros jokers no acepta 2.
import { RULES } from "./config.js";
import { rankOf, isWild, isJoker, isTwo, isRed3, isBlack3, isNatural } from "./cards.js";

export const isClosed = (m) => m.cards.length >= RULES.closeAt;
export const wildCount = (cards) => cards.filter(isWild).length;

// Clase de una pata según sus cartas: clean | dirty (normal), twos | jokers | mixed (comodines), red3
export function meldClass(m) {
  if (m.kind === "red3") return "red3";
  if (m.kind === "wild") return m.cards.every(isTwo) ? "twos" : m.cards.every(isJoker) ? "jokers" : "mixed";
  return wildCount(m.cards) ? "dirty" : "clean";
}
export const isSpecial = (m) => m.kind !== "natural";
// Bono de una pata especial (lo que suma completa, o resta incompleta)
export const specialValue = (m) => (isSpecial(m) ? RULES.specials[meldClass(m)] : 0);

// Qué pata formarían estas cartas: { kind, rank } o un error con el motivo
export function groupOf(cards) {
  if (!cards.length) return { error: "Escoge cartas." };
  if (cards.some(isBlack3)) return { error: "Los 3 negros nunca se bajan." };
  if (cards.some(isRed3)) {
    if (!cards.every(isRed3)) return { error: "Los 3 rojos solo van en su pata especial, sin comodines." };
    return { kind: "red3", rank: "3" };
  }
  if (cards.every(isWild)) return { kind: "wild", rank: "W" };
  const nat = cards.filter(isNatural), ranks = new Set(nat.map(rankOf));
  if (ranks.size > 1) return { error: "Una pata lleva cartas del mismo número." };
  if (wildCount(cards) > nat.length) return { error: "Nunca puede haber más comodines que naturales." };
  return { kind: "natural", rank: nat[0][0] };
}

// ¿Estas cartas pueden formar una pata nueva? Devuelve el error (texto) o null.
export function checkNewMeld(cards) {
  const g = groupOf(cards);
  if (g.error) return g.error;
  if (cards.length < 3) return "Una pata nueva lleva al menos 3 cartas.";
  return null;
}

// ¿Se pueden agregar estas cartas a la pata m? Devuelve el error (texto) o null.
export function checkAdd(m, cards) {
  if (!cards.length) return "Escoge cartas.";
  const all = m.cards.concat(cards), g = groupOf(all);
  if (g.error) return g.error;
  if (g.kind !== m.kind || (m.kind === "natural" && g.rank !== m.rank)) return "Esas cartas no van en esa pata.";
  const next = { ...m, cards: all };
  if (isClosed(m) && meldClass(next) !== meldClass(m)) {
    return m.kind === "natural" ? "Una pata limpia cerrada ya no se puede ensuciar." : "Esa pata especial ya está cerrada con otra clase de comodín.";
  }
  return null;
}

// ¿A cuál pata normal abierta de este número irían? (una abierta por número y por equipo)
export const openMeldOf = (melds, kind, rank) => melds.find((m) => m.kind === kind && m.rank === rank && !isClosed(m)) || null;

// Patas cerradas de un equipo: limpias y sucias (las especiales cuentan aparte)
export function closedCounts(melds) {
  let clean = 0, dirty = 0;
  for (const m of melds) {
    if (m.kind !== "natural" || !isClosed(m)) continue;
    if (meldClass(m) === "clean") clean++; else dirty++;
  }
  return { clean, dirty };
}
export const meetsGoOut = (melds) => { const c = closedCounts(melds); return c.clean >= RULES.goOut.clean && c.dirty >= RULES.goOut.dirty; };
