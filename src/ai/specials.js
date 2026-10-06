// Patas especiales (3 rojos y comodines): si todavía hay tiempo para completarlas, si quedan cartas para hacerlo y
// si conviene no irse para esperar a completarlas. Funciones puras sobre la vista pública (view.js).
import { RULES, isRed3, isTwo, isJoker, isWild, isClosed, meldClass, closedCounts, specialValue, meetsGoOut } from "../engine/index.js";
import { visibleCount } from "./heuristics.js";

// Las cartas que le sirven a una pata especial de esta clase
export const fitsSpecial = (cls) => (cls === "red3" ? isRed3 : cls === "twos" ? isTwo : cls === "jokers" ? isJoker : isWild);

// Cuántas cartas de esa clase no se han visto (ni en mi mano, ni en la mesa, ni en el pozo, ni levantadas por otros)
export function unseenFor(v, cls) {
  const twos = 4 * v.decks - visibleCount(v, "2"), jokers = 2 * v.decks - visibleCount(v, "X");
  if (cls === "red3") return 2 * v.decks - visibleCount(v, "R3");
  return cls === "twos" ? twos : cls === "jokers" ? jokers : twos + jokers;
}

// ¿La ronda ya va para terminar? Algún equipo ya puede irse o le falta poco, o el mazo se está acabando.
// Así nadie empieza una pata especial que ya no le va a dar tiempo de completar (y que restaría lo mismo).
export function roundLate(v, t) {
  const G = RULES.goOut;
  for (const ms of v.allMelds) {
    const c = closedCounts(ms);
    if (Math.min(c.clean, G.clean) + Math.min(c.dirty, G.dirty) >= (t.lateAt ?? 7)) return true;
  }
  return v.stockCount < 12 * v.n;
}

// ¿Quedan suficientes cartas para completar una pata a la que le faltan `need`? (para no irse mientras tanto)
export function feasible(v, cls, need, margin = 0) {
  return need <= 0 || unseenFor(v, cls) >= need + margin;
}

// ¿Vale la pena empezar una pata especial de esta clase con `mine` cartas? Las que no se han visto se reparten entre
// todos los equipos (al mío le toca más o menos 1 de cada nTeams), así que hace falta que esa parte alcance, con un
// margen. Si otro equipo ya tiene abierta una de la misma clase, se pelean las mismas cartas: no se empieza.
// share: qué parte de las que no se han visto le llega en la práctica a mi equipo antes de que acabe la ronda. Es
// menos de 1/nTeams: muchas siguen en el mazo al final, y los 3 rojos que tira el rival se quedan enterrados en el
// pozo (solo se levantan con un par de 3 rojos). Se calibró con partidas simuladas.
export function startable(v, cls, mine, margin = 1, share = 1 / v.nTeams) {
  const need = RULES.closeAt - mine;
  if (need <= 0) return true;
  const rival = v.allMelds.some((ms, team) => team !== v.team && ms.some((m) => m.kind !== "natural" && !isClosed(m) && (cls === "red3") === (m.kind === "red3")));
  if (rival) return false;
  return unseenFor(v, cls) * share >= need + margin;
}

// Patas especiales de mi equipo sin completar que todavía se pueden completar
export function openSpecials(v) {
  return v.melds.filter((m) => m.kind !== "natural" && !isClosed(m)).map((m) => {
    const cls = meldClass(m), mine = v.hand.filter(fitsSpecial(cls)).length, need = RULES.closeAt - m.cards.length - mine;
    return { m, cls, need, can: feasible(v, cls, need, 0), value: specialValue(m) };
  });
}

// ¿Conviene no irse todavía? Si el equipo ya puede irse pero tiene una pata especial incompleta que todavía se puede
// completar, irse ahora la deja restando. Se espera mientras completarla valga más que lo que da irse (+500 y las
// patas de más, que solo cuentan para el equipo que se va).
export function holdForSpecial(v) {
  if (!meetsGoOut(v.melds)) return null;
  const c = closedCounts(v.melds), G = RULES.goOut, P = RULES.points;
  const gain = P.out + Math.max(0, c.clean - G.clean) * P.clean + Math.max(0, c.dirty - G.dirty) * P.dirty;
  return openSpecials(v).find((x) => x.can && x.value > gain) || null;
}
