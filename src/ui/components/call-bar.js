// Llamada de voz y video de la mesa: un botón flotante a la derecha, debajo de la barra de arriba.
// Vive fuera de #app, como el aviso de versión nueva: la mesa se vuelve a dibujar con cada jugada y los <video> y
// <audio> no deben recrearse (se cortaría el sonido). Por eso aquí se actualizan en su lugar.
//
// Sin llamada: botón de teléfono. Si alguien más está en la llamada: "Fulano en la llamada · Entrar" (y suena si la
// acaba de empezar). En la llamada: un cuadrito por persona (su video o su inicial) y micrófono, cámara y colgar.
import { state, joinCall, hangupCall, toggleMute, toggleVideo, dismissRing, callStream, localStream, isConnected, callSupported } from "../../app/index.js";
import { esc } from "../dom.js";

const ICON = {
  phone: `<path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/>`,
  hang: `<path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1a1 1 0 0 1-.56.9 11.5 11.5 0 0 0-2.66 1.85 1 1 0 0 1-1.41-.02L.29 13.08a1 1 0 0 1 0-1.41A16.9 16.9 0 0 1 12 7c4.46 0 8.5 1.73 11.71 4.67a1 1 0 0 1 0 1.41l-2.48 2.48a1 1 0 0 1-1.41.02 11.3 11.3 0 0 0-2.67-1.85 1 1 0 0 1-.56-.9v-3.1A15 15 0 0 0 12 9z"/>`,
  mic: `<path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11z"/>`,
  micOff: `<path d="M19 11h-2a5 5 0 0 1-.7 2.53l1.46 1.46A6.9 6.9 0 0 0 19 11zm-4 .17V5a3 3 0 0 0-5.94-.6zM4.27 3 3 4.27l6 6V11a3 3 0 0 0 4.47 2.6l1.53 1.53A5 5 0 0 1 7 11H5a7 7 0 0 0 6 6.92V21h2v-3.08a6.9 6.9 0 0 0 3.5-1.4L19.73 21 21 19.73z"/>`,
  cam: `<path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11z"/>`,
  camOff: `<path d="M21 6.5l-4 4V7a1 1 0 0 0-1-1H9.82L21 17.18zM3.27 2 2 3.27 4.73 6H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12c.2 0 .39-.06.54-.16L19.73 21 21 19.73z"/>`,
};
const icon = (k) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">${ICON[k]}</svg>`;

const visible = () => state.view.screen === "table" && !state.view.practice && !!state.db && !!state.call.code && callSupported();
const names = (peers) => peers.map((p) => p.name || "Alguien").join(", ");

let root = null, key = "";
const tiles = new Map(); // id → { el, video, audio, stream }

export function renderCall() {
  if (!visible()) { if (root) { root.remove(); root = null; key = ""; tiles.clear(); } ring(false); return; }
  if (!root) {
    root = document.createElement("aside");
    root.id = "call"; root.className = "call"; root.setAttribute("aria-label", "Llamada");
    root.innerHTML = `<div class="call-tiles"></div><div class="call-ctl"></div><p class="call-err" role="alert"></p>`;
    document.body.appendChild(root);
  }
  const c = state.call;
  root.classList.toggle("on", c.status === "on");
  root.querySelector(".call-err").textContent = c.err || "";
  renderControls(c);
  renderTiles(c);
  ring(c.ringing && c.status === "off");
}

// Los botones solo se rehacen cuando cambia algo que muestran (si no, un toque a media actualización se pierde)
function renderControls(c) {
  const k = [c.status, c.audio, c.video, c.ringing, names(c.peers)].join("|");
  if (k === key) return;
  key = k;
  const ctl = root.querySelector(".call-ctl");
  if (c.status === "joining") ctl.innerHTML = `<span class="call-pill">Conectando…</span>`;
  else if (c.status === "on") ctl.innerHTML = `
      <button class="call-btn ${c.audio ? "" : "off"}" id="callmute" aria-pressed="${!c.audio}" aria-label="${c.audio ? "Silenciar micrófono" : "Activar micrófono"}">${icon(c.audio ? "mic" : "micOff")}</button>
      <button class="call-btn ${c.video ? "" : "off"}" id="callcam" aria-pressed="${c.video}" aria-label="${c.video ? "Apagar cámara" : "Prender cámara"}">${icon(c.video ? "cam" : "camOff")}</button>
      <button class="call-btn hang" id="callhang" aria-label="Colgar">${icon("hang")}</button>`;
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
  on("callstart", () => joinCall(false));
  on("calljoin", () => joinCall(false));
  on("calljoinv", () => joinCall(true));
  on("calldismiss", dismissRing);
  on("callmute", toggleMute);
  on("callcam", toggleVideo);
  on("callhang", hangupCall);
}

// Un cuadrito por persona. El audio va en su propio <audio> (así suena aunque el video esté oculto) y el video
// siempre en silencio, para no oír doble.
function renderTiles(c) {
  const box = root.querySelector(".call-tiles");
  const want = c.status === "on" ? [...c.peers.map((p) => ({ ...p, stream: callStream(p.id), self: false })),
    ...(c.video ? [{ id: "__me", name: "Tú", video: true, audio: c.audio, stream: localStream(), self: true }] : [])] : [];
  const ids = new Set(want.map((p) => p.id));
  for (const [id, t] of tiles) if (!ids.has(id)) { t.el.remove(); tiles.delete(id); }
  for (const p of want) {
    let t = tiles.get(p.id);
    if (!t) {
      const el = document.createElement("div");
      el.className = "call-tile" + (p.self ? " self" : "");
      el.innerHTML = `<video playsinline autoplay muted></video><span class="call-init"></span><span class="call-nm"></span>${p.self ? "" : `<audio autoplay></audio>`}`;
      t = { el, video: el.querySelector("video"), audio: el.querySelector("audio"), stream: null };
      tiles.set(p.id, t);
    }
    box.appendChild(t.el); // en orden
    if (t.stream !== p.stream) {
      t.stream = p.stream;
      t.video.srcObject = p.stream || null;
      if (t.audio) { t.audio.srcObject = p.stream || null; t.audio.play?.().catch(() => {}); }
      t.video.play?.().catch(() => {});
    }
    const live = p.self || isConnected(p.id);
    t.el.classList.toggle("vid", !!(p.video && p.stream));
    t.el.classList.toggle("wait", !live);
    t.el.querySelector(".call-init").textContent = (p.name || "?").trim().charAt(0).toUpperCase();
    t.el.querySelector(".call-nm").textContent = (p.name || "Alguien") + (p.audio === false ? " · 🔇" : "") + (live ? "" : " · conectando");
  }
}

// Timbre: dos tonos cada 2 s (Web Audio) y vibración. Si el navegador no deja sonar sin un toque, solo se ve el aviso.
let ac = null, ringing = null;
function ring(on) {
  if (!on) { if (ringing) { clearInterval(ringing); ringing = null; } return; }
  if (ringing) return;
  const beep = () => {
    try {
      ac = ac || new (globalThis.AudioContext || globalThis.webkitAudioContext)();
      if (ac.state === "suspended") ac.resume().catch(() => {});
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
