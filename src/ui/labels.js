// Textos y etiquetas compartidos: modo de juego, nombres de equipos, colores y el selector de nivel de la compu.
import { nameOf, RULES, teamOf, nTeams, teamSize, decksFor } from "../engine/index.js";
import { LEVELS } from "../ai/index.js";

export const LEVEL_HELP = {
  1: "Se baja en cuanto puede, agrega todo lo que pega y descarta lo más suelto.",
  2: "Usa los comodines según lo que le falta al equipo y no descarta lo que sabe que el siguiente puede levantar.",
  3: "Como el intermedio, pero cuenta las cartas que ya salieron para no darle el pozo al siguiente y busca irse antes.",
};

export function levelSeg(id, lv) {
  return `<div class="seg lvl" role="group" aria-label="Nivel">${[1, 2, 3].map((l) => `<button data-lvl="${id}:${l}" aria-pressed="${lv === l}">${LEVELS[l]}</button>`).join("")}</div>`;
}

export function modeLabel(c) {
  const size = teamSize(c);
  const base = c.n === 4 ? (size === 2 ? "4 jugadores · parejas" : "4 jugadores · individual")
    : c.n === 6 ? (size === 3 ? "6 jugadores · 2 equipos de 3" : "6 jugadores · 3 parejas") : `${c.n} jugadores`;
  return base + (c.n === 6 ? ` · ${decksFor(6)} barajas` : "") + (c.timer ? ` · ${RULES.turnMs / 1000} s por turno` : "");
}

// Asientos de un equipo
const seatsOf = (st, team) => st.seats.map((_, i) => i).filter((i) => teamOf(st, i) === team);
// Nombre de cada equipo (por equipos, los nombres de todos)
export function teamLabels(st) {
  if (!st.config.teams) return st.seats.map((_, i) => nameOf(st, i));
  return Array.from({ length: nTeams(st.config) }, (_, t) => seatsOf(st, t).map((i) => nameOf(st, i)).join(" y "));
}
// Nombre corto del equipo visto desde mi asiento: "Nosotros"/"Ellos" con 2 equipos; con 3 parejas, las iniciales
// de la otra pareja; en individual, "Tú" o el nombre del jugador
export function teamShort(st, team, seat) {
  const mine = seat >= 0 && teamOf(st, seat) === team;
  if (!st.config.teams) return mine ? "Tú" : nameOf(st, team);
  if (mine) return "Nosotros";
  if (nTeams(st.config) === 2) return "Ellos";
  return seatsOf(st, team).map((i) => nameOf(st, i).slice(0, 4)).join("·");
}
// ¿Es mi compañero de equipo (no yo)?
export const isPartner = (st, seat, s) => !!st.config.teams && seat >= 0 && s !== seat && teamOf(st, s) === teamOf(st, seat);
export const partnerWord = (st) => (teamSize(st.config) === 3 ? "equipo" : "pareja");

export const teamColor = (t) => ["var(--ta)", "var(--tb)", "var(--tc)", "var(--td)"][t] || "var(--muted)";

// Posición de cada jugador en la mesa, vista desde mí: abajo yo; el turno pasa a la derecha, luego arriba, luego
// izquierda. Con 6: derecha, arriba a la derecha, arriba, arriba a la izquierda, izquierda.
export function seatPos(st, seat, s) {
  const n = st.config.n, k = (s - (seat < 0 ? 0 : seat) + n) % n;
  if (k === 0) return "bottom";
  if (n === 2) return "top";
  if (n === 3) return k === 1 ? "right" : "left";
  if (n === 6) return ["bottom", "right", "top-right", "top", "top-left", "left"][k];
  return ["bottom", "right", "top", "left"][k];
}
// Las posiciones de arriba, de izquierda a derecha
export const TOP_ORDER = ["top-left", "top", "top-right"];
