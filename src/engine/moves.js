// Jugadas de La Pata: robar del mazo, levantar el pozo, bajar patas, agregar cartas, cambiar de montón y descartar.
// Funciones puras: apply(st, seat, action, env) recibe la mesa y devuelve una nueva, o truena con el motivo.
//
// Acciones (una a la vez; el turno termina al descartar):
//   { type: "draw" }                                  robar 2 del mazo
//   { type: "peek", pair: [c1, c2] }                  ver las cartas que te llevarías del pozo (issue #10): tu par
//                                                     queda a la vista de todos; no cambia el turno ni la fase
//   { type: "pickup", pair: [c1, c2], open: [[…]] }   levantar el pozo con un par; open = patas para bajarse
//                                                     (solo si el equipo no se ha bajado; no cuentan el par ni el pozo)
//   { type: "meld", groups: [[…], …] }                bajar una o más patas nuevas
//   { type: "add", meld: id, cards: […] }             agregar cartas a una pata del equipo
//   { type: "discard", card }                         descartar (si era la última carta: abrir montón o irse)
//
// env: { now, rnd } para el reloj y el azar (se inyectan; por omisión Date.now y Math.random), y
// reshuffle: lista de mazos ya revueltos para reproducir una ronda grabada.
import { RULES, teamOf } from "./config.js";
import { isWild, isRed3, isBlack3, isNatural, rankOf, cardName, removeCards, shuffle, rankName } from "./cards.js";
import { groupOf, checkNewMeld, checkAdd, openMeldOf, canStartMeld, meetsGoOut, isClosed, meldClass } from "./melds.js";
import { needsMinimum, checkMinimum, openingValue } from "./opening.js";
import { pushLog, nameOf, nextSeat } from "./table.js";
import { endRound } from "./scoring.js";

const fail = (msg) => { throw new Error(msg); };
export const topOf = (h) => (h.discard.length ? h.discard[h.discard.length - 1] : null);

// Nombre de una pata para los mensajes: "K", "comodines", "3 rojos"
export const meldLabel = (m) => (m.kind === "wild" ? "comodines" : m.kind === "red3" ? "3 rojos" : rankName(m.rank));

const pairName = (p) => (isRed3(p[0]) ? "3 rojos" : isWild(p[0]) ? "comodines" : rankName(rankOf(p[0])));

// Las cartas que te llevarías del pozo si levantas ahora (de abajo hacia el tope; la última es el tope)
export const pileTake = (h) => h.discard.slice(-Math.min(RULES.pickupN, h.discard.length));

function noDuplicates(cards) {
  if (new Set(cards).size !== cards.length) fail("Una carta se escogió dos veces.");
}

// ¿Este par levanta el pozo con ese tope? Devuelve el error (texto) o null.
export function checkPair(top, pair) {
  if (!top) return "El pozo está vacío.";
  if (isBlack3(top)) return "Hay un 3 negro en el pozo: nadie lo puede levantar.";
  if (!pair || pair.length !== 2 || pair[0] === pair[1]) return "Escoge un par de cartas.";
  const [a, b] = pair;
  if (isRed3(top)) return isRed3(a) && isRed3(b) ? null : "Para levantar un 3 rojo necesitas un par de 3 rojos.";
  if (isWild(top)) {
    // Con un comodín en el pozo se levanta con cualquier par: dos naturales iguales o dos comodines
    if (isNatural(a) && isNatural(b) && rankOf(a) === rankOf(b)) return null;
    if (isWild(a) && isWild(b)) return null;
    return "Con un comodín en el pozo se levanta con cualquier par de cartas iguales.";
  }
  if (isNatural(a) && isNatural(b) && rankOf(a) === rankOf(top) && rankOf(b) === rankOf(top)) return null;
  return `Para levantar el pozo necesitas un par de ${rankName(rankOf(top))} naturales.`;
}

