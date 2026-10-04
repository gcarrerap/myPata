// Una pata en la mesa: el número grande, cuántas cartas lleva (de 7), cuántos comodines y si ya está cerrada.
import { isClosed, meldClass, isWild, rankName, RULES } from "../../engine/index.js";
import { esc } from "../dom.js";

export const CLASS_NAME = { clean: "limpia", dirty: "sucia", twos: "de 2", jokers: "de jokers", mixed: "de comodines", red3: "de 3 rojos" };

export function meldTitle(m) {
  if (m.kind === "wild") return "★";
  if (m.kind === "red3") return "3";
  return rankName(m.rank);
}

// tappable: si se puede tocar para agregar las cartas escogidas
export function meldChip(m, { tappable = false, hot = false } = {}) {
  const closed = isClosed(m), cls = meldClass(m), wilds = m.cards.filter(isWild).length, n = m.cards.length;
  const kind = m.kind === "natural" ? (closed ? cls : "open") : "special";
  const label = `Pata ${m.kind === "natural" ? "de " + rankName(m.rank) : CLASS_NAME[cls]}: ${n} carta${n === 1 ? "" : "s"}${wilds && m.kind === "natural" ? `, ${wilds} comodín${wilds === 1 ? "" : "es"}` : ""}${closed ? `, cerrada ${m.kind === "natural" ? CLASS_NAME[cls] : ""}` : `, faltan ${RULES.closeAt - n}`}`;
  const inner = `<span class="mt ${m.kind === "red3" ? "red" : ""}">${esc(meldTitle(m))}</span>
    <span class="mc">${closed ? n : `${n}<small>/7</small>`}</span>
    ${m.kind === "natural" && wilds ? `<span class="mw">★${wilds > 1 ? wilds : ""}</span>` : ""}
    ${closed && m.kind === "natural" ? `<span class="mk">${cls === "clean" ? "L" : "S"}</span>` : ""}`;
  return tappable
    ? `<button class="meld ${kind} ${hot ? "hot" : ""} ${closed ? "closed" : ""}" data-meld="${m.id}" aria-label="${esc(label)}. Agregar aquí">${inner}</button>`
    : `<span class="meld ${kind} ${closed ? "closed" : ""}" role="img" aria-label="${esc(label)}">${inner}</span>`;
}
