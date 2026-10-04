// Reglas configurables de La Pata: modos de juego, equipos, mínimos por ronda, valores y bonos.
// Las reglas que todavía no están confirmadas (ver el issue #1) son opciones de RULES, para cambiarlas sin tocar el resto.

export const RULES = {
  decks: 6, // barajas con jokers (324 cartas)
  piles: 3, // montones por jugador
  perPile: 11, // cartas por montón
  sample: 5, // cartas que se abren como muestra (pozo inicial)
  drawN: 2, // cartas que se roban del mazo
  pickupN: 5, // cartas que se levantan del pozo
  closeAt: 7, // cartas para cerrar una pata
  rounds: 4,
  minimums: [60, 90, 120, 150], // mínimo para bajarse en las rondas 1 a 4
  goOut: { clean: 5, dirty: 5 }, // patas cerradas que necesita el equipo para irse
  points: { clean: 500, dirty: 300, out: 500, red3: -500 },
  // Patas especiales (bono si se completan, castigo igual si quedan incompletas)
  specials: { red3: 5000, jokers: 3000, twos: 2000, mixed: 1500 },
  // --- Por confirmar (issue #1) ---
  // El equipo que no se fue cobra sus primeras 5 limpias y 5 sucias; las extra solo cuentan para quien se fue.
  // false: el equipo que no se fue no cobra ninguna pata normal.
  baseCountsForAll: true,
  // La pata de 3 rojos se puede empezar bajándolos de la mano (true) o solo levantando el pozo (false)
  red3FromHand: true,
  // Tiempo por turno cuando la mesa tiene reloj
  turnMs: 60000,
};

// config: { n: 2|3|4, teams: bool, timer: bool }. Parejas solo con 4 jugadores (cruzadas: asientos 0 y 2 contra 1 y 3).
export function validConfig(c) {
  if (![2, 3, 4].includes(c.n)) return false;
  if (c.teams && c.n !== 4) return false;
  return true;
}
export const teamOf = (st, seat) => (st.config.teams ? seat % 2 : seat);
export const nTeams = (c) => (c.teams ? 2 : c.n);
export const teamSeats = (st, team) => st.seats.map((_, i) => i).filter((i) => teamOf(st, i) === team);
export const minimumFor = (round) => RULES.minimums[Math.min(RULES.minimums.length, Math.max(1, round)) - 1];
