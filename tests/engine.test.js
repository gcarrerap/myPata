// Pruebas del motor: cartas, reparto, patas, robar, pozo, mínimo, montones, irse, puntuación y partidas completas.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fullDeck, cardValue, isWild, isRed3, isBlack3, sortCards, RULES, newTable, deal, newGame, apply, check, groupOf, checkNewMeld,
  checkAdd, meldClass, closedCounts, pickupPairs, autoMove, legalActions, discardOptions, roundBreakdown, validConfig,
  buildRoundRecord, replayRound, roundRecordId, groupGames, minimumFor, teamOf,
} from "../src/engine/index.js";
import { makeState, run, closedMelds, playBots, seeded, TOTAL } from "./helpers.js";

const throwsMsg = (fn, re) => assert.throws(fn, (e) => re.test(e.message));

// ---------- Cartas ----------

test("las 6 barajas: 324 cartas distintas, 12 jokers y 24 de cada número", () => {
  const d = fullDeck();
  assert.equal(d.length, 324);
  assert.equal(new Set(d).size, 324);
  assert.equal(d.filter((c) => c[0] === "X").length, 12);
  for (const r of "A23456789TJQK") assert.equal(d.filter((c) => c[0] === r).length, 24);
  assert.equal(d.filter(isRed3).length, 12);
  assert.equal(d.filter(isBlack3).length, 12);
  assert.equal(d.filter(isWild).length, 36);
});

test("valor para el mínimo: joker 50, As y 2 valen 20, 8 a K valen 10, 3 a 7 valen 5", () => {
  assert.equal(cardValue("XR0"), 50);
  assert.equal(cardValue("AS0"), 20);
  assert.equal(cardValue("2H1"), 20);
  for (const r of "89TJQK") assert.equal(cardValue(r + "S0"), 10);
  for (const r of "34567") assert.equal(cardValue(r + "S0"), 5);
});

test("ordenar: 3 primero, luego 4 a A, luego 2 y jokers", () => {
  assert.deepEqual(sortCards(["XR0", "2S0", "AS0", "4H0", "3S0", "3H0"]), ["3S0", "3H0", "4H0", "AS0", "2S0", "XR0"]);
});

test("modos: 2, 3 o 4 jugadores; parejas solo con 4", () => {
  assert.ok(validConfig({ n: 2 })); assert.ok(validConfig({ n: 3 })); assert.ok(validConfig({ n: 4, teams: true }));
  assert.ok(!validConfig({ n: 3, teams: true })); assert.ok(!validConfig({ n: 5 }));
});

// ---------- Reparto ----------

test("reparto: 3 montones de 11 por jugador, 5 de muestra y el resto en el mazo", () => {
  let st = newTable("ABCD", { n: 4, teams: true }, "h", 0);
  st.seats = [0, 1, 2, 3].map((i) => ({ id: "p" + i, name: "P" + i }));
  st = deal(st, seeded(3), 0);
  const h = st.hand;
  assert.equal(st.status, "playing"); assert.equal(st.roundNo, 1);
  assert.ok(h.hands.every((x) => x.length === 11));
  assert.ok(h.piles.every((p) => p.length === 2 && p.every((x) => x.length === 11)));
  assert.equal(h.discard.length, 5);
  assert.equal(h.stock.length, 324 - 4 * 33 - 5);
  assert.equal(new Set([...h.stock, ...h.discard, ...h.hands.flat(), ...h.piles.flat(2)]).size, 324);
  assert.equal(h.turn, 0); assert.equal(h.phase, "draw");
  assert.ok(st.gameId);
});

test("cada ronda la empieza el siguiente asiento", () => {
  let st = newTable("ABCD", { n: 3 }, "h", 0);
  st.seats = [0, 1, 2].map((i) => ({ id: "p" + i, name: "P" + i }));
  const starters = [];
  for (let r = 0; r < 4; r++) { st = deal(st, seeded(r + 1), 0); starters.push(st.hand.turn); st = { ...st, status: "roundover" }; }
  assert.deepEqual(starters, [0, 1, 2, 0]);
});

