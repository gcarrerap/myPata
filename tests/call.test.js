// Pruebas de las llamadas de voz y video: la señalización en Firestore, dos "teléfonos" que se conectan con un
// WebRTC de mentira (oferta, respuesta, candidatos, choque de ofertas), micrófono, cámara, colgar, el timbre y
// los servidores ICE.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { fakeFirestore } from "./fakes/firebase.js";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)) };
globalThis.window = globalThis;

const { newId, putPeer, watchPeers, sendSignal, watchSignals, CALLS, PEER_TTL_MS } = await import("../src/services/index.js");
const { createCallSession, STUN, VIDEO_MAX_BITRATE } = await import("../src/app/call-session.js");
const { state } = await import("../src/app/store.js");
const call = await import("../src/app/call.js");

const settle = async (n = 30) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

// ---------- WebRTC de mentira ----------
function fakeTrack(kind) { return { kind, enabled: true, stopped: false, stop() { this.stopped = true; } }; }
function fakeStream(tracks = []) {
  const ts = [...tracks];
  return {
    getTracks: () => [...ts], getAudioTracks: () => ts.filter((t) => t.kind === "audio"), getVideoTracks: () => ts.filter((t) => t.kind === "video"),
    addTrack: (t) => { if (!ts.includes(t)) ts.push(t); }, removeTrack: (t) => { const i = ts.indexOf(t); if (i >= 0) ts.splice(i, 1); },
  };
}
const registry = new Map(); // id de la conexión → conexión
let pcN = 0;
class FakePC {
  constructor(cfg) {
    this.cfg = cfg; this.id = "pc" + ++pcN; registry.set(this.id, this);
    this.signalingState = "stable"; this.connectionState = "new";
    this.localDescription = null; this.remoteDescription = null;
    this.senders = []; this.candidates = []; this.offers = 0; this.closed = false; this._nn = false;
  }
  _sender(kind, track) {
    const sender = { kind, track, params: { encodings: [{}] }, replaceTrack: async (t) => { sender.track = t; },
      getParameters: () => structuredClone(sender.params), setParameters: async (p) => { sender.params = p; } };
    this.senders.push(sender);
    return sender;
  }
  addTrack(track) {
    // Como en el navegador: se reutiliza un canal del mismo tipo que vino en una oferta y todavía no manda nada
    const free = this.senders.find((x) => x.kind === track.kind && !x.track && x.fromRemote && !x.used);
    if (free) { free.track = track; free.used = true; return free; }
    const sender = this._sender(track.kind, track); this._negotiate(); return sender;
  }
  addTransceiver(kind, init) { const sender = this._sender(kind, null); sender.direction = init.direction; this._negotiate(); return { sender }; }
  _negotiate() {
    if (this._nn) return; this._nn = true;
    queueMicrotask(() => { this._nn = false; if (this.signalingState === "stable" && !this.closed) this.onnegotiationneeded?.(); });
  }
  getTransceivers() {
    return this.senders.map((sender) => ({ sender, receiver: { track: { kind: sender.kind } },
      get direction() { return sender.direction || "recvonly"; }, set direction(d) { sender.direction = d; } }));
  }
  async setLocalDescription() {
    if (this.signalingState === "have-remote-offer") { this.localDescription = { type: "answer", sdp: this.id }; this.signalingState = "stable"; this._connect(); }
    else { this.offers++; this.localDescription = { type: "offer", sdp: this.id }; this.signalingState = "have-local-offer"; }
    queueMicrotask(() => this.onicecandidate?.({ candidate: { toJSON: () => ({ candidate: "cand-" + this.id }) } }));
  }
  async setRemoteDescription(d) {
    this.remoteDescription = d;
    this.signalingState = d.type === "offer" ? "have-remote-offer" : "stable"; // con una oferta propia pendiente, se descarta (rollback)
    if (d.type === "answer") this._connect();
    const other = registry.get(d.sdp);
    // Una oferta trae sus canales: los que aquí no hay se crean (para recibir)
    if (d.type === "offer") for (const k of other.senders.map((x) => x.kind)) {
      const mine = this.senders.filter((x) => x.kind === k), theirs = other.senders.filter((x) => x.kind === k);
      for (let i = mine.length; i < theirs.length; i++) this._sender(k, null).fromRemote = true;
    }
    for (const s of other ? other.senders : []) if (s.track) this.ontrack?.({ track: s.track, streams: [this._rs || (this._rs = fakeStream())] });
  }
  async addIceCandidate(c) { this.candidates.push(c); }
  _connect() { if (this.connectionState !== "connected") { this.connectionState = "connected"; this.onconnectionstatechange?.(); } }
  close() { this.closed = true; this.connectionState = "closed"; }
}
function env(opts = {}) {
  const asked = [];
  return {
    asked,
    RTCPeerConnection: FakePC,
    getUserMedia: async (c) => {
      asked.push(c);
      if (opts.deny) throw Object.assign(new Error("no"), { name: "NotAllowedError" });
      return fakeStream([...(c.audio ? [fakeTrack("audio")] : []), ...(c.video ? [fakeTrack("video")] : [])]);
    },
    iceServers: async () => STUN,
  };
}
function phone(fs, id, name, e = env()) {
  let changes = 0;
  const s = createCallSession({ fs, code: "ABCD", me: { id, name }, env: e, onChange: () => changes++ });
  s.watch();
  return Object.assign(s, { env: e, changes: () => changes });
}
const signalsLeft = (fs) => [...fs._docs.keys()].filter((p) => p.startsWith(`${CALLS}/ABCD/signals/`)).length;

