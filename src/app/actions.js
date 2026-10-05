// Casos de uso: todo lo que cambia el estado de la app. Cada acción deja el estado listo y llama a notify();
// la interfaz solo dibuja y traduce toques en estas acciones.
import { newTable, deal, apply, check, checkNewMeld, pickupPairs, needsMinimum, teamOf, isNatural, topOf, checkPair, newGame } from "../engine/index.js";
import { ls, initFirebase, signInWithGoogle, signOut, SKIP, makeDb, watchTableList, watchTable, saveNewTable, updateTable } from "../services/index.js";
import { state, notify, isGoogle, turnKey, clockKey, mySeat } from "./store.js";
import { BOT_NAMES } from "./bots.js";
import { runAI } from "./ai-client.js";
import { cleanupInactiveTables, CLEANUP_EVERY_MS } from "./cleanup.js";
import { watchCall, stopCall } from "./call.js";

// ---------- Sesión ----------
function applyUser(u) {
  state.authUser = u;
  state.me.id = isGoogle() ? "g_" + u.uid : state.deviceId;
  if (isGoogle() && !state.me.name && u.displayName) { state.me.name = u.displayName.split(" ")[0].slice(0, 16); ls.set("pata.name", state.me.name); }
}
// Conecta con Firebase (o se queda sin conexión, solo práctica) y empieza a escuchar la lista de mesas
export async function start() {
  try {
    state.db = makeDb(await initFirebase((u, first) => { applyUser(u); if (!first && state.view.screen === "lobby") notify(); }));
  } catch (e) { console.warn("Firebase no disponible:", e); state.db = null; }
  state.dbTried = true; notify();
  if (state.db) subscribeList();
}
export async function googleIn() {
  try { await signInWithGoogle(); }
  catch (e) {
    if (e.code !== "auth/popup-closed-by-user" && e.code !== "auth/cancelled-popup-request") { state.view.err = e.code === "auth/unauthorized-domain" ? "Este sitio aún no está autorizado en Firebase (Authorized domains)." : "No se pudo entrar con Google."; notify(); }
  }
}
export const googleOut = signOut;

let cleanupTimer = null;
function subscribeList() {
  if (!state.db || state.unsubList) return;
  state.unsubList = watchTableList(state.db, (list, updated) => {
    state.listCache = list; state.listUpdated = updated;
    cleanupInactiveTables();
    if (state.view.screen === "lobby") notify("list");
  }, () => { state.unsubList = null; });
  // Las mesas que se quedan vacías no vuelven a cambiar: se revisan cada minuto, no solo cuando cambia la lista
  if (!cleanupTimer) { cleanupTimer = setInterval(() => cleanupInactiveTables(), CLEANUP_EVERY_MS); cleanupTimer.unref?.(); }
}

// ---------- Mesas ----------
const freshView = (patch) => ({ screen: "lobby", code: null, practice: false, sel: [], err: "", ...patch });

export function openTable(code) {
  state.view = freshView({ screen: "table", code });
  if (state.unsubTable) state.unsubTable();
  state.tableState = null; notify();
  watchCall(code);
  state.unsubTable = watchTable(state.db, code, (st) => {
    state.tableState = st;
    if (!st) state.view.err = "Esta mesa ya no existe.";
    notify();
  }, () => { state.view.err = "Se perdió la conexión con la mesa. Vuelve a abrirla."; notify(); });
}

// Aplica un cambio a la mesa: en práctica, al estado local; en línea, con una transacción (lee lo último, valida y
// guarda). Devuelve true si el cambio se aplicó (o no hacía falta), false si hubo un error (queda en view.err).
export async function mutate(fn) {
  const view = state.view;
  view.err = "";
  if (view.practice) {
    try { const nx = fn(structuredClone(state.tableState)); if (nx !== SKIP) state.tableState = nx; }
    catch (e) { view.err = e.message; notify(); return false; }
    view.sel = []; notify(); return true;
  }
  try {
    const skipped = await updateTable(state.db, view.code, fn);
    if (skipped) { notify(); return true; }
  } catch (e) {
    view.err = e.code === "permission-denied" ? "No hay permiso para guardar en esta mesa." : (e.message || "Algo falló, intenta otra vez.");
    notify(); return false;
  }
  view.sel = []; notify(); return true;
}

