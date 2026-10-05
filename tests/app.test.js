// Pruebas del estado de la app y sus acciones: práctica, tu turno (robar, levantar, apartar la bajada, bajar,
// agregar, descartar), la compu, el reloj, el consejo, la IA en un hilo aparte, mesas en línea y la grabación.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fakeFirebase } from "./fakes/firebase.js";
import { makeState, run, closedMelds } from "./helpers.js";

// localStorage de mentira antes de cargar la app (el estado inicial se lee de ahí)
const mem = new Map([["pata.botLevels", "[1,3,2]"], ["pata.timer", "1"]]);
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
globalThis.window = globalThis;
globalThis.FIREBASE_CONFIG = { projectId: "demo" };

const { state, subscribe, mySeat, canReveal, BOT_NAMES, BOT_DELAY, scheduleBot, tickClock, actions, recorder } = await import("../src/app/index.js");
const { runAI, _resetForTests } = await import("../src/app/ai-client.js");
const { handle } = await import("../src/ai/worker.js");
const { check, RULES } = await import("../src/engine/index.js");
const { createRecorder } = await import("../src/app/recorder.js");

let renders = 0;
subscribe(() => renders++);
const settle = () => new Promise((r) => setImmediate(r));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function reset() {
  actions.leave();
  delete globalThis.firebase; delete globalThis.Worker; _resetForTests();
  state.db = null; state.dbTried = false; state.authUser = null; state.unsubList = null; state.listCache = [];
  state.me = { id: state.deviceId, name: "" };
  state.config = { n: 4, teams: true, timer: false };
  state.botLevels = [2, 2, 2];
}
beforeEach(reset);

// Una práctica con la mesa armada a mano (tú en el asiento 0)
function practiceWith(o) {
  actions.startPractice();
  const st = makeState(o);
  st.code = "PRÁCTICA";
  st.seats = st.seats.map((s, i) => (i === 0 ? { id: state.me.id, name: "Tú" } : { id: "bot" + i, name: BOT_NAMES[i - 1], level: 2 }));
  state.tableState = st;
  return st;
}

// ---------- Estado inicial y práctica ----------

test("el estado inicial sale de las preferencias del dispositivo", () => {
  assert.match(state.deviceId, /^d[a-z0-9]+$/);
  assert.equal(mem.get("pata.dev"), state.deviceId);
  assert.equal(state.view.screen, "lobby");
});

test("practicar: tú en el asiento 1 y la compu en los demás, con sus niveles; la ronda ya está repartida", () => {
  state.me.name = "Memo"; state.botLevels = [1, 3, 2];
  actions.startPractice();
  const st = state.tableState;
  assert.equal(state.view.screen, "table");
  assert.ok(state.view.practice);
  assert.equal(st.status, "playing");
  assert.deepEqual(st.seats.map((s) => s.name), ["Memo", ...BOT_NAMES.slice(0, 3)]);
  assert.deepEqual(st.seats.slice(1).map((s) => s.level), [1, 3, 2]);
  assert.equal(mySeat(st), 0);
  assert.ok(canReveal());
});

test("preferencias: jugadores, modalidad, tiempo, niveles y orden de la mano se guardan en el dispositivo", () => {
  actions.setPlayers(3);
  assert.deepEqual(state.config, { n: 3, teams: false, timer: false });
  actions.setPlayers(4); actions.setTeams(false);
  assert.equal(state.config.teams, false);
  actions.setTimer(true); assert.equal(mem.get("pata.timer"), "1");
  actions.setBotLevel(2, 3); assert.equal(mem.get("pata.botLevels"), "[2,2,3]");
  actions.setSort("suit"); assert.equal(mem.get("pata.sort"), "suit");
  actions.setSort("rank");
});

// ---------- Tu turno ----------

