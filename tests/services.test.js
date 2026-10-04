// Pruebas de los servicios (Firebase y localStorage) con un Firebase de mentira en memoria.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fakeFirebase, fakeFirestore } from "./fakes/firebase.js";
import { _resetLoaderForTests } from "../src/services/firebase.js";
import { ls, loadFirebaseSdk, initFirebase, signInWithGoogle, signOut, SKIP, makeDb, watchTableList, watchTable, saveNewTable, updateTable } from "../src/services/index.js";
import { newTable, deal, apply } from "../src/engine/index.js";
import { seeded } from "./helpers.js";

// Los servicios corren en el navegador; aquí `window` es el objeto global de Node
globalThis.window = globalThis;

function mesa(code, created = 1) {
  const st = newTable(code, { n: 2, teams: false }, "host");
  st.created = created;
  st.seats = [{ id: "a", name: "Ana" }, { id: "b", name: "Beto" }];
  return st;
}

// ---------- localStorage ----------

test("prefs: sin localStorage no truena", () => {
  delete globalThis.localStorage;
  assert.equal(ls.get("pata.name"), null);
  assert.doesNotThrow(() => ls.set("pata.name", "Memo"));
});

test("prefs: si el navegador bloquea el almacenamiento, no truena", () => {
  globalThis.localStorage = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("QuotaExceeded"); } };
  assert.equal(ls.get("pata.name"), null);
  assert.doesNotThrow(() => ls.set("pata.name", "Memo"));
  delete globalThis.localStorage;
});

test("prefs: guarda y lee", () => {
  const m = new Map();
  globalThis.localStorage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  ls.set("pata.timer", "0");
  assert.equal(ls.get("pata.timer"), "0");
  delete globalThis.localStorage;
});

// ---------- Mesas en Firestore ----------

test("una mesa se guarda como JSON y regresa idéntica, con listas dentro de listas", async () => {
  const fs = fakeFirestore(), db = makeDb(fs);
  const st = deal(mesa("ABCD", 1000), seeded(1));
  const s1 = apply(st, st.hand.turn, { type: "draw" });
  await saveNewTable(db, s1);
  const raw = fs._docs.get("pata_mesas/ABCD");
  assert.equal(typeof raw.json, "string");
  assert.equal(raw.code, "ABCD");
  assert.equal(raw.created, 1000);
  assert.ok(raw.updated >= raw.created);
  const back = (await db.doc("pata_mesas/ABCD").get()).data();
  assert.deepEqual(back, s1);
  assert.ok(Array.isArray(back.hand.piles[0][0]));
});

test("escuchar una mesa: recibe cada cambio, y null cuando la borran", async () => {
  const db = makeDb(fakeFirestore());
  const seen = [];
  const stop = watchTable(db, "WXYZ", (st) => seen.push(st && st.v));
  await saveNewTable(db, mesa("WXYZ"));
  await updateTable(db, "WXYZ", (st) => ({ ...st, v: st.v + 1 }));
  await updateTable(db, "WXYZ", () => null);
  stop();
  await saveNewTable(db, mesa("WXYZ")); // ya no escucha
  assert.deepEqual(seen, [null, 0, 1, null]);
});

test("la lista de mesas: las 20 más recientes primero", async () => {
  const db = makeDb(fakeFirestore());
  for (let i = 0; i < 25; i++) await saveNewTable(db, mesa("M" + String(i).padStart(3, "0"), 1000 + i));
  let list = null, updated = null;
  const stop = watchTableList(db, (l, u) => { list = l; updated = u; });
  assert.equal(list.length, 20);
  assert.equal(Object.keys(updated).length, 20);
  assert.ok(list.every((t) => typeof updated[t.code] === "number"), "trae cuándo se guardó cada mesa");
  assert.equal(list[0].code, "M024");
  assert.equal(list[19].code, "M005");
  stop();
});

// ---------- Cambios con transacción ----------

