// Prueba de cercanía durante la llamada (ver app/near.js): toca tu melodía con tu micrófono apagado ese instante,
// escucha lo que llega de cada persona y avisa quién la oyó en vivo (está junto a ti).
//
// Cuándo: cada vez que hay alguien conectado con quien todavía no se probó (al entrar tú, o al entrar alguien
// más), después de una espera al azar (para que dos teléfonos no toquen su melodía al mismo tiempo: mientras uno
// toca, su micrófono está apagado y no podría oír la del otro). A quien no se detectó se le prueba una segunda
// vez, por si coincidieron. No se prueba con quien tiene su micrófono en silencio (no podría oírla).
import { state, reportNear, localStream, isConnected } from "../app/index.js";
import { chimeFor, detectChime, LISTEN_MS } from "../app/near.js";
import { playChime, spectra } from "./call-audio.js";

const FRAME_MS = 20;
const MAX_TRIES = 2;
const tries = new Map(); // id → veces que se probó con esa persona (en esta llamada)
let busy = false, timer = null, count = 0;

export function resetNearProbe() { tries.clear(); clearTimeout(timer); timer = null; busy = false; }

// Llamar cada vez que cambia la llamada. Programa una prueba si hay con quién.
export function maybeProbe() {
  const c = state.call;
  if (c.status !== "on") { resetNearProbe(); return; }
  if (busy || timer) return;
  const pending = candidates();
  if (!pending.length) return;
  const wait = 1200 + Math.random() * 2600 + (pending.every((p) => tries.get(p.id)) ? 5000 : 0);
  timer = setTimeout(() => { timer = null; probe(); }, wait);
}

// Con quién falta probar: conectados, con micrófono prendido, sin detectar todavía y con intentos disponibles
function candidates() {
  const near = new Set(state.call.near);
  return state.call.peers.filter((p) => p.audio !== false && isConnected(p.id) && !near.has(p.id) && (tries.get(p.id) || 0) < MAX_TRIES);
}

async function probe() {
  const targets = candidates();
  if (!targets.length || state.call.status !== "on") return;
  busy = true;
  const chime = chimeFor(`${state.me.id}:${count++}`);
  const freqs = chime.map((n) => n.f);
  const mic = localStream()?.getAudioTracks()[0] || null;
  const restoreMic = () => { if (mic) mic.enabled = state.call.audio; };
  try {
    // Tu micrófono se apaga mientras suena la melodía: así no viaja por la red y solo la oye quien esté cerca
    if (mic) mic.enabled = false;
    const t0 = playChime(chime);
    if (t0 === null) return;
    const end = chime.reduce((m, n) => Math.max(m, n.t + n.d), 0);
    setTimeout(restoreMic, end + 250);
    const frames = {}; // id → [{ t, snr }]
    await new Promise((resolve) => {
      const stopAt = performance.now() + LISTEN_MS;
      const iv = setInterval(() => {
        const now = performance.now(), sp = spectra(freqs);
        for (const [id, snr] of Object.entries(sp)) (frames[id] ||= []).push({ t: now, snr });
        if (now >= stopAt || state.call.status !== "on") { clearInterval(iv); resolve(); }
      }, FRAME_MS);
    });
    const found = [];
    for (const p of targets) {
      tries.set(p.id, (tries.get(p.id) || 0) + 1);
      const r = detectChime(frames[p.id] || [], chime, t0);
      if (r.found) found.push(p.id);
      lastResults[p.id] = { ...r, at: Date.now() };
    }
    if (found.length) reportNear(found);
  } finally {
    restoreMic();
    busy = false;
    maybeProbe(); // por si falta alguien
  }
}

// Últimos resultados por persona (para revisar en el navegador)
export const lastResults = {};
