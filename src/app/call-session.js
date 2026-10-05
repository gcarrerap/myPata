// Una llamada de voz y video en una mesa: todos conectados con todos (mesh), con WebRTC.
// Con 2 a 4 jugadores cada teléfono abre como mucho 3 conexiones, así que no hace falta un servidor de medios.
//
// Es una fábrica sin estado global para poder probarla con dos "teléfonos" en el mismo proceso: recibe Firestore,
// el código de la mesa, quién eres y el entorno (RTCPeerConnection, getUserMedia, servidores ICE). app/call.js la
// conecta con el estado de la app.
//
// Negociación sin choques: en cada pareja solo el de id menor ("quien ofrece") manda ofertas; el otro solo
// responde. Desde la primera oferta hay un canal de audio y uno de video, aunque la cámara esté apagada, así que
// prender o apagar la cámara solo cambia la pista del canal (replaceTrack) y nunca hay que renegociar.
// (Probado en Chromium: con ofertas de los dos lados, el lado que cedía a veces no mandaba sus candidatos ICE.)
import { putPeer, removePeer, watchPeers, sendSignal, watchSignals, newId, HEARTBEAT_MS } from "../services/index.js";

export const STUN = [{ urls: "stun:stun.l.google.com:19302" }];
export const VIDEO_MAX_BITRATE = 300_000; // por conexión: con 4 jugadores, cada teléfono sube su video 3 veces
export const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
export const VIDEO_CONSTRAINTS = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 15 }, facingMode: "user" };