beforeEach(() => { registry.clear(); });

// ---------- Señalización ----------

test("los ids de las señales se ordenan por hora de creación", () => {
  const a = newId(1000), b = newId(1000), c = newId(2000), d = newId(36 ** 8);
  assert.ok(a < b && b < c && c < d);
});

test("cada señal se entrega una vez, en orden, y se borra; solo llegan las tuyas", async () => {
  const fs = fakeFirestore(), got = [];
  const stop = watchSignals(fs, "M1", "yo", (m) => got.push(m.n));
  for (let n = 1; n <= 4; n++) await sendSignal(fs, "M1", { to: n === 3 ? "otro" : "yo", n });
  await settle();
  assert.deepEqual(got, [1, 2, 4]);
  const left = [...fs._docs.keys()].filter((p) => p.includes("/signals/"));
  assert.equal(left.length, 1, "la del otro sigue ahí");
  stop();
});

test("quién está en la llamada: solo quien avisó hace poco", async () => {
  const fs = fakeFirestore(); let list = [];
  const now = Date.now();
  await putPeer(fs, "M1", { id: "a", name: "Ana" }, now);
  await putPeer(fs, "M1", { id: "b", name: "Beto" }, now - PEER_TTL_MS - 1);
  watchPeers(fs, "M1", (l) => (list = l), null, () => now);
  assert.deepEqual(list.map((p) => p.id), ["a"]);
});

// ---------- Dos teléfonos ----------