test("mínimo por ronda: 60, 90, 120 y 150", () => {
  assert.deepEqual([1, 2, 3, 4].map(minimumFor), [60, 90, 120, 150]);
});

// ---------- Patas ----------

test("patas: tercia de naturales, sucia sin pasar de un comodín por natural, especiales y tapones", () => {
  assert.equal(checkNewMeld(run("K", 3)), null);
  assert.equal(checkNewMeld(["KS0", "KH0", "2S0"]), null);
  assert.match(checkNewMeld(["KS0", "2S0", "XR0"]), /más comodines que naturales/);
  assert.match(checkNewMeld(["KS0", "KH0"]), /al menos 3/);
  assert.match(checkNewMeld(["KS0", "QH0", "JH0"]), /mismo número/);
  assert.match(checkNewMeld(["3S0", "3C0", "3S1"]), /3 negros nunca/);
  assert.match(checkNewMeld(["3H0", "3D0", "2S0"]), /3 rojos/);
  assert.deepEqual(groupOf(["3H0", "3D0", "3H1"]), { kind: "red3", rank: "3" });
  assert.deepEqual(groupOf(["2S0", "XR0", "2H0"]), { kind: "wild", rank: "W" });
  assert.equal(meldClass({ kind: "wild", cards: ["2S0", "2H0"] }), "twos");
  assert.equal(meldClass({ kind: "wild", cards: ["XR0", "XB0"] }), "jokers");
  assert.equal(meldClass({ kind: "wild", cards: ["XR0", "2S0"] }), "mixed");
});

test("una limpia cerrada ya no se puede ensuciar, y una de puros 2 no acepta jokers", () => {
  const clean = { kind: "natural", rank: "K", cards: run("K", 7) };
  assert.match(checkAdd(clean, ["2S0"]), /limpia cerrada/);
  assert.equal(checkAdd(clean, ["KS3"]), null);
  const openClean = { kind: "natural", rank: "K", cards: run("K", 5) };
  assert.equal(checkAdd(openClean, ["2S0", "2H0"]), null); // abierta sí se puede ensuciar
  const twos = { kind: "wild", rank: "W", cards: ["2S0", "2H0", "2D0", "2C0", "2S1", "2H1", "2D1"] };
  assert.match(checkAdd(twos, ["XR0"]), /especial ya está cerrada/);
  assert.equal(checkAdd(twos, ["2C1"]), null);
  assert.match(checkAdd(openClean, ["QS0"]), /mismo número/);
});

// ---------- Robar ----------

test("robar: 2 del mazo y pasa a bajar; no se puede robar dos veces", () => {
  let st = makeState({ hands: [run("4", 3), [], [], []], stock: ["9S0", "8S0", "7S0"], discard: ["5S0"] });
  st = apply(st, 0, { type: "draw" });
  assert.deepEqual(st.hand.hands[0].slice(-2), ["7S0", "8S0"]);
  assert.equal(st.hand.phase, "play");
  throwsMsg(() => apply(st, 0, { type: "draw" }), /Ya robaste/);
  throwsMsg(() => apply(st, 1, { type: "draw" }), /No es tu turno/);
});

test("si se acaba el mazo se revuelve el pozo; si ni así alcanzan 2 cartas, se acaba la ronda", () => {
  let st = makeState({ hands: [run("4", 3), [], [], []], stock: ["9S0"], discard: ["5S0", "6S0", "7S0"] });
  st = apply(st, 0, { type: "draw" }, { rnd: seeded(1) });
  assert.equal(st.hand.hands[0].length, 5);
  assert.equal(st.hand.discard.length, 0);
  assert.equal(st.hand.stock.length, 2);
  assert.ok(st.hand.history[0].reshuffled);
  let st2 = makeState({ hands: [run("4", 3), [], [], []], stock: [], discard: ["5S0"] });
  st2 = apply(st2, 0, { type: "draw" });
  assert.equal(st2.status, "roundover");
  assert.equal(st2.result.goer, null);
});

// ---------- El pozo ----------

