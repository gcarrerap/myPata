// Llamada de voz y video de la mesa: un botón flotante a la derecha, debajo de la barra de arriba.
// Vive fuera de #app, como el aviso de versión nueva: la mesa se vuelve a dibujar con cada jugada y los <video> y
// <audio> no deben recrearse (se cortaría el sonido). Por eso aquí se actualizan en su lugar.
//
// Sin llamada: botón de teléfono. Si alguien más está en la llamada: "Fulano en la llamada · Entrar" (y suena si la
// acaba de empezar). En la llamada: un cuadrito por persona (su video o su inicial, con borde verde cuando habla) y
// micrófono, cámara, altavoz/auricular, colgar y colapsar. Colapsada queda una sola píldora para no tapar el juego.
// El sonido (altavoz o auricular, quién habla) está en ../call-audio.js.
import { state, joinCall, hangupCall, toggleMute, toggleVideo, dismissRing, setCallOutput, setCallCollapsed, callStream, localStream, isConnected,
  callSupported } from "../../app/index.js";
import { unlockAudio, keepAudioAlive, attachPeer, detachPeer, attachLocal, detachAll, setOutput, getOutput, talking, audioContext } from "../call-audio.js";
import { esc } from "../dom.js";

const ICON = {
  phone: `<path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/>`,
  hang: `<path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1a1 1 0 0 1-.56.9 11.5 11.5 0 0 0-2.66 1.85 1 1 0 0 1-1.41-.02L.29 13.08a1 1 0 0 1 0-1.41A16.9 16.9 0 0 1 12 7c4.46 0 8.5 1.73 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.02 11.3 11.3 0 0 0-2.67-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9z"/>`,
  mic: `<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/>`,
  micOff: `<path d="M19 11h-2a5 5 0 0 1-.7 2.53l1.46 1.46A6.9 6.9 0 0 0 19 11zm-4 .17V5a3 3 0 0 0-5.94-.6zM4.27 3 3 4.27l6 6V11a3 3 0 0 0 4.47 2.6l1.53 1.53A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.92V21h2v-3.08a6.9 6.9 0 0 0 3.5-1.4L19.73 21 21 19.73z"/>`,
  cam: `<path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/>`,
  camOff: `<path d="M21 6.5l-4 4V7a1 1 0 0 0-1-1H9.82L21 17.18zM3.27 2 2 3.27 4.73 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.2 0 .39-.06.54-.16L19.73 21 21 19.73z"/>`,
  speaker: `<path d="M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.47 4.47 0 0 0 16.5 12zM14 3.23v2.06a7 7 0 0 1 0 13.42v2.06A9 9 0 0 0 14 3.23z"/>`,
  ear: `<path d="M17 20c-.29 0-.56-.06-.76-.15-.71-.37-1.21-.88-1.71-2.38-.51-1.56-1.47-2.29-2.39-3-.79-.61-1.61-1.24-2.32-2.53C9.29 10.98 9 9.93 9 9c0-2.8 2.2-5 5-5s5 2.2 5 5h2c0-3.93-3.07-7-7-7S7 5.07 7 9c0 1.26.38 2.65 1.07 3.9.91 1.65 1.98 2.48 2.85 3.15.81.62 1.39 1.07 1.71 2.05.6 1.82 1.37 2.84 2.73 3.55A4 4 0 0 0 21 18h-2a2 2 0 0 1-2 2zM14 6.5a2.5 2.5 0 0 0-2.5 2.5c0 1.38 1.12 2.5 2.5 2.5s2.5-1.12 2.5-2.5S15.38 6.5 14 6.5z"/>`,
  min: `<path d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>`,
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">${ICON[k]}</svg>`;

const visible = () => state.view.screen === "table" && !state.view.practice && !!state.db && !!state.call.code && callSupported();
const names = (peers) => peers.map((p) => p.name || "Alguien").join(", ");
// Altavoz/auricular solo en teléfonos (en una computadora no hay auricular)
const isPhone = () => !!globalThis.matchMedia?.("(pointer:coarse)").matches;

let root = null, key = "", meter = null;
const tiles = new Map(); // id → { el, video, audio, stream }

export function renderCall() {
  if (!visible()) {
    if (root) { root.remove(); root = null; key = ""; tiles.clear(); }
    stopAudio(); ring(false); return;
  }
  if (!root) {
    root = document.createElement("aside");
    root.id = "call"; root.className = "call"; root.setAttribute("aria-label", "Llamada");
    root.innerHTML = `<div class="call-tiles"></div><div class="call-ctl"></div><p class="call-err" role="alert"></p>`;
    document.body.appendChild(root);
  }
  const c = state.call, on = c.status === "on";
  root.classList.toggle("on", on);
  root.classList.toggle("min", on && c.collapsed);
  root.querySelector(".call-err").textContent = c.err || "";
  if (on && getOutput() !== c.output) setOutput(c.output);
  renderControls(c);
  renderTiles(c);
  if (on) startAudio(); else stopAudio();
  ring(c.ringing && c.status === "off");
}

// Entrar a la llamada: el sonido se desbloquea aquí, dentro del toque
const join = (video) => { unlockAudio(); joinCall(video); };

// Los botones solo se rehacen cuando cambia algo que muestran (si no, un toque a media actualización se pierde)
function renderControls(c) {
  const k = [c.status, c.audio, c.video, c.ringing, c.output, c.collapsed, names(c.peers)].join("|");
  if (k === key) return;
  key = k;
  const ctl = root.querySelector(".call-ctl");
  const n = c.peers.length + 1;
  if (c.status === "joining") ctl.innerHTML = `<span class="call-pill">Conectando…</span>`;
  else if (c.status === "on" && c.collapsed) ctl.innerHTML = `
      <button class="call-mini" id="callexpand" aria-label="Llamada con ${n} personas${c.audio ? "" : ", micrófono en silencio"}. Mostrar controles">
        ${icon("phone")}<b>${n}</b>${c.audio ? "" : `<span class="call-mini-off">${icon("micOff")}</span>`}</button>`;
  else if (c.status === "on") ctl.innerHTML = `
      <button class="call-btn ${c.audio ? "" : "off"}" id="callmute" aria-pressed="${!c.audio}" aria-label="${c.audio ? "Silenciar micrófono" : "Activar micrófono"}">${icon(c.audio ? "mic" : "micOff")}</button>
      <button class="call-btn ${c.video ? "" : "off"}" id="callcam" aria-pressed="${c.video}" aria-label="${c.video ? "Apagar cámara" : "Prender cámara"}">${icon(c.video ? "cam" : "camOff")}</button>
      ${isPhone() ? `<button class="call-btn" id="callout" aria-label="${c.output === "speaker" ? "Sonido por el altavoz. Cambiar al auricular" : "Sonido por el auricular. Cambiar al altavoz"}">${icon(c.output === "speaker" ? "speaker" : "ear")}</button>` : ""}
      <button class="call-btn hang" id="callhang" aria-label="Colgar">${icon("hang")}</button>
      <button class="call-btn ghost" id="callcollapse" aria-label="Ocultar controles de la llamada">${icon("min")}</button>`;
  else if (c.peers.length) ctl.innerHTML = `
      <div class="call-pill ${c.ringing ? "ringing" : ""}" role="status">
        <span class="call-who">${icon("phone")}<span>${esc(names(c.peers))}</span> <small>${c.ringing ? "te llama" : "en la llamada"}</small></span>
        <span class="call-acts">
          <button class="call-btn ok" id="calljoin" aria-label="Entrar a la llamada con voz">${icon("phone")}</button>
          <button class="call-btn" id="calljoinv" aria-label="Entrar a la llamada con video">${icon("cam")}</button>
          ${c.ringing ? `<button class="call-btn hang" id="calldismiss" aria-label="No contestar">${icon("hang")}</button>` : ""}
        </span>
      </div>`;
  else ctl.innerHTML = `<button class="call-btn solo" id="callstart" aria-label="Empezar una llamada de voz con la mesa">${icon("phone")}</button>`;
  const on = (id, fn) => { const b = ctl.querySelector("#" + id); if (b) b.onclick = fn; };
  on("callstart", () => join(false));
  on("calljoin", () => join(false));
  on("calljoinv", () => join(true));
  on("calldismiss", dismissRing);
  on("callmute", toggleMute);
  on("callcam", toggleVideo);
  on("callout", () => { unlockAudio(); setCallOutput(c.output === "speaker" ? "earpiece" : "speaker"); });
  on("callhang", hangupCall);
  on("callcollapse", () => setCallCollapsed(true));
  on("callexpand", () => { unlockAudio(); setCallCollapsed(false); });
}

// Un cuadrito por persona. El audio va en su propio <audio> (lo maneja call-audio.js) y el video siempre en
// silencio. Colapsada, los cuadritos se ocultan pero siguen sonando.
function renderTiles(c) {
  const box = root.querySelector(".call-tiles");
  const want = c.status === "on" ? [...c.peers.map((p) => ({ ...p, stream: callStream(p.id), self: false })),
    ...(c.video ? [{ id: "__me", name: "Tú", video: true, audio: c.audio, stream: localStream(), self: true }] : [])] : [];
  const ids = new Set(want.map((p) => p.id));
  for (const [id, t] of tiles) if (!ids.has(id)) { t.el.remove(); tiles.delete(id); detachPeer(id); }
  for (const p of want) {
    let t = tiles.get(p.id);
    if (!t) {
      const el = document.createElement("div");
      el.className = "call-tile" + (p.self ? " self" : "");
      el.dataset.id = p.id;
      el.innerHTML = `<video playsinline autoplay muted></video><span class="call-init"></span><span class="call-nm"></span>${p.self ? "" : `<audio autoplay playsinline></audio>`}`;
      t = { el, video: el.querySelector("video"), audio: el.querySelector("audio"), stream: null };
      tiles.set(p.id, t);
    }
    box.appendChild(t.el); // en orden
    if (t.stream !== p.stream) {
      t.stream = p.stream;
      t.video.srcObject = p.stream || null;
      t.video.play?.().catch(() => {});
    }
    // El audio se vuelve a conectar si llegó (o cambió) su pista, aunque el stream sea el mismo objeto
    if (!p.self) attachPeer(p.id, p.stream, t.audio);
    const live = p.self || isConnected(p.id);
    t.el.classList.toggle("vid", !!(p.video && p.stream));
    t.el.classList.toggle("wait", !live);
    t.el.querySelector(".call-init").textContent = (p.name || "?").trim().charAt(0).toUpperCase();
    t.el.querySelector(".call-nm").textContent = (p.name || "Alguien") + (p.audio === false ? " · 🔇" : "") + (live ? "" : " · conectando");
  }
  if (c.status === "on") attachLocal(localStream());
}

// Mientras dure la llamada: mantener vivo el sonido y marcar quién habla (borde verde; en tu micrófono, un aro)
function startAudio() {
  unlockAudio(); keepAudioAlive(true);
  if (meter) return;
  meter = setInterval(() => {
    if (!root) return;
    const lv = talking();
    let any = false;
    for (const [id, t] of tiles) { const on = !!lv[id]; t.el.classList.toggle("talking", on); any = any || on; }
    root.querySelector("#callmute")?.classList.toggle("talking", !!lv.__me && state.call.audio);
    root.querySelector("#callexpand")?.classList.toggle("talking", any);
  }, 150);
}
function stopAudio() {
  if (!meter && !tiles.size) return;
  clearInterval(meter); meter = null;
  keepAudioAlive(false); detachAll();
}

// Timbre: dos tonos cada 2 s (Web Audio) y vibración. Si el navegador no deja sonar sin un toque, solo se ve el aviso.
let ringing = null;
function ring(on) {
  if (!on) { if (ringing) { clearInterval(ringing); ringing = null; } return; }
  if (ringing) return;
  const beep = () => {
    try {
      const ac = unlockAudio();
      if (!ac) return;
      const t0 = ac.currentTime;
      for (const [f, dt] of [[880, 0], [660, 0.22]]) {
        const o = ac.createOscillator(), g = ac.createGain();
        o.frequency.value = f; o.type = "sine";
        g.gain.setValueAtTime(0.0001, t0 + dt);
        g.gain.exponentialRampToValueAtTime(0.15, t0 + dt + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.2);
        o.connect(g).connect(ac.destination); o.start(t0 + dt); o.stop(t0 + dt + 0.22);
      }
    } catch {}
    try { navigator.vibrate?.([250, 150, 250]); } catch {}
  };
  beep();
  ringing = setInterval(beep, 2000);
}

// Al cerrar o recargar la pestaña: salir de la llamada para que los demás no esperen
export function installCallUnload() {
  addEventListener("pagehide", () => { hangupCall(); });
}

// Solo para revisar en el navegador
export const _audio = { audioContext, talking };
