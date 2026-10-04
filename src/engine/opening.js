// Bajarse por primera vez en la ronda: el mínimo de puntos y la prueba de bajada al levantar el pozo. Funciones puras.
import { minimumFor, teamOf } from "./config.js";
import { sumValues } from "./cards.js";

// ¿Este asiento necesita llegar al mínimo para bajar? (si su compañero ya se bajó, no)
export const needsMinimum = (st, seat) => !st.hand.down[teamOf(st, seat)];
export const minimumNow = (st) => minimumFor(st.roundNo);
export const openingValue = (groups) => groups.reduce((s, g) => s + sumValues(g), 0);

// Error (texto) si estas patas nuevas no alcanzan el mínimo de la ronda, o null
export function checkMinimum(st, groups) {
  const need = minimumNow(st), have = openingValue(groups);
  return have >= need ? null : `Para bajarte necesitas ${need} puntos en la ronda ${st.roundNo} (llevas ${have}).`;
}
