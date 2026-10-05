// Ver el pozo antes de levantarlo (issue #10): las cartas que te llevarías, con tu par ya enseñado a todos.
// Desde aquí levantas con ese par o robas del mazo.
import { needsMinimum, pileTake, rankName, rankOf, isRed3, isWild, cardName } from "../../engine/index.js";
import { actions, state } from "../../app/index.js";
import { $, esc } from "../dom.js";
import { closeOverlay, renderSheet } from "./sheet.js";
import { cardSVG } from "../svg/card.js";

const pairName = (p) => (isRed3(p[0]) ? "3 rojos" : isWild(p[0]) ? "comodines" : rankName(rankOf(p[0])));

export function renderPeek(st, seat) {
  const h = st.hand, pk = h && h.peek;
  // Solo mientras sigue siendo tu turno de robar con ese par
  if (!(st.status === "playing" && pk && pk.seat === seat && pk.turns === h.turns && h.turn === seat && h.phase === "draw")) {
    actions.setView({ sheet: null }, false); $("#modal").innerHTML = ""; return;
  }
  const cards = pileTake(h), top = cards[cards.length - 1], rest = cards.slice(0, -1);
  const needMin = needsMinimum(st, seat);
  renderSheet($("#modal"), "peek", "El pozo", `
    <p class="hint">Enseñaste tu par de ${esc(pairName(pk.pair))}: todos lo vieron. Si levantas, te llevas ${cards.length === 1 ? "esta carta" : `estas ${cards.length} cartas`}.</p>
    <div class="peek-cards">
      <div class="peek-top"><span class="peek-lbl">Tope: va a la pata con tu par</span>
        <div class="peek-row">${pk.pair.map((c) => `<span class="peek-c mine" aria-label="${esc(cardName(c))}, tu par">${cardSVG(c, 46, 65)}</span>`).join("")}<span class="peek-c" aria-label="${esc(cardName(top))}">${cardSVG(top, 46, 65)}</span></div></div>
      ${rest.length ? `<div><span class="peek-lbl">A tu mano</span><div class="peek-row">${rest.map((c) => `<span class="peek-c" aria-label="${esc(cardName(c))}">${cardSVG(c, 46, 65)}</span>`).join("")}</div></div>` : ""}
    </div>
    ${needMin ? `<p class="hint">Tu equipo no se ha bajado: para levantar, primero aparta tu bajada (sin el par) y luego toca Levantar.</p>` : ""}
    <div class="peek-acts">
      <button id="peekdraw">Robar 2 del mazo</button>
      <button class="primary" id="peektake">Levantar</button>
    </div>`);
  $("#peektake").onclick = () => { closeOverlay(); actions.doPickup(seat); };
  $("#peekdraw").onclick = () => { closeOverlay(); actions.doDraw(seat); };
}