// La interfaz pide el nombre antes de llamar (needName)
export async function createTable() {
  if (!state.db) return;
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
  const st = newTable(code, { ...state.config }, state.me.id);
  st.seats[0] = { id: state.me.id, name: state.me.name };
  try { await saveNewTable(state.db, st); openTable(code); }
  catch (e) { state.view.err = e.code === "permission-denied" ? "No hay permiso para crear mesas." : e.code === "resource-exhausted" ? "Se alcanzó el límite gratis de hoy. Intenta mañana." : "No se pudo crear la mesa."; notify(); }
}

// ---------- La compu en mesas en línea (antes de repartir) ----------
// Cualquier jugador sentado puede agregarla, quitarla o cambiarle el nivel. La mueve el teléfono de una persona
// sentada (ver bots.js), por eso para repartir hace falta al menos una persona.
function botName(seats) {
  const used = new Set(seats.filter(Boolean).map((s) => s.name));
  return BOT_NAMES.find((n) => !used.has(n)) || `Compu ${seats.filter((s) => s && s.bot).length + 1}`;
}
function editSeats(fn) {
  return mutate((s) => {
    if (s.status !== "lobby") throw new Error("La partida ya empezó.");
    if (mySeat(s) < 0) throw new Error("Siéntate primero.");
    fn(s); s.v++; return s;
  });
}
export function addBot(i, level = 2) {
  return editSeats((s) => { if (s.seats[i]) throw new Error("Ese asiento ya lo tomaron."); s.seats[i] = { id: "bot" + i, name: botName(s.seats), level, bot: true }; });
}
export function removeBot(i) {
  return editSeats((s) => { if (!(s.seats[i] && s.seats[i].bot)) throw new Error("En ese asiento no está la compu."); s.seats[i] = null; });
}
export function setOnlineBotLevel(i, level) {
  return editSeats((s) => { if (!(s.seats[i] && s.seats[i].bot)) throw new Error("En ese asiento no está la compu."); s.seats[i] = { ...s.seats[i], level }; });
}
export const hasPerson = (st) => st.seats.some((s) => s && !s.bot);
export function sit(i) {
  if (!state.me.name) return setError("Escribe tu nombre primero.");
  return mutate((s) => {
    if (s.status !== "lobby") throw new Error("La partida ya empezó.");
    if (s.seats[i]) throw new Error("Ese asiento ya lo tomaron.");
    s.seats = s.seats.map((x) => (x && x.id === state.me.id ? null : x)); s.seats[i] = { id: state.me.id, name: state.me.name }; s.v++; return s;
  });
}
export function stand() { return mutate((s) => { s.seats = s.seats.map((x) => (x && x.id === state.me.id ? null : x)); s.v++; return s; }); }
export function startOnline() {
  return mutate((s) => {
    if (s.status !== "lobby" || !s.seats.every(Boolean)) throw new Error("Faltan jugadores.");
    if (!hasPerson(s)) throw new Error("Hace falta al menos una persona sentada.");
    return deal(s);
  });
}
export const nextRound = () => mutate((s) => (s.status === "roundover" ? deal(s) : SKIP));
export const rematch = () => mutate((s) => (s.status === "gameover" ? deal(newGame(s)) : SKIP));
export const deleteTable = () => mutate(() => null).then(leave);

export function startPractice() {
  let st = newTable("PRÁCTICA", { ...state.config }, state.me.id);
  st.seats = st.seats.map((_, i) => (i === 0 ? { id: state.me.id, name: state.me.name || "Tú" } : { id: "bot" + i, name: BOT_NAMES[i - 1], level: state.botLevels[i - 1] }));
  st = deal(st);
  state.view = freshView({ screen: "table", code: st.code, practice: true });
  state.stage = { key: null, groups: [] };
  state.tableState = st; notify();
}

