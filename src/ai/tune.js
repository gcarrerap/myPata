// Niveles de la compu y sus parámetros.
//
// Nivel 1 (básico): se baja en cuanto puede, agrega todo lo que pega, cierra patas con comodines en cuanto
//   puede y descarta lo más suelto (primero 3 negros y 3 rojos). No se fija en lo que pueden levantar los demás.
// Nivel 2 (intermedio): usa los comodines según lo que le falta al equipo (limpias o sucias), arma patas sucias con
//   un par y un comodín cuando hacen falta, y no descarta lo que sabe que el siguiente puede levantar (las cartas
//   que levantó del pozo) ni comodines.
// Nivel 3 (avanzado): como el intermedio, pero cuenta las cartas que ya salieron para estimar qué tan probable es
//   que el siguiente tenga el par de cada número (también de 3 rojos), cuida los jokers al bajarse, arma una sucia de
//   más con par y comodín, se deshace de comodines para irse antes y arma patas especiales cuando ya no le hacen
//   falta los comodines para las sucias.
// En partidas simuladas (4 jugadores en parejas, 4 rondas), el intermedio le gana al básico casi siempre y el
// avanzado le gana al intermedio unas 2 de cada 3 partidas.
// Ningún nivel ve cartas ajenas: solo su mano, la mesa, el pozo y lo que cada quien levantó a la vista de todos.
export const LEVELS = ["", "Básico", "Intermedio", "Avanzado"];

export const TUNE = {
  1: { danger: 0, known: 0, needAware: false, pairWild: false, specials: false, saveJokers: false, closeAt: 5, rush: false, extraDirty: 0 },
  2: { danger: 0, known: 300, needAware: true, pairWild: true, specials: false, saveJokers: false, closeAt: 5, rush: false, extraDirty: 0 },
  3: { danger: 260, known: 300, needAware: true, pairWild: true, specials: true, saveJokers: true, closeAt: 5, rush: true, extraDirty: 1 },
};
export const tuneFor = (level) => TUNE[level] || TUNE[2];