test("updateTable aplica el cambio sobre lo último guardado", async () => {
  const fs = fakeFirestore(), db = makeDb(fs);
  await saveNewTable(db, deal(mesa("PLAY"), seeded(2)));
  const skipped = await updateTable(db, "PLAY", (st) => apply(st, st.hand.turn, { type: "draw" }));
  assert.equal(skipped, false);
  const st = (await db.doc("pata_mesas/PLAY").get()).data();
  assert.equal(st.hand.hands[0].length, 13);
});

test("SKIP no guarda nada", async () => {
  const fs = fakeFirestore(), db = makeDb(fs);
  await saveNewTable(db, mesa("SKIP"));
  const before = fs._docs.get("pata_mesas/SKIP");
  const skipped = await updateTable(db, "SKIP", () => SKIP);
  assert.equal(skipped, true);
  assert.equal(fs.writes, 0);
  assert.deepEqual(fs._docs.get("pata_mesas/SKIP"), before);
});

test("una jugada inválida no se guarda y el error llega a quien la pidió", async () => {
  const fs = fakeFirestore(), db = makeDb(fs);
  await saveNewTable(db, deal(mesa("BAD1"), seeded(3)));
  await assert.rejects(updateTable(db, "BAD1", (st) => apply(st, st.hand.turn, { type: "discard", card: "ZZ9" })), /Primero roba/);
  assert.equal(fs.writes, 0);
});

test("cambiar una mesa que ya no existe da un error claro", async () => {
  const db = makeDb(fakeFirestore());
  await assert.rejects(updateTable(db, "NADA", (st) => st), /Esta mesa ya no existe/);
});

test("el cambio recibe una copia: modificarla no toca lo guardado si se cancela", async () => {
  const fs = fakeFirestore(), db = makeDb(fs);
  await saveNewTable(db, mesa("COPY"));
  await updateTable(db, "COPY", (st) => { st.seats[0].name = "Cambiado"; return SKIP; });
  assert.equal((await db.doc("pata_mesas/COPY").get()).data().seats[0].name, "Ana");
});

// ---------- Firebase: arranque y sesión ----------

let fb;
beforeEach(() => { delete globalThis.firebase; });

// document de mentira: guarda los <script> que se agregan y deja decidir si cargan o fallan
function fakeDocument() {
  _resetLoaderForTests();
  const scripts = [];
  return { scripts, createElement: () => ({}), head: { appendChild: (s) => scripts.push(s) } };
}

test("sin configuración, initFirebase truena sin cargar nada (el juego sigue en modo práctica)", async () => {
  globalThis.document = fakeDocument();
  try {
    await assert.rejects(initFirebase(() => {}, {}), /sin config/);
    await assert.rejects(initFirebase(() => {}, undefined), /sin config/);
    assert.equal(document.scripts.length, 0);
  } finally { delete globalThis.document; }
});

test("si el CDN no responde, initFirebase truena (modo práctica) y luego se puede reintentar", async () => {
  globalThis.document = fakeDocument();
  try {
    const p = initFirebase(() => {}, { projectId: "x" });
    document.scripts[1].onerror();
    await assert.rejects(p, /No se pudo cargar firebase-auth-compat\.js/);
    loadFirebaseSdk();
    assert.equal(document.scripts.length, 6, "reintenta");
  } finally { delete globalThis.document; }
});

test("el SDK se carga del CDN después de dibujar: tres scripts en paralelo que corren en orden", async () => {
  globalThis.document = fakeDocument();
  try {
    const p = loadFirebaseSdk(), p2 = loadFirebaseSdk();
    assert.deepEqual(document.scripts.map((x) => x.src.split("/").pop()), ["firebase-app-compat.js", "firebase-auth-compat.js", "firebase-firestore-compat.js"]);
    assert.ok(document.scripts.every((x) => x.src.startsWith("https://www.gstatic.com/firebasejs/10.12.2/") && x.async === false));
    document.scripts.forEach((x) => x.onload());
    await p; await p2;
    assert.equal(document.scripts.length, 3, "no se carga dos veces");
  } finally { delete globalThis.document; }
});