// Pares con los que este asiento podría levantar el pozo ahora (uno por clase de par)
export function pickupPairs(st, seat) {
  const h = st.hand, top = topOf(h);
  if (!top || isBlack3(top)) return [];
  const hand = h.hands[seat], byKey = new Map();
  for (const c of hand) {
    const k = isWild(c) ? "W" : isRed3(c) ? "R3" : rankOf(c);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(c);
  }
  const out = [];
  for (const cards of byKey.values()) {
    if (cards.length < 2) continue;
    // Prefiere los 2 antes que los jokers para no gastar el comodín que más vale
    const pair = cards.slice().sort((x, y) => (x[0] === "X") - (y[0] === "X")).slice(0, 2);
    if (!checkPair(top, pair)) out.push(pair);
  }
  return out;
}

// Pone las cartas en una pata del equipo. Con mustBeNew siempre es una pata nueva (bajar); si no (levantar el
// pozo), se juntan con una pata abierta de esa clase y número si caben, y si no, forman una nueva.
// Patas normales: puede haber varias abiertas del mismo número. Especiales (3 rojos, comodines): una abierta a la vez.
function placeGroup(h, team, cards, { mustBeNew = false } = {}) {
  const g = groupOf(cards); if (g.error) fail(g.error);
  const melds = h.melds[team];
  const open = openMeldOf(melds, g.kind, g.rank);
  if (open && !mustBeNew && !checkAdd(open, cards)) { open.cards.push(...cards); return open; }
  if (!canStartMeld(melds, g.kind, g.rank)) fail(`Ya tienen una pata de ${open.kind === "wild" ? "comodines" : "3 rojos"} abierta: agrega ahí.`);
  const e = checkNewMeld(cards); if (e) fail(e);
  const m = { id: h.nextId++, kind: g.kind, rank: g.rank, cards: cards.slice() };
  melds.push(m);
  return m;
}

function openNextPile(s, seat) {
  const h = s.hand;
  h.hands[seat] = h.piles[seat].shift();
  h.pileNo[seat] += 1;
  s.log = pushLog(s.log, `${nameOf(s, seat)} abre su montón ${h.pileNo[seat]}`);
}

// Después de bajar o agregar: si te quedaste sin cartas abres tu siguiente montón; si ya no tienes montones,
// te tienes que quedar con cartas para descartar (y si con esa última carta no te puedes ir, con al menos 2).
function afterLay(s, seat) {
  const h = s.hand, hand = h.hands[seat];
  if (hand.length === 0) {
    if (h.piles[seat].length) return openNextPile(s, seat);
    fail("Te tienes que quedar con una carta para descartar.");
  }
  if (hand.length === 1 && !h.piles[seat].length && !meetsGoOut(h.melds[teamOf(s, seat)])) {
    fail("No te puedes quedar con una sola carta: al descartarla te irías y tu equipo todavía no tiene 5 limpias y 5 sucias.");
  }
}

// Roba n cartas del mazo; si se acaba, se revuelve el pozo y pasa a ser el mazo. Devuelve las cartas robadas.
function drawCards(h, n, env, ev) {
  const got = [];
  for (let i = 0; i < n; i++) {
    if (!h.stock.length) {
      if (!h.discard.length) break;
      const forced = env.reshuffle && env.reshuffle.length ? env.reshuffle.shift() : null;
      h.stock = forced ? forced.slice() : shuffle(h.discard, env.rnd || Math.random);
      h.discard = [];
      (ev.reshuffled = ev.reshuffled || []).push(h.stock.slice());
    }
    got.push(h.stock.pop());
  }
  return got;
}

