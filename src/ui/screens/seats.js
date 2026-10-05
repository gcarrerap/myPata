// Mesa en línea antes de repartir: los asientos alrededor del paño, vistos desde tu lugar, sin scroll.
// Tocar un asiento abre su menú: sentarte, agregar la compu (con su nivel), cambiarle el nivel, quitarla o levantarte.
// Las opciones de la mesa (borrar, salir) están en la ventana del botón "⋯".
import { LEVELS } from "../../ai/index.js";
import { actions, state } from "../../app/index.js";
import { $, esc } from "../dom.js";
import { modeLabel, seatPos, teamColor, isPartner, partnerWord } from "../labels.js";
import { teamOf } from "../../engine/index.js";
import { closeIcon, closeOverlay, openOverlay, renderSheet } from "../components/sheet.js";
const { leave } = actions;

export const BACK = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 6 9 12 15 18"></polyline></svg>`;
const MORE = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2"></circle><circle cx="12" cy="12" r="2"></circle><circle cx="19" cy="12" r="2"></circle></svg>`;

function seatLabel(st, seat, i) {
  const c = st.config;
  const team = c.teams ? `<span class="teamdot" style="background:${teamColor(teamOf(st, i))}"></span>` : "";
  const partner = isPartner(st, seat, i) ? " · tu " + partnerWord(st) : "";
  return `${team}Asiento ${i + 1}${partner}`;
}

// Qué se puede hacer con un asiento (vacío = nada)
function seatActions(st, seat, i) {
  const s = st.seats[i], seated = seat >= 0;
  if (!s) {
    const levels = [1, 2, 3].map((l) => `<button data-addbot="${i}:${l}">${LEVELS[l]}</button>`).join("");
    return `<button class="primary" data-sit="${i}">Sentarme aquí</button>
      ${seated ? `<div class="menu-group"><span class="field-label">Agregar compu</span><div class="seg lvl" role="group" aria-label="Nivel de la compu">${levels}</div></div>` : `<p class="hint">Siéntate para poder agregar a la compu.</p>`}`;
  }
  if (s.bot && seated) {
    const levels = [1, 2, 3].map((l) => `<button data-lvl="bot${i}:${l}" aria-pressed="${(s.level || 2) === l}">${LEVELS[l]}</button>`).join("");
    return `<div class="menu-group"><span class="field-label">Nivel de ${esc(s.name)}</span><div class="seg lvl" role="group" aria-label="Nivel">${levels}</div></div>
      <button class="ghost" data-unbot="${i}">Quitar a la compu</button>`;
  }
  if (s.id === state.me.id) return `<button class="ghost" data-stand="${i}">Levantarme</button>`;
  return "";
}