export function leave() {
  clearTimeout(state.botTimer); state.botTimer = null;
  if (state.unsubTable) { state.unsubTable(); state.unsubTable = null; }
  stopCall();
  state.tableState = null; state.view = freshView();
  state.stage = { key: null, groups: [] };
  notify();
}

// ---------- Vista ----------
// Cambia lo que se ve (menú, ventanas, registro abierto…) y vuelve a dibujar. Con redraw = false no redibuja.
export function setView(patch, redraw = true) { Object.assign(state.view, patch); if (redraw) notify(); }
export function setError(msg) { state.view.err = msg; notify(); }

// ---------- Preferencias ----------
export function setName(name) { state.me.name = name.trim(); ls.set("pata.name", state.me.name); } // sin redibujar: se está escribiendo
// Con 4, parejas por omisión; con 6, 3 parejas (2 = parejas, 3 = equipos de 3; ver engine/config.js)
export function setPlayers(n) { state.config = { n, teams: n === 4 ? true : n === 6 ? 2 : false, timer: state.config.timer }; notify(); }
export function setTimer(on) { state.config.timer = on; ls.set("pata.timer", on ? "1" : "0"); notify(); }
// false (individual), true (parejas con 4), 2 o 3 (con 6)
export function setTeams(v) { state.config.teams = v; notify(); }
const saveLevels = () => ls.set("pata.botLevels", JSON.stringify(state.botLevels));
// Nivel de la compu i (0-2) para las siguientes prácticas
export function setBotLevel(i, level) { state.botLevels[i] = level; saveLevels(); notify(); }
// Nivel de la compu sentada en el asiento seat de la práctica en curso (y para las siguientes)
export function setSeatLevel(seat, level) {
  state.tableState.seats[seat] = { ...state.tableState.seats[seat], level };
  if (seat >= 1 && seat <= state.botLevels.length) { state.botLevels[seat - 1] = level; saveLevels(); }
  notify();
}
export function setSort(by) { state.sortBy = by; ls.set("pata.sort", by); notify(); }

// ---------- Tu mano: cartas escogidas ----------
export function toggleCard(c) {
  const sel = state.view.sel;
  state.view.sel = sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c];
  state.view.err = "";
  notify();
}
export function clearSel() { state.view.sel = []; notify(); }

// ---------- Bajada en preparación (antes de llegar al mínimo) ----------
// Las patas que vas armando se quedan en este teléfono hasta que confirmas la bajada o levantas el pozo.
// Se borran solas si cambia el turno o si alguna carta ya no está en tu mano.
export function stagedGroups(st, seat) {
  const key = clockKey(st), hand = st && seat >= 0 && st.hand ? st.hand.hands[seat] : [];
  if (state.stage.key !== key) state.stage = { key, groups: [] };
  state.stage.groups = state.stage.groups.filter((g) => g.every((c) => hand.includes(c)));
  return state.stage.groups;
}
export function stageSelected(st, seat) {
  const sel = state.view.sel.slice(), groups = stagedGroups(st, seat);
  const e = checkNewMeld(sel);
  if (e) return setError(e);
  if (groups.some((g) => g.some((c) => sel.includes(c)))) return setError("Esa carta ya está en otra pata.");
  state.stage.groups = [...groups, sel];
  state.view.sel = []; state.view.err = "";
  notify();
}
export function unstage(i) { state.stage.groups = state.stage.groups.filter((_, k) => k !== i); notify(); }
export function clearStage() { state.stage.groups = []; notify(); }

// ---------- Jugadas de tu turno ----------
async function play(seat, action) {
  const ok = await mutate((s) => apply(s, seat, action));
  if (ok) { state.view.sel = []; notify(); }
  return ok;
}
export const doDraw = (seat) => play(seat, { type: "draw" });