test("si el SDK cargó pero no dejó `firebase`, initFirebase truena", async () => {
  globalThis.document = fakeDocument();
  try {
    const p = initFirebase(() => {}, { projectId: "x" });
    await Promise.resolve();
    document.scripts.forEach((x) => x.onload());
    await assert.rejects(p, /sin config/);
  } finally { delete globalThis.document; }
});

test("sin sesión, entra como invitado y avisa del usuario una vez como 'primero'", async () => {
  fb = fakeFirebase(); globalThis.firebase = fb.firebase;
  const users = [];
  const fs = await initFirebase((u, first) => users.push([u.uid, u.isAnonymous, first]), { projectId: "demo" });
  assert.equal(fs, fb.fs);
  assert.deepEqual(fb.calls.slice(0, 3), ["initializeApp:demo", "getRedirectResult", "signInAnonymously"]);
  assert.deepEqual(users, [["anon1", true, true]]);
  // después entra con Google: el aviso ya no es el primero
  await signInWithGoogle();
  assert.deepEqual(users[1], ["g1", false, false]);
  assert.ok(fb.calls.includes("prompt:select_account"));
});

test("si ya había sesión, no entra como invitado", async () => {
  fb = fakeFirebase({ user: { uid: "g9", isAnonymous: false } }); globalThis.firebase = fb.firebase;
  const users = [];
  await initFirebase((u, first) => users.push([u.uid, first]), { projectId: "demo" });
  assert.ok(!fb.calls.includes("signInAnonymously"));
  assert.deepEqual(users, [["g9", true]]);
});

test("si falla entrar como invitado, initFirebase termina igual (sin usuario)", async () => {
  fb = fakeFirebase({ anonFails: true }); globalThis.firebase = fb.firebase;
  const warn = console.warn; console.warn = () => {};
  const users = [];
  try { await initFirebase((u) => users.push(u), { projectId: "demo" }); } finally { console.warn = warn; }
  assert.deepEqual(users, []);
});

test("Google: si el navegador bloquea la ventana, entra por redirección", async () => {
  fb = fakeFirebase({ popup: "auth/popup-blocked" }); globalThis.firebase = fb.firebase;
  await signInWithGoogle();
  assert.deepEqual(fb.calls.filter((c) => c.startsWith("signIn")), ["signInWithPopup", "signInWithRedirect"]);
});

test("Google: los demás errores llegan a la interfaz con su código", async () => {
  fb = fakeFirebase({ popup: "auth/unauthorized-domain" }); globalThis.firebase = fb.firebase;
  await assert.rejects(signInWithGoogle(), (e) => e.code === "auth/unauthorized-domain");
  fb = fakeFirebase({ popup: "auth/popup-blocked", redirect: "auth/operation-not-allowed" }); globalThis.firebase = fb.firebase;
  await assert.rejects(signInWithGoogle(), (e) => e.code === "auth/operation-not-allowed");
});

test("salir nunca truena", async () => {
  fb = fakeFirebase({ signOutFails: true }); globalThis.firebase = fb.firebase;
  await assert.doesNotReject(signOut());
});

// ---------- Rondas grabadas ----------

test("una ronda grabada se guarda como JSON en pata_rondas, con id fijo", async () => {
  const { saveRoundRecord, RECORDINGS } = await import("../src/services/index.js");
  const fs = fakeFirestore(), db = makeDb(fs);
  await saveRoundRecord(db, { id: "g1_2", gameId: "g1", round: 2, mode: "online", v: 1, start: 5, events: [[1, 2]] });
  const raw = fs._docs.get(`${RECORDINGS}/g1_2`);
  assert.equal(RECORDINGS, "pata_rondas");
  assert.equal(typeof raw.json, "string");
  assert.equal(raw.round, 2);
  assert.deepEqual(JSON.parse(raw.json).events, [[1, 2]]);
});