export function renderSeats(app, st, seat) {
  const c = st.config, full = st.seats.every(Boolean), isHost = st.host === state.me.id;
  const missing = st.seats.filter((s) => !s).length;
  const menuAt = state.view.seatMenu;
  app.className = "seats-screen";
  const tile = (i) => {
    const s = st.seats[i], pos = seatPos(st, seat, i), can = !!seatActions(st, seat, i);
    const cls = `stile pos-${pos} ${s ? "" : "free"} ${s && s.id === state.me.id ? "mine" : ""} ${menuAt === i ? "open" : ""}`;
    const inner = `<span class="lbl">${seatLabel(st, seat, i)}</span>
      <strong>${s ? esc(s.name) + (s.id === state.me.id ? " (tú)" : "") : "Libre"}</strong>
      ${s && s.bot ? `<span class="badge">compu · ${LEVELS[s.level || 2]}</span>` : ""}`;
    return can ? `<button class="${cls}" data-seatmenu="${i}" aria-haspopup="menu" aria-expanded="${menuAt === i}">${inner}</button>` : `<div class="${cls}">${inner}</div>`;
  };
  const menu = menuAt !== null && menuAt !== undefined && seatActions(st, seat, menuAt)
    ? `<div class="seat-menu" role="menu" aria-label="Asiento ${menuAt + 1}">
        <div class="seat-menu-head"><b>Asiento ${menuAt + 1}</b><button class="iconbtn" id="menuclose2" aria-label="Cerrar">${closeIcon}</button></div>
        ${seatActions(st, seat, menuAt)}</div>` : "";
  app.innerHTML = `
    <header class="seats-head">
      <button class="iconbtn sq" id="back" aria-label="Volver a mesas">${BACK}</button>
      <div class="title"><span class="code">Mesa ${esc(st.code)}</span><span class="hint">${esc(modeLabel(c))}</span></div>
      <button class="iconbtn sq" id="tablemenu" aria-label="Opciones de la mesa">${MORE}</button>
    </header>
    <div class="felt-seats ${c.n === 6 ? "six" : ""}" id="felt">
      ${st.seats.map((_, i) => tile(i)).join("")}
      <div class="felt-center">${full ? "Todos sentados" : seat >= 0 ? "Toca un asiento libre para sentarte o agregar a la compu" : "Toca un asiento libre para sentarte"}</div>
      ${menu}
    </div>
    <div class="seats-foot">
      ${!state.me.name ? `<label class="field-label" for="nm2">Tu nombre</label><input type="text" id="nm2" maxlength="16" placeholder="Ej. Rodrigo">` : ""}
      <p class="hint center">${full ? "Cualquier jugador sentado puede repartir." : `Falta${missing === 1 ? "" : "n"} ${missing} jugador${missing === 1 ? "" : "es"}.`}${st.seats.some((x) => x && x.bot) ? " A la compu la mueve el teléfono de quien está en el asiento más bajo." : ""}</p>
      <p class="err" role="alert">${esc(state.view.err)}</p>
      <button class="primary big-cta" id="start" ${full && seat >= 0 ? "" : "disabled"}>Repartir</button>
    </div>`;

  $("#back").onclick = leave;
  $("#tablemenu").onclick = () => openOverlay({ sheet: "tableMenu" });
  $("#nm2")?.addEventListener("input", (e) => actions.setName(e.target.value));
  $("#felt").onclick = (e) => { if (e.target.id === "felt" && menuAt !== null && menuAt !== undefined) closeOverlay(); };
  $("#menuclose2")?.addEventListener("click", closeOverlay);
  app.querySelectorAll("[data-seatmenu]").forEach((b) => b.onclick = () => {
    const i = +b.dataset.seatmenu;
    if (menuAt === i) closeOverlay(); else openOverlay({ seatMenu: i });
  });
  // Cada acción cierra el menú (por el historial, igual que "atrás") y luego cambia la mesa
  const act = (fn) => () => { closeOverlay(); fn(); };
  app.querySelectorAll("[data-sit]").forEach((b) => b.onclick = act(() => actions.sit(+b.dataset.sit)));
  app.querySelectorAll("[data-stand]").forEach((b) => b.onclick = act(() => actions.stand()));
  app.querySelectorAll("[data-addbot]").forEach((b) => b.onclick = act(() => { const [i, l] = b.dataset.addbot.split(":"); actions.addBot(+i, +l); }));
  app.querySelectorAll("[data-unbot]").forEach((b) => b.onclick = act(() => actions.removeBot(+b.dataset.unbot)));
  app.querySelectorAll("[data-lvl]").forEach((b) => b.onclick = act(() => { const [id, l] = b.dataset.lvl.split(":"); actions.setOnlineBotLevel(+id.replace("bot", ""), +l); }));
  $("#start").onclick = () => actions.startOnline();

  // Ventana de opciones de la mesa
  const m = $("#modal");
  if (state.view.sheet === "tableMenu") {
    renderSheet(m, "tableMenu", `Mesa ${st.code}`, `
      <p class="hint">${esc(modeLabel(c))}. Comparte el enlace de esta página: cada quien entra a la mesa ${esc(st.code)} y escoge asiento.</p>
      <button id="back2">← Salir a mesas</button>
      ${isHost ? `<button class="ghost danger" id="del">Borrar mesa</button>` : ""}`);
    $("#back2").onclick = () => { closeOverlay(); leave(); };
    $("#del")?.addEventListener("click", () => { if ($("#del").dataset.armed) { closeOverlay(); actions.deleteTable(); } else { $("#del").dataset.armed = "1"; $("#del").textContent = "Toca otra vez para borrar"; } });
  } else {
    m.innerHTML = "";
  }
}
