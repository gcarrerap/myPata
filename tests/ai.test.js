// Pruebas de la IA: jugadas válidas, primera bajada, descarte, consejo, lo que se sabe de cada quien y que la compu
// no hace trampa.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, check, shuffle, sumValues, newTable, deal } from "../src/engine/index.js";
import { botMove, advise, findOpening, chooseDiscard, publicView, knownCards, tracker, tuneFor, LEVELS } from "../src/ai/index.js";
import { handle } from "../src/ai/worker.js";
import { makeState, run, closedMelds, seeded, playBots } from "./helpers.js";

const strip = ({ why, ...a }) => a;

// Estados de media ronda sacados de una partida real entre compus
function midStates(config, levels, seed, every = 37) {
  const out = [];
  let k = 0;
  playBots(levels, config, seed, (s) => { if (s.status === "playing" && k++ % every === 0) out.push(s); });
  return out;
}

test("hay tres niveles", () => {
  assert.deepEqual(LEVELS.slice(1), ["Básico", "Intermedio", "Avanzado"]);
});

test("cada nivel solo propone jugadas válidas, con su motivo", () => {
  const states = midStates({ n: 4, teams: true }, [1, 2, 3, 2], 21);
  assert.ok(states.length > 10);
  for (const st of states) for (const level of [1, 2, 3]) {
    const a = botMove(st, st.hand.turn, level);
    assert.ok(a, "siempre hay una jugada");
    assert.equal(check(st, st.hand.turn, strip(a)), null);
    assert.equal(typeof a.why, "string");
    assert.ok(a.why.length > 5);
  }
});

test("primera bajada: llega al mínimo con tercias y, si hace falta, con comodines", () => {
  const t = tuneFor(2);
  const g1 = findOpening([...run("A", 3), "9S0", "5S0"], 60, t);
  assert.deepEqual(g1, [run("A", 3)]);
  assert.equal(findOpening([...run("A", 3), "9S0"], 90, t), null);
  const g2 = findOpening([...run("A", 3), "KS0", "KH0", "2S0"], 90, t);
  assert.ok(sumValues(g2.flat()) >= 90);
  assert.ok(g2.some((g) => g.includes("2S0")));
  // El avanzado prefiere no gastar jokers si alcanza sin ellos
  const g3 = findOpening([...run("A", 3), "KS0", "KH0", "2S0", "XR0"], 90, tuneFor(3));
  assert.ok(!g3.flat().includes("XR0"));
});

test("descarte: un 3 negro primero; el intermedio no tira lo que el siguiente sabe que puede levantar", () => {
  const st = makeState({ hands: [["3S0", "KS0", "9H0"], [], [], []], phase: "play", down: [true, false] });
  assert.equal(chooseDiscard(publicView(st, 0), st.hand.hands[0], tuneFor(1)).card, "3S0");
  // El asiento 1 levantó dos 9 del pozo: el intermedio no le descarta un 9
  const st2 = makeState({ hands: [["9S0", "KS0", "KH1", "QC0", "4D0"], ["9H1", "9D1", "5S0", "6S0"], [], []], phase: "play", down: [true, false] });
  st2.hand.history.push({ s: 1, a: "pickup", pair: [], taken: ["9H1", "9D1", "5S0", "6S0"], t: 0 });
  const v = publicView(st2, 0);
  assert.notEqual(chooseDiscard(v, ["9S0", "4D0"], tuneFor(2)).card, "9S0");
  assert.equal(chooseDiscard(v, ["9S0", "4D0"], tuneFor(1)).card, "4D0"); // el básico tira la de menos valor
});

test("lo que se sabe: las cartas que cada quien levantó del pozo y todavía no baja ni descarta", () => {
  const st = makeState({ hands: [[], ["KH1", "5S0"], [], []] });
  st.hand.history.push({ s: 1, a: "pickup", pair: ["KS0", "KD0"], taken: ["KH1", "5S0", "6S0"], t: 0 });
  st.hand.history.push({ s: 1, a: "discard", card: "6S0", t: 0 });
  assert.deepEqual(knownCards(st)[1], ["KH1", "5S0"]);
  const tr = tracker(st, 0, 1);
  assert.equal(tr.count, 2); assert.equal(tr.pickups, 1); assert.deepEqual(tr.discarded, ["6S0"]);
});

