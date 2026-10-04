// Resultado de la ronda o de la partida: los puntos de cada equipo, desglosados.
import { RULES, nameOf } from "../../engine/index.js";
import { actions, state } from "../../app/index.js";
import { renderAdvice } from "./advice.js";
import { renderTracker } from "./tracker.js";
import { $, esc } from "../dom.js";
import { renderSheet } from "./sheet.js";
import { teamLabels, teamColor } from "../labels.js";
import { CLASS_NAME } from "../svg/meld.js";

const fmt = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v).toLocaleString("es-MX");

export function renderResult(st, seat) {
  const m = $("#modal");
  if (!(st.status === "roundover" || st.status === "gameover") || !st.result) {
    if (state.view.advice) return renderAdvice(st, seat);
    return renderTracker(st, seat);
  }
  actions.setView({ advice: null, track: null }, false); // se cierran solos
  const r = st.result, labels = teamLabels(st), P = RULES.points;
  const title = r.goer === null ? "Se acabaron las cartas" : `${nameOf(st, r.goer)} se fue`;
  const rows = r.rows.map((x, t) => {
    const lines = [
      [`Limpias ${x.cleanN}${x.clean > x.cleanN ? ` <span class="hint">(de ${x.clean}; las de más solo cuentan a quien se fue)</span>` : ""} × ${P.clean}`, x.cleanPts],
      [`Sucias ${x.dirtyN}${x.dirty > x.dirtyN ? ` <span class="hint">(de ${x.dirty})</span>` : ""} × ${P.dirty}`, x.dirtyPts],
      ...x.specials.map((s) => [`Pata ${CLASS_NAME[s.cls]} ${s.closed ? "completa" : "incompleta"}`, s.pts]),
      ...(x.out ? [["Se fue", x.out]] : []),
      ...(x.red3 ? [[`${x.red3} tres rojo${x.red3 === 1 ? "" : "s"} guardado${x.red3 === 1 ? "" : "s"}`, x.red3Pts]] : []),
    ];
    return `<section class="res-team">
      <div class="res-head"><span class="teamdot" style="background:${teamColor(t)}"></span><b>${esc(labels[t])}</b><span class="res-total ${x.total < 0 ? "neg" : ""}">${fmt(x.total)}</span></div>
      ${lines.map(([k, v]) => `<div class="resrow"><span>${k}</span><span class="${v < 0 ? "neg" : ""}">${v ? fmt(v) : "—"}</span></div>`).join("")}
    </section>`;
  }).join("");
  const totals = st.scores.map((s, t) => `<div class="resrow"><span><span class="teamdot" style="background:${teamColor(t)}"></span>${esc(labels[t])}</span><b>${s.toLocaleString("es-MX")}</b></div>`).join("");
  const over = st.status === "gameover";
  const champ = over ? (r.champions && r.champions.length > 1 ? "Empate" : `¡Ganó ${labels[r.champion]}!`) : "";
  renderSheet(m, "result-" + st.roundNo + "-" + st.status, over ? champ : `Ronda ${r.round}: ${title}`, `
    ${over ? `<p class="hint">${esc(title)}. Terminaron las ${RULES.rounds} rondas.</p>` : ""}
    <div class="res">${rows}</div>
    <h2>Marcador</h2><div class="res">${totals}</div>
    ${seat >= 0 ? (over ? `<button class="primary big-cta" id="again">Revancha</button>` : `<button class="primary big-cta" id="next">Ronda ${st.roundNo + 1}</button>`) : ""}
    <button class="ghost" id="exit">Salir a mesas</button>`, { closable: false });
  $("#next")?.addEventListener("click", () => actions.nextRound());
  $("#again")?.addEventListener("click", () => actions.rematch());
  $("#exit").onclick = actions.leave;
}
