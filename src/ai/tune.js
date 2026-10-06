// Niveles de la compu y sus parámetros.
//
// Nivel 1 (básico): se baja en cuanto puede, agrega todo lo que pega, cierra patas con comodines en cuanto
//   puede y descarta lo más suelto (primero 3 negros y 3 rojos). No se fija en lo que pueden levantar los demás.
// Nivel 2 (intermedio): usa los comodines según lo que le falta al equipo (limpias o sucias): no ensucia las limpias
//   más avanzadas que el equipo necesita ni gasta comodines en sucias que ya no hacen falta (salvo para irse). Arma
//   patas sucias con un par y un comodín cuando hacen falta, y no descarta lo que sabe que el siguiente puede levantar (las cartas
//   que levantó del pozo) ni comodines.
// Nivel 3 (avanzado): como el intermedio, pero cuenta las cartas que ya salieron para estimar qué tan probable es
//   que el siguiente tenga el par de cada número (también de 3 rojos), cuida los jokers al bajarse, arma una sucia de
//   más con par y comodín mientras falten sucias y se deshace de comodines para irse antes. Cuando su equipo ya puede
//   irse, tira primero los 3 rojos y no levanta un pozo que traiga 3.
// Intermedio y avanzado (patas especiales, src/ai/specials.js): no se van mientras a su equipo le falte completar una
//   especial que todavía se puede completar (incompleta resta lo mismo que vale). Empiezan una especial solo si a su
//   equipo le pueden llegar las cartas que faltan y la ronda no va de salida; el avanzado se arriesga más con las de
//   comodines. En simulaciones, empezar la de 3 rojos casi nunca conviene (solo se juntan robando), así que la
//   intentan cuando ya traen varios.
// En partidas simuladas (4 jugadores en parejas, 4 rondas), el intermedio le gana al básico casi siempre y el
// avanzado le gana al intermedio unas 2 de cada 3 partidas.
// Ningún nivel ve cartas ajenas: solo su mano, la mesa, el pozo y lo que cada quien levantó a la vista de todos.
export const LEVELS = ["", "Básico", "Intermedio", "Avanzado"];

// Patas especiales: specials (las arma), red3From / red3Keep (3 rojos para empezar su pata / para guardarlos en la
// mano), wildFrom (comodines de una clase para empezar), dirtyWildsKept (comodines que se dejan para las sucias que
// faltan), specialMargin (cartas de sobra sin salir para intentarlo), red3Share / wildShare (qué tanto de lo que
// no se ha visto le llega al equipo, calibrado en simulaciones) y lateAt (patas cerradas, de las 10 para irse,
// a partir de las cuales ningún equipo debe empezar una especial: ya no da tiempo).
export const TUNE = {
  1: { danger: 0, known: 0, needAware: false, pairWild: false, specials: false, saveJokers: false, closeAt: 5, rush: false, extraDirty: 0 },
  2: { danger: 0, known: 300, needAware: true, pairWild: true, specials: true, saveJokers: false, closeAt: 5, rush: false, extraDirty: 0,
    red3From: 3, red3Keep: 2, wildFrom: 4, dirtyWildsKept: 2, specialMargin: 1, lateAt: 5, red3Share: 1, wildShare: 1 },
  3: { danger: 260, known: 300, needAware: true, pairWild: true, specials: true, saveJokers: true, closeAt: 5, rush: true, extraDirty: 1,
    red3From: 3, red3Keep: 2, wildFrom: 3, dirtyWildsKept: 1, specialMargin: 0, lateAt: 6, red3Share: 1, wildShare: 1.4 },
};
export const tuneFor = (level) => TUNE[level] || TUNE[2];