// Revuelve todo lo que el asiento `seat` no puede ver: manos ajenas (menos lo que levantaron del pozo), todos los
// montones sin abrir (también los suyos) y el orden del mazo. Se conservan los tamaños.
function scramble(st, seat, rnd) {
  const s = structuredClone(st), h = s.hand, known = knownCards(s);
  const hidden = [];
  h.hands.forEach((hand, i) => { if (i !== seat) hidden.push(...hand.filter((c) => !known[i].includes(c))); });
  hidden.push(...h.piles.flat(2), ...h.stock);
  const pool = shuffle(hidden, rnd);
  let k = 0;
  const take = (n) => { const out = pool.slice(k, k + n); k += n; return out; };
  h.hands = h.hands.map((hand, i) => (i === seat ? hand : [...known[i], ...take(hand.length - known[i].length)]));
  h.piles = h.piles.map((p) => p.map((x) => take(x.length)));
  h.stock = take(h.stock.length);
  return s;
}

test("la compu no hace trampa: si se revuelven las cartas que no puede ver, su jugada y el consejo no cambian", () => {
  const states = midStates({ n: 4, teams: true }, [3, 3, 3, 3], 8, 23);
  const rnd = seeded(99);
  for (const st of states) {
    const seat = st.hand.turn, other = scramble(st, seat, rnd);
    assert.notDeepEqual(other.hand.stock, st.hand.stock);
    assert.deepEqual(publicView(other, seat), publicView(st, seat));
    for (const level of [1, 2, 3]) assert.deepEqual(botMove(other, seat, level), botMove(st, seat, level));
    assert.deepEqual(advise(other, seat), advise(st, seat));
  }
});

test("consejo: al robar, solo la decisión de robar; después, el resto del turno hasta el descarte", () => {
  const states = midStates({ n: 2 }, [2, 2], 4, 11);
  const draw = states.find((s) => s.hand.phase === "draw"), play = states.find((s) => s.hand.phase === "play");
  const a = advise(draw, draw.hand.turn);
  assert.equal(a.phase, "draw");
  assert.equal(a.levels.length, 3);
  for (const l of a.levels) { assert.equal(l.steps.length, 1); assert.ok(["draw", "pickup"].includes(l.steps[0].action.type)); }
  const b = advise(play, play.hand.turn);
  for (const l of b.levels) {
    assert.ok(l.steps.length >= 1);
    const last = l.steps.at(-1);
    assert.ok(last.action === null ? /montón/.test(last.text) : last.action.type === "discard"); // o abre su siguiente montón
    for (const s of l.steps) { assert.ok(s.text); assert.ok(s.why); }
  }
  assert.deepEqual(advise(draw, (draw.hand.turn + 1) % 2), { phase: null, levels: [] });
});

test("la compu se va en cuanto puede", () => {
  const st = makeState({ hands: [["9S0", "9H0", "KS2"], [], [], []], phase: "play", melds: [[...closedMelds(5, 5), { id: 50, rank: "9", cards: ["9D0", "9C0", "9S1"] }], []] });
  let s = st;
  for (let i = 0; i < 5 && s.status === "playing"; i++) s = apply(s, 0, strip(botMove(s, 0, 2)));
  assert.equal(s.status, "roundover");
  assert.equal(s.result.goer, 0);
});

test("worker: atiende pedidos y avisa errores", () => {
  const st = makeState({ hands: [run("K", 3), [], [], []], stock: ["4S0", "5S0"], discard: ["9S0"] });
  const r = handle({ id: 7, fn: "botMove", args: [st, 0, 2] });
  assert.equal(r.id, 7); assert.equal(r.result.type, "draw");
  assert.match(handle({ id: 8, fn: "nada", args: [] }).error, /desconocida/);
});

test("el avanzado le gana al básico en partidas simuladas", () => {
  let wins = 0;
  for (let i = 0; i < 2; i++) for (const swap of [false, true]) {
    const lv = swap ? [1, 3, 1, 3] : [3, 1, 3, 1];
    const st = playBots(lv, { n: 4, teams: true }, 300 + i);
    const adv = swap ? 1 : 0;
    if (st.scores[adv] > st.scores[1 - adv]) wins++;
  }
  assert.ok(wins >= 3, `ganó ${wins} de 4`);
});

test("una mesa recién repartida: la compu de cualquier nivel sabe qué hacer", () => {
  let st = newTable("X", { n: 3 }, "h", 0);
  st.seats = [0, 1, 2].map((i) => ({ id: "p" + i, name: "P" + i }));
  st = deal(st, seeded(5), 0);
  for (const level of [1, 2, 3]) assert.ok(botMove(st, 0, level));
  assert.equal(botMove(st, 1, 2), null); // no es su turno
});
