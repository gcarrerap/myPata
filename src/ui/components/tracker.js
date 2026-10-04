// Registro de un jugador: cuántas cartas tiene, en qué montón va, lo que levantó del pozo y todavía tiene, y lo
// que ha descartado en esta ronda.
import { nameOf, RULES, sortCards } from "../../engine/index.js";
import { tracker } from "../../ai/index.js";
import { actions, canReveal, state } from "../../app/index.js";
import { $, esc } from "../dom.js";
import { closeOverlay, renderSheet } from "./sheet.js";
import { levelSeg } from "../labels.js";
import { cardChip } from "../svg/card.js";

export function renderTracker(st, seat) {
  const m = $("#modal"), t = state.view.track;
  if (t === null || t === undefined || !st.hand || t === seat) { m.innerHTML = ""; return; }
  const tr = tracker(st, seat, t), name = nameOf(st, t);
  const reveal = state.view.reveal && canReveal();
  const list = (cards) => cards.length ? sortCards(cards).map(cardChip).join(" ") : `<span class="hint">nada</span>`;
  renderSheet(m, "track-" + t, `Registro de ${name}`, `
    ${state.view.practice && st.seats[t] && st.seats[t].level ? `<div class="cpurow"><span class="cpuname">Nivel</span>${levelSeg("seat" + t, st.seats[t].level)}</div>` : ""}
    <p>Tiene <b>${tr.count}</b> carta${tr.count === 1 ? "" : "s"} y va en su montón <b>${tr.pileNo}</b> de ${RULES.piles}.
      ${tr.down ? "Su equipo ya se bajó." : "Su equipo todavía no se baja."}</p>
    <p class="trk-line"><b>Levantó del pozo y todavía tiene:</b> ${list(tr.known)}</p>
    <p class="trk-line"><b>Descartó en esta ronda:</b> ${tr.discarded.length ? tr.discarded.map(cardChip).join(" ") : `<span class="hint">nada</span>`}</p>
    ${reveal ? `<p class="reveal-note"><b>Su mano (modo revisión):</b> ${list(st.hand.hands[t])}</p>` : ""}
    <p class="hint">Solo se ve lo que cualquiera en la mesa pudo ver: las cartas que levantó del pozo y las que tiró.</p>
    <button class="primary" id="trkclose">Cerrar</button>`);
  $("#trkclose").onclick = closeOverlay;
  m.querySelectorAll("[data-lvl]").forEach((b) => b.onclick = () => {
    const [id, l] = b.dataset.lvl.split(":");
    actions.setSeatLevel(+id.replace("seat", ""), +l);
  });
}