test("dos teléfonos entran a la llamada y se conectan", async () => {
  const fs = fakeFirestore();
  const a = phone(fs, "a", "Ana"), b = phone(fs, "b", "Beto");
  assert.equal(await a.join(), true);
  await settle();
  assert.deepEqual(b.others().map((p) => p.name), ["Ana"], "Beto ve que Ana está en la llamada");
  assert.equal(a._conns.size, 0, "Ana todavía no tiene con quién conectarse");
  assert.equal(await b.join(), true);
  await settle();
  assert.ok(a.connected("b") && b.connected("a"));
  assert.ok(a.streamOf("b") && b.streamOf("a"), "cada quien recibe el audio del otro");
  assert.deepEqual(a.env.asked[0], { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
  assert.equal(signalsLeft(fs), 0, "las señales se borran al usarse");
  const pcA = a._conns.get("b").pc, pcB = b._conns.get("a").pc;
  assert.ok(pcA.candidates.length && pcB.candidates.length, "se intercambian candidatos ICE");
  assert.equal(pcA.signalingState, "stable"); assert.equal(pcB.signalingState, "stable");
});

test("tres teléfonos: todos con todos", async () => {
  const fs = fakeFirestore();
  const ids = ["a", "b", "c"];
  const ps = [phone(fs, "a", "Ana"), phone(fs, "b", "Beto"), phone(fs, "c", "Cata")];
  for (const p of ps) { await p.join(); await settle(); }
  ps.forEach((p, i) => {
    assert.equal(p._conns.size, 2);
    for (const id of ids) if (id !== ids[i]) assert.ok(p.connected(id), `${ids[i]} conectado con ${id}`);
  });
});

test("micrófono en silencio y cámara: los demás lo ven", async () => {
  const fs = fakeFirestore();
  const a = phone(fs, "a", "Ana"), b = phone(fs, "b", "Beto");
  await a.join(); await b.join(); await settle();
  a.setMuted(true); await settle();
  assert.equal(a.state.local.getAudioTracks()[0].enabled, false);
  assert.equal(b.others()[0].audio, false);
  await a.setVideo(true); await settle();
  assert.equal(b.others()[0].video, true);
  const sender = a._conns.get("b").videoSender, senderB = b._conns.get("a").videoSender;
  assert.ok(senderB, "quien responde también tiene canal de video");
  assert.equal(sender.track.kind, "video");
  assert.equal(sender.params.encodings[0].maxBitrate, VIDEO_MAX_BITRATE, "el video va con calidad limitada");
  assert.equal(a._conns.get("b").pc.offers, 1, "prender la cámara no renegocia");
  const cam = sender.track;
  await a.setVideo(false); await settle();
  assert.equal(sender.track, null); assert.ok(cam.stopped, "la cámara se apaga de verdad");
  assert.equal(b.others()[0].video, false);
});

test("entrar con video pide la cámara desde el principio", async () => {
  const fs = fakeFirestore();
  const a = phone(fs, "a", "Ana");
  await a.join({ video: true });
  assert.ok(a.env.asked[0].video);
  assert.equal(a.state.video, true);
});

test("colgar: se apagan micrófono y conexiones, y el otro deja de verte", async () => {
  const fs = fakeFirestore();
  const a = phone(fs, "a", "Ana"), b = phone(fs, "b", "Beto");
  await a.join(); await b.join(); await settle();
  const mic = a.state.local.getAudioTracks()[0], pc = a._conns.get("b").pc;
  await a.hangup(); await settle();
  assert.equal(a.state.status, "off");
  assert.ok(mic.stopped && pc.closed);
  assert.deepEqual(b.others(), []);
  assert.equal(b._conns.size, 0, "Beto cierra su conexión con Ana");
  // Ana vuelve a entrar: nueva conexión, sin señales viejas
  await a.join(); await settle();
  assert.ok(a.connected("b") && b.connected("a"));
});

test("sin permiso de micrófono: no entra y dice por qué", async () => {
  const fs = fakeFirestore();
  const a = phone(fs, "a", "Ana", env({ deny: true }));
  assert.equal(await a.join(), false);
  assert.equal(a.state.status, "off");
  assert.match(a.state.err, /permiso/);
  assert.equal(fs._docs.size, 0, "no aparece en la llamada");
});

// ---------- La app: aviso y timbre ----------

test("suena cuando alguien empieza la llamada y deja de sonar al contestar", async () => {
  const fs = fakeFirestore();
  call._setCallEnv(env());
  state.db = { fs }; state.me = { id: "yo", name: "Memo" };
  call.watchCall("ABCD"); await settle();
  assert.equal(state.call.ringing, false);
  const ana = createCallSession({ fs, code: "ABCD", me: { id: "ana", name: "Ana" }, env: env() });
  await ana.join(); await settle();
  assert.equal(state.call.ringing, true);
  assert.deepEqual(state.call.peers.map((p) => p.name), ["Ana"]);
  await call.joinCall(false); await settle();
  assert.equal(state.call.ringing, false);
  assert.equal(state.call.status, "on");
  await call.stopCall(); await settle();
  assert.equal(state.call.code, null);
  assert.ok(![...fs._docs.keys()].some((p) => p.endsWith("/peers/yo")), "al salir de la mesa se cuelga");
  await ana.dispose();
});

test("si la llamada ya estaba al abrir la mesa, solo avisa (no suena)", async () => {
  const fs = fakeFirestore();
  call._setCallEnv(env());
  const ana = createCallSession({ fs, code: "ABCD", me: { id: "ana", name: "Ana" }, env: env() });
  await ana.join();
  state.db = { fs }; state.me = { id: "yo", name: "Memo" };
  call.watchCall("ABCD"); await settle();
  assert.equal(state.call.peers.length, 1);
  assert.equal(state.call.ringing, false);
  await call.stopCall(); await ana.dispose();
});

test("servidores ICE: solo STUN sin TURN_URL; con TURN, sin el puerto 53", async () => {
  assert.deepEqual(await call.fetchIceServers(""), STUN);
  const old = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ iceServers: [{ urls: ["stun:stun.cloudflare.com:3478", "stun:stun.cloudflare.com:53"] },
    { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turn:turn.cloudflare.com:53?transport=udp"], username: "u", credential: "c" }] }));
  try {
    const list = await call.fetchIceServers("https://turn.example");
    assert.deepEqual(list.map((s) => s.urls), [["stun:stun.cloudflare.com:3478"], ["turn:turn.cloudflare.com:3478?transport=udp"]]);
    assert.equal(list[1].credential, "c");
    globalThis.fetch = async () => { throw new Error("sin red"); };
    assert.deepEqual(await call.fetchIceServers("https://turn.example"), STUN, "si falla, sigue con STUN");
  } finally { globalThis.fetch = old; }
});

// ---------- Sonido: altavoz o auricular ----------

test("altavoz: el audio va por Web Audio y el <audio> calla; auricular: al revés", async () => {
  const nodes = [];
  const node = (extra = {}) => { const n = { connect: (x) => x || n, disconnect() {}, ...extra }; nodes.push(n); return n; };
  globalThis.MediaStream = class { constructor(t = []) { this.t = t; } getAudioTracks() { return this.t.filter((x) => x.kind === "audio"); } getTracks() { return this.t; } };
  globalThis.AudioContext = class {
    state = "running"; destination = node();
    createDynamicsCompressor() { return node({ threshold: {}, knee: {}, ratio: {}, attack: {}, release: {} }); }
    createGain() { return node({ gain: { value: 1 } }); }
    createMediaStreamSource() { return node(); }
    createAnalyser() { return node({ getFloatTimeDomainData: (b) => b.fill(0.5) }); }
    resume() { return Promise.resolve(); }
  };
  const audio = await import("../src/ui/call-audio.js");
  const el = { muted: false, volume: 0.3, play: async () => {} };
  audio.attachPeer("ana", new MediaStream([fakeTrack("audio")]), el); // todavía sin AudioContext: suena el <audio>
  assert.equal(el.muted, false);
  const ac = audio.unlockAudio();
  assert.ok(ac);
  assert.equal(audio.attachPeer("ana", el.srcObject && new MediaStream(el.srcObject.getAudioTracks()), el), true, "se conecta a Web Audio al crear el AudioContext");
  assert.equal(el.muted, true, "en altavoz el <audio> calla y suena Web Audio");
  assert.equal(el.volume, 1);
  await audio.setOutput("earpiece");
  assert.equal(el.muted, false, "en auricular suena el <audio>");
  assert.deepEqual(audio.talking(), { ana: true });
  await audio.setOutput("speaker");
  assert.equal(el.muted, true);
  // Apagar el sonido de la llamada: callan Web Audio y el <audio>, en altavoz y en auricular
  const masterGain = () => nodes.filter((n) => n.gain).map((n) => n.gain.value);
  audio.setDeaf(true);
  assert.equal(el.muted, true); assert.ok(masterGain().includes(0));
  await audio.setOutput("earpiece");
  assert.equal(el.muted, true, "con el sonido apagado, el auricular tampoco suena");
  audio.setDeaf(false);
  assert.equal(el.muted, false);
  await audio.setOutput("speaker");
  assert.ok(masterGain().includes(audio.SPEAKER_GAIN));
  // Alguien junto a ti: no se reproduce, ni en altavoz ni en auricular
  audio.setSilenced(["ana"]);
  await audio.setOutput("earpiece");
  assert.equal(el.muted, true, "junto a ti: tampoco por el auricular");
  audio.setSilenced([]);
  assert.equal(el.muted, false);
  await audio.setOutput("speaker");
  audio.detachAll();
  delete globalThis.AudioContext; delete globalThis.MediaStream;
});

test("altavoz/auricular y controles colapsados se recuerdan en este teléfono", async () => {
  call.setCallOutput("earpiece"); call.setCallCollapsed(true);
  assert.equal(mem.get("pata.callOut"), "earpiece"); assert.equal(mem.get("pata.callMin"), "1");
  assert.deepEqual(call.callPrefs(), { output: "earpiece", collapsed: true, view: "mini" });
  state.db = { fs: fakeFirestore() };
  call.watchCall("ZZZZ");
  assert.equal(state.call.output, "earpiece"); assert.equal(state.call.collapsed, true);
  call.setCallOutput("speaker"); call.setCallCollapsed(false);
  await call.stopCall();
});

test("vistas: juego → juego con videos → videos → juego, y se recuerda; el sonido apagado no se recuerda", async () => {
  state.db = { fs: fakeFirestore() };
  mem.delete("pata.callView");
  call.watchCall("VVVV");
  assert.equal(state.call.view, "mini", "por omisión, juego con videos");
  const seen = [];
  for (let i = 0; i < 3; i++) { call.nextCallView(); seen.push(state.call.view); }
  assert.deepEqual(seen, ["videos", "game", "mini"]);
  call.nextCallView();
  assert.equal(mem.get("pata.callView"), "videos");
  call.setCallDeaf(true);
  assert.equal(state.call.deaf, true);
  await call.stopCall();
  call.watchCall("VVVV");
  assert.equal(state.call.view, "videos");
  assert.equal(state.call.deaf, false);
  await call.stopCall();
  mem.delete("pata.callView");
});

// ---------- Teléfonos juntos ----------

test("al detectar a alguien junto a ti: se publica, el otro también te silencia, hay aviso y se puede volver a oír", async () => {
  const fs = fakeFirestore();
  call._setCallEnv(env());
  state.db = { fs }; state.me = { id: "yo", name: "Memo" };
  call.watchCall("NEAR");
  const ana = createCallSession({ fs, code: "NEAR", me: { id: "ana", name: "Ana" }, env: env() }); ana.watch();
  const rod = createCallSession({ fs, code: "NEAR", me: { id: "rod", name: "Rodrigo" }, env: env() }); rod.watch();
  await ana.join(); await rod.join(); await call.joinCall(false); await settle();
  call.reportNear(["ana"]); await settle();
  assert.deepEqual(state.call.near, ["ana"]);
  assert.match(state.call.nearNote, /Ana está junto a ti/);
  assert.deepEqual(ana.state.peers.find((p) => p.id === "yo").near, ["ana"], "se publica para que Ana también te silencie");
  // Lo que ve Ana: ella no detectó nada, pero tú la detectaste a ella
  const { silencedPeers } = await import("../src/app/near.js");
  assert.deepEqual([...silencedPeers("ana", new Set(), ana.others())], ["yo"]);
  assert.deepEqual([...silencedPeers("rod", new Set(), rod.others())], [], "a Rodrigo no le cambia nada");
  // Volver a oír a Ana
  call.hearAnyway("ana"); await settle();
  assert.deepEqual(state.call.near, []);
  assert.deepEqual(ana.state.peers.find((p) => p.id === "yo").near, []);
  call.reportNear(["ana"]); await settle();
  assert.deepEqual(state.call.near, [], "si pediste oírla, una nueva detección no la vuelve a silenciar");
  // Al colgar se olvida todo
  await call.hangupCall(); await settle();
  assert.deepEqual(state.call.near, []);
  await call.stopCall(); await ana.dispose(); await rod.dispose();
});
