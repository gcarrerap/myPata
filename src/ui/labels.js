// Textos y etiquetas compartidos: modo de juego, nombres de equipos, colores y el selector de nivel de la compu.
import { nameOf, RULES, teamOf } from "../engine/index.js";
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
  const base = c.n === 4 ? (c.teams ? "4 jugadores · parejas" : "4 jugadores · individual") : `${c.n} jugadores`;
  return base + (c.timer ? ` · ${RULES.turnMs / 1000} s por turno` : "");
}

// Nombre de cada equipo (en parejas, los dos nombres)
export function teamLabels(st) {
  if (st.config.teams) return [0, 1].map((t) => `${nameOf(st, t)} y ${nameOf(st, t + 2)}`);
  return st.seats.map((_, i) => nameOf(st, i));
}
// Nombre corto del equipo visto desde mi asiento: "Nosotros"/"Ellos" o el nombre del jugador
export function teamShort(st, team, seat) {
  const mine = seat >= 0 && teamOf(st, seat) === team;
  if (st.config.teams) return mine ? "Nosotros" : "Ellos";
  return mine ? "Tú" : nameOf(st, team);
}

export const teamColor = (t) => ["var(--ta)", "var(--tb)", "var(--tc)", "var(--td)"][t] || "var(--muted)";

// Posición de cada jugador en la mesa, vista desde mí: abajo yo; el turno pasa a la derecha, luego arriba, luego izquierda.
export function seatPos(st, seat, s) {
  const n = st.config.n, k = (s - (seat < 0 ? 0 : seat) + n) % n;
  if (k === 0) return "bottom";
  if (n === 2) return "top";
  if (n === 3) return k === 1 ? "right" : "left";
  return ["bottom", "right", "top", "left"][k];
}
