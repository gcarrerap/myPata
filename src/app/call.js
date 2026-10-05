// La llamada de voz y video de la mesa abierta, conectada al estado de la app (state.call).
// Al abrir una mesa en línea se empieza a escuchar quién está en su llamada (para mostrar "Fulano está en la
// llamada · Entrar" y hacer sonar el teléfono); al salir de la mesa se cuelga y se deja de escuchar.
// La conexión en sí está en call-session.js.
import { state, notify } from "./store.js";
import { ls } from "../services/index.js";
import { createCallSession, STUN } from "./call-session.js";

export const RING_MS = 30 * 1000; // cuánto suena cuando alguien empieza una llamada

// Entorno del navegador; las pruebas lo reemplazan con _setCallEnv
const callEnv = {
  get RTCPeerConnection() { return globalThis.RTCPeerConnection; },
  getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
  iceServers: fetchIceServers,
};
export function _setCallEnv(patch) { Object.defineProperties(callEnv, Object.getOwnPropertyDescriptors(patch)); }

// Servidores ICE: STUN de Google y, si hay window.TURN_URL (ver scripts/turn-worker.js), los de TURN.
// El puerto 53 se quita porque los navegadores lo bloquean y solo hace esperar.
export async function fetchIceServers(url = globalThis.TURN_URL) {
  if (!url) return STUN;
  try {
    const res = await fetch(url);
    if (!res.ok) return STUN;
    const list = (await res.json()).iceServers;
    if (!Array.isArray(list) || !list.length) return STUN;
    return list.map((s) => ({ ...s, urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) })).filter((s) => s.urls.length);
  } catch { return STUN; }
}

export const callSupported = () => !!(globalThis.RTCPeerConnection && globalThis.navigator?.mediaDevices?.getUserMedia);

// Vistas durante la llamada: solo el juego, el juego con los videos chiquitos, o solo los videos
export const CALL_VIEWS = ["game", "mini", "videos"];
// Preferencias de este teléfono: por dónde sale el audio, si los controles están colapsados y la vista
export const callPrefs = () => ({
  output: ls.get("pata.callOut") === "earpiece" ? "earpiece" : "speaker",
  collapsed: ls.get("pata.callMin") === "1",
  view: CALL_VIEWS.includes(ls.get("pata.callView")) ? ls.get("pata.callView") : "mini",
});
// deaf: el sonido de la llamada apagado en este teléfono (no se recuerda: cada llamada empieza con sonido)
export const blankCall = () => ({ code: null, status: "off", audio: true, video: false, err: "", peers: [], ringing: false, deaf: false, ...callPrefs() });

let session = null, prevOthers = 0, ringTimer = null;

function stopRing() { clearTimeout(ringTimer); ringTimer = null; state.call.ringing = false; }

function onChange() {
  if (!session) return;
  const s = session.state, others = session.others();
  const c = state.call;
  // Suena cuando alguien empieza la llamada (de nadie a alguien) y tú no estás. Si ya había llamada al abrir la
  // mesa, solo se muestra el aviso, sin sonar.
  if (s.status === "off" && s.loaded && others.length && !prevOthers && c.loadedOnce) {
    c.ringing = true;
    clearTimeout(ringTimer);
    ringTimer = setTimeout(() => { stopRing(); notify("call"); }, RING_MS);
    ringTimer.unref?.();
  }
  if (!others.length || s.status !== "off") stopRing();
  if (s.loaded) { prevOthers = others.length; c.loadedOnce = true; }
  if (s.status === "off") c.deaf = false;
  Object.assign(c, { status: s.status, audio: s.audio, video: s.video, err: s.err, peers: others });
  notify("call");
}

// Empieza a escuchar la llamada de una mesa en línea
export function watchCall(code) {
  stopCall();
  if (!state.db || !state.db.fs || !code) return;
  state.call = { ...blankCall(), code, loadedOnce: false };
  prevOthers = 0;
  session = createCallSession({ fs: state.db.fs, code, me: state.me, env: callEnv, onChange });
  session.watch();
}

// Cuelga y deja de escuchar (al salir de la mesa)
export function stopCall() {
  stopRing();
  const old = session; session = null;
  state.call = blankCall();
  if (old) return old.dispose();
  return Promise.resolve();
}

export function joinCall(video = false) { stopRing(); return session ? session.join({ video }) : Promise.resolve(false); }
export function hangupCall() { return session ? session.hangup() : Promise.resolve(); }
export function toggleMute() { if (session) session.setMuted(session.state.audio); }
export function toggleVideo() { return session ? session.setVideo(!session.state.video) : Promise.resolve(); }
export function dismissRing() { stopRing(); notify("call"); }
export function setCallOutput(mode) { state.call.output = mode === "earpiece" ? "earpiece" : "speaker"; ls.set("pata.callOut", state.call.output); notify("call"); }
export function setCallDeaf(on) { state.call.deaf = !!on; notify("call"); }
// Pasa a la siguiente vista: juego → juego con videos → videos → juego
export function nextCallView() {
  const v = CALL_VIEWS[(CALL_VIEWS.indexOf(state.call.view) + 1) % CALL_VIEWS.length];
  state.call.view = v; ls.set("pata.callView", v); notify("call");
}
export function setCallCollapsed(on) { state.call.collapsed = !!on; ls.set("pata.callMin", on ? "1" : "0"); notify("call"); }
export const callStream = (id) => (session ? session.streamOf(id) : null);
export const localStream = () => (session ? session.state.local : null);
export const isConnected = (id) => !!(session && session.connected(id));