export function apply(st, seat, action, env = {}) {
  if (!st || st.status !== "playing") fail("La ronda no está en juego.");
  if (st.hand.turn !== seat) fail("No es tu turno.");
  const now = env.now ?? Date.now();
  const s = structuredClone(st), h = s.hand, team = teamOf(s, seat), name = nameOf(s, seat);
  const hand = () => h.hands[seat];
  const ev = { s: seat, a: action && action.type, t: now };
  switch (action && action.type) {
    case "draw": {
      if (h.phase !== "draw") fail("Ya robaste en este turno.");
      // Si ni revolviendo el pozo alcanzan las 2 cartas, se acaba la ronda sin que nadie se vaya
      // (si no, con un pozo de una carta se podría robar y descartar para siempre)
      const got = h.stock.length + h.discard.length >= RULES.drawN ? drawCards(h, RULES.drawN, env, ev) : [];
      if (!got.length) {
        h.history.push(ev);
        s.log = pushLog(s.log, "Se acabaron las cartas");
        return endRound(s, null);
      }
      h.hands[seat] = hand().concat(got);
      h.lastDraw = { seat, cards: got };
      ev.cards = got;
      h.phase = "play";
      s.log = pushLog(s.log, `${name} robó del mazo`);
      break;
    }
    case "peek": {
      // Como en la mesa de verdad: enseñas el par y ves las cartas antes de decidir si levantas o robas
      if (h.phase !== "draw") fail("Ya robaste en este turno.");
      const pair = action.pair || [];
      noDuplicates(pair);
      if (!pair.every((c) => hand().includes(c))) fail("Ese par no está en tu mano.");
      const pe = checkPair(topOf(h), pair); if (pe) fail(pe);
      if (h.peek && h.peek.seat === seat && h.peek.turns === h.turns && h.peek.pair.join() === pair.join()) return st; // ya lo viste
      h.peek = { seat, pair: pair.slice(), turns: h.turns };
      ev.pair = pair.slice();
      s.log = pushLog(s.log, `${name} enseñó su par de ${pairName(pair)} para ver el pozo`);
      break;
    }
    case "pickup": {
      if (h.phase !== "draw") fail("Ya robaste en este turno.");
      const pair = action.pair || [], open = action.open || [];
      const top = topOf(h), pe = checkPair(top, pair); if (pe) fail(pe);
      const used = pair.concat(...open); noDuplicates(used);
      h.hands[seat] = removeCards(hand(), used);
      if (needsMinimum(s, seat)) {
        // Hay que mostrar que se baja sin usar el par ni las cartas del pozo
        if (!open.length) fail(checkMinimum(s, []) + " Sin contar el par ni el pozo.");
        for (const g of open) { const e = checkNewMeld(g); if (e) fail(e); if (!RULES.red3FromHand && isRed3(g[0])) fail("La pata de 3 rojos solo se empieza levantando el pozo."); }
        const me = checkMinimum(s, open); if (me) fail(me + " Sin contar el par ni el pozo.");
        for (const g of open) placeGroup(h, team, g, { mustBeNew: true });
        h.down[team] = true;
        s.log = pushLog(s.log, `${name} se bajó con ${openingValue(open)} puntos`);
      } else if (open.length) fail("Tu equipo ya se bajó: baja tus patas después de levantar.");
      const taken = h.discard.splice(-Math.min(RULES.pickupN, h.discard.length));
      const topCard = taken.pop();
      placeGroup(h, team, pair.concat(topCard));
      h.down[team] = true;
      h.hands[seat] = hand().concat(taken);
      h.lastDraw = { seat, cards: taken };
      ev.pair = pair.slice(); ev.top = topCard; ev.taken = taken.slice(); if (open.length) ev.open = open.map((g) => g.slice());
      h.phase = "play";
      s.log = pushLog(s.log, `${name} levantó el pozo con ${pair.map(cardName).join(" ")}`);
      afterLay(s, seat);
      break;
    }
    case "meld": {
      if (h.phase !== "play") fail("Primero roba.");
      const groups = (action.groups || []).filter((g) => g && g.length);
      if (!groups.length) fail("Escoge cartas para bajar.");
      noDuplicates(groups.flat());
      h.hands[seat] = removeCards(hand(), groups.flat());
      const seen = new Set();
      for (const g of groups) {
        const e = checkNewMeld(g); if (e) fail(e);
        if (!RULES.red3FromHand && isRed3(g[0])) fail("La pata de 3 rojos solo se empieza levantando el pozo.");
        // Dos patas normales del mismo número en la misma bajada sí; dos especiales de la misma clase no
        const gg = groupOf(g), key = gg.kind + gg.rank;
        if (gg.kind !== "natural" && seen.has(key)) fail("Junta esas cartas en una sola pata especial.");
        seen.add(key);
      }
      const first = needsMinimum(s, seat);
      if (first) { const me = checkMinimum(s, groups); if (me) fail(me); }
      for (const g of groups) placeGroup(h, team, g, { mustBeNew: true });
      h.down[team] = true;
      ev.groups = groups.map((g) => g.slice());
      s.log = pushLog(s.log, first ? `${name} se bajó con ${openingValue(groups)} puntos` : `${name} bajó ${groups.length === 1 ? "una pata" : groups.length + " patas"}`);
      afterLay(s, seat);
      break;
    }
    case "add": {
      if (h.phase !== "play") fail("Primero roba.");
      const m = h.melds[team].find((x) => x.id === action.meld);
      if (!m) fail("Esa pata no es de tu equipo.");
      const cards = action.cards || []; noDuplicates(cards);
      h.hands[seat] = removeCards(hand(), cards);
      const wasClosed = isClosed(m);
      const e = checkAdd(m, cards); if (e) fail(e);
      m.cards.push(...cards);
      ev.meld = m.id; ev.cards = cards.slice();
      const closedNow = !wasClosed && isClosed(m);
      s.log = pushLog(s.log, closedNow ? `${name} cerró la pata de ${meldLabel(m)} (${({ clean: "limpia", dirty: "sucia" })[meldClass(m)] || "especial"})` : `${name} agregó a la pata de ${meldLabel(m)}`);
      afterLay(s, seat);
      break;
    }
    case "discard": {
      if (h.phase !== "play") fail("Primero roba.");
      const c = action.card;
      if (!hand().includes(c)) fail("No tienes esa carta.");
      const rest = removeCards(hand(), [c]);
      const goingOut = !rest.length && !h.piles[seat].length;
      if (goingOut && !meetsGoOut(h.melds[team])) fail("Para irte tu equipo necesita 5 patas limpias y 5 sucias cerradas.");
      h.hands[seat] = rest;
      h.discard.push(c);
      ev.card = c;
      s.log = pushLog(s.log, `${name} descartó ${cardName(c)}`);
      if (goingOut) {
        h.history.push(ev);
        s.log = pushLog(s.log, `${name} se fue`);
        return endRound(s, seat, now);
      }
      if (!rest.length) openNextPile(s, seat);
      h.turn = nextSeat(s, seat); h.phase = "draw"; h.turns += 1; h.since = now; h.lastDraw = null;
      break;
    }
    default: fail("Jugada desconocida.");
  }
  h.history.push(ev);
  s.v++;
  return s;
}

