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
//
// El AudioContext se crea o reanuda en el toque de "llamar" o "contestar" (los navegadores no dejan sonar sin un
// toque) y en cualquier toque mientras dure la llamada (iPhone lo interrumpe al prender el micrófono).
// Los niveles (quién habla) salen de un AnalyserNode por persona, y del tuyo para saber si tu micrófono manda algo.

export const SPEAKER_GAIN = 1.8; // ganancia en altavoz (el compresor evita que sature)
const TALK_LEVEL = 0.02; // RMS a partir del cual se considera que alguien está hablando

let ac = null, master = null, comp = null;
let output = "speaker";
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
  p = { track, el, src: null, gain: null, an: null };
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
      p.src.connect(p.an); p.src.connect(p.gain); p.gain.connect(master);
    } catch { p.src = p.gain = p.an = null; }
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

function applyOutput() {
  const viaWebAudio = output === "speaker" && ac && ac.state !== "closed";
  if (master) master.gain.value = viaWebAudio ? SPEAKER_GAIN : 0;
  for (const p of peers.values()) {
    if (!p.el) continue;
    // Si Web Audio no está disponible, el <audio> suena aunque sea "altavoz"
    const webAudioPlays = viaWebAudio && p.src;
    p.el.muted = !!webAudioPlays;
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
