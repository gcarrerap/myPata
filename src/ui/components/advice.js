// Consejo: qué haría cada nivel de la compu en tu lugar, paso a paso, y por qué.
import { LEVELS } from "../../ai/index.js";
import { actions, state, timerOn, turnKey } from "../../app/index.js";
import { renderTracker } from "./tracker.js";
import { $, esc } from "../dom.js";
import { closeOverlay, renderSheet } from "./sheet.js";

export function renderAdvice(st, seat) {
  const m = $("#modal"), adv = state.view.advice;
  if (!adv || turnKey(st) !== adv.key) { actions.setView({ advice: null }, false); m.innerHTML = ""; return renderTracker(st, seat); }
  const d = adv.data;
  let body;
  if (!d) body = `<p class="hint">Pensando…</p>`;
  else if (d.error) body = `<p class="err">No se pudo calcular el consejo. Intenta otra vez.</p>`;
  else {
    const sig = (l) => JSON.stringify(l.steps.map((s) => s.action));
    const same = d.levels.every((l) => sig(l) === sig(d.levels[0]));
    body = (same ? `<p class="adv-agree">Los tres niveles coinciden.</p>` : "") +
      (same ? d.levels.slice(0, 1) : d.levels).map((l) => `<section class="adv-card">
        <div class="adv-head"><span class="lvtag adv-lv">${same ? "Los tres" : LEVELS[l.level]}</span></div>
        <ol>${l.steps.map((s) => `<li><b>${esc(s.text)}.</b> ${esc(s.why)}</li>`).join("")}</ol>
        ${l.steps[0] && l.steps[0].action ? `<button class="primary adv-play" data-advplay="${l.level}">${esc(l.steps[0].text)}</button>` : ""}
      </section>`).join("");
    if (d.phase === "draw") body += `<p class="hint">Después de robar, pide consejo otra vez para saber qué bajar y qué descartar.</p>`;
  }
  renderSheet(m, "advice", "Consejo", `
    <p class="hint">Cada nivel solo usa lo que tú puedes saber: tus cartas, la mesa, el pozo y lo que los demás levantaron.${timerOn(st) ? " El reloj sigue corriendo." : ""}</p>
    ${body}`);
  m.querySelectorAll("[data-advplay]").forEach((b) => b.onclick = () => {
    const l = d.levels.find((x) => x.level === +b.dataset.advplay);
    closeOverlay();
    actions.playAdvice(seat, l.steps[0].action);
  });
}
