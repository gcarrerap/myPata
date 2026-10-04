// Dibujo de cartas en SVG: cara (número y palo), reverso y la versión mini para listas.
import { isJoker, rankOf, suitOf, rankName, SUIT_SYMBOL, isRed } from "../../engine/index.js";

const ink = (c) => (isRed(c) ? "var(--suit-red)" : "var(--suit-black)");

// Cara de una carta de w×h (por omisión 44×62)
export function cardSVG(c, w = 44, h = 62) {
  const r = Math.round(w * 0.14), col = ink(c);
  if (isJoker(c)) {
    return `<svg class="card" width="${w}" height="${h}" viewBox="0 0 44 62" aria-hidden="true">
      <rect x="0.75" y="0.75" width="42.5" height="60.5" rx="${r}" fill="var(--card-face)" stroke="var(--card-edge)" stroke-width="1.5"/>
      <text x="5" y="15" font-size="11" font-weight="800" fill="${col}" font-family="var(--body)">JK</text>
      <text x="22" y="44" text-anchor="middle" font-size="24" fill="${col}">★</text>
    </svg>`;
  }
  const label = rankName(rankOf(c)), sym = SUIT_SYMBOL[suitOf(c)];
  const small = label.length > 1 ? 11 : 13;
  return `<svg class="card" width="${w}" height="${h}" viewBox="0 0 44 62" aria-hidden="true">
    <rect x="0.75" y="0.75" width="42.5" height="60.5" rx="${r}" fill="var(--card-face)" stroke="var(--card-edge)" stroke-width="1.5"/>
    <text x="5" y="16" font-size="${small}" font-weight="800" fill="${col}" font-family="var(--body)">${label}</text>
    <text x="5" y="28" font-size="11" fill="${col}">${sym}</text>
    <text x="27" y="51" text-anchor="middle" font-size="22" fill="${col}">${sym}</text>
  </svg>`;
}

// Reverso (para el mazo y las cartas ajenas)
export function backSVG(w = 44, h = 62) {
  return `<svg class="card" width="${w}" height="${h}" viewBox="0 0 44 62" aria-hidden="true">
    <rect x="0.75" y="0.75" width="42.5" height="60.5" rx="6" fill="var(--card-back)" stroke="var(--card-edge)" stroke-width="1.5"/>
    <rect x="5" y="5" width="34" height="52" rx="4" fill="none" stroke="var(--card-back-line)" stroke-width="1.5"/>
    <path d="M22 16 L30 31 L22 46 L14 31 Z" fill="var(--card-back-line)" opacity=".8"/>
  </svg>`;
}

// Nombre de una carta en texto con su color (para listas y mensajes)
export function cardChip(c) {
  const label = isJoker(c) ? "JK" : rankName(rankOf(c)) + SUIT_SYMBOL[suitOf(c)];
  return `<span class="cchip ${isRed(c) ? "red" : ""}">${label}</span>`;
}
