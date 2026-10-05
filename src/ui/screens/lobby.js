// Pantalla de inicio: una sola pantalla sin scroll. Arriba el perfil; al centro "Jugar en línea" y "Practicar", que
// abren sus ventanas con las opciones; abajo las mesas abiertas (si no caben, se desplaza solo la lista).
import { RULES, teamOf } from "../../engine/index.js";
import { BOT_NAMES, actions, isGoogle, state } from "../../app/index.js";
import { $, esc } from "../dom.js";
import { LEVEL_HELP, levelSeg, modeLabel } from "../labels.js";
import { openOverlay, renderSheet } from "../components/sheet.js";
import { rulesHelp } from "../components/rules.js";
const { createTable, googleIn, googleOut, openTable, startPractice } = actions;

const ICON_ONLINE = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"></circle><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"></path><circle cx="17.5" cy="9" r="2.5"></circle><path d="M16 14.2c2.9.3 5 2.6 5 5.8"></path></svg>`;
const ICON_PRACTICE = `<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="11" height="15" rx="2"></rect><path d="M10 4.2 17.8 3a2 2 0 0 1 2.2 1.7l1.6 11a2 2 0 0 1-1.7 2.3L18 18.3"></path></svg>`;

// Sesión: entrar o salir con Google (en la ventana de perfil)
export function authBox() {
  if (!state.dbTried) return `<p class="hint">Conectando…</p>`;
  if (!state.db) return `<p class="hint">Sin conexión con las mesas en línea: por ahora solo puedes practicar.</p>`;
  if (isGoogle()) return `<div class="row"><p class="hint" style="flex:1">Conectado con Google: <b>${esc(state.authUser.email || state.authUser.displayName || "")}</b></p><button class="ghost" id="gout">Salir</button></div>`;
  return `<button id="gin">Entrar con Google</button><p class="hint">o sigue como invitado. Con Google eres el mismo jugador en cualquier teléfono.</p>`;
}

const nameField = (id) => `<label class="field-label" for="${id}">Tu nombre en la mesa</label>
  <input type="text" id="${id}" maxlength="16" placeholder="Ej. Barbara" value="${esc(state.me.name)}" autocomplete="nickname">`;

// Opciones del modo de juego (las comparten "Jugar en línea" y "Practicar")
function modeOptions(c) {
  return `<span class="field-label">Jugadores</span>
    <div class="seg" role="group" aria-label="Jugadores">${[2, 3, 4, 6].map((n) => `<button data-n="${n}" aria-pressed="${c.n === n}">${n}</button>`).join("")}</div>
    ${c.n === 4 ? `<span class="field-label">Modalidad</span><div class="seg" role="group" aria-label="Modalidad">
      <button data-teams="1" aria-pressed="${!!c.teams}">Parejas cruzadas</button><button data-teams="0" aria-pressed="${!c.teams}">Individual</button></div>` : ""}
    ${c.n === 6 ? `<span class="field-label">Modalidad</span><div class="seg" role="group" aria-label="Modalidad">
      <button data-teams="2" aria-pressed="${c.teams === 2 || c.teams === true}">3 parejas</button><button data-teams="3" aria-pressed="${c.teams === 3}">2 equipos de 3</button></div>` : ""}
    <span class="field-label">Tiempo por turno</span>
    <div class="seg" role="group" aria-label="Tiempo por turno"><button data-timer="0" aria-pressed="${!c.timer}">Sin límite</button><button data-timer="1" aria-pressed="${!!c.timer}">${RULES.turnMs / 1000} s</button></div>
    <p class="hint">${esc(modeLabel(c))}.${c.n === 4 && c.teams ? " Los asientos 1 y 3 contra 2 y 4." : ""}${c.n === 6 ? (c.teams === 3 ? " Los asientos 1, 3 y 5 contra 2, 4 y 6." : " Cada quien con el de enfrente: 1 y 4, 2 y 5, 3 y 6.") : ""}</p>`;
}
function wireModeOptions(root) {
  root.querySelectorAll("[data-n]").forEach((b) => b.onclick = () => actions.setPlayers(+b.dataset.n));
  root.querySelectorAll("[data-timer]").forEach((b) => b.onclick = () => actions.setTimer(b.dataset.timer === "1"));
  root.querySelectorAll("[data-teams]").forEach((b) => b.onclick = () => { const v = b.dataset.teams; actions.setTeams(v === "1" ? true : v === "0" ? false : +v); });
}
const err = () => `<p class="err" role="alert">${esc(state.view.err)}</p>`;

function renderLobbySheet() {
  const m = $("#modal"), c = state.config, which = state.view.sheet;
  if (which === "online") {
    const sheet = renderSheet(m, "online", "Nueva mesa en línea", `
      ${state.me.name ? "" : nameField("nm")}
      ${modeOptions(c)}
      <p class="hint">Los asientos libres se pueden llenar con la compu.</p>
      ${err()}
      <button class="primary big-cta" id="create" ${state.db ? "" : "disabled"}>Crear mesa</button>`);
    wireModeOptions(sheet);
    $("#nm")?.addEventListener("input", (e) => actions.setName(e.target.value));
    $("#create").onclick = () => { if (needName()) return; createTable(); };
  } else if (which === "practice") {
    const sheet = renderSheet(m, "practice", "Practicar contra la compu", `
      ${modeOptions(c)}
      <span class="field-label">Nivel de la compu</span>
      <div class="cpu">${Array.from({ length: c.n - 1 }, (_, i) => `<div class="cpurow"><span class="cpuname">${BOT_NAMES[i]}${c.teams ? (teamOf({ config: c }, i + 1) === 0 ? " · tu " + (c.teams === 3 ? "equipo" : "pareja") : " · rival") : ""}</span>${levelSeg("lobby" + i, state.botLevels[i])}</div>`).join("")}</div>
      <details class="help"><summary>¿Qué hace cada nivel?</summary>
        <p class="hint"><b>Básico:</b> ${LEVEL_HELP[1]}</p><p class="hint"><b>Intermedio:</b> ${LEVEL_HELP[2]}</p><p class="hint"><b>Avanzado:</b> ${LEVEL_HELP[3]}</p></details>
      <button class="primary big-cta" id="practice">Empezar práctica</button>`);
    wireModeOptions(sheet);
    sheet.querySelectorAll("[data-lvl]").forEach((b) => b.onclick = () => { const [id, l] = b.dataset.lvl.split(":"); actions.setBotLevel(+id.replace("lobby", ""), +l); });
    $("#practice").onclick = startPractice;
  } else if (which === "profile") {
    renderSheet(m, "profile", "Tu perfil", `${nameField("nm")}${authBox()}${err()}`);
    $("#nm").addEventListener("input", (e) => actions.setName(e.target.value));
    $("#gin")?.addEventListener("click", googleIn);
    $("#gout")?.addEventListener("click", googleOut);
  } else if (which === "rules") {
    renderSheet(m, "rules", "Cómo se juega", rulesHelp());
  } else {
    m.innerHTML = "";
  }
}

export function renderLobby(app) {
  app.className = "lobby";
  const online = !state.dbTried ? "Conectando…" : state.db ? "Crea una mesa o únete a una" : "Sin conexión: por ahora solo práctica";
  const initial = (state.me.name || "?").trim().charAt(0).toUpperCase();
  app.innerHTML = `
    <header class="lobby-head">
      <div><h1>La Pata</h1><small>de la Familia · ${RULES.rounds} rondas · <button class="linkbtn" id="rules">cómo se juega</button></small></div>
      <button class="avatar" id="profile" aria-label="Tu perfil${state.me.name ? ": " + esc(state.me.name) : ""}${isGoogle() ? ", conectado con Google" : ""}">${esc(initial)}${isGoogle() ? `<span class="dot" aria-hidden="true"></span>` : ""}</button>
    </header>
    <div class="big-actions">
      <button class="big primary" id="play-online" ${state.db ? "" : "disabled"}>${ICON_ONLINE}<span><b>Jugar en línea</b><span>${online}</span></span></button>
      <button class="big" id="play-practice">${ICON_PRACTICE}<span><b>Practicar</b><span class="muted">Contra la compu · ${BOT_NAMES.join(", ")}</span></span></button>
    </div>
    <section class="tables-box" aria-labelledby="tables-title">
      <h2 id="tables-title">Mesas abiertas <span class="count" id="tcount"></span></h2>
      <div class="tables" id="tables"></div>
    </section>
    ${state.view.sheet ? "" : err()}`;
  $("#profile").onclick = () => openOverlay({ sheet: "profile" });
  $("#rules").onclick = () => openOverlay({ sheet: "rules" });
  $("#play-online").onclick = () => openOverlay({ sheet: "online" });
  $("#play-practice").onclick = () => openOverlay({ sheet: "practice" });
  renderTables();
  renderLobbySheet();
}

export function renderTables() {
  const box = $("#tables"); if (!box) return;
  const count = $("#tcount");
  if (count) count.textContent = state.db && state.listCache.length ? String(state.listCache.length) : "";
  if (!state.db) { box.innerHTML = `<p class="hint">${state.dbTried ? "No se pudo conectar con las mesas en línea. Recarga la página." : "Buscando mesas…"}</p>`; return; }
  if (!state.listCache.length) { box.innerHTML = `<p class="hint">Todavía no hay mesas. Toca "Jugar en línea" para crear una y comparte el enlace de esta página con tu familia.</p>`; return; }
  box.innerHTML = state.listCache.map((t) => {
    const filled = t.seats.filter(Boolean).length, mine = t.seats.some((s) => s && s.id === state.me.id);
    const st = t.status === "lobby" ? `${filled}/${t.config.n} sentados` : t.status === "gameover" ? "Partida terminada" : `Ronda ${t.roundNo} de ${RULES.rounds}`;
    const who = t.seats.filter(Boolean).map((s) => esc(s.name) + (s.bot ? " (compu)" : "")).join(", ") || "Sin jugadores";
    return `<div class="trow"><span class="code">${esc(t.code)}</span>
      <span class="meta">${esc(modeLabel(t.config))} · ${st}<br>${who}</span>
      <button data-open="${esc(t.code)}" class="${mine ? "primary" : "ghost"}">${mine ? "Volver" : "Entrar"}</button></div>`;
  }).join("");
  box.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => openTable(b.dataset.open));
}

export function needName() {
  if (!state.me.name) { actions.setError("Escribe tu nombre primero."); $("#nm")?.focus(); return true; }
  return false;
}