test("levantar el pozo: el par y el tope se bajan y las otras 4 pasan a la mano", () => {
  const discard = ["4S1", "5S1", "6S1", "7S1", "8S1", "KS1"]; // tope: KS1
  let st = makeState({ hands: [["KS0", "KH0", "9S0", "9H0"], [], [], []], discard, down: [true, false] });
  st = apply(st, 0, { type: "pickup", pair: ["KS0", "KH0"] });
  const h = st.hand;
  assert.deepEqual(h.melds[0].map((m) => m.cards), [["KS0", "KH0", "KS1"]]);
  assert.deepEqual(h.hands[0], ["9S0", "9H0", "5S1", "6S1", "7S1", "8S1"]);
  assert.deepEqual(h.discard, ["4S1"]);
  assert.equal(h.phase, "play");
});

test("con menos de 5 en el pozo te llevas las que haya", () => {
  let st = makeState({ hands: [["KS0", "KH0", "9S0"], [], [], []], discard: ["7S1", "KS1"], down: [true, false] });
  st = apply(st, 0, { type: "pickup", pair: ["KS0", "KH0"] });
  assert.deepEqual(st.hand.hands[0], ["9S0", "7S1"]);
  assert.deepEqual(st.hand.discard, []);
});

test("un 3 negro en el pozo no se puede levantar, ni con dos 3 negros", () => {
  const st = makeState({ hands: [["3S0", "3C0", "9S0"], [], [], []], discard: ["KS1", "3S1"], down: [true, false] });
  assert.match(check(st, 0, { type: "pickup", pair: ["3S0", "3C0"] }), /3 negro/);
  assert.deepEqual(pickupPairs(st, 0), []);
});

test("un 3 rojo se levanta con un par de 3 rojos y empieza la pata especial", () => {
  let st = makeState({ hands: [["3H0", "3D0", "9S0", "9H0"], [], [], []], discard: ["KS1", "3H1"], down: [true, false] });
  assert.match(check(st, 0, { type: "pickup", pair: ["9S0", "9H0"] }), /3 rojos/);
  st = apply(st, 0, { type: "pickup", pair: ["3H0", "3D0"] });
  assert.equal(st.hand.melds[0][0].kind, "red3");
  assert.deepEqual(st.hand.melds[0][0].cards, ["3H0", "3D0", "3H1"]);
});

test("con un comodín en el pozo se levanta con cualquier par, y queda en esa pata sucia", () => {
  let st = makeState({ hands: [["7S0", "7H0", "9S0"], [], [], []], discard: ["KS1", "2S1"], down: [true, false] });
  assert.equal(pickupPairs(st, 0).length, 1);
  st = apply(st, 0, { type: "pickup", pair: ["7S0", "7H0"] });
  assert.deepEqual(st.hand.melds[0][0].cards, ["7S0", "7H0", "2S1"]);
  assert.equal(meldClass(st.hand.melds[0][0]), "dirty");
});

test("el par y el tope se juntan con la pata abierta de ese número", () => {
  const melds = [[{ rank: "K", cards: ["KS2", "KH2", "KD2"] }], []];
  let st = makeState({ hands: [["KS0", "KH0", "9S0"], [], [], []], discard: ["4S1", "KS1"], melds });
  st = apply(st, 0, { type: "pickup", pair: ["KS0", "KH0"] });
  assert.equal(st.hand.melds[0].length, 1);
  assert.equal(st.hand.melds[0][0].cards.length, 6);
});

test("sin bajarse, para levantar hay que bajarse antes sin usar el par ni el pozo", () => {
  const hand = ["KS0", "KH0", "AS0", "AH0", "AD0", "QS0", "QH0", "QD0", "9S0"];
  const st = makeState({ hands: [hand, [], [], []], discard: ["KS1"] });
  assert.match(check(st, 0, { type: "pickup", pair: ["KS0", "KH0"] }), /60 puntos/);
  // Ases (60) alcanzan el mínimo de la ronda 1 sin el par
  const s2 = apply(st, 0, { type: "pickup", pair: ["KS0", "KH0"], open: [["AS0", "AH0", "AD0"]] });
  assert.ok(s2.hand.down[0]);
  assert.equal(s2.hand.melds[0].length, 2);
  // Con las Q (30) no alcanza
  assert.match(check(st, 0, { type: "pickup", pair: ["KS0", "KH0"], open: [["QS0", "QH0", "QD0"]] }), /llevas 30/);
  // No puedes usar el par en la bajada
  assert.ok(check(st, 0, { type: "pickup", pair: ["KS0", "KH0"], open: [["KS0", "KH0", "AS0"]] }));
});

