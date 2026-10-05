// Mesa de La Pata: mesa nueva, reparto de cada ronda, turnos y registro de jugadas. Funciones puras.
//
// La ronda en curso vive en st.hand (como la mano en el dominó):
//   stock: mazo (se roba del final), discard: pozo (el tope es el último)
//   hands[s]: la mano de cada asiento; piles[s]: los montones que le quedan sin abrir, en orden
//   melds[t]: las patas de cada equipo; down[t]: si el equipo ya se bajó en esta ronda
//   turn: a quién le toca; phase: "draw" (robar) o "play" (bajar, agregar, descartar)
//   history: cada acción, para reproducir la ronda; start: cómo empezó (para la grabación)
import { RULES, nTeams, decksFor } from "./config.js";
import { fullDeck, shuffle, isWild, cardName } from "./cards.js";

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
export const prevSeat = (st, seat) => (seat - 1 + st.config.n) % st.config.n;

// Papeles de la ronda r (issue #11). El turno pasa a la derecha (al siguiente asiento):
//   reparte: el asiento (r - 1) mod n (en la ronda 1, el asiento 1, quien creó la mesa)
//   parte:   el de la izquierda de quien reparte
//   muestra: el de la derecha de quien reparte (saca 5 del mazo al pozo)
//   empieza: el de la derecha de quien puso la muestra
// Cada ronda todos los papeles se recorren uno a la derecha.
export function roundRoles(st, round) {
  const n = st.config.n, dealer = (round - 1) % n;
  const sampler = (dealer + 1) % n;
  return { dealer, cutter: (dealer - 1 + n) % n, sampler, starter: (sampler + 1) % n };
}
export const pushLog = (log, msg) => log.concat(msg).slice(-30);

// Reparte la siguiente ronda (o la primera de una partida nueva), como en la mesa (issue #11): quien reparte
// revuelve, el de su izquierda parte, quien reparte da a cada jugador 3 montones de 11 (toma el primero en la mano
// y los otros dos quedan sin abrir), y el de su derecha saca 5 cartas del mazo al pozo (la muestra). Si la de
// arriba de la muestra es un comodín, quien la sacó se queda con las 5 y no hay muestra: el siguiente empieza con
// el pozo vacío. Empieza el de la derecha de quien puso la muestra. Ver roundRoles.
// deck: solo para las pruebas (un mazo ya revuelto y partido).
export function deal(st, rnd = Math.random, now = Date.now(), deck = null) {
  if (st.status === "playing") throw new Error("La ronda ya empezó.");
  if (st.status === "gameover") throw new Error("La partida ya terminó.");
  const s = structuredClone(st), n = s.config.n;
  if (s.roundNo === 0 || !s.gameId) {
    s.gameId = "g" + now.toString(36) + Math.floor(rnd() * 1e8).toString(36);
    s.gameStart = now;
  }
  s.roundNo += 1;
  const roles = roundRoles(s, s.roundNo);
  if (!deck) {
    deck = shuffle(fullDeck(decksFor(n)), rnd); // revuelve quien reparte (8 barajas con 6 jugadores)
    const cut = Math.floor(deck.length * (0.25 + 0.5 * rnd())); // parte el de su izquierda
    deck = deck.slice(cut).concat(deck.slice(0, cut));
  }
  let k = 0;
  const take = (m) => { const out = deck.slice(k, k + m); k += m; return out; };
  const piles = [];
  for (let i = 0; i < n; i++) { const mine = []; for (let p = 0; p < RULES.piles; p++) mine.push(take(RULES.perPile)); piles.push(mine); }
  const sample = take(RULES.sample);
  const stock = deck.slice(k);
  const hands = piles.map((p) => p[0]);
  const rest = piles.map((p) => p.slice(1));
  // Comodín arriba de la muestra: se la queda quien la sacó
  const sampleTaken = isWild(sample[sample.length - 1]);
  const discard = sampleTaken ? [] : sample;
  if (sampleTaken) hands[roles.sampler] = hands[roles.sampler].concat(sample);
  const starter = roles.starter;
  const t = nTeams(s.config);
  s.hand = {
    stock, discard, hands, piles: rest, pileNo: Array(n).fill(1),
    melds: Array.from({ length: t }, () => []), down: Array(t).fill(false),
    turn: starter, phase: "draw", turns: 0, nextId: 1, lastDraw: null,
    history: [], since: now,
    ...roles, sampleTaken, sampleTop: sample[sample.length - 1],
    start: { t: now, hands: hands.map((h) => h.slice()), piles: rest.map((p) => p.map((x) => x.slice())), discard: discard.slice(), stock: stock.slice(), turn: starter,
      ...roles, sampleTaken },
  };
  s.status = "playing"; s.result = null;
  s.log = pushLog(s.log, `Ronda ${s.roundNo}: reparte ${nameOf(s, roles.dealer)}${roles.cutter !== roles.dealer ? `, parte ${nameOf(s, roles.cutter)}` : ""}`);
  s.log = pushLog(s.log, sampleTaken
    ? `${nameOf(s, roles.sampler)} sacó la muestra con ${cardName(sample[sample.length - 1])} arriba y se la quedó: no hay muestra`
    : `${nameOf(s, roles.sampler)} puso la muestra`);
  s.log = pushLog(s.log, `Empieza ${nameOf(s, starter)}`);
  s.v++;
  return s;
}

// Revancha: mismos asientos y equipos, marcador en cero
export function newGame(st) {
  const s = structuredClone(st);
  s.scores = s.scores.map(() => 0); s.roundNo = 0; s.status = "lobby"; s.result = null; s.hand = null; s.gameId = null; s.gameStart = null;
  return s;
}