// El par para levantar (o ver) el pozo: el que escogiste, o el único posible. { pair } o { error }.
function choosePair(st, seat, verb = "levantar") {
  const sel = state.view.sel;
  if (sel.length === 2) return { pair: sel.slice() };
  const pairs = pickupPairs(st, seat), nat = pairs.filter((p) => isNatural(p[0]));
  if (pairs.length === 1) return { pair: pairs[0] };
  if (nat.length === 1) return { pair: nat[0] };
  if (pairs.length > 1) return { error: `Escoge las dos cartas del par con el que quieres ${verb}.` };
  return { error: checkPair(topOf(st.hand), sel.length === 2 ? sel : ["", ""]) || "No tienes un par para levantar el pozo." };
}

// Ver las cartas que te llevarías del pozo (issue #10): tu par queda a la vista de todos. Abre la ventana del
// pozo con el par ya escogido, para levantar o robar desde ahí.
export async function doPeek(seat) {
  const st = state.tableState, r = choosePair(st, seat, "ver el pozo");
  if (r.error) return setError(r.error);
  const ok = await mutate((s) => apply(s, seat, { type: "peek", pair: r.pair }));
  if (ok) { state.view.sel = r.pair.slice(); setView({ sheet: "peek", seatMenu: null, track: null, advice: null }); }
  return ok;
}

// Levantar el pozo: con el par que escogiste, o con el único par posible. Si tu equipo no se ha bajado, usa la
// bajada que preparaste (sin el par).
export async function doPickup(seat) {
  const st = state.tableState, r = choosePair(st, seat);
  if (r.error) return setError(r.error);
  const pair = r.pair;
  const action = { type: "pickup", pair };
  if (needsMinimum(st, seat)) action.open = stagedGroups(st, seat).filter((g) => !g.some((c) => pair.includes(c)));
  const ok = await play(seat, action);
  if (ok) state.stage.groups = [];
  return ok;
}
// Bajar las cartas escogidas como pata nueva. Si tu equipo no se ha bajado, se apartan para la bajada.
export function doMeld(seat) {
  const st = state.tableState;
  if (!state.view.sel.length) return setError("Escoge las cartas de la pata.");
  if (needsMinimum(st, seat)) return stageSelected(st, seat);
  return play(seat, { type: "meld", groups: [state.view.sel.slice()] });
}
export async function confirmOpening(seat) {
  const groups = stagedGroups(state.tableState, seat).map((g) => g.slice());
  if (!groups.length) return setError("Primero aparta las patas de tu bajada.");
  const ok = await play(seat, { type: "meld", groups });
  if (ok) state.stage.groups = [];
  return ok;
}
export function doAdd(seat, meldId) {
  if (!state.view.sel.length) return setError("Escoge las cartas que quieres agregar a esa pata.");
  return play(seat, { type: "add", meld: meldId, cards: state.view.sel.slice() });
}
export function doDiscard(seat) {
  const sel = state.view.sel;
  if (sel.length !== 1) return setError("Escoge una sola carta para descartar.");
  return play(seat, { type: "discard", card: sel[0] });
}
// Para la interfaz: ¿se podría hacer esta jugada? (para prender o apagar botones)
export const canDo = (seat, action) => !!state.tableState && !check(state.tableState, seat, action);
export const myTeam = (st, seat) => teamOf(st, seat);

// ---------- Consejo: qué haría cada nivel ----------
export function askAdvice(seat) {
  const st = state.tableState; if (!st) return;
  const key = turnKey(st);
  state.view.track = null; state.view.advice = { key, data: null }; notify();
  runAI("advise", st, seat).then((data) => data, () => ({ error: true })).then((data) => {
    const view = state.view;
    if (!view.advice || view.advice.key !== key || turnKey(state.tableState) !== key) return; // ya cambió o lo cerraste
    view.advice.data = data;
    notify();
  });
}
// Hacer el primer paso que aconsejó un nivel
export function playAdvice(seat, action) {
  state.view.advice = null;
  return play(seat, action);
}
