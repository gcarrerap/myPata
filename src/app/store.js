// Estado de la app: un solo objeto, dueño de todo lo que la interfaz necesita saber.
// Las acciones (actions.js, bots.js, clock.js) lo cambian y llaman a notify(); la interfaz se suscribe
// con subscribe() y vuelve a dibujar. Los valores iniciales se leen de las preferencias del dispositivo.
import { ls } from "../services/index.js";

const deviceId = ls.get("pata.dev") || ("d" + Math.random().toString(36).slice(2, 10));
ls.set("pata.dev", deviceId);

function loadBotLevels() {
  let botLevels = [2, 2, 2];
  try { const bl = JSON.parse(ls.get("pata.botLevels") || "null"); if (Array.isArray(bl) && bl.length === 3) botLevels = bl.map((x) => Math.min(3, Math.max(1, +x || 2))); } catch {}
  return botLevels;
}

export const state = {
  deviceId,
  me: { id: deviceId, name: ls.get("pata.name") || "" }, // id cambia a "g_<uid>" si entra con Google
  authUser: null,
  db: null, dbTried: false, // Firestore (adaptador) y si ya se intentó conectar
  // Pantalla: lobby o mesa, y lo que se ve en la mesa (cartas escogidas, ventanas abiertas, consejo…)
  view: { screen: "lobby", code: null, practice: false, sel: [], err: "" },
  tableState: null, // la mesa abierta (en línea o de práctica)
  listCache: [], // mesas abiertas en el lobby
  listUpdated: {}, // por código de mesa: cuándo se guardó por última vez (ms)
  unsubTable: null, unsubList: null,
  config: { n: 4, teams: true, timer: ls.get("pata.timer") === "1" }, // modo para la siguiente mesa
  botLevels: loadBotLevels(), // nivel de cada compu en práctica
  sortBy: ls.get("pata.sort") === "suit" ? "suit" : "rank", // orden de tu mano (solo en este teléfono)
  // Bajada en preparación: patas que vas armando antes de llegar al mínimo (solo en este teléfono)
  stage: { key: null, groups: [] },
  clock: { key: null, start: 0, fired: false }, // reloj del turno, medido desde que este teléfono vio el turno
  botTimer: null,
  updateAvailable: false, // versión publicada más nueva que la que está corriendo
  // Llamada de voz y video de la mesa abierta (ver app/call.js). peers: los demás que están en la llamada.
  // output ("speaker" | "earpiece") y collapsed son preferencias de este teléfono (ver call.js)
  call: { code: null, status: "off", audio: true, video: false, err: "", peers: [], ringing: false, output: "speaker", collapsed: false },
};

// ---------- Suscripción ----------
// what: "list" cuando solo cambió la lista de mesas del lobby, "call" cuando solo cambió la llamada; undefined para
// todo lo demás
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify(what) { for (const fn of listeners) fn(what); }

// ---------- Derivados ----------
export const isGoogle = () => !!(state.authUser && !state.authUser.isAnonymous);
export const timerOn = (st) => !!(st && st.config && st.config.timer);
// "Ver manos": solo en práctica, para revisar qué hizo la compu. La compu nunca ve cartas ajenas.
export const canReveal = () => state.view.practice;
export function mySeat(st) {
  if (!st) return -1;
  if (state.view.practice) return 0;
  return st.seats.findIndex((s) => s && s.id === state.me.id);
}
// Cambia con cada acción (para no aplicar dos veces la jugada de la compu)
export function turnKey(st) {
  if (!st || st.status !== "playing") return null;
  const h = st.hand; return `${st.code}|${st.created}|${st.roundNo}|${h.turns}|${h.history.length}`;
}
// Cambia con cada turno (el reloj corre por turno, no por acción)
export function clockKey(st) {
  if (!st || st.status !== "playing") return null;
  return `${st.code}|${st.created}|${st.roundNo}|${st.hand.turns}`;
}
