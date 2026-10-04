// Aviso "Hay una versión nueva · Actualizar". Vive fuera de #app para verse en cualquier pantalla.
import { state, applyUpdate } from "../../app/index.js";

export function renderUpdateBar() {
  let bar = document.getElementById("update");
  if (!state.updateAvailable) { if (bar) bar.remove(); return; }
  if (bar) return;
  bar = document.createElement("div");
  bar.id = "update"; bar.className = "update-bar"; bar.setAttribute("role", "status");
  bar.innerHTML = `<span>Hay una versión nueva del juego</span><button class="primary" id="updatenow">Actualizar</button>`;
  document.body.appendChild(bar);
  bar.querySelector("#updatenow").onclick = applyUpdate;
}