test("escoger cartas, robar y descartar", async () => {
  practiceWith({ hands: [["KS0", "9S0", "4D0"], [], [], []], stock: ["5S0", "6S0", "7S0"], discard: ["8S0"] });
  actions.toggleCard("9S0"); actions.toggleCard("4D0"); actions.toggleCard("4D0");
  assert.deepEqual(state.view.sel, ["9S0"]);
  await actions.doDraw(0);
  assert.equal(state.tableState.hand.phase, "play");
  assert.deepEqual(state.view.sel, []);
  await actions.doDiscard(0);
  assert.match(state.view.err, /una sola carta/);
  actions.toggleCard("4D0");
  await actions.doDiscard(0);
  assert.equal(state.tableState.hand.turn, 1);
  assert.equal(state.tableState.hand.discard.at(-1), "4D0");
});

test("sin bajarse: Apartar va armando la bajada y Bajarme la confirma al llegar al mínimo", async () => {
  practiceWith({ hands: [[...run("A", 3), ...run("Q", 3), "9S0", "4D0"], [], [], []], phase: "play", roundNo: 2 });
  for (const c of run("A", 3)) actions.toggleCard(c);
  actions.doMeld(0);
  assert.deepEqual(state.stage.groups, [run("A", 3)]);
  assert.equal(state.tableState.hand.melds[0].length, 0, "todavía no se baja");
  await actions.confirmOpening(0);
  assert.match(state.view.err, /90 puntos.*llevas 60/);
  for (const c of run("Q", 3)) actions.toggleCard(c);
  actions.doMeld(0);
  await actions.confirmOpening(0);
  assert.equal(state.view.err, "");
  assert.equal(state.tableState.hand.melds[0].length, 2);
  assert.deepEqual(state.stage.groups, []);
});

test("una carta no se puede apartar dos veces, y lo apartado se borra al cambiar de turno", () => {
  const st = practiceWith({ hands: [[...run("A", 4), "9S0"], [], [], []], phase: "play" });
  for (const c of run("A", 3)) actions.toggleCard(c);
  actions.doMeld(0);
  actions.toggleCard("AS0"); actions.toggleCard("AC0"); actions.toggleCard("9S0");
  actions.stageSelected(st, 0);
  assert.ok(state.view.err);
  state.tableState = { ...st, hand: { ...st.hand, turns: 5 } };
  assert.deepEqual(actions.stagedGroups(state.tableState, 0), []);
});

test("levantar el pozo: con el único par posible, usando la bajada apartada", async () => {
  practiceWith({ hands: [["KS0", "KH0", ...run("A", 3), "9S0"], [], [], []], discard: ["4S1", "5S1", "KS1"] });
  await actions.doPickup(0);
  assert.match(state.view.err, /60 puntos/);
  for (const c of run("A", 3)) actions.toggleCard(c);
  actions.doMeld(0); // aparta los ases (se puede apartar antes de robar)
  await actions.doPickup(0);
  assert.equal(state.view.err, "");
  const h = state.tableState.hand;
  assert.equal(h.phase, "play");
  assert.deepEqual(h.melds[0].map((m) => m.rank).sort(), ["A", "K"]);
});

test("levantar con varios pares posibles pide escoger el par", async () => {
  practiceWith({ hands: [["7S0", "7H0", "9S0", "9H0", "4S0"], [], [], []], discard: ["4S1", "2S1"], down: [true, false] });
  await actions.doPickup(0);
  assert.match(state.view.err, /Escoge las dos cartas/);
  actions.toggleCard("9S0"); actions.toggleCard("9H0");
  await actions.doPickup(0);
  assert.deepEqual(state.tableState.hand.melds[0][0].cards, ["9S0", "9H0", "2S1"]);
});

test("agregar las cartas escogidas a una pata del equipo", async () => {
  practiceWith({ hands: [["KS0", "9S0", "9H0"], [], [], []], phase: "play", melds: [[{ id: 4, rank: "K", cards: run("K", 3, 4) }], []] });
  await actions.doAdd(0, 4);
  assert.match(state.view.err, /Escoge las cartas/);
  actions.toggleCard("KS0");
  assert.ok(actions.canDo(0, { type: "add", meld: 4, cards: state.view.sel }));
  await actions.doAdd(0, 4);
  assert.equal(state.tableState.hand.melds[0][0].cards.length, 4);
});