// opts: { fs, code, me: { id, name }, env: { RTCPeerConnection, getUserMedia, iceServers }, onChange }
// onChange() se llama cada vez que cambia algo que la interfaz dibuja (quién está, streams, micrófono, cámara).
export function createCallSession({ fs, code, me, env, onChange = () => {} }) {
  const conns = new Map(); // id del otro → { pc, offerer, sid, pending, stream, videoSender }
  const s = {
    status: "off", // "off" | "joining" | "on"
    sid: null, audio: true, video: false,
    local: null, // MediaStream propio
    peers: [], // quién está en la llamada (incluyéndote), de Firestore
    loaded: false, // si ya llegó la primera lista de quién está
    err: "",
  };
  let unsubPeers = null, unsubSignals = null, beat = null, iceServers = STUN;

  const others = () => s.peers.filter((p) => p.id !== me.id);
  const myPeer = () => ({ id: me.id, name: me.name || "", sid: s.sid, audio: s.audio, video: s.video });
  const send = (c, to, msg) => sendSignal(fs, code, { ...msg, from: me.id, fromSid: s.sid, to, toSid: c.sid }).catch(() => {});

  // ---------- Quién está ----------
  function watch() {
    if (unsubPeers) return;
    unsubPeers = watchPeers(fs, code, (list) => { s.peers = list; s.loaded = true; sync(); onChange(); }, () => {});
  }
  // Abre conexión con quien acaba de entrar, la rehace si volvió a entrar (otro sid) y cierra la de quien se fue
  function sync() {
    if (s.status !== "on") return;
    const here = new Map(others().map((p) => [p.id, p]));
    for (const [id, c] of conns) if (!here.has(id) || here.get(id).sid !== c.sid) closeConn(id);
    for (const [id, p] of here) if (!conns.has(id)) {
      try { openConn(p); } catch (e) { conns.delete(id); console.warn("llamada: conexión", e); }
    }
  }

  // ---------- Conexiones ----------
  function openConn(p) {
    const RTC = env.RTCPeerConnection;
    const pc = new RTC({ iceServers });
    const c = { pc, offerer: me.id < p.id, sid: p.sid, pending: [], stream: null, videoSender: null };
    conns.set(p.id, c);
    // Solo quien ofrece negocia (al abrir la conexión y al reconectar con restartIce)
    pc.onnegotiationneeded = async () => {
      if (!c.offerer || pc.signalingState !== "stable") return;
      try {
        await pc.setLocalDescription();
        send(c, p.id, { type: "desc", desc: plain(pc.localDescription) });
      } catch (e) { console.warn("llamada: oferta", e); }
    };
    pc.onicecandidate = (e) => { if (e.candidate) send(c, p.id, { type: "ice", candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate }); };
    pc.ontrack = (e) => {
      if (!c.stream) c.stream = (e.streams && e.streams[0]) || null;
      if (!c.stream && globalThis.MediaStream) c.stream = new MediaStream();
      if (c.stream && !c.stream.getTracks().includes(e.track)) c.stream.addTrack?.(e.track);
      onChange();
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" && c.offerer) pc.restartIce?.();
      if (pc.connectionState === "connected") limitVideo(c);
      onChange();
    };
    // Tus pistas. El micrófono siempre (aunque esté en silencio). La cámara: si está prendida, su pista; si no,
    // quien ofrece crea el canal de video vacío (quien responde lo toma de la oferta, ver onSignal).
    const mic = s.local ? s.local.getAudioTracks()[0] : null, cam = camTrack();
    if (mic) pc.addTrack(mic, s.local);
    if (cam) c.videoSender = pc.addTrack(cam, s.local);
    else if (c.offerer) c.videoSender = pc.addTransceiver("video", { direction: "sendrecv", streams: s.local ? [s.local] : [] }).sender;
    return c;
  }
  const camTrack = () => (s.local && s.video ? s.local.getVideoTracks()[0] || null : null);
  // Quien responde: el canal de video que trae la oferta se vuelve de ida y vuelta, para mandar tu cámara por ahí
  async function takeVideoChannel(c) {
    if (c.videoSender) return;
    const tr = c.pc.getTransceivers().find((t) => t.receiver && t.receiver.track && t.receiver.track.kind === "video");
    if (!tr) return;
    if (tr.direction !== "sendrecv") tr.direction = "sendrecv";
    c.videoSender = tr.sender;
    const cam = camTrack();
    if (cam && tr.sender.track !== cam) await tr.sender.replaceTrack(cam).catch(() => {});
  }
  function closeConn(id) {
    const c = conns.get(id);
    if (!c) return;
    conns.delete(id);
    try { c.pc.close(); } catch {}
  }

  // Las señales se atienden una por una, en el orden en que llegan: una conexión no aguanta dos cambios a la vez
  // (por ejemplo, un candidato ICE mientras todavía se está aplicando la oferta).
  let queue = Promise.resolve();
  const enqueue = (m) => { queue = queue.then(() => onSignal(m)).catch((e) => console.warn("llamada: señal", e)); };

  async function onSignal(m) {
    if (s.status !== "on" || m.toSid !== s.sid) return; // de una entrada anterior
    let c = conns.get(m.from);
    if (c && c.sid !== m.fromSid) { closeConn(m.from); c = null; }
    if (!c) {
      const p = s.peers.find((x) => x.id === m.from && x.sid === m.fromSid) || { id: m.from, sid: m.fromSid };
      c = openConn(p);
    }
    const pc = c.pc;
    try {
      if (m.type === "desc") {
        if ((m.desc.type === "offer") === c.offerer) return; // no le toca (no debería pasar)
        await pc.setRemoteDescription(m.desc);
        for (const cand of c.pending.splice(0)) await pc.addIceCandidate(cand).catch(() => {});
        if (m.desc.type === "offer") {
          await takeVideoChannel(c);
          await pc.setLocalDescription();
          send(c, m.from, { type: "desc", desc: plain(pc.localDescription) });
        }
      } else if (m.type === "ice") {
        if (!pc.remoteDescription) c.pending.push(m.candidate);
        else await pc.addIceCandidate(m.candidate).catch(() => {});
      }
    } catch (e) { console.warn("llamada: señal", e); }
  }

  // Menos bits de video por conexión (con 4 jugadores cada teléfono lo sube 3 veces)
  function limitVideo(c) {
    const sender = c.videoSender;
    if (!sender || !sender.getParameters || !sender.setParameters) return;
    try {
      const p = sender.getParameters();
      if (!p.encodings || !p.encodings.length) return;
      p.encodings[0].maxBitrate = VIDEO_MAX_BITRATE;
      sender.setParameters(p).catch(() => {});
    } catch {}
  }

  // ---------- Entrar, salir, micrófono y cámara ----------
  async function join({ video = false } = {}) {
    if (s.status !== "off") return false;
    s.status = "joining"; s.err = ""; onChange();
    try {
      s.local = await env.getUserMedia({ audio: AUDIO_CONSTRAINTS, video: video ? VIDEO_CONSTRAINTS : false });
    } catch (e) {
      s.status = "off";
      s.err = e && e.name === "NotAllowedError" ? "No diste permiso para usar el micrófono" + (video ? " o la cámara." : ".") : "No se pudo usar el micrófono" + (video ? " o la cámara." : ".");
      onChange(); return false;
    }
    try { iceServers = (await env.iceServers?.()) || STUN; } catch { iceServers = STUN; }
    s.sid = newId(); s.audio = true; s.video = !!video;
    s.status = "on";
    unsubSignals = watchSignals(fs, code, me.id, enqueue, () => {});
    try { await putPeer(fs, code, myPeer()); }
    catch (e) { console.warn("llamada: entrar", e); await hangup(); s.err = e.code === "permission-denied" ? "Falta publicar las reglas de Firestore para las llamadas." : "No se pudo entrar a la llamada."; onChange(); return false; }
    beat = setInterval(() => putPeer(fs, code, myPeer()).catch(() => {}), HEARTBEAT_MS);
    beat.unref?.();
    watch(); sync(); onChange();
    return true;
  }

  async function hangup() {
    if (s.status === "off" && !s.local) return;
    clearInterval(beat); beat = null;
    if (unsubSignals) { unsubSignals(); unsubSignals = null; }
    for (const id of [...conns.keys()]) closeConn(id);
    for (const t of s.local ? s.local.getTracks() : []) t.stop();
    s.local = null;
    const wasIn = s.status === "on";
    s.status = "off"; s.sid = null; s.video = false;
    onChange();
    if (wasIn) await removePeer(fs, code, me.id).catch(() => {});
  }

  function setMuted(muted) {
    if (s.status !== "on") return;
    s.audio = !muted;
    for (const t of s.local.getAudioTracks()) t.enabled = s.audio;
    putPeer(fs, code, myPeer()).catch(() => {});
    onChange();
  }

  // Prender o apagar la cámara: solo cambia la pista del canal de video de cada conexión (sin renegociar)
  async function setVideo(on) {
    if (s.status !== "on" || on === s.video) return;
    if (on) {
      let track;
      try { track = (await env.getUserMedia({ video: VIDEO_CONSTRAINTS })).getVideoTracks()[0]; }
      catch { s.err = "No se pudo usar la cámara."; onChange(); return; }
      if (s.status !== "on") { track.stop(); return; }
      s.local.addTrack(track);
      s.video = true;
      for (const c of conns.values()) if (c.videoSender) { await c.videoSender.replaceTrack(track).catch(() => {}); limitVideo(c); }
    } else {
      s.video = false;
      for (const c of conns.values()) if (c.videoSender) await c.videoSender.replaceTrack(null).catch(() => {});
      for (const t of s.local.getVideoTracks()) { t.stop(); s.local.removeTrack(t); }
    }
    s.err = "";
    putPeer(fs, code, myPeer()).catch(() => {});
    onChange();
  }

  // Dejar de escuchar todo (al salir de la mesa)
  async function dispose() {
    await hangup();
    if (unsubPeers) { unsubPeers(); unsubPeers = null; }
    s.peers = [];
  }

  return {
    state: s, watch, join, hangup, setMuted, setVideo, dispose,
    others,
    // Para la interfaz: el stream de cada quien y si ya está conectado
    streamOf: (id) => conns.get(id)?.stream || null,
    connected: (id) => conns.get(id)?.pc.connectionState === "connected",
    _conns: conns,
  };
}

// RTCSessionDescription → objeto simple (Firestore no guarda clases)
const plain = (d) => (d ? { type: d.type, sdp: d.sdp } : d);
