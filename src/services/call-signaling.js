// Señalización de las llamadas de voz y video (WebRTC) en Firestore. Es lo único de la llamada que toca Firestore.
//
// Cada mesa tiene su llamada en "pata_llamadas/{código}", aparte de la mesa: así las señales nunca chocan con las
// transacciones de las jugadas. Dentro hay dos subcolecciones:
//   peers/{id}     quién está en la llamada: { id, name, sid, audio, video, seen }
//   signals/{id}   mensajes de un teléfono a otro: { from, fromSid, to, toSid, type: "desc" | "ice", desc | candidate, t }
// sid identifica cada vez que alguien entra a la llamada, para descartar señales viejas de una entrada anterior.
// Quien recibe una señal la borra. Los audios y videos nunca pasan por Firestore: van directo entre teléfonos.

export const CALLS = "pata_llamadas";
export const HEARTBEAT_MS = 15 * 1000; // cada cuánto avisa cada teléfono que sigue en la llamada
export const PEER_TTL_MS = 45 * 1000; // sin aviso en este tiempo, se considera que ya no está

const base = (code) => `${CALLS}/${code}`;

// Ids que Firestore ordena por hora de creación (sus documentos se entregan ordenados por id): la oferta llega
// antes que sus candidatos ICE.
let counter = 0;
export function newId(now = Date.now()) {
  counter = (counter + 1) % 1296;
  return now.toString(36).padStart(9, "0") + counter.toString(36).padStart(2, "0") + Math.random().toString(36).slice(2, 7);
}

// Entrar o avisar que sigues en la llamada
export function putPeer(fs, code, peer, now = Date.now()) {
  return fs.doc(`${base(code)}/peers/${peer.id}`).set({ ...peer, seen: now });
}
export function removePeer(fs, code, id) {
  return fs.doc(`${base(code)}/peers/${id}`).delete();
}
// Quién está en la llamada (solo quienes avisaron hace poco). onPeers recibe la lista; devuelve cómo dejar de escuchar.
export function watchPeers(fs, code, onPeers, onError, now = () => Date.now()) {
  return fs.collection(`${base(code)}/peers`).onSnapshot((snap) => {
    const t = now();
    onPeers(snap.docs.map((d) => d.data()).filter((p) => p && t - (p.seen || 0) < PEER_TTL_MS));
  }, onError);
}

export function sendSignal(fs, code, msg) {
  return fs.doc(`${base(code)}/signals/${newId()}`).set({ ...msg, t: Date.now() });
}
// Las señales para `to`. Cada una se entrega una sola vez, en orden, y se borra. Devuelve cómo dejar de escuchar.
export function watchSignals(fs, code, to, onSignal, onError) {
  const done = new Set();
  return fs.collection(`${base(code)}/signals`).where("to", "==", to).onSnapshot((snap) => {
    for (const d of snap.docs) {
      if (done.has(d.id)) continue;
      done.add(d.id);
      const m = d.data();
      Promise.resolve().then(() => d.ref.delete()).catch(() => {});
      if (m) onSignal(m);
    }
  }, onError);
}