test("un error de reglas se muestra y deja las cartas escogidas", async () => {
  practiceWith({ hands: [["KS0", "QS0", "JS0", "9S0"], [], [], []], phase: "play", down: [true, false] });
  ["KS0", "QS0", "JS0"].forEach(actions.toggleCard);
  await actions.doMeld(0);
  assert.match(state.view.err, /mismo número/);
  assert.equal(state.view.sel.length, 3);
});

// ---------- La compu ----------

test("en práctica la compu juega sola cuando le toca, una acción a la vez", async () => {
  practiceWith({ hands: [["9S0", "4D0"], run("K", 3), [], []], stock: run("5", 6), discard: ["8S0"], phase: "play" });
  actions.toggleCard("4D0");
  await actions.doDiscard(0);
  assert.equal(state.tableState.hand.turn, 1);
  scheduleBot();
  await sleep(BOT_DELAY.draw + 50);
  assert.equal(state.tableState.hand.phase, "play", "la compu robó");
  assert.equal(state.tableState.hand.turn, 1);
  actions.leave();
  assert.equal(state.botTimer, null);
});

test("al salir de la mesa mientras la compu piensa, su jugada se descarta", async () => {
  practiceWith({ hands: [["9S0"], run("K", 3), [], []], stock: run("5", 6), discard: ["8S0"], turn: 1 });
  scheduleBot();
  actions.leave();
  await sleep(BOT_DELAY.draw + 50);
  assert.equal(state.tableState, null);
});

// ---------- Reloj ----------

test("reloj: cuenta 60 s por turno y al vencerse roba y descarta por ti, una sola vez", async () => {
  const st = practiceWith({ hands: [["9S0", "3S0"], [], [], []], stock: run("5", 6), discard: ["8S0"] });
  state.tableState = { ...st, config: { ...st.config, timer: true } };
  const t0 = Date.now();
  const c = tickClock(t0);
  assert.equal(c.secs, RULES.turnMs / 1000);
  assert.equal(c.fire, null);
  const late = tickClock(t0 + RULES.turnMs + 10);
  assert.ok(late.fire);
  assert.equal(tickClock(t0 + RULES.turnMs + 20).fire, null, "solo una vez");
  await late.fire();
  const h = state.tableState.hand;
  assert.equal(h.turn, 1);
  assert.equal(h.discard.at(-1), "3S0");
});

test("sin reloj no hay cuenta atrás", () => {
  practiceWith({ hands: [["9S0"], [], [], []] });
  assert.equal(tickClock(), null);
});

// ---------- Consejo ----------

test("consejo: pide a la IA lo que harían los tres niveles y se puede hacer el primer paso", async () => {
  practiceWith({ hands: [["KS0", "9S0", "4D0"], [], [], []], stock: run("5", 4), discard: ["8S0"] });
  actions.askAdvice(0);
  assert.equal(state.view.advice.data, null);
  await settle();
  const d = state.view.advice.data;
  assert.equal(d.levels.length, 3);
  await actions.playAdvice(0, d.levels[0].steps[0].action);
  assert.equal(state.tableState.hand.phase, "play");
  assert.equal(state.view.advice, null);
});

// ---------- La IA en un hilo aparte ----------

class FakeWorker {
  static last = null; static mode = "ok";
  constructor(url, opts) { this.url = String(url); this.opts = opts; this.inbox = []; this.terminated = false; FakeWorker.last = this; }
  postMessage(msg) {
    if (FakeWorker.mode === "fail") { setImmediate(() => this.onerror && this.onerror({ message: "no se pudo cargar" })); return; }
    this.inbox.push(structuredClone(msg));
  }
  reply() { const msg = this.inbox.shift(); this.onmessage({ data: structuredClone(handle(msg)) }); }
  terminate() { this.terminated = true; }
}