// ---------- Bajarse ----------

test("bajarse por primera vez: hay que llegar al mínimo de la ronda", () => {
  const hand = [...run("Q", 3), ...run("A", 3), "9S0", "5S0"];
  const st = makeState({ hands: [hand, [], [], []], phase: "play", roundNo: 2 }); // ronda 2: 90
  assert.match(check(st, 0, { type: "meld", groups: [run("A", 3)] }), /90 puntos.*llevas 60/);
  const s2 = apply(st, 0, { type: "meld", groups: [run("A", 3), run("Q", 3)] });
  assert.ok(s2.hand.down[0]);
  assert.equal(s2.hand.melds[0].length, 2);
});

test("si tu compañero ya se bajó, puedes bajar sin el mínimo", () => {
  const st = makeState({ hands: [[...run("4", 3), "9S0", "9H0"], [], [], []], phase: "play", melds: [[{ rank: "K", cards: run("K", 3, 4) }], []] });
  assert.equal(check(st, 0, { type: "meld", groups: [run("4", 3)] }), null);
  // en individual cada quien necesita su mínimo
  const ind = makeState({ n: 4, teams: false, hands: [[...run("4", 3), "9S0", "9H0"], [], [], []], phase: "play" });
  assert.match(check(ind, 0, { type: "meld", groups: [run("4", 3)] }), /60 puntos/);
});

test("se puede abrir otra pata del mismo número aunque haya una abierta (issue #8)", () => {
  const st = makeState({ hands: [[...run("J", 3), "9S0", "9H0"], [], [], []], phase: "play", melds: [[{ id: 1, rank: "J", cards: run("J", 3, 8) }], []] });
  const s2 = apply(st, 0, { type: "meld", groups: [run("J", 3)] });
  const js = s2.hand.melds[0].filter((m) => m.rank === "J");
  assert.equal(js.length, 2, "dos patas de J abiertas");
  assert.deepEqual(js.map((m) => m.cards.length), [3, 3]);
  // y se puede agregar a cualquiera de las dos
  const s3 = apply({ ...s2, hand: { ...s2.hand, hands: [["JS5", "9S0", "9H0"], [], [], []] } }, 0, { type: "add", meld: js[1].id, cards: ["JS5"] });
  assert.equal(s3.hand.melds[0].find((m) => m.id === js[1].id).cards.length, 4);
  // dos patas del mismo número en la misma bajada
  const six = makeState({ hands: [[...run("Q", 6), "9S0", "9H0"], [], [], []], phase: "play", down: [true, false] });
  const s4 = apply(six, 0, { type: "meld", groups: [run("Q", 6).slice(0, 3), run("Q", 6).slice(3)] });
  assert.equal(s4.hand.melds[0].length, 2);
});

test("las especiales siguen siendo una abierta a la vez", () => {
  const st = makeState({ hands: [["2S0", "2H0", "2D0", "9S0", "9H0"], [], [], []], phase: "play", melds: [[{ id: 1, kind: "wild", rank: "W", cards: ["2S1", "2H1", "2D1"] }], []] });
  assert.match(check(st, 0, { type: "meld", groups: [["2S0", "2H0", "2D0"]] }), /comodines abierta/);
});

test("al levantar, el par y el tope forman pata nueva si no caben en la abierta", () => {
  // Una limpia cerrada de K: el par con un comodín arriba no la puede ensuciar → pata nueva
  const melds = [[{ id: 1, rank: "K", cards: run("K", 7, 4) }], []];
  const st = makeState({ hands: [["KS0", "KH0", "9S0"], [], [], []], discard: ["4S1", "2S1"], melds });
  const s2 = apply(st, 0, { type: "pickup", pair: ["KS0", "KH0"] });
  assert.equal(s2.hand.melds[0].length, 2);
});

