// Pruebas de la limpieza de mesas vacías, con el Firebase de mentira.
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { fakeFirebase } from "./fakes/firebase.js";

globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.window = globalThis;
globalThis.FIREBASE_CONFIG = { projectId: "demo" };
const fb = fakeFirebase(); globalThis.firebase = fb.firebase;

const { isEmptyTable, newTable, deal } = await import("../src/engine/index.js");
const { state, actions } = await import("../src/app/index.js");
const { cleanupInactiveTables, idleLimitMs, EMPTY_TABLE_GRACE_MS } = await import("../src/app/cleanup.js");

const MIN = 60 * 1000;
const settle = () => new Promise((r) => setImmediate(r));
const exists = (code) => fb.fs._docs.has("pata_mesas/" + code);

// Guarda una mesa directo en la base, como si la hubiera guardado otro teléfono hace `ago` ms
async function put(code, { seated = [], status = "lobby", ago = 0 } = {}) {
  let st = newTable(code, { n: 2, teams: false }, "host");
  seated.forEach((name, i) => (st.seats[i] = { id: "id" + name, name }));
  if (status !== "lobby") st = deal(st);
  const now = Date.now();
  await fb.fs.doc("pata_mesas/" + code).set({ json: JSON.stringify(st), code, created: now - ago, updated: now - ago });
  await settle();
}

before(async () => { await actions.start(); });

test("una mesa sin repartir y sin nadie sentado cuenta como vacía", () => {
  const st = newTable("X", { n: 2, teams: false }, "h");
  assert.ok(isEmptyTable(st));
  st.seats[1] = { id: "a", name: "Ana" };
  assert.ok(!isEmptyTable(st));
  const started = deal({ ...st, seats: [{ id: "a", name: "A" }, { id: "b", name: "B" }] });
  assert.ok(!isEmptyTable({ ...started, seats: [null, null] }), "una partida empezada no cuenta");
});

test("una mesa vacía desde hace más de 5 minutos se borra sola al llegar al lobby", async () => {
  await put("VIEJ", { ago: 10 * MIN });
  await settle(); await settle();
  assert.ok(!exists("VIEJ"));
});

test("una mesa vacía hace poco se queda; se borra cuando se cumplen los 5 minutos", async () => {
  await put("RECI", { ago: 1 * MIN });
  assert.ok(exists("RECI"));
  assert.deepEqual(await cleanupInactiveTables(Date.now() + 3 * MIN), []);
  assert.ok(exists("RECI"), "a los 4 minutos todavía no");
  assert.deepEqual(await cleanupInactiveTables(Date.now() + EMPTY_TABLE_GRACE_MS), ["RECI"]);
  assert.ok(!exists("RECI"));
});

// ---------- Mesas inactivas con personas ----------

test("con personas sentadas y sin repartir: se queda hasta 1 hora sin cambios, luego se borra", async () => {
  await put("SENT", { seated: ["Ana"], ago: 30 * MIN });
  assert.ok(exists("SENT"), "a los 30 minutos se queda");
  assert.deepEqual(await cleanupInactiveTables(Date.now() + 29 * MIN), [], "a los 59 minutos se queda");
  assert.deepEqual(await cleanupInactiveTables(Date.now() + 30 * MIN), ["SENT"]);
  assert.ok(!exists("SENT"));
});

test("partida empezada (con o sin compu): se queda hasta 6 horas sin jugadas, luego se borra", async () => {
  await put("JUEG", { seated: ["Ana", "Beto"], status: "playing", ago: 5 * 60 * MIN });
  assert.ok(exists("JUEG"), "a las 5 horas se queda");
  assert.deepEqual(await cleanupInactiveTables(Date.now() + 59 * MIN), [], "a las 5:59 se queda");
  assert.deepEqual(await cleanupInactiveTables(Date.now() + 60 * MIN), ["JUEG"]);
  assert.ok(!exists("JUEG"));
});

test("una mesa vieja que ya existía se borra en cuanto alguien abre el lobby", async () => {
  await put("ABAN", { seated: ["Ana", "Beto"], status: "playing", ago: 24 * 60 * MIN });
  await settle(); await settle();
  assert.ok(!exists("ABAN"));
});

test("si alguien jugó justo antes de borrar (otra versión), la partida no se borra", async () => {
  await put("ACTV", { seated: ["Ana", "Beto"], status: "playing", ago: 2 * 60 * MIN });
  const listed = state.listCache.find((t) => t.code === "ACTV");
  // la lista del lobby la ve inactiva (dato viejo), pero en la base ya hay una jugada nueva
  state.listCache = [listed]; state.listUpdated = { ACTV: Date.now() - 7 * 60 * MIN };
  const doc = fb.fs._docs.get("pata_mesas/ACTV"), st = JSON.parse(doc.json); st.v++;
  fb.fs._docs.set("pata_mesas/ACTV", { ...doc, json: JSON.stringify(st) });
  assert.deepEqual(await cleanupInactiveTables(), []);
  assert.ok(exists("ACTV"));
});

test("los límites dependen del estado de la mesa", () => {
  const t = newTable("L", { n: 2, teams: false }, "h");
  assert.equal(idleLimitMs(t), EMPTY_TABLE_GRACE_MS);
  assert.equal(idleLimitMs({ ...t, seats: [null, { id: "bot1", name: "Lupe", bot: true }] }), EMPTY_TABLE_GRACE_MS, "solo compu cuenta como vacía");
  assert.equal(idleLimitMs({ ...t, seats: [{ id: "a", name: "Ana" }, null] }), 60 * MIN);
  assert.equal(idleLimitMs({ ...t, status: "playing" }), 6 * 60 * MIN);
  assert.equal(idleLimitMs({ ...t, status: "gameover" }), 6 * 60 * MIN);
});

test("si alguien se sienta justo antes de borrar, la mesa no se borra", async () => {
  await put("JUST", { seated: ["Ana"], ago: 30 * MIN });
  // la lista del lobby todavía la ve vacía (dato viejo), pero en la base ya hay alguien sentado
  const stale = newTable("JUST", { n: 2, teams: false }, "host");
  state.listCache = [stale]; state.listUpdated = { JUST: Date.now() - 30 * MIN };
  assert.deepEqual(await cleanupInactiveTables(), []);
  assert.ok(exists("JUST"));
});

test("si la mesa ya no existe o Firestore no deja borrar, no pasa nada", async () => {
  const stale = newTable("NADA", { n: 2, teams: false }, "host");
  state.listCache = [stale]; state.listUpdated = { NADA: 0 };
  assert.deepEqual(await cleanupInactiveTables(), []);
});

test("cuando el último jugador se levanta, la mesa se borra después del margen", async () => {
  state.me.name = "Ana"; state.config = { n: 2, teams: false, timer: false };
  await actions.createTable();
  const code = state.view.code;
  await actions.mutate((s) => { s.seats = s.seats.map(() => null); s.v++; return s; }); // "Levantarme"
  await settle();
  assert.ok(exists(code), "recién vacía: se queda");
  await cleanupInactiveTables(Date.now() + EMPTY_TABLE_GRACE_MS + 1000);
  await settle();
  assert.ok(!exists(code));
  assert.equal(state.tableState, null, "quien la estaba viendo ve que ya no existe");
  assert.equal(state.view.err, "Esta mesa ya no existe.");
});
