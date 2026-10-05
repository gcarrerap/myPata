// Criterios compartidos por los niveles de la compu: armar la primera bajada, contar lo que falta, estimar qué
// tan probable es que el siguiente levante una carta y escoger el descarte. Funciones puras sobre la vista pública.
import { RULES, NATURAL_RANKS, rankOf, isNatural, isWild, isJoker, isTwo, isRed3, isBlack3, cardValue, sumValues, cardOrder,
  closedCounts, isClosed, meldClass } from "../engine/index.js";

// Cuántas copias hay de una clase de carta (con decks barajas: 6, u 8 con 6 jugadores)
export const COPIES = (c, decks = RULES.decks) => (isJoker(c) ? 2 * decks : isThree0(c) ? 2 * decks : 4 * decks);
const isThree0 = (c) => c[0] === "3";
const rankKey = (c) => (isRed3(c) ? "R3" : isBlack3(c) ? "B3" : isJoker(c) ? "X" : rankOf(c));

export const byRank = (cards) => {
  const m = new Map();
  for (const c of cards) if (isNatural(c)) { const r = rankOf(c); if (!m.has(r)) m.set(r, []); m.get(r).push(c); }
  return m;
};
// Comodines en el orden en que conviene gastarlos: primero los 2, luego los jokers
export const wildsOf = (cards) => cards.filter(isWild).sort((a, b) => isJoker(a) - isJoker(b) || cardOrder(a) - cardOrder(b));

// Lo que le falta al equipo para poder irse
export function needs(melds) {
  const c = closedCounts(melds);
  return { clean: Math.max(0, RULES.goOut.clean - c.clean), dirty: Math.max(0, RULES.goOut.dirty - c.dirty), closedClean: c.clean, closedDirty: c.dirty };
}

// Arma una primera bajada que llegue al mínimo con estas cartas, o null. Usa primero las tercias de naturales;
// si no alcanza, pares con un comodín y luego comodines extra (los 2 antes que los jokers).
export function findOpening(cards, minimum, t) {
  const all = wildsOf(cards);
  // El avanzado primero intenta sin jokers (valen mucho para las patas sucias y la especial)
  if (t.saveJokers) { const g = openingWith(cards, all.filter(isTwo), minimum); if (g) return g; }
  return openingWith(cards, all, minimum);
}
function openingWith(cards, wilds, minimum) {
  const groups = [], pairs = [];
  for (const [, cs] of byRank(cards)) { if (cs.length >= 3) groups.push(cs.slice()); else if (cs.length === 2) pairs.push(cs.slice()); }
  let total = groups.reduce((s, g) => s + sumValues(g), 0);
  pairs.sort((a, b) => sumValues(b) - sumValues(a));
  for (const wc of wilds) {
    if (total >= minimum) break;
    if (pairs.length) { const p = pairs.shift(); p.push(wc); groups.push(p); total += sumValues(p); continue; }
    const g = groups.find((x) => x.filter(isNatural).length > x.filter(isWild).length);
    if (!g) break;
    g.push(wc); total += cardValue(wc);
  }
  return total >= minimum && groups.length ? groups : null;
}

// Cartas que ya se ven (mi mano, todas las patas, el pozo y lo que los demás levantaron)
export function visibleCount(v, key) {
  let n = 0;
  const add = (c) => { if (rankKey(c) === key) n++; };
  v.hand.forEach(add);
  for (const ms of v.allMelds) for (const m of ms) m.cards.forEach(add);
  v.discard.forEach(add);
  v.known.forEach((k, s) => { if (s !== v.seat) k.forEach(add); });
  return n;
}

// Probabilidad de que el asiento s tenga al menos `need` cartas de esta clase entre las que no se le conocen
function probAtLeast(v, s, key, need, sample) {
  if (need <= 0) return 1;
  const copies = COPIES(sample, v.decks);
  const unseen = Math.max(0, copies - visibleCount(v, key));
  let pool = 54 * v.decks - v.hand.length - v.discard.length;
  for (const ms of v.allMelds) for (const m of ms) pool -= m.cards.length;
  v.known.forEach((k, i) => { if (i !== v.seat) pool -= k.length; });
  const H = Math.max(0, v.handCounts[s] - v.known[s].length);
  if (pool <= 0 || !unseen || !H) return 0;
  const p = Math.min(1, unseen / pool), q = 1 - p;
  const p0 = q ** H, p1 = H * p * q ** (H - 1);
  return need === 1 ? 1 - p0 : Math.max(0, 1 - p0 - p1);
}

// Qué tan peligroso es descartar c: probabilidad de que el siguiente levante el pozo con ella (0 a 1)
export function danger(v, c, t) {
  if (isBlack3(c)) return 0;
  if (isWild(c)) return 1; // con un comodín en el pozo se levanta con cualquier par
  const key = rankKey(c), s = v.next;
  const kn = v.known[s].filter((x) => rankKey(x) === key).length;
  if (kn >= 2) return 1;
  if (t.danger) return probAtLeast(v, s, key, 2 - kn, c);
  return kn ? 0.5 : 0;
}

// Qué tan útil es quedarse con c (más alto = guardarla)
export function keepValue(v, c) {
  if (isBlack3(c)) return -100;
  if (isRed3(c)) return v.melds.some((m) => m.kind === "red3") ? 400 : -50;
  if (isWild(c)) return 1000 + cardValue(c);
  const r = rankOf(c), k = v.hand.filter((x) => isNatural(x) && rankOf(x) === r).length;
  if (v.melds.some((m) => m.kind === "natural" && m.rank === r)) return 60 + cardValue(c);
  if (k >= 3) return 300;
  if (k === 2) return 150 + cardValue(c);
  return 10 + cardValue(c);
}

// Escoge el descarte entre las opciones: lo menos útil y menos peligroso. Devuelve { card, why }.
export function chooseDiscard(v, options, t) {
  let best = null;
  for (const c of options) {
    const d = t.danger || t.known ? danger(v, c, t) : 0;
    const risk = t.danger ? d * t.danger : d >= 1 ? t.known : d > 0 ? t.known / 2 : 0;
    const score = keepValue(v, c) + risk;
    if (!best || score < best.score || (score === best.score && cardOrder(c) < cardOrder(best.card))) best = { card: c, score, d };
  }
  if (!best) return null;
  const c = best.card;
  let why;
  if (isBlack3(c)) why = "Un 3 negro tapa el pozo: el siguiente no lo puede levantar.";
  else if (isRed3(c)) why = "Así no te cuenta −500 al final de la ronda.";
  else if (isWild(c)) why = "No queda otra carta que descartar.";
  else {
    const k = v.hand.filter((x) => isNatural(x) && rankOf(x) === rankOf(c)).length;
    why = k === 1 ? "Es una carta suelta y no tienes pata de ese número." : "Es la carta que menos te sirve.";
    if (t.danger) why += ` Probabilidad estimada de que el siguiente la levante: ${Math.round(100 * best.d)}%.`;
    else if (t.known && best.d === 0) why += " El siguiente no ha levantado cartas de ese número.";
  }
  return { card: c, why };
}

export { isClosed, meldClass, NATURAL_RANKS, isTwo };