test("agregar a una pata del equipo, y no a la de los rivales", () => {
  const melds = [[{ id: 1, rank: "K", cards: run("K", 3, 4) }], [{ id: 2, rank: "Q", cards: run("Q", 3, 4) }]];
  let st = makeState({ hands: [["KS0", "QS0", "9S0", "9H0"], [], [], []], phase: "play", melds });
  st = apply(st, 0, { type: "add", meld: 1, cards: ["KS0"] });
  assert.equal(st.hand.melds[0][0].cards.length, 4);
  assert.match(check(st, 0, { type: "add", meld: 2, cards: ["QS0"] }), /no es de tu equipo/);
});

test("los 3 negros nunca se bajan y los 3 rojos solo en su pata", () => {
  const st = makeState({ hands: [["3S0", "3C0", "3S1", "3H0", "3D0", "3H1", "9S0", "9H0"], [], [], []], phase: "play", down: [true, false] });
  assert.match(check(st, 0, { type: "meld", groups: [["3S0", "3C0", "3S1"]] }), /3 negros/);
  assert.equal(check(st, 0, { type: "meld", groups: [["3H0", "3D0", "3H1"]] }), null);
});

// ---------- Montones ----------

test("si te quedas sin cartas antes de descartar, abres tu siguiente montón y sigues", () => {
  const melds = [[{ id: 1, rank: "K", cards: run("K", 3, 4) }], []];
  let st = makeState({ hands: [["KS0", "KH0"], [], [], []], piles: [[run("9", 11)], [], [], []], phase: "play", melds });
  st = apply(st, 0, { type: "add", meld: 1, cards: ["KS0", "KH0"] });
  assert.equal(st.hand.hands[0].length, 11);
  assert.equal(st.hand.piles[0].length, 0);
  assert.equal(st.hand.pileNo[0], 2);
  assert.equal(st.hand.turn, 0); assert.equal(st.hand.phase, "play"); // sigue su turno
});

test("si descartas tu última carta y te quedan montones, abres el siguiente", () => {
  let st = makeState({ hands: [["9S0"], [], [], []], piles: [[run("8", 11)], [], [], []], phase: "play" });
  st = apply(st, 0, { type: "discard", card: "9S0" });
  assert.equal(st.hand.hands[0].length, 11);
  assert.equal(st.hand.turn, 1);
  assert.equal(st.status, "playing");
});

test("sin montones te tienes que quedar con cartas para descartar (y con 2 si todavía no te puedes ir)", () => {
  const melds = [[{ id: 1, rank: "K", cards: run("K", 3, 4) }], []];
  const st = makeState({ hands: [["KS0", "KH0", "9S0"], [], [], []], phase: "play", melds });
  assert.match(check(st, 0, { type: "add", meld: 1, cards: ["KS0", "KH0"] }), /sola carta/);
  assert.equal(check(st, 0, { type: "add", meld: 1, cards: ["KS0"] }), null);
  const st2 = makeState({ hands: [["KS0", "KH0"], [], [], []], phase: "play", melds });
  assert.match(check(st2, 0, { type: "add", meld: 1, cards: ["KS0", "KH0"] }), /quedar con una carta/);
});

// ---------- Irse y puntuación ----------

test("para irse el equipo necesita 5 limpias y 5 sucias, y el descarte es parte de irse", () => {
  const melds = [closedMelds(5, 4), []];
  const st = makeState({ hands: [["9S0"], [], [], []], phase: "play", melds });
  assert.match(check(st, 0, { type: "discard", card: "9S0" }), /5 patas limpias y 5 sucias/);
  assert.deepEqual(discardOptions(st, 0), []);
  const ok = makeState({ hands: [["9S0"], [], [], []], phase: "play", melds: [closedMelds(5, 5), []] });
  const end = apply(ok, 0, { type: "discard", card: "9S0" });
  assert.equal(end.status, "roundover");
  assert.equal(end.result.goer, 0);
  assert.equal(end.result.rows[0].out, 500);
  assert.equal(end.result.rows[0].total, 5 * 500 + 5 * 300 + 500);
});