test("IA: con Worker el cálculo va al hilo aparte y cada respuesta llega a quien la pidió", async () => {
  globalThis.Worker = FakeWorker; FakeWorker.mode = "ok";
  const st = makeState({ hands: [run("K", 3), [], [], []], stock: run("5", 4), discard: ["9S0"] });
  const p1 = runAI("botMove", st, 0, 1), p2 = runAI("advise", st, 0);
  const w = FakeWorker.last;
  assert.match(w.url, /ai\/worker\.js$/);
  assert.equal(w.opts.type, "module");
  w.inbox.reverse(); w.reply(); w.reply();
  const m = await p1; const { why, ...a } = m;
  assert.equal(check(st, 0, a), null);
  assert.equal((await p2).levels.length, 3);
});

test("IA: si el worker no carga, se calcula aquí", async () => {
  globalThis.Worker = FakeWorker; FakeWorker.mode = "fail";
  const warn = console.warn; console.warn = () => {};
  try {
    const st = makeState({ hands: [run("K", 3), [], [], []], stock: run("5", 4), discard: ["9S0"] });
    const m = await runAI("botMove", st, 0, 2);
    assert.equal(m.type, "draw");
    assert.ok(FakeWorker.last.terminated);
  } finally { console.warn = warn; FakeWorker.mode = "ok"; }
  await assert.rejects(runAI("borrarTodo"), /desconocida/);
});

// ---------- Mesas en línea ----------

async function online() {
  const fb = fakeFirebase(); globalThis.firebase = fb.firebase;
  await actions.start();
  return fb;
}

test("en línea: crear mesa, sentarse, agregar la compu, repartir y jugar con transacciones", async () => {
  const fb = await online();
  assert.ok(state.db);
  state.me.name = "Memo";
  state.config = { n: 2, teams: false, timer: false };
  await actions.createTable();
  const code = state.view.code;
  await settle();
  assert.equal(state.tableState.seats[0].name, "Memo");
  assert.equal(state.listCache.length, 1);
  await actions.addBot(1, 3);
  await settle();
  assert.deepEqual(state.tableState.seats[1], { id: "bot1", name: "Lupe", level: 3, bot: true });
  await actions.startOnline();
  await settle();
  const st = state.tableState;
  assert.equal(st.status, "playing");
  assert.equal(JSON.parse(fb.fs._docs.get("pata_mesas/" + code).json).status, "playing");
  // Tu turno (asiento 0): robar y descartar, cada acción en su transacción
  await actions.doDraw(0); await settle();
  assert.equal(state.tableState.hand.phase, "play");
  actions.toggleCard(state.tableState.hand.hands[0][0]);
  await actions.doDiscard(0); await settle();
  assert.equal(state.tableState.hand.turn, 1);
  // La compu juega desde este teléfono (eres la única persona sentada)
  scheduleBot();
  await sleep(BOT_DELAY.draw + 100); await settle();
  assert.equal(state.tableState.hand.phase, "play");
  actions.leave();
});

test("en línea: no se puede repartir sin una persona, ni sentarse sin nombre", async () => {
  await online();
  state.me.name = "Ana"; state.config = { n: 2, teams: false, timer: false };
  await actions.createTable(); await settle();
  await actions.addBot(1, 2); await settle();
  await actions.stand(); await settle();
  await actions.startOnline();
  assert.match(state.view.err, /Faltan jugadores/);
  state.me.name = "";
  actions.sit(0);
  assert.match(state.view.err, /nombre/);
  actions.leave();
});

// ---------- Grabación ----------

