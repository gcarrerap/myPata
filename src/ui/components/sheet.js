// Ventanas: un solo componente para las ventanas que suben desde abajo y los menús que flotan.
// Lo que está abierto vive en el estado (state.view.sheet, seatMenu, track y advice). Abrir agrega una entrada al
// historial del navegador, así el botón "atrás" del teléfono cierra la ventana en lugar de salir del juego.
import { state, actions } from "../../app/index.js";
import { esc } from "../dom.js";

// Todo lo que se abre encima de la pantalla. Abrir uno cierra los demás.
const OVERLAYS = { sheet: null, seatMenu: null, track: null, advice: null };
const has = (v) => v !== null && v !== undefined;
export const overlayOpen = () => !!state.view.sheet || has(state.view.seatMenu) || has(state.view.track) || !!state.view.advice;

// history.back() no es inmediato: mientras llega "popstate" no se vuelve a llamar (dos seguidos sacaban del juego)
let backing = false;
const inOverlayEntry = () => !!(history.state && history.state.overlay);

// Abre una ventana o menú
export function openOverlay(patch) {
  if (!backing) { if (inOverlayEntry()) history.replaceState({ overlay: true }, ""); else history.pushState({ overlay: true }, ""); }
  actions.setView({ ...OVERLAYS, ...patch });
}
// Cierra lo que esté abierto; la entrada del historial la quita syncOverlayHistory después de dibujar
export function closeOverlay() { actions.setView({ ...OVERLAYS }); }

// Después de cada dibujo: el historial sigue al estado. Si algo se abrió (también desde app/, como el consejo),
// agrega una entrada para que "atrás" lo cierre; si se cerró (✕, tocar fuera, Esc, cambió el turno, entraste a
// una mesa), quita la entrada.
export function syncOverlayHistory() {
  if (backing) return;
  const open = overlayOpen(), entry = inOverlayEntry();
  if (open && !entry) history.pushState({ overlay: true }, "");
  else if (!open && entry) { backing = true; history.back(); }
}
export function installOverlayKeys() {
  window.addEventListener("popstate", () => {
    if (backing) { backing = false; syncOverlayHistory(); return; } // fue nuestro history.back(): solo reconciliar
    if (overlayOpen()) actions.setView({ ...OVERLAYS }); // el usuario tocó "atrás": cerrar
  });
  window.addEventListener("keydown", (e) => { if (e.key === "Escape" && overlayOpen()) closeOverlay(); });
}

const X = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><line x1="6" y1="6" x2="18" y2="18"></line><line x1="18" y1="6" x2="6" y2="18"></line></svg>`;

// Dibuja una ventana que sube desde abajo dentro de `host` (normalmente #modal). Anima solo al abrirse.
export function renderSheet(host, id, title, body, { closable = true } = {}) {
  const anim = !(host.querySelector(".sheet") && host.querySelector(".sheet").dataset.sheet === id);
  const scroll = anim ? 0 : host.querySelector(".sheet").scrollTop;
  const opened = anim ? [] : [...host.querySelectorAll(".sheet details")].map((d) => d.open); // secciones abiertas
  host.innerHTML = `<div class="sheet-bg ${anim ? "anim" : ""}" id="sheetbg">
    <section class="sheet ${anim ? "anim" : ""}" tabindex="-1" data-sheet="${esc(id)}" role="dialog" aria-modal="true" aria-labelledby="sheettitle">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-head"><h3 id="sheettitle">${esc(title)}</h3>${closable ? `<button class="iconbtn" id="sheetclose" aria-label="Cerrar">${X}</button>` : ""}</div>
      ${body}
    </section></div>`;
  const sheet = host.querySelector(".sheet");
  sheet.querySelectorAll("details").forEach((d, i) => { if (opened[i] !== undefined) d.open = opened[i]; });
  sheet.scrollTop = scroll;
  if (closable) {
    host.querySelector("#sheetclose").onclick = closeOverlay;
    host.querySelector("#sheetbg").onclick = (e) => { if (e.target.id === "sheetbg") closeOverlay(); };
  }
  if (anim) (host.querySelector("#sheetclose") || sheet).focus({ preventScroll: true });
  return sheet;
}
export const closeIcon = X;