test("las patas extra solo cuentan para el equipo que se fue; las primeras 5 y 5 cuentan para todos", () => {
  const st = makeState({ hands: [["9S0"], ["8S0"], [], []], phase: "play", melds: [closedMelds(6, 5), closedMelds(7, 6)] });
  const end = apply(st, 0, { type: "discard", card: "9S0" });
  const [a, b] = end.result.rows;
  assert.equal(a.total, 6 * 500 + 5 * 300 + 500);
  assert.equal(b.cleanN, 5); assert.equal(b.dirtyN, 5);
  assert.equal(b.total, 5 * 500 + 5 * 300);
  assert.deepEqual(end.scores, [a.total, b.total]);
});

test("especiales: completas suman, incompletas restan lo mismo; los 3 rojos guardados restan 500", () => {
  const melds = [
    [...closedMelds(5, 5), { kind: "wild", rank: "W", cards: ["XR0", "XB0", "XR1", "XB1", "XR2", "XB2", "XR3"] }, { kind: "red3", rank: "3", cards: ["3H0", "3D0", "3H1"] }],
    [{ kind: "wild", rank: "W", cards: ["2S0", "2H0", "2D0"] }, { kind: "wild", rank: "W", cards: ["2C0", "XR5", "2S1", "2H1", "2D1", "2C1", "2S2"] }],
  ];
  const st = makeState({ hands: [["9S0"], ["3H2", "3D2", "8S0"], [], ["3H3"]], piles: [[], [], [], [["3D3", "4S0"]]], phase: "play", melds });
  const b = roundBreakdown(st, 0);
  const [a, o] = b.rows;
  assert.deepEqual(a.specials.map((x) => x.pts), [3000, -5000]);
  assert.equal(a.red3, 0); // los 3 rojos de su pata incompleta no restan aparte
  assert.deepEqual(o.specials.map((x) => x.pts), [-2000, 1500]);
  assert.equal(o.red3, 4); // 2 en la mano del asiento 1, 1 en la mano y 1 en el montón del asiento 3
  assert.equal(o.red3Pts, -2000);
});

test("las patas abiertas y las demás cartas no cuentan", () => {
  const st = makeState({ hands: [["9S0"], run("K", 6), [], []], phase: "play", melds: [closedMelds(5, 5), [{ rank: "Q", cards: run("Q", 6) }]] });
  const end = apply(st, 0, { type: "discard", card: "9S0" });
  assert.equal(end.result.rows[1].total, 0);
});

test("tras la ronda 4 termina la partida y gana el equipo con más puntos", () => {
  const st = makeState({ hands: [["9S0"], [], [], []], phase: "play", melds: [closedMelds(5, 5), []], roundNo: 4, scores: [1000, 9000] });
  const end = apply(st, 0, { type: "discard", card: "9S0" });
  assert.equal(end.status, "gameover");
  assert.equal(end.result.champion, 1);
  assert.throws(() => deal(end), /terminó/);
  const again = deal(newGame(end), seeded(1), 0);
  assert.equal(again.roundNo, 1); assert.deepEqual(again.scores, [0, 0]);
});

// ---------- Jugada automática ----------

test("se acaba el tiempo: roba del mazo y descarta (primero un 3 negro)", () => {
  const st = makeState({ hands: [["KS0", "3S0", "XR0"], [], [], []], stock: ["9S0", "8S0"], discard: ["4S0"] });
  const s2 = autoMove(st);
  assert.equal(s2.hand.turn, 1);
  assert.equal(s2.hand.discard.at(-1), "3S0");
  assert.ok(s2.hand.history.every((e) => e.auto));
});

test("acciones legales en cada fase", () => {
  const st = makeState({ hands: [["KS0", "KH0", "9S0"], [], [], []], discard: ["KS1"], stock: ["4S0", "5S0"], down: [true, false] });
  const types = legalActions(st, 0).map((a) => a.type);
  assert.deepEqual(types, ["draw", "pickup"]);
  assert.deepEqual(legalActions(st, 1), []);
});

// ---------- Partidas completas ----------

