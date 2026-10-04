// Cartas de La Pata: notación, color, valor para el mínimo, las 6 barajas y revolver. Funciones puras.
//
// Cada carta es un texto de 3 caracteres: número + palo + baraja.
//   número: A 2 3 4 5 6 7 8 9 T J Q K (T = 10) y X para el joker
//   palo:   S ♠, H ♥, D ♦, C ♣; los jokers usan R (rojo) o B (negro)
//   baraja: 0 a 5
// Ejemplos: "KH3" (rey de corazones de la baraja 3), "TS0" (10 de espadas), "XR2" (joker rojo de la baraja 2).
// Así cada una de las 324 cartas es única y se puede seguir sin ambigüedad (dónde está, quién la levantó).

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K"];
export const SUITS = ["S", "H", "D", "C"];
// Números con los que se arma una pata normal (los 2 son comodines y los 3 son tapones)
export const NATURAL_RANKS = ["4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];

export const rankOf = (c) => c[0];
export const suitOf = (c) => c[1];
export const isJoker = (c) => c[0] === "X";
export const isTwo = (c) => c[0] === "2";
export const isWild = (c) => isJoker(c) || isTwo(c);
export const isThree = (c) => c[0] === "3";
export const isRed = (c) => c[1] === "H" || c[1] === "D" || c[1] === "R";
export const isRed3 = (c) => isThree(c) && isRed(c);
export const isBlack3 = (c) => isThree(c) && !isRed(c);
// Natural: se puede usar en una pata normal (ni comodín ni tapón)
export const isNatural = (c) => !isWild(c) && !isThree(c);

// Valor de una carta para el mínimo de la primera bajada
export function cardValue(c) {
  const r = c[0];
  if (r === "X") return 50;
  if (r === "A" || r === "2") return 20;
  if ("89TJQK".includes(r)) return 10;
  return 5; // 3 al 7
}
export const sumValues = (cards) => cards.reduce((s, c) => s + cardValue(c), 0);

// Orden para mostrar y ordenar: 3 negros, 3 rojos, 4…K, A, 2, jokers
const ORDER = ["3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A", "2", "X"];
export const rankOrder = (r) => ORDER.indexOf(r);
export function cardOrder(c) {
  const r = rankOrder(c[0]) * 2 + (isThree(c) && isRed(c) ? 1 : 0);
  return r * 100 + "SHDCRB".indexOf(c[1]) * 10 + Number(c.slice(2));
}
export const sortCards = (cards) => cards.slice().sort((a, b) => cardOrder(a) - cardOrder(b));

// Nombre corto para mostrar: "K", "10", "Joker"
export const RANK_NAME = { A: "A", T: "10", J: "J", Q: "Q", K: "K", X: "Joker" };
export const rankName = (r) => RANK_NAME[r] || r;
export const SUIT_SYMBOL = { S: "♠", H: "♥", D: "♦", C: "♣", R: "★", B: "★" };
export const cardName = (c) => (isJoker(c) ? "Joker" : rankName(c[0]) + SUIT_SYMBOL[c[1]]);

// Las 6 barajas con sus jokers: 324 cartas
export function fullDeck(decks = 6) {
  const out = [];
  for (let d = 0; d < decks; d++) {
    for (const r of RANKS) for (const s of SUITS) out.push(r + s + d);
    out.push("XR" + d, "XB" + d);
  }
  return out;
}

export function shuffle(arr, rnd = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Quita cartas de una lista (por id); truena si alguna no está
export function removeCards(list, cards) {
  const out = list.slice();
  for (const c of cards) {
    const i = out.indexOf(c);
    if (i < 0) throw new Error("No tienes esa carta.");
    out.splice(i, 1);
  }
  return out;
}
