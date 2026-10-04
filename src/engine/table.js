// Mesa de La Pata: mesa nueva, reparto de cada ronda, turnos y registro de jugadas. Funciones puras.
//
// La ronda en curso vive en st.hand (como la mano en el dominó):
//   stock: mazo (se roba del final), discard: pozo (el tope es el último)
//   hands[s]: la mano de cada asiento; piles[s]: los montones que le quedan sin abrir, en orden
//   melds[t]: las patas de cada equipo; down[t]: si el equipo ya se bajó en esta ronda
//   turn: a quién le toca; phase: "draw" (robar) o "play" (bajar, agregar, descartar)
//   history: cada acción, para reproducir la ronda; start: cómo empezó (para la grabación)
import { RULES, nTeams } from "./config.js";
import { fullDeck, shuffle } from "./cards.js";

export function newTable(code, config, host, now = Date.now()) {
  return {
    code, config, host, created: now,
    seats: Array(config.n).fill(null),
    status: "lobby", scores: Array(nTeams(config)).fill(0),
    roundNo: 0, hand: null, result: null, log: [], v: 0,
  };
}

export const isEmptyTable = (st) => st.status === "lobby" && st.seats.every((s) => !s || s.bot);
export const nameOf = (st, seat) => (st.seats[seat] && st.seats[seat].name) || `Asiento ${seat + 1}`;
export const nextSeat = (st, seat) => (seat + 1) % st.config.n;
export const pushLog = (log, msg) => log.concat(msg).slice(-30);

// Reparte la siguiente ronda (o la primera de una partida nueva). Cada jugador recibe 3 montones de 11: toma el
// primero en la mano y los otros dos quedan sin abrir. Se abren 5 cartas como muestra y el resto es el mazo.
// La ronda r la empieza el asiento (r - 1) mod n.
export function deal(st, rnd = Math.random, now = Date.now()) {
  if (st.status === "playing") throw new Error("La ronda ya empezó.");
  if (st.status === "gameover") throw new Error("La partida ya terminó.");
  const s = structuredClone(st), n = s.config.n;
  if (s.roundNo === 0 || !s.gameId) {
    s.gameId = "g" + now.toString(36) + Math.floor(rnd() * 1e8).toString(36);
    s.gameStart = now;
  }
  s.roundNo += 1;
  const deck = shuffle(fullDeck(RULES.decks), rnd);
  let k = 0;
  const take = (m) => { const out = deck.slice(k, k + m); k += m; return out; };
  const piles = [];
  for (let i = 0; i < n; i++) { const mine = []; for (let p = 0; p < RULES.piles; p++) mine.push(take(RULES.perPile)); piles.push(mine); }
  const discard = take(RULES.sample);
  const stock = deck.slice(k);
  const hands = piles.map((p) => p[0]);
  const rest = piles.map((p) => p.slice(1));
  const starter = (s.roundNo - 1) % n;
  const t = nTeams(s.config);
  s.hand = {
    stock, discard, hands, piles: rest, pileNo: Array(n).fill(1),
    melds: Array.from({ length: t }, () => []), down: Array(t).fill(false),
    turn: starter, phase: "draw", turns: 0, nextId: 1, lastDraw: null,
    history: [], since: now,
    start: { t: now, hands: hands.map((h) => h.slice()), piles: rest.map((p) => p.map((x) => x.slice())), discard: discard.slice(), stock: stock.slice(), turn: starter },
  };
  s.status = "playing"; s.result = null;
  s.log = pushLog(s.log, `Ronda ${s.roundNo}: empieza ${nameOf(s, starter)}`);
  s.v++;
  return s;
}

// Revancha: mismos asientos y equipos, marcador en cero
export function newGame(st) {
  const s = structuredClone(st);
  s.scores = s.scores.map(() => 0); s.roundNo = 0; s.status = "lobby"; s.result = null; s.hand = null; s.gameId = null; s.gameStart = null;
  return s;
}