// Error (texto) si la acción no se puede hacer, o null
export function check(st, seat, action) {
  try { apply(st, seat, action, { now: 0, rnd: () => 0 }); return null; } catch (e) { return e.message; }
}

// Cartas que este asiento puede descartar ahora
export function discardOptions(st, seat) {
  const h = st.hand;
  if (st.status !== "playing" || h.turn !== seat || h.phase !== "play") return [];
  const hand = h.hands[seat];
  if (hand.length === 1 && !h.piles[seat].length && !meetsGoOut(h.melds[teamOf(st, seat)])) return [];
  return hand.slice();
}

// Acciones sencillas que se pueden hacer ahora (para la jugada automática y para revisar a la compu):
// robar, levantar con cada par posible, descartar cada carta, agregar una carta a una pata y bajar las tercias
// de naturales que ya tienes. Las combinaciones más grandes (bajarse con varias patas) las arma quien juega.
export function legalActions(st, seat) {
  if (!st || st.status !== "playing" || st.hand.turn !== seat) return [];
  const h = st.hand, out = [];
  if (h.phase === "draw") {
    out.push({ type: "draw" });
    for (const pair of pickupPairs(st, seat)) if (!needsMinimum(st, seat)) out.push({ type: "pickup", pair });
    return out;
  }
  const team = teamOf(st, seat), hand = h.hands[seat];
  if (h.down[team]) {
    for (const m of h.melds[team]) for (const c of hand) { const a = { type: "add", meld: m.id, cards: [c] }; if (!check(st, seat, a)) out.push(a); }
    const byRank = new Map();
    for (const c of hand) if (isNatural(c)) { if (!byRank.has(c[0])) byRank.set(c[0], []); byRank.get(c[0]).push(c); }
    for (const cards of byRank.values()) if (cards.length >= 3) { const a = { type: "meld", groups: [cards] }; if (!check(st, seat, a)) out.push(a); }
  }
  for (const c of discardOptions(st, seat)) out.push({ type: "discard", card: c });
  return out;
}