test("grabación: cada ronda terminada se encola una vez y se sube; si otro teléfono ya la subió, se descarta", async () => {
  const store = new Map(), ls = { get: (k) => store.get(k) ?? null, set: (k, v) => store.set(k, v) };
  const saved = [];
  let db = null, fail = null;
  const rec = createRecorder({ store: ls, getDb: () => db, save: async (_db, r) => { if (fail) throw Object.assign(new Error(fail), { code: fail }); saved.push(r.id); } });
  const end = makeState({ hands: [["9S0"], [], [], []], phase: "play", melds: [closedMelds(5, 5), []] });
  const { apply } = await import("../src/engine/index.js");
  const done = apply(end, 0, { type: "discard", card: "9S0" });
  assert.ok(rec.capture(done, { mode: "practice" }));
  assert.ok(!rec.capture(done, { mode: "practice" }), "no se graba dos veces");
  assert.equal(rec.pending().length, 1, "sin conexión se queda en la cola");
  db = {}; await rec.flush();
  assert.deepEqual(saved, ["gtest_1"]);
  assert.equal(rec.pending().length, 0);
  // otro teléfono ya la había subido: las reglas responden permission-denied y se descarta
  const done2 = { ...done, roundNo: 2 };
  fail = "permission-denied";
  rec.capture(done2, {});
  await rec.flush();
  assert.equal(rec.pending().length, 0);
  assert.ok(recorder);
});

test("ver el pozo: enseña el par, abre la ventana con el par escogido y desde ahí se levanta (issue #10)", async () => {
  practiceWith({ hands: [["KS0", "KH0", "9S0", "QS0"], ["5S0"], ["5H0"], ["5D0"]], discard: ["4S1", "6S1", "7S1", "8S1", "QS1", "KS1"], down: [true, false] });
  await actions.doPeek(0);
  assert.equal(state.view.sheet, "peek");
  assert.deepEqual(state.view.sel, ["KS0", "KH0"]);
  assert.equal(state.tableState.hand.phase, "draw");
  await actions.doPickup(0);
  assert.equal(state.tableState.hand.phase, "play");
  assert.ok(state.tableState.hand.hands[0].includes("QS1"));
});

test("practicar con 6 (issue #12): 5 compus, 3 parejas o 2 equipos de 3", () => {
  state.me.name = "Memo"; state.botLevels = [1, 2, 3, 1, 2];
  actions.setPlayers(6);
  assert.deepEqual(state.config, { n: 6, teams: 2, timer: false });
  actions.startPractice();
  let st = state.tableState;
  assert.equal(st.seats.length, 6);
  assert.deepEqual(st.seats.slice(1).map((s) => s.name), BOT_NAMES);
  assert.deepEqual(st.seats.slice(1).map((s) => s.level), [1, 2, 3, 1, 2]);
  assert.equal(st.hand.melds.length, 3);
  actions.leave();
  actions.setTeams(3);
  actions.startPractice();
  st = state.tableState;
  assert.equal(st.hand.melds.length, 2);
  actions.leave();
  actions.setPlayers(4);
});

test("antes de robar se aparta la bajada y se levanta el pozo bajándose en la misma jugada (issue #18)", async () => {
  // Sin bajarse; tope 4: par de 4 en la mano y una bajada de Q Q joker (70) sin usar el par
  practiceWith({ hands: [["4S0", "4D0", "QS0", "QC0", "XR0", "9S0", "8H0"], ["5S0"], ["5H0"], ["5D0"]], discard: ["7S1", "6S1", "KS1", "8S1", "JS1", "4H1"] });
  const st = state.tableState;
  assert.equal(st.hand.phase, "draw");
  state.view.sel = ["QS0", "QC0", "XR0"];
  actions.stageSelected(st, 0);
  assert.deepEqual(actions.stagedGroups(state.tableState, 0), [["QS0", "QC0", "XR0"]]);
  assert.equal(state.tableState.hand.phase, "draw", "apartar no roba");
  await actions.doPickup(0);
  const h = state.tableState.hand;
  assert.equal(h.phase, "play");
  assert.ok(h.down[0], "se bajó");
  assert.equal(h.melds[0].length, 2, "la bajada y la pata del par con el tope");
  assert.ok(h.hands[0].includes("JS1"), "se llevó el pozo");
});
