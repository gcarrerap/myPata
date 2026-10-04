// API de la IA: jugadores de la compu, lo que se sabe de cada quien y consejo.
export { LEVELS, TUNE, tuneFor } from "./tune.js";
export { publicView } from "./view.js";
export { knownCards, tracker } from "./deduce.js";
export { findOpening, chooseDiscard, danger, needs } from "./heuristics.js";
export { botMove } from "./bots.js";
export { advise, describeAction } from "./advice.js";