for (const [label, config, levels] of [
  ["2 jugadores", { n: 2 }, [2, 3]],
  ["3 jugadores", { n: 3 }, [1, 2, 3]],
  ["4 individual", { n: 4, teams: false }, [3, 1, 2, 3]],
  ["4 en parejas", { n: 4, teams: true }, [1, 2, 3, 2]],
]) {
  test(`partida completa con la compu (${label}): 4 rondas, ninguna carta se pierde ni se duplica`, () => {
    let checks = 0;
    const st = playBots(levels, config, 11, (s) => {
      if (s.status !== "playing" || checks++ % 25) return;
      const h = s.hand, all = [...h.stock, ...h.discard, ...h.hands.flat(), ...h.piles.flat(2), ...h.melds.flat().flatMap((m) => m.cards)];
      assert.equal(all.length, TOTAL);
      assert.equal(new Set(all).size, TOTAL);
    });
    assert.equal(st.status, "gameover");
    assert.equal(st.roundNo, 4);
    assert.equal(st.scores.length, config.teams ? 2 : config.n);
  });
}

// ---------- Grabación ----------

test("grabar una ronda y reproducirla llega al mismo resultado (también si se revolvió el pozo)", () => {
  const recs = [];
  let reshuffled = false;
  playBots([2, 2, 2, 2], { n: 4, teams: true }, 9, (s) => {
    if (s.status === "playing" && s.hand.history.some((e) => e.reshuffled)) reshuffled = true;
    const id = roundRecordId(s);
    if (id && !recs.some((r) => r.id === id)) recs.push(buildRoundRecord(s, { mode: "practice", app: "test" }));
  });
  assert.equal(recs.length, 4);
  for (const rec of recs) {
    const back = JSON.parse(JSON.stringify(rec));
    const end = replayRound(back);
    assert.deepEqual(end.scores, rec.result.scores);
    assert.equal(end.result.goer, rec.result.goer);
  }
  const games = groupGames(recs);
  assert.equal(games.length, 1);
  assert.equal(games[0].status, "finished");
  assert.equal(games[0].rounds.length, 4);
  assert.ok(reshuffled, "con esta semilla el mazo se acaba y se revuelve el pozo");
});

test("un registro alterado no se puede reproducir", () => {
  let rec = null;
  playBots([1, 1], { n: 2 }, 9, (s) => { if (!rec && roundRecordId(s)) rec = buildRoundRecord(s); });
  const bad = JSON.parse(JSON.stringify(rec));
  const i = bad.events.findIndex((e) => e.a === "discard");
  bad.events[i].card = "ZZ9";
  assert.throws(() => replayRound(bad));
});

test("los equipos: parejas cruzadas con 4, cada quien solo en individual", () => {
  const st = makeState({ n: 4, teams: true });
  assert.deepEqual([0, 1, 2, 3].map((s) => teamOf(st, s)), [0, 1, 0, 1]);
  const ind = makeState({ n: 3 });
  assert.deepEqual([0, 1, 2].map((s) => teamOf(ind, s)), [0, 1, 2]);
});

test("las reglas por confirmar están en RULES", () => {
  assert.equal(RULES.baseCountsForAll, true);
  assert.equal(RULES.red3FromHand, true);
  assert.deepEqual(RULES.goOut, { clean: 5, dirty: 5 });
  assert.ok(closedCounts([]).clean === 0);
});

test("una ronda grabada con 'ver el pozo' se reproduce igual (issue #10)", () => {
  const recs = [];
  playBots([2, 2, 2, 2], { n: 4, teams: true }, 9, (s) => {
    const id = roundRecordId(s);
    if (id && !recs.some((r) => r.id === id)) recs.push(buildRoundRecord(s, { mode: "practice", app: "test" }));
  });
  const rec = recs.find((r) => r.events.some((e) => e.a === "pickup"));
  assert.ok(rec, "alguna ronda con levantar el pozo");
  const i = rec.events.findIndex((e) => e.a === "pickup");
  const pk = rec.events[i];
  rec.events.splice(i, 0, { t: pk.t, ms: 0, s: pk.s, a: "peek", by: "human", pair: pk.pair.slice() });
  const end = replayRound(JSON.parse(JSON.stringify(rec)));
  assert.deepEqual(end.scores, rec.result.scores);
});
