// Reglas configurables de La Pata: modos de juego, equipos, mínimos por ronda, valores y bonos.
// Las reglas que todavía no están confirmadas (ver el issue #1) son opciones de RULES, para cambiarlas sin tocar el resto.

export const RULES = {
  decks: 6, // barajas con jokers (324 cartas) con 2 a 4 jugadores
  decks6: 8, // con 6 jugadores (432 cartas), issue #12
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

// config: { n: 2|3|4|6, teams, timer: bool }. teams es cuántos hay por equipo: false (individual), true o 2
// (parejas), 3 (equipos de 3). Los compañeros quedan repartidos alrededor de la mesa: el equipo de un asiento es
// asiento mod (número de equipos).
//   4 en parejas: 0 y 2 contra 1 y 3 (cruzadas)
//   6 en parejas (3 parejas): 0 y 3, 1 y 4, 2 y 5 (cada quien con el de enfrente)
//   6 en equipos de 3: 0, 2 y 4 contra 1, 3 y 5 (alternados)
// Con 6 no hay individual (seis zonas de patas no caben en un teléfono).
export const teamSize = (c) => (c.teams === true ? 2 : Number(c.teams) || 1);
export function validConfig(c) {
  if (![2, 3, 4, 6].includes(c.n)) return false;
  const size = teamSize(c);
  if (c.n === 4) return size === 1 || size === 2;
  if (c.n === 6) return size === 2 || size === 3;
  return size === 1;
}
export const nTeams = (c) => c.n / teamSize(c);
export const teamOf = (st, seat) => seat % nTeams(st.config);
// Barajas según cuántos juegan
export const decksFor = (n) => (n >= 6 ? RULES.decks6 : RULES.decks);
export const teamSeats = (st, team) => st.seats.map((_, i) => i).filter((i) => teamOf(st, i) === team);
export const minimumFor = (round) => RULES.minimums[Math.min(RULES.minimums.length, Math.max(1, round)) - 1];
