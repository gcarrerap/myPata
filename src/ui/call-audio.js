// Sonido de la llamada: por dónde sale (altavoz o auricular), qué tan fuerte, y quién está hablando.
//
// El problema que resuelve (WebKit bug 218012): en iPhone, mientras una página usa el micrófono, Safari manda el
// audio de los <audio> al auricular (la bocina de la oreja) y se oye muy bajito. Lo que sale por Web Audio
// (AudioContext) sí va al altavoz. Por eso:
//   - Altavoz (por omisión): el audio de cada quien pasa por Web Audio, con un poco de ganancia y un compresor
//     para que no sature. El <audio> de cada quien sigue reproduciendo, pero en silencio (Chrome solo deja pasar
//     audio de WebRTC a Web Audio si el stream está conectado a un elemento que reproduce).
//   - Auricular: se oye por el <audio> (en iPhone sale por el auricular), y Web Audio se calla.
// En los teléfonos que dejan escoger la salida (setSinkId), también se intenta escoger el dispositivo.
// En Android (probado en Galaxy S25/S26 con Chrome y DuckDuckGo) el navegador decide la salida y siempre usa el
// altavoz: escoger auricular no cambia nada, así que ese botón solo se muestra en iPhone.
// Además se puede apagar el sonido de la llamada (setDeaf): los demás dejan de oírse aquí.
//
// El AudioContext se crea o reanuda en el toque de "llamar" o "contestar" (los navegadores no dejan sonar sin un
// toque) y en cualquier toque mientras dure la llamada (iPhone lo interrumpe al prender el micrófono).
// Los niveles (quién habla) salen de un AnalyserNode por persona, y del tuyo para saber si tu micrófono manda algo.
// Para detectar teléfonos que están juntos (app/near.js): cada persona tiene además un analizador de frecuencias, y
// playChime() toca tu melodía. A quien esté junto a ti no se le reproduce (setSilenced).
import { toneSnr } from "../app/near.js";

export const SPEAKER_GAIN = 1.8; // ganancia en altavoz (el compresor evita que sature)
const TALK_LEVEL = 0.02; // RMS a partir del cual se considera que alguien está hablando

let ac = null, master = null, comp = null;
let output = "speaker";
let deaf = false; // sonido de la llamada apagado (los demás no se oyen en este teléfono)
let silenced = new Set(); // los que están junto a ti: no se reproducen aquí (ya se oyen en persona)
const peers = new Map(); // id → { track, src, gain, an, el }
let mine = null; // { track, src, an }

export function audioContext() { return ac; }

// Crear o reanudar el AudioContext. Llamarla dentro de un toque.
export function unlockAudio() {
  try {
    if (!ac) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.25;
      master = ac.createGain();
      master.connect(comp).connect(ac.destination);
      applyOutput();
    }
    if (ac.state !== "running") ac.resume().catch(() => {});
  } catch { ac = null; }
  return ac;
}

// Mientras dure la llamada, cualquier toque reanuda el sonido si el teléfono lo pausó
let tapHook = null;
export function keepAudioAlive(on) {
  if (on && !tapHook) { tapHook = () => { if (ac && ac.state !== "running") ac.resume().catch(() => {}); }; addEventListener("pointerdown", tapHook, true); }
  if (!on && tapHook) { removeEventListener("pointerdown", tapHook, true); tapHook = null; }
}

// En iPhone siempre se puede escoger (Web Audio vs. <audio>). En otros, solo si el navegador deja escoger salida.
export function isIOS() {
  const n = globalThis.navigator || {};
  return /iPhone|iPad|iPod/.test(n.userAgent || "") || (n.platform === "MacIntel" && n.maxTouchPoints > 1);
}

// Conecta (o actualiza) el audio de una persona. el: su <audio>. Devuelve true si cambió algo.
export function attachPeer(id, stream, el) {
  const track = stream ? stream.getAudioTracks()[0] || null : null;
  let p = peers.get(id);
  // Sin cambios, salvo que falte conectarlo a Web Audio porque el AudioContext se creó después
  if (p && p.track === track && p.el === el && (p.src || !ac || !track)) return false;
  if (p) detachPeer(id);
  p = { track, el, src: null, gain: null, an: null, fan: null };
  peers.set(id, p);
  if (el) {
    // Un stream solo con el audio: si el video llega o cambia, el <audio> no se entera de pistas nuevas en todos
    // los navegadores (Safari), así que se le da uno propio
    el.srcObject = track ? new MediaStream([track]) : null;
    el.play?.().catch(() => {});
  }
  if (track && ac) {
    try {
      p.src = ac.createMediaStreamSource(new MediaStream([track]));
      p.an = ac.createAnalyser(); p.an.fftSize = 512;
      p.gain = ac.createGain();
      p.fan = ac.createAnalyser(); p.fan.fftSize = 2048; p.fan.smoothingTimeConstant = 0;
      p.src.connect(p.an); p.src.connect(p.fan); p.src.connect(p.gain); p.gain.connect(master);
    } catch { p.src = p.gain = p.an = p.fan = null; }
  }
  applyOutput();
  return true;
}
export function detachPeer(id) {
  const p = peers.get(id);
  if (!p) return;
  peers.delete(id);
  try { p.src?.disconnect(); p.gain?.disconnect(); } catch {}
}

export function attachLocal(stream) {
  const track = stream ? stream.getAudioTracks()[0] || null : null;
  if (mine && mine.track === track) return;
  try { mine?.src?.disconnect(); } catch {}
  mine = null;
  if (!track || !ac) return;
  try {
    const src = ac.createMediaStreamSource(new MediaStream([track]));
    const an = ac.createAnalyser(); an.fftSize = 512;
    src.connect(an); // solo para medir, no se oye
    mine = { track, src, an };
  } catch { mine = null; }
}

export function detachAll() {
  for (const id of [...peers.keys()]) detachPeer(id);
  try { mine?.src?.disconnect(); } catch {}
  mine = null;
}

// "speaker" | "earpiece"
export async function setOutput(mode) {
  output = mode === "earpiece" ? "earpiece" : "speaker";
  applyOutput();
  await pickSink();
}
export const getOutput = () => output;

// Apagar o prender el sonido de la llamada (tu micrófono no cambia)
export function setDeaf(on) { deaf = !!on; applyOutput(); }
export const isDeaf = () => deaf;

// Los que están junto a ti (Set de ids): no se reproducen, ni en altavoz ni en auricular
export function setSilenced(ids) { silenced = new Set(ids); applyOutput(); }
export const silencedIds = () => new Set(silenced);

function applyOutput() {
  const viaWebAudio = output === "speaker" && ac && ac.state !== "closed";
  if (master) master.gain.value = viaWebAudio && !deaf ? SPEAKER_GAIN : 0;
  for (const [id, p] of peers) {
    const quiet = silenced.has(id);
    if (p.gain) p.gain.gain.value = quiet ? 0 : 1;
    if (!p.el) continue;
    // Si Web Audio no está disponible, el <audio> suena aunque sea "altavoz"
    const webAudioPlays = viaWebAudio && p.src;
    p.el.muted = !!webAudioPlays || deaf || quiet;
    p.el.volume = 1;
  }
}

// Donde el navegador deja escoger la salida (Chrome en algunos Android y computadoras), se busca un dispositivo
// cuyo nombre coincida con el modo. Si no hay o no deja, no pasa nada.
async function pickSink() {
  try {
    const md = globalThis.navigator?.mediaDevices;
    if (!md?.enumerateDevices) return;
    const outs = (await md.enumerateDevices()).filter((d) => d.kind === "audiooutput");
    const re = output === "earpiece" ? /earpiece|receiver|auricular|phone/i : /speaker|altavoz|bocina/i;
    const dev = outs.find((d) => re.test(d.label));
    if (!dev) return;
    for (const p of peers.values()) if (p.el?.setSinkId) await p.el.setSinkId(dev.deviceId).catch(() => {});
    if (ac?.setSinkId && output === "speaker") await ac.setSinkId(dev.deviceId).catch(() => {});
  } catch {}
}

// Niveles: id → true si está hablando. "__me" es tu micrófono.
const buf = new Float32Array(512);
function rms(an) {
  an.getFloatTimeDomainData(buf);
  let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
  return Math.sqrt(s / buf.length);
}
export function talking() {
  const out = {};
  for (const [id, p] of peers) if (p.an) out[id] = rms(p.an) > TALK_LEVEL;
  if (mine) out.__me = rms(mine.an) > TALK_LEVEL;
  return out;
}

// ---------- Detección de teléfonos juntos ----------

// Qué tanto sobresale cada frecuencia en lo que llega de cada persona: { [id]: { [f]: dB } }
let spec = null;
export function spectra(freqs) {
  const out = {};
  if (!ac) return out;
  const binHz = ac.sampleRate / 2048;
  for (const [id, p] of peers) {
    if (!p.fan) continue;
    if (!spec || spec.length !== p.fan.frequencyBinCount) spec = new Float32Array(p.fan.frequencyBinCount);
    p.fan.getFloatFrequencyData(spec);
    out[id] = Object.fromEntries(freqs.map((f) => [f, toneSnr(spec, binHz, f)]));
  }
  return out;
}

// Destinos extra para la melodía: solo para las pruebas en el navegador (simulan que otro teléfono la oye)
export const _chimeTaps = new Set();

// Toca la melodía (notas de app/near.js chimeFor). Sale directo al altavoz (aunque el sonido de la llamada esté
// apagado). Devuelve cuándo empieza, en el reloj de performance.now(), o null si no hay sonido.
export function playChime(chime, volume = 0.22) {
  if (!ac || ac.state !== "running") return null;
  const lead = 0.06, start = ac.currentTime + lead;
  const out = ac.createGain(); out.gain.value = volume;
  out.connect(ac.destination);
  for (const tap of _chimeTaps) out.connect(tap);
  for (const n of chime) {
    const o = ac.createOscillator(), g = ac.createGain();
    const a = start + n.t / 1000, b = a + n.d / 1000;
    o.type = "sine"; o.frequency.value = n.f;
    g.gain.setValueAtTime(0.0001, a);
    g.gain.exponentialRampToValueAtTime(1, a + 0.012);
    g.gain.setValueAtTime(1, b - 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, b);
    o.connect(g).connect(out); o.start(a); o.stop(b + 0.01);
  }
  const end = chime.reduce((m, n) => Math.max(m, n.t + n.d), 0);
  setTimeout(() => { try { out.disconnect(); } catch {} }, end + lead * 1000 + 200);
  return performance.now() + lead * 1000 + (ac.outputLatency || ac.baseLatency || 0) * 1000;
}
